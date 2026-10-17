"use strict";

// Exercise the real browser script in a private VM. Storage, DOM, fetch, and
// stream readers are per-test mocks; no browser or network is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { TextDecoder, TextEncoder } = require("node:util");

const scriptSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function makeElement(id = "") {
  const classes = new Set();
  const element = {
    id, value: "", textContent: "", innerHTML: "", title: "", disabled: false,
    style: {}, dataset: {}, children: [], parentElement: null, attributes: {},
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
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); },
    get className() { return [...classes].join(" "); },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === "pre") return [];
      return [];
    },
    querySelector() { return makeElement(); },
    focus() {},
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    },
    get scrollHeight() { return 0; },
    get scrollTop() { return 0; },
    set scrollTop(value) {},
    getClientRects() { return [1]; },
    contains() { return false; },
    reset() {},
    isConnected: true
  };
  return element;
}

function makeReader(chunks, { failAt = -1 } = {}) {
  let index = 0;
  return {
    async read() {
      if (index === failAt) throw new Error("mock stream read failure");
      if (index >= chunks.length) return { value: undefined, done: true };
      return { value: chunks[index++], done: false };
    },
    async cancel() {}
  };
}

function makeHarness(responseFactory) {
  const elements = new Map();
  const storage = new Map([["nexus_chats", "[]"]]);
  const created = [];
  let fetchCalls = 0;
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  };
  const document = {
    activeElement: makeElement("active"),
    documentElement: { dataset: {}, setAttribute() {} },
    body: makeElement("body"),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) { const element = makeElement(tag); created.push(element); return element; },
    querySelector() { return makeElement(); },
    querySelectorAll(selector) {
      if (selector === ".message") return elements.get("chat").children.filter(element => element.classList.contains("message"));
      return [];
    },
    addEventListener() {}
  };
  const context = vm.createContext({
    document, localStorage,
    crypto: { randomUUID: (() => { let id = 0; return () => `stream-test-${++id}`; })() },
    structuredClone: value => JSON.parse(JSON.stringify(value)),
    marked: { setOptions() {}, parse: value => value },
    DOMPurify: { sanitize: value => value },
    navigator: { clipboard: { writeText: async () => {} } },
    window: { innerWidth: 1024, innerHeight: 768 },
    TextDecoder, setTimeout() { return 0; }, clearTimeout() {},
    fetch: async (...args) => {
      fetchCalls += 1;
      return responseFactory(...args);
    },
    confirm: () => true, prompt: () => null, console: { log() {} }
  });
  vm.runInContext(scriptSource, context, { filename: "script.js" });
  elements.get("modelSelect").value = "openrouter/free";

  return {
    context, elements, storage, created,
    getFetchCalls() { return fetchCalls; },
    run(source) { return vm.runInContext(source, context); },
    async send() { await vm.runInContext("sendMessage('stream test prompt')", context); },
    assistantBubble() {
      const message = elements.get("chat").children.find(element => element.classList.contains("assistant"));
      return message?.children.flatMap(child => child.children).find(element => element.classList.contains("message-bubble"));
    },
    assistantMessage() { return this.run("state.current.messages.find(message => message.role === 'assistant')"); }
  };
}

function responseWithReader(reader) {
  return { ok: true, body: { getReader: () => reader } };
}

function chunk(text) {
  return new TextEncoder().encode(text);
}

async function assertRestored(harness) {
  assert.equal(harness.run("state.streaming"), false);
  assert.equal(harness.elements.get("sendBtn").disabled, false);
}

test("EOF without [DONE] surfaces incomplete-response error and restores controls", async () => {
  const harness = makeHarness(() => responseWithReader(makeReader([])));
  await harness.send();

  assert.match(harness.assistantBubble().textContent, /response was interrupted before completion/i);
  await assertRestored(harness);
  assert.equal(harness.getFetchCalls(), 1);
});

