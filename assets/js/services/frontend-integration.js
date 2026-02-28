/**
 * PHASE 3: Frontend Integration Layer
 * Complete example showing how the API Service is used in the frontend
 * 
 * This demonstrates:
 * - Using the unified API facade
 * - Reactive UI updates
 * - Error handling with custom errors
 * - Performance monitoring via metrics
 */

import { api } from "./services/api-service.js";
import logger from "./services/logger.js";

class DashboardController {
  constructor() {
    this.currentUser = null;
    this.currentTopic = null;
    this.tutorSession = null;
  }

  /**
   * Initialize the dashboard
   */
  async initialize() {
    try {
      // Check system health
      const health = await api.systemHealth();
      if (!health.success) {
        console.error("System health check failed");
        return;
      }

      logger.info("Dashboard", "System operational", { sessionId: health.data.sessionId });

      // Set up event listeners
      this._setupEventListeners();

      // Display system info
      this._displaySystemStatus(health.data);
    } catch (error) {
      logger.error("Dashboard", "Initialization failed", {}, error);
      this._showErrorNotification("Failed to initialize dashboard");
    }
  }

  /**
   * AUTHENTICATION: User login
   */
  async login(email, password) {
    logger.info("Dashboard", "Login attempted", { email });

    const result = await api.authLogin(email, password);

    if (result.success) {
      this.currentUser = result.data;
      logger.info("Dashboard", "Login successful", { userId: result.data.userId });
      this._updateUI("login-success");
      this._loadUserDashboard();
    } else {
      logger.warn("Dashboard", "Login failed", { error: result.error });
      this._showErrorNotification(result.error.message);
    }

    return result;
  }

  /**
   * AUTHENTICATION: User registration
   */
  async register(email, password, displayName) {
    logger.info("Dashboard", "Registration attempted", { email, displayName });

    const result = await api.authRegister(email, password, displayName);

    if (result.success) {
      logger.info("Dashboard", "Registration successful", { userId: result.data.userId });
      this._showSuccessNotification("Registration successful! Please log in.");
      this._updateUI("registration-success");
    } else {
      logger.warn("Dashboard", "Registration failed", { error: result.error });
      this._showErrorNotification(result.error.message);
    }

    return result;
  }

  /**
   * TUTOR: Start tutoring session
   */
  async startTutorSession(topicId) {
    logger.info("Dashboard", "Starting tutor session", { userId: this.currentUser.userId, topicId });

    const result = await api.tutorSessionStart(this.currentUser.userId, topicId);

    if (result.success) {
      this.tutorSession = result.data;
      this.currentTopic = topicId;
      logger.info("Dashboard", "Tutor session started", {
        sessionId: result.data.sessionId
      });
      this._displayTutorSession(result.data);
    } else {
      logger.error("Dashboard", "Failed to start tutor session", {}, new Error(result.error.message));
      this._showErrorNotification("Failed to start tutoring session");
    }

    return result;
  }

  /**
   * TUTOR: Process student query
   */
  async submitTutorQuery(queryText) {
    if (!this.tutorSession || !this.currentUser) {
      this._showErrorNotification("No active tutoring session");
      return;
    }

    logger.info("Dashboard", "Processing tutor query", {
      userId: this.currentUser.userId,
      topicId: this.currentTopic,
      queryLength: queryText.length
    });

    // Show loading state
    this._showLoadingIndicator("Processing your question...");

    const result = await api.tutorQuery(
      queryText,
      this.currentUser.userId,
      this.currentTopic,
      this.tutorSession.currentStage,
      this.tutorSession.masteryLevel
    );

    this._hideLoadingIndicator();

    if (result.success) {
      logger.info("Dashboard", "Tutor query processed", {
        nextStage: result.data.nextStage,
        sourceChunks: result.data.sourceChunks.length
      });
      this._displayTutorResponse(result.data);
      this.tutorSession.currentStage = result.data.nextStage;
    } else {
      logger.error("Dashboard", "Tutor query failed", {}, new Error(result.error.message));
      this._showErrorNotification("Failed to process your question");
    }

    return result;
  }

  /**
   * USER: Load user progress
   */
  async loadUserProgress() {
    if (!this.currentUser) return;

    logger.info("Dashboard", "Loading user progress", { userId: this.currentUser.userId });

    const result = await api.userProgress(this.currentUser.userId, this.currentTopic);

    if (result.success) {
      logger.info("Dashboard", "User progress loaded", {
        masteryLevel: result.data.masteryLevel,
        completedTopics: result.data.completedTopics
      });
      this._displayProgressChart(result.data);
    } else {
      logger.warn("Dashboard", "Failed to load progress", { error: result.error });
    }

    return result;
  }

  /**
   * RAG: Search knowledge base
   */
  async searchKnowledgeBase(query) {
    logger.info("Dashboard", "Searching knowledge base", {
      queryLength: query.length,
      topicId: this.currentTopic
    });

    const result = await api.ragSearch(query, this.currentTopic);

    if (result.success) {
      logger.info("Dashboard", "RAG search completed", {
        chunksRetrieved: result.data.chunks.length
      });
      this._displaySearchResults(result.data);
    } else {
      logger.warn("Dashboard", "RAG search failed", { error: result.error });
      this._showErrorNotification("Search failed. Please try again.");
    }

    return result;
  }

  /**
   * SYSTEM: Get session logs for debugging
   */
  async viewSessionLogs() {
    logger.info("Dashboard", "Retrieving session logs");

    const result = await api.systemLogs({ severity: "error" });

    if (result.success) {
      logger.info("Dashboard", "Session logs retrieved", {
        logCount: result.data.logs.length
      });
      return result.data;
    }

    return null;
  }

