// Dashboard Charts with Chart.js
import { getRecentQuizResults } from "./db.js";

// Chart color variables matching the theme
const chartColors = {
  primary: 'rgba(100, 200, 255, 1)',
  primaryLight: 'rgba(100, 200, 255, 0.1)',
  secondary: 'rgba(255, 100, 200, 1)',
  secondaryLight: 'rgba(255, 100, 200, 0.1)',
  text: 'rgba(220, 220, 220, 1)',
  grid: 'rgba(255, 255, 255, 0.1)',
};

// Get theme colors from CSS variables if available
function getThemeColors() {
  const root = document.documentElement;
  const glowColor = getComputedStyle(root).getPropertyValue('--glow-color').trim() || '#64c8ff';
  const accentColor = getComputedStyle(root).getPropertyValue('--accent-2').trim() || '#ff64c8';
  
  return {
    primary: glowColor,
    secondary: accentColor,
  };
}

/* ======== Weekly Progress Chart ======== */
async function initWeeklyChart() {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;

  const themeColors = getThemeColors();
  
  // Get real quiz data
  const recentQuizzes = await getRecentQuizResults(10);
  
  // Group by day of week for the past 7 days
  const today = new Date();
  const weeklyScores = Array(7).fill(null);
  const weeklyLabels = [];
  
  // Generate labels for the past 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    weeklyLabels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
  }
  
  // Map quiz results to days
  recentQuizzes.forEach(quiz => {
    const quizDate = new Date(quiz.attemptedAt);
    const daysDiff = Math.floor((today - quizDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= 0 && daysDiff < 7) {
      const index = 6 - daysDiff;
      // Average if multiple quizzes on same day
      if (weeklyScores[index] === null) {
        weeklyScores[index] = quiz.percentage;
      } else {
        weeklyScores[index] = (weeklyScores[index] + quiz.percentage) / 2;
      }
    }
  });

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: weeklyLabels,
      datasets: [
        {
          label: 'Quiz Score %',
          data: weeklyScores,
          borderColor: themeColors.primary,
          backgroundColor: themeColors.primary.replace('1)', '0.1)'),
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: themeColors.primary,
          pointBorderColor: '#0f1420',
          pointBorderWidth: 2,
          pointHoverRadius: 7,
          spanGaps: true, // Connect points even if some days have no data
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: chartColors.text,
            font: {
              size: 12,
              weight: 600,
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.parsed.y === null) return 'No quiz taken';
              return 'Score: ' + Math.round(context.parsed.y) + '%';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: chartColors.text,
            callback: function (value) {
              return value + '%';
            }
          },
          grid: {
            color: chartColors.grid,
            drawBorder: false,
          }
        },
        x: {
          ticks: {
            color: chartColors.text,
          },
          grid: {
            display: false,
          }
        }
      }
    }
  });
}

/* ======== Topic Mastery Chart ======== */
async function initTopicChart() {
  const ctx = document.getElementById('topicChart');
  if (!ctx) return;

  const themeColors = getThemeColors();
  
  // Get real quiz data and calculate mastery by topic
  const recentQuizzes = await getRecentQuizResults(20);
  
  // Group quizzes by topic and calculate average scores
  const topicScores = {};
  const topicNames = {
    'ai-basics': 'AI Basics',
    'machine-learning': 'Machine Learning',
    'deep-learning': 'Deep Learning',
    'nlp': 'NLP',
    'neural-networks': 'Neural Networks',
    'model-evaluation': 'Model Evaluation',
    'transformers': 'Transformers',
    'generative-ai': 'Generative AI'
  };
  
  recentQuizzes.forEach(quiz => {
    const topicId = quiz.quizId || 'ai-basics';
    if (!topicScores[topicId]) {
      topicScores[topicId] = { total: 0, count: 0 };
    }
    topicScores[topicId].total += quiz.percentage;
    topicScores[topicId].count += 1;
  });
  
  // Calculate averages and prepare data
  const labels = [];
  const data = [];
  const colors = [];
  
  Object.entries(topicScores).forEach(([topicId, scores], index) => {
    labels.push(topicNames[topicId] || topicId);
    data.push(Math.round(scores.total / scores.count));
    
    // Alternate colors
    if (index % 2 === 0) {
      colors.push(themeColors.primary);
    } else {
      colors.push(themeColors.secondary);
    }
  });
  
  // If no data, show placeholder
  if (labels.length === 0) {
    labels.push('No Topics Yet');
    data.push(0);
    colors.push(themeColors.primary);
  }

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Mastery Level %',
          data: data,
          backgroundColor: colors,
          borderRadius: 8,
          borderSkipped: false,
        }
      ]
    },
    options: {
      indexAxis: undefined,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: chartColors.text,
            font: {
              size: 12,
              weight: 600,
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: chartColors.text,
            callback: function (value) {
              return value + '%';
            }
          },
          grid: {
            color: chartColors.grid,
            drawBorder: false,
          }
        },
        x: {
          ticks: {
            color: chartColors.text,
          },
          grid: {
            display: false,
          }
        }
      }
    }
  });
}

/* ======== Initialize Charts ======== */
document.addEventListener('DOMContentLoaded', () => {
  // Delay to ensure Chart.js is fully loaded
  setTimeout(() => {
    initWeeklyChart();
    initTopicChart();
  }, 100);
});