test("[DONE] completes a response without reporting interruption", async () => {
  const chunks = [chunk('data: {"choices":[{"delta":{"content":"Completed answer"}}]}\n\n'), chunk("data: [DONE]\n\n")];
  const harness = makeHarness(() => responseWithReader(makeReader(chunks)));
  await harness.send();

  assert.match(harness.assistantBubble().innerHTML, /Completed answer/);
  assert.doesNotMatch(harness.assistantBubble().innerHTML, /response was interrupted before completion/i);
  assert.equal(harness.assistantMessage().content, "Completed answer");
  await assertRestored(harness);
  assert.equal(harness.getFetchCalls(), 1);
});

test("reader failure is shown and restores controls", async () => {
  const harness = makeHarness(() => responseWithReader(makeReader([], { failAt: 0 })));
  await harness.send();

  assert.match(harness.assistantBubble().textContent, /mock stream read failure/i);
  await assertRestored(harness);
  assert.equal(harness.getFetchCalls(), 1);
});

test("final undelimited SSE event is processed before missing [DONE] is reported", async () => {
  const chunks = [chunk('data: {"choices":[{"delta":{"content":"Final buffered answer"}}]}')];
  const harness = makeHarness(() => responseWithReader(makeReader(chunks)));
  await harness.send();

  assert.match(harness.assistantBubble().textContent, /response was interrupted before completion/i);
  assert.match(harness.assistantBubble().innerHTML, /Final buffered answer/);
  assert.equal(harness.assistantMessage(), undefined);
  await assertRestored(harness);
  assert.equal(harness.getFetchCalls(), 1);
});

test("fetch is confined to the supplied per-test mock", async () => {
  let requestedUrl;
  const harness = makeHarness(url => {
    requestedUrl = url;
    return responseWithReader(makeReader([]));
  });
  await harness.send();

  assert.equal(requestedUrl, "/api/chat");
  assert.equal(harness.getFetchCalls(), 1);
  await assertRestored(harness);
});

test("conversation at the 30-message boundary sends all 30 messages to /api/chat", async () => {
  let requestPayload;
  const chunks = [chunk("data: [DONE]\n\n")];
  const harness = makeHarness((url, options) => {
    requestPayload = JSON.parse(options.body);
    return responseWithReader(makeReader(chunks));
  });

  for (let i = 1; i <= 29; i++) {
    harness.run(`state.current.messages.push({ id: 'msg-${i}', role: '${i % 2 === 1 ? "user" : "assistant"}', content: 'prior ${i}' })`);
  }
  assert.equal(harness.run("state.current.messages.length"), 29);

  await harness.run("sendMessage('boundary message 30')");

  assert.ok(requestPayload, "Request payload should be captured");
  assert.equal(requestPayload.messages.length, 30);
  assert.equal(requestPayload.messages[0].content, "prior 1");
  assert.equal(requestPayload.messages[29].content, "boundary message 30");
  assert.equal(requestPayload.messages[29].role, "user");
});

test("conversation exceeding 30 messages bounds request to 30 messages and preserves latest user message", async () => {
  let requestPayload;
  const chunks = [
    chunk('data: {"choices":[{"delta":{"content":"assistant response"}}]}\n\n'),
    chunk("data: [DONE]\n\n")
  ];
  const harness = makeHarness((url, options) => {
    requestPayload = JSON.parse(options.body);
    return responseWithReader(makeReader(chunks));
  });

  for (let i = 1; i <= 49; i++) {
    harness.run(`state.current.messages.push({ id: 'msg-${i}', role: '${i % 2 === 1 ? "user" : "assistant"}', content: 'prior ${i}' })`);
  }
  assert.equal(harness.run("state.current.messages.length"), 49);

  await harness.run("sendMessage('latest message 50')");

  assert.ok(requestPayload, "Request payload should be captured");
  assert.equal(requestPayload.messages.length, 30);
  assert.equal(requestPayload.messages[0].content, "prior 21");
  assert.equal(requestPayload.messages[29].content, "latest message 50");
  assert.equal(requestPayload.messages[29].role, "user");

  const inMemory = harness.run("state.current.messages");
  assert.equal(inMemory.length, 51);
  assert.equal(inMemory[49].content, "latest message 50");
});

