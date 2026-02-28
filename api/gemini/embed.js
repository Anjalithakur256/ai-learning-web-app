/**
 * Vercel Serverless Function — /api/gemini/embed
 * Proxies embedding requests to OpenRouter, keeping the API key server-side.
 * Mirrors the Firebase Cloud Function (functions/index.js) /embed route.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";
const REQUEST_TIMEOUT_MS  = 30000;
const APP_REFERER = "https://ai-learning-guide-web-app.web.app";
const APP_TITLE   = "AI Learning Guide";

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(500).json({
      success: false,
      error: "OpenRouter API key not configured. Set OPENROUTER_API_KEY in Vercel environment variables."
    });
  }

  const text  = String(req.body?.text  || "").trim();
  const model = req.body?.model || DEFAULT_EMBED_MODEL;

  if (!text) {
    return res.status(400).json({ success: false, error: "Missing or empty text for embedding" });
  }
  if (text.length > 100000) {
    return res.status(400).json({ success: false, error: "Text exceeds maximum length (100k characters)" });
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": APP_REFERER,
        "X-Title": APP_TITLE
      },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        success: false,
        error: `OpenRouter embedding error: ${errData.error?.message || response.statusText}`
      });
    }

    const data      = await response.json();
    const embedding = data.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      return res.status(500).json({ success: false, error: "OpenRouter returned invalid or empty embedding" });
    }

    return res.status(200).json({
      success: true,
      embedding,
      model,
      dimension: embedding.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return res.status(504).json({ success: false, error: "Request timeout" });
    }
    return res.status(500).json({ success: false, error: error.message || "Embedding generation failed" });
  }
}
