function loadChats() {
  const empty = (loadStatus, loadMessage, rawStoredValue = null, invalidItemCount = 0) => ({
    chats: [], loadStatus, loadMessage, rawStoredValue, invalidItemCount
  });
  let raw;
  try {
    raw = localStorage.getItem("nexus_chats");
  } catch {
    return empty("unavailable", "Chat history storage could not be read. Mutations are disabled to protect existing data.");
  }

  if (raw === null) return empty("ready", "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty("invalid-json", "Stored chat history is malformed. It has been preserved; editing is disabled. Do not clear browser data before recovery.", raw);
  }

  if (!Array.isArray(parsed)) {
    return empty("unsupported", "Stored chat history uses an unsupported format. It has been preserved; editing is disabled. Do not clear browser data before recovery.", raw);
  }

  const isValidMessage = msg => (
    Boolean(msg && typeof msg === "object" && !Array.isArray(msg) &&
    typeof msg.role === "string" && typeof msg.content === "string")
  );

  const isValidChat = chat => {
    if (!chat || typeof chat !== "object" || Array.isArray(chat)) return false;
    if (typeof chat.id !== "string" || !chat.id.trim()) return false;
    if (chat.title !== undefined && typeof chat.title !== "string") return false;
    if (!Array.isArray(chat.messages)) return false;
    return chat.messages.every(isValidMessage);
  };

  const validity = parsed.map(isValidChat);
  if (validity.some(isValid => !isValid)) {
    const invalidCount = validity.filter(isValid => !isValid).length;
    return empty("invalid-items", `Stored chat history contains ${invalidCount} invalid conversation(s). The original data is preserved; editing is disabled. Request deliberate recovery before replacing it.`, raw, invalidCount);
  }

  return { chats: parsed, loadStatus: "ready", loadMessage: "", rawStoredValue: null, invalidItemCount: 0 };
}

const chatStorage = loadChats();
let lastPersistedChats = chatStorage.loadStatus === "ready" ? structuredClone(chatStorage.chats.slice(-30)) : [];

function getPersistedChatsSnapshot() {
  try {
    const raw = localStorage.getItem("nexus_chats");
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-30);
    }
  } catch {}
  return lastPersistedChats;
}

const state = {
  chats: chatStorage.chats,
  chatStorage,
  current: { id: crypto.randomUUID(), title: "New chat", messages: [] },
  streaming: false,
  threadline: loadThreadline(),
  threadlineDraft: null,
  threadlineReturnFocus: null
};

