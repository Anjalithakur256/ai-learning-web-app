# AI Learning Guide

A structured web platform for learning Artificial Intelligence step-by-step — with topic roadmaps, interactive quizzes, real-time progress tracking, and an AI-powered chat assistant powered by Gemini API.

---

## Pages

| File | Description |
|---|---|
| `index.html` | Home — hero, roadmap overview, progress showcase |
| `login.html` | Authentication — sign in / sign up |
| `dashboard.html` | Student dashboard — progress, charts, roadmap |
| `topic.html` | Individual topic viewer |
| `quiz.html` | Quiz engine |
| `chat.html` | AI chat assistant (Gemini-powered) |
| `profile.html` | User profile and settings |
| `about.html` | Platform info, tech stack |
| `teacher-dashboard.html` | Admin / teacher control panel |
| `privacy.html` | Privacy policy |

---

## Project Structure

```
ai-learning-guide-web-app/
│
├── index.html                    # Home page
├── login.html                    # Auth page
├── dashboard.html                # Student dashboard
├── topic.html                    # Topic viewer
├── quiz.html                     # Quiz engine
├── chat.html                     # AI chat
├── profile.html                  # User profile
├── about.html                    # About page
├── teacher-dashboard.html        # Admin panel
├── privacy.html                  # Privacy policy
│
├── assets/
│   ├── css/
│   │   └── styles.css            # Global stylesheet
│   └── js/
│       ├── db.js                 # Firebase client + data helpers
│       ├── auth.js               # Auth logic (login / register)
│       ├── main.js               # Shared nav, auth state, logout
│       ├── quiz.js               # Quiz engine logic
│       ├── chat.js               # Chat UI and message handling
│       ├── chat-enhanced.js      # Extended chat features
│       ├── dashboard-charts.js   # Dashboard chart rendering
│       ├── dashboard-progress.js # Dashboard progress tracking
│       ├── teacher-dashboard.js  # Admin panel data + UI
│       ├── profile-page.js       # Profile tab UI and updates
│       ├── ocr-processor.js      # Image-to-text for chat uploads
│       └── services/
│           ├── config.js               # App configuration constants
│           ├── logger.js               # Logging utility
│           ├── error-handler.js        # Centralised error handling
│           ├── api-service.js          # Gemini API proxy client
│           ├── ai-inference-service.js # AI inference wrapper
│           ├── database-service.js     # Firestore abstraction
│           ├── rag-engine.js           # Retrieval-augmented generation
│           ├── tutor-orchestrator.js   # AI tutor session logic
│           └── frontend-integration.js # Service bootstrap for UI
│
├── data/
│   ├── topics.json               # Topic content (fetched client-side)
│   └── quizzes.json              # Quiz bank (fetched client-side)
│
├── functions/
│   ├── index.js                  # Cloud Function — Gemini API proxy
│   └── package.json              # Functions dependencies (Node 20)
│
├── firebase.json                 # Firebase Hosting + Functions config
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Firestore composite indexes
└── server.js                     # Local dev server (not deployed)
```

---

## Firebase Setup

This project uses:
- **Firebase Hosting** — serves all static files
- **Cloud Firestore** — stores user profiles, quiz results, progress
- **Firebase Auth** — email/password authentication
- **Cloud Functions** — `geminiProxy` proxies AI requests to Gemini API securely

### Deploy

```bash
# Install Firebase CLI (once)
npm install -g firebase-tools

# Login
firebase login

# Deploy everything (hosting + functions + firestore rules)
firebase deploy

# Deploy hosting only
firebase deploy --only hosting
```

### Local Preview

```bash
# Option 1 — Node dev server (included)
node server.js

# Option 2 — Python
python -m http.server 8000

# Option 3 — Firebase local emulator
firebase emulators:start
```

Then open `http://localhost:8000` (or `http://localhost:5000` for the Firebase emulator).

---

## Environment Variables

Set these in **Firebase Console → Functions → Configuration**:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (ES Modules) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| AI | Google Gemini API via Cloud Function proxy |
| Hosting | Firebase Hosting |
| Charts | Chart.js (CDN) |
| Excel Export | SheetJS / xlsx (CDN) |
