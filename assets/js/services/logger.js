/**
 * PHASE 3: Logger Service
 * Comprehensive logging, metrics, and observability
 * Layer: Infrastructure/Observability
 */

import { CONFIG, getConfig } from "./config.js";

class LoggerService {
  constructor() {
    this.logs = [];
    this.metrics = {};
    this.sessionId = this._generateSessionId();
    this.startTime = Date.now();
  }

  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log entry structure
   */
  _createLogEntry(level, category, message, data = {}) {
    return {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      level,
      category,
      message,
      data,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Output log to console and storage
   */
  _output(entry) {
    if (!getConfig("LOGGING.ENABLED")) return;

    // Store in memory
    this.logs.push(entry);
    if (this.logs.length > getConfig("LOGGING.MAX_LOGS_PER_SESSION")) {
      this.logs.shift(); // Remove oldest
    }

    // Console output
    if (getConfig("LOGGING.CONSOLE_OUTPUT")) {
      const color = this._getColorForLevel(entry.level);
      const prefix = `%c[${entry.level}] ${entry.category}`;
      console.log(
        `${prefix} - ${entry.message}`,
        `color: ${color}; font-weight: bold;`,
        entry.data
      );
    }
  }

  _getColorForLevel(level) {
    const colors = {
      DEBUG: "#888888",
      INFO: "#0066cc",
      WARN: "#ff9900",
      ERROR: "#cc0000"
    };
    return colors[level] || "#000000";
  }

  /**
   * Log levels
   */
  debug(category, message, data = {}) {
    if (getConfig("LOGGING.LEVEL") === "DEBUG") {
      this._output(this._createLogEntry("DEBUG", category, message, data));
    }
  }

  info(category, message, data = {}) {
    this._output(this._createLogEntry("INFO", category, message, data));
  }

  warn(category, message, data = {}) {
    this._output(this._createLogEntry("WARN", category, message, data));
  }

  error(category, message, data = {}, error = null) {
    const errorData = { ...data };
    if (error && getConfig("ERRORS.LOG_STACK_TRACE")) {
      errorData.stack = error.stack;
      errorData.errorMessage = error.message;
    }
    this._output(this._createLogEntry("ERROR", category, message, errorData));
  }

  /**
   * Performance metrics tracking
   */
  startMetric(key) {
    if (!getConfig("PERFORMANCE.ENABLED")) return;
    this.metrics[key] = { start: Date.now() };
  }

  endMetric(key, metadata = {}) {
    if (!getConfig("PERFORMANCE.ENABLED")) {
      return 0;
    }

    if (!this.metrics[key]) {
      this.warn("METRICS", `Metric ${key} not started`);
      return 0;
    }

    const duration = Date.now() - this.metrics[key].start;
    this.metrics[key].duration = duration;
    this.metrics[key].metadata = metadata;

    // Log slow operations
    if (duration > getConfig("PERFORMANCE.SLOW_THRESHOLD_MS")) {
      this.warn("PERFORMANCE", `Slow operation: ${key}`, {
        duration,
        threshold: getConfig("PERFORMANCE.SLOW_THRESHOLD_MS"),
        ...metadata
      });
    }

    return duration;
  }

  /**
   * Get metric summary
   */
  getMetricsSummary() {
    const summary = {};
    for (const [key, value] of Object.entries(this.metrics)) {
      if (value.duration) {
        summary[key] = {
          duration: value.duration,
          metadata: value.metadata
        };
      }
    }
    return summary;
  }

  /**
   * API call tracking helper
   */
  trackApiCall(service, operation, requestData = {}, responseData = {}) {
    this.info("API", `${service}.${operation}`, {
      request: this._sanitize(requestData),
      response: this._sanitize(responseData)
    });
  }

  /**
   * Database operation tracking helper
   */
  trackDbOperation(collection, operation, data = {}) {
    this.debug("DATABASE", `${collection}.${operation}`, this._sanitize(data));
  }

  /**
   * AI Inference tracking helper
   */
  trackAiInference(model, tokens = 0, duration = 0) {
    this.info("AI_INFERENCE", `${model} inference`, {
      tokens,
      duration,
      tokensPerSecond: tokens > 0 && duration > 0 ? Math.round((tokens / duration) * 1000) : 0
    });
  }

  /**
   * Remove sensitive data from logs
   */
  _sanitize(data) {
    const sensitive = ["password", "token", "key", "secret", "apiKey", "auth"];
    const sanitized = { ...data };

    for (const key of Object.keys(sanitized)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = "***REDACTED***";
      }
    }

    return sanitized;
  }

  /**
   * Get all logs
   */
  getLogs(filter = {}) {
    let results = [...this.logs];

    if (filter.level) {
      results = results.filter(l => l.level === filter.level);
    }
    if (filter.category) {
      results = results.filter(l => l.category === filter.category);
    }
    if (filter.startTime) {
      results = results.filter(l => new Date(l.timestamp) >= filter.startTime);
    }

    return results;
  }

  /**
   * Export session logs for analysis
   */
  exportLogs(format = "json") {
    const logData = {
      sessionId: this.sessionId,
      startTime: new Date(this.startTime).toISOString(),
      duration: Date.now() - this.startTime,
      totalLogs: this.logs.length,
      logs: this.logs,
      metrics: this.getMetricsSummary()
    };

    if (format === "json") {
      return JSON.stringify(logData, null, 2);
    }
    if (format === "csv") {
      return this._convertToCsv(this.logs);
    }

    return logData;
  }

  _convertToCsv(logs) {
    if (logs.length === 0) return "";

    const headers = ["timestamp", "level", "category", "message"];
    const rows = logs.map(log =>
      [log.timestamp, log.level, log.category, log.message]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    return [headers.join(","), ...rows].join("\n");
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Session summary
   */
  getSessionSummary() {
    const logLevels = {};
    const categories = {};

    for (const log of this.logs) {
      logLevels[log.level] = (logLevels[log.level] || 0) + 1;
      categories[log.category] = (categories[log.category] || 0) + 1;
    }

    return {
      sessionId: this.sessionId,
      duration: Date.now() - this.startTime,
      totalLogs: this.logs.length,
      byLevel: logLevels,
      byCategory: categories,
      metrics: this.getMetricsSummary()
    };
  }
}

// Global singleton instance
export const logger = new LoggerService();

// Export for use across application
export default logger;
