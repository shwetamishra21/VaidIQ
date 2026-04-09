import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import axios from "axios";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import { buildSystemPrompt, isEmergency } from "./rag/contextBuilder.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const API = window.location.hostname === "localhost"
  ? "http://localhost:4000/api"
  : "/api";
// ─── Groq Client ──────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve frontend — open http://localhost:4000 in browser after npm start
app.use(express.static(path.join(__dirname, "../frontend")));

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err.message));

// ─── Schemas & Models ─────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  fullName:             { type: String, required: true },
  phone:                { type: String, required: true, unique: true },
  email:                { type: String, default: "" },
  password:             { type: String, required: true },
  city:                 { type: String, default: "" },
  age:                  { type: Number, default: null },
  bloodGroup:           { type: String, default: "" },
  heightCm:             { type: Number, default: null },
  weightKg:             { type: Number, default: null },
  allergies:            { type: String, default: "" },
  medicalHistory:       { type: String, default: "" },
  emergencyContactName: { type: String, default: "" },
  emergencyContactPhone:{ type: String, default: "" },
  remindersEnabled:     { type: Boolean, default: true },
}, { timestamps: true });
const User = mongoose.model("User", userSchema);

const healthLogSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bpSystolic:   { type: Number, default: null },
  bpDiastolic:  { type: Number, default: null },
  glucoseMgdl:  { type: Number, default: null },
  glucoseType:  { type: String, enum: ["fasting", "postmeal", "random"], default: null },
  weightKg:     { type: Number, default: null },
  temperatureF: { type: Number, default: null },
  spo2Percent:  { type: Number, default: null },
  notes:        { type: String, default: "" },
}, { timestamps: true });
const HealthLog = mongoose.model("HealthLog", healthLogSchema);

const medicationSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:         { type: String, required: true },
  dosage:       { type: String, required: true },
  frequency:    { type: String, required: true },
  times:        { type: String, required: true },
  instructions: { type: String, default: "" },
  startDate:    { type: String, default: "" },
  endDate:      { type: String, default: "" },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });
const Medication = mongoose.model("Medication", medicationSchema);

const medCheckSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  medicationId:  { type: mongoose.Schema.Types.ObjectId, ref: "Medication", required: true },
  scheduledTime: { type: String, required: true },
  status:        { type: String, enum: ["taken", "missed", "skipped"], default: "taken" },
  notes:         { type: String, default: "" },
}, { timestamps: true });
const MedCheck = mongoose.model("MedCheck", medCheckSchema);

const appointmentSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  doctorName:      { type: String, required: true },
  specialty:       { type: String, required: true },
  appointmentDate: { type: String, required: true },
  appointmentTime: { type: String, required: true },
  apptType:        { type: String, enum: ["inperson", "video"], default: "inperson" },
  status:          { type: String, enum: ["pending","confirmed","cancelled","completed"], default: "confirmed" },
  fee:             { type: Number, default: null },
  notes:           { type: String, default: "" },
}, { timestamps: true });
const Appointment = mongoose.model("Appointment", appointmentSchema);

const ambulanceSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bookingType:      { type: String, enum: ["emergency", "scheduled"], default: "emergency" },
  ambulanceType:    { type: String, enum: ["bls", "als", "transport"], default: "bls" },
  pickupAddress:    { type: String, required: true },
  dropAddress:      { type: String, required: true },
  contactPhone:     { type: String, required: true },
  patientCondition: { type: String, default: "" },
  status:           { type: String, enum: ["requested","dispatched","arrived","completed","cancelled"], default: "requested" },
  etaMinutes:       { type: Number, default: null },
}, { timestamps: true });
const Ambulance = mongoose.model("Ambulance", ambulanceSchema);

const recordSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  category:     { type: String, enum: ["lab","prescription","imaging","vaccination","other"], required: true },
  title:        { type: String, required: true },
  doctorName:   { type: String, default: "" },
  hospitalName: { type: String, default: "" },
  recordDate:   { type: String, default: "" },
  filePath:     { type: String, required: true },
  fileName:     { type: String, required: true },
  fileSizeKb:   { type: Number, default: null },
  notes:        { type: String, default: "" },
}, { timestamps: true });
const MedicalRecord = mongoose.model("MedicalRecord", recordSchema);

const chatSessionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  messages: { type: Array, default: [] },
}, { timestamps: true });
const ChatSession = mongoose.model("ChatSession", chatSessionSchema);

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const HOSPITALS = [
  { id: 1, name: "AIIMS New Delhi",            distKm: 2.3, type: "govt",    specialties: ["Emergency 24/7","Cardiology","Neurology","Oncology","Pediatrics"], rating: 4.6, beds: 2478, hasEmergency: true,  note: "Free OPD · India's premier public hospital",   address: "Ansari Nagar East, New Delhi", phone: "011-26588500" },
  { id: 2, name: "Safdarjung Hospital",         distKm: 3.1, type: "govt",    specialties: ["General Medicine","Orthopedics","Gynecology","Burns","Trauma"],    rating: 4.2, beds: 1531, hasEmergency: true,  note: "Free treatment · Major trauma centre",          address: "Ansari Nagar West, New Delhi", phone: "011-26730000" },
  { id: 3, name: "Ram Manohar Lohia Hospital",  distKm: 1.8, type: "govt",    specialties: ["General Medicine","ENT","Gynecology","Dermatology"],               rating: 4.0, beds: 1192, hasEmergency: false, note: "Free OPD · Central Government hospital",        address: "Baba Kharak Singh Marg, Delhi", phone: "011-23404321" },
  { id: 4, name: "Apollo Hospital Sarita Vihar",distKm: 4.5, type: "private", specialties: ["Multi-specialty","ICU","Cardiac Surgery","Transplant"],            rating: 4.8, beds: 710,  hasEmergency: true,  note: "Premium private care",                          address: "Sarita Vihar, New Delhi",       phone: "011-71791090" },
  { id: 5, name: "Max Super Speciality Saket",  distKm: 5.2, type: "private", specialties: ["Cardiology","Orthopedics","Neurology","Cancer Care"],              rating: 4.7, beds: 500,  hasEmergency: true,  note: "Top-rated private hospital",                    address: "Saket, New Delhi",              phone: "011-26515050" },
  { id: 6, name: "Fortis Hospital Vasant Kunj", distKm: 8.4, type: "private", specialties: ["Oncology","Transplant","Nephrology"],                             rating: 4.6, beds: 850,  hasEmergency: true,  note: "Speciality & super-speciality care",            address: "Qutab Institutional Area, Delhi",phone: "011-42776222" },
  { id: 7, name: "Dr. Arora General Clinic",    distKm: 0.9, type: "clinic",  specialties: ["General Practice","Fever","Cough & Cold"],                        rating: 4.5, beds: null, hasEmergency: false, note: "Walk-in available · No appointment needed",    address: "Connaught Place, New Delhi",    phone: "98765 43210" },
  { id: 8, name: "Moolchand Hospital",           distKm: 3.8, type: "private", specialties: ["Orthopedics","Spine Surgery","Sports Medicine"],                  rating: 4.4, beds: 320,  hasEmergency: false, note: "Specialist orthopaedic hospital",               address: "Lala Lajpat Rai Marg, Delhi",  phone: "011-42000000" },
];

