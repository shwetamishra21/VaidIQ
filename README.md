# VaidIQ — AI-Powered Health Companion

> **Your intelligent health companion, built for India.**

VaidIQ is a full-stack, AI-augmented health management application tailored for Indian users. It combines a Retrieval-Augmented Generation (RAG) medical knowledge engine, a Groq-powered LLM chat  interface and a complete personal health management suite — all in a single, offline-capable web app that runs on `localhost:4000`.

The name  *Vaid* (वैद्य) means a traditional healer or physician in Hindi and Sanskrit. VaidIQ aims to bring that accessible, trusted guidance into the modern era, with AI at  its core.

---
## Why VaidIQ?

Healthcare in India faces a stark accessibility gap. Millions of people in tier-2 and tier-3 cities have limited access to specialists, affordable medicines, and organised health records. VaidIQ is designed to bridge that gap by providing:

- Plain-language symptom guidance in Hindi or English
- Affordable generic and Jan Aushadhi medicine alternatives
- A personal health log that travels with the user
- Emergency escalation pathways (112 / 108) always one tap away
- A zero-cost document vault for prescriptions and lab reports

VaidIQ is **not** a diagnostic tool. Every response ends with a disclaimer encouraging users to consult a licensed doctor. The design philosophy is *guidance first, not diagnosis*.

---

## Core Use Cases

### 1. AI Symptom Checker
Users describe symptoms in free-form text — in Hindi or English — and receive contextualised guidance. The AI assistant classifies severity, recommends whether self-care, a doctor visit, or emergency care is appropriate, and suggests the right specialist. For known emergency patterns (chest pain, difficulty breathing, stroke signs), it immediately surfaces a 🚨 call-to-action with the number 112.

### 2. Personalised Health Advice via RAG
Every AI response is enriched with relevant chunks from a curated medical knowledge base stored as local JSON files. TF-IDF vectors and cosine similarity are used to retrieve the most relevant context at query time — no external embedding service required. The user's own profile (age, blood group, allergies, medications, recent readings) is also injected into the system prompt, making every answer personally contextualised.

### 3. Health Log & Vitals Tracking
Users can log blood pressure, blood glucose (fasting / post-meal / random),  body weight, temperature, and SpO₂. Entries are timestamped and displayed alongside a normal-range reference card. The log feeds back into the AI context so the assistant is aware of recent trends.

### 4. Medication Manager
A full CRUD medication tracker with:
- A daily schedule broken into Morning / Afternoon / Evening / Night slots
- One-tap "Mark as Taken" that persists to the backend and feeds a 7-day adherence tracker
- A searchable medicine catalogue of 15 common Indian generics with brand aliases, compositions, and Jan Aushadhi alternatives with percentage savings shown

### 5. Appointment Manager
Users can book, edit, and cancel doctor appointments with details such as specialty, date, time, consultation type (in-person / video), fee, and notes. Appointments are filterable by status and displayed in a calendar-style card layout.

### 6. Medical Records Vault
Secure upload of PDF, JPG, and PNG documents (up to 10 MB) categorised into Lab Reports, Prescriptions, X-Ray / MRI, and Vaccinations. Files are stored server-side under a per-user directory and can be downloaded at any time.

### 7. Emergency Hub
A dedicated emergency view includes India-wide helpline numbers (112, 108, 100, 1091, iCall), the FAST stroke identification guide, and a filterable Hospital Finder powered by a static dataset of government and private hospitals with distance, rating, specialties, and emergency availability.

### 8. Ambulance Booking (Phase 1 — Direct Call)
The current phase surfaces the fastest option (call 108 / 112 directly) with a pre-fill form reserved for Phase 2 in-app booking with live ETA tracking.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Web Framework | Express.js |
| Database | MongoDB via Mongoose |
| AI / LLM | Groq SDK (`llama-3.1-8b-instant`) |
| RAG Engine | Custom TF-IDF + Cosine Similarity (pure JS) |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| File Uploads | Multer (disk storage) |
| Frontend | Vanilla HTML / CSS / JS (single-file SPA) |
| Fonts | Google Fonts — Instrument Serif + DM Sans |

