/**
 * profile-page.js
 * Handles all logic for the profile page: loading user data,
 * rendering role-specific content, tab switching, and save actions.
 */

import {
  getDoc,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut, sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db, getLearningProfile, saveLearningProfile } from "./db.js";

// ── Utility ──────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  let date;
  if (value?.toDate) date = value.toDate();          // Firestore Timestamp
  else if (typeof value === "string") date = new Date(value);
  else date = new Date(value);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function capitalize(str) {
  if (!str) return "—";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showSaveMsg(msgEl) {
  msgEl.style.display = "inline";
  setTimeout(() => (msgEl.style.display = "none"), 3000);
}

// ── Avatar display helper ─────────────────────────────────────────────────────
function setAvatarDisplay(avatarEl, photoSrc, initials) {
  if (!avatarEl) return;
  if (photoSrc) {
    avatarEl.innerHTML = `<img src="${photoSrc}" alt="Profile photo" />`;
    avatarEl.style.fontSize = "0";
    avatarEl.style.padding = "0";
  } else {
    avatarEl.textContent = initials;
    avatarEl.style.fontSize = "";
    avatarEl.style.padding = "";
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".profile-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".profile-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".profile-tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = document.getElementById("tab-" + btn.dataset.tab);
    if (panel) panel.classList.add("active");
  });
});

