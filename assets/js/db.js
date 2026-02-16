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
async function createUserProfile(user) {
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

// Save quiz result with optimized structure
async function saveQuizResult({ quizId, score, total }) {
  const user = auth.currentUser;
  const payload = {
    quizId,
    score,
    total,
    percentage: Math.round((score / total) * 100),
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
      const currentAvg = userData.averageScore || 0;
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
          currentStreak: data.currentStreak || 0,
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
                            <img src="${tab.imageUrl}" alt="${tab.imageAlt || tab.title}" loading="lazy" />
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
                    <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
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
  markTopicCompleted,
  getRecentQuizResults
};
