/**
 * PHASE 3: API Service
 * Unified API facade for all system operations
 * Layer: API Service / Layer 1 (Frontend-facing)
 *
 * This service exposes a clean, REST-like API that the frontend consumes.
 * All operations follow the pattern:
 *   api.{service}/{operation}(params) → Promise<{success, data, error}>
 */

import { getConfig, setConfig } from "./config.js";
import logger from "./logger.js";
import { errorHandler } from "./error-handler.js";
import { databaseService } from "./database-service.js";
import { aiInferenceService } from "./ai-inference-service.js";
import { ragEngineService } from "./rag-engine.js";
import { tutorOrchestratorService } from "./tutor-orchestrator.js";
import { auth } from "../db.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

class ApiServiceFacade {
  constructor() {
    this.sessionId = logger.sessionId;
  }

  // ===== SYSTEM OPERATIONS =====

  /**
   * SYSTEM/health - Health check
   */
  async systemHealth() {
    logger.info("API", "system/health called");
    const config = aiInferenceService.validateConfiguration();

    return {
      success: true,
      data: {
        status: "operational",
        sessionId: this.sessionId,
        apiConfigured: config.valid,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * SYSTEM/config - Get current configuration
   */
  async systemConfig() {
    logger.info("API", "system/config called");
    return {
      success: true,
      data: {
        features: getConfig("FEATURES"),
        system: getConfig("SYSTEM"),
        logging: getConfig("LOGGING")
      }
    };
  }

  /**
   * SYSTEM/logs - Get session logs
   */
  async systemLogs(filter = {}) {
    logger.info("API", "system/logs called");
    const logs = logger.getLogs(filter);
    const summary = logger.getSessionSummary();

    return {
      success: true,
      data: {
        summary,
        logs: logs.slice(-100) // Last 100 logs
      }
    };
  }

  // ===== AUTHENTICATION =====

  /**
   * AUTH/register - Register new user
   */
  async authRegister(email, password, displayName = "") {
    const metricKey = "api_auth_register";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "auth/register called", { email });

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      // Create user profile in Firestore
      const dbResult = await databaseService.createUser(userId, {
        email,
        displayName,
        role: "student"
      });

      logger.endMetric(metricKey, { operation: "REGISTER", userId });

      return {
        success: true,
        data: {
          userId,
          email,
          displayName
        }
      };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "auth",
        "register"
      );
      return { success: false, error: errorObj };
    }
  }

  /**
   * AUTH/login - User login
   */
  async authLogin(email, password) {
    const metricKey = "api_auth_login";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "auth/login called", { email });

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      logger.endMetric(metricKey, { operation: "LOGIN", userId });