// ── Main auth listener ────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return; // guard handled by inline script

  // ─ Avatar & hero ─
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const roleBadgeEl = document.getElementById("roleBadge");
  const joinDateEl = document.getElementById("joinDate");

  const displayName = user.displayName || "Learner";
  const initials = getInitials(displayName);
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email || "—";

  // ─ Avatar: custom upload > Google/provider photoURL > initials ─
  const storedPhoto = localStorage.getItem(`profilePhoto_${user.uid}`);
  const photoSrc = storedPhoto || user.photoURL || null;
  setAvatarDisplay(avatarEl, photoSrc, initials);

  // ─ Avatar upload handler ─
  const avatarWrap = document.getElementById("avatarUploadWrap");
  const avatarInput = document.getElementById("avatarInput");
  if (avatarWrap) {
    avatarWrap.addEventListener("click", () => avatarInput?.click());
  }
  if (avatarInput) {
    avatarInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert("Image too large. Please choose an image under 5 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        // Resize to max 400×400 using canvas before storing
        const img = new Image();
        img.onload = () => {
          const MAX = 400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          const resized = canvas.toDataURL("image/jpeg", 0.82);
          localStorage.setItem(`profilePhoto_${user.uid}`, resized);
          setAvatarDisplay(avatarEl, resized, initials);
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
  }

  // ─ Security info ─
  const signInMethodEl = document.getElementById("signInMethod");
  const emailVerifiedEl = document.getElementById("emailVerified");
  if (signInMethodEl) {
    const provider = user.providerData?.[0]?.providerId || "email";
    signInMethodEl.textContent = provider === "google.com" ? "Google" : "Email / Password";
  }
  if (emailVerifiedEl) {
    emailVerifiedEl.textContent = user.emailVerified ? "✓ Verified" : "✗ Not verified";
    emailVerifiedEl.style.color = user.emailVerified ? "var(--accent-2)" : "#ff8080";
  }

  // ─ Fetch Firestore profile ─
  let userData = {};
  let userRole = "student";
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      userData = userSnap.data();
      userRole = userData.role || "student";
    }
  } catch (e) {
    console.warn("Could not fetch user profile:", e.message);
  }

  // ─ Learning profile (separate collection) ─
  let learningProfile = {};
  try {
    learningProfile = (await getLearningProfile()) || {};
  } catch (e) { /* ignore */ }

  // ─ Role badge ─
  if (roleBadgeEl) {
    roleBadgeEl.textContent = capitalize(userRole);
    roleBadgeEl.className = "role-badge " + userRole;
  }

  // ─ Join / last active dates ─
  const joinStr = formatDate(userData.createdAt);
  if (joinDateEl) joinDateEl.textContent = joinStr !== "—" ? `Member since ${joinStr}` : "";

  // ─ Overview tab details ─
  setText("detailName", displayName);
  setText("detailEmail", user.email);
  setText("detailRole", capitalize(userRole));
  setText("detailJoin", formatDate(userData.createdAt));
  setText("detailLastActive", formatDate(userData.lastActiveAt));
  setText("detailLevel", userData.level || "Beginner");
  setText("detailGrade", userData.grade || learningProfile.grade || "—");

  const subjects = Array.isArray(userData.subjects)
    ? userData.subjects.join(", ")
    : (learningProfile.subjects || ["—"]).join(", ");
  setText("detailSubjects", subjects);
  setText("detailStyle", learningProfile.preferredLearningStyle || "—");

  // ─ Pre-fill edit form ─
  const editNameEl = document.getElementById("editName");
  const editGradeEl = document.getElementById("editGrade");
  if (editNameEl) editNameEl.value = displayName;
  if (editGradeEl) {
    const grade = userData.grade || learningProfile.grade || "Undergraduate";
    const opt = editGradeEl.querySelector(`option[value="${grade}"]`);
    if (opt) opt.selected = true;
  }

  // ─ Pre-fill preferences ─
  const prefStyleEl = document.getElementById("prefStyle");
  const prefSubjectsEl = document.getElementById("prefSubjects");
  if (prefStyleEl && learningProfile.preferredLearningStyle) {
    const opt = prefStyleEl.querySelector(`option[value="${learningProfile.preferredLearningStyle}"]`);
    if (opt) opt.selected = true;
  }
  if (prefSubjectsEl && Array.isArray(userData.subjects) && userData.subjects[0]) {
    const opt = prefSubjectsEl.querySelector(`option[value="${userData.subjects[0]}"]`);
    if (opt) opt.selected = true;
  }

  // ─ Role-specific info block ─
  renderRoleBlock(userRole, userData);
});

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function renderRoleBlock(role, userData) {
  const block = document.getElementById("roleInfoBlock");
  if (!block) return;

  if (role === "student") {
    block.innerHTML = `
      <h3>🎓 Student Space</h3>
      <p>
        As a student, your dashboard tracks your AI learning journey — quiz scores, 
        topic mastery, streaks, and personalised recommendations. Use the Chat to ask 
        questions and the Quiz section to test your understanding.
      </p>
      <div class="quick-links">
        <a href="dashboard.html" class="quick-link">📊 My Dashboard</a>
        <a href="quiz.html" class="quick-link">🧠 Take a Quiz</a>
        <a href="chat.html" class="quick-link">💬 Ask AI Tutor</a>
      </div>
    `;
  } else if (role === "teacher" || role === "admin") {
    block.style.background = "linear-gradient(135deg, rgba(124,77,255,0.1), rgba(18,25,33,0.95))";
    block.style.borderColor = "rgba(124,77,255,0.3)";
    block.innerHTML = `
      <h3>🏫 ${role === "admin" ? "Admin" : "Teacher"} Space</h3>
      <p>
        As a ${role}, you have access to the Teacher Dashboard where you can monitor 
        student progress, flag struggling learners, build assessments, and manage class activity.
      </p>
      <div class="quick-links">
        <a href="teacher-dashboard.html" class="quick-link" style="color:#b39dff; border-color:rgba(124,77,255,0.4); background:rgba(124,77,255,0.12);">📋 Teacher Dashboard</a>
        <a href="dashboard.html" class="quick-link" style="color:#b39dff; border-color:rgba(124,77,255,0.4); background:rgba(124,77,255,0.12);">📊 Overview</a>
        <a href="chat.html" class="quick-link" style="color:#b39dff; border-color:rgba(124,77,255,0.4); background:rgba(124,77,255,0.12);">💬 Chat</a>
      </div>
    `;
  }
}

