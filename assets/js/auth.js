import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth, createUserProfile } from "./db.js";

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authMessage = document.getElementById("authMessage");
const tabs = document.querySelectorAll(".tab");
const logoutButton = document.getElementById("logoutButton");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");

// Helper function to show messages with styling
function showMessage(message, type = 'info') {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.className = 'auth-message';
  if (type === 'success') authMessage.classList.add('success');
  if (type === 'error') authMessage.classList.add('error');
}

// Helper function to set loading state on button
function setLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    button.classList.add('loading');
    button.disabled = true;
    button.dataset.originalText = button.textContent;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// Password visibility toggle
document.querySelectorAll('.password-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const targetId = toggle.dataset.target;
    const input = document.getElementById(targetId);
    if (input) {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.innerHTML = isPassword 
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
    }
  });
});

// Password strength indicator
const signupPassword = document.getElementById('signupPassword');
const strengthBar = document.getElementById('passwordStrengthBar');

if (signupPassword && strengthBar) {
  signupPassword.addEventListener('input', () => {
    const password = signupPassword.value;
    strengthBar.className = 'password-strength-bar';
    
    if (password.length === 0) {
      strengthBar.style.width = '0';
      return;
    }
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 2) strengthBar.classList.add('weak');
    else if (strength <= 3) strengthBar.classList.add('medium');
    else strengthBar.classList.add('strong');
  });
}

if (tabs.length) {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((btn) => btn.classList.remove("active"));
      tab.classList.add("active");
      
      // Clear auth message on tab switch
      if (authMessage) {
        authMessage.textContent = '';
        authMessage.className = 'auth-message';
      }

      const target = tab.dataset.tab;
      if (target === "login") {
        loginForm?.classList.remove("hidden");
        signupForm?.classList.add("hidden");
      } else {
        signupForm?.classList.remove("hidden");
        loginForm?.classList.add("hidden");
      }
    });
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    const submitBtn = loginForm.querySelector('.login-btn');
    
    if (!email || !password) {
      showMessage('Please fill in all fields.', 'error');
      return;
    }
    
    setLoading(submitBtn, true);
    
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      // Non-blocking: don't let Firestore errors prevent login
      createUserProfile(credential.user).catch(e => console.warn('Profile sync skipped:', e.message));
      showMessage('Login successful! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 500);
    } catch (error) {
      setLoading(submitBtn, false);
      // User-friendly error messages
      if (error.code === 'auth/user-not-found') {
        showMessage('No account found with this email. Please sign up first.', 'error');
      } else if (error.code === 'auth/wrong-password') {
        showMessage('Incorrect password. Please try again.', 'error');
      } else if (error.code === 'auth/invalid-email') {
        showMessage('Please enter a valid email address.', 'error');
      } else if (error.code === 'auth/too-many-requests') {
        showMessage('Too many failed attempts. Please try again later.', 'error');
      } else if (error.code === 'auth/invalid-credential') {
        showMessage('Invalid email or password. Please check and try again.', 'error');
      } else {
        showMessage(error.message, 'error');
      }
    }
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = signupForm.name.value.trim();
    const email = signupForm.email.value.trim();
    const password = signupForm.password.value;
    const confirmPassword = signupForm.confirmPassword?.value;
    const submitBtn = signupForm.querySelector('.login-btn');
    
    // Validation
    if (!name || !email || !password) {
      showMessage('Please fill in all fields.', 'error');
      return;
    }
    
    if (password.length < 6) {
      showMessage('Password must be at least 6 characters.', 'error');
      return;
    }
    
    if (confirmPassword && password !== confirmPassword) {
      showMessage('Passwords do not match.', 'error');
      return;
    }
    
    setLoading(submitBtn, true);
    
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      await updateProfile(credential.user, { displayName: name });
      // Non-blocking: don't let Firestore errors prevent signup
      createUserProfile(credential.user).catch(e => console.warn('Profile sync skipped:', e.message));
      showMessage('Account created successfully! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 500);
    } catch (error) {
      setLoading(submitBtn, false);
      // User-friendly error messages
      if (error.code === 'auth/email-already-in-use') {
        showMessage('This email is already registered. Please login instead.', 'error');
      } else if (error.code === 'auth/invalid-email') {
        showMessage('Please enter a valid email address.', 'error');
      } else if (error.code === 'auth/weak-password') {
        showMessage('Password is too weak. Please use a stronger password.', 'error');
      } else {
        showMessage(error.message, 'error');
      }
    }
  });
}

// Forgot Password handler
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = loginForm?.email?.value?.trim();
    
    if (!email) {
      showMessage('Please enter your email address first.', 'error');
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage('Password reset email sent! Check your inbox.', 'success');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        showMessage('No account found with this email.', 'error');
      } else {
        showMessage(error.message, 'error');
      }
    }
  });
}

// Google Sign-In handler
const googleSignInButton = document.getElementById("googleSignIn");
if (googleSignInButton) {
  googleSignInButton.addEventListener("click", async () => {
    setLoading(googleSignInButton, true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Non-blocking: don't let Firestore errors prevent login
      createUserProfile(result.user).catch(e => console.warn('Profile sync skipped:', e.message));
      showMessage('Signed in with Google! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 500);
    } catch (error) {
      setLoading(googleSignInButton, false);
      if (error.code === 'auth/popup-closed-by-user') {
        showMessage('Sign-in cancelled.', 'error');
      } else if (error.code === 'auth/popup-blocked') {
        showMessage('Popup blocked. Please allow popups and try again.', 'error');
      } else {
        showMessage(error.message, 'error');
      }
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

// Check auth state and handle redirects
onAuthStateChanged(auth, (user) => {
  const isLoginPage = window.location.pathname.includes('login.html');
  
  // On login page, show message if already logged in (don't auto-redirect)
  if (user && isLoginPage) {
    const loginFormEl = document.getElementById('loginForm');
    const signupFormEl = document.getElementById('signupForm');
    const authTabs = document.querySelector('.auth-tabs');
    const googleBtn = document.getElementById('googleSignIn');
    const divider = document.querySelector('.divider');
    
    // Hide forms and show logged-in message
    if (loginFormEl) loginFormEl.classList.add('hidden');
    if (signupFormEl) signupFormEl.classList.add('hidden');
    if (authTabs) authTabs.classList.add('hidden');
    if (googleBtn) googleBtn.classList.add('hidden');
    if (divider) divider.classList.add('hidden');
    
    // Show already logged in message
    if (authMessage) {
      authMessage.innerHTML = `
        <div style="text-align: center; padding: 1rem 0;">
          <p style="margin-bottom: 1rem;">You're already logged in as <strong>${user.displayName || user.email}</strong></p>
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <a href="dashboard.html" class="login-btn" style="display: inline-block; padding: 0.75rem 1.5rem; text-decoration: none;">Go to Dashboard</a>
            <button id="logoutFromLogin" class="login-btn" style="background: transparent; border: 2px solid var(--glow-color);">Logout</button>
          </div>
        </div>
      `;
      authMessage.style.display = 'block';
      
      // Add logout handler
      document.getElementById('logoutFromLogin')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.reload();
      });
    }
    return;
  }
  
  // Update profile info on other pages
  if (profileName && profileEmail) {
    if (user) {
      profileName.textContent = user.displayName || "Learner";
      profileEmail.textContent = user.email || "";
    } else {
      profileName.textContent = "Guest";
      profileEmail.textContent = "Log in to see progress.";
    }
  }
});