      return {
        success: true,
        data: {
          userId,
          email: userCredential.user.email
        }
      };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "auth",
        "login"
      );
      return { success: false, error: errorObj };
    }
  }

  /**
   * AUTH/logout - User logout
   */
  async authLogout() {
    const metricKey = "api_auth_logout";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "auth/logout called");
      await signOut(auth);
      logger.endMetric(metricKey, { operation: "LOGOUT" });
      return { success: true };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "auth",
        "logout"
      );
      return { success: false, error: errorObj };
    }
  }

  /**
   * AUTH/setApiKey - Configure Gemini API key
   */
  async authSetApiKey(apiKey) {
    logger.info("API", "auth/setApiKey called");
    try {
      setConfig("GEMINI_API_KEY", apiKey);
      aiInferenceService.setApiKey(apiKey);
      logger.info("API", "API key configured successfully");
      return { success: true };
    } catch (error) {
      logger.error("API", "Failed to set API key", {}, error);
      return { success: false, error: errorHandler.createError("CONFIG_ERROR", error.message) };
    }
  }

  // ===== TUTOR OPERATIONS =====

  /**
   * TUTOR/session/start - Start tutoring session
   */
  async tutorSessionStart(userId, topicId) {
    const metricKey = "api_tutor_session_start";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "tutor/session/start called", { userId, topicId });
      const sessionData = await tutorOrchestratorService.startSession(userId, topicId);
      logger.endMetric(metricKey, { sessionId: sessionData.sessionId });
      return { success: true, data: sessionData };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "tutor",
        "session/start"
      );
      return { success: false, error: errorObj };
    }
  }

  /**
   * TUTOR/query - Process student query with RAG + Socratic
   */
  async tutorQuery(query, userId, topicId, currentStage = 0, masteryLevel = 0) {
    const metricKey = "api_tutor_query";
    logger.startMetric(metricKey);

    try {
      if (!query || !userId || !topicId) {
        throw new Error("Missing required parameters: query, userId, topicId");
      }

      logger.info("API", "tutor/query called", {
        userId,
        topicId,
        queryLength: query.length
      });

      const result = await tutorOrchestratorService.processTutorQuery(
        query,
        userId,
        topicId,
        currentStage,
        masteryLevel
      );

      if (result.success) {
        logger.endMetric(metricKey, {
          nextStage: result.data.nextStage,
          sourceChunks: result.data.sourceChunks.length
        });
      }

      return result;
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "tutor",
        "query"
      );
      return { success: false, error: errorObj };
    }
  }

  // ===== USER OPERATIONS =====

  /**
   * USER/progress - Get user progress/mastery
   */
  async userProgress(userId, topicId) {
    const metricKey = "api_user_progress";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "user/progress called", { userId, topicId });
      const result = await databaseService.getMastery(userId, topicId);
      logger.endMetric(metricKey, { topicId });
      return result;
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "user",
        "progress"
      );
      return { success: false, error: errorObj };
    }
  }

  /**
   * USER/updateProgress - Update mastery after quiz
   */
  async userUpdateProgress(userId, topicId, quizScore) {
    const metricKey = "api_user_updateProgress";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "user/updateProgress called", {
        userId,
        topicId,
        quizScore
      });
      const result = await databaseService.updateMastery(userId, topicId, quizScore);
      logger.endMetric(metricKey, { topicId, score: quizScore });
      return result;
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "user",
        "updateProgress"
      );
      return { success: false, error: errorObj };
    }
  }

  /**
   * USER/profile - Get user profile
   */
  async userProfile(userId) {
    const metricKey = "api_user_profile";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "user/profile called", { userId });
      const result = await databaseService.getUserProfile(userId);
      logger.endMetric(metricKey);
      return result;
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "user",
        "profile"
      );
      return { success: false, error: errorObj };
    }
  }

  // ===== RAG OPERATIONS =====

  /**
   * RAG/search - Search knowledge base
   */
  async ragSearch(query, topicId = null) {
    const metricKey = "api_rag_search";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "rag/search called", { queryLength: query.length, topicId });
      const result = await ragEngineService.executeRagPipeline(query, topicId);
      if (result.success) {
        logger.endMetric(metricKey, {
          chunksRetrieved: result.data.chunks.length
        });
      }
      return result;
    } catch (error) {
      logger.endMetric(metricKey);
      logger.error("API", "RAG search failed", { query: query.substring(0, 50) }, error);
      return {
        success: false,
        error: errorHandler.createError("RAG_ERROR", "Search failed"),
        data: { context: "", chunks: [] }
      };
    }
  }

  /**
   * RAG/indexDocument - Add document to knowledge base
   */
  async ragIndexDocument(text, metadata = {}) {
    const metricKey = "api_rag_indexDocument";
    logger.startMetric(metricKey);

    try {
      logger.info("API", "rag/indexDocument called", { textLength: text.length });

      // Split text into chunks (sentences)
      const chunks = this._splitIntoChunks(text, 200);
      const results = await ragEngineService.storeChunksWithEmbeddings(chunks, metadata);

      const successCount = results.filter(r => r.success).length;
      logger.endMetric(metricKey, {
        chunksCreated: successCount,
        totalChunks: chunks.length
      });

      return {
        success: successCount > 0,
        data: {
          chunksStored: successCount,
          totalChunks: chunks.length,
          results
        }
      };
    } catch (error) {
      logger.endMetric(metricKey);
      const { error: errorObj } = errorHandler.handleApiError(
        error,
        "rag",
        "indexDocument"
      );
      return { success: false, error: errorObj };
    }
  }

  // ===== ASSESSMENT OPERATIONS (for future expansion) =====

  /**
   * ASSESSMENT/generate - Generate quiz questions
   */
  async assessmentGenerate(topicId, difficulty = "medium", questionCount = 5) {
    logger.info("API", "assessment/generate called", {
      topicId,
      difficulty,
      questionCount
    });

    // This would integrate with AI to generate questions
    // For now, return placeholder
    return {
      success: true,
      data: {
        topicId,
        difficulty,
        questionCount,
        questions: []
      }
    };
  }

  // ===== UTILITIES =====

  /**
   * Split text into chunks
   */
  _splitIntoChunks(text, chunkSize = 200) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= chunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }
}

// Export singleton facade
export const api = new ApiServiceFacade();

// Also expose as window global for console access
window.api = api;

export default api;
