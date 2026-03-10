// Firebase SDK v10 (modular) - optimized imports for smaller bundle size
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase configuration for AI Learning Guide Web App
const firebaseConfig = {
  apiKey: "AIzaSyC8PjVDj6e6VsEXemIEoXyT7QVMWCcLEM8",
  authDomain: "ai-learning-guide-web-app.firebaseapp.com",
  projectId: "ai-learning-guide-web-app",
  storageBucket: "ai-learning-guide-web-app.firebasestorage.app",
  messagingSenderId: "409240920437",
  appId: "1:409240920437:web:9062f4c780a2a80e12733c",
  measurementId: "G-1JCSG2KR72"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const fallbackProgress = {
  averageScore: "--",
  quizzesTaken: "--",
  topicsCompleted: "--",
};

async function getCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
  } catch (error) {
    return null;
  }
}

async function getTopicById(topicId) {
  if (!topicId) {
    return null;
  }
  
  // Try local JSON first for demo/development
  try {
    const response = await fetch("/data/topics.json");
    if (response.ok) {
      const topics = await response.json();
      const topic = topics.find(t => t.id === topicId);
      if (topic) {
        return topic;
      }
    }
  } catch (e) {
    // Fall through to Firebase
  }
  
  // Try Firebase
  try {
    const topicDoc = await getDoc(doc(db, "topics", topicId));
    if (!topicDoc.exists()) {
      return null;
    }
    return { id: topicDoc.id, ...topicDoc.data() };
  } catch (error) {
    return null;
  }
}

async function getQuizById(quizId) {
  if (!quizId) {
    return null;
  }
  
  // Try local JSON first for demo/development
  try {
    const response = await fetch("/data/quizzes.json");
    if (response.ok) {
      const quizzes = await response.json();
      if (quizzes[quizId]) {
        return quizzes[quizId];
      }
    }
  } catch (e) {
    // Fall through to Firebase
  }
  
  // Try Firebase
  try {
    const quizDoc = await getDoc(doc(db, "quizzes", quizId));
    if (!quizDoc.exists()) {
      return null;
    }
    return { id: quizDoc.id, ...quizDoc.data() };
  } catch (error) {
    return null;
  }
}

// Create or update user profile in Firestore
async function createUserProfile(user, userRole = "student") {
  if (!user) return;
  
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      // Create new user profile
      await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName || "Learner",
        email: user.email,
        role: userRole,
        grade: "Undergraduate",
        subjects: ["AI Basics"],
        level: "Beginner",
        completedTopics: [],
        averageScore: 0,
        totalQuizzes: 0,
        currentStreak: 0,
        longestStreak: 0,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp()
      });
    } else {
      // Update last active timestamp
      await updateDoc(userRef, {
        lastActiveAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.warn("Firestore profile sync failed (rules may need deployment):", error.message);
  }
}

async function getUserProfile() {
  const user = auth.currentUser;
  if (!user) {
    const stored = localStorage.getItem("userProfile");
    return stored ? JSON.parse(stored) : null;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
  }
  return null;
}

async function updateUserRole(role) {
  const sanitizedRole = role || "student";
  const user = auth.currentUser;

  if (!user) {
    const stored = localStorage.getItem("userProfile");
    const parsed = stored ? JSON.parse(stored) : {};
    const updated = { ...parsed, role: sanitizedRole };
    localStorage.setItem("userProfile", JSON.stringify(updated));
    return updated;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      role: sanitizedRole,
      lastActiveAt: serverTimestamp()
    });
    return getUserProfile();
  } catch (error) {
    console.error("Error updating user role:", error);
    return null;
  }
}

async function saveLearningProfile(payload) {
  const user = auth.currentUser;
  const profile = {
    userId: user?.uid || "local",
    subjects: payload?.subjects || ["AI Basics"],
    preferredLearningStyle: payload?.preferredLearningStyle || "Socratic",
    grade: payload?.grade || "Undergraduate",
    updatedAt: new Date().toISOString()
  };

  // Cache locally — uid-prefixed for accuracy, generic key as fallback for pre-auth reads
  const lsKey = user ? `learningProfile_${user.uid}` : "learningProfile";
  localStorage.setItem(lsKey, JSON.stringify(profile));
  localStorage.setItem("learningProfile", JSON.stringify(profile));

  if (!user) {
    return profile;
  }

  try {
    const profileRef = doc(db, "learningProfiles", user.uid);
    await setDoc(profileRef, profile, { merge: true });
  } catch (error) {
    console.warn("Firestore learning profile sync failed:", error.message);
  }

  return profile;
}

