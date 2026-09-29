const state = {
  chats: JSON.parse(localStorage.getItem("nexus_chats") || "[]"),
  current: { id: crypto.randomUUID(), title: "New chat", messages: [] },
  apiKey: localStorage.getItem("nexus_openrouter_key") || "",
  streaming: false
};

const chatEl = document.getElementById("chat");
const welcomeEl = document.getElementById("welcome");
const inputEl = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const historyList = document.getElementById("historyList");
const modelSelect = document.getElementById("modelSelect");
const toastEl = document.getElementById("toast");

marked.setOptions({ breaks: true, gfm: true });

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
  const data = { ...structuredClone(state.current), updatedAt: Date.now() };
  const existing = state.chats.findIndex(c => c.id === state.current.id);
  if (existing >= 0) state.chats[existing] = data;
  else state.chats.push(data);
  saveChats();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  [...state.chats].reverse().forEach(chat => {
    const row = document.createElement("div");
    row.className = `history-row${chat.id === state.current.id ? " active" : ""}`;

    const button = document.createElement("button");
    button.className = "history-item";
    button.textContent = chat.title || "Untitled chat";
    button.title = chat.title || "Untitled chat";
    button.onclick = () => loadChat(chat.id);

    const menu = document.createElement("button");
    menu.className = "history-menu-btn";
    menu.textContent = "⋯";
    menu.title = "Chat options";
    menu.setAttribute("aria-label", "Chat options");
    menu.onclick = e => {
      e.stopPropagation();
      showChatMenu(menu, chat.id);
    };

    row.append(button, menu);
    historyList.appendChild(row);
  });
}

