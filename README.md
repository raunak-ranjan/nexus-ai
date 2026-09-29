# Nexus AI 🤖

> A clean, browser-based AI chat workspace powered by OpenRouter.

## Overview

Nexus AI is a frontend AI chat application built as a personal software project to explore modern web development, streaming APIs, Markdown rendering, and LLM-powered user experiences.

## ✨ Features

- 🤖 AI-powered chat
- 🌊 Streaming responses
- 📝 Markdown rendering
- 💻 Formatted code blocks
- 📋 One-click copy for responses and code
- 🔌 OpenRouter API integration
- 🧠 Model selection
- 💬 Local conversation history
- ✎ Rename conversations
- 🗑️ Delete individual conversations
- 🧹 Clear all saved conversations
- 📱 Responsive interface
- 🔐 Browser-local API-key storage for this demo

## 🛠️ Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- OpenRouter API
- Marked.js
- DOMPurify
- LocalStorage
- Git & GitHub

## 📂 Project Structure

```text
nexus-ai/
├── index.html
├── style.css
├── script.js
├── .gitignore
├── README.md
└── assets/
```

## ⚙️ Run Locally

```bash
git clone https://github.com/raunak-ranjan/nexus-ai.git
cd nexus-ai
```

Open `index.html` with VS Code Live Server.

Then:

1. Open **Settings**.
2. Add your OpenRouter API key.
3. Select a model.
4. Send a message.

## 🔐 Security

This is a frontend portfolio/demo project. The user enters their OpenRouter API key and the key is stored in browser `localStorage`.

**Never hard-code an API key into this repository.**

For production, Nexus should use a backend/serverless API proxy so the secret remains server-side.

## 🗺️ Roadmap

- [x] Modern chat interface
- [x] OpenRouter integration
- [x] Model selection
- [x] Local chat history
- [x] Rename conversations
- [x] Delete conversations
- [x] Clear conversation history
- [x] Responsive layout
- [x] Streaming responses
- [x] Markdown rendering
- [x] Code blocks
- [x] Copy buttons
- [ ] Backend/API proxy
- [ ] Authentication
- [ ] Cloud-synced conversations
- [ ] Production deployment

## 👨‍💻 Author

**Raunak Ranjan**

CSE Student @ KIIT

- GitHub: https://github.com/raunak-ranjan

## License

No open-source license has been added yet.