async function getLearningProfile() {
  const user = auth.currentUser;

  // Fast path: check localStorage cache first
  const lsKey = user ? `learningProfile_${user.uid}` : "learningProfile";
  const cached = localStorage.getItem(lsKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { /* ignore */ }
  }

  if (!user) return null;

  try {
    const profileSnap = await getDoc(doc(db, "learningProfiles", user.uid));
    if (profileSnap.exists()) {
      const data = profileSnap.data();
      // Populate cache for next time
      localStorage.setItem(lsKey, JSON.stringify(data));
      return data;
    }
  } catch (error) {
    console.warn("Error fetching learning profile:", error.message);
  }
  return null;
}

// Save quiz result with optimized structure
async function saveQuizResult({ quizId, score, total, topic = "", difficulty = "" }) {
  const user = auth.currentUser;
  const payload = {
    quizId,
    score,
    total,
    percentage: Math.round((score / total) * 100),
    topic,
    difficulty,
    attemptedAt: new Date().toISOString(),
  };

  if (user) {
    // Save to quizResults collection (for history)
    const resultRef = doc(collection(db, "users", user.uid, "quizResults"));
    await setDoc(resultRef, payload);
    
    // Update user's aggregate stats
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const totalQuizzes = (userData.totalQuizzes || 0) + 1;
      const currentAvg = (userData.averageScore > 100 || isNaN(userData.averageScore))
        ? 0  // reset corrupt value
        : (userData.averageScore || 0);
      const newAvg = Math.round(((currentAvg * (totalQuizzes - 1)) + payload.percentage) / totalQuizzes);
      
      await updateDoc(userRef, {
        totalQuizzes,
        averageScore: newAvg,
        lastActiveAt: serverTimestamp()
      });
    }
  } else {
    localStorage.setItem("progress", JSON.stringify(payload));
  }
}

// Mark topic as completed
async function markTopicCompleted(topicId) {
  const user = auth.currentUser;
  if (!user || !topicId) return;
  
  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, {
    completedTopics: arrayUnion(topicId),
    lastActiveAt: serverTimestamp()
  });
}

// Get user progress with optimized queries
async function getUserProgress() {
  const user = auth.currentUser;
  if (user) {
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        return {
          averageScore: `${data.averageScore || 0}%`,
          quizzesTaken: data.totalQuizzes || 0,
          topicsCompleted: data.completedTopics?.length || 0,
          completedTopics: data.completedTopics || [],
          currentStreak: data.currentStreak || 0,
          longestStreak: data.longestStreak || 0,
          level: data.level || "Beginner"
        };
      }
    } catch (error) {
      console.error("Error fetching user progress:", error);
      return fallbackProgress;
    }
  }

  const localProgress = localStorage.getItem("progress");
  if (localProgress) {
    const data = JSON.parse(localProgress);
    return {
      averageScore: `${data.percentage || 0}%`,
      quizzesTaken: 1,
      topicsCompleted: 0,
      currentStreak: 0,
      level: "Beginner"
    };
  }

  return fallbackProgress;
}

// Get recent quiz results for a user
async function getRecentQuizResults(limitCount = 5) {
  const user = auth.currentUser;
  if (!user) return [];
  
  try {
    const resultsRef = collection(db, "users", user.uid, "quizResults");
    const q = query(resultsRef, orderBy("attemptedAt", "desc"), limit(limitCount));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching quiz results:", error);
    return [];
  }
}

function getMockMasterySnapshot() {
  return [
    { topic: "AI Fundamentals", level: "Developing", progress: 56 },
    { topic: "Model Evaluation", level: "Proficient", progress: 74 },
    { topic: "Embeddings", level: "Emerging", progress: 42 },
    { topic: "Neural Networks", level: "Developing", progress: 63 }
  ];
}

async function getMasterySnapshot() {
  const stored = localStorage.getItem("masterySnapshot");
  if (stored) {
    return JSON.parse(stored);
  }
  return getMockMasterySnapshot();
}

function getTeacherDashboardSnapshot() {
  return {
    activeStudents: 128,
    averageMastery: 68,
    pendingReviews: 6,
    recentFlags: [
      "Low confidence on Backpropagation",
      "Repeated quiz retries on Model Evaluation",
      "Homework help request: CNN feature maps"
    ]
  };
}

