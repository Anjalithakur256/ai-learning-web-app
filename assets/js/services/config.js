/**
 * PHASE 3: System Configuration
 * Centralized configuration for API keys, endpoints, and system parameters
 * Layer: Infrastructure
 */

export const CONFIG = {
  // ====== API Configuration ======
  // API key is stored server-side (Firebase Secrets). Never put it here.
  GEMINI_API_KEY: "",
  GEMINI_BASE_URL: "https://openrouter.ai/api/v1",
  GEMINI_PROXY_URL: "/api/gemini",
  GEMINI_MODELS: {
    TEXT_EMBEDDING: "openai/text-embedding-3-small",
    GENERATION: "openai/gpt-oss-20b"
  },

  // ====== System Parameters ======
  SYSTEM: {
    RESPONSE_TIMEOUT_MS: 20000,
    RAG_TOP_K: 3,
    RAG_SIMILARITY_THRESHOLD: 0.3,
    EMBEDDING_BATCH_SIZE: 5,
    EMBEDDING_RATE_LIMIT_MS: 100,
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000,
    REQUEST_TIMEOUT_MS: 30000
  },

  // ====== Socratic System Parameters ======
  SOCRATIC: {
    STAGES: {
      CLARIFY: 0,
      HINT: 1,
      GUIDE: 2,
      VERIFY: 3,
      EXPLAIN: 4
    },
    INITIAL_STAGE: 0,
    STAGE_DURATION_MIN: 2,
    STAGE_DURATION_MAX: 5
  },

  // ====== Mastery Tracking Parameters ======
  MASTERY: {
    INITIAL_LEVEL: 0,
    SUCCESS_INCREMENT: 10,
    FAILURE_DECREMENT: 5,
    MINIMUM: 0,
    MAXIMUM: 100,
    SUCCESS_THRESHOLD: 70
  },

  // ====== OCR Parameters ======
  OCR: {
    TESSERACT_CDN: "https://cdn.jsdelivr.net/npm/tesseract.js@5",
    LANGUAGE: "eng",
    MIN_CONFIDENCE: 0.7,
    PROBLEM_TYPES: {
      MATH: "math",
      PHYSICS: "physics",
      CHEMISTRY: "chemistry",
      PROGRAMMING: "programming"
    }
  },

  // ====== Voice Parameters ======
  VOICE: {
    LANGUAGE: "en-US",
    CONTINUOUS: false,
    INTERIM_RESULTS: false
  },

  // ====== Firebase Configuration ======
  FIREBASE: {
    // Will be initialized from existing db.js
    USE_EXISTING: true
  },

  // ====== Logging Configuration ======
  LOGGING: {
    ENABLED: true,
    LEVEL: "INFO", // DEBUG, INFO, WARN, ERROR
    CONSOLE_OUTPUT: true,
    FIREBASE_LOGGING: true,
    MAX_LOGS_PER_SESSION: 1000
  },

  // ====== Performance Monitoring ======
  PERFORMANCE: {
    ENABLED: true,
    TRACK_API_CALLS: true,
    TRACK_DB_OPERATIONS: true,
    TRACK_AI_INFERENCE: true,
    SAMPLE_RATE: 1.0, // Log 100% of operations
    SLOW_THRESHOLD_MS: 1000 // Log as slow if > 1s
  },

  // ====== Error Handling ======
  ERRORS: {
    RETRY_ON_NETWORK_ERROR: true,
    RETRY_ON_TIMEOUT: true,
    RETRY_ON_RATE_LIMIT: true,
    SHOW_USER_ERRORS: true,
    LOG_STACK_TRACE: true
  },

  // ====== Feature Flags ======
  FEATURES: {
    VOICE_INPUT: true,
    IMAGE_OCR: true,
    RAG_SEARCH: true,
    SOCRATIC_METHOD: true,
    MASTERY_TRACKING: true,
    CONVERSATION_LOGGING: true,
    ERROR_RECOVERY: true
  }
};

/**
 * Get configuration value by path (e.g., "SYSTEM.RESPONSE_TIMEOUT_MS")
 */
export function getConfig(path) {
  const keys = path.split(".");
  let value = CONFIG;
  for (const key of keys) {
    value = value?.[key];
  }
  return value;
}

/**
 * Update configuration at runtime (e.g., for API key injection)
 */
export function setConfig(path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  let obj = CONFIG;
  for (const key of keys) {
    obj[key] = obj[key] || {};
    obj = obj[key];
  }
  obj[lastKey] = value;
}

// Export for debugging
export default CONFIG;
