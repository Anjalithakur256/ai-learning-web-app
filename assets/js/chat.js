import { api } from "./services/api-service.js";
import logger from "./services/logger.js";
import { auth } from "./db.js";
import { extractTextFromImage, formatHomeworkProblem } from "./ocr-processor.js";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatEmpty = document.getElementById("chatEmpty");

const state = {
  userId: null,
  topicId: null,
  sessionId: null,
  currentStage: 0,
  masteryLevel: 0
};

function resolveTopicId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("topic") || "ai-basics";
}

function setChatEmptyVisible(isVisible) {
  if (!chatEmpty) {
    return;
  }
  chatEmpty.style.display = isVisible ? "flex" : "none";
}


function appendMessage(text, isUser = false) {
  if (!chatMessages) {
    return null;
  }

  setChatEmptyVisible(false);

  const message = document.createElement("div");
  message.className = `chat-message${isUser ? " user" : " ai"}`;

  const messageBody = document.createElement("div");
  messageBody.className = "message-body";
  messageBody.innerHTML = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  message.appendChild(messageBody);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return message;
}

function appendTypingIndicator() {
  if (!chatMessages) {
    return null;
  }

  const message = document.createElement("div");
  message.className = "chat-message ai typing";

  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-dots";
  typingDiv.innerHTML = "<span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span>";

  message.appendChild(typingDiv);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return message;
}

async function initializeSession() {
  state.topicId = resolveTopicId();
  state.userId = auth.currentUser?.uid || "anonymous";

  // API key is stored server-side — no client-side key needed.
  const health = await api.systemHealth();
  if (!health.success) {
    appendMessage("System health check failed. Please refresh and try again.");
    return;
  }


  const sessionResult = await api.tutorSessionStart(state.userId, state.topicId);
  if (sessionResult.success) {
    state.sessionId = sessionResult.data.sessionId;
    state.currentStage = sessionResult.data.currentStage ?? 0;
    state.masteryLevel = sessionResult.data.masteryLevel ?? 0;
  } else {
    logger.warn("CHAT", "Tutor session start failed", sessionResult.error);
  }

  if (chatMessages && chatMessages.children.length === 0) {
    appendMessage("Welcome to the AI Tutor. Ask a question to get started.");
  }
}


async function callGemini(message) {
  const health = await api.systemHealth();
  if (!health.success) {
    appendMessage("System is unavailable. Please refresh and try again.");
    return;
  }

  // Create a new history session on the very first message
  const hooks = window.__chatHistoryHooks;
  if (hooks && !window.__currentHistorySessionId) {
    window.__currentHistorySessionId = hooks.createSession(message);
  }

  const typingIndicator = appendTypingIndicator();

  const result = await api.tutorQuery(
    message,
    state.userId || "anonymous",
    state.topicId || "ai-basics",
    state.currentStage,
    state.masteryLevel
  );

  typingIndicator?.remove();

  if (!result.success) {
    const errorMessage =
      typeof result.error === "string"
        ? result.error
        : result.error?.userMessage || result.error?.message;
    appendMessage(errorMessage || "Tutor response failed. Try again.");
    logger.warn("CHAT", "Tutor query failed", result.error);
    return;
  }

  const responseText = result.data?.response || "I could not generate a response.";
  appendMessage(responseText);
  state.currentStage = result.data?.nextStage ?? state.currentStage;
  state.masteryLevel = result.data?.masteryLevel ?? state.masteryLevel;

  // Save to history
  if (hooks && window.__currentHistorySessionId) {
    hooks.updateSession(message, responseText);
  }
}

function handleSubmit(event) {
  event.preventDefault();
  if (!chatInput) {
    return;
  }

  const message = chatInput.value.trim();
  if (!message) {
    return;
  }

  appendMessage(message, true);
  chatInput.value = "";
  chatInput.disabled = true;

  callGemini(message).finally(() => {
    chatInput.disabled = false;
    chatInput.focus();
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", handleSubmit);
}


if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm?.requestSubmit();
    }
  });
}

window.appendMessage = appendMessage;
window.callGemini = callGemini;
window.extractTextFromImage = extractTextFromImage;
window.formatHomeworkProblem = formatHomeworkProblem;

initializeSession();
