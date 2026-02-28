/**
 * teacher-dashboard.js  —  Admin / Teacher Control Panel
 * Real-time Firestore listener on all users with role === "student".
 */

import {
  collection,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "./db.js";

let topicChart = null;
let distChart  = null;
let allStudents     = [];   // master list for client-side search/filter
let filteredStudents = [];  // currently visible rows (respects search + filters)

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(n, total) { return total === 0 ? 0 : Math.round((n / total) * 100); }

function getStatus(score) {
  if (score >= 85) return "excellent";
  if (score >= 75) return "good";
  if (score >= 65) return "average";
  return "needs-help";
}

const STATUS_LABELS = { excellent: "Excellent", good: "Good", average: "Average", "needs-help": "Needs Help" };

function formatName(d) {
  return d.name || d.displayName || (d.email ? d.email.split("@")[0] : "Unknown");
}

// ── Stats cards ───────────────────────────────────────────────────────────────
function updateStats(students) {
  const total = students.length;
  document.getElementById("totalStudents").textContent = total || "0";

  if (total === 0) {
    document.getElementById("classAverage").textContent  = "0%";
    document.getElementById("weeklyProgress").textContent = "0%";
    document.getElementById("topicsCovered").textContent  = "0";
    return;
  }

  const scoreSum = students.reduce((s, u) => s + Math.min(100, (Number(u.averageScore) || 0)), 0);
  const classAvg = Math.round(scoreSum / total);

  const progressSum = students.reduce((s, u) => {
    const done = Array.isArray(u.completedTopics) ? u.completedTopics.length : 0;
    return s + Math.min(100, Math.round((done / 10) * 100));
  }, 0);
  const avgProgress = Math.round(progressSum / total);

  const allTopics = new Set();
  students.forEach((u) => {
    if (Array.isArray(u.completedTopics)) u.completedTopics.forEach((t) => allTopics.add(t));
  });

  document.getElementById("classAverage").textContent   = classAvg + "%";
  document.getElementById("weeklyProgress").textContent = avgProgress + "%";
  document.getElementById("topicsCovered").textContent  = allTopics.size;
}

// ── Topic bar chart ───────────────────────────────────────────────────────────
function renderTopicChart(students) {
  const ctx = document.getElementById("topicPerformanceChart");
  if (!ctx) return;

  const topicCount = {};
  students.forEach((u) => {
    if (Array.isArray(u.completedTopics)) {
      u.completedTopics.forEach((t) => { topicCount[t] = (topicCount[t] || 0) + 1; });
    }
  });
  const sorted = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = sorted.map(([t]) => t);
  const values = sorted.map(([, c]) => pct(c, students.length));

  if (topicChart) topicChart.destroy();

  if (labels.length === 0) {
    const c2 = ctx.getContext("2d");
    c2.clearRect(0, 0, ctx.width, ctx.height);
    c2.fillStyle = "rgba(255,255,255,0.25)";
    c2.font = "13px 'Space Grotesk', sans-serif";
    c2.textAlign = "center";
    c2.fillText("No topic data yet", ctx.width / 2, ctx.height / 2);
    return;
  }

  topicChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Students Completed (%)",
        data: values,
        backgroundColor: values.map((v) =>
          v >= 70 ? "#47a574" : v >= 50 ? "#7dd2a6" : "rgba(71,165,116,0.35)"
        ),
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#a8edd0", font: { size: 11, weight: 600 } } },
        tooltip: { callbacks: { label: (c) => ` ${c.raw}% of students` } },
      },
      scales: {
        y: {
          beginAtZero: true, max: 100,
          ticks: { color: "#94a3b8", callback: (v) => v + "%" },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        x: {
          ticks: { color: "#94a3b8", maxRotation: 35 },
          grid: { display: false },
        },
      },
    },
  });
}

// ── Doughnut chart ────────────────────────────────────────────────────────────
function renderDistChart(students) {
  const ctx = document.getElementById("performanceDistributionChart");
  if (!ctx) return;

  const exc  = students.filter((s) => (s.averageScore || 0) >= 85).length;
  const good = students.filter((s) => (s.averageScore || 0) >= 75 && (s.averageScore || 0) < 85).length;
  const avg  = students.filter((s) => (s.averageScore || 0) >= 65 && (s.averageScore || 0) < 75).length;
  const help = students.filter((s) => (s.averageScore || 0) < 65).length;

  if (distChart) distChart.destroy();

  distChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Excellent (85+%)", "Good (75-85%)", "Average (65-75%)", "Needs Help (<65%)"],
      datasets: [{
        data: [exc, good, avg, help],
        backgroundColor: ["#34d399", "#47a574", "#fbbf24", "#f87171"],
        borderColor: "#141729",
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#94a3b8", font: { size: 11, weight: 600 }, padding: 14 },
        },
      },
    },
  });
}