function loadThreadline() {
  const empty = (loadStatus, loadMessage, rawStoredValue = null, invalidItemCount = 0) => ({
    version: 1, items: [], loadStatus, loadMessage, rawStoredValue, invalidItemCount
  });
  let raw;
  try {
    raw = localStorage.getItem("nexus_threadline_v1");
  } catch {
    return empty("unavailable", "Threadline storage could not be read. Mutations are disabled to protect existing data.");
  }

  if (raw === null) return empty("ready", "");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return empty("invalid-json", "Stored Threadline data is malformed. It has been preserved; editing is disabled. Do not clear browser data before recovery.", raw); }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== 1) {
    return empty("unsupported", "Stored Threadline data uses an unsupported schema. It has been preserved; editing is disabled. Do not clear browser data before recovery.", raw);
  }
  if (!Array.isArray(parsed.items)) {
    return empty("invalid-envelope", "Stored Threadline data has an invalid items list. It has been preserved; editing is disabled. Do not clear browser data before recovery.", raw);
  }

  const validTypes = new Set(["memory", "decision", "commitment", "open_question"]);
  const validStatuses = new Set(["active", "deferred", "completed", "archived"]);
  const validProvenance = new Set(["user_confirmed", "ai_suggested"]);
  const isTimestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  const isNullableTimestamp = value => value === null || isTimestamp(value);
  const validSource = source => source === undefined || source === null || (source && typeof source === "object" && !Array.isArray(source) &&
    typeof source.chatId === "string" && source.chatId.length > 0 &&
    (source.chatTitle === undefined || typeof source.chatTitle === "string") &&
    (source.role === "user" || source.role === "assistant") &&
    (source.messageId === undefined || source.messageId === null || typeof source.messageId === "string") &&
    (source.messageIndex === undefined || source.messageIndex === null || (Number.isInteger(source.messageIndex) && source.messageIndex >= 0)) &&
    typeof source.excerpt === "string" && source.excerpt.length <= 240);
  const ids = new Set();
  const isValidItem = item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 128 || ids.has(item.id)) return false;
    if (!validTypes.has(item.type) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 120 ||
        typeof item.content !== "string" || !item.content.trim() || item.content.length > 4000 ||
        !isTimestamp(item.createdAt) || !isTimestamp(item.updatedAt) || !validStatuses.has(item.status) ||
        !validProvenance.has(item.provenance) || !isNullableTimestamp(item.confirmedAt) ||
        !isNullableTimestamp(item.deferredUntil) || !isNullableTimestamp(item.completedAt) ||
        !isNullableTimestamp(item.archivedAt) || !isNullableTimestamp(item.validAsOf) ||
        !validSource(item.source) || !Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === "string")) return false;
    ids.add(item.id);
    return true;
  };
  const itemValidity = parsed.items.map(isValidItem);
  if (itemValidity.some(isValid => !isValid)) {
    const invalidItemCount = itemValidity.filter(isValid => !isValid).length;
    return empty("invalid-items", `Stored Threadline data contains ${invalidItemCount} invalid item(s). The original data is preserved; editing is disabled. Request deliberate recovery before replacing it.`, raw, invalidItemCount);
  }
  return { version: 1, items: parsed.items, loadStatus: "ready", loadMessage: "", rawStoredValue: null, invalidItemCount: 0 };
}

const chatEl = document.getElementById("chat");
const welcomeEl = document.getElementById("welcome");
const inputEl = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const historyList = document.getElementById("historyList");
const modelSelect = document.getElementById("modelSelect");
const toastEl = document.getElementById("toast");
const sidebarEl = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const menuBtn = document.getElementById("menuBtn");
const themeToggle = document.getElementById("themeToggle");
const settingsModal = document.getElementById("settingsModal");
let settingsReturnFocus = null;

