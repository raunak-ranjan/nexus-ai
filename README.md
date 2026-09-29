# Nexus AI 🤖

> A clean, browser-based AI chat workspace powered by OpenRouter.

## Overview

Nexus AI is a frontend AI chat application built as a personal software project to explore modern web development, API integration, and LLM-powered user experiences.

The interface is intentionally simple: choose a model, start a conversation, and keep local conversation history in the browser.

## Features

- AI-powered chat
- OpenRouter API integration
- Model selection
- New conversation workflow
- Local conversation history
- Responsive dark interface
- Keyboard-friendly composer
- Local API-key storage for this demo
- Mobile navigation

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- OpenRouter API
- Git & GitHub
- LocalStorage

## Project Structure

```text
nexus-ai/
├── index.html
├── style.css
├── script.js
├── .gitignore
├── README.md
└── assets/
```

## Run Locally

1. Clone the repository:

```bash
git clone https://github.com/raunak-ranjan/nexus-ai.git
cd nexus-ai
```

2. Open `index.html` in a browser, or use VS Code Live Server.

3. Open **Settings** inside Nexus and add your OpenRouter API key.

4. Select a model and start chatting.

## Security Note

This version is a **frontend portfolio/demo project**. The API key is entered by the user and stored in the browser's localStorage.

**Never put a real API key directly into `script.js`, `index.html`, or any file committed to GitHub.**

For production, Nexus should use a backend/serverless function so the secret API key remains server-side.

## Roadmap

- [x] Modern chat interface
- [x] OpenRouter integration
- [x] Model selection
- [x] Local chat history
- [x] Responsive layout
- [ ] Streaming responses
- [ ] Markdown rendering
- [ ] Code syntax highlighting
- [ ] Backend/API proxy
- [ ] Authentication
- [ ] Cloud-synced conversations

## Author

**Raunak Ranjan**

CSE Student @ KIIT

- GitHub: https://github.com/raunak-ranjan

## License

No open-source license has been added yet.
