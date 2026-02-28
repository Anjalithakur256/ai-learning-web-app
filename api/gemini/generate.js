/**
 * Vercel Serverless Function — /api/gemini/generate
 * Proxies text generation requests to OpenRouter, keeping the API key server-side.
 * Mirrors the Firebase Cloud Function (functions/index.js) /generate route.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_GEN_MODEL   = "openai/gpt-oss-20b";
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

  const prompt           = String(req.body?.prompt || "").trim();
  const model            = req.body?.model || DEFAULT_GEN_MODEL;
  const systemPrompt     = String(req.body?.systemPrompt || "").trim();
  const generationConfig = req.body?.generationConfig || {};

  if (!prompt) {
    return res.status(400).json({ success: false, error: "Missing or empty prompt for generation" });
  }
  if (prompt.length > 500000) {
    return res.status(400).json({ success: false, error: "Prompt exceeds maximum length (500k characters)" });
  }

  // Build messages (OpenAI chat completions format)
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const requestBody = {
    model,
    messages,
    max_tokens:  Math.min(generationConfig.maxOutputTokens || 1024, 4096),
    temperature: Math.max(0, Math.min(generationConfig.temperature ?? 0.7, 2)),
    top_p:       Math.max(0, Math.min(generationConfig.topP       ?? 0.9, 1))
  };

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": APP_REFERER,
        "X-Title": APP_TITLE
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        success: false,
        error: `OpenRouter API error: ${errData.error?.message || response.statusText}`
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (typeof text !== "string" || text.length === 0) {
      return res.status(500).json({ success: false, error: "OpenRouter returned empty or invalid content" });
    }

    return res.status(200).json({
      success: true,
      text,
      model,
      characterCount: text.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return res.status(504).json({ success: false, error: "Request timeout" });
    }
    return res.status(500).json({ success: false, error: error.message || "Content generation failed" });
  }
}
