"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { TextDecoder, TextEncoder } = require("node:util");

const scriptPath = path.join(__dirname, "..", "script.js");
const scriptSource = fs.readFileSync(scriptPath, "utf8");

function makeElement(id = "") {
  const classes = new Set();
  const attributes = {};
  const element = {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    title: "",
    disabled: false,
    style: {},
    dataset: {},
    attributes,
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      toggle(name, force) {
        if (force === undefined) force = !classes.has(name);
        if (force) classes.add(name); else classes.delete(name);
        return force;
      },
      contains(name) { return classes.has(name); }
    },
    set className(val) {
      classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    },
    get className() { return [...classes].join(" "); },
    children: [],
    listeners: {},
    parentElement: null,
    get lastElementChild() { return this.children.at(-1) || null; },
    setAttribute(name, val) { attributes[name] = val; },
    removeAttribute(name) { delete attributes[name]; },
    append(...children) {
      children.forEach(child => {
        child.parentElement = this;
        this.children.push(child);
      });
    },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    querySelectorAll(selector) {
      if (selector === ".message") {
        return this.children.filter(c => c.classList && c.classList.contains("message"));
      }
      return [];
    },
    querySelector() { return makeElement(); },
    focus() {},
    resetCount: 0,
    reset() { this.resetCount += 1; this.value = ""; },
    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      }
    },
    get scrollHeight() { return 0; },
    get scrollTop() { return 0; },
    set scrollTop(val) {},
    getBoundingClientRect() { return { right: 0, top: 0 }; },
    getClientRects() { return [1]; },
    contains() { return false; },
    isConnected: true
  };
  return element;
}

function makeReader(chunks) {
  let index = 0;
  return {
    async read() {
      if (index >= chunks.length) return { value: undefined, done: true };
      return { value: chunks[index++], done: false };
    },
    async cancel() {}
  };
}

function makeHarness({
  initialChats = null,
  throwOnGet = false,
  responseFactory = null
} = {}) {
  const elements = new Map();
  const storage = new Map();
  if (initialChats !== null) {
    storage.set("nexus_chats", initialChats);
  } else {
    storage.set("nexus_chats", "[]");
  }

  let rejectNextWrite = false;
  let writeAttempts = 0;

  const localStorage = {
    getItem(key) {
      if (key === "nexus_chats" && throwOnGet) {
        throw new Error("mock storage read failure");
      }
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      if (key === "nexus_chats") writeAttempts += 1;
      if (rejectNextWrite && key === "nexus_chats") {
        rejectNextWrite = false;
        throw new Error("mock storage write failure");
      }
      storage.set(key, String(value));
    }
  };

  const document = {
    activeElement: makeElement("active"),
    documentElement: { dataset: {}, setAttribute() {} },
    body: makeElement("body"),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) { return makeElement(tag); },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  let promptResponse = null;
  let confirmResponse = true;

  const context = vm.createContext({
    document,
    localStorage,
    crypto: { randomUUID: (() => { let id = 0; return () => `test-id-${++id}`; })() },
    structuredClone: value => JSON.parse(JSON.stringify(value)),
    marked: { setOptions() {}, parse: value => value },
    DOMPurify: { sanitize: value => value },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { innerWidth: 1024, innerHeight: 768 },
    TextDecoder,
    TextEncoder,
    setTimeout() { return 0; },
    clearTimeout() {},
    fetch: async (...args) => {
      if (responseFactory) return responseFactory(...args);
      throw new Error("Network access is disabled in this test harness.");
    },
    confirm: () => confirmResponse,
    prompt: () => promptResponse,
    console: { log() {} }
  });

  vm.runInContext(scriptSource, context, { filename: "script.js" });

  return {
    context,
    elements,
    storage,
    getWriteAttempts() { return writeAttempts; },
    failNextWrite() { rejectNextWrite = true; },
    setPrompt(val) { promptResponse = val; },
    setConfirm(val) { confirmResponse = val; },
    run(code) { return vm.runInContext(code, context); }
  };
}