---

## Project Structure

```
vaidiq/
│
├── backend/
│   ├── server.js                  # Main Express app — all routes, models, middleware
│   │
│   ├── rag/
│   │   ├── ragEngine.js           # TF-IDF vector store, cosine retrieval
│   │   ├── contextBuilder.js      # System prompt assembler (RAG + user profile)
│   │   └── test_rag.js            # Manual RAG test script
│   │
│   ├── knowledge/                 # Medical knowledge base (JSON chunks)
│   │   └── *.json                 # Topic files: symptoms, conditions, medications…
│   │
│   ├── uploads/                   # Per-user uploaded medical documents
│   │   └── <userId>/              # Isolated per user
│   │
│   └── package.json
│
└── frontend/
    └── index.html                 # Complete single-page application (SPA)
```

---

## Architecture

### Request Lifecycle — AI Chat

```
User Message (browser)
        │
        ▼
POST /api/chat  [JWT-authenticated]
        │
        ├─ 1. Load / create ChatSession from MongoDB
        │
        ├─ 2. Parallel DB fetch:
        │       ├─ User profile (allergies, age, blood group, BMI)
        │       ├─ Recent health logs (last 3 readings)
        │       └─ Active medications (up to 10)
        │
        ├─ 3. buildSystemPrompt()
        │       ├─ isEmergency() — keyword scan (chest pain, stroke, etc.)
        │       ├─ buildRagContext() — TF-IDF retrieval from knowledge/*.json
        │       ├─ buildUserContext() — patient profile block
        │       ├─ buildRiskProfile() — hypertension / diabetes / age flags
        │       └─ recommendDoctor() — specialist mapping by keyword
        │
        ├─ 4. Groq LLM call (llama-3.1-8b-instant)
        │       └─ Rolling 40-message context window
        │
        ├─ 5. Save updated ChatSession to MongoDB
        │
        └─ 6. Return { reply, sessionId, isEmergency, doctor, riskProfile }
```

### RAG Engine — How Knowledge Retrieval Works

The RAG engine (`ragEngine.js`) is a fully self-contained, in-process vector store with no external dependencies:

1. **Build phase** (runs once on startup): All JSON files in `backend/knowledge/` are loaded, tokenised, and converted into TF-IDF vectors. Stopwords are removed. IDF weights are computed across the corpus.

2. **Query phase** (each chat turn): The user message is tokenised and vectorised using the same vocabulary. Cosine similarity is computed against every stored chunk. A tag-based bonus (+0.2) is applied to chunks whose topic tags appear in the query. The top-4 chunks above a 0.05 threshold are returned.

3. **Injection**: Retrieved chunks are formatted and injected into the system prompt under a `── RELEVANT MEDICAL KNOWLEDGE ──` block (capped at 1500 characters to stay within token budget).

4. **Emergency shortcut**: If the message matches any of 20 emergency patterns, retrieval is skipped entirely and a hardcoded emergency instruction chunk is injected instead, minimising latency.

### Authentication Flow

```
Register / Login  →  bcrypt hash  →  JWT signed with JWT_SECRET
                                          │
All protected routes  ←  auth() middleware verifies Bearer token
                                          │
                              req.userId injected for DB queries
```

### Data Models (MongoDB)

| Model | Key Fields |
|---|---|
| `User` | fullName, phone, password (hashed), age, bloodGroup, heightCm, weightKg, allergies, medicalHistory, emergencyContact |
| `HealthLog` | userId, bpSystolic/Diastolic, glucoseMgdl, glucoseType, weightKg, temperatureF, spo2Percent |
| `Medication` | userId, name, dosage, frequency, times, instructions, isActive |
| `MedCheck` | userId, medicationId, scheduledTime, status (taken/missed/skipped) |
| `Appointment` | userId, doctorName, specialty, appointmentDate, appointmentTime, apptType, status, fee |
| `Ambulance` | userId, bookingType, ambulanceType, pickupAddress, dropAddress, etaMinutes, status |
| `MedicalRecord` | userId, category, title, filePath, fileName, fileSizeKb |
| `ChatSession` | userId, messages[] (rolling 40-message window) |

