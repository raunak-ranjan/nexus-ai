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
- 💬 Local conversation history with resilient error recovery and rollback
- ✎ Rename conversations
- 🗑️ Delete individual conversations
- 🧹 Clear saved conversations
- ⌁ Threadline continuity space for memories, decisions, commitments, and questions
- 📐 Bounded request context (preserves full chat locally while keeping API requests within the 30-message limit)
- 📱 Responsive interface
- 🔐 Server-side API key storage
- 🛡️ Request validation
- 🚦 Basic per-IP rate limiting
- 🧱 Security headers and Content Security Policy (CSP)
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
- Node.js (18.17+)
- Native `http` server
- Native `fetch`
- OpenRouter API
- Server-Sent Events streaming

### Tooling
- Git
- GitHub
- npm
- Node.js test runner (`node --test`)

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
├── assets/
└── test/
    ├── chat-storage.test.js
    ├── chat-streaming.test.js
    ├── server-oversized-body.test.js
    ├── server-static-security.test.js
    └── threadline-storage.test.js
```

## 🚀 Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/raunak-ranjan/nexus-ai.git
cd nexus-ai
```

### 2. Check Node.js

Nexus v3 requires Node.js 18.17+ (as declared in `package.json` engines, providing built-in `fetch` and test runner support).

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
- Server-side API key storage
- Model allowlist (`openrouter/free`, `openai/gpt-4o-mini`, `google/gemini-2.0-flash-001`, `anthropic/claude-3.5-haiku`)
- Server-configured Content Security Policy (CSP) header restricting script, style, font, image, connect, object, base-uri, form-action, and frame-ancestor origins
- Security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`)
- Strict static asset allowlist with directory traversal denial (only `/`, `/index.html`, `/style.css`, and `/script.js` are served)
- Request-size limit (1 MiB max body size with 413 responses without draining oversized bodies)
- Message-count limit (30 messages max) with client-side bounded request context builder
- Message-length validation (12,000 characters per message)
- Basic per-IP rate limiting (30 requests per minute)
- Resilient storage error handling and mutation rollback to protect local user data
- No API key in frontend JavaScript
- `/api/health` exposes only whether the server is configured, not the secret

**Never commit `.env` or an actual API key to GitHub.**

## 🧪 Testing

### Automated Regression Suite

Nexus AI includes automated regression tests using Node's built-in test runner (`node:test`). No external test dependencies are required.

Run the complete test suite:

```bash
node --test
```

### Test Suites

1. `test/chat-storage.test.js` — Verifies conversation history persistence, malformed storage detection, read-only fallback mode, and in-memory mutation rollback on `localStorage` failures.
2. `test/chat-streaming.test.js` — Verifies SSE streaming, stream error handling, UI state and control restoration, 30-message boundary enforcement, and request context construction.
3. `test/server-oversized-body.test.js` — Verifies server-side 1 MiB body limits, early 413 payload rejection, and partial upload handling without draining oversized bodies.
4. `test/server-static-security.test.js` — Verifies static asset allowlisting, traversal path rejection, security response headers, and Content-Security-Policy header presence.
5. `test/threadline-storage.test.js` — Verifies Threadline item schema validation, read-only mode for invalid stored data, and mutation rollback on storage write failures.

### Backend Health Check

Health check endpoint:

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
- [x] Local chat history with rollback and recovery
- [x] Rename conversations
- [x] Delete conversations
- [x] Streaming responses
- [x] Markdown rendering
- [x] Code blocks
- [x] Copy buttons
- [x] Threadline continuity workspace
- [x] Secure backend/API proxy
- [x] Environment-based secrets
- [x] Content Security Policy (CSP) and security headers
- [x] Static asset allowlisting and traversal protections
- [x] Request validation and size limits
- [x] Context window request bounding
- [x] Basic rate limiting
- [x] Automated test suites
- [ ] Authentication
- [ ] Cloud-synced conversations
- [ ] Database persistence
- [ ] Production deployment
- [ ] Observability and analytics

## 👨‍💻 Author

**Raunak Ranjan**

CSE Student @ KIIT

- GitHub: https://github.com/raunak-ranjan

## License

No open-source license has been added yet.
