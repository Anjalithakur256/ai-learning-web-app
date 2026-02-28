/**
 * Vercel Serverless Function — /api/gemini/health
 * Health check endpoint. Mirrors Firebase Cloud Function /health route.
 */

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  return res.status(200).json({
    status: "ok",
    version: "2.0",
    apiConfigured: !!(apiKey && apiKey !== "your-openrouter-api-key-here"),
    timestamp: new Date().toISOString()
  });
}