test("malformed JSON at startup initializes safely, preserves raw storage, and blocks writes", () => {
  const malformed = "{invalid-json";
  const harness = makeHarness({ initialChats: malformed });

  assert.equal(harness.run("state.chatStorage.loadStatus"), "invalid-json");
  assert.equal(harness.run("state.chats.length"), 0);
  assert.equal(harness.storage.get("nexus_chats"), malformed);

  const saveResult = harness.run("saveChats()");
  assert.equal(saveResult.saved, false);
  assert.equal(harness.storage.get("nexus_chats"), malformed);
  assert.equal(harness.getWriteAttempts(), 0);
  assert.match(harness.elements.get("toast").textContent, /malformed|read-only/i);
});

test("unsupported schema (non-array) at startup preserves raw storage and enters read-only mode", () => {
  const nonArray = JSON.stringify({ notAnArray: true });
  const harness = makeHarness({ initialChats: nonArray });

  assert.equal(harness.run("state.chatStorage.loadStatus"), "unsupported");
  assert.equal(harness.run("state.chats.length"), 0);
  assert.equal(harness.storage.get("nexus_chats"), nonArray);

  const saveResult = harness.run("saveCurrent()");
  assert.equal(saveResult.saved, false);
  assert.equal(harness.storage.get("nexus_chats"), nonArray);
  assert.equal(harness.getWriteAttempts(), 0);
});

test("invalid chat items at startup preserve raw storage and enter read-only mode", () => {
  const invalidItems = JSON.stringify([{ id: 123, messages: "not an array" }]);
  const harness = makeHarness({ initialChats: invalidItems });

  assert.equal(harness.run("state.chatStorage.loadStatus"), "invalid-items");
  assert.equal(harness.run("state.chats.length"), 0);
  assert.equal(harness.storage.get("nexus_chats"), invalidItems);

  const saveResult = harness.run("persistChats()");
  assert.equal(saveResult.saved, false);
  assert.equal(harness.storage.get("nexus_chats"), invalidItems);
  assert.equal(harness.getWriteAttempts(), 0);
});

test("localStorage.getItem throwing at startup does not crash app and disables mutations", () => {
  const harness = makeHarness({ throwOnGet: true });

  assert.equal(harness.run("state.chatStorage.loadStatus"), "unavailable");
  assert.equal(harness.run("Array.isArray(state.chats)"), true);
  assert.equal(harness.run("state.chats.length"), 0);

  harness.run("state.current.messages.push({ role: 'user', content: 'test message' })");
  const saveResult = harness.run("saveCurrent()");
  assert.equal(saveResult.saved, false);
  assert.match(harness.elements.get("toast").textContent, /read-only|could not be read/i);
});

test("setItem failure during renameChat rolls back title and reports failure", () => {
  const initial = [{ id: "chat-1", title: "Original Title", messages: [{ role: "user", content: "hi" }] }];
  const harness = makeHarness({ initialChats: JSON.stringify(initial) });

  harness.setPrompt("Renamed Title");
  harness.failNextWrite();

  harness.run("renameChat('chat-1')");

  assert.equal(harness.run("state.chats[0].title"), "Original Title");
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
  assert.doesNotMatch(harness.elements.get("toast").textContent, /Conversation renamed/i);
});

test("setItem failure during deleteChat rolls back state.chats and active chat", () => {
  const initial = [{ id: "chat-1", title: "My Chat", messages: [{ role: "user", content: "hi" }] }];
  const harness = makeHarness({ initialChats: JSON.stringify(initial) });

  harness.run("state.current = state.chats[0]");
  harness.failNextWrite();

  harness.run("deleteChat('chat-1')");

  assert.equal(harness.run("state.chats.length"), 1);
  assert.equal(harness.run("state.chats[0].id"), "chat-1");
  assert.equal(harness.run("state.current.id"), "chat-1");
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
  assert.doesNotMatch(harness.elements.get("toast").textContent, /Conversation deleted/i);
});

