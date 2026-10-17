const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 12000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;

const allowedModels = new Set([
  "openrouter/free",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-haiku"
]);

const rateBuckets = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const PUBLIC_ASSETS = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/style.css", "style.css"],
  ["/script.js", "script.js"]
]);

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

const CONTENT_SECURITY_POLICY =
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

function securityHeaders(res) {
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
}

function sendJson(res, status, payload) {
  securityHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function clientIp(req) {
  return req.socket.remoteAddress || "unknown";
}

function allowedByRateLimit(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = rateBuckets.get(ip) || { startedAt: now, count: 0 };

  if (now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket.startedAt = now;
    bucket.count = 0;
  }

  bucket.count += 1;
  rateBuckets.set(ip, bucket);

  if (rateBuckets.size > 5000) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt > RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }

  return bucket.count <= RATE_LIMIT;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    let settled = false;

    req.setEncoding("utf8");

    req.on("data", chunk => {
      if (settled) return;
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        settled = true;
        req.pause();
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body."), { status: 400 }));
      }
    });

    req.on("error", error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function validateChatPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw Object.assign(new Error("Invalid request."), { status: 400 });
  }

  const model = payload.model;
  const messages = payload.messages;

  if (!allowedModels.has(model)) {
    throw Object.assign(new Error("Model is not allowed."), { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    throw Object.assign(new Error(`Messages must contain 1-${MAX_MESSAGES} items.`), { status: 400 });
  }

  const cleanMessages = messages.map(message => {
    if (!message || !["user", "assistant"].includes(message.role)) {
      throw Object.assign(new Error("Invalid message role."), { status: 400 });
    }

    if (typeof message.content !== "string" || !message.content.trim()) {
      throw Object.assign(new Error("Message content cannot be empty."), { status: 400 });
    }

    if (message.content.length > MAX_MESSAGE_CHARS) {
      throw Object.assign(new Error("A message is too long."), { status: 400 });
    }

    return {
      role: message.role,
      content: message.content
    };
  });

  return { model, messages: cleanMessages };
}

async function handleChat(req, res, { apiKey, appUrl, fetchImpl }) {
  if (!apiKey) {
    return sendJson(res, 503, {
      error: "Server API key is not configured. Add OPENROUTER_API_KEY to .env."
    });
  }

  if (!allowedByRateLimit(req)) {
    return sendJson(res, 429, {
      error: "Too many requests. Please wait a minute and try again."
    });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    if (res.destroyed || res.writableEnded || req.aborted) {
      if (!res.destroyed && !res.writableEnded) res.destroy();
      return;
    }
    if (error.status === 413) {
      res.shouldKeepAlive = false;
      res.setHeader("Connection", "close");
    }
    return sendJson(res, error.status || 400, { error: error.message });
  }

  let chat;
  try {
    chat = validateChatPayload(payload);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.message });
  }

  let upstream;
  try {
    upstream = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appUrl,
        "X-Title": "Nexus AI"
      },
      body: JSON.stringify({
        model: chat.model,
        messages: chat.messages,
        temperature: 0.7,
        stream: true
      })
    });
  } catch {
    return sendJson(res, 502, { error: "Could not reach OpenRouter." });
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    let message = `OpenRouter returned ${upstream.status}.`;

    try {
      const data = JSON.parse(text);
      message = data?.error?.message || message;
    } catch {}

    return sendJson(res, upstream.status >= 500 ? 502 : upstream.status, { error: message });
  }

  securityHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  } catch {
    // Client disconnects and upstream stream errors are intentionally not exposed.
  } finally {
    res.end();
  }
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return sendJson(res, 400, { error: "Invalid URL." });
  }

  const assetName = PUBLIC_ASSETS.get(pathname);
  if (!assetName) return sendJson(res, 404, { error: "Not found." });

  const publicRoot = path.resolve(__dirname);
  const requested = path.resolve(publicRoot, assetName);
  const relative = path.relative(publicRoot, requested);
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    return sendJson(res, 404, { error: "Not found." });
  }

  fs.realpath(publicRoot, (rootError, realRoot) => {
    if (rootError) return sendJson(res, 404, { error: "Not found." });
    fs.realpath(requested, (assetError, realAsset) => {
      if (assetError) return sendJson(res, 404, { error: "Not found." });
      const relativeTarget = path.relative(realRoot, realAsset);
      const expectedTarget = path.resolve(realRoot, assetName);
      if (
        path.isAbsolute(relativeTarget) || relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) ||
        path.relative(expectedTarget, realAsset) !== ""
      ) {
        return sendJson(res, 404, { error: "Not found." });
      }

      fs.stat(realAsset, (error, stat) => {
        if (error || !stat.isFile()) {
          return sendJson(res, 404, { error: "Not found." });
        }

        securityHeaders(res);
        res.setHeader("Cache-Control", assetName === "index.html" ? "no-cache" : "public, max-age=3600");
        res.setHeader("Content-Type", MIME[path.extname(realAsset).toLowerCase()] || "application/octet-stream");
        fs.createReadStream(realAsset).pipe(res);
      });
    });
  });
}

function createServer({ apiKey = "", appUrl = "http://localhost", fetchImpl = globalThis.fetch } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "nexus-api",
        configured: Boolean(apiKey)
      });
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      return handleChat(req, res, { apiKey, appUrl, fetchImpl });
    }

    if (req.method === "GET") {
      return serveStatic(req, res);
    }

    sendJson(res, 405, { error: "Method not allowed." });
  });
}

module.exports = { createServer, CONTENT_SECURITY_POLICY };

if (require.main === module) {
  loadEnvFile();

  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "127.0.0.1";
  const API_KEY = process.env.OPENROUTER_API_KEY || "";
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
  const server = createServer({ apiKey: API_KEY, appUrl: APP_URL, fetchImpl: globalThis.fetch });

  server.listen(PORT, HOST, () => {
    console.log(`Nexus AI running at http://${HOST}:${PORT}`);
    console.log(`API key configured: ${Boolean(API_KEY)}`);
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}
