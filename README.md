# Vaidiq

> AI-powered healthcare assistant built using OpenRouter LLMs, MongoDB Atlas, and a pure HTML/CSS/JS frontend.
---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Frontend Architecture](#frontend-architecture)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Vaidiq is an intelligent web platform that leverages the power of OpenAI's large language models to deliver smart, context-aware experiences. The backend is powered by MongoDB for flexible, document-based storage, while the frontend is built with vanilla HTML, CSS, and JavaScript for maximum performance and portability.

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| AI / LLM   | OpenRouter (gpt-4o-mini)            |
| Database   | MongoDB (via Mongoose)              |
| Backend    | Node.js + Express                   |
| Frontend   | HTML5 · CSS3 · Vanilla JavaScript   |
| Auth       | JWT + bcrypt                        |
| Hosting    | (Your cloud provider here)          |

---

## Project Structure

```
vaidiq/
├── index.html                # Main entry point (frontend)
├── css/
│   └── styles.css            # Global stylesheet
├── js/
│   └── main.js               # App logic & API calls
│
├── backend/
│   ├── server.js             # Express app + all routes
│   ├── models/               # Mongoose schemas
│   │   ├── User.js
│   │   └── Conversation.js
│   └── uploads/              # File upload storage
│
├── .env.example
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB (local or Atlas URI)
- OpenAI API key

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/vaidiq.git
cd vaidiq

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your values
cp .env.example .env

# 4. Start the development server
npm run dev
```

The backend will be available at `http://localhost:4000`.

---

## Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
# Server
PORT=4000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/vaidiq

# OpenRouter
OPENROUTER_API_KEY=your_api_key_here

# Auth
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
```

> **Never commit your `.env` file.** It is listed in `.gitignore` by default.

---

## API Reference

All API endpoints are prefixed with `/api`.

### Authentication

| Method | Endpoint             | Description          |
|--------|----------------------|----------------------|
| POST   | `/api/auth/register` | Register a new user  |
| POST   | `/api/auth/login`    | Login and get a JWT  |

### Chat (LLM)

| Method | Endpoint                    | Description                          |
|--------|-----------------------------|--------------------------------------|
| POST   | `/api/chat`                 | Send a message, receive LLM response |
| GET    | `/api/chat/history`         | Fetch past conversations             |
| DELETE | `/api/chat/:conversationId` | Delete a conversation                |

#### Example — POST `/api/chat`

**Request body:**
```json
{
  "message": "Explain quantum entanglement in simple terms.",
  "conversationId": "optional-existing-id"
}
```

**Response:**
```json
{
  "reply": "Quantum entanglement is...",
  "conversationId": "64f3a..."
}
```

### Users

| Method | Endpoint           | Description               |
|--------|--------------------|---------------------------|
| GET    | `/api/user/me`     | Get current user profile  |
| PATCH  | `/api/user/me`     | Update profile settings   |

---

## Database Schema

### `users` collection

```js
{
  _id: ObjectId,
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  createdAt: Date,
  updatedAt: Date
}
```

### `conversations` collection

```js
{
  _id: ObjectId,
  userId: ObjectId,           // ref: users
  title: String,
  messages: [
    {
      role: String,           // "user" | "assistant" | "system"
      content: String,
      timestamp: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

---

## Frontend Architecture

The frontend is built with plain HTML, CSS, and JavaScript — no build step required.

- **`index.html`** — Main entry point at the repo root; all views are rendered dynamically via JS.
- **`js/main.js`** — Handles routing, DOM updates, and `fetch()` calls to the backend API.
- **`css/styles.css`** — Styling using CSS custom properties for theming.

In development, open `index.html` directly in your browser or serve it via a simple static server:

```bash
npx serve .
```

The frontend talks to the backend at `http://localhost:4000`.

---

## Deployment

### Option A — Traditional VPS (e.g. EC2, DigitalOcean)

```bash
# Build and start with PM2
npm install -g pm2
pm2 start backend/server.js --name vaidiq
pm2 save
```

### Option B — Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4000
CMD ["node", "backend/server.js"]
```

```bash
docker build -t vaidiq .
docker run -p 4000:4000 --env-file .env vaidiq
```

### Option C — Railway / Render / Fly.io

Connect your GitHub repository, set environment variables in the dashboard, and deploy. These platforms auto-detect Node.js projects.

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request.

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Built with care by the Vaidiq team.*
