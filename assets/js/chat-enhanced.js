// Enhanced Chat Features: Topic Detection, Voice, Image Upload, Concept Breakdown

/* ======== Topic Detection ======== */
const topics = {
  "neural networks": "Neural Networks",
  "deep learning": "Deep Learning",
  "cnn": "Computer Vision (CNN)",
  "rnn": "Recurrent Neural Networks",
  "transformer": "Transformers",
  "nlp": "Natural Language Processing",
  "regression": "Regression",
  "classification": "Classification",
  "embeddings": "Embeddings",
  "llm": "Large Language Models",
  "prompt engineering": "Prompt Engineering",
  "generative ai": "Generative AI",
  "machine learning": "Machine Learning",
  "supervised learning": "Supervised Learning",
  "unsupervised learning": "Unsupervised Learning",
  "reinforcement learning": "Reinforcement Learning",
  "attention mechanism": "Attention Mechanism",
  "backpropagation": "Backpropagation",
  "hyperparameter": "Hyperparameter Tuning",
  "overfitting": "Overfitting & Regularization",
};

function detectTopic(message) {
  const lower = message.toLowerCase();
  for (const [key, value] of Object.entries(topics)) {
    if (lower.includes(key)) {
      return value;
    }
  }
  return "General AI Topics";
}

function updateTopicDetection(message) {
  const detectedTopic = detectTopic(message);
  const topicElement = document.getElementById("detectedTopic");
  const topicBadge = document.getElementById("topicBadge");

  if (topicElement) topicElement.textContent = `Topic: ${detectedTopic}`;
  if (topicBadge) topicBadge.textContent = detectedTopic;
}

/* ======== Action Buttons ======== */
function addActionButtons(messageElement) {
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "message-actions";

  const actions = [
    { label: "📚 Show Step-by-Step", action: "stepby" },
    { label: "💡 Give Hint", action: "hint" },
    { label: "🔗 View Source", action: "source" },
  ];

  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.textContent = action.label;
    btn.addEventListener("click", () => handleAction(action.action, messageElement));
    actionsDiv.appendChild(btn);
  });

  messageElement.appendChild(actionsDiv);
}

function handleAction(action, messageElement) {
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");

  switch (action) {
    case "stepby":
      if (chatInput) {
        chatInput.value = "Can you break this down into step-by-step explanation?";
        chatInput.focus();
      }
      break;
    case "hint":
      if (chatInput) {
        chatInput.value = "Give me a hint to solve this without spoiling the answer";
        chatInput.focus();
      }
      break;
    case "source":
      if (chatInput) {
        chatInput.value = "Where can I find more information about this topic?";
        chatInput.focus();
      }
      break;
  }
}

/* ======== Concept Breakdown ======== */
function updateConceptPanel(topic, response) {
  const conceptContent = document.getElementById("conceptContent");
  if (!conceptContent) return;

  // Parse the response to extract key concepts
  const concepts = parseConceptsFromResponse(response, topic);

  if (concepts.length === 0) {
    conceptContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <p>Step-by-step breakdown will appear here</p>
      </div>
    `;
    return;
  }

  conceptContent.innerHTML = concepts
    .map((concept) => createConceptItem(concept))
    .join("");
}

function parseConceptsFromResponse(response, topic) {
  // Simple parsing - look for numbered steps or bullet points
  const concepts = [];

  // Look for numbered steps: "1.", "2.", etc.
  const numberRegex = /^\d+\.\s+(.+?)(?=^\d+\.|$)/gm;
  let match;
  while ((match = numberRegex.exec(response)) !== null) {
    concepts.push({
      title: `Step ${concepts.length + 1}`,
      content: match[1].trim(),
    });
  }

  // If no steps found, create summary items
  if (concepts.length === 0) {
    const lines = response.split("\n").filter((l) => l.trim());
    concepts.push({
      title: `${topic} Overview`,
      content: lines
        .slice(0, 3)
        .join(" ")
        .substring(0, 200),
    });

    // Add key terms if found
    const boldTerms = response.match(/\*\*(.+?)\*\*/g);
    if (boldTerms && boldTerms.length > 0) {
      concepts.push({
        title: "Key Terms",
        items: boldTerms.map((t) => t.replace(/\*\*/g, "")).slice(0, 4),
      });
    }
  }

  return concepts.slice(0, 5); // Limit to 5 concepts
}

function createConceptItem(concept) {
  if (concept.items) {
    return `
      <div class="concept-item">
        <h4>${concept.title}</h4>
        <ul>
          ${concept.items.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  return `
    <div class="concept-item">
      <h4>${concept.title}</h4>
      <p>${concept.content}</p>
    </div>
  `;
}

/* ======== Voice Input ======== */
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
}

const voiceBtn = document.getElementById("voiceBtn");
if (voiceBtn && recognition) {
  voiceBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleVoiceInput();
  });

  recognition.onstart = () => {
    voiceBtn.style.background = "rgba(255, 100, 100, 0.2)";
    voiceBtn.style.borderColor = "#ff6464";
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript.trim()) {
      // Display transcript in chat and send to RAG+Socratic pipeline
      const chatInput = document.getElementById("chatInput");
      if (chatInput) {
        chatInput.value = transcript.trim();
        // Auto-submit voice input to AI
        setTimeout(() => {
          const chatForm = document.getElementById("chatForm");
          if (chatForm) {
            const submitEvent = new Event("submit", { bubbles: true });
            chatForm.dispatchEvent(submitEvent);
          }
        }, 500);
      }
    }
  };

  recognition.onend = () => {
    voiceBtn.style.background = "";
    voiceBtn.style.borderColor = "";
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    voiceBtn.style.background = "";
    voiceBtn.style.borderColor = "";
  };
}

