/**
 * PHASE 3: AI Inference Service
 * Gemini API abstraction with error handling and rate limiting
 * Layer: AI Inference / Layer 4
 */

import { getConfig } from "./config.js";
import logger from "./logger.js";
import { errorHandler } from "./error-handler.js";

class AiInferenceService {
  constructor() {
    this.baseUrl = getConfig("GEMINI_BASE_URL");
    this.apiKey = getConfig("GEMINI_API_KEY");
    this.proxyUrl = getConfig("GEMINI_PROXY_URL");
    this.embeddingModel = getConfig("GEMINI_MODELS.TEXT_EMBEDDING");
    this.generationModel = getConfig("GEMINI_MODELS.GENERATION");
    this.requestQueue = [];
    this.isProcessing = false;
  }

  /**
   * Update API key at runtime
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    logger.info("AI_INFERENCE", "API key updated");
  }

  /**
   * Validate API configuration
   */
  validateConfiguration() {
    if (!this.proxyUrl) {
      return {
        valid: false,
        error: "API proxy URL not configured"
      };
    }
    return { valid: true };
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text) {
    const metricKey = `ai_embedding_${Date.now()}`;
    logger.startMetric(metricKey);

    try {
      // Input validation
      if (!text || typeof text !== "string") {
        throw new Error("Text must be a non-empty string");
      }

      const config = this.validateConfiguration();
      if (!config.valid) {
        throw new Error(config.error);
      }

      const endpoint = `${this.proxyUrl}/embed`;
      const requestBody = {
        text,
        model: this.embeddingModel
      };

      logger.debug("AI_INFERENCE", `Calling embedding API`, {
        textLength: text.length,
        model: this.embeddingModel
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(getConfig("SYSTEM.REQUEST_TIMEOUT_MS"))
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Embedding API error (${response.status}): ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      const embedding = data.embedding;

      if (!embedding) {
        throw new Error("No embedding returned from API");
      }

      const duration = logger.endMetric(metricKey, {
        model: this.embeddingModel,
        embeddingDimension: embedding.length
      });

      logger.trackAiInference(this.embeddingModel, embedding.length, duration);
      logger.info("AI_INFERENCE", `Embedding generated successfully`, {
        dimension: embedding.length,
        duration
      });

      return { success: true, data: embedding };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj, recoveryStrategy } = errorHandler.handleAiError(
        error,
        "generateEmbedding"
      );
      return {
        success: false,
        error: errorObj,
        recoveryStrategy
      };
    }
  }

  /**
   * Generate text response
   */
  async generateContent(prompt, systemPrompt = "", config = {}) {
    const metricKey = `ai_generation_${Date.now()}`;
    logger.startMetric(metricKey);

    try {
      // Input validation
      if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt must be a non-empty string");
      }

      const apiConfig = this.validateConfiguration();
      if (!apiConfig.valid) {
        throw new Error(apiConfig.error);
      }

      const endpoint = `${this.proxyUrl}/generate`;
      const generationConfig = {
        maxOutputTokens: config.maxTokens || 1024,
        temperature: config.temperature || 0.7,
        topP: config.topP || 0.9,
        topK: config.topK || 40
      };

      const requestBody = {
        prompt,
        model: this.generationModel,
        generationConfig
      };

      logger.debug("AI_INFERENCE", `Calling generation API`, {
        promptLength: prompt.length,
        model: this.generationModel,
        config: generationConfig
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        getConfig("SYSTEM.RESPONSE_TIMEOUT_MS")
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Generation API error (${response.status}): ${errorData.error?.message || response.statusText}`
        );
      }

      const data = await response.json();
      const text = data?.text;

      if (!text) {
        throw new Error("No content generated from API");
      }

      const duration = logger.endMetric(metricKey, {
        model: this.generationModel,
        responseLength: text.length
      });

      // Approximate token count
      const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);
      logger.trackAiInference(this.generationModel, estimatedTokens, duration);
      logger.info("AI_INFERENCE", `Content generated successfully`, {
        responseLength: text.length,
        estimatedTokens,
        duration
      });

      return { success: true, data: { text, tokens: estimatedTokens } };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj, recoveryStrategy } = errorHandler.handleAiError(
        error,
        "generateContent"
      );
      return {
        success: false,
        error: errorObj,
        recoveryStrategy
      };
    }
  }

  /**
   * Batch embedding generation with rate limiting
   */
  async generateBatchEmbeddings(texts) {
    const results = [];
    logger.info("AI_INFERENCE", `Starting batch embeddings for ${texts.length} texts`);

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const result = await this.generateEmbedding(text);
      results.push(result);

      // Rate limiting between requests
      if (i < texts.length - 1) {
        await this._sleep(getConfig("SYSTEM.EMBEDDING_RATE_LIMIT_MS"));
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info("AI_INFERENCE", `Batch embeddings completed`, {
      total: texts.length,
      successful: successCount,
      failed: texts.length - successCount
    });

    return results;
  }

  /**
   * Helper: sleep for rate limiting
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck() {
    const config = this.validateConfiguration();
    if (!config.valid) {
      return { healthy: false, error: config.error };
    }

    // Try a simple embedding to verify API is working
    const result = await this.generateEmbedding("test");
    return {
      healthy: result.success,
      apiConfigured: true,
      modelAvailable: {
        embedding: this.embeddingModel,
        generation: this.generationModel
      }
    };
  }
}

// Export singleton
export const aiInferenceService = new AiInferenceService();
export default aiInferenceService;
