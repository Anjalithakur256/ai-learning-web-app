import { getQuizById, saveQuizResult } from "./db.js";

const quizForm = document.getElementById("quizForm");
const quizTitle = document.getElementById("quizTitle");
const quizSubtitle = document.getElementById("quizSubtitle");
const quizResult = document.getElementById("quizResult");
const submitButton = document.getElementById("submitQuiz");

let quizData = null;

async function loadQuiz() {
  if (!quizForm) {
    return;
  }

  const quizId = new URLSearchParams(window.location.search).get("quiz") || "ai-basics";
  quizData = await getQuizById(quizId);

  if (!quizData) {
    quizTitle.textContent = "Quiz not found";
    quizSubtitle.textContent = "Check the quiz id or try another topic.";
    return;
  }

  quizTitle.textContent = quizData.title || "AI Quiz";
  quizSubtitle.textContent = quizData.subtitle || "Answer all questions below.";

  quizForm.innerHTML = quizData.questions
    .map(
      (question, index) => `
      <div class="quiz-question">
        <h3>${index + 1}. ${question.prompt}</h3>
        <div class="quiz-options">
          ${question.options
            .map(
              (option, optionIndex) => `
              <label>
                <input
                  type="radio"
                  name="question-${index}"
                  value="${optionIndex}"
                  required
                />
                ${option}
              </label>
            `
            )
            .join("")}
        </div>
      </div>
    `
    )
    .join("");
}

function calculateScore() {
  if (!quizData) {
    return { score: 0, total: 0 };
  }

  const total = quizData.questions.length;
  let score = 0;

  quizData.questions.forEach((question, index) => {
    const answer = quizForm.querySelector(`input[name="question-${index}"]:checked`);
    if (answer && Number(answer.value) === question.correctIndex) {
      score += 1;
    }
  });

  return { score, total };
}

if (submitButton) {
  submitButton.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!quizForm.checkValidity()) {
      quizForm.reportValidity();
      return;
    }

    const { score, total } = calculateScore();
    const percent = Math.round((score / total) * 100);
    
    let feedbackMessage = "";
    if (percent >= 80) {
      feedbackMessage = "Excellent work! You have strong conceptual clarity.";
    } else if (percent >= 50) {
      feedbackMessage = "Good attempt! Review weak areas and try again.";
    } else {
      feedbackMessage = "Revise the topic and attempt the quiz again to strengthen your understanding.";
    }
    
    quizResult.innerHTML = `
      <div class="quiz-score">You scored ${score}/${total} (${percent}%)</div>
      <div class="quiz-feedback">${feedbackMessage}</div>
    `;

    await saveQuizResult({
      quizId: quizData?.id || "",
      score: percent,
      total,
    });
  });
}

loadQuiz();