  // ===== UI HELPER METHODS =====

  /**
   * Display system status
   */
  _displaySystemStatus(status) {
    const element = document.getElementById("system-status");
    if (element) {
      element.innerHTML = `
        <div class="system-status">
          <span class="status-indicator online"></span>
          <span class="status-text">System Online</span>
          <span class="session-id">#${status.sessionId.substring(0, 8)}</span>
        </div>
      `;
    }
  }

  /**
   * Display tutor response
   */
  _displayTutorResponse(data) {
    const element = document.getElementById("tutor-response");
    if (element) {
      element.innerHTML = `
        <div class="tutor-response">
          <div class="response-content">${data.response}</div>
          <div class="socratic-hints">
            ${data.hints.map(h => `<p class="hint">💡 ${h}</p>`).join("")}
          </div>
          <div class="source-chunks">
            <details>
              <summary>📚 Sources (${data.sourceChunks.length} chunks)</summary>
              ${data.sourceChunks.map(c => `
                <div class="source-chunk">
                  <p>${c.content}</p>
                  <small>Topic: ${c.topicId} | Relevance: ${c.relevanceScore.toFixed(2)}</small>
                </div>
              `).join("")}
            </details>
          </div>
        </div>
      `;
    }
  }

  /**
   * Display progress chart
   */
  _displayProgressChart(progress) {
    const element = document.getElementById("progress-chart");
    if (element) {
      const percentComplete = (progress.currentStage / progress.totalStages) * 100;
      element.innerHTML = `
        <div class="progress-container">
          <h3>Your Mastery: ${progress.masteryLevel.toFixed(1)}%</h3>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentComplete}%"></div>
          </div>
          <p>Stage ${progress.currentStage} of ${progress.totalStages}</p>
        </div>
      `;
    }
  }

  /**
   * Display search results
   */
  _displaySearchResults(data) {
    const element = document.getElementById("search-results");
    if (element) {
      element.innerHTML = `
        <div class="search-results">
          <h3>Found ${data.chunks.length} results:</h3>
          ${data.chunks.map(c => `
            <div class="result-item">
              <p>${c.content}</p>
              <small>Relevance: ${(c.score * 100).toFixed(0)}%</small>
            </div>
          `).join("")}
        </div>
      `;
    }
  }

  /**
   * Display tutor session UI
   */
  _displayTutorSession(session) {
    const element = document.getElementById("tutor-interface");
    if (element) {
      element.innerHTML = `
        <div class="tutor-session">
          <div class="session-header">
            <h2>Session: ${session.topicName}</h2>
            <p>Mastery Level: ${session.masteryLevel.toFixed(1)}%</p>
          </div>
          <div id="tutor-response"></div>
          <div class="query-input">
            <textarea id="query-textarea" placeholder="Ask your question..." rows="4"></textarea>
            <button onclick="dashboardController.submitQuery()">Submit</button>
          </div>
        </div>
      `;
    }
  }

  /**
   * Show loading indicator
   */
  _showLoadingIndicator(message = "Loading...") {
    const loader = document.getElementById("loading-indicator");
    if (loader) {
      loader.innerHTML = `<div class="loader"><p>${message}</p></div>`;
      loader.style.display = "block";
    }
  }

  /**
   * Hide loading indicator
   */
  _hideLoadingIndicator() {
    const loader = document.getElementById("loading-indicator");
    if (loader) {
      loader.style.display = "none";
    }
  }

  /**
   * Show error notification
   */
  _showErrorNotification(message) {
    const notification = document.getElementById("notification-container");
    if (notification) {
      const id = Date.now();
      const div = document.createElement("div");
      div.className = "notification error";
      div.id = `notif-${id}`;
      div.innerHTML = `<p>${message}</p>`;
      notification.appendChild(div);

      setTimeout(() => {
        const el = document.getElementById(`notif-${id}`);
        if (el) el.remove();
      }, 5000);
    }
  }

  /**
   * Show success notification
   */
  _showSuccessNotification(message) {
    const notification = document.getElementById("notification-container");
    if (notification) {
      const id = Date.now();
      const div = document.createElement("div");
      div.className = "notification success";
      div.id = `notif-${id}`;
      div.innerHTML = `<p>${message}</p>`;
      notification.appendChild(div);

      setTimeout(() => {
        const el = document.getElementById(`notif-${id}`);
        if (el) el.remove();
      }, 3000);
    }
  }

  /**
   * Update UI state
   */
  _updateUI(state) {
    document.body.dataset.state = state;
  }

  /**
   * Set up event listeners
   */
  _setupEventListeners() {
    // Login form
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        await this.login(email, password);
      });
    }

    // Topic selection
    const topicButtons = document.querySelectorAll("[data-topic-id]");
    topicButtons.forEach(btn => {
      btn.addEventListener("click", async () => {
        const topicId = btn.dataset.topicId;
        await this.startTutorSession(topicId);
      });
    });

    // Query submission
    const submitBtn = document.getElementById("submit-query-btn");
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        const query = document.getElementById("query-textarea").value;
        if (query.trim()) {
          await this.submitTutorQuery(query);
          document.getElementById("query-textarea").value = "";
        }
      });
    }
  }

  /**
   * Helper: Submit query from UI
   */
  async submitQuery() {
    const queryText = document.getElementById("query-textarea").value;
    if (queryText.trim()) {
      await this.submitTutorQuery(queryText);
    }
  }
}

// Export controller
export const dashboardController = new DashboardController();

// Make available globally
window.dashboardController = dashboardController;

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    dashboardController.initialize();
  });
} else {
  dashboardController.initialize();
}
