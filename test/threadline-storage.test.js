"use strict";

// These tests load the real browser script into an isolated VM with mocked
// browser APIs. No real browser profile, storage, network, or API is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const scriptPath = path.join(__dirname, "..", "script.js");
const scriptSource = fs.readFileSync(scriptPath, "utf8");

function makeElement(id = "") {
  const classes = new Set();
  const element = {
    id,
    value: "",
    textContent: "",
    title: "",
    disabled: false,
    style: {},
    dataset: {},
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
    children: [],
    listeners: {},
    get lastElementChild() { return this.children.at(-1) || null; },
    setAttribute() {},
    removeAttribute() {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    querySelectorAll() { return []; },
    querySelector() { return makeElement(); },
    focus() {},
    resetCount: 0,
    reset() { this.resetCount += 1; this.value = ""; },
    remove() {},
    getBoundingClientRect() { return { right: 0, top: 0 }; },
    getClientRects() { return [1]; },
    contains() { return false; },
    isConnected: true
  };
  return element;
}

function makeHarness(initialThreadlineValue = null) {
  const elements = new Map();
  for (const id of ["itemType", "itemTitle", "itemContent"]) {
    elements.set(id, makeElement(id));
  }
  elements.get("itemType").value = "memory";
  const storage = new Map([["nexus_chats", "[]"]]);
  if (initialThreadlineValue !== null) storage.set("nexus_threadline_v1", initialThreadlineValue);
  let rejectNextWrite = false;
  let writeAttempts = 0;
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      writeAttempts += 1;
      if (rejectNextWrite) {
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
  const context = vm.createContext({
    document,
    localStorage,
    crypto: { randomUUID: (() => { let id = 0; return () => `mock-id-${++id}`; })() },
    structuredClone: value => JSON.parse(JSON.stringify(value)),
    marked: { setOptions() {}, parse: value => value },
    DOMPurify: { sanitize: value => value },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { innerWidth: 1024, innerHeight: 768 },
    setTimeout() { return 0; },
    clearTimeout() {},
    fetch: async () => { throw new Error("Network access is disabled in this test harness."); },
    confirm: () => true,
    prompt: () => null,
    console: { log() {} }
  });

  vm.runInContext(scriptSource, context, { filename: "script.js" });
  return {
    context,
    elements,
    storage,
    getWriteAttempts() { return writeAttempts; },
    failNextWrite() { rejectNextWrite = true; },
    expression(source) { return vm.runInContext(source, context); }
  };
}

function validItem(overrides = {}) {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "item-1", type: "commitment", title: "Original title", content: "Original content",
    createdAt: now, updatedAt: now, status: "active", provenance: "user_confirmed",
    confirmedAt: now, source: null, deferredUntil: null, completedAt: null,
    archivedAt: null, validAsOf: null, tags: [], ...overrides
  };
}

function putFormValues(harness, { type = "commitment", title, content }) {
  harness.elements.get("itemType").value = type;
  harness.elements.get("itemTitle").value = title;
  harness.elements.get("itemContent").value = content;
}

test("create rolls back memory, preserves stored value, and reports write failure", () => {
  const harness = makeHarness(JSON.stringify({ version: 1, items: [] }));
  const originalStoredValue = harness.storage.get("nexus_threadline_v1");
  putFormValues(harness, { title: "New item", content: "New content" });
  harness.expression("state.threadlineDraft = { itemId: null, source: null }");
  harness.failNextWrite();

  harness.expression("saveThreadlineForm({ preventDefault() {} })");

  assert.equal(harness.expression("state.threadline.items.length"), 0);
  assert.equal(harness.storage.get("nexus_threadline_v1"), originalStoredValue);
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
  assert.equal(harness.elements.get("threadlineForm").resetCount, 0);
});

test("edit restores all original fields and preserves storage after write failure", () => {
  const original = validItem();
  const originalStoredValue = JSON.stringify({ version: 1, items: [original] });
  const harness = makeHarness(originalStoredValue);
  const before = harness.expression("JSON.stringify(state.threadline.items[0])");
  putFormValues(harness, { type: "decision", title: "Changed title", content: "Changed content" });
  harness.expression("state.threadlineDraft = { itemId: 'item-1', source: null }");
  harness.failNextWrite();

  harness.expression("saveThreadlineForm({ preventDefault() {} })");

  assert.equal(harness.expression("JSON.stringify(state.threadline.items[0])"), before);
  assert.equal(harness.storage.get("nexus_threadline_v1"), originalStoredValue);
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
});

test("status mutation restores status and timestamps after write failure", () => {
  const original = validItem({ deferredUntil: "2026-02-01T00:00:00.000Z" });
  const originalStoredValue = JSON.stringify({ version: 1, items: [original] });
  const harness = makeHarness(originalStoredValue);
  const before = harness.expression("JSON.stringify(state.threadline.items[0])");
  harness.failNextWrite();

  harness.expression("updateThreadlineStatus(state.threadline.items[0], 'completed')");

  assert.equal(harness.expression("JSON.stringify(state.threadline.items[0])"), before);
  assert.equal(harness.storage.get("nexus_threadline_v1"), originalStoredValue);
  assert.match(harness.elements.get("toast").textContent, /could not be saved/i);
});

test("a later mutation succeeds after a one-time write failure", () => {
  const harness = makeHarness(JSON.stringify({ version: 1, items: [] }));
  putFormValues(harness, { title: "Retry item", content: "Retry content" });
  harness.expression("state.threadlineDraft = { itemId: null, source: null }");
  harness.failNextWrite();
  harness.expression("saveThreadlineForm({ preventDefault() {} })");
  assert.equal(harness.expression("state.threadline.items.length"), 0);

  putFormValues(harness, { title: "Retry item", content: "Retry content" });
  harness.expression("saveThreadlineForm({ preventDefault() {} })");

  assert.equal(harness.expression("state.threadline.items.length"), 1);
  assert.equal(JSON.parse(harness.storage.get("nexus_threadline_v1")).items[0].title, "Retry item");
  assert.match(harness.elements.get("toast").textContent, /saved/i);
});

for (const [label, storedValue] of [
  ["malformed JSON", "{"],
  ["unsupported version", JSON.stringify({ version: 2, items: [] })],
  ["invalid envelope", JSON.stringify({ version: 1, items: "invalid" })],
  ["invalid item", JSON.stringify({ version: 1, items: [{ id: "bad" }] })]
]) {
  test(`read-only ${label} data remains unchanged and blocks writes`, () => {
    const harness = makeHarness(storedValue);
    putFormValues(harness, { title: "Must not save", content: "Must remain blocked" });
    harness.expression("state.threadlineDraft = { itemId: null, source: null }");

    harness.expression("saveThreadlineForm({ preventDefault() {} })");
    harness.expression("updateThreadlineStatus({ id: 'missing' }, 'completed')");

    assert.equal(harness.storage.get("nexus_threadline_v1"), storedValue);
    assert.equal(harness.getWriteAttempts(), 0);
    assert.equal(harness.expression("state.threadline.items.length"), 0);
    assert.notEqual(harness.expression("state.threadline.loadStatus"), "ready");
    assert.match(harness.elements.get("toast").textContent, /preserved|read-only/i);
  });
}
