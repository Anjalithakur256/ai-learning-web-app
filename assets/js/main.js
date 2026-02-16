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

async function loadDashboard() {
  if (!dashboardGrid) {
    return;
  }

  const { getCategories, getUserProgress } = await import("./db.js");
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
}

async function loadProfile() {
  if (!profileStats) {
    return;
  }
  const { getUserProgress } = await import("./db.js");
  const progress = await getUserProgress();
  const stats = profileStats.querySelectorAll(".stat-value");
  if (stats.length >= 3) {
    stats[0].textContent = progress.averageScore || "--";
    stats[1].textContent = progress.quizzesTaken || "--";
    stats[2].textContent = progress.topicsCompleted || "--";
  }
}

loadDashboard();
loadProfile();