test("conversation exceeding 30 messages preserves leading system instructions in context window", async () => {
  let requestPayload;
  const chunks = [chunk("data: [DONE]\n\n")];
  const harness = makeHarness((url, options) => {
    requestPayload = JSON.parse(options.body);
    return responseWithReader(makeReader(chunks));
  });

  harness.run("state.current.messages.push({ id: 'sys-1', role: 'system', content: 'System directive' })");
  for (let i = 1; i <= 35; i++) {
    harness.run(`state.current.messages.push({ id: 'msg-${i}', role: '${i % 2 === 1 ? "user" : "assistant"}', content: 'dialog ${i}' })`);
  }

  await harness.run("sendMessage('new user turn')");

  assert.ok(requestPayload, "Request payload should be captured");
  assert.equal(requestPayload.messages.length, 30);
  assert.equal(requestPayload.messages[0].role, "system");
  assert.equal(requestPayload.messages[0].content, "System directive");
  assert.equal(requestPayload.messages[29].content, "new user turn");
  assert.equal(requestPayload.messages[29].role, "user");
});

test("buildRequestContext validates maxMessages and safely retains latest user message", () => {
  const harness = makeHarness(() => responseWithReader(makeReader([])));
  const messages = [];
  for (let i = 1; i <= 35; i++) {
    messages.push({ role: i % 2 === 1 ? "user" : "assistant", content: `msg ${i}` });
  }

  const invalidCalls = [
    harness.run(`buildRequestContext(${JSON.stringify(messages)}, 0)`),
    harness.run(`buildRequestContext(${JSON.stringify(messages)}, -5)`),
    harness.run(`buildRequestContext(${JSON.stringify(messages)}, 'bad')`),
    harness.run(`buildRequestContext(${JSON.stringify(messages)}, null)`)
  ];

  for (const result of invalidCalls) {
    assert.equal(result.length, 30);
    assert.equal(result[29].content, "msg 35");
    assert.equal(result[29].role, "user");
  }

  const limited = harness.run(`buildRequestContext(${JSON.stringify(messages)}, 10)`);
  assert.equal(limited.length, 10);
  assert.equal(limited[9].content, "msg 35");
});

test("buildRequestContext with zero remaining slots does not leak extra messages when leading system messages fill limit", () => {
  const harness = makeHarness(() => responseWithReader(makeReader([])));
  const messagesWithoutUser = [
    { role: "system", content: "sys 1" },
    { role: "system", content: "sys 2" },
    { role: "assistant", content: "asst 1" },
    { role: "assistant", content: "asst 2" }
  ];

  const noUserResult = harness.run(`buildRequestContext(${JSON.stringify(messagesWithoutUser)}, 2)`);
  assert.equal(noUserResult.length, 2);
  assert.equal(noUserResult[0].role, "system");
  assert.equal(noUserResult[0].content, "sys 1");
  assert.equal(noUserResult[1].role, "system");
  assert.equal(noUserResult[1].content, "sys 2");

  const messagesWithUser = [
    { role: "system", content: "sys 1" },
    { role: "assistant", content: "asst 1" },
    { role: "user", content: "user 1" }
  ];
  const withUserResult = harness.run(`buildRequestContext(${JSON.stringify(messagesWithUser)}, 2)`);
  assert.equal(withUserResult.length, 2);
  assert.equal(withUserResult[0].role, "system");
  assert.equal(withUserResult[0].content, "sys 1");
  assert.equal(withUserResult[1].role, "user");
  assert.equal(withUserResult[1].content, "user 1");
});

