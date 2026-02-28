/**
 * AI Learning Guide - Firebase Cloud Functions v2
 * Secure OpenRouter API Proxy using Firebase Secrets
 *
 * Routes frontend requests to OpenRouter (OpenAI-compatible API),
 * keeping the API key secure on the server and never exposing it to clients.
 *
 * API: https://openrouter.ai/api/v1
 * Model: openai/gpt-oss-20b
 */

// Load .env for local emulator development
try { require("dotenv").config(); } catch (_) {}

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const express = require("express");

// ===== Configuration =====
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";
const DEFAULT_GEN_MODEL  = "openai/gpt-oss-20b";
const REQUEST_TIMEOUT_MS = 30000;

// App metadata forwarded to OpenRouter (recommended by their docs)
const APP_REFERER = "https://ai-learning-guide-web-app.web.app";
const APP_TITLE   = "AI Learning Guide";

// ===== Secrets Management (Firebase v2) =====
const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");

// ===== Express App Setup =====
const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "2.0", timestamp: new Date().toISOString() });
});

// ===== Middleware =====
function validateSecret(secret) {
  if (!secret || typeof secret !== "string") {
    throw new Error("OpenRouter API key not configured. Please set OPENROUTER_API_KEY secret.");
  }
  return secret;
}

function createFetchOptions(apiKey) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": APP_REFERER,
      "X-Title": APP_TITLE,
      "User-Agent": "AI-Learning-Guide/2.0"
    }
  };
}

// ===== Error Response Handler =====
function sendError(res, statusCode, message, details = {}) {
  console.error(`[ERROR] ${statusCode}: ${message}`, details);
  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
}

// ===== Embedding Endpoint =====
app.post("/embed", async (req, res) => {
  try {
    const text  = String(req.body?.text  || "").trim();
    const model = req.body?.model || DEFAULT_EMBED_MODEL;

    if (!text) {
      return sendError(res, 400, "Missing or empty text for embedding");
    }
    if (text.length > 100000) {
      return sendError(res, 400, "Text exceeds maximum length (100k characters)");
    }

    // Get secret from environment (injected by Firebase v2 at runtime)
    const apiKey = validateSecret(process.env.OPENROUTER_API_KEY);

    // OpenRouter / OpenAI-compatible embeddings endpoint
    const endpoint = `${OPENROUTER_BASE_URL}/embeddings`;
    const requestBody = { model, input: text };

    console.log(`[EMBED] model=${model} text_len=${text.length}`);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      ...createFetchOptions(apiKey),
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData    = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      return sendError(res, response.status, `OpenRouter embedding error: ${errorMessage}`, {
        orStatus: response.status,
        model
      });
    }

    const data      = await response.json();
    const embedding = data.data?.[0]?.embedding;  // OpenAI format: data[0].embedding

    if (!Array.isArray(embedding) || embedding.length === 0) {
      return sendError(res, 500, "OpenRouter returned invalid or empty embedding");
    }

    console.log(`[EMBED] success: ${embedding.length} dimensions`);

    res.json({
      success: true,
      embedding,
      model,
      dimension: embedding.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return sendError(res, 504, "Request timeout - OpenRouter took too long to respond");
    }
    sendError(res, 500, error.message || "Embedding generation failed", { error });
  }
});

// ===== Generation Endpoint =====
app.post("/generate", async (req, res) => {
  try {
    const prompt           = String(req.body?.prompt || "").trim();
    const model            = req.body?.model || DEFAULT_GEN_MODEL;
    const systemPrompt     = String(req.body?.systemPrompt || "").trim();
    const generationConfig = req.body?.generationConfig || {};

    if (!prompt) {
      return sendError(res, 400, "Missing or empty prompt for generation");
    }
    if (prompt.length > 500000) {
      return sendError(res, 400, "Prompt exceeds maximum length (500k characters)");
    }

    // Get secret from environment (injected by Firebase v2 at runtime)
    const apiKey = validateSecret(process.env.OPENROUTER_API_KEY);

    // Build messages array (OpenAI chat completions format)
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    // OpenRouter / OpenAI-compatible chat completions endpoint
    const endpoint    = `${OPENROUTER_BASE_URL}/chat/completions`;
    const requestBody = {
      model,
      messages,
      max_tokens:  Math.min(generationConfig.maxOutputTokens || 1024, 4096),
      temperature: Math.max(0, Math.min(generationConfig.temperature ?? 0.7, 2)),
      top_p:       Math.max(0, Math.min(generationConfig.topP       ?? 0.9, 1))
    };

    console.log(`[GENERATE] model=${model} prompt_len=${prompt.length}`);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(endpoint, {
      ...createFetchOptions(apiKey),
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData    = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      return sendError(res, response.status, `OpenRouter API error: ${errorMessage}`, {
        orStatus: response.status,
        model
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;  // OpenAI format

    if (typeof text !== "string" || text.length === 0) {
      return sendError(res, 500, "OpenRouter returned empty or invalid content");
    }

    console.log(`[GENERATE] success: ${text.length} characters`);

    res.json({
      success: true,
      text,
      model,
      characterCount: text.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return sendError(res, 504, "Request timeout - OpenRouter took too long to respond");
    }
    sendError(res, 500, error.message || "Content generation failed", { error });
  }
});

// ===== Error Handler for undefined routes =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.path}`,
    available: ["/health", "/embed", "/generate"]
  });
});

// ===== Firebase Cloud Function v2 =====
// Modern onRequest API with secure secret injection (firebase-functions v5)
exports.geminiProxy = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "256MB",
    secrets: [OPENROUTER_API_KEY],
    cors: {
      origin: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      credentials: false
    }
  },
  app
);