function toggleVoiceInput() {
  if (recognition && recognition.state !== "recording") {
    recognition.start();
  }
}

/* ======== Image Upload Modal ======== */
const imageModal = document.getElementById("imageModal");
const imageBtn = document.getElementById("imageBtn");
const closeImageModal = document.getElementById("closeImageModal");
const uploadArea = document.getElementById("uploadArea");
const imageInput = document.getElementById("imageInput");
const uploadPreview = document.getElementById("uploadPreview");

if (imageBtn) {
  imageBtn.addEventListener("click", (e) => {
    e.preventDefault();
    imageModal.classList.add("active");
  });
}

if (closeImageModal) {
  closeImageModal.addEventListener("click", () => {
    imageModal.classList.remove("active");
    uploadPreview.innerHTML = "";
  });
}

if (imageModal) {
  imageModal.addEventListener("click", (e) => {
    if (e.target === imageModal) {
      imageModal.classList.remove("active");
    }
  });
}

// Drag and drop
if (uploadArea) {
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageUpload(files[0]);
    }
  });
}

if (imageInput) {
  imageInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleImageUpload(e.target.files[0]);
    }
  });
}

function handleImageUpload(file) {
  const reader = new FileReader();

  reader.onload = async (e) => {
    uploadPreview.innerHTML = `
      <img src="${e.target.result}" alt="Preview" class="preview-image" />
      <div class="upload-actions">
        <button type="button" class="primary" onclick="sendImageToAI('${e.target.result}')">
          Send to AI for Analysis
        </button>
        <button type="button" class="secondary" onclick="resetImageUpload()">
          Clear
        </button>
      </div>
    `;
  };

  reader.readAsDataURL(file);
}

function resetImageUpload() {
  uploadPreview.innerHTML = "";
  const imageInput = document.getElementById("imageInput");
  if (imageInput) imageInput.value = "";
}

async function sendImageToAI(imageData) {
  // Get reference to global functions from chat.js
  if (!window.extractTextFromImage || !window.appendMessage || !window.callGemini) {
    console.error("OCR or chat functions not available");
    return;
  }

  // Disable button and show processing
  const imageModal = document.getElementById("imageModal");
  const chatInput = document.getElementById("chatInput");
  
  try {
    // Step 1: Extract text from image using OCR
    appendMessage("📷 Analyzing image...", false);
    const ocrResult = await extractTextFromImage(imageData);

    if (!ocrResult.success) {
      appendMessage("❌ Failed to extract text from image. Please try a clearer image.");
      return;
    }

    // Step 2: Format homework problem
    const formatted = formatHomeworkProblem(ocrResult.text);
    const problemMessage = `[📷 Homework Problem - ${formatted.problemType}]\n\n${formatted.cleanedText}`;

    // Step 3: Add user message to chat
    appendMessage(problemMessage, true);

    // Step 4: Send through RAG+Socratic pipeline
    await callGemini(problemMessage);

  } catch (error) {
    console.error("Image processing error:", error);
    appendMessage("❌ Error processing image: " + error.message);
  } finally {
    imageModal?.classList.remove("active");
    resetImageUpload();
  }
}

/* ======== Integration with existing chat ======== */
// Override the appendMessage function to add action buttons and update concepts
const originalAppendMessage = window.appendMessage;
if (originalAppendMessage) {
  window.appendMessage = function (text, isUser = false) {
    if (!isUser) {
      // Update topic detection
      const chatInput = document.getElementById("chatInput");
      if (chatInput && chatInput.value) {
        updateTopicDetection(chatInput.value);
      }
    }

    // Call original
    originalAppendMessage(text, isUser);

    if (!isUser) {
      // Add action buttons to AI responses
      const chatMessages = document.getElementById("chatMessages");
      if (chatMessages) {
        const lastMessage = chatMessages.lastElementChild;
        if (lastMessage) {
          addActionButtons(lastMessage);

          // Update concept panel
          const detectedTopic = detectTopic(text);
          updateConceptPanel(detectedTopic, text);
        }
      }
    }
  };
}

/* ======== Make functions globally available ======== */
window.sendImageToAI = sendImageToAI;
window.resetImageUpload = resetImageUpload;