const MEDICINES = [
  { id: 1,  name: "Paracetamol 500mg",    brand: "Crocin / Dolo",         salt: "Paracetamol IP 500mg",           priceInr: 15, tags: ["otc","generic"],     alts: [{ name:"Calpol 500",priceInr:12,savingsPct:20 },{ name:"Paracetamol (Jan Aushadhi)",priceInr:5,savingsPct:67 }] },
  { id: 2,  name: "Paracetamol 650mg",    brand: "Dolo 650",               salt: "Paracetamol IP 650mg",           priceInr: 30, tags: ["otc","generic","ja"], alts: [{ name:"Paracetamol 650 (Jan Aushadhi)",priceInr:10,savingsPct:67 }] },
  { id: 3,  name: "Metformin 500mg",      brand: "Glycomet / Glucophage",  salt: "Metformin HCl IP 500mg",         priceInr: 28, tags: ["rx","generic","ja"],  alts: [{ name:"Metformin (Jan Aushadhi)",priceInr:12,savingsPct:57 }] },
  { id: 4,  name: "Amoxicillin 500mg",    brand: "Mox / Amoxil",           salt: "Amoxicillin Trihydrate IP 500mg",priceInr: 65, tags: ["rx","generic","ja"],  alts: [{ name:"Amox-500 Generic",priceInr:40,savingsPct:38 },{ name:"Amoxicillin (Jan Aushadhi)",priceInr:25,savingsPct:62 }] },
  { id: 5,  name: "Atorvastatin 10mg",    brand: "Atorva / Lipitor",       salt: "Atorvastatin Calcium IP 10mg",   priceInr: 90, tags: ["rx","generic","ja"],  alts: [{ name:"Atorvastatin (Jan Aushadhi)",priceInr:35,savingsPct:61 }] },
  { id: 6,  name: "Omeprazole 20mg",      brand: "Omez / Prilosec",        salt: "Omeprazole IP 20mg",             priceInr: 42, tags: ["otc","generic"],     alts: [{ name:"Omeprazole Generic",priceInr:18,savingsPct:57 }] },
  { id: 7,  name: "Cetirizine 10mg",      brand: "Zyrtec / Alerid",        salt: "Cetirizine HCl IP 10mg",         priceInr: 22, tags: ["otc","generic","ja"], alts: [{ name:"Cetirizine (Jan Aushadhi)",priceInr:7,savingsPct:68 }] },
  { id: 8,  name: "Azithromycin 500mg",   brand: "Azithral / Zithromax",   salt: "Azithromycin IP 500mg",          priceInr: 85, tags: ["rx","generic"],      alts: [{ name:"Azithromycin Generic",priceInr:45,savingsPct:47 }] },
  { id: 9,  name: "Ibuprofen 400mg",      brand: "Brufen / Advil",         salt: "Ibuprofen IP 400mg",             priceInr: 18, tags: ["otc","generic"],     alts: [{ name:"Ibuprofen Generic",priceInr:10,savingsPct:44 }] },
  { id: 10, name: "Amlodipine 5mg",       brand: "Amlodac / Norvasc",      salt: "Amlodipine Besylate IP 5mg",     priceInr: 55, tags: ["rx","generic","ja"],  alts: [{ name:"Amlodipine (Jan Aushadhi)",priceInr:20,savingsPct:64 }] },
  { id: 11, name: "Pantoprazole 40mg",    brand: "Pan 40 / Pantocid",      salt: "Pantoprazole Sodium IP 40mg",    priceInr: 38, tags: ["rx","generic","ja"],  alts: [{ name:"Pantoprazole (Jan Aushadhi)",priceInr:14,savingsPct:63 }] },
  { id: 12, name: "Levocetirizine 5mg",   brand: "Xyzal / Levocet",        salt: "Levocetirizine HCl IP 5mg",      priceInr: 26, tags: ["otc","generic","ja"], alts: [{ name:"Levocetirizine (Jan Aushadhi)",priceInr:8,savingsPct:69 }] },
  { id: 13, name: "Metronidazole 400mg",  brand: "Flagyl / Metrogyl",      salt: "Metronidazole IP 400mg",         priceInr: 25, tags: ["rx","generic","ja"],  alts: [{ name:"Metronidazole (Jan Aushadhi)",priceInr:9,savingsPct:64 }] },
  { id: 14, name: "Vitamin D3 60K IU",    brand: "Calcirol / D-Rise",      salt: "Cholecalciferol 60000 IU",       priceInr: 48, tags: ["rx","generic"],      alts: [{ name:"Vitamin D3 60K Generic",priceInr:22,savingsPct:54 }] },
  { id: 15, name: "Losartan 50mg",        brand: "Losar / Cozaar",         salt: "Losartan Potassium IP 50mg",     priceInr: 70, tags: ["rx","generic","ja"],  alts: [{ name:"Losartan (Jan Aushadhi)",priceInr:28,savingsPct:60 }] },
];



// ─── File Upload Config ───────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = `uploads/${req.userId}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("File type not allowed. Use PDF, JPG, or PNG."));
  },
});

// ═══════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date() }));

