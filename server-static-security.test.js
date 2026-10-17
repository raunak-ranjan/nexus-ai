"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { createServer, CONTENT_SECURITY_POLICY } = require("../server.js");

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

async function startTestServer(t) {
  const server = createServer({
    apiKey: "isolated-test-key",
    appUrl: "http://127.0.0.1",
    fetchImpl: async () => { throw new Error("Unexpected upstream fetch."); }
  });
  const requests = new Set();
  const sockets = new Set();

  t.after(async () => {
    for (const request of requests) request.destroy();
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    if (server.listening) {
      await withTimeout(new Promise(resolve => server.close(resolve)), "test server close");
    }
  });

  await withTimeout(new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  }), "test server listen");

  return {
    port: server.address().port,
    requests,
    sockets
  };
}

function request(port, requestPath, resources, { readBody = true } = {}) {
  return withTimeout(new Promise((resolve, reject) => {
    const client = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: "GET"
    }, response => {
      if (!readBody) {
        const result = { statusCode: response.statusCode };
        response.destroy();
        resolve(result);
        return;
      }

      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("response was aborted before completion")));
    });

    resources.requests.add(client);
    client.on("socket", socket => resources.sockets.add(socket));
    client.setTimeout(TEST_TIMEOUT_MS, () => client.destroy(new Error("client request timed out")));
    client.on("error", reject);
    client.end();
  }), `GET ${requestPath}`);
}

test("only the required browser assets are served", async t => {
  const { port, ...resources } = await startTestServer(t);
  const cases = [
    ["/", "text/html; charset=utf-8", "<title>Nexus AI</title>"],
    ["/index.html", "text/html; charset=utf-8", "<title>Nexus AI</title>"],
    ["/style.css", "text/css; charset=utf-8", ":root"],
    ["/script.js", "text/javascript; charset=utf-8", "sendMessage"]
  ];

  for (const [requestPath, contentType, expectedText] of cases) {
    const response = await request(port, requestPath, resources);
    assert.equal(response.statusCode, 200, `${requestPath} should be served`);
    assert.equal(response.headers["content-type"], contentType);
    assert.ok(response.body.includes(expectedText), `${requestPath} should contain its expected asset content`);
  }
});

test("server-side files and metadata are denied without reading response bodies", async t => {
  const { port, ...resources } = await startTestServer(t);
  for (const requestPath of [
    "/.env",
    "/.env.example",
    "/server.js",
    "/package.json",
    "/test/threadline-storage.test.js"
  ]) {
    const response = await request(port, requestPath, resources, { readBody: false });
    assert.equal(response.statusCode, 404, `${requestPath} should be denied`);
  }
});

test("encoded traversal paths are denied", async t => {
  const { port, ...resources } = await startTestServer(t);
  for (const requestPath of [
    "/../server.js",
    "/%2e%2e/server.js",
    "/..%5cserver.js",
    "/%2e%2e%5cserver.js"
  ]) {
    const response = await request(port, requestPath, resources, { readBody: false });
    assert.equal(response.statusCode, 404, `${requestPath} should be denied`);
  }
});

test("malformed URL encoding returns 400 and a later asset request succeeds", async t => {
  const { port, ...resources } = await startTestServer(t);

  const malformed = await request(port, "/%ZZ", resources);
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(JSON.parse(malformed.body), { error: "Invalid URL." });

  const valid = await request(port, "/style.css", resources);
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.headers["content-type"], "text/css; charset=utf-8");
  assert.ok(valid.body.includes(":root"));
});

test("Content-Security-Policy and existing security headers are present on static, API, and error responses", async t => {
  const { port, ...resources } = await startTestServer(t);

  const expectedPolicy =
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'";

  assert.equal(CONTENT_SECURITY_POLICY, expectedPolicy);

  const assertSecurityHeaders = (headers, context) => {
    assert.equal(headers["content-security-policy"], expectedPolicy, `CSP header mismatch on ${context}`);
    assert.equal(headers["x-content-type-options"], "nosniff", `X-Content-Type-Options mismatch on ${context}`);
    assert.equal(headers["x-frame-options"], "DENY", `X-Frame-Options mismatch on ${context}`);
    assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin", `Referrer-Policy mismatch on ${context}`);
    assert.equal(headers["permissions-policy"], "camera=(), microphone=(), geolocation=()", `Permissions-Policy mismatch on ${context}`);
    assert.equal(headers["cross-origin-opener-policy"], "same-origin", `Cross-Origin-Opener-Policy mismatch on ${context}`);

    // Verify directives do not permit arbitrary origins or unsafe execution
    assert.ok(!headers["content-security-policy"].includes("'unsafe-inline'"), `${context} CSP must not allow unsafe-inline`);
    assert.ok(!headers["content-security-policy"].includes("'unsafe-eval'"), `${context} CSP must not allow unsafe-eval`);
    assert.ok(!headers["content-security-policy"].includes("*"), `${context} CSP must not allow wildcard origins`);
    assert.ok(!headers["content-security-policy"].includes("http:"), `${context} CSP must not allow insecure http origins`);
  };

  // 1. Static responses
  const staticEndpoints = ["/", "/index.html", "/style.css", "/script.js"];
  for (const endpoint of staticEndpoints) {
    const res = await request(port, endpoint, resources);
    assert.equal(res.statusCode, 200, `${endpoint} should return 200`);
    assertSecurityHeaders(res.headers, endpoint);
  }

  // 2. API response (/api/health)
  const healthRes = await request(port, "/api/health", resources);
  assert.equal(healthRes.statusCode, 200, "/api/health should return 200");
  assertSecurityHeaders(healthRes.headers, "/api/health");

  // 3. Representative error responses (404 and 400)
  const notFoundRes = await request(port, "/nonexistent-page", resources);
  assert.equal(notFoundRes.statusCode, 404, "/nonexistent-page should return 404");
  assertSecurityHeaders(notFoundRes.headers, "/nonexistent-page (404)");

  const badUrlRes = await request(port, "/%ZZ", resources);
  assert.equal(badUrlRes.statusCode, 400, "/%ZZ should return 400");
  assertSecurityHeaders(badUrlRes.headers, "/%ZZ (400)");
});
