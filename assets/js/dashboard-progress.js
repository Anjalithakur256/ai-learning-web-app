/**
 * dashboard-progress.js
 * Fetches user progress data and renders the Progress Summary,
 * Areas to Improve, and Recent Quiz Activity on the student dashboard.
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, getUserProgress, getRecentQuizResults } from "./db.js";

// Topics considered "hard" used to suggest areas to improve
const IMPROVEMENT_TOPICS = [
  { id: "backpropagation",        label: "Backpropagation",              href: "topic.html?id=backpropagation" },
  { id: "transformer",            label: "Transformer Architecture",     href: "topic.html?id=transformer" },
  { id: "model-evaluation",       label: "Model Evaluation Metrics",     href: "topic.html?id=model-evaluation" },
  { id: "cnn",                    label: "Convolutional Neural Networks", href: "topic.html?id=cnn" },
  { id: "reinforcement-learning", label: "Reinforcement Learning",       href: "topic.html?id=reinforcement-learning" },
  { id: "embeddings",             label: "Embeddings & Vector Spaces",   href: "topic.html?id=embeddings" },
];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "--";
}

function scoreColor(pct) {
  if (pct >= 80) return "#64dc78";
  if (pct >= 60) return "#ffb932";
  return "#ff6b6b";
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "—";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const [progress, recent] = await Promise.all([
      getUserProgress(),
      getRecentQuizResults(8).catch(() => []),
    ]);

    // ── Progress stats ──
    setText("dashLearningLevel",   progress?.level          ?? "Beginner");
    setText("dashTopicsCompleted", progress?.topicsCompleted ?? 0);
    setText("dashAvgScore",        progress?.averageScore    ?? "--");
    setText("dashQuizzesTaken",    progress?.quizzesTaken    ?? 0);
    setText("dashCurrentStreak",
      progress?.currentStreak != null ? `${progress.currentStreak} day${progress.currentStreak !== 1 ? "s" : ""}` : "--"
    );

    // ── Areas to Improve ──
    const completed = Array.isArray(progress?.completedTopics) ? progress.completedTopics : [];
    const suggestions = IMPROVEMENT_TOPICS.filter((t) => !completed.includes(t.id)).slice(0, 4);

    const list = document.getElementById("dashAreasToImprove");
    if (list) {
      if (suggestions.length === 0) {
        list.innerHTML = `<li style="color:var(--accent-2); padding: 0.75rem;">
          🎉 Great work — you have covered all the key topics!
        </li>`;
      } else {
        list.innerHTML = suggestions
          .map((t) => `<li><a href="${t.href}" class="topic-link" style="color:inherit;">${t.label}</a></li>`)
          .join("");
      }
    }

    // ── Recent Quiz Activity ──
    const historyContainer = document.getElementById("dashQuizHistory");
    if (!historyContainer) return;

    if (!recent || recent.length === 0) {
      historyContainer.innerHTML = `
        <p style="color:var(--muted); font-size:0.9rem; padding: 1rem 0;">
          No quiz attempts yet. <a href="quiz.html" style="color:var(--accent-2);">Take your first quiz →</a>
        </p>`;
      return;
    }

    historyContainer.innerHTML = `
      <div style="overflow-x: auto;">
        <table class="quiz-history-table">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Difficulty</th>
              <th>Score</th>
              <th>Result</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${recent.map(r => {
              const pct   = r.percentage ?? r.score ?? 0;
              const grade = pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : pct >= 50 ? "D" : "F";
              const topic = r.topic || r.quizId || "—";
              const diff  = capitalize(r.difficulty || "");
              return `
                <tr>
                  <td>${topic}</td>
                  <td>${diff || "—"}</td>
                  <td style="color:${scoreColor(pct)}; font-weight:700;">${pct}%</td>
                  <td style="color:${scoreColor(pct)};">${grade}</td>
                  <td>${formatDate(r.attemptedAt)}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    console.warn("dashboard-progress: could not load progress", err);
  }
});