function showChatMenu(anchor, chatId) {
  document.querySelectorAll(".chat-context-menu").forEach(el => el.remove());

  const menu = document.createElement("div");
  menu.className = "chat-context-menu";

  const rename = document.createElement("button");
  rename.textContent = "✎ Rename";
  rename.onclick = () => {
    menu.remove();
    renameChat(chatId);
  };

  const remove = document.createElement("button");
  remove.className = "danger";
  remove.textContent = "⌫ Delete";
  remove.onclick = () => {
    menu.remove();
    deleteChat(chatId);
  };

  menu.append(rename, remove);
  document.body.appendChild(menu);

  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.min(rect.right + 4, window.innerWidth - 150)}px`;
  menu.style.top = `${Math.min(rect.top, window.innerHeight - 90)}px`;

  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 0);
}

function renameChat(id) {
  const chat = state.chats.find(c => c.id === id);
  if (!chat) return;

  const nextTitle = prompt("Rename conversation:", chat.title || "Untitled chat");
  if (nextTitle === null) return;

  const title = nextTitle.trim().slice(0, 80);
  if (!title) {
    toast("Chat name cannot be empty.");
    return;
  }

  chat.title = title;
  if (state.current.id === id) state.current.title = title;
  saveChats();
  renderHistory();
  toast("Conversation renamed.");
}

function deleteChat(id) {
  const chat = state.chats.find(c => c.id === id);
  if (!chat) return;

  if (!confirm(`Delete "${chat.title || "this conversation"}"?`)) return;

  state.chats = state.chats.filter(c => c.id !== id);
  saveChats();

  if (state.current.id === id) {
    state.current = { id: crypto.randomUUID(), title: "New chat", messages: [] };
    renderMessages();
  }

  renderHistory();
  toast("Conversation deleted.");
}

function clearAllHistory() {
  if (!state.chats.length) {
    toast("No saved conversations.");
    return;
  }

  if (!confirm("Delete all saved conversations? This cannot be undone.")) return;

  state.chats = [];
  saveChats();
  state.current = { id: crypto.randomUUID(), title: "New chat", messages: [] };
  renderMessages();
  renderHistory();
  toast("All conversations deleted.");
}

function loadChat(id) {
  const found = state.chats.find(c => c.id === id);
  if (!found || state.streaming) return;
  state.current = structuredClone(found);
  renderMessages();
  renderHistory();
}

function newChat() {
  if (state.streaming) return;
  saveCurrent();
  state.current = { id: crypto.randomUUID(), title: "New chat", messages: [] };
  renderMessages();
  inputEl.focus();
}

function clearCurrent() {
  if (state.streaming) return;
  state.current.messages = [];
  state.current.title = "New chat";
  const index = state.chats.findIndex(c => c.id === state.current.id);
  if (index >= 0) {
    state.chats.splice(index, 1);
    saveChats();
  }
  renderMessages();
  renderHistory();
  toast("Current conversation cleared.");
}

function renderMessages() {
  document.querySelectorAll(".message").forEach(el => el.remove());
  welcomeEl.style.display = state.current.messages.length ? "none" : "block";
  state.current.messages.forEach(m => addMessageToUI(m.role, m.content));
  scrollToBottom();
}

function renderMarkdown(content) {
  const raw = marked.parse(content || "");
  return DOMPurify.sanitize(raw);
}

function addMessageToUI(role, content, streaming = false) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;

  const inner = document.createElement("div");
  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : "Nexus";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (role === "assistant" && !streaming) {
    bubble.innerHTML = renderMarkdown(content);
    addAssistantActions(inner, content);
  } else if (role === "assistant" && streaming) {
    bubble.innerHTML = typingHTML();
  } else {
    bubble.textContent = content;
  }

  inner.append(label, bubble);
  wrap.appendChild(inner);
  chatEl.appendChild(wrap);

  if (role === "assistant" && streaming) wrap.dataset.streaming = "true";
  return { wrap, bubble, inner };
}

function typingHTML() {
  return '<span class="typing"><span></span><span></span><span></span></span>';
}

function addAssistantActions(inner, content) {
  const actions = document.createElement("div");
  actions.className = "assistant-actions";

  const copy = document.createElement("button");
  copy.className = "action-btn";
  copy.textContent = "Copy";
  copy.dataset.copy = content;

  actions.appendChild(copy);
  inner.appendChild(actions);
}

function addCodeCopyButtons(container) {
  container.querySelectorAll("pre").forEach(pre => {
    if (pre.parentElement.classList.contains("code-block")) return;

    const code = pre.querySelector("code");
    const block = document.createElement("div");
    block.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-header";

    const langClass = [...(code?.classList || [])].find(c => c.startsWith("language-"));
    const language = langClass ? langClass.replace("language-", "") : "code";

    const label = document.createElement("span");
    label.textContent = language;

    const button = document.createElement("button");
    button.className = "code-copy";
    button.textContent = "Copy";
    button.dataset.copy = code?.textContent || "";

    header.append(label, button);
    pre.replaceWith(block);
    block.append(header, pre);
  });
}

function updateStreamingBubble(bubble, text) {
  bubble.innerHTML = renderMarkdown(text);
  addCodeCopyButtons(bubble);
}

function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function sendMessage(text) {
  const prompt = text.trim();
  if (!prompt || state.streaming) return;

  if (!state.apiKey) {
    openSettings();
    toast("Add your OpenRouter API key first.");
    return;
  }

  if (!state.current.messages.length) {
    state.current.title = prompt.slice(0, 45) + (prompt.length > 45 ? "…" : "");
  }

  state.current.messages.push({ role: "user", content: prompt });
  welcomeEl.style.display = "none";
  addMessageToUI("user", prompt);
  inputEl.value = "";
  resizeInput();

  state.streaming = true;
  sendBtn.disabled = true;

  const assistantUI = addMessageToUI("assistant", "", true);
  scrollToBottom();

  let fullText = "";

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
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const data = await response.json();
        message = data?.error?.message || message;
      } catch {}
      throw new Error(message);
    }

    if (!response.body) throw new Error("Streaming is not supported by this browser.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const lines = event.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullText += delta;
              updateStreamingBubble(assistantUI.bubble, fullText);
              scrollToBottom();
            }
          } catch {
            // Ignore incomplete/non-JSON SSE lines.
          }
        }
      }
    }

    if (!fullText.trim()) throw new Error("The model returned an empty response.");

    assistantUI.wrap.removeAttribute("data-streaming");
    assistantUI.bubble.innerHTML = renderMarkdown(fullText);
    addCodeCopyButtons(assistantUI.bubble);
    addAssistantActions(assistantUI.inner, fullText);

    state.current.messages.push({ role: "assistant", content: fullText });
    saveCurrent();
  } catch (error) {
    assistantUI.bubble.textContent = `Error: ${error.message}`;
    toast("Nexus couldn't complete the request.");
  } finally {
    state.streaming = false;
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
document.getElementById("newChatBtn").onclick = newChat;
document.getElementById("clearBtn").onclick = clearCurrent;
document.getElementById("clearHistoryBtn").onclick = clearAllHistory;

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

document.addEventListener("click", async e => {
  const button = e.target.closest("[data-copy]");
  if (!button) return;

  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    const old = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => button.textContent = old, 1200);
  } catch {
    toast("Copy failed. Please copy manually.");
  }
});

state.current.id = crypto.randomUUID();
renderHistory();
resizeInput();
