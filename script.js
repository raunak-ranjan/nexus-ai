const state = {
  chats: JSON.parse(localStorage.getItem("nexus_chats") || "[]"),
  current: { title: "New chat", messages: [] },
  apiKey: localStorage.getItem("nexus_openrouter_key") || ""
};

const chatEl = document.getElementById("chat");
const welcomeEl = document.getElementById("welcome");
const inputEl = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const historyList = document.getElementById("historyList");
const modelSelect = document.getElementById("modelSelect");
const toastEl = document.getElementById("toast");

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function saveChats() {
  localStorage.setItem("nexus_chats", JSON.stringify(state.chats.slice(-30)));
}

function saveCurrent() {
  if (!state.current.messages.length) return;
  const existing = state.chats.findIndex(c => c.id === state.current.id);
  const data = { ...state.current, updatedAt: Date.now() };
  if (existing >= 0) state.chats[existing] = data;
  else state.chats.push(data);
  saveChats();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  [...state.chats].reverse().forEach(chat => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.textContent = chat.title || "Untitled chat";
    button.onclick = () => loadChat(chat.id);
    historyList.appendChild(button);
  });
}

function loadChat(id) {
  const found = state.chats.find(c => c.id === id);
  if (!found) return;
  state.current = structuredClone(found);
  renderMessages();
}

function newChat() {
  saveCurrent();
  state.current = { id: crypto.randomUUID(), title: "New chat", messages: [] };
  renderMessages();
  inputEl.focus();
}

function renderMessages() {
  document.querySelectorAll(".message").forEach(el => el.remove());
  welcomeEl.style.display = state.current.messages.length ? "none" : "block";
  state.current.messages.forEach(m => addMessageToUI(m.role, m.content));
  scrollToBottom();
}

function addMessageToUI(role, content) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  const inner = document.createElement("div");
  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : "Nexus";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = content;
  inner.append(label, bubble);
  wrap.appendChild(inner);
  chatEl.appendChild(wrap);
  return bubble;
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function sendMessage(text) {
  const prompt = text.trim();
  if (!prompt || sendBtn.disabled) return;

  if (!state.apiKey) {
    openSettings();
    toast("Add your OpenRouter API key first.");
    return;
  }

  if (!state.current.id) state.current.id = crypto.randomUUID();
  if (!state.current.messages.length) {
    state.current.title = prompt.slice(0, 45) + (prompt.length > 45 ? "…" : "");
  }

  state.current.messages.push({ role: "user", content: prompt });
  welcomeEl.style.display = "none";
  addMessageToUI("user", prompt);
  inputEl.value = "";
  resizeInput();
  sendBtn.disabled = true;

  const thinking = addMessageToUI("assistant", "Thinking…");
  scrollToBottom();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${state.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.href,
        "X-Title": "Nexus AI"
      },
      body: JSON.stringify({
        model: modelSelect.value,
        messages: state.current.messages,
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) throw new Error("The model returned an empty response.");

    thinking.textContent = answer;
    state.current.messages.push({ role: "assistant", content: answer });
    saveCurrent();
  } catch (error) {
    thinking.textContent = `Error: ${error.message}`;
    toast("Nexus couldn't complete the request.");
  } finally {
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

function resizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 180) + "px";
}

function openSettings() {
  document.getElementById("apiKey").value = state.apiKey;
  document.getElementById("settingsModal").classList.remove("hidden");
}

document.getElementById("settingsBtn").onclick = openSettings;
document.getElementById("closeSettings").onclick = () => document.getElementById("settingsModal").classList.add("hidden");

document.getElementById("saveSettings").onclick = () => {
  state.apiKey = document.getElementById("apiKey").value.trim();
  if (state.apiKey) localStorage.setItem("nexus_openrouter_key", state.apiKey);
  else localStorage.removeItem("nexus_openrouter_key");
  document.getElementById("settingsModal").classList.add("hidden");
  toast(state.apiKey ? "API key saved locally." : "API key removed.");
};

document.getElementById("removeKey").onclick = () => {
  state.apiKey = "";
  localStorage.removeItem("nexus_openrouter_key");
  document.getElementById("apiKey").value = "";
  toast("API key removed.");
};

document.getElementById("toggleKey").onclick = () => {
  const field = document.getElementById("apiKey");
  const visible = field.type === "text";
  field.type = visible ? "password" : "text";
  document.getElementById("toggleKey").textContent = visible ? "Show" : "Hide";
};

document.getElementById("newChatBtn").onclick = newChat;
document.getElementById("clearBtn").onclick = () => {
  state.current.messages = [];
  renderMessages();
};

document.getElementById("composer").addEventListener("submit", e => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

inputEl.addEventListener("input", resizeInput);
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

document.getElementById("menuBtn").onclick = () => document.getElementById("sidebar").classList.toggle("open");

document.getElementById("settingsModal").addEventListener("click", e => {
  if (e.target.id === "settingsModal") e.currentTarget.classList.add("hidden");
});

state.current.id = crypto.randomUUID();
renderHistory();
resizeInput();
