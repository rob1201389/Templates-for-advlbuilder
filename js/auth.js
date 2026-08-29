/* ============================================================
   Simple client-side login gate.
   Accounts are stored in this browser's localStorage with a
   salted SHA-256 password hash. NOTE: this is a convenience
   gate for a static app, not server-grade security — if you
   need real multi-user auth, host the app behind a login
   (e.g. Netlify/Cloudflare Access, or a small backend).
   ============================================================ */

const AUTH_KEY = "adbuilder_users";
const SESSION_KEY = "adbuilder_session";

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; }
  catch { return {}; }
}
function saveUsers(users) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(users));
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + ":" + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function registerUser(email, password) {
  email = email.trim().toLowerCase();
  if (!email || password.length < 6) {
    throw new Error("Enter an email and a password of at least 6 characters.");
  }
  const users = loadUsers();
  if (users[email]) throw new Error("An account with that email already exists on this device.");
  const salt = randomSalt();
  users[email] = { salt, hash: await hashPassword(password, salt) };
  saveUsers(users);
  return email;
}

async function loginUser(email, password) {
  email = email.trim().toLowerCase();
  const users = loadUsers();
  const rec = users[email];
  if (!rec) throw new Error("No account found for that email on this device.");
  const hash = await hashPassword(password, rec.salt);
  if (hash !== rec.hash) throw new Error("Incorrect password.");
  sessionStorage.setItem(SESSION_KEY, email);
  return email;
}

function currentUser() {
  return sessionStorage.getItem(SESSION_KEY);
}

function logoutUser() {
  sessionStorage.removeItem(SESSION_KEY);
}

function hasAnyUsers() {
  return Object.keys(loadUsers()).length > 0;
}

/* ---- Login screen wiring ---- */
function initAuthUI(onReady) {
  const overlay = document.getElementById("login-overlay");
  const form = document.getElementById("login-form");
  const emailEl = document.getElementById("login-email");
  const passEl = document.getElementById("login-password");
  const errEl = document.getElementById("login-error");
  const modeBtn = document.getElementById("login-mode-toggle");
  const submitBtn = document.getElementById("login-submit");
  const titleEl = document.getElementById("login-title");

  let mode = hasAnyUsers() ? "login" : "register";

  function applyMode() {
    const registering = mode === "register";
    titleEl.textContent = registering ? "Create your account" : "Sign in";
    submitBtn.textContent = registering ? "Create account" : "Sign in";
    modeBtn.textContent = registering
      ? "Already have an account? Sign in"
      : "New here? Create an account";
    errEl.textContent = "";
  }
  applyMode();

  modeBtn.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    applyMode();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    try {
      if (mode === "register") {
        await registerUser(emailEl.value, passEl.value);
      }
      await loginUser(emailEl.value, passEl.value);
      overlay.hidden = true;
      onReady(currentUser());
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  if (currentUser()) {
    overlay.hidden = true;
    onReady(currentUser());
  }
}