function buildAssessmentDraft(config) {
  const topic = config?.topic || "AI Fundamentals";
  const difficulty = config?.difficulty || "Medium";
  return {
    id: `assess_${Date.now()}`,
    topic,
    difficulty,
    status: "draft",
    questions: [
      `Explain the core idea of ${topic} in two sentences.`,
      `Give a real-world example where ${topic} is applied.`,
      `What are two common pitfalls when learning ${topic}?`
    ]
  };
}

function runMockOcr(fileName) {
  if (!fileName) {
    return "";
  }
  const lower = fileName.toLowerCase();
  if (lower.includes("derivative")) {
    return "Find the derivative of f(x) = 3x^2 + 2x + 1.";
  }
  if (lower.includes("matrix")) {
    return "Compute the dot product of vectors a and b.";
  }
  return "Summarize the main steps shown in the uploaded homework image.";
}

function runMockRagSearch(queryText) {
  if (!queryText) {
    return [];
  }
  return [
    {
      title: "Core Concepts",
      snippet: "Start with definitions, then connect to a real-world scenario.",
      source: "Curriculum Guide"
    },
    {
      title: "Worked Example",
      snippet: "Break the problem into smaller steps and verify each assumption.",
      source: "Lesson Library"
    }
  ];
}

// ═══════════════════════════════════════════════════════════
// Chat Session Management - Firestore Integration
// ═══════════════════════════════════════════════════════════

/**
 * Save or update a chat session to Firestore
 * @param {string} sessionId - Unique session ID
 * @param {Object} sessionData - Session data (title, preview, messages, etc.)
 * @returns {Promise<boolean>} - Success status
 */
