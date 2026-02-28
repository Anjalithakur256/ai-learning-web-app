/**
 * PHASE 3: RAG Engine Service
 * Retrieval-Augmented Generation with vector similarity search
 * Layer: RAG Engine / Layer 3
 */

import { getConfig } from "./config.js";
import logger from "./logger.js";
import { errorHandler } from "./error-handler.js";
import { aiInferenceService } from "./ai-inference-service.js";
import { databaseService } from "./database-service.js";

class RagEngineService {
  constructor() {
    this.similarityThreshold = getConfig("SYSTEM.RAG_SIMILARITY_THRESHOLD");
    this.topK = getConfig("SYSTEM.RAG_TOP_K");
  }

  /**
   * Compute cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Execute RAG pipeline: embed query → retrieve chunks → build context
   */
  async executeRagPipeline(query, topicId = null, options = {}) {
    const metricKey = `rag_pipeline_${Date.now()}`;
    logger.startMetric(metricKey);

    try {
      // Step 1: Embed the query
      logger.debug("RAG", "Step 1: Embedding query");
      const embeddingResult = await aiInferenceService.generateEmbedding(query);

      if (!embeddingResult.success) {
        throw new Error(
          `Embedding failed: ${embeddingResult.error?.message || "Unknown error"}`
        );
      }

      const queryEmbedding = embeddingResult.data;

      // Step 2: Retrieve chunks from database
      logger.debug("RAG", "Step 2: Retrieving chunks from database");
      let chunks = [];
      if (topicId) {
        const chunksResult = await databaseService.getChunksByTopic(topicId);
        if (chunksResult.success) {
          chunks = chunksResult.data || [];
        }
      }

      // Step 3: Score chunks by similarity
      logger.debug("RAG", "Step 3: Computing similarity scores");
      const scoredChunks = chunks
        .map(chunk => ({
          ...chunk,
          similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding || [])
        }))
        .filter(chunk => chunk.similarity >= this.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.topK || this.topK);

      // Step 4: Build context
      logger.debug("RAG", "Step 4: Building context from chunks");
      const context = this._buildContext(scoredChunks);

      const duration = logger.endMetric(metricKey, {
        queryLength: query.length,
        totalChunks: chunks.length,
        retrievedChunks: scoredChunks.length,
        similarityThreshold: this.similarityThreshold
      });

      logger.info("RAG", `RAG pipeline completed`, {
        queryLength: query.length,
        chunksRetrieved: scoredChunks.length,
        averageSimilarity:
          scoredChunks.length > 0
            ? (
                scoredChunks.reduce((sum, c) => sum + c.similarity, 0) /
                scoredChunks.length
              ).toFixed(3)
            : 0,
        duration
      });

      return {
        success: true,
        data: {
          context,
          chunks: scoredChunks,
          queryEmbedding,
          statistics: {
            totalChunks: chunks.length,
            retrievedChunks: scoredChunks.length,
            averageSimilarity:
              scoredChunks.length > 0
                ? scoredChunks.reduce((sum, c) => sum + c.similarity, 0) / scoredChunks.length
                : 0
          }
        }
      };
    } catch (error) {
      logger.endMetric(metricKey);
      logger.error("RAG", "RAG pipeline failed", { query: query.substring(0, 100) }, error);
      const { error: errorObj } = errorHandler.handleAiError(error, "executeRagPipeline");
      return {
        success: false,
        error: errorObj,
        data: {
          context: "", // Return empty context for graceful degradation
          chunks: [],
          statistics: { totalChunks: 0, retrievedChunks: 0 }
        }
      };
    }
  }

  /**
   * Build context string from retrieved chunks
   */
  _buildContext(chunks) {
    if (chunks.length === 0) {
      return "";
    }

    const contextParts = chunks.map((chunk, index) => {
      const relevance = (chunk.similarity * 100).toFixed(0);
      return `[Source ${index + 1} - Relevance: ${relevance}%]\n${chunk.text}`;
    });

    return `RETRIEVED CONTEXT:\n${contextParts.join("\n\n---\n\n")}\n\nUSE THE ABOVE CONTEXT TO ANSWER THE QUESTION.`;
  }

  /**
   * Store embedding with text chunk
   */
  async storeChunkWithEmbedding(text, metadata = {}) {
    const metricKey = `rag_storeChunk_${Date.now()}`;
    logger.startMetric(metricKey);

    try {
      // Generate embedding for the chunk
      const embeddingResult = await aiInferenceService.generateEmbedding(text);

      if (!embeddingResult.success) {
        throw new Error("Failed to generate embedding for chunk");
      }

      // Store chunk in database with embedding
      const chunkData = {
        text,
        embedding: embeddingResult.data,
        embeddingModel: getConfig("GEMINI_MODELS.TEXT_EMBEDDING"),
        textLength: text.length,
        ...metadata
      };

      const storeResult = await databaseService.createChunk(chunkData);
      logger.endMetric(metricKey, { operation: "STORE_CHUNK_WITH_EMBEDDING" });

      return storeResult;
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleAiError(error, "storeChunkWithEmbedding");
      return { success: false, error: errorObj };
    }
  }

  /**
   * Store multiple chunks with embeddings (batch)
   */
  async storeChunksWithEmbeddings(textChunks, metadata = {}) {
    logger.info("RAG", `Starting batch chunk storage for ${textChunks.length} chunks`);

    const results = [];
    for (let i = 0; i < textChunks.length; i++) {
      const text = textChunks[i];
      const result = await this.storeChunkWithEmbedding(text, {
        ...metadata,
        chunkIndex: i
      });
      results.push(result);

      // Rate limiting
      if (i < textChunks.length - 1) {
        await this._sleep(getConfig("SYSTEM.EMBEDDING_RATE_LIMIT_MS"));
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info("RAG", `Batch chunk storage completed`, {
      total: textChunks.length,
      successful: successCount,
      failed: textChunks.length - successCount
    });

    return results;
  }

  /**
   * Search chunks by query
   */
  async searchChunks(query, topicId = null) {
    return this.executeRagPipeline(query, topicId);
  }

  /**
   * Get chunk statistics
   */
  async getChunkStatistics(topicId = null) {
    logger.debug("RAG", "Fetching chunk statistics");

    let chunks = [];
    if (topicId) {
      const result = await databaseService.getChunksByTopic(topicId);
      chunks = result.data || [];
    }

    return {
      totalChunks: chunks.length,
      averageTextLength:
        chunks.length > 0
          ? chunks.reduce((sum, c) => sum + (c.textLength || c.text?.length || 0), 0) /
            chunks.length
          : 0,
      embeddedChunks: chunks.filter(c => c.embedding).length,
      topics: [...new Set(chunks.map(c => c.topicId))]
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const ragEngineService = new RagEngineService();
export default ragEngineService;