function applyTheme(theme, persist = false) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  document.querySelector('meta[name="theme-color"]').content = nextTheme === "dark" ? "#09111d" : "#f3f7fb";
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme === "dark" ? "light" : "dark"} theme`);
  themeToggle.title = `Switch to ${nextTheme === "dark" ? "light" : "dark"} theme`;
  themeToggle.querySelector(".theme-icon").textContent = nextTheme === "dark" ? "☼" : "☾";
  if (persist) localStorage.setItem("nexus_theme", nextTheme);
}

function setSidebarOpen(open) {
  sidebarEl.classList.toggle("open", open);
  sidebarBackdrop.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
}

function focusableElements(container) {
  return [...container.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter(element => element.getClientRects().length > 0);
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  if (settingsReturnFocus?.isConnected) settingsReturnFocus.focus();
}

const threadlineWorkspace = document.getElementById("threadlineWorkspace");
const threadlineItemModal = document.getElementById("threadlineItemModal");
const threadlineForm = document.getElementById("threadlineForm");

function persistThreadline() {
  if (state.threadline.loadStatus !== "ready") {
    toast(state.threadline.loadMessage || "Threadline is read-only to protect stored data.");
    return { saved: false, rendered: false };
  }
  try {
    localStorage.setItem("nexus_threadline_v1", JSON.stringify({ version: 1, items: state.threadline.items }));
  } catch {
    toast("Threadline could not be saved. Your changes were not saved; retry when browser storage is available.");
    return { saved: false, rendered: false };
  }
  try { renderThreadline(); return { saved: true, rendered: true }; }
  catch { return { saved: true, rendered: false }; }
}

function formatThreadlineType(type) {
  return ({ memory: "Memory", decision: "Decision", commitment: "Commitment", open_question: "Open question" })[type] || "Memory";
}

function isThreadlineSourceAvailable(source) {
  const chat = state.current.id === source.chatId ? state.current : state.chats.find(entry => entry.id === source.chatId);
  if (!chat || !Array.isArray(chat.messages)) return false;
  return chat.messages.some((message, index) => {
    if (source.messageId && message.id === source.messageId) return true;
    return index === source.messageIndex && message.role === source.role && message.content.slice(0, 240) === source.excerpt;
  });
}

function renderThreadline() {
  const list = document.getElementById("threadlineList");
  const count = document.getElementById("threadlineCount");
  const canMutate = state.threadline.loadStatus === "ready";
  count.textContent = canMutate ? String(state.threadline.items.filter(item => item.status !== "archived").length) : "!";
  count.title = canMutate ? "Unarchived Threadline items" : state.threadline.loadMessage;
  list.replaceChildren();
  document.getElementById("newThreadlineItem").disabled = !canMutate;
  document.getElementById("threadlineForm").querySelectorAll("input, textarea, select, button[type='submit']").forEach(control => { control.disabled = !canMutate; });
  if (!canMutate) {
    const message = document.createElement("div");
    message.className = "threadline-empty";
    message.setAttribute("role", "alert");
    message.textContent = state.threadline.loadMessage;
    list.appendChild(message);
    return;
  }
  const query = document.getElementById("threadlineSearch").value.trim().toLocaleLowerCase();
  const type = document.getElementById("threadlineTypeFilter").value;
  const status = document.getElementById("threadlineStatusFilter").value;
  const items = [...state.threadline.items].filter(item => {
    const matchesQuery = !query || `${item.title} ${item.content}`.toLocaleLowerCase().includes(query);
    return matchesQuery && (type === "all" || item.type === type) && (status === "all" || item.status === status);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "threadline-empty";
    empty.textContent = state.threadline.items.length ? "No items match these filters." : "Your Threadline is ready. Add an item or save a message from a conversation.";
    list.appendChild(empty);
    return;
  }
  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "threadline-card";
    const head = document.createElement("div"); head.className = "threadline-card-head";
    const typeBadge = document.createElement("span"); typeBadge.className = "threadline-badge"; typeBadge.textContent = formatThreadlineType(item.type);
    const statusBadge = document.createElement("span"); statusBadge.className = "threadline-badge"; statusBadge.textContent = item.status[0].toUpperCase() + item.status.slice(1);
    head.append(typeBadge, statusBadge);
    const title = document.createElement("h2"); title.textContent = item.title;
    const content = document.createElement("p"); content.className = "threadline-content"; content.textContent = item.content;
    const meta = document.createElement("div"); meta.className = "threadline-meta";
    const created = document.createElement("span"); created.textContent = `Created ${new Date(item.createdAt).toLocaleString()}`;
    const provenance = document.createElement("span"); provenance.textContent = item.provenance === "user_confirmed" ? "User saved · not independently verified" : "AI suggestion · unconfirmed";
    meta.append(created, provenance);
    card.append(head, title, content, meta);
    if (item.source) {
      const source = document.createElement("div"); source.className = "threadline-source";
      const sourceAvailable = isThreadlineSourceAvailable(item.source);
      source.textContent = `${sourceAvailable ? `Source: ${item.source.chatTitle || "Conversation"}` : "Source unavailable (conversation or message is no longer available)"} · ${item.source.role} message · “${item.source.excerpt}”`;
      card.appendChild(source);
    }
    const actions = document.createElement("div"); actions.className = "threadline-actions";
    const addAction = (label, callback) => { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.onclick = callback; actions.appendChild(button); };
    addAction("Edit", () => openThreadlineForm(item));
    actions.lastElementChild.dataset.threadlineEditId = item.id;
    if (item.status !== "completed" && item.status !== "archived") addAction("Complete", () => {
      if (item.type === "commitment" && !confirm("Mark this commitment complete? This will only update its status.")) return;
      updateThreadlineStatus(item, "completed");
    });
    if (item.status === "active") addAction("Defer", () => updateThreadlineStatus(item, "deferred"));
    if (item.status === "deferred") addAction("Resume", () => updateThreadlineStatus(item, "active"));
    if (item.status === "archived") addAction("Restore", () => updateThreadlineStatus(item, "active"));
    else addAction("Archive", () => updateThreadlineStatus(item, "archived"));
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function updateThreadlineStatus(item, status) {
  const previous = structuredClone(item);
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (status === "completed") item.completedAt = item.updatedAt;
  if (status === "archived") item.archivedAt = item.updatedAt;
  if (status === "active") { item.archivedAt = null; item.completedAt = null; }
  const result = persistThreadline();
  if (!result.saved) Object.assign(item, previous);
  else if (!result.rendered) toast("Status saved, but Threadline could not refresh. Reopen the workspace to refresh it.");
}

function openThreadline() {
  state.threadlineReturnFocus = document.activeElement;
  threadlineWorkspace.classList.remove("hidden");
  renderThreadline();
  document.getElementById("threadlineSearch").focus();
}
function closeThreadline() {
  threadlineWorkspace.classList.add("hidden");
  if (state.threadlineReturnFocus?.isConnected) state.threadlineReturnFocus.focus();
  else document.getElementById("threadlineBtn").focus();
}

function openThreadlineForm(item = null, source = null) {
  if (state.threadline.loadStatus !== "ready") { toast(state.threadline.loadMessage); return; }
  state.threadlineDraft = { itemId: item?.id || null, source };
  state.threadlineFormReturnFocus = document.activeElement;
  document.getElementById("threadlineFormTitle").textContent = item ? "Edit Threadline item" : "New Threadline item";
  document.getElementById("itemType").value = item?.type || "memory";
  document.getElementById("itemTitle").value = item?.title || (source ? `${source.role === "user" ? "Your note" : "Nexus response"}` : "");
  document.getElementById("itemContent").value = item?.content || source?.content || "";
  document.getElementById("itemSourcePreview").textContent = item?.source ? `Source: ${item.source.chatTitle || "Conversation"} · ${item.source.role} message · ${item.source.excerpt}` : source ? `Source: ${state.current.title || "Current conversation"} · ${source.role} message. Saving this excerpt does not independently verify it.` : "";
  document.getElementById("threadlineFormError").textContent = "";
  threadlineItemModal.classList.remove("hidden");
  document.getElementById("itemTitle").focus();
}

function closeThreadlineForm(fallbackFocus = null) {
  threadlineItemModal.classList.add("hidden");
  const focusTarget = fallbackFocus?.isConnected ? fallbackFocus : state.threadlineFormReturnFocus?.isConnected ? state.threadlineFormReturnFocus : null;
  focusTarget?.focus();
}

function saveThreadlineForm(event) {
  event.preventDefault();
  if (state.threadline.loadStatus !== "ready") { toast(state.threadline.loadMessage); return; }
  const title = document.getElementById("itemTitle").value.trim();
  const content = document.getElementById("itemContent").value.trim();
  if (!title || !content) { document.getElementById("threadlineFormError").textContent = "Add both a title and content before saving."; return; }
  const now = new Date().toISOString();
  const existing = state.threadline.items.find(item => item.id === state.threadlineDraft?.itemId);
  const previous = existing ? structuredClone(existing) : null;
  if (existing) {
    existing.type = document.getElementById("itemType").value; existing.title = title; existing.content = content; existing.updatedAt = now;
  } else {
    const source = state.threadlineDraft?.source;
    state.threadline.items.unshift({ id: crypto.randomUUID(), type: document.getElementById("itemType").value, title, content, createdAt: now, updatedAt: now, status: "active", provenance: "user_confirmed", confirmedAt: now, source: source ? { chatId: source.chatId, chatTitle: source.chatTitle, role: source.role, messageId: source.messageId, messageIndex: source.messageIndex, excerpt: source.content.slice(0, 240) } : null, deferredUntil: null, completedAt: null, archivedAt: null, validAsOf: null, tags: [] });
  }
  const result = persistThreadline();
  if (!result.saved) {
    if (existing) Object.assign(existing, previous);
    else state.threadline.items.shift();
    return;
  }
  const updatedEditButton = existing ? [...threadlineWorkspace.querySelectorAll("[data-threadline-edit-id]")].find(button => button.dataset.threadlineEditId === existing.id) : null;
  closeThreadlineForm(existing ? (updatedEditButton || document.getElementById("threadlineSearch")) : null);
  document.getElementById("threadlineForm").reset();
  toast(result.rendered ? (existing ? "Threadline item updated." : "Threadline item saved.") : "Saved, but Threadline could not refresh. Reopen the workspace to refresh it.");
}

function addMessageSaveAction(inner, message, index) {
  const button = document.createElement("button"); button.type = "button"; button.className = "action-btn"; button.textContent = "Save to Threadline";
  button.disabled = state.threadline.loadStatus !== "ready";
  button.onclick = () => openThreadlineForm(null, { chatId: state.current.id, chatTitle: state.current.title, role: message.role, content: message.content, messageId: message.id || null, messageIndex: index });
  inner.querySelector(".assistant-actions")?.appendChild(button) || (() => { const actions = document.createElement("div"); actions.className = "assistant-actions"; actions.appendChild(button); inner.appendChild(actions); })();
}

applyTheme(localStorage.getItem("nexus_theme") || "dark");

marked.setOptions({ breaks: true, gfm: true });

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function persistChats() {
  if (state.chatStorage.loadStatus !== "ready") {
    toast(state.chatStorage.loadMessage || "Chat history is read-only to protect stored data.");
    return { saved: false, reason: "read-only" };
  }
  try {
    const payload = state.chats.slice(-30);
    localStorage.setItem("nexus_chats", JSON.stringify(payload));
    lastPersistedChats = structuredClone(payload);
    return { saved: true };
  } catch (error) {
    toast("Chat history could not be saved. Storage is unavailable; retry when available.");
    return { saved: false, reason: "storage-error", error };
  }
}

function saveChats() {
  return persistChats();
}

function saveCurrent() {
  if (!state.current.messages.length) return { saved: false, reason: "empty" };
  const existingIndex = state.chats.findIndex(c => c.id === state.current.id);

  const data = { ...structuredClone(state.current), updatedAt: Date.now() };
  if (existingIndex >= 0) state.chats[existingIndex] = data;
  else state.chats.push(data);

  const result = persistChats();
  if (!result.saved) {
    state.chats = structuredClone(getPersistedChatsSnapshot());
    return result;
  }

  renderHistory();
  return result;
}

function renderHistory() {
  historyList.innerHTML = "";
  if (state.chatStorage.loadStatus !== "ready") {
    const alert = document.createElement("p");
    alert.className = "history-empty";
    alert.setAttribute("role", "alert");
    alert.textContent = state.chatStorage.loadMessage;
    historyList.appendChild(alert);
    return;
  }
  if (!state.chats.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your conversations will appear here.";
    historyList.appendChild(empty);
    return;
  }
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
  document.querySelectorAll(".chat-context-menu").forEach(el => {
    el._dismiss?.();
    el.remove();
  });

  const menu = document.createElement("div");
  menu.className = "chat-context-menu";

  const rename = document.createElement("button");
  rename.type = "button";
  rename.textContent = "✎ Rename";
  rename.onclick = () => {
    menu.remove();
    renameChat(chatId);
  };

  const remove = document.createElement("button");
  remove.type = "button";
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

  const dismissOnOutsideClick = event => {
    if (!menu.contains(event.target) && event.target !== anchor) {
      menu._dismiss();
      menu.remove();
    }
  };
  menu._dismiss = () => document.removeEventListener("click", dismissOnOutsideClick);
  document.addEventListener("click", dismissOnOutsideClick);
  menu.addEventListener("click", event => event.stopPropagation());
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      menu.remove();
      anchor.focus();
    }
  });
  menu.querySelector("button")?.focus();
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

  const prevChatTitle = chat.title;
  const isCurrentMatching = state.current.id === id;
  const prevCurrentTitle = state.current.title;

  chat.title = title;
  if (isCurrentMatching) state.current.title = title;

  const result = persistChats();
  if (!result.saved) {
    state.chats = structuredClone(getPersistedChatsSnapshot());
    if (isCurrentMatching) state.current.title = prevCurrentTitle;
    return;
  }

  renderHistory();
  toast("Conversation renamed.");
}

function deleteChat(id) {
  const chatIndex = state.chats.findIndex(c => c.id === id);
  if (chatIndex === -1) return;
  const chat = state.chats[chatIndex];

  if (!confirm(`Delete "${chat.title || "this conversation"}"?`)) return;

  state.chats = state.chats.filter(c => c.id !== id);

  const result = persistChats();
  if (!result.saved) {
    state.chats = structuredClone(getPersistedChatsSnapshot());
    return;
  }

  if (state.current.id === id) {
    state.current = { id: crypto.randomUUID(), title: "New chat", messages: [] };
    renderMessages();
  }

  renderHistory();
  toast("Conversation deleted.");
}

function clearAllHistory() {
  if (state.chatStorage.loadStatus !== "ready") {
    toast(state.chatStorage.loadMessage || "Chat history is read-only to protect stored data.");
    return;
  }
  if (!state.chats.length) {
    toast("No saved conversations.");
    return;
  }

  if (!confirm("Delete all saved conversations? This cannot be undone.")) return;

  state.chats = [];

  const result = persistChats();
  if (!result.saved) {
    state.chats = structuredClone(getPersistedChatsSnapshot());
    return;
  }

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
  setSidebarOpen(false);
}

function newChat() {
  if (state.streaming) return;
  if (state.current.messages.length) {
    const result = saveCurrent();
    if (!result.saved) {
      toast("Current conversation could not be saved to history. It remains open.");
      return;
    }
  }
  state.current = { id: crypto.randomUUID(), title: "New chat", messages: [] };
  renderMessages();
  inputEl.focus();
  setSidebarOpen(false);
}

function clearCurrent() {
  if (state.streaming) return;

  if (state.chatStorage.loadStatus !== "ready" && state.current.messages.length) {
    if (!confirm("Clear this conversation? Chat history is in read-only mode, so unsaved messages cannot be recovered.")) {
      return;
    }
  }

  const index = state.chats.findIndex(c => c.id === state.current.id);
  if (index >= 0) {
    state.chats.splice(index, 1);

    const result = persistChats();
    if (!result.saved) {
      state.chats = structuredClone(getPersistedChatsSnapshot());
      return;
    }
  }

  state.current.messages = [];
  state.current.title = "New chat";
  renderMessages();
  renderHistory();
  toast("Current conversation cleared.");
}

function renderMessages() {
  document.querySelectorAll(".message").forEach(el => el.remove());
  welcomeEl.style.display = state.current.messages.length ? "none" : "block";
  state.current.messages.forEach((m, index) => {
    if (!m.id) m.id = crypto.randomUUID();
    addMessageToUI(m.role, m.content, false, m, index);
  });
  scrollToBottom();
}

function renderMarkdown(content) {
  const raw = marked.parse(content || "");
  return DOMPurify.sanitize(raw);
}

function addMessageToUI(role, content, streaming = false, message = null, messageIndex = null) {
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
    addAssistantActions(inner, content, message || { role, content }, messageIndex);
  } else if (role === "assistant" && streaming) {
    bubble.innerHTML = typingHTML();
  } else {
    bubble.textContent = content;
    if (role === "user" && message && messageIndex !== null) addMessageSaveAction(inner, message, messageIndex);
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

function addAssistantActions(inner, content, message = { role: "assistant", content }, messageIndex = null) {
  const actions = document.createElement("div");
  actions.className = "assistant-actions";

  const copy = document.createElement("button");
  copy.className = "action-btn";
  copy.textContent = "Copy";
  copy.dataset.copy = content;

  actions.appendChild(copy);
  if (messageIndex !== null) {
    const save = document.createElement("button"); save.type = "button"; save.className = "action-btn"; save.textContent = "Save to Threadline";
    save.disabled = state.threadline.loadStatus !== "ready";
    save.onclick = () => openThreadlineForm(null, { chatId: state.current.id, chatTitle: state.current.title, role: message.role, content: message.content, messageId: message.id || null, messageIndex });
    actions.appendChild(save);
  }
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

function buildRequestContext(messages, maxMessages = 30) {
  const limit = Number.isInteger(maxMessages) && maxMessages > 0 ? maxMessages : 30;
  if (!Array.isArray(messages) || !messages.length) return [];

  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx !== -1) {
    const latestUser = { role: messages[lastUserIdx].role, content: messages[lastUserIdx].content };
    if (limit === 1) return [latestUser];

    const systemMessages = [];
    let idx = 0;
    while (idx < lastUserIdx && messages[idx]?.role === "system" && systemMessages.length < limit - 1) {
      systemMessages.push({ role: messages[idx].role, content: messages[idx].content });
      idx++;
    }

    const remainingSlots = limit - 1 - systemMessages.length;
    const precedingPool = messages.slice(idx, lastUserIdx);
    const recentPreceding = remainingSlots > 0
      ? precedingPool.slice(-remainingSlots).map(({ role, content }) => ({ role, content }))
      : [];

    return [...systemMessages, ...recentPreceding, latestUser];
  }

  const systemMessages = [];
  let idx = 0;
  while (idx < messages.length && messages[idx]?.role === "system" && systemMessages.length < limit) {
    systemMessages.push({ role: messages[idx].role, content: messages[idx].content });
    idx++;
  }

  const remainingSlots = limit - systemMessages.length;
  const recent = remainingSlots > 0
    ? messages.slice(idx).slice(-remainingSlots).map(({ role, content }) => ({ role, content }))
    : [];
  return [...systemMessages, ...recent];
}

async function sendMessage(text) {
  const prompt = text.trim();
  if (!prompt || state.streaming) return;

  if (!state.current.messages.length) {
    state.current.title = prompt.slice(0, 45) + (prompt.length > 45 ? "…" : "");
  }

  const userMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
  state.current.messages.push(userMessage);
  welcomeEl.style.display = "none";
  addMessageToUI("user", prompt, false, userMessage, state.current.messages.length - 1);
  inputEl.value = "";
  resizeInput();

  state.streaming = true;
  sendBtn.disabled = true;

  const assistantUI = addMessageToUI("assistant", "", true);
  scrollToBottom();

  let fullText = "";
  let completed = false;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelSelect.value,
        messages: buildRequestContext(state.current.messages, 30)
      })
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const data = await response.json();
        const error = data?.error;
      if (typeof error === "string" && error.trim()) {
        message = error;
      } else if (
        error &&
        typeof error === "object" &&
        typeof error.message === "string" &&
        error.message.trim()
      ) {
        message = error.message;
      }
      } catch {}
      throw new Error(message);
    }

    if (!response.body) throw new Error("Streaming is not supported by this browser.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processEvent = event => {
      if (completed) return;

      const lines = event.split("\n");
      for (const line of lines) {
        if (completed) return;
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === "[DONE]") {
          completed = true;
          try {
            reader.cancel().catch(() => {});
          } catch {}
          return;
        }

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
    };

    while (!completed) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        if (completed) break;
        processEvent(event);
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");
    if (!completed && buffer) {
      const finalEvents = buffer.split("\n\n");
      for (const event of finalEvents) {
        if (completed) break;
        if (event) processEvent(event);
      }
    }

    if (!completed) throw new Error("The response was interrupted before completion.");
    if (!fullText.trim()) throw new Error("The model returned an empty response.");

    assistantUI.wrap.removeAttribute("data-streaming");
    assistantUI.bubble.innerHTML = renderMarkdown(fullText);
    addCodeCopyButtons(assistantUI.bubble);
    const assistantMessage = { id: crypto.randomUUID(), role: "assistant", content: fullText };
    state.current.messages.push(assistantMessage);
    addAssistantActions(assistantUI.inner, fullText, assistantMessage, state.current.messages.length - 1);
    try {
      saveCurrent();
    } catch {}
  } catch (error) {
    assistantUI.bubble.classList.add("error-state");
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

async function checkBackend() {
  const status = document.getElementById("backendStatus");
  status.classList.remove("online", "offline");
  status.querySelector("strong").textContent = "Checking backend…";

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data.ok) throw new Error(data.error || "Backend unavailable.");

    status.classList.add("online");
    status.querySelector("strong").textContent =
      data.configured ? "Backend connected • API key configured" : "Backend connected • API key missing";
    toast(data.configured ? "Secure backend is ready." : "Backend is running, but the API key is missing.");
  } catch {
    status.classList.add("offline");
    status.querySelector("strong").textContent = "Backend unavailable";
    toast("Start Nexus with npm start.");
  }
}

function openSettings() {
  settingsReturnFocus = document.activeElement;
  settingsModal.classList.remove("hidden");
  document.getElementById("closeSettings").focus();
  checkBackend();
}

document.getElementById("settingsBtn").onclick = openSettings;
document.getElementById("threadlineBtn").onclick = () => { setSidebarOpen(false); openThreadline(); };
document.getElementById("closeThreadline").onclick = closeThreadline;
document.getElementById("newThreadlineItem").onclick = () => openThreadlineForm();
document.getElementById("threadlineSearch").addEventListener("input", renderThreadline);
document.getElementById("threadlineTypeFilter").addEventListener("change", renderThreadline);
document.getElementById("threadlineStatusFilter").addEventListener("change", renderThreadline);
threadlineForm.addEventListener("submit", saveThreadlineForm);
document.getElementById("closeThreadlineForm").onclick = closeThreadlineForm;
document.getElementById("cancelThreadlineForm").onclick = closeThreadlineForm;
threadlineWorkspace.addEventListener("click", event => { if (event.target === threadlineWorkspace) closeThreadline(); });
threadlineItemModal.addEventListener("click", event => { if (event.target === threadlineItemModal) closeThreadlineForm(); });
document.getElementById("closeSettings").onclick = closeSettings;
document.getElementById("newChatBtn").onclick = newChat;
document.getElementById("clearBtn").onclick = clearCurrent;
document.getElementById("clearHistoryBtn").onclick = clearAllHistory;

document.getElementById("checkBackend").onclick = checkBackend;

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

menuBtn.onclick = () => setSidebarOpen(!sidebarEl.classList.contains("open"));
document.getElementById("closeMenuBtn").onclick = () => setSidebarOpen(false);
sidebarBackdrop.onclick = () => setSidebarOpen(false);
themeToggle.onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);

settingsModal.addEventListener("click", e => {
  if (e.target === settingsModal) closeSettings();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    setSidebarOpen(false);
    if (!settingsModal.classList.contains("hidden")) closeSettings();
    if (!threadlineItemModal.classList.contains("hidden")) closeThreadlineForm();
    else if (!threadlineWorkspace.classList.contains("hidden")) closeThreadline();
    document.querySelectorAll(".chat-context-menu").forEach(el => {
      const anchor = el.previousElementSibling;
      el._dismiss?.();
      el.remove();
      anchor?.focus?.();
    });
  }

  const activeDialog = !threadlineItemModal.classList.contains("hidden") ? threadlineItemModal : !settingsModal.classList.contains("hidden") ? settingsModal : !threadlineWorkspace.classList.contains("hidden") ? threadlineWorkspace : null;
  if (e.key === "Tab" && activeDialog) {
    const focusable = focusableElements(activeDialog);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!activeDialog.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
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

renderThreadline();