test("setItem failure during clearAllHistory preserves all chats and active chat", () => {
  const initial = [
    { id: "chat-1", title: "Chat 1", messages: [{ role: "user", content: "1" }] },
    { id: "chat-2", title: "Chat 2", messages: [{ role: "user", content: "2" }] }
  ];
  const harness = makeHarness({ initialChats: JSON.stringify(initial) });

  harness.run("state.current = state.chats[0]");
  harness.failNextWrite();

  harness.run("clearAllHistory()");

  assert.equal(harness.run("state.chats.length"), 2);
  assert.equal(harness.run("state.current.id"), "chat-1");
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
  assert.doesNotMatch(harness.elements.get("toast").textContent, /All conversations deleted/i);
});

test("setItem failure during clearCurrent preserves messages and stored chat", () => {
  const initial = [{ id: "chat-1", title: "Chat 1", messages: [{ role: "user", content: "important notes" }] }];
  const harness = makeHarness({ initialChats: JSON.stringify(initial) });

  harness.run("loadChat('chat-1')");
  assert.equal(harness.run("state.current.messages.length"), 1);

  harness.failNextWrite();
  harness.run("clearCurrent()");

  assert.equal(harness.run("state.chats.length"), 1);
  assert.equal(harness.run("state.current.messages.length"), 1);
  assert.equal(harness.run("state.current.messages[0].content"), "important notes");
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
  assert.doesNotMatch(harness.elements.get("toast").textContent, /Current conversation cleared/i);
});

test("setItem failure during saveCurrent restores array and shared references (aliasing)", () => {
  const initial = [{ id: "chat-1", title: "Original Title", messages: [{ role: "user", content: "first" }] }];
  const initialJson = JSON.stringify(initial);
  const harness = makeHarness({ initialChats: initialJson });

  // Simulate explicit aliasing where state.current is the exact same object reference as state.chats[0]
  harness.run("state.current = state.chats[0]");
  assert.equal(harness.run("state.current === state.chats[0]"), true);

  // Add completed assistant response to state.current
  harness.run("state.current.messages.push({ role: 'assistant', content: 'completed assistant response' })");

  // Fail write on saveCurrent
  harness.failNextWrite();
  const result = harness.run("saveCurrent()");

  assert.equal(result.saved, false);

  // 1. Persisted nexus_chats value is unchanged
  assert.equal(harness.storage.get("nexus_chats"), initialJson);

  // 2. The corresponding entry in state.chats retains its original title and messages
  assert.equal(harness.run("state.chats[0].title"), "Original Title");
  assert.equal(harness.run("state.chats[0].messages.length"), 1);
  assert.equal(harness.run("state.chats[0].messages[0].content"), "first");

  // 3. The active state.current still contains the latest user-visible conversation and completed assistant response
  assert.equal(harness.run("state.current.messages.length"), 2);
  assert.equal(harness.run("state.current.messages[0].content"), "first");
  assert.equal(harness.run("state.current.messages[1].content"), "completed assistant response");

  // 4. Unsaved changes in state.current do not mutate the restored state.chats entry through a shared reference (detached)
  assert.equal(harness.run("state.current !== state.chats[0]"), true);
  harness.run("state.current.messages.push({ role: 'user', content: 'another unsaved message' })");
  assert.equal(harness.run("state.chats[0].messages.length"), 1);
  assert.equal(harness.run("state.current.messages.length"), 3);

  // 5. The next successful save persists the current conversation correctly
  const retryResult = harness.run("saveCurrent()");
  assert.equal(retryResult.saved, true);
  const persisted = JSON.parse(harness.storage.get("nexus_chats"));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].messages.length, 3);
  assert.equal(persisted[0].messages[1].content, "completed assistant response");
  assert.equal(persisted[0].messages[2].content, "another unsaved message");
  assert.equal(harness.run("state.chats[0].messages.length"), 3);
});

test("clearCurrent in read-only mode preserves unsaved conversation when user cancels", () => {
  const harness = makeHarness({ initialChats: "{malformed" });
  assert.equal(harness.run("state.chatStorage.loadStatus"), "invalid-json");

  harness.run("state.current.messages.push({ role: 'user', content: 'Unsaved draft in read-only' })");
  assert.equal(harness.run("state.current.messages.length"), 1);

  // User cancels confirmation
  harness.setConfirm(false);
  harness.run("clearCurrent()");
  assert.equal(harness.run("state.current.messages.length"), 1);
  assert.equal(harness.run("state.current.messages[0].content"), "Unsaved draft in read-only");

  // User confirms
  harness.setConfirm(true);
  harness.run("clearCurrent()");
  assert.equal(harness.run("state.current.messages.length"), 0);
});

