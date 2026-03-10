/**
 * Local Development Server - AI Learning Guide
 *
 * Serves static files from the project root AND proxies /api/gemini/* to
 * OpenRouter (openai/gpt-oss-20b) so the chat works without Firebase deployed.
 *
 * Reads OPENROUTER_API_KEY from functions/.env
 * Requires Node.js 18+ (uses native fetch, no npm install needed at root level)
 *
 * Usage:  node server.js
 * URL:    http://localhost:8000
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

// ===== Load API key from functions/.env =====
function loadDotEnv(envPath) {
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch (_) {
    return {};
  }
}

const dotEnv = loadDotEnv(path.join(__dirname, "functions", ".env"));
const OPENROUTER_API_KEY = dotEnv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

const PLACEHOLDER_PATTERNS = ["your-openrouter-api-key", "your-api-key", "placeholder", "sk-or-v1-xxx"];

if (!OPENROUTER_API_KEY) {
  console.error("❌  OPENROUTER_API_KEY not found.");
  console.error("    Add it to functions/.env:\n");
  console.error("    OPENROUTER_API_KEY=sk-or-v1-...\n");
  console.error("    Get your key at: https://openrouter.ai/keys\n");
  process.exit(1);
}

if (PLACEHOLDER_PATTERNS.some(p => OPENROUTER_API_KEY.toLowerCase().includes(p.toLowerCase()))) {
  console.error("❌  OPENROUTER_API_KEY is still set to the placeholder value.");
  console.error(`    Current value: "${OPENROUTER_API_KEY}"`);
  console.error("\n    ➜  Replace it with your real key in  functions/.env :");
  console.error("       OPENROUTER_API_KEY=sk-or-v1-<your-actual-key>\n");
  console.error("    Get your key at: https://openrouter.ai/keys\n");
  process.exit(1);
}

// ===== Config =====
const PORT             = 8000;
const OPENROUTER_BASE  = "https://openrouter.ai/api/v1";
const DEFAULT_GEN_MODEL  = "openai/gpt-oss-20b";
const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";
const APP_REFERER      = `http://localhost:${PORT}`;
const APP_TITLE        = "AI Learning Guide (Dev)";

const MIME = {
  ".html":  "text/html; charset=utf-8",
  ".css":   "text/css",
  ".js":    "application/javascript",
  ".json":  "application/json",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".mp3":   "audio/mpeg",
  ".webp":  "image/webp"
};

// ===== Helpers =====
function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function jsonRes(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

function orHeaders() {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "HTTP-Referer":  APP_REFERER,
    "X-Title":       APP_TITLE
  };
}

// ===== API handlers =====
async function handleGenerate(rawBody, res) {
  let body;
  try { body = JSON.parse(rawBody); } catch (_) { body = {}; }

  const prompt       = String(body.prompt || "").trim();
  const systemPrompt = String(body.systemPrompt || "").trim();
  const model        = body.model || DEFAULT_GEN_MODEL;
  const cfg          = body.generationConfig || {};

  if (!prompt) return jsonRes(res, 400, { success: false, error: "prompt is required" });

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  try {
    const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: orHeaders(),
      body: JSON.stringify({
        model,
        messages,
        max_tokens:  Math.min(cfg.maxOutputTokens || 1024, 4096),
        temperature: cfg.temperature ?? 0.7,
        top_p:       cfg.topP      ?? 0.9
      })
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("[GENERATE] OpenRouter error:", data?.error);
      return jsonRes(res, r.status, { success: false, error: data?.error?.message || "Generation failed" });
    }

    const text = data?.choices?.[0]?.message?.content || "";
    if (!text) return jsonRes(res, 500, { success: false, error: "Empty response from model" });

    console.log(`[GENERATE] ✓ ${text.length} chars — model: ${model}`);
    jsonRes(res, 200, { success: true, text, model, characterCount: text.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[GENERATE] fetch error:", err.message);
    jsonRes(res, 500, { success: false, error: err.message });
  }
}

async function handleEmbed(rawBody, res) {
  let body;
  try { body = JSON.parse(rawBody); } catch (_) { body = {}; }

  const text  = String(body.text || "").trim();
  const model = body.model || DEFAULT_EMBED_MODEL;

  if (!text) return jsonRes(res, 400, { success: false, error: "text is required" });

  try {
    const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: "POST",
      headers: orHeaders(),
      body: JSON.stringify({ model, input: text })
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("[EMBED] OpenRouter error:", data?.error);
      return jsonRes(res, r.status, { success: false, error: data?.error?.message || "Embedding failed" });
    }

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return jsonRes(res, 500, { success: false, error: "No embedding in response" });

    console.log(`[EMBED] ✓ ${embedding.length} dims — model: ${model}`);
    jsonRes(res, 200, { success: true, embedding, model, dimension: embedding.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[EMBED] fetch error:", err.message);
    jsonRes(res, 500, { success: false, error: err.message });
  }
}

// ===== Main request handler =====
const server = http.createServer(async (req, res) => {
  const urlObj   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // ===== /api/gemini/* proxy routes =====
  if (pathname.startsWith("/api/gemini/")) {
    const sub = pathname.slice("/api/gemini/".length);

    if (sub === "health") {
      return jsonRes(res, 200, { status: "ok", version: "dev-proxy", timestamp: new Date().toISOString() });
    }

    const rawBody = await readBody(req);

    if (sub === "generate") return handleGenerate(rawBody, res);
    if (sub === "embed")    return handleEmbed(rawBody, res);

    return jsonRes(res, 404, { success: false, error: `Unknown endpoint: /api/gemini/${sub}` });
  }

  // ===== Static file server =====
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(__dirname, filePath);

  // Security: block directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback: try adding .html
      fs.readFile(filePath + ".html", (err2, data2) => {
        if (err2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end(`Not found: ${pathname}`);
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(data2);
        }
      });
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   AI Learning Guide — Local Dev Server ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n🚀  http://localhost:${PORT}`);
  console.log("🔑  OpenRouter API key loaded ✓");
  console.log("🌐  /api/gemini/* → openrouter.ai/api/v1");
  console.log("📂  Static files served from project root");
  console.log("\n   Press Ctrl+C to stop\n");
});