// ── Shared profile save logic ─────────────────────────────────────────────────
async function doSaveProfile(msgEl) {
  const user = auth.currentUser;
  if (!user) return;

  const name = document.getElementById("editName")?.value?.trim();
  const grade = document.getElementById("editGrade")?.value;

  if (msgEl) { msgEl.textContent = "Saving…"; msgEl.style.color = "var(--muted)"; msgEl.style.display = "inline"; }

  try {
    if (name) await updateProfile(user, { displayName: name });
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      name: name || user.displayName,
      grade: grade || "Undergraduate",
      lastActiveAt: serverTimestamp(),
    });
    // Update hero UI instantly
    const nameEl = document.getElementById("profileName");
    const avatarEl = document.getElementById("profileAvatar");
    const detailNameEl = document.getElementById("detailName");
    const detailGradeEl = document.getElementById("detailGrade");
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) {
      const stored = localStorage.getItem(`profilePhoto_${user.uid}`);
      setAvatarDisplay(avatarEl, stored || user.photoURL || null, getInitials(name));
    }
    if (detailNameEl) detailNameEl.textContent = name;
    if (detailGradeEl) detailGradeEl.textContent = grade;
    if (msgEl) { msgEl.textContent = "✓ Saved"; msgEl.style.color = "var(--accent-2)"; setTimeout(() => (msgEl.style.display = "none"), 2000); }
  } catch (e) {
    console.error("Save profile error:", e.message);
    if (msgEl) { msgEl.textContent = "✗ Save failed"; msgEl.style.color = "#ff8080"; setTimeout(() => { msgEl.style.display = "none"; msgEl.style.color = ""; }, 3000); }
  }
}

// ── Live auto-save: name (debounced) & grade (immediate) ─────────────────────
{
  let _profileDebounce = null;
  const msgEl = document.getElementById("saveMsg");

  document.getElementById("editName")?.addEventListener("input", () => {
    clearTimeout(_profileDebounce);
    _profileDebounce = setTimeout(() => doSaveProfile(msgEl), 900);
  });

  document.getElementById("editGrade")?.addEventListener("change", () => {
    clearTimeout(_profileDebounce);
    doSaveProfile(msgEl);
  });
}

// ── Save profile button (still works as manual trigger) ───────────────────────
document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
  doSaveProfile(document.getElementById("saveMsg"));
});

// ── Shared preferences save logic ────────────────────────────────────────────
async function doSavePreferences(msgEl) {
  const style = document.getElementById("prefStyle")?.value;
  const subject = document.getElementById("prefSubjects")?.value;

  if (msgEl) { msgEl.textContent = "Saving…"; msgEl.style.color = "var(--muted)"; msgEl.style.display = "inline"; }

  try {
    await saveLearningProfile({
      preferredLearningStyle: style,
      subjects: [subject],
    });
    // Sync subjects to user doc too
    const user = auth.currentUser;
    if (user) {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        subjects: [subject],
        lastActiveAt: serverTimestamp(),
      }, { merge: true });
    }
    setText("detailStyle", style);
    setText("detailSubjects", subject);
    if (msgEl) { msgEl.textContent = "✓ Preferences saved"; msgEl.style.color = "var(--accent-2)"; setTimeout(() => (msgEl.style.display = "none"), 2000); }
  } catch (e) {
    console.error("Save preferences error:", e.message);
    if (msgEl) { msgEl.textContent = "✗ Save failed"; msgEl.style.color = "#ff8080"; setTimeout(() => { msgEl.style.display = "none"; msgEl.style.color = ""; }, 3000); }
  }
}

// ── Auto-save learning style on dropdown change ───────────────────────────────
document.getElementById("prefStyle")?.addEventListener("change", () => {
  doSavePreferences(document.getElementById("prefSaveMsg"));
});

document.getElementById("prefSubjects")?.addEventListener("change", () => {
  doSavePreferences(document.getElementById("prefSaveMsg"));
});

// ── Save preferences button (still works as manual trigger) ──────────────────
document.getElementById("savePrefBtn")?.addEventListener("click", () => {
  doSavePreferences(document.getElementById("prefSaveMsg"));
});

// ── Password reset ────────────────────────────────────────────────────────────
document.getElementById("resetPasswordBtn")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user?.email) return;
  try {
    await sendPasswordResetEmail(auth, user.email);
    const msgEl = document.getElementById("resetMsg");
    if (msgEl) {
      msgEl.style.display = "block";
      showSaveMsg(msgEl);
    }
  } catch (e) {
    console.error("Password reset error:", e.message);
  }
});

// ── Logout buttons ────────────────────────────────────────────────────────────
async function doLogout() {
  await signOut(auth);
  window.location.href = "index.html";
}

document.getElementById("logoutButton")?.addEventListener("click", doLogout);
document.getElementById("logoutButton2")?.addEventListener("click", doLogout);
