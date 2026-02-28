import { api } from "./services/api-service.js";
import logger from "./services/logger.js";
import { auth, db } from "./db.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    siteNav.classList.toggle("open");
  });
}

const dashboardGrid = document.getElementById("dashboardGrid");
const progressStats = document.getElementById("progressStats");
const profileStats = document.getElementById("profileStats");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");

const categoriesFallback = [
  {
    id: "ai-basics",
    name: "AI Basics",
    summary: "Core concepts, ethics, and introductory tools.",
    topics: 8,
  },
  {
    id: "machine-learning",
    name: "Machine Learning",
    summary: "Supervised, unsupervised, and evaluation metrics.",
    topics: 10,
  },
  {
    id: "deep-learning",
    name: "Deep Learning",
    summary: "Neural networks, backprop, and architectures.",
    topics: 7,
  },
  {
    id: "nlp",
    name: "NLP",
    summary: "Language models, embeddings, and transformers.",
    topics: 6,
  },
  {
    id: "generative-ai",
    name: "Generative AI",
    summary: "Prompting, multimodal models, and agents.",
    topics: 5,
  },
];

function setTextContent(element, value, fallback = "--") {
  if (!element) {
    return;
  }
  element.textContent = value ?? fallback;
}

function handleApiFailure(result, context) {
  if (result?.success) {
    return;
  }
  const message = result?.error?.message || "Unexpected error";
  logger.warn("UI", `${context} failed`, { message, error: result?.error });
}

async function logSystemMetrics() {
  const result = await api.systemLogs();
  if (!result.success) {
    handleApiFailure(result, "system logs");
    return;
  }

  logger.info("UI", "Session metrics", result.data.summary);
}

async function checkSystemHealth() {
  const result = await api.systemHealth();
  if (!result.success) {
    handleApiFailure(result, "system health");
    return;
  }

  logger.info("UI", "System health", result.data);
}

async function loadDashboard() {
  if (!dashboardGrid) {
    return;
  }

  const { getCategories, getUserProgress, getRecommendedNextTopic } = await import("./db.js");
  const categories = (await getCategories()) || categoriesFallback;

  dashboardGrid.innerHTML = categories
    .map(
      (category) => `
      <article class="card">
        <h3>${category.name}</h3>
        <p>${category.summary}</p>
        <p class="label">${category.topics} topics</p>
        <a class="text-link" href="topic.html?topic=${category.id}">View track</a>
      </article>
    `
    )
    .join("");

  if (progressStats) {
    const progress = await getUserProgress();
    const stats = progressStats.querySelectorAll(".stat-value");
    if (stats.length >= 3) {
      stats[0].textContent = progress.averageScore || "--";
      stats[1].textContent = progress.quizzesTaken || "--";
      stats[2].textContent = progress.topicsCompleted || "--";
    }
  }
  
  // Load recommended next topic
  const recommendedTopicText = document.getElementById("recommendedTopicText");
  const recommendedTopicLink = document.getElementById("recommendedTopicLink");
  
  if (recommendedTopicText && recommendedTopicLink) {
    try {
      const recommendation = await getRecommendedNextTopic();
      recommendedTopicText.innerHTML = `Based on your progress and chat history, we recommend continuing with <strong>"${recommendation.name}"</strong> to advance your ${recommendation.category} knowledge.`;
      recommendedTopicLink.href = `topic.html?topic=${recommendation.id}`;
      recommendedTopicLink.style.display = "";
    } catch (error) {
      console.error("Error loading recommendation:", error);
      recommendedTopicText.textContent = "Unable to load recommendation. Continue exploring topics below.";
    }
  }
}

async function loadProfile() {
  if (!profileStats && !profileName && !profileEmail) {
    return;
  }

  const { getUserProfile, getUserProgress } = await import("./db.js");
  const userId = auth.currentUser?.uid;

  if (userId) {
    const profileResult = await api.userProfile(userId);
    if (profileResult.success) {
      setTextContent(profileName, profileResult.data.displayName || "Learner");
      setTextContent(profileEmail, profileResult.data.email || "Unknown email");
    } else {
      handleApiFailure(profileResult, "load profile");
    }
  }

  const localProfile = await getUserProfile();
  if (localProfile && !userId) {
    setTextContent(profileName, localProfile.name || "Learner");
    setTextContent(profileEmail, localProfile.email || "Unknown email");
  }

  if (profileStats) {
    const progress = await getUserProgress();
    const stats = profileStats.querySelectorAll(".stat-value");
    if (stats.length >= 3) {
      stats[0].textContent = progress.averageScore || "--";
      stats[1].textContent = progress.quizzesTaken || "--";
      stats[2].textContent = progress.topicsCompleted || "--";
    }
  }
}

// Helper function to get user role from Firestore
async function getUserRole(user) {
  if (!user) return 'student';
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      return userDoc.data().role || 'student';
    }
  } catch (error) {
    console.warn('Error fetching user role:', error.message);
  }
  return 'student';
}

// Show/hide Teacher Dashboard link based on user role
onAuthStateChanged(auth, async (user) => {
  const teacherLinks = document.querySelectorAll('.teacher-only');
  const loginButtons = document.querySelectorAll('.login-only');
  const logoutButtons = document.querySelectorAll('.auth-only');
  
  if (user) {
    const userRole = await getUserRole(user);
    if (userRole === 'teacher' || userRole === 'admin') {
      // Show teacher dashboard links for teachers/admins
      teacherLinks.forEach(link => {
        link.style.display = '';
      });
    } else {
      // Hide teacher dashboard links for students
      teacherLinks.forEach(link => {
        link.style.display = 'none';
      });
    }
    
    // Hide login buttons and show logout buttons when authenticated
    loginButtons.forEach(btn => {
      btn.style.display = 'none';
    });
    logoutButtons.forEach(btn => {
      btn.style.display = '';
    });
  } else {
    // Hide teacher dashboard links for non-authenticated users
    teacherLinks.forEach(link => {
      link.style.display = 'none';
    });
    
    // Show login buttons and hide logout buttons when not authenticated
    loginButtons.forEach(btn => {
      btn.style.display = '';
    });
    logoutButtons.forEach(btn => {
      btn.style.display = 'none';
    });
  }
});

// Handle logout functionality
document.addEventListener('click', async (e) => {
  if (e.target && e.target.id === 'logoutBtn') {
    try {
      await signOut(auth);
      // Redirect to login page after logout
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to logout. Please try again.');
    }
  }
});

loadDashboard();
loadProfile();
checkSystemHealth();
logSystemMetrics();