// ── AUTH ──────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, phone, password, email, city } = req.body;
    if (!fullName || !phone || !password)
      return res.status(400).json({ error: "fullName, phone and password are required." });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    const exists = await User.findOne({ phone });
    if (exists) return res.status(409).json({ error: "Phone number already registered." });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ fullName, phone, password: hashed, email: email || "", city: city || "" });
    res.status(201).json({ token: signToken(user._id), userId: user._id, fullName: user.fullName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ error: "Incorrect phone number or password." });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Incorrect phone number or password." });
    res.json({ token: signToken(user._id), userId: user._id, fullName: user.fullName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── USER PROFILE ──────────────────────────────────────────────────

app.get("/api/users/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/users/me", auth, async (req, res) => {
  try {
    const allowed = ["fullName","email","city","age","bloodGroup","heightCm","weightKg",
                     "allergies","medicalHistory","emergencyContactName","emergencyContactPhone","remindersEnabled"];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH LOG ────────────────────────────────────────────────────

app.post("/api/health-log", auth, async (req, res) => {
  try {
    const { bpSystolic, bpDiastolic, glucoseMgdl, glucoseType, weightKg, temperatureF, spo2Percent, notes } = req.body;
    const hasAny = [bpSystolic, glucoseMgdl, weightKg, temperatureF, spo2Percent].some(v => v != null);
    if (!hasAny) return res.status(400).json({ error: "Provide at least one reading." });
    if ((bpSystolic == null) !== (bpDiastolic == null))
      return res.status(400).json({ error: "Both systolic and diastolic values are needed together." });
    const log = await HealthLog.create({ userId: req.userId, bpSystolic, bpDiastolic, glucoseMgdl, glucoseType, weightKg, temperatureF, spo2Percent, notes });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health-log", auth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const logs = await HealthLog.find({ userId: req.userId }).sort({ createdAt: -1 }).skip(offset).limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/health-log/:id", auth, async (req, res) => {
  try {
    const log = await HealthLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!log) return res.status(404).json({ error: "Log not found." });
    res.json({ message: "Deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/health-log", auth, async (req, res) => {
  try {
    await HealthLog.deleteMany({ userId: req.userId });
    res.json({ message: "All logs cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MEDICATIONS ───────────────────────────────────────────────────

app.post("/api/medications", auth, async (req, res) => {
  try {
    const { name, dosage, frequency, times, instructions, startDate, endDate } = req.body;
    if (!name || !dosage || !frequency || !times)
      return res.status(400).json({ error: "name, dosage, frequency, and times are required." });
    const med = await Medication.create({ userId: req.userId, name, dosage, frequency, times, instructions, startDate, endDate });
    res.status(201).json(med);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/medications", auth, async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.activeOnly !== "false") filter.isActive = true;
    const meds = await Medication.find(filter).sort({ createdAt: -1 });
    res.json(meds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/medications/:id", auth, async (req, res) => {
  try {
    const allowed = ["name","dosage","frequency","times","instructions","endDate","isActive"];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const med = await Medication.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true });
    if (!med) return res.status(404).json({ error: "Medication not found." });
    res.json(med);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/medications/:id", auth, async (req, res) => {
  try {
    const med = await Medication.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!med) return res.status(404).json({ error: "Medication not found." });
    res.json({ message: "Medication removed." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/medications/checks", auth, async (req, res) => {
  try {
    const { medicationId, scheduledTime, status, notes } = req.body;
    const med = await Medication.findOne({ _id: medicationId, userId: req.userId });
    if (!med) return res.status(404).json({ error: "Medication not found." });
    const check = await MedCheck.create({ userId: req.userId, medicationId, scheduledTime, status: status || "taken", notes });
    res.status(201).json(check);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/medications/adherence", auth, async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const all   = await MedCheck.find({ userId: req.userId, createdAt: { $gte: since } });
    const taken = all.filter(c => c.status === "taken").length;
    const pct   = all.length ? Math.round((taken / all.length) * 100) : 0;
    res.json({ days, totalDoses: all.length, taken, adherencePct: pct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── APPOINTMENTS ──────────────────────────────────────────────────

app.post("/api/appointments", auth, async (req, res) => {
  try {
    const { doctorName, specialty, appointmentDate, appointmentTime, apptType, fee, notes } = req.body;
    if (!doctorName || !specialty || !appointmentDate || !appointmentTime)
      return res.status(400).json({ error: "doctorName, specialty, appointmentDate, appointmentTime are required." });
    const appt = await Appointment.create({ userId: req.userId, doctorName, specialty, appointmentDate, appointmentTime, apptType, fee, notes });
    res.status(201).json(appt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/appointments", auth, async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.upcomingOnly === "true") {
      filter.appointmentDate = { $gte: new Date().toISOString().slice(0, 10) };
      filter.status = { $in: ["confirmed","pending"] };
    }
    const appts = await Appointment.find(filter).sort({ appointmentDate: 1 });
    res.json(appts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/appointments/:id", auth, async (req, res) => {
  try {
    const allowed = ["status","appointmentDate","appointmentTime","notes"];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const appt = await Appointment.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true });
    if (!appt) return res.status(404).json({ error: "Appointment not found." });
    res.json(appt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/appointments/:id", auth, async (req, res) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { status: "cancelled" },
      { new: true }
    );
    if (!appt) return res.status(404).json({ error: "Appointment not found." });
    res.json({ message: "Appointment cancelled.", appt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AMBULANCE ─────────────────────────────────────────────────────

app.post("/api/ambulance", auth, async (req, res) => {
  try {
    const { bookingType, ambulanceType, pickupAddress, dropAddress, contactPhone, patientCondition } = req.body;
    if (!pickupAddress || !dropAddress || !contactPhone)
      return res.status(400).json({ error: "pickupAddress, dropAddress, and contactPhone are required." });
    const eta = bookingType === "emergency"
      ? Math.floor(Math.random() * 8) + 8
      : Math.floor(Math.random() * 30) + 30;
    const booking = await Ambulance.create({ userId: req.userId, bookingType, ambulanceType, pickupAddress, dropAddress, contactPhone, patientCondition, etaMinutes: eta });
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/ambulance", auth, async (req, res) => {
  try {
    const bookings = await Ambulance.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(20);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MEDICAL RECORDS ───────────────────────────────────────────────

app.post("/api/records/upload", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const { category, title, doctorName, hospitalName, recordDate, notes } = req.body;
    if (!category || !title) return res.status(400).json({ error: "category and title are required." });
    const record = await MedicalRecord.create({
      userId: req.userId, category, title,
      doctorName: doctorName || "", hospitalName: hospitalName || "",
      recordDate: recordDate || "", filePath: req.file.path,
      fileName: req.file.originalname, fileSizeKb: Math.round(req.file.size / 1024),
      notes: notes || "",
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/records", auth, async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.category) filter.category = req.query.category;
    const records = await MedicalRecord.find(filter).sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/records/:id/download", auth, async (req, res) => {
  try {
    const record = await MedicalRecord.findOne({ _id: req.params.id, userId: req.userId });
    if (!record) return res.status(404).json({ error: "Record not found." });
    if (!fs.existsSync(record.filePath)) return res.status(404).json({ error: "File not found on server." });
    res.download(record.filePath, record.fileName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/records/:id", auth, async (req, res) => {
  try {
    const record = await MedicalRecord.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!record) return res.status(404).json({ error: "Record not found." });
    if (fs.existsSync(record.filePath)) fs.unlinkSync(record.filePath);
    res.json({ message: "Record deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI CHAT ───────────────────────────────────────────────────────

app.post("/api/chat", auth, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: "message is required." });

    // ── 1. Load or create chat session ──────────────────────────────────────
    let session;
    if (sessionId) {
      session = await ChatSession.findOne({ _id: sessionId, userId: req.userId });
    }
    if (!session) {
      session = new ChatSession({ userId: req.userId, messages: [] });
    }

    // ── 2. Fetch user context for personalization ────────────────────────────
    // All done in parallel — no sequential DB waterfall
    const [user, recentLogs, activeMeds] = await Promise.all([
      User.findById(req.userId).select("-password"),
      HealthLog.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(3),
      Medication.find({ userId: req.userId, isActive: true }).limit(10),
    ]);

    // ── 3. Build RAG-enhanced system prompt ──────────────────────────────────
    // This is the core upgrade: RAG retrieval + user profile merged together
    const { systemPrompt, sources, isEmergencyMsg, doctor, riskProfile } = buildSystemPrompt({
      message,
      user,
      recentLogs,
      activeMeds,
    });

    // ── 4. Maintain rolling context window (last 40 messages) ───────────────
    session.messages.push({ role: "user", content: message });
    if (session.messages.length > 40) {
      session.messages = session.messages.slice(-40);
    }

    // ── 5. Call Groq LLM ─────────────────────────────────────────────────────
    const aiResponse = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",   // updated model
      messages: [
        { role: "system", content: systemPrompt },
        ...session.messages,
      ],
      temperature: isEmergencyMsg ? 0.3 : 0.7,   // lower temp for emergencies
      max_tokens: 800,
    });

    const reply = aiResponse.choices[0].message.content;

    // ── 6. Save session ──────────────────────────────────────────────────────
    session.messages.push({ role: "assistant", content: reply });
    await session.save();

    // ── 7. Respond ───────────────────────────────────────────────────────────
    res.json({
  reply,
  sessionId: session._id,
  isEmergency: isEmergencyMsg || reply.startsWith("🚨"),
  doctor,
  riskProfile,
  sources: process.env.NODE_ENV === "development" ? sources : undefined
});

  } catch (err) {
    console.error("Chat error:", err.message);

    const status = err.status || err.response?.status;

    // ── Graceful fallbacks ───────────────────────────────────────────────────
    if (status === 401) {
      return res.status(502).json({
        error: "Invalid Groq API key.",
        reply: "AI service unavailable. For medical emergencies, please call 112 immediately.",
        isEmergency: false,
      });
    }
    if (status === 429) {
      return res.status(502).json({
        error: "Rate limit reached.",
        reply: "Too many requests. Please wait a moment. For emergencies, call 112.",
        isEmergency: false,
      });
    }

    res.status(502).json({
      error: "AI service unavailable.",
      reply: "I'm having trouble connecting. For medical emergencies, call 112 immediately.",
      isEmergency: false,
    });
  }
});


app.get("/api/chat/sessions", auth, async (req, res) => {
  try {
    const sessions = await ChatSession.find({ userId: req.userId })
      .sort({ updatedAt: -1 }).limit(20)
      .select("_id createdAt updatedAt messages");
    res.json(sessions.map(s => ({
      id: s._id,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/chat/sessions/:id", auth, async (req, res) => {
  try {
    await ChatSession.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ message: "Session deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STATIC CATALOG ────────────────────────────────────────────────

app.get("/api/hospitals", (req, res) => {
  let results = HOSPITALS;
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    results = results.filter(h =>
      h.name.toLowerCase().includes(q) ||
      h.specialties.some(s => s.toLowerCase().includes(q))
    );
  }
  if (req.query.type) results = results.filter(h => h.type === req.query.type);
  if (req.query.emergency === "true") results = results.filter(h => h.hasEmergency);
  res.json({ total: results.length, hospitals: results });
});

app.get("/api/hospitals/:id", (req, res) => {
  const h = HOSPITALS.find(h => h.id === parseInt(req.params.id));
  if (!h) return res.status(404).json({ error: "Hospital not found." });
  res.json(h);
});

app.get("/api/medicines", (req, res) => {
  let results = MEDICINES;
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    results = results.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.brand.toLowerCase().includes(q) ||
      m.salt.toLowerCase().includes(q)
    );
  }
  if (req.query.tag) results = results.filter(m => m.tags.includes(req.query.tag));
  res.json({ total: results.length, medicines: results });
});

app.get("/api/medicines/:id", (req, res) => {
  const m = MEDICINES.find(m => m.id === parseInt(req.params.id));
  if (!m) return res.status(404).json({ error: "Medicine not found." });
  res.json(m);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large. Max 10 MB." });
  res.status(500).json({ error: err.message || "Internal server error." });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 VaidIQ backend running on http://localhost:${PORT}`);
  console.log(`🌐 Open the app at: http://localhost:${PORT}`);
});
