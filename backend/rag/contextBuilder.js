/**
 * VaidIQ Context Builder
 * Merges RAG knowledge retrieval + personalized user health data
 * into a rich, structured system prompt context block.
 */

import { retrieveContext, retrieveWithSources } from "./ragEngine.js";

// ─── Emergency override keywords ──────────────────────────────────────────
const EMERGENCY_PATTERNS = [
  "chest pain", "chest pressure", "heart attack", "can't breathe",
  "cannot breathe", "difficulty breathing", "shortness of breath",
  "unconscious", "not breathing", "stroke", "severe bleeding",
  "loss of consciousness", "fainted", "overdose", "poisoning",
  "anaphylaxis", "seizure", "convulsion", "paralysis", "worst headache"
];

export function isEmergency(text) {
  const lower = text.toLowerCase();
  return EMERGENCY_PATTERNS.some(p => lower.includes(p));
}

// ─── User context block ────────────────────────────────────────────────────

/**
 * Build personalized context from user's MongoDB profile + recent logs.
 * @param {Object} user - User document from DB
 * @param {Array}  recentLogs - last 3-5 HealthLog documents
 * @param {Array}  activeMeds - active Medication documents
 * @returns {string}
 */
export function buildUserContext(user, recentLogs = [], activeMeds = []) {
  const lines = ["── PATIENT PROFILE ──"];

  lines.push(`Name: ${user.fullName}`);
  if (user.age)        lines.push(`Age: ${user.age} years`);
  if (user.bloodGroup) lines.push(`Blood group: ${user.bloodGroup}`);
  if (user.heightCm && user.weightKg) {
    const bmi = (user.weightKg / ((user.heightCm / 100) ** 2)).toFixed(1);
    lines.push(`Height: ${user.heightCm}cm, Weight: ${user.weightKg}kg, BMI: ${bmi}`);
  }
  if (user.allergies)      lines.push(`⚠️ ALLERGIES: ${user.allergies}`);
  if (user.medicalHistory) lines.push(`Medical history: ${user.medicalHistory}`);

  if (activeMeds.length) {
    lines.push(`Active medications: ${activeMeds.map(m => `${m.name} ${m.dosage} (${m.frequency})`).join(", ")}`);
  }

  if (recentLogs.length) {
    lines.push("── RECENT HEALTH READINGS ──");
    for (const log of recentLogs) {
      const date = new Date(log.createdAt).toLocaleDateString("en-IN");
      const readings = [];
      if (log.bpSystolic)   readings.push(`BP ${log.bpSystolic}/${log.bpDiastolic} mmHg`);
      if (log.glucoseMgdl)  readings.push(`Glucose ${log.glucoseMgdl} mg/dL (${log.glucoseType || "random"})`);
      if (log.weightKg)     readings.push(`Weight ${log.weightKg} kg`);
      if (log.temperatureF) readings.push(`Temp ${log.temperatureF}°F`);
      if (log.spo2Percent)  readings.push(`SpO2 ${log.spo2Percent}%`);
      if (readings.length)  lines.push(`${date}: ${readings.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ─── RAG context block ─────────────────────────────────────────────────────

/**
 * Retrieve relevant medical knowledge and format it for the prompt.
 * Skips retrieval for emergency messages (faster response).
 * @param {string} message
 * @returns {{ context: string, sources: Array }}
 */
export function buildRagContext(message) {
  // Emergency: force inject emergency chunk + skip slow retrieval
  if (isEmergency(message)) {
    return {
      context: "[1] EMERGENCY SITUATION DETECTED. Begin response with 🚨 EMERGENCY and instruct user to call 112 immediately.",
      sources: [{ id: "emergency_override", score: 1.0 }]
    };
  }

  const sources = retrieveWithSources(message, 4);
  if (!sources.length) return { context: "", sources: [] };

  const context = sources
    .map((s, i) => `[${i + 1}] ${s.text}`)
    .join("\n\n");

  return { context, sources };
}

// ─── Full system prompt assembler ─────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are VaidIQ — an AI Health Assistant for India.

YOUR ROLE:
- Help users understand symptoms and what kind of care they might need
- Be empathetic, warm, and use simple language accessible to all Indians
- Suggest appropriate self-care, doctor visit, or emergency action
- Mention Jan Aushadhi and generic medicines when cost is a concern
- Reference 112/108 for emergencies, government hospitals for free care
- You can respond in Hindi if the user writes in Hindi

STRICT RULES — NEVER VIOLATE:
1. NEVER diagnose. Say "this could be..." or "these symptoms are sometimes associated with..."
2. NEVER prescribe medication or specify doses
3. For chest pain, difficulty breathing, severe bleeding — begin IMMEDIATELY with "🚨 EMERGENCY: Please call 112 immediately."
4. Keep responses to 2–4 short paragraphs. No walls of text.
5. End EVERY response with: "⚠️ This is general guidance — please consult a licensed doctor."
6. If citing context, say "Based on general medical guidelines..." — never mention "RAG" or "vector store"
7. If user seems in mental health crisis, mention iCall: 9152987821
8. If unsure about something, say "I'm not certain about this — please consult a doctor" instead of guessing.`;

/**
 * Assemble the complete system prompt with all context injected.
 *
 * @param {Object} opts
 * @param {string} opts.message        - current user message
 * @param {Object} opts.user           - User document (optional)
 * @param {Array}  opts.recentLogs     - HealthLog docs (optional)
 * @param {Array}  opts.activeMeds     - Medication docs (optional)
 * @returns {{ systemPrompt: string, sources: Array, isEmergencyMsg: boolean }}
 */
export function buildSystemPrompt({ message, user, recentLogs = [], activeMeds = [] }) {
  const emergency = isEmergency(message);
  const { context: ragContext, sources } = buildRagContext(message);
  const riskProfile = buildRiskProfile(user, recentLogs, activeMeds);
  const doctor = recommendDoctor(message);

  let systemPrompt = BASE_SYSTEM_PROMPT;
  const riskSection = riskProfile.length
  ? `\n\n── RISK PROFILE ──\n- ${riskProfile.join("\n- ")}`
  : "";

const doctorSection = `\n\n── RECOMMENDED SPECIALIST ──\n${doctor}`;

  // Inject personalized user context if available
 if (user) {
  const userCtx = buildUserContext(user, recentLogs, activeMeds);
  systemPrompt += `\n\n${userCtx}${riskSection}`;
}

  // Inject RAG medical knowledge (capped at 1500 chars to stay within token budget)
  if (ragContext) {
    const limitedContext = ragContext.slice(0, 1500);
  systemPrompt += `\n\n── RELEVANT MEDICAL KNOWLEDGE ──\n${limitedContext}${doctorSection}`;
  } else {
    systemPrompt += "\n\nNo specific medical context found. Use your general medical knowledge carefully and conservatively.";
  }

return {
  systemPrompt,
  sources,
  isEmergencyMsg: emergency,
  doctor,
  riskProfile
};
}
function buildRiskProfile(user, logs, meds) {
  let risk = [];

  const latestBP = logs.find(l => l.type === "bp");
  const latestGlucose = logs.find(l => l.type === "glucose");

  if (latestBP && latestBP.value > 140) {
    risk.push("Hypertension risk");
  }

  if (latestGlucose && latestGlucose.value > 180) {
    risk.push("Diabetes risk");
  }

  if (meds?.length > 0) {
    risk.push("On active medication");
  }

  if (!user) return [];

  if (user.age > 50) {
    risk.push("Age-related risk");
  }

  return risk;
}

function recommendDoctor(message) {
  const msg = message.toLowerCase();

  if (msg.includes("chest") || msg.includes("heart")) return "Cardiologist";
  if (msg.includes("skin") || msg.includes("rash")) return "Dermatologist";
  if (msg.includes("stomach") || msg.includes("digestion")) return "Gastroenterologist";
  if (msg.includes("mental") || msg.includes("anxiety")) return "Psychiatrist";

  return "General Physician";
}