### Frontend Architecture

The entire frontend is a **single HTML file** (`frontend/index.html`) served statically by Express. It is a multi-view SPA with no build step or framework dependency — views are toggled via CSS `display` and a `showView()` router function. State is held in module-level JS variables. All API calls go through a single `api()` helper that attaches the JWT from `localStorage`.

The UI is built with a custom CSS design system using CSS custom properties (`--teal`, `--ink`, `--border`, etc.) and a two-column shell layout (sidebar + main). It is fully responsive down to 600px.

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with fullName, phone, password |
| POST | `/api/auth/login` | Login, returns JWT |

### Health Log
| Method | Path | Description |
|---|---|---|
| POST | `/api/health-log` | Add a reading |
| GET | `/api/health-log` | Fetch logs (paginated) |
| DELETE | `/api/health-log/:id` | Delete one entry |
| DELETE | `/api/health-log` | Clear all logs |

### Medications
| Method | Path | Description |
|---|---|---|
| POST | `/api/medications` | Add medication |
| GET | `/api/medications` | List active medications |
| PATCH | `/api/medications/:id` | Update |
| DELETE | `/api/medications/:id` | Remove |
| POST | `/api/medications/checks` | Log a dose check-in |
| GET | `/api/medications/adherence` | 7-day adherence stats |

### Appointments
| Method | Path | Description |
|---|---|---|
| POST | `/api/appointments` | Book appointment |
| GET | `/api/appointments` | List appointments |
| PATCH | `/api/appointments/:id` | Update |
| DELETE | `/api/appointments/:id` | Cancel |

### AI Chat
| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Send message, receive AI reply |
| GET | `/api/chat/sessions` | List past sessions |
| DELETE | `/api/chat/sessions/:id` | Delete session |

### Records
| Method | Path | Description |
|---|---|---|
| POST | `/api/records/upload` | Upload document (multipart) |
| GET | `/api/records` | List records |
| GET | `/api/records/:id/download` | Download file |
| DELETE | `/api/records/:id` | Delete record |

### Catalogues (public, no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/api/hospitals` | Hospital list (filterable) |
| GET | `/api/medicines` | Medicine catalogue (filterable) |

---

## Environment Variables

Create a `.env` file in `backend/`:

```env
MONGO_URI=mongodb://localhost:27017/vaidiq
JWT_SECRET=your_strong_secret_here
JWT_EXPIRES_IN=7d
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
NODE_ENV=development
```

---

## Getting Started

```bash
# 1. Install dependencies
cd backend && npm install

# 2. Create .env (see above)

# 3. Start the server
npm start
# or for development with auto-reload:
npm run dev

# 4. Open in browser
# http://localhost:4000
```

To test the RAG engine in isolation:
```bash
node backend/rag/test_rag.js
```

---

## Safety & Disclaimers

VaidIQ is built with a layered safety model:

- The base system prompt explicitly prohibits diagnosis and prescription
- Emergency patterns trigger an immediate 112 callout regardless of other context
- Every AI response is required to end with: *"⚠️ This is general guidance — please consult a licensed doctor."*
- The iCall mental health helpline (9152987821) is surfaced for mental health queries
- Jan Aushadhi and government hospital references are prioritised to keep guidance accessible to lower-income users

---

## Roadmap

| Phase | Feature |
|---|---|
| Phase 1 (current) | Core health management, RAG chat, medicine catalogue, hospital finder |
| Phase 2 | In-app ambulance booking with live ETA tracking |
| Phase 3 | Semantic embeddings (replace TF-IDF with `@xenova/transformers`) |
| Phase 4 | Push notification reminders for medications |
| Phase 5 | Family health profiles (multi-user under one account) |

---

*VaidIQ — Built with care for India's health.*
