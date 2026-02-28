/**
 * quiz.js  —  AI-generated quiz engine
 *
 * Flow:
 *   Setup (panel-setup) → generate 10 MCQs via OpenRouter → 
 *   Take quiz (panel-quiz) → Submit → Results (panel-results) →
 *   Save score to Firestore → updates Dashboard progress
 */

import { saveQuizResult, auth, markTopicCompleted } from "./db.js";
import { getDoc, doc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./db.js";

// ── State ────────────────────────────────────────────────────────────────────
let generatedQuestions = [];   // [{prompt, options, correctIndex, explanation}]
let userAnswers        = [];   // [number | null]  – index of chosen option per question
let currentTopic       = "";
let currentDifficulty  = "easy";

const TOTAL_QUESTIONS  = 10;
const PROXY_URL        = "/api/gemini/generate";
const MODEL            = "openai/gpt-oss-20b";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const panels      = { setup: "panel-setup", quiz: "panel-quiz", results: "panel-results" };
const steps       = { 1: "step1", 2: "step2", 3: "step3" };
const topicInput  = document.getElementById("topicInput");
const genLoader   = document.getElementById("genLoader");
const genLoaderTopic = document.getElementById("genLoaderTopic");
const quizForm    = document.getElementById("quizForm");
const answeredCountEl = document.getElementById("answeredCount");
const totalCountEl    = document.getElementById("totalCount");
const qProgressFill   = document.getElementById("qProgressFill");

// ── Navigation helpers ───────────────────────────────────────────────────────
function showPanel(name) {
  Object.values(panels).forEach(id => document.getElementById(id)?.classList.remove("active"));
  document.getElementById(panels[name])?.classList.add("active");
}

function setStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(steps[i]);
    if (!el) return;
    el.classList.remove("active", "done");
    if (i < n)  el.classList.add("done");
    if (i === n) el.classList.add("active");
  });
}

// ── Topic chips ──────────────────────────────────────────────────────────────
document.querySelectorAll(".topic-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".topic-chip").forEach(c => c.classList.remove("selected"));
    chip.classList.add("selected");
    topicInput.value = chip.dataset.topic;
  });
});

// ── Difficulty buttons ────────────────────────────────────────────────────────
document.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    currentDifficulty = btn.dataset.diff;
  });
});

// ── Generate Quiz ─────────────────────────────────────────────────────────────
document.getElementById("generateBtn")?.addEventListener("click", async () => {
  const topic = topicInput?.value?.trim();
  if (!topic) {
    topicInput?.focus();
    topicInput?.style.setProperty("border-color", "#ff6b6b");
    setTimeout(() => topicInput?.style.removeProperty("border-color"), 1500);
    return;
  }

  currentTopic      = topic;
  const difficulty  = currentDifficulty;

  // Show loader, hide setup card
  document.querySelector(".setup-card").style.display  = "none";
  genLoader.classList.add("active");
  genLoaderTopic.textContent = `Generating "${topic}" quiz…`;

  try {
    generatedQuestions = await generateQuestions(topic, difficulty);
    userAnswers = Array(generatedQuestions.length).fill(null);
    renderQuiz(topic, difficulty, generatedQuestions);
    showPanel("quiz");
    setStep(2);
  } catch (err) {
    console.error("Quiz generation failed:", err);
    genLoader.classList.remove("active");
    document.querySelector(".setup-card").style.display = "";
    const errEl = document.createElement("p");
    errEl.style.cssText = "color:#ff6b6b; font-size:0.9rem; margin-top:1rem;";
    errEl.textContent   = "⚠ Failed to generate quiz: " + (err.message || "Unknown error. Please try again.");
    document.querySelector(".setup-card .generate-row")?.appendChild(errEl);
    setTimeout(() => errEl.remove(), 6000);
  }
});