// ── Table render ──────────────────────────────────────────────────────────────
function renderTable(students) {
  const tbody = document.getElementById("studentTableBody");
  if (!tbody) return;

  // Update count badge
  const countEl = document.getElementById("studentCount");
  if (countEl) countEl.textContent = students.length + " student" + (students.length !== 1 ? "s" : "");

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="adm-empty">
      No students match the current filter.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((s, i) => {
    const name     = formatName(s);
    const score    = s.averageScore ? Math.min(100, Math.round(s.averageScore)) : 0;
    const quizzes  = s.totalQuizzes || 0;
    const topics   = Array.isArray(s.completedTopics) ? s.completedTopics.length : 0;
    const progress = Math.min(100, Math.round((topics / 10) * 100));
    const status   = getStatus(score);
    const level    = s.level || "Beginner";

    return `
      <tr>
        <td style="color:var(--adm-muted); font-size:0.8rem; width:2.5rem;">${i + 1}</td>
        <td>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#47a574,#7dd2a6);
              display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;
              color:#fff;flex-shrink:0;">${name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}</div>
            <div>
              <div style="font-weight:600;">${name}</div>
              <div style="font-size:0.75rem;color:var(--adm-muted);">${s.email || ""}</div>
            </div>
          </div>
        </td>
        <td style="font-weight:700; color:${score >= 75 ? "var(--adm-green)" : score >= 60 ? "var(--adm-yellow)" : "var(--adm-red)"};">
          ${score > 0 ? score + "%" : "0%"}
        </td>
        <td style="min-width:110px;">
          <div class="adm-progress-bar">
            <div class="adm-progress-fill" style="width:${progress}%;"></div>
          </div>
          <span style="font-size:0.75rem;color:var(--adm-muted);">${topics} / 10 topics</span>
        </td>
        <td style="color:var(--adm-ink);">${quizzes}</td>
        <td style="color:var(--adm-ink);">${topics}</td>
        <td><span style="font-size:0.8rem;color:var(--adm-accent3);">${level}</span></td>
        <td><span class="adm-badge adm-badge-${status}">${STATUS_LABELS[status]}</span></td>
      </tr>`;
  }).join("");
}

// ── Search + filter ───────────────────────────────────────────────────────────
function applyFilters() {
  const q       = (document.getElementById("studentSearch")?.value || "").toLowerCase();
  const status  = document.getElementById("statusFilter")?.value  || "all";
  const level   = document.getElementById("levelFilter")?.value   || "all";

  const sorted = [...allStudents].sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

  const filtered = sorted.filter((s) => {
    const name   = formatName(s).toLowerCase();
    const email  = (s.email || "").toLowerCase();
    const score  = s.averageScore ? Math.min(100, Math.round(s.averageScore)) : 0;
    const sLevel = s.level || "Beginner";

    const matchQ      = !q || name.includes(q) || email.includes(q);
    const matchStatus = status === "all" || getStatus(score) === status;
    const matchLevel  = level  === "all" || sLevel === level;

    return matchQ && matchStatus && matchLevel;
  });

  renderTable(filtered);
  filteredStudents = filtered;  // keep export in sync
}

// ── Export to Excel ───────────────────────────────────────────────────────────
function exportToExcel() {
  if (!window.XLSX) {
    alert("Excel library not loaded. Please check your internet connection and try again.");
    return;
  }
  const data = filteredStudents.map((s, i) => {
    const name     = formatName(s);
    const score    = s.averageScore ? Math.min(100, Math.round(s.averageScore)) : 0;
    const topics   = Array.isArray(s.completedTopics) ? s.completedTopics.length : 0;
    const progress = Math.min(100, Math.round((topics / 10) * 100));
    const quizzes  = s.totalQuizzes || 0;
    const level    = s.level || "Beginner";
    const status   = STATUS_LABELS[getStatus(score)];
    const topicList = Array.isArray(s.completedTopics) ? s.completedTopics.join(", ") : "";
    const joined   = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() :
                     s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "";
    return {
      "#":                    i + 1,
      "Name":                 name,
      "Email":                s.email || "",
      "Avg. Score (%)": score,
      "Progress (%)": progress,
      "Quizzes Taken":        quizzes,
      "Topics Completed":     topics,
      "Level":                level,
      "Status":               status,
      "Completed Topics":     topicList,
      "Joined":               joined,
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 4 },  // #
    { wch: 22 }, // Name
    { wch: 28 }, // Email
    { wch: 15 }, // Avg Score
    { wch: 13 }, // Progress
    { wch: 14 }, // Quizzes
    { wch: 16 }, // Topics
    { wch: 13 }, // Level
    { wch: 13 }, // Status
    { wch: 45 }, // Completed Topics
    { wch: 12 }, // Joined
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Student Roster");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `student-roster-${date}.xlsx`);
}

// ── Timestamp ─────────────────────────────────────────────────────────────────
function setLastUpdated() {
  const el = document.getElementById("lastUpdated");
  if (el) el.textContent = "Live · " + new Date().toLocaleTimeString();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  // Wire up search/filter controls
  document.getElementById("studentSearch")?.addEventListener("input",  applyFilters);
  document.getElementById("statusFilter")?.addEventListener("change",  applyFilters);
  document.getElementById("levelFilter")?.addEventListener("change",   applyFilters);
  document.getElementById("exportExcelBtn")?.addEventListener("click", exportToExcel);

  const tbody = document.getElementById("studentTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="adm-empty">
      <span class="adm-spinner"></span>Fetching student data…
    </td></tr>`;
  }

  const q = query(collection(db, "users"), where("role", "==", "student"));

  onSnapshot(q, (snapshot) => {
    allStudents = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
    updateStats(allStudents);
    applyFilters();          // renders table with current filter state
    renderTopicChart(allStudents);
    renderDistChart(allStudents);
    setLastUpdated();
  }, (err) => {
    console.error("onSnapshot error:", err.message);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="adm-empty" style="color:#f87171;">
        Could not load data — check Firestore rules or console.
      </td></tr>`;
    }
  });
});
