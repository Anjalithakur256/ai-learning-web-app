import { auth, getUserProgress } from "./db.js";

const chatWidget = document.getElementById("chatWidget");
const chatToggle = document.getElementById("chatToggle");
const chatClose = document.getElementById("chatClose");
const chatPanel = document.querySelector(".chat-panel");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatKeyInput = document.getElementById("chatKey");

const GEMINI_API_KEY = "AIzaSyC63B4Q9T64wbvW3B-xTnDc342lNNQW6kA";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Models to try in order (fallback chain)
const MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite"];

// Quick greetings handled locally (no API call needed)
const greetings = ["hi", "hii", "hiii", "hey", "hello", "hola", "yo", "sup", "helo"];
const thankWords = ["thanks", "thank you", "thank u", "thnx", "thx", "ty"];
const byeWords = ["bye", "goodbye", "see you", "see ya", "cya"];

// Get user's learning context
let userContext = {
  completedTopics: [],
  currentLevel: "Beginner",
  recentQuizScore: null
};

async function loadUserContext() {
  try {
    const progress = await getUserProgress();
    if (progress) {
      userContext.currentLevel = progress.level || "Beginner";
      userContext.recentQuizScore = progress.averageScore;
    }
  } catch (e) {
    // Use defaults
  }
}

// Load context when chat opens
if (chatToggle && chatPanel) {
  chatToggle.addEventListener("click", () => {
    chatPanel.classList.toggle("open");
    if (chatPanel.classList.contains("open")) {
      loadUserContext();
      if (chatMessages && chatMessages.children.length === 0) {
        appendMessage("Hi! I'm your AI Learning Assistant 🤖\nAsk me anything about AI, Machine Learning, NLP, or Generative AI.\nI search the web to give you the latest and most accurate answers!");
      }
    }
  });
}

if (chatClose && chatPanel) {
  chatClose.addEventListener("click", () => {
    chatPanel.classList.remove("open");
  });
}