// ── AI Question Generation ────────────────────────────────────────────────────
async function generateQuestions(topic, difficulty) {
  const diffInstructions = {
    easy:   "beginner-friendly concepts, basic definitions and simple applications",
    medium: "intermediate concepts requiring understanding of mechanisms and tradeoffs",
    hard:   "advanced concepts, edge cases, mathematical intuition, and in-depth analysis"
  };

  const systemPrompt = `You are an expert AI/ML educator creating a quiz.
Your output MUST be a raw JSON array of exactly ${TOTAL_QUESTIONS} objects and NOTHING else.
No markdown fences, no explanation text, no preamble.

Each object must have exactly these fields:
{
  "prompt":       "The question text",
  "options":      ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 2,
  "explanation":  "Brief explanation of why the correct answer is right"
}

Rules:
- All 4 options must be plausible but only ONE is correct.
- correctIndex is 0-based (0, 1, 2, or 3).
- Questions must be clear, unambiguous, and factually correct.
- Do NOT repeat questions.
- Output ONLY the JSON array.`;

  const userPrompt = `Create a ${difficulty} difficulty quiz on the topic: "${topic}"

Difficulty context: ${diffInstructions[difficulty] || diffInstructions.medium}

Ensure the questions specifically test knowledge of "${topic}" and not just general AI knowledge.`;

  const response = await fetch(PROXY_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:       userPrompt,
      systemPrompt: systemPrompt,
      model:        MODEL,
      generationConfig: {
        maxOutputTokens: 3000,
        temperature:     0.65,
        topP:            0.9
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API error ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Generation failed");

  return parseQuestionsFromText(data.text);
}

function parseQuestionsFromText(rawText) {
  // Strip markdown fences if present
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  // Try direct parse
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // Try to extract JSON array from within
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Could not parse AI response as JSON.");
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI returned an empty question list.");
  }

  // Validate and normalise each question
  return parsed.slice(0, TOTAL_QUESTIONS).map((q, i) => {
    if (!q.prompt || !Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question ${i + 1} is malformed.`);
    }
    return {
      prompt:       String(q.prompt),
      options:      q.options.map(String),
      correctIndex: Number(q.correctIndex) || 0,
      explanation:  String(q.explanation || "")
    };
  });
}

// ── Render Quiz ───────────────────────────────────────────────────────────────
function renderQuiz(topic, difficulty, questions) {
  // Set meta bar
  document.getElementById("quizTitle").textContent = `${topic} Quiz`;
  const topicBadge = document.getElementById("quizTopicBadge");
  const diffBadge  = document.getElementById("quizDiffBadge");
  if (topicBadge) { topicBadge.textContent = topic; }
  if (diffBadge) {
    diffBadge.textContent = capitalize(difficulty);
    diffBadge.className = `q-badge ${difficulty}`;
  }

  totalCountEl && (totalCountEl.textContent = questions.length);
  updateAnsweredCount();

  // Render question cards
  quizForm.innerHTML = questions.map((q, idx) => `
    <div class="q-card" id="qcard-${idx}" data-idx="${idx}">
      <div class="q-number">Question ${idx + 1} of ${questions.length}</div>
      <p class="q-prompt">${escapeHtml(q.prompt)}</p>
      <div class="q-options">
        ${q.options.map((opt, optIdx) => `
          <label class="q-option" id="opt-${idx}-${optIdx}" data-qi="${idx}" data-oi="${optIdx}">
            <input type="radio" name="q${idx}" value="${optIdx}" />
            <div class="q-radio-dot"></div>
            <span class="q-option-text">${escapeHtml(opt)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");

  // Attach click handlers to option labels
  quizForm.querySelectorAll(".q-option").forEach(label => {
    label.addEventListener("click", () => {
      const qi  = Number(label.dataset.qi);
      const oi  = Number(label.dataset.oi);
      selectOption(qi, oi);
    });
  });
}

function selectOption(qi, oi) {
  // Clear previous selection for this question
  document.querySelectorAll(`[data-qi="${qi}"].q-option`).forEach(l => l.classList.remove("selected"));
  // Select new
  document.getElementById(`opt-${qi}-${oi}`)?.classList.add("selected");
  // Tick the hidden radio
  const radio = document.querySelector(`input[name="q${qi}"][value="${oi}"]`);
  if (radio) radio.checked = true;
  // Store answer
  userAnswers[qi] = oi;
  // Mark card answered
  document.getElementById(`qcard-${qi}`)?.classList.add("answered");
  updateAnsweredCount();
}

function updateAnsweredCount() {
  const answered = userAnswers.filter(a => a !== null).length;
  if (answeredCountEl) answeredCountEl.textContent = answered;
  if (qProgressFill) {
    const pct = generatedQuestions.length > 0
      ? Math.round((answered / generatedQuestions.length) * 100) : 0;
    qProgressFill.style.width = pct + "%";
  }
}

// ── Submit Quiz ───────────────────────────────────────────────────────────────
document.getElementById("submitQuizBtn")?.addEventListener("click", async () => {
  // Check all answered
  const unanswered = userAnswers.filter(a => a === null).length;
  if (unanswered > 0) {
    const ok = confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? "s" : ""}. Submit anyway?`);
    if (!ok) return;
  }

  const { score, total } = calculateScore();
  const percent = Math.round((score / total) * 100);

  // Save to Firestore
  const topicId = currentTopic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  try {
    await saveQuizResult({
      quizId: topicId + "-" + currentDifficulty,
      score,   // raw correct-answer count; db.js calculates percentage from score/total
      total,
      topic:  currentTopic,
      difficulty: currentDifficulty
    });
    // Optionally mark topic completed if score >= 70
    if (percent >= 70) {
      await markTopicCompleted(topicId).catch(() => {});
    }
    // Update level in user doc based on score
    await updateUserLevel(percent);
  } catch (err) {
    console.warn("Could not save quiz result:", err.message);
  }

  renderResults(score, total, percent);
  showPanel("results");
  setStep(3);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function calculateScore() {
  let score = 0;
  generatedQuestions.forEach((q, idx) => {
    if (userAnswers[idx] === q.correctIndex) score++;
  });
  return { score, total: generatedQuestions.length };
}

async function updateUserLevel(percent) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) return;
    const data = userSnap.data();
    const quizzesTaken = (data.totalQuizzes || 0);          // already incremented by saveQuizResult
    const avgScore     = data.averageScore || 0;

    let level = "Beginner";
    if (avgScore >= 80 && quizzesTaken >= 5) level = "Advanced";
    else if (avgScore >= 60 || quizzesTaken >= 3) level = "Intermediate";

    await updateDoc(doc(db, "users", user.uid), { level, lastActiveAt: serverTimestamp() });
  } catch (e) {
    console.warn("Level update skipped:", e.message);
  }
}

// ── Render Results ────────────────────────────────────────────────────────────
function renderResults(score, total, percent) {
  const correct  = score;
  const wrong    = total - score;
  const grade    = getGrade(percent);
  const feedback = getFeedback(percent);

  document.getElementById("resultHero").innerHTML = `
    <div class="result-hero">
      <div class="result-score-circle">
        <span class="result-score-pct">${percent}%</span>
        <span class="result-score-sub">${grade}</span>
      </div>
      <h2>${getResultEmoji(percent)} ${getResultTitle(percent)}</h2>
      <p class="result-feedback">${feedback}</p>
      <div class="result-stats-row">
        <div class="result-stat">
          <div class="result-stat-val correct">${correct}</div>
          <div class="result-stat-lbl">Correct</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-val wrong">${wrong}</div>
          <div class="result-stat-lbl">Wrong</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-val">${total}</div>
          <div class="result-stat-lbl">Total</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-val" style="color:var(--accent-2);">${capitalize(currentDifficulty)}</div>
          <div class="result-stat-lbl">Difficulty</div>
        </div>
      </div>
    </div>
  `;

  const breakdownHTML = generatedQuestions.map((q, idx) => {
    const chosen   = userAnswers[idx];
    const isCorrect = chosen === q.correctIndex;
    const chosenText  = chosen !== null ? q.options[chosen]       : "(not answered)";
    const correctText = q.options[q.correctIndex];

    return `
      <div class="breakdown-card ${isCorrect ? "correct" : "wrong"}">
        <div class="breakdown-top">
          <div class="breakdown-icon ${isCorrect ? "correct" : "wrong"}">${isCorrect ? "✓" : "✗"}</div>
          <p class="breakdown-q">${idx + 1}. ${escapeHtml(q.prompt)}</p>
        </div>
        <div class="breakdown-answers">
          ${!isCorrect ? `
            <div class="ans-row your-wrong">
              <span class="lbl">Your answer:</span>
              <span class="val">${escapeHtml(chosenText)}</span>
            </div>
          ` : ""}
          <div class="ans-row correct-ans">
            <span class="lbl">Correct answer:</span>
            <span class="val">${escapeHtml(correctText)}</span>
          </div>
        </div>
        ${q.explanation ? `
          <div class="explanation-box">
            <strong>💡 Explanation:</strong> ${escapeHtml(q.explanation)}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  document.getElementById("resultBreakdown").innerHTML = `
    <h3 class="breakdown-title">Answer Breakdown</h3>
    ${breakdownHTML}
  `;
}

// ── Retake / New Topic buttons ────────────────────────────────────────────────
document.getElementById("retakeBtn")?.addEventListener("click", () => {
  // Re-run the quiz with the same questions
  userAnswers = Array(generatedQuestions.length).fill(null);
  // Reset visual selections
  document.querySelectorAll(".q-option").forEach(l => l.classList.remove("selected"));
  document.querySelectorAll(".q-card").forEach(c => c.classList.remove("answered"));
  document.querySelectorAll("input[type='radio']").forEach(r => (r.checked = false));
  updateAnsweredCount();
  showPanel("quiz");
  setStep(2);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("newTopicBtn")?.addEventListener("click", () => {
  // Reset everything
  generatedQuestions = [];
  userAnswers        = [];
  currentTopic       = "";
  genLoader.classList.remove("active");
  document.querySelector(".setup-card").style.display = "";
  // Remove any previous error messages
  document.querySelectorAll(".setup-card .generate-row p").forEach(el => el.remove());
  showPanel("setup");
  setStep(1);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getGrade(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function getResultTitle(pct) {
  if (pct >= 90) return "Outstanding!";
  if (pct >= 75) return "Well done!";
  if (pct >= 60) return "Good effort!";
  if (pct >= 40) return "Keep practising";
  return "Time to review";
}

function getResultEmoji(pct) {
  if (pct >= 90) return "🏆";
  if (pct >= 75) return "🎉";
  if (pct >= 60) return "👍";
  if (pct >= 40) return "📖";
  return "💪";
}

function getFeedback(pct) {
  if (pct >= 90) return `Excellent mastery of ${currentTopic}! You clearly have a strong grip on this topic.`;
  if (pct >= 75) return `Great work on ${currentTopic}. A few areas to polish — review the missed questions.`;
  if (pct >= 60) return `Solid attempt on ${currentTopic}. Focus on the explanations below to fill the gaps.`;
  if (pct >= 40) return `You have a basic foundation on ${currentTopic}. Study the explanations and retry for a better score.`;
  return `${currentTopic} needs more practice. Study the topic thoroughly and try again — you'll improve!`;
}

