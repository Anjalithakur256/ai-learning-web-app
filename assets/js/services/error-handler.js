/**
 * PHASE 3: Error Handler Service
 * Centralized error management with recovery strategies
 * Layer: Infrastructure/Error Management
 */

import { CONFIG, getConfig } from "./config.js";
import logger from "./logger.js";

class ErrorHandler {
  constructor() {
    this.errorCodes = {
      // Network/API errors
      NETWORK_ERROR: "NETWORK_001",
      TIMEOUT_ERROR: "NETWORK_002",
      RATE_LIMIT_ERROR: "NETWORK_003",
      API_ERROR: "NETWORK_004",
      INVALID_API_KEY: "NETWORK_005",

      // Database errors
      DB_CONNECTION_ERROR: "DATABASE_001",
      DB_OPERATION_ERROR: "DATABASE_002",
      DB_PERMISSION_ERROR: "DATABASE_003",
      DB_NOT_FOUND: "DATABASE_004",

      // Validation errors
      INVALID_INPUT: "VALIDATION_001",
      MISSING_REQUIRED_FIELD: "VALIDATION_002",
      INVALID_FORMAT: "VALIDATION_003",

      // AI/Gemini errors
      GEMINI_API_ERROR: "AI_001",
      EMBEDDING_ERROR: "AI_002",
      GENERATION_ERROR: "AI_003",
      MODEL_NOT_FOUND: "AI_004",

      // Feature errors
      OCR_ERROR: "FEATURE_001",
      SPEECH_ERROR: "FEATURE_002",
      RAG_ERROR: "FEATURE_003",

      // Authentication errors
      AUTH_FAILED: "AUTH_001",
      SESSION_EXPIRED: "AUTH_002",
      UNAUTHORIZED: "AUTH_003",

      // Unknown
      UNKNOWN_ERROR: "UNKNOWN_001"
    };

    this.severityLevels = {
      CRITICAL: "CRITICAL", // System down
      HIGH: "HIGH", // Major feature broken
      MEDIUM: "MEDIUM", // Feature degraded
      LOW: "LOW" // Non-critical issue
    };
  }

  /**
   * Create standardized error object
   */
  createError(code, message, context = {}, originalError = null) {
    const error = {
      code,
      message,
      context,
      timestamp: new Date().toISOString(),
      severity: this._getSeverity(code),
      recoverable: this._isRecoverable(code),
      userMessage: this._getUserMessage(code, message),
      originalError: originalError ? originalError.message : null
    };

    logger.error("ERROR_HANDLER", `Error ${code}: ${message}`, error, originalError);
    return error;
  }

  /**
   * Handle API errors with retry logic
   */
  async handleApiError(error, service, operation, retryCount = 0) {
    let errorCode = this.errorCodes.API_ERROR;
    let recoveryStrategy = null;

    // Network error
    if (!navigator.onLine || error.message === "Failed to fetch") {
      errorCode = this.errorCodes.NETWORK_ERROR;
      if (getConfig("ERRORS.RETRY_ON_NETWORK_ERROR") && retryCount < getConfig("SYSTEM.MAX_RETRIES")) {
        recoveryStrategy = "RETRY_AFTER_DELAY";
      }
    }

    // Timeout
    if (error.message.includes("timeout") || error.name === "AbortError") {
      errorCode = this.errorCodes.TIMEOUT_ERROR;
      if (getConfig("ERRORS.RETRY_ON_TIMEOUT") && retryCount < getConfig("SYSTEM.MAX_RETRIES")) {
        recoveryStrategy = "RETRY_WITH_LONGER_TIMEOUT";
      }
    }

    // Rate limit (429)
    if (error.status === 429) {
      errorCode = this.errorCodes.RATE_LIMIT_ERROR;
      if (getConfig("ERRORS.RETRY_ON_RATE_LIMIT") && retryCount < getConfig("SYSTEM.MAX_RETRIES")) {
        recoveryStrategy = "RETRY_WITH_EXPONENTIAL_BACKOFF";
      }
    }

    // Invalid API key (401, 403)
    if (error.status === 401 || error.status === 403) {
      errorCode = this.errorCodes.INVALID_API_KEY;
      recoveryStrategy = "VALIDATE_API_KEY";
    }

    const errorObj = this.createError(
      errorCode,
      `${service}.${operation} failed: ${error.message}`,
      {
        service,
        operation,
        status: error.status,
        retryCount,
        recoveryStrategy
      },
      error
    );

    return {
      error: errorObj,
      recoveryStrategy,
      retryCount
    };
  }

