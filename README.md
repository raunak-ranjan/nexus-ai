# ⚡ Nexus AI

> A modern AI workspace for intelligent conversations, powered by OpenRouter and built with a secure Node.js backend.

🌐 **Live Demo:** https://nexus-ai-production-7702.up.railway.app/

💻 **Source Code:** https://github.com/raunak-ranjan/nexus-ai

---

## 🚀 Overview

**Nexus AI** is a modern AI chat workspace designed to provide a clean, responsive and focused conversational experience.

The application combines a lightweight frontend with a secure Node.js backend that communicates with the OpenRouter API.

Instead of exposing the API key in the browser, Nexus keeps the credential on the server and forwards validated requests securely to the AI provider.

---

## ✨ Features

- 🤖 AI-powered conversations
- ⚡ Streaming AI responses
- 🧠 Multiple AI model support
- 💬 Conversational chat interface
- 🔐 Server-side API key protection
- 🛡️ Request validation
- 🚦 Built-in rate limiting
- 📡 Health-check endpoint
- 📱 Responsive user interface
- 🎨 Modern AI workspace design
- 🌐 Production deployment
- 🔄 GitHub-connected deployment workflow

---

## 🧠 Supported Models

Nexus AI is configured to support multiple models through OpenRouter:

- `openrouter/free`
- `openai/gpt-4o-mini`
- `google/gemini-2.0-flash-001`
- `anthropic/claude-3.5-haiku`

> Model and provider availability depends on OpenRouter.

---

## 🏗️ Architecture

```text
User Browser
     │
     ▼
Nexus AI Frontend
HTML / CSS / JavaScript
     │
     │ POST /api/chat
     ▼
Node.js Backend
     │
     ├── Request validation
     ├── Rate limiting
     ├── API key protection
     └── Streaming
     │
     ▼
OpenRouter API
     │
     ▼
AI Model
     │
     ▼
Streaming Response
     │
     ▼
Nexus AI UI
```

---

## 🛠️ Tech Stack

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript

### Backend
- Node.js
- Native Node.js HTTP server
- Server-side API proxy
- Streaming responses

### AI
- OpenRouter API
- Large Language Models (LLMs)

### Deployment
- GitHub
- Railway

---

## 📂 Project Structure

```text
nexus-ai/
│
├── index.html
├── style.css
├── script.js
├── server.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/raunak-ranjan/nexus-ai.git
cd nexus-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

Create a file named `.env` and add:

```env
OPENROUTER_API_KEY=your_api_key_here
HOST=127.0.0.1
APP_URL=http://localhost:3000
```

### 4. Start Nexus AI

```bash
npm start
```

Open:

```text
http://localhost:3000
```

---

## 🔑 Environment Variables

| Variable | Description | Example |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter authentication key | `sk-or-v1-...` |
| `HOST` | Server bind address | `127.0.0.1` |
| `APP_URL` | Application URL | `http://localhost:3000` |
| `PORT` | Server port | Automatically provided in production |

**Never commit your real `.env` file or API key to GitHub.**

---

## 🔐 Security

Nexus AI keeps the OpenRouter API key on the server instead of exposing it to the browser.

The backend retrieves the key using:

```js
process.env.OPENROUTER_API_KEY
```

Additional backend protections include:

- Request body size limits
- Message count limits
- Message length limits
- Allowed-model validation
- Message-role validation
- IP-based rate limiting
- Security response headers

---

## 📡 API

### Health Check

```http
GET /api/health
```

Example response:

```json
{
  "ok": true,
  "service": "nexus-api",
  "configured": true
}
```

### Chat

```http
POST /api/chat
```

Example request:

```json
{
  "model": "openai/gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "Explain recursion in simple words."
    }
  ]
}
```

The response is streamed back to the frontend.

---

## 🛡️ Request Protection

- Maximum request body: **1 MB**
- Maximum conversation messages: **30**
- Maximum message length: **12,000 characters**
- IP-based rate limiting
- Input validation

---

## 🌐 Production Deployment

Nexus AI is currently deployed on **Railway**.

### Production URL

https://nexus-ai-production-7702.up.railway.app/

### Production Architecture

```text
GitHub
   │
   ▼
Railway
   │
   ▼
Node.js Server
   │
   ▼
OpenRouter API
   │
   ▼
AI Model
```

The production server uses Railway's dynamically assigned `PORT` and binds to `0.0.0.0`.

---

## 🔄 Deployment Workflow

```bash
git add .
git commit -m "update Nexus AI"
git push origin main
```

Changes pushed to the main branch can then be deployed through the connected Railway service.

---

## 🧪 Development

Start the local server:

```bash
npm start
```

Local application:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/api/health
```

---

## 🎯 Project Goals

Nexus AI is being developed with the following goals:

- Build a clean AI-first workspace
- Learn full-stack web development
- Understand AI API integration
- Implement secure server-side API handling
- Explore streaming AI responses
- Build and deploy a real-world application
- Continuously improve the user experience

---

## 🔮 Roadmap

- [ ] User authentication
- [ ] Cloud conversation history
- [ ] Conversation search
- [ ] Custom system prompts
- [ ] Advanced model settings
- [ ] File uploads
- [ ] Image understanding
- [ ] Voice interaction
- [ ] AI-generated summaries
- [ ] Export conversations
- [ ] PWA support
- [ ] Improved mobile experience
- [ ] Usage analytics
- [ ] Custom domain

---

## 📸 Screenshots

Add screenshots of the Nexus AI interface here when available.

Example:

```markdown
![Nexus AI Workspace](screenshots/nexus-ai.png)
```

---

## 📜 License

This project is currently provided for educational and personal development purposes.

If you plan to publish or distribute Nexus AI commercially, add an appropriate open-source license.

---

## 👨‍💻 Author

### Raunak Ranjan

Computer Science & Engineering student and developer interested in:

- Artificial Intelligence
- Web Development
- Software Engineering
- AI Applications
- Emerging Technologies

**GitHub:** https://github.com/raunak-ranjan

---

## ⭐ Support

If you find Nexus AI interesting, consider giving the repository a ⭐.

It helps the project get more visibility and motivates further development.

---

<p align="center">
  <strong>Built with curiosity, code, and AI. ⚡</strong>
</p>