function appendMessage(text, isUser = false) {
  if (!chatMessages) return;
  const message = document.createElement("div");
  message.className = `chat-message${isUser ? " user" : ""}`;
  // Support basic formatting: newlines → <br>, **bold** → <b>
  message.innerHTML = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTypingIndicator() {
  if (!chatMessages) return null;
  const indicator = document.createElement("div");
  indicator.className = "chat-message typing";
  indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  chatMessages.appendChild(indicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return indicator;
}

function getApiKey() {
  const stored = localStorage.getItem("gemini_api_key");
  return chatKeyInput?.value || stored || GEMINI_API_KEY;
}

if (chatKeyInput) {
  const storedKey = localStorage.getItem("gemini_api_key");
  if (storedKey) {
    chatKeyInput.value = storedKey;
  }
  chatKeyInput.addEventListener("change", () => {
    localStorage.setItem("gemini_api_key", chatKeyInput.value.trim());
  });
}

// Check if message is a simple greeting/bye that doesn't need API
function findQuickResponse(userMessage) {
  const lower = userMessage.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

  if (greetings.some(g => lower === g || lower.startsWith(g + " "))) {
    return "Hello! 👋 I'm your AI Learning Assistant. Ask me anything about AI, ML, Deep Learning, NLP, or Generative AI. I'll search the web and explain it clearly!";
  }
  if (thankWords.some(t => lower.includes(t))) {
    return "You're welcome! Keep learning! 🚀 Feel free to ask more questions anytime.";
  }
  if (byeWords.some(b => lower === b || lower.startsWith(b + " "))) {
    return "Goodbye! Happy learning! 🎓 Come back whenever you need help.";
  }
  if (lower === "help" || lower === "what can you do") {
    return "I can help you with:\n• Explaining AI, ML, DL, NLP concepts\n• Answering questions with web search\n• Suggesting what to learn next\n• Breaking down complex topics\n• Providing examples and use cases\n\nJust type your question!";
  }
  return null;
}

// Build prompt for Gemini with web search context
function buildGeminiPrompt(userMessage) {
  return `You are "Gemini Tutor", the AI Learning Assistant for an educational platform called "AI Learning Guide" that teaches AI, Machine Learning, Deep Learning, NLP, and Generative AI.

CONTEXT ABOUT THE PLATFORM:
- The platform has 5 learning tracks: AI Basics, Machine Learning, Deep Learning, NLP, Generative AI
- Topics include: Neural Networks, CNNs, RNNs, Transformers, Regression, Classification, Embeddings, Prompt Engineering, LLMs, etc.
- Users take quizzes after each topic to test understanding

RULES:
- Search the web for the latest, most accurate information when answering
- Give clear, well-structured responses (use bullet points, bold for key terms)
- Use beginner-friendly language adapted to user level
- Focus on AI/ML/DL/NLP/GenAI topics
- If asked about unrelated topics, briefly answer but redirect to AI learning
- Include practical real-world examples
- End with a quick tip or suggest what to explore next
- Keep responses concise (4-6 sentences max unless asked for detail)

USER LEVEL: ${userContext.currentLevel}
${userContext.recentQuizScore ? `QUIZ PERFORMANCE: ${userContext.recentQuizScore}` : ""}

USER QUESTION: ${userMessage}`;
}

// Call Gemini API with web search grounding and retry logic
async function callGemini(prompt, retryCount = 0) {
  const apiKey = getApiKey();
  if (!apiKey) {
    appendMessage("⚙️ No API key found. Add your Gemini API key below to enable AI responses.");
    return;
  }

  const typingIndicator = appendTypingIndicator();

  try {
    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.7,
        topP: 0.9,
        topK: 40
      },
      // Enable Google Search grounding so Gemini fetches real web results
      tools: [{
        googleSearch: {}
      }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
      ]
    };

    // Try each model in the fallback chain
    let lastError = null;
    for (const model of MODELS) {
      const endpoint = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
      
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          typingIndicator?.remove();
          const data = await response.json();
          const reply = data?.candidates?.[0]?.content?.parts
            ?.filter(p => p.text)
            ?.map(p => p.text)
            ?.join("\n\n");

          if (reply) {
            appendMessage(reply.trim());
          } else {
            appendMessage("I couldn't generate a response. Try rephrasing your question.");
          }
          return; // Success — exit
        }

        // If 429 (rate/quota limit), try next model
        if (response.status === 429) {
          lastError = 429;
          continue;
        }
        // If 404, model not available, try next
        if (response.status === 404) {
          lastError = 404;
          continue;
        }

        // Other errors — don't retry on different model
        typingIndicator?.remove();
        if (response.status === 400) {
          appendMessage("❌ Invalid request. Please check your API key in the settings below.");
        } else if (response.status === 403) {
          appendMessage("🔒 API key doesn't have permission. Make sure the Generative Language API is enabled in your Google Cloud project.");
        } else {
          appendMessage(`❌ Error (${response.status}). Please try again.`);
        }
        return;
      } catch (fetchErr) {
        lastError = fetchErr;
        continue; // Network error on this model, try next
      }
    }

    // All models failed
    typingIndicator?.remove();
    if (lastError === 429) {
      if (retryCount < 2) {
        const waitTime = (retryCount + 1) * 5000;
        appendMessage(`⏳ Rate limited. Retrying in ${waitTime / 1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
        chatMessages?.lastChild?.remove();
        return callGemini(prompt, retryCount + 1);
      }
      appendMessage("⏳ API quota exceeded. The free tier has daily limits. Please wait a few minutes or check your billing at Google AI Studio.");
    } else {
      appendMessage("❌ Could not reach the AI service. Please check your internet connection and try again.");
    }
  } catch (error) {
    typingIndicator?.remove();
    console.error("Gemini API error:", error);
    appendMessage("❌ Network error. Check your internet connection and try again.");
  }
}

async function handleUserMessage(message) {
  // First check for quick greetings/thanks (no API needed)
  const quickReply = findQuickResponse(message);
  if (quickReply) {
    appendMessage(quickReply);
    return;
  }

  // Everything else goes to Gemini with web search grounding
  const prompt = buildGeminiPrompt(message);
  await callGemini(prompt);
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    appendMessage(message, true);
    chatInput.value = "";
    chatInput.disabled = true;
    await handleUserMessage(message);
    chatInput.disabled = false;
    chatInput.focus();
  });
}