  /**
   * Handle database errors
   */
  handleDatabaseError(error, operation) {
    let errorCode = this.errorCodes.DB_OPERATION_ERROR;
    let recoveryStrategy = null;

    if (error.code === "permission-denied") {
      errorCode = this.errorCodes.DB_PERMISSION_ERROR;
      recoveryStrategy = "AUTHENTICATE";
    }

    if (error.code === "not-found") {
      errorCode = this.errorCodes.DB_NOT_FOUND;
    }

    const errorObj = this.createError(
      errorCode,
      `Database operation failed: ${operation}`,
      { operation, firebaseError: error.code, recoveryStrategy },
      error
    );

    return { error: errorObj, recoveryStrategy };
  }

  /**
   * Handle validation errors
   */
  handleValidationError(field, expectedFormat) {
    return this.createError(
      this.errorCodes.INVALID_INPUT,
      `Invalid input for ${field}`,
      { field, expectedFormat }
    );
  }

  /**
   * Handle AI/Gemini errors
   */
  handleAiError(error, operation) {
    let errorCode = this.errorCodes.GEMINI_API_ERROR;
    let recoveryStrategy = null;

    const messageText = error.message?.toLowerCase() || "";

    if (messageText.includes("rate limit") || messageText.includes("quota")) {
      errorCode = this.errorCodes.RATE_LIMIT_ERROR;
      recoveryStrategy = "BACKOFF_AND_RETRY";
    }

    if (messageText.includes("invalid api key") || messageText.includes("auth")) {
      errorCode = this.errorCodes.INVALID_API_KEY;
      recoveryStrategy = "VALIDATE_API_KEY";
    }

    if (operation.includes("embed")) {
      errorCode = this.errorCodes.EMBEDDING_ERROR;
    } else if (operation.includes("generate")) {
      errorCode = this.errorCodes.GENERATION_ERROR;
    }

    const errorObj = this.createError(
      errorCode,
      `AI operation failed: ${operation}`,
      { operation, aiError: error.message, recoveryStrategy },
      error
    );

    return { error: errorObj, recoveryStrategy };
  }

  /**
   * Get user-friendly error message
   */
  _getUserMessage(code, defaultMessage) {
    const userMessages = {
      NETWORK_001: "Network error. Please check your internet connection.",
      NETWORK_002: "Request took too long. Please try again.",
      NETWORK_003: "Too many requests. Please wait a moment and try again.",
      NETWORK_004: "API error. Please try again.",
      NETWORK_005: "Invalid API key configuration. Please contact support.",

      DATABASE_001: "Database connection failed. Please try again.",
      DATABASE_002: "Database operation failed. Please try again.",
      DATABASE_003: "Permission denied. Please sign in again.",
      DATABASE_004: "Data not found. Please refresh and try again.",

      VALIDATION_001: "Invalid input. Please check your data.",
      VALIDATION_002: "Missing required field.",
      VALIDATION_003: "Invalid format. Please check your input.",

      AI_001: "AI service error. Please try again.",
      AI_002: "Failed to process embeddings. Please try again.",
      AI_003: "Failed to generate response. Please try again.",
      AI_004: "Model not available. Please try again later.",

      FEATURE_001: "Image processing failed. Please try with a clearer image.",
      FEATURE_002: "Voice input not supported in your browser.",
      FEATURE_003: "Search failed. Please try a different query.",

      AUTH_001: "Authentication failed. Please check your credentials.",
      AUTH_002: "Your session has expired. Please sign in again.",
      AUTH_003: "You don't have permission to perform this action."
    };

    return userMessages[code] || defaultMessage;
  }

  /**
   * Get error severity
   */
  _getSeverity(code) {
    if (code.startsWith("NETWORK_") || code.startsWith("DATABASE_")) {
      return this.severityLevels.HIGH;
    }
    if (code.startsWith("VALIDATION_")) {
      return this.severityLevels.LOW;
    }
    if (code.startsWith("AI_")) {
      return this.severityLevels.MEDIUM;
    }
    return this.severityLevels.MEDIUM;
  }

  /**
   * Check if error is recoverable
   */
  _isRecoverable(code) {
    const nonRecoverable = [
      this.errorCodes.INVALID_API_KEY,
      this.errorCodes.DB_PERMISSION_ERROR,
      this.errorCodes.AUTH_FAILED
    ];

    return !nonRecoverable.includes(code);
  }

  /**
   * Get recovery instruction for UI
   */
  getRecoveryInstruction(error) {
    const instructions = {
      RETRY_AFTER_DELAY: "Retrying in a moment...",
      RETRY_WITH_LONGER_TIMEOUT: "Processing... this may take a moment.",
      RETRY_WITH_EXPONENTIAL_BACKOFF: "Server busy. Retrying shortly...",
      VALIDATE_API_KEY: "Please check your API key configuration.",
      AUTHENTICATE: "Please sign in to continue.",
      BACKOFF_AND_RETRY: "Waiting before retry..."
    };

    return instructions[error.recoveryStrategy] ||
      (error.recoverable ? "Retrying..." : "Please try again later.");
  }
}

// Global singleton
export const errorHandler = new ErrorHandler();

export default errorHandler;
