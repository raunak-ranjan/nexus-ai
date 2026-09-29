const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
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

function securityHeaders(res) {
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

    req.setEncoding("utf8");

    req.on("data", chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body."), { status: 400 }));
      }
    });

    req.on("error", reject);
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

async function handleChat(req, res) {
  if (!API_KEY) {
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
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
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
  let pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);

  if (pathname === "/") pathname = "/index.html";

  const publicRoot = path.resolve(__dirname);
  const requested = path.resolve(publicRoot, `.${pathname}`);

  if (!requested.startsWith(publicRoot + path.sep)) {
    return sendJson(res, 403, { error: "Forbidden." });
  }

  fs.stat(requested, (error, stat) => {
    if (error || !stat.isFile()) {
      return sendJson(res, 404, { error: "Not found." });
    }

    securityHeaders(res);
    res.setHeader("Cache-Control", pathname === "/index.html" ? "no-cache" : "public, max-age=3600");
    res.setHeader("Content-Type", MIME[path.extname(requested).toLowerCase()] || "application/octet-stream");

    fs.createReadStream(requested).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "nexus-api",
      configured: Boolean(API_KEY)
    });
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    return handleChat(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(PORT, HOST, () => {
  console.log(`Nexus AI running at http://${HOST}:${PORT}`);
  console.log(`API key configured: ${Boolean(API_KEY)}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
