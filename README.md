# Nexus AI 🤖

> A secure full-stack AI chat workspace with a browser UI and a server-side OpenRouter API proxy.

## Overview

Nexus AI is a personal software project built to explore modern web development, streaming APIs, Markdown rendering, LLM integrations, client-side state, and secure backend architecture.

Version 3 moves the OpenRouter credential out of the browser. The frontend sends chat requests to the Nexus backend, and the backend calls OpenRouter using a server-side environment variable.

## ✨ Features

- 🤖 AI-powered chat
- 🌊 Streaming responses
- 📝 Markdown rendering
- 💻 Formatted code blocks
- 📋 One-click copy for responses and code
- 🔌 OpenRouter integration through a backend proxy
- 🧠 Model selection with server-side allowlisting
- 💬 Local conversation history
- ✎ Rename conversations
- 🗑️ Delete individual conversations
- 🧹 Clear saved conversations
- 📱 Responsive interface
- 🔐 Server-side API key storage
- 🛡️ Request validation
- 🚦 Basic per-IP rate limiting
- 🧱 Security headers
- ❤️ Backend health endpoint

## 🛠️ Tech Stack

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript
- Marked.js
- DOMPurify
- LocalStorage

### Backend
- Node.js
- Native `http` server
- Native `fetch`
- OpenRouter API
- Server-Sent Events streaming

### Tooling
- Git
- GitHub
- npm

## 📂 Project Structure

```text
nexus-ai/
├── index.html
├── style.css
├── script.js
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── assets/
```

## 🚀 Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/raunak-ranjan/nexus-ai.git
cd nexus-ai
```

### 2. Check Node.js

Nexus v3 requires Node.js 18.17+.

```bash
node --version
```

### 3. Create your environment file

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Open `.env` and add your own OpenRouter key:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PORT=3000
HOST=127.0.0.1
APP_URL=http://localhost:3000
```

### 4. Start Nexus

```bash
npm start
```

Open:

```text
http://localhost:3000
```

**Do not open `index.html` directly with Live Server for v3.** The frontend needs the `/api/chat` backend route.

## 🔐 Security Architecture

### v2

```text
Browser → OpenRouter
           ↑
        API key
```

The API key was entered into the browser and stored in `localStorage`, which was acceptable only for the earlier demo.

### v3

```text
Browser
   │
   │ POST /api/chat
   ▼
Nexus Node.js Backend
   │
   │ server-side Authorization header
   ▼
OpenRouter
   │
   ▼
AI model
```

The browser never receives `OPENROUTER_API_KEY`.

### Security measures included

- `.env` excluded from Git
- Server-side API key
- Model allowlist
- Request-size limit
- Message-count limit
- Message-length validation
- Basic per-IP rate limiting
- Security response headers
- No API key in frontend JavaScript
- `/api/health` exposes only whether the server is configured, not the secret

**Never commit `.env` or an actual API key to GitHub.**

## 🧪 Test the backend

Health check:

```text
http://localhost:3000/api/health
```

A configured local server should return JSON similar to:

```json
{
  "ok": true,
  "service": "nexus-api",
  "configured": true
}
```

## 🗺️ Roadmap

- [x] Modern chat interface
- [x] OpenRouter integration
- [x] Model selection
- [x] Local chat history
- [x] Rename conversations
- [x] Delete conversations
- [x] Streaming responses
- [x] Markdown rendering
- [x] Code blocks
- [x] Copy buttons
- [x] Secure backend/API proxy
- [x] Environment-based secrets
- [x] Basic request validation
- [x] Basic rate limiting
- [ ] Authentication
- [ ] Cloud-synced conversations
- [ ] Database persistence
- [ ] Production deployment
- [ ] Automated tests
- [ ] Observability and analytics

## 👨‍💻 Author

**Raunak Ranjan**

CSE Student @ KIIT

- GitHub: https://github.com/raunak-ranjan

## License

No open-source license has been added yet.
