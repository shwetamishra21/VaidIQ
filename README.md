# 🏥 VaidIQ — AI Health Companion (India-Focused)

## 🚀 Overview

VaidIQ is an **AI-powered medical assistance platform** designed for the Indian healthcare ecosystem.
It provides **symptom-based guidance, emergency detection, and medicine assistance** using a combination of:

* Large Language Models (LLM)
* Retrieval-Augmented Generation (RAG)
* Rule-based safety systems

The system acts as a **first-level triage assistant**, helping users decide:

* 🚨 Emergency (call 112)
* 🏥 Doctor consultation
* 💊 Medicine-related guidance

---

## ⚙️ Current Tech Stack (ACTUAL IMPLEMENTATION)

### Backend

* Node.js + Express
* MongoDB (user data, sessions, logs)
* Groq API (LLM inference)
* Custom RAG engine (TF-IDF based)

### Frontend

* HTML + CSS + Vanilla JS
* API-driven UI (localhost-based)

### AI Layer

* Groq LLM (`llama-3.1-8b-instant`)
* RAG (local knowledge base)
* Emergency rule engine

---

## 🧠 Core Features (WORKING)

### 1. 🤖 AI Symptom Checker (RAG + LLM)

* Accepts user symptoms
* Retrieves relevant medical knowledge (RAG)
* Combines with LLM reasoning
* Produces structured, safe responses

---

### 2. 🚨 Emergency Detection (Deterministic)

* Keyword + logic-based detection
* Overrides LLM if high-risk detected
* Example:

  * Chest pain + breathlessness → 🚨 call 112

---

### 3. 🧾 RAG Pipeline (Node.js Only)

* Local medical dataset (`symptoms.json`, etc.)
* TF-IDF vector search
* Top-K context injection into LLM prompt

---

### 4. 👤 User Context Integration

* Recent health logs
* Active medications
* Chat history

Merged into system prompt for **personalized responses**

---

### 5. 💬 Conversational AI Chat

* Groq-powered responses
* Context-aware replies
* Emergency-safe output

---

## ⚠️ Features Removed / Not Included (By Design)

To maintain reliability, the following were **removed or deferred**:

* ❌ Hospital discovery (placeholder removed)
* ❌ Appointment booking (not functional)
* ❌ Fake/partial integrations

👉 Only **fully working features are retained**

---

## 🧪 RAG Example (Working)

Query:

```
I have chest pain and shortness of breath
```

Retrieved Context:

* Emergency chest pain protocol
* Breathlessness handling
* BP-related risk factors

→ Passed into LLM → Generates safe response

---

## 📂 Project Structure

```
backend/
  rag/
    ragEngine.js
    contextBuilder.js
  knowledge/
    symptoms.json
    drugs.json
  server.js
  package.json

frontend/
  index.html

.env (not committed)
.gitignore
```

---

## 🔑 Environment Variables

Create `backend/.env`:

```
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret

GROQ_API_KEY=your_key
GROQ_MODEL=llama-3.1-8b-instant
AI_API_URL=https://api.groq.com/openai/v1/chat/completions
```

---

## ▶️ How to Run

### Backend

```
cd backend
npm install
npm run dev
```

Runs at:

```
http://localhost:4000
```

---

### Frontend

Open:

```
frontend/index.html
```

---

## 🔐 Safety Design

* No diagnosis claims
* No prescriptions
* Emergency override system
* LLM constrained via system prompts
* RAG grounding reduces hallucination

---

## 📉 Limitations (Honest)

* Medicine search is static (no AI integration yet)
* No real hospital/ambulance APIs
* RAG uses TF-IDF (not embeddings yet)
* Frontend is basic (no framework)

---

## 🚀 Future Scope

* 🔄 Vector DB (Pinecone / Chroma)
* 🧠 Embeddings (SBERT)
* 💊 AI-powered medicine recommendations
* 📱 Mobile + voice interface
* 🚑 Real ambulance integration

---

## ⚠️ Disclaimer

This system is for **assistance only**.
It does NOT replace doctors or emergency services.

---

## 📌 Status

✅ Core AI + RAG working
✅ Emergency detection working
✅ Backend stable
⚠️ UI + medicine system partially implemented
🚧 Under active development

---