test("aliasing rollback during renameChat when state.current references state.chats[0]", () => {
  const initial = [{ id: "chat-1", title: "Original Title", messages: [{ role: "user", content: "msg" }] }];
  const harness = makeHarness({ initialChats: JSON.stringify(initial) });

  harness.run("state.current = state.chats[0]");
  assert.equal(harness.run("state.current === state.chats[0]"), true);

  harness.setPrompt("Attempted Renamed Title");
  harness.failNextWrite();

  harness.run("renameChat('chat-1')");

  assert.equal(harness.run("state.chats[0].title"), "Original Title");
  assert.equal(harness.run("state.current.title"), "Original Title");
  assert.equal(harness.run("state.current !== state.chats[0]"), true);
});

test("newChat preserves current conversation and warns if saveCurrent fails", () => {
  const harness = makeHarness({ initialChats: "[]" });

  harness.run("state.current.messages.push({ role: 'user', content: 'Unsaved ideas' })");
  assert.equal(harness.run("state.current.messages.length"), 1);

  harness.failNextWrite();
  harness.run("newChat()");

  assert.equal(harness.run("state.current.messages.length"), 1);
  assert.equal(harness.run("state.current.messages[0].content"), "Unsaved ideas");
  assert.match(harness.elements.get("toast").textContent, /remains open|could not be saved/i);
});

test("completed streamed assistant response is preserved and controls restored when persistence fails", async () => {
  const chunks = [
    new TextEncoder().encode('data: {"choices":[{"delta":{"content":"High value analysis."}}]}\n\n'),
    new TextEncoder().encode("data: [DONE]\n\n")
  ];

  const harness = makeHarness({
    initialChats: "[]",
    responseFactory: async () => ({
      ok: true,
      body: { getReader: () => makeReader(chunks) }
    })
  });

  harness.elements.get("modelSelect").value = "openrouter/free";
  harness.failNextWrite();

  await harness.run("sendMessage('Tell me something important')");

  // Retrieve assistant bubble
  const chatChildren = harness.elements.get("chat").children;
  const assistantMsg = chatChildren.find(el => el.classList && el.classList.contains("assistant"));
  assert.ok(assistantMsg, "Assistant message container should exist");

  const bubble = assistantMsg.children.flatMap(c => c.children).find(el => el.classList && el.classList.contains("message-bubble"));
  assert.ok(bubble, "Message bubble should exist");

  // Verify answer is rendered and not replaced with an error state
  assert.equal(bubble.classList.contains("error-state"), false);
  assert.match(bubble.innerHTML, /High value analysis\./);

  // Verify message in state.current.messages
  const currentMsgs = harness.run("state.current.messages");
  assert.equal(currentMsgs.length, 2);
  assert.equal(currentMsgs[1].role, "assistant");
  assert.equal(currentMsgs[1].content, "High value analysis.");

  // Verify toast does not report API request failure
  assert.doesNotMatch(harness.elements.get("toast").textContent, /Nexus couldn't complete the request/i);

  // Verify stream controls restored
  assert.equal(harness.run("state.streaming"), false);
  assert.equal(harness.elements.get("sendBtn").disabled, false);
});

test("temporary storage write failure rolls back, and subsequent retry succeeds", () => {
  const harness = makeHarness({ initialChats: "[]" });

  harness.run("state.current.messages.push({ role: 'user', content: 'Retryable note' })");

  // 1st attempt: fails
  harness.failNextWrite();
  const firstResult = harness.run("saveCurrent()");
  assert.equal(firstResult.saved, false);
  assert.equal(harness.run("state.chats.length"), 0);

  // 2nd attempt: succeeds
  const secondResult = harness.run("saveCurrent()");
  assert.equal(secondResult.saved, true);
  assert.equal(harness.run("state.chats.length"), 1);

  const stored = JSON.parse(harness.storage.get("nexus_chats"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].messages[0].content, "Retryable note");
});