async function saveChatSession(sessionId, sessionData) {
  const user = auth.currentUser;
  if (!user) {
    console.warn("No authenticated user - chat session not saved to Firestore");
    return false;
  }
  
  try {
    const sessionRef = doc(db, "users", user.uid, "chatSessions", sessionId);
    await setDoc(sessionRef, {
      ...sessionData,
      userId: user.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("Error saving chat session to Firestore:", error);
    return false;
  }
}

/**
 * Load all chat sessions for the current user from Firestore
 * @returns {Promise<Array>} - Array of chat sessions
 */
async function loadChatSessions() {
  const user = auth.currentUser;
  if (!user) {
    return [];
  }
  
  try {
    const sessionsRef = collection(db, "users", user.uid, "chatSessions");
    const q = query(sessionsRef, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error loading chat sessions from Firestore:", error);
    return [];
  }
}

/**
 * Delete a chat session from Firestore
 * @param {string} sessionId - Session ID to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteChatSession(sessionId) {
  const user = auth.currentUser;
  if (!user) {
    console.warn("No authenticated user - cannot delete chat session from Firestore");
    return false;
  }
  
  try {
    const sessionRef = doc(db, "users", user.uid, "chatSessions", sessionId);
    await deleteDoc(sessionRef);
    return true;
  } catch (error) {
    console.error("Error deleting chat session from Firestore:", error);
    return false;
  }
}

/**
 * Sync localStorage chat sessions to Firestore (migration helper)
 * @param {Array} sessions - Array of sessions from localStorage
 * @returns {Promise<number>} - Number of sessions synced
 */
async function syncChatSessionsToFirestore(sessions) {
  const user = auth.currentUser;
  if (!user || !sessions || sessions.length === 0) {
    return 0;
  }
  
  let syncedCount = 0;
  for (const session of sessions) {
    const success = await saveChatSession(session.id, session);
    if (success) syncedCount++;
  }
  
  return syncedCount;
}

/**
 * Recommend next topic based on user's chat history and quiz performance
 * @returns {Promise<Object>} - Recommended topic with name and ID
 */
async function getRecommendedNextTopic() {
  const user = auth.currentUser;
  
  // Topic progression map
  const topicProgression = {
    "ai-basics": { name: "Machine Learning Fundamentals", id: "ml-fundamentals", category: "Machine Learning" },
    "ml-fundamentals": { name: "Model Evaluation Metrics", id: "model-evaluation", category: "Machine Learning" },
    "model-evaluation": { name: "Neural Networks", id: "neural-networks", category: "Deep Learning" },
    "neural-networks": { name: "Deep Learning Architectures", id: "deep-learning", category: "Deep Learning" },
    "deep-learning": { name: "Natural Language Processing", id: "nlp-intro", category: "NLP" },
    "nlp-intro": { name: "Transformers & Attention", id: "transformers", category: "NLP" },
    "transformers": { name: "Generative AI & Prompting", id: "generative-ai", category: "Generative AI" }
  };
  
  if (!user) {
    // Return default for non-authenticated users
    return { name: "Machine Learning Fundamentals", id: "ml-fundamentals", category: "Machine Learning" };
  }
  
  try {
    // Get user's completed topics
    const userSnap = await getDoc(doc(db, "users", user.uid));
    let completedTopics = [];
    
    if (userSnap.exists()) {
      completedTopics = userSnap.data().completedTopics || [];
    }
    
    // Get recent chat sessions to analyze discussed topics
    const chatSessions = await loadChatSessions();
    const discussedTopics = new Set();
    
    // Extract topics from chat history
    chatSessions.forEach(session => {
      const title = (session.title || "").toLowerCase();
      const preview = (session.preview || "").toLowerCase();
      
      // Identify topics mentioned in chat
      if (title.includes("machine learning") || preview.includes("machine learning") || 
          title.includes("supervised") || title.includes("regression")) {
        discussedTopics.add("ml-fundamentals");
      }
      if (title.includes("neural") || title.includes("deep learning")) {
        discussedTopics.add("neural-networks");
      }
      if (title.includes("nlp") || title.includes("language") || title.includes("transformer")) {
        discussedTopics.add("nlp-intro");
      }
      if (title.includes("evaluation") || title.includes("metrics") || 
          title.includes("accuracy") || title.includes("precision")) {
        discussedTopics.add("model-evaluation");
      }
      if (title.includes("generative") || title.includes("gpt") || title.includes("prompting")) {
        discussedTopics.add("generative-ai");
      }
    });
    
    // Find the most advanced topic discussed or completed
    let lastTopic = "ai-basics";
    const topicOrder = ["ai-basics", "ml-fundamentals", "model-evaluation", "neural-networks", 
                         "deep-learning", "nlp-intro", "transformers", "generative-ai"];
    
    for (const topic of topicOrder) {
      if (completedTopics.includes(topic) || discussedTopics.has(topic)) {
        lastTopic = topic;
      }
    }
    
    // Recommend the next topic in the progression
    const nextTopic = topicProgression[lastTopic];
    
    if (nextTopic) {
      return nextTopic;
    }
    
    // Default to ML fundamentals if no progression found
    return { name: "Model Evaluation Metrics", id: "model-evaluation", category: "Machine Learning" };
    
  } catch (error) {
    console.error("Error getting recommended topic:", error);
    return { name: "Model Evaluation Metrics", id: "model-evaluation", category: "Machine Learning" };
  }
}

async function renderTopic() {
  const topicTitle = document.getElementById("topicTitle");
  const topicSubtitle = document.getElementById("topicSubtitle");
  const topicContent = document.getElementById("topicContent");
  const topicQuizLink = document.getElementById("topicQuizLink");

  if (!topicContent) {
    return;
  }

  const topicId = new URLSearchParams(window.location.search).get("topic");
  const topic = await getTopicById(topicId);

  if (!topic) {
    topicTitle.textContent = "Topic not found";
    topicSubtitle.textContent = "Check the topic id or try another track.";
    topicContent.innerHTML = "";
    return;
  }

  topicTitle.textContent = topic.title || topic.name || "Topic";
  topicSubtitle.textContent = topic.description || topic.subtitle || topic.summary || "";

    const metaBlock = `
      <div class="topic-block">
        <h2>Overview</h2>
        ${topic.content ? `<p>${topic.content}</p>` : ""}
        ${topic.category ? `<p class="topic-meta"><strong>Category:</strong> ${topic.category}</p>` : ""}
        ${topic.difficulty ? `<p class="topic-meta"><strong>Difficulty:</strong> ${topic.difficulty}</p>` : ""}
        ${topic.estimatedTime ? `<p class="topic-meta"><strong>Estimated Time:</strong> ${topic.estimatedTime}</p>` : ""}
      </div>
    `;

    const sectionBlocks = (topic.sections || [])
      .map(
        (section) => `
        <div class="topic-block">
          <h2>${section.title}</h2>
          <p>${section.content}</p>
        </div>
      `
      )
      .join("");

    const tabsBlock = (topic.tabs && topic.tabs.length > 0)
      ? `
        <div class="topic-block">
          <h2>Learning Tabs</h2>
          <div class="topic-tabs" data-topic-tabs>
            <div class="tab-buttons" role="tablist">
              ${topic.tabs
                .map(
                  (tab, index) => `
                  <button
                    class="tab-button${index === 0 ? " active" : ""}"
                    role="tab"
                    id="tab-${tab.id}"
                    data-tab="${tab.id}"
                    aria-selected="${index === 0 ? "true" : "false"}"
                    aria-controls="tab-panel-${tab.id}"
                    type="button"
                  >
                    ${tab.title}
                  </button>
                `
                )
                .join("")}
            </div>
            <div class="tab-panels">
              ${topic.tabs
                .map(
                  (tab, index) => `
                  <section
                    class="tab-panel${index === 0 ? " active" : ""}"
                    role="tabpanel"
                    id="tab-panel-${tab.id}"
                    aria-labelledby="tab-${tab.id}"
                  >
                    <div class="tab-body">
                      <div>
                        <h3>${tab.heading || tab.title}</h3>
                        <p>${tab.description || ""}</p>
                        ${tab.bullets && tab.bullets.length
                          ? `<ul class="topic-list compact">${tab.bullets
                              .map((bullet) => `<li>${bullet}</li>`)
                              .join("")}</ul>`
                          : ""}
                      </div>
                      ${tab.imageUrl
                        ? `
                          <figure class="tab-image">
                            <img src="${tab.imageUrl}" alt="${tab.imageAlt || tab.title}" loading="lazy" onerror="this.closest('figure').style.display='none'" />
                          </figure>
                        `
                        : ""}
                    </div>
                  </section>
                `
                )
                .join("")}
            </div>
          </div>
        </div>
      `
      : "";

    const resourcesBlock = (topic.resources && topic.resources.length > 0)
      ? `
        <div class="topic-block">
          <h2>Resources</h2>
          <div class="resource-grid">
            ${topic.resources
              .map(
                (resource) => `
                <article class="resource-card">
                  <div>
                    <h3>${resource.title}</h3>
                    <p>${resource.description || ""}</p>
                  </div>
                  <div class="resource-meta">
                    ${resource.source ? `<span class="badge">${resource.source}</span>` : ""}
                    <a href="${resource.url}" target="_blank" rel="noopener">Read guide →</a>
                  </div>
                </article>
              `
              )
              .join("")}
          </div>
        </div>
      `
      : "";

    const videosBlock = (topic.videos && topic.videos.length > 0)
      ? `
        <div class="topic-block">
          <h2>Video Lessons</h2>
          <div class="video-grid">
            ${topic.videos
              .map(
                (video) => `
                <a class="video-card" href="${video.url}" target="_blank" rel="noopener">
                  <div class="video-thumb">
                    <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" onerror="this.closest('.video-thumb').style.display='none'" />
                  </div>
                  <div class="video-meta">
                    <h3>${video.title}</h3>
                    <p>${video.channel || ""}</p>
                  </div>
                </a>
              `
              )
              .join("")}
          </div>
        </div>
      `
      : "";

    topicContent.innerHTML = [
      metaBlock,
      sectionBlocks,
      tabsBlock,
      resourcesBlock,
      videosBlock,
    ].join("");

  if (topicQuizLink) {
    // Map topic category to quiz id
    const quizMapping = {
      "AI Basics": "ai-basics",
      "Machine Learning": "machine-learning",
      "Deep Learning": "deep-learning",
      "NLP": "nlp"
    };
    const quizId = topic.quizId || quizMapping[topic.category] || topicId;
    topicQuizLink.href = `quiz.html?quiz=${quizId}`;
  }

  const tabButtons = topicContent.querySelectorAll(".tab-button");
  const tabPanels = topicContent.querySelectorAll(".tab-panel");
  if (tabButtons.length > 0 && tabPanels.length > 0) {
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-tab");
        tabButtons.forEach((btn) => {
          const isActive = btn === button;
          btn.classList.toggle("active", isActive);
          btn.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        tabPanels.forEach((panel) => {
          const isActive = panel.id === `tab-panel-${targetId}`;
          panel.classList.toggle("active", isActive);
        });
      });
    });
  }
}

renderTopic();

export { 
  auth, 
  db, 
  getCategories, 
  getTopicById, 
  getQuizById, 
  saveQuizResult, 
  getUserProgress,
  createUserProfile,
  getUserProfile,
  updateUserRole,
  getLearningProfile,
  saveLearningProfile,
  markTopicCompleted,
  getRecentQuizResults,
  getMasterySnapshot,
  getTeacherDashboardSnapshot,
  buildAssessmentDraft,
  runMockOcr,
  runMockRagSearch,
  saveChatSession,
  loadChatSessions,
  deleteChatSession,
  syncChatSessionsToFirestore,
  getRecommendedNextTopic
};
