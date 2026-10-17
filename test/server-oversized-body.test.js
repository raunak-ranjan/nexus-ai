"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { createServer } = require("../server.js");

const MAX_BODY_BYTES = 1024 * 1024;
const TEST_TIMEOUT_MS = 5000;

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), TEST_TIMEOUT_MS);
    })
  ]).finally(() => clearTimeout(timer));
}

async function startTestServer(t, fetchImpl) {
  const server = createServer({
    apiKey: "isolated-test-key",
    appUrl: "http://127.0.0.1",
    fetchImpl
  });
  const resources = { requests: new Set(), sockets: new Set() };
  let listening = false;
  let listenTimedOut = false;

  t.after(async () => {
    for (const request of resources.requests) request.destroy();
    for (const socket of resources.sockets) socket.destroy();
    server.closeAllConnections();

    if (server.listening) {
      await withTimeout(new Promise(resolve => server.close(resolve)), "test server close");
    } else if (!listening && listenTimedOut) {
      await withTimeout(new Promise(resolve => {
        const closeIfListening = () => {
          server.close(resolve);
          server.closeAllConnections();
        };
        server.once("listening", closeIfListening);
        server.once("error", resolve);
      }), "timed-out test server cleanup");
    }
  });

  try {
    await withTimeout(new Promise((resolve, reject) => {
      server.once("error", error => {
        const diagnostic = `server listen at 127.0.0.1:0 failed: ${error.message}`;
        const wrapped = new Error(diagnostic, { cause: error });
        if (error.code) wrapped.code = error.code;
        reject(wrapped);
      });
      server.listen(0, "127.0.0.1", resolve);
    }), "server listen at 127.0.0.1:0");
    listening = true;
    const address = server.address();
    t.diagnostic(`test server listening at ${address.address}:${address.port}`);
  } catch (error) {
    listenTimedOut = error.message === "server listen at 127.0.0.1:0 timed out";
    throw error;
  }

  return { port: server.address().port, resources };
}

function trackRequest(request, resources) {
  resources.requests.add(request);
  request.on("socket", socket => resources.sockets.add(socket));
}

function clientConnectErrorHandler(reject, port) {
  return error => {
    const wrapped = new Error(
      `client connect to 127.0.0.1:${port} failed: ${error.message}`,
      { cause: error }
    );
    if (error.code) wrapped.code = error.code;
    reject(wrapped);
  };
}

function socketClosePromise(socket) {
  return new Promise(resolve => {
    if (socket.destroyed) resolve();
    else socket.once("close", resolve);
  });
}

function readResponse(response, socketClosed) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    response.on("data", chunk => chunks.push(chunk));
    response.on("end", () => resolve({
      statusCode: response.statusCode,
      headers: response.headers,
      body: Buffer.concat(chunks).toString("utf8"),
      complete: response.complete,
      socketClosed
    }));
    response.on("error", reject);
    response.on("aborted", () => reject(new Error("response was aborted before completion")));
  });
}

function makeRequest(port, body, resources) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length
      }
    }, response => resolve(readResponse(response, socketClosed)));
    trackRequest(request, resources);
    let socketClosed = Promise.resolve();
    request.once("socket", socket => { socketClosed = socketClosePromise(socket); });
    request.setTimeout(TEST_TIMEOUT_MS, () => request.destroy(new Error("client request timed out")));
    request.on("error", clientConnectErrorHandler(reject, port));
    request.end(body);
  });
}

function validExactLimitPayload() {
  const json = JSON.stringify({
    model: "openrouter/free",
    messages: [{ role: "user", content: "boundary test" }]
  });
  const paddingLength = MAX_BODY_BYTES - Buffer.byteLength(json);
  assert.ok(paddingLength >= 0);
  return Buffer.from(json + " ".repeat(paddingLength), "utf8");
}

test("oversized body receives 413 JSON and never reaches upstream fetch", async t => {
  let upstreamCalls = 0;
  const { port, resources } = await startTestServer(t, async () => {
    upstreamCalls += 1;
    throw new Error("unexpected mocked upstream call");
  });
  const body = Buffer.alloc(MAX_BODY_BYTES + 1, 0x20);

  const response = await withTimeout(makeRequest(port, body, resources), "oversized response");

  assert.equal(response.statusCode, 413);
  assert.deepEqual(JSON.parse(response.body), { error: "Request body is too large." });
  assert.equal(response.headers.connection, "close");
  assert.equal(response.complete, true);
  assert.equal(upstreamCalls, 0);
  await withTimeout(response.socketClosed, "oversized client socket close");
});

test("a valid request exactly 1 MiB is accepted by the size limit", async t => {
  let upstreamCalls = 0;
  const { port, resources } = await startTestServer(t, async () => {
    upstreamCalls += 1;
    return { ok: true, body: [] };
  });
  const body = validExactLimitPayload();
  assert.equal(body.byteLength, MAX_BODY_BYTES);

  const response = await withTimeout(makeRequest(port, body, resources), "exact-limit response");

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/event-stream; charset=utf-8");
  assert.equal(response.complete, true);
  assert.equal(upstreamCalls, 1);
});

test("oversized partial upload gets a response without draining the declared body", async t => {
  let upstreamCalls = 0;
  const { port, resources } = await startTestServer(t, async () => {
    upstreamCalls += 1;
    throw new Error("unexpected mocked upstream call");
  });
  const firstChunk = Buffer.alloc(MAX_BODY_BYTES + 1, 0x20);
  const responsePromise = new Promise((resolve, reject) => {
    let socketClosed = Promise.resolve();
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/chat",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": MAX_BODY_BYTES * 2
      }
    }, response => resolve(readResponse(response, socketClosed)));
    trackRequest(request, resources);
    request.once("socket", socket => { socketClosed = socketClosePromise(socket); });
    request.setTimeout(TEST_TIMEOUT_MS, () => request.destroy(new Error("partial upload timed out")));
    request.on("error", clientConnectErrorHandler(reject, port));
    request.write(firstChunk);
  });

  const response = await withTimeout(responsePromise, "early oversized response");

  assert.equal(response.statusCode, 413);
  assert.deepEqual(JSON.parse(response.body), { error: "Request body is too large." });
  assert.equal(response.headers.connection, "close");
  assert.equal(response.complete, true);
  assert.equal(upstreamCalls, 0);
  await withTimeout(response.socketClosed, "partial upload client socket close");
});
