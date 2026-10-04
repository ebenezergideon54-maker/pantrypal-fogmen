/* =========================================================
   PantryPal x Fogmen — client app
   Vanilla JS SPA. Auth + saved recipes + history + donations
   are all backed by Netlify Functions over a MySQL database.
   Only theme + "recipe of the day" cache stay local.
========================================================= */

const COMMON_INGREDIENTS = [
  "tomatoes","eggs","rice","chicken","onion","garlic","potato","spinach",
  "beans","cheese","pasta","milk","carrot","bell pepper","ginger","fish",
  "beef","yogurt","lentils","broccoli","mushroom","butter","lemon","bread"
];
const DIETS = ["", "vegetarian", "vegan", "gluten free", "ketogenic", "pescetarian"];
const CUISINES = ["", "italian", "mexican", "chinese", "indian", "american", "mediterranean", "african", "thai"];

/* ---------------- Local-only prefs ---------------- */
const Store = (() => {
  const readJSON = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
  };
  return {
    getTheme: () => localStorage.getItem("pantrypal_theme") || "light",
    setTheme: (t) => localStorage.setItem("pantrypal_theme", t),
    getROTD: () => readJSON("pantrypal_rotd", null),
    setROTD: (v) => localStorage.setItem("pantrypal_rotd", JSON.stringify(v)),
  };
})();

/* ---------------- Small utilities ---------------- */
function toast(msg) {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function h(strings, ...vals) { return strings.reduce((a,s,i) => a + s + (vals[i] ?? ""), ""); }

/** Animates a <strong> element's number from 0 to `value` briefly — used on stat cards. */
function animateNumber(el, value, { decimals = 0, suffix = "" } = {}) {
  if (!el) return;
  const start = 0;
  const duration = 700;
  const t0 = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = start + (value - start) * eased;
    el.textContent = current.toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function friendlyError(err) {
  if (err && err.message && err.message.includes("Database is not configured")) {
    return "The database isn't connected yet. Add DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in Netlify's environment variables (see README), then redeploy.";
  }
  return (err && err.message) || "Something went wrong.";
}

/* ---------------- Global app state ---------------- */
const APP = {
  user: null,
  ingredients: [],
  filters: { diet: "", cuisine: "", maxReadyTime: "" },
  recipeMeta: {},       // id -> { usedIngredients, missedIngredients } from the last search
  savedIds: new Set(),  // cached for instant heart toggles
  savedList: [],
};

/* ---------------- Router ---------------- */
const routes = {
  "/home": renderHome,
  "/results": renderResults,
  "/saved": renderSaved,
  "/impact": renderImpact,
  "/support": renderSupport,
  "/account": renderAccount,
};

function router() {
  const hash = location.hash.replace(/^#/, "") || "/home";
  updateBottomNav(hash);

  if (!APP.user) { renderAuth(); return; }

  if (hash.startsWith("/recipe/")) {
    renderRecipeDetail(hash.split("/recipe/")[1]);
    return;
  }
  (routes[hash] || renderHome)();
}

function updateBottomNav(hash) {
  const root = hash.split("/")[1] || "home";
  document.querySelectorAll("#bottomnav a").forEach(a => a.classList.toggle("active", a.dataset.route === root));
  document.querySelectorAll("#toplinks a").forEach(a => a.classList.toggle("active", a.dataset.route === root));
  document.getElementById("bottomnav").style.display = APP.user ? "flex" : "none";
  document.getElementById("topbar").style.display = APP.user ? "flex" : "none";
}
function go(hash) { location.hash = hash; }

function renderAuthSlot() {
  const slot = document.getElementById("auth-slot");
  if (!APP.user) { slot.innerHTML = ""; return; }
  slot.innerHTML = h`<button class="user-pill" id="user-pill-btn">${initials(APP.user.name)}</button>`;
  document.getElementById("user-pill-btn").onclick = () => go("/account");
}

/* ================= AUTH VIEW ================= */
let authMode = "login";
function renderAuth() {
  document.getElementById("bottomnav").style.display = "none";
  document.getElementById("topbar").style.display = "none";
  const app = document.getElementById("app");
  const isLogin = authMode === "login";
  app.innerHTML = h`
    <div class="view auth-shell">
      <aside class="auth-side">
        <div class="auth-side-top">
          <a href="#/home" class="wordmark"><span class="wordmark-mark">p</span><span>pantrypal</span></a>
          <p class="eyebrow">A little less waste. A lot more dinner.</p>
          <h1>Good things are already in your kitchen.</h1>
          <p>PantryPal finds the meal in what you have, before anything gets forgotten in the crisper.</p>
        </div>
        <div class="auth-side-foot">PantryPal × Fogmen · Prototype</div>
      </aside>
      <div class="auth-panel">
        <div class="auth-form-wrap">
          <p class="eyebrow">${isLogin ? "Welcome back to your kitchen" : "First time around here"}</p>
          <h2>${isLogin ? "Come on in." : "Let's get cooking."}</h2>
          <p>${isLogin ? "Your next good meal is closer than you think." : "Create an account to start saving recipes and tracking your impact."}</p>
          <div id="auth-form"></div>
          <div class="auth-switch">
            ${isLogin
              ? `New around here? <button id="switch-mode">Create an account</button>`
              : `Already have an account? <button id="switch-mode">Sign in</button>`}
          </div>
          <div class="stack-note">
            <strong>Prototype stack</strong>
            <div>
              Netlify Functions · MySQL · JWT auth<br/>
              Spoonacular recipe API<br/>
              API health: <span id="api-health">checking…</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById("switch-mode").onclick = () => { authMode = isLogin ? "signup" : "login"; renderAuth(); };
  isLogin ? renderLoginForm() : renderSignupForm();
  checkApiHealth();
}

async function checkApiHealth() {
  const el = document.getElementById("api-health");
  if (!el) return;
  try {
    await PantryAPI.getRandomRecipe("");
    if (document.getElementById("api-health")) el.textContent = "ok";
  } catch {
    if (document.getElementById("api-health")) el.textContent = "unreachable";
  }
}

function renderLoginForm() {
  const box = document.getElementById("auth-form");
  box.innerHTML = h`
    <form id="login-form">
      <input id="li-email" type="email" required autocomplete="email" placeholder="Email address" />
      <input id="li-pass" type="password" required autocomplete="current-password" placeholder="Password · 8–72 characters" />
      <div id="login-error" class="form-error" style="display:none;"></div>
      <button class="btn btn-primary btn-block" type="submit" id="login-submit">Sign in →</button>
    </form>`;
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("li-email").value.trim().toLowerCase();
    const pass = document.getElementById("li-pass").value;
    const errBox = document.getElementById("login-error");
    const btn = document.getElementById("login-submit");
    errBox.style.display = "none";
    btn.disabled = true; btn.innerHTML = `<span class="dot-loader"><span></span><span></span><span></span></span>`;
    try {
      const user = await AuthAPI.login(email, pass);
      await onAuthed(user, `Welcome back, ${user.name.split(" ")[0]} 👋`);
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.style.display = "block";
      btn.disabled = false; btn.textContent = "Sign in →";
    }
  };
}

function renderSignupForm() {
  const box = document.getElementById("auth-form");
  box.innerHTML = h`
    <form id="signup-form">
      <input id="su-name" type="text" required autocomplete="name" placeholder="Full name" />
      <input id="su-email" type="email" required autocomplete="email" placeholder="Email address" />
      <input id="su-pass" type="password" required minlength="6" autocomplete="new-password" placeholder="Password · 8–72 characters" />
      <div id="signup-error" class="form-error" style="display:none;"></div>
      <button class="btn btn-primary btn-block" type="submit" id="signup-submit">Create account →</button>
    </form>`;
  document.getElementById("signup-form").onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("su-name").value.trim();
    const email = document.getElementById("su-email").value.trim().toLowerCase();
    const pass = document.getElementById("su-pass").value;
    const errBox = document.getElementById("signup-error");
    const btn = document.getElementById("signup-submit");
    errBox.style.display = "none";
    btn.disabled = true; btn.innerHTML = `<span class="dot-loader"><span></span><span></span><span></span></span>`;
    try {
      const user = await AuthAPI.signup(name, email, pass);
      await onAuthed(user, `Account created — welcome, ${user.name.split(" ")[0]}!`);
    } catch (err) {
      errBox.textContent = friendlyError(err);
      errBox.style.display = "block";
      btn.disabled = false; btn.textContent = "Create account →";
    }
  };
}

async function onAuthed(user, message) {
  APP.user = user;
  renderAuthSlot();
  toast(message);
  await refreshSavedCache();
  go("/home");
  router();
}

/* ================= ACCOUNT VIEW ================= */
async function renderAccount() {
  const app = document.getElementById("app");
  const joined = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  app.innerHTML = h`
    <div class="view">
      <p class="eyebrow">Your corner of the kitchen</p>
      <h1>Your account.</h1>

      <div class="account-row" style="margin-top:28px;">
        <span class="account-avatar">${initials(APP.user.name)}</span>
        <div>
          <strong style="font-family:var(--serif); font-size:1.1rem; font-weight:500; display:block;">${escapeHtml(APP.user.name)}</strong>
          <span class="small-print">${escapeHtml(APP.user.email)}</span>
        </div>
      </div>

      <div class="section-head">
        <h2>Your kitchen history</h2>
        <span class="small-print" style="text-transform:uppercase; letter-spacing:.08em; font-size:.68rem;">At PantryPal since ${joined}</span>
      </div>
      <p style="margin-top:-8px;">Your ingredient searches stay with your account so it's easy to pick up where you left off.</p>
      <div id="history-list"><div class="skeleton" style="height:90px;"></div></div>

      <div class="section" style="margin-top:26px;">
        <button class="btn btn-secondary btn-block" id="clear-history-btn">🗑 Clear search history</button>
      </div>

      <div style="text-align:center;">
        <button class="link-btn" id="logout-btn">↪ Sign out of PantryPal</button>
      </div>

      <div class="stack-note" style="margin-top:40px;">
        <strong>How this is built</strong>
        <div>
          Frontend: HTML / CSS / JavaScript<br/>
          Backend: Netlify Functions (Node.js) · MySQL<br/>
          Auth: bcrypt password hashing + JWT sessions<br/>
          Recipe data: Spoonacular API
        </div>
      </div>
    </div>`;

  async function loadHistoryList() {
    try {
      const history = await DataAPI.getHistory();
      const list = document.getElementById("history-list");
      if (!history.length) {
        list.innerHTML = `<div class="empty"><p style="margin:0;">No searches yet — head to the kitchen and try a few ingredients.</p></div>`;
        return;
      }
      list.innerHTML = history.map(item => h`
        <div class="history-row"><span>${escapeHtml(item)}</span><span class="date">${joined}</span></div>
      `).join("");
    } catch (err) {
      document.getElementById("history-list").innerHTML = `<p class="small-print">${escapeHtml(friendlyError(err))}</p>`;
    }
  }
  loadHistoryList();

  document.getElementById("clear-history-btn").onclick = async () => {
    try {
      await DataAPI.clearHistory();
      toast("Search history cleared");
      loadHistoryList();
    } catch (err) {
      toast(friendlyError(err));
    }
  };

  document.getElementById("logout-btn").onclick = () => {
    AuthAPI.logout();
    APP.user = null;
    APP.savedIds = new Set();
    APP.savedList = [];
    renderAuthSlot();
    toast("Logged out. See you soon!");
    go("/home");
    router();
  };
}

/* ================= HOME VIEW ================= */
async function renderHome() {
  const app = document.getElementById("app");
  const firstName = escapeHtml(APP.user.name.split(" ")[0]);

  app.innerHTML = h`
    <div class="view home-grid">
      <div>
        <p class="eyebrow">A good day to use what you have</p>
        <h1 style="font-size:clamp(1.8rem,4.2vw,2.5rem); max-width:13ch;">What's in your kitchen, ${firstName}?</h1>
        <p style="max-width:40ch;">Tell us what's waiting in the fridge. We'll find something lovely to make from it.</p>

        <div class="panel-sage" style="margin-top:22px;">
          <h3 style="font-size:1.05rem; margin-bottom:4px;">Start with what's on hand</h3>
          <p style="font-size:.85rem; margin-bottom:16px;">List a few ingredients, separated by commas.</p>
          <div class="chip-input-wrap" id="chip-wrap" style="background:var(--panel);">
            <input id="ingredient-input" type="text" placeholder="e.g. chickpeas, lemon, spinach" autocomplete="off" />
          </div>
          <div id="autocomplete-row" class="suggest-row"></div>

          <div class="filters">
            <div class="filter-field">
              <label>Eating style</label>
              <select id="filter-diet">${DIETS.map(d => `<option value="${d}">${d ? d : "Any style"}</option>`).join("")}</select>
            </div>
            <div class="filter-field">
              <label>A place in mind?</label>
              <select id="filter-cuisine">${CUISINES.map(c => `<option value="${c}">${c ? c : "Any cuisine"}</option>`).join("")}</select>
            </div>
            <div class="filter-field">
              <label>Time to cook</label>
              <select id="filter-time">
                <option value="">Any time</option>
                <option value="15">Under 15 min</option>
                <option value="30">Under 30 min</option>
                <option value="45">Under 45 min</option>
                <option value="60">Under 60 min</option>
              </select>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:18px;">
            <button class="btn btn-primary" id="find-btn">🔍 Find recipes</button>
            <button class="btn btn-secondary" id="surprise-btn">🎲 Surprise me</button>
          </div>
        </div>

        <div class="section" style="margin-top:34px;">
          <div class="section-head"><h2>Recently on your mind</h2><span class="small-print">Your searches</span></div>
          <div id="history-section"><div class="skeleton" style="height:50px;"></div></div>
        </div>
      </div>

      <div>
        <div class="section-head"><h2>Today's small inspiration</h2><span class="small-print">A fresh find</span></div>
        <div id="rotd-slot"><div class="skeleton" style="height:260px;"></div></div>

        <div class="quote-box">
          <p class="eyebrow" style="margin-bottom:10px;">A note from us</p>
          <p>"The best ingredient is the one you already bought."</p>
          <button class="link-btn" id="home-support-btn">See the little difference →</button>
        </div>
      </div>
    </div>`;

  renderChips();
  document.getElementById("filter-diet").value = APP.filters.diet;
  document.getElementById("filter-cuisine").value = APP.filters.cuisine;
  document.getElementById("filter-time").value = APP.filters.maxReadyTime;

  const input = document.getElementById("ingredient-input");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      addIngredient(input.value.trim());
      input.value = "";
      renderAutocomplete("");
    }
  });
  input.addEventListener("input", () => renderAutocomplete(input.value));

  document.getElementById("find-btn").onclick = () => runSearch();
  document.getElementById("surprise-btn").onclick = () => surpriseMe();
  document.getElementById("home-support-btn").onclick = () => go("/impact");

  loadHistory();
  loadRecipeOfTheDay();
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function loadHistory() {
  try {
    const history = await DataAPI.getHistory();
    const section = document.getElementById("history-section");
    if (!section) return;
    if (!history.length) { section.innerHTML = `<p class="small-print">No searches yet — your recent ingredient lists will show up here.</p>`; return; }
    section.innerHTML = history.map(item => h`
      <div class="history-row" data-history="${escapeHtml(item.ingredients)}" style="cursor:pointer;">
        <span>${escapeHtml(item.ingredients)}</span><span class="date">${formatDate(item.searchedAt)}</span>
      </div>`).join("");
    section.querySelectorAll("[data-history]").forEach(row => {
      row.onclick = () => {
        APP.ingredients = row.dataset.history.split(",").map(s => s.trim()).filter(Boolean);
        renderChips();
        runSearch();
      };
    });
  } catch { /* history is a nice-to-have; fail quietly */ }
}

function renderAutocomplete(query) {
  const row = document.getElementById("autocomplete-row");
  if (!row) return;
  const q = query.trim().toLowerCase();
  const matches = q
    ? COMMON_INGREDIENTS.filter(i => i.includes(q) && !APP.ingredients.includes(i)).slice(0, 6)
    : COMMON_INGREDIENTS.filter(i => !APP.ingredients.includes(i)).slice(0, 8);
  row.innerHTML = matches.map(m => `<button class="suggest-pill" data-add="${m}">+ ${m}</button>`).join("");
  row.querySelectorAll("[data-add]").forEach(btn => {
    btn.onclick = () => {
      addIngredient(btn.dataset.add);
      document.getElementById("ingredient-input").value = "";
      renderAutocomplete("");
    };
  });
}

function addIngredient(name) {
  const clean = name.toLowerCase().replace(/,/g, "").trim();
  if (clean && !APP.ingredients.includes(clean)) {
    APP.ingredients.push(clean);
    renderChips();
  }
}

function renderChips() {
  const wrap = document.getElementById("chip-wrap");
  if (!wrap) return;
  const input = wrap.querySelector("input");
  wrap.querySelectorAll(".chip").forEach(c => c.remove());
  APP.ingredients.forEach(ing => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${escapeHtml(ing)} <button aria-label="Remove ${escapeHtml(ing)}">✕</button>`;
    chip.querySelector("button").onclick = () => {
      APP.ingredients = APP.ingredients.filter(i => i !== ing);
      renderChips();
      renderAutocomplete(input ? input.value : "");
    };
    wrap.insertBefore(chip, input);
  });
}

function sidebarCardHTML(r) {
  const ingredientCount = r.extendedIngredients?.length ?? r.missedIngredientCount ?? null;
  return h`
    <div class="sidebar-card" id="rotd-card">
      <img src="${r.image || ""}" alt="${escapeHtml(r.title)}" loading="lazy" />
      <div class="sidebar-card-body">
        <p class="eyebrow" style="margin-bottom:8px;">A real recipe, picked for today</p>
        <h4>${escapeHtml(r.title)}</h4>
        <div class="recipe-meta" style="margin-bottom:10px;">
          ${r.readyInMinutes ? `<span>⏱ ${r.readyInMinutes} min</span>` : ""}
          ${ingredientCount ? `<span>${ingredientCount} ingredients</span>` : ""}
        </div>
        <div class="recipe-card-foot" style="border:none; padding-top:0;">
          <span class="small-print">See the recipe →</span>
          <button class="save-toggle" aria-label="Save recipe">${APP.savedIds.has(r.id) ? "♥" : "♡"}</button>
        </div>
      </div>
    </div>`;
}

async function loadRecipeOfTheDay() {
  const slot = document.getElementById("rotd-slot");
  const today = new Date().toISOString().slice(0, 10);
  const cached = Store.getROTD();
  const show = (recipe) => {
    slot.innerHTML = sidebarCardHTML(recipe);
    const card = document.getElementById("rotd-card");
    card.addEventListener("click", (e) => { if (!e.target.closest(".save-toggle")) openDetail(recipe.id, null); });
    card.querySelector(".save-toggle").onclick = () => toggleSaveFromCard(recipe.id, recipe);
  };
  if (cached && cached.date === today) { show(cached.recipe); return; }
  try {
    const data = await PantryAPI.getRandomRecipe("main course");
    const recipe = data.recipes && data.recipes[0];
    if (!recipe) throw new Error("no recipe");
    Store.setROTD({ date: today, recipe });
    show(recipe);
  } catch (err) {
    slot.innerHTML = `<div class="empty"><p>${escapeHtml(friendlyError(err))}</p></div>`;
  }
}

async function surpriseMe() {
  try {
    toast("Shuffling the pantry…");
    const data = await PantryAPI.getRandomRecipe(APP.filters.diet || "");
    const recipe = data.recipes && data.recipes[0];
    if (!recipe) throw new Error("No surprise recipe came back — try again.");
    openDetail(recipe.id, null);
  } catch (err) {
    toast(friendlyError(err));
  }
}

/* ================= RESULTS VIEW ================= */
async function runSearch() {
  APP.filters.diet = document.getElementById("filter-diet")?.value ?? APP.filters.diet;
  APP.filters.cuisine = document.getElementById("filter-cuisine")?.value ?? APP.filters.cuisine;
  APP.filters.maxReadyTime = document.getElementById("filter-time")?.value ?? APP.filters.maxReadyTime;
  if (APP.ingredients.length) {
    DataAPI.addHistory(APP.ingredients.join(", ")).catch(() => {});
  }
  go("/results");
  router();
}

async function renderResults() {
  const app = document.getElementById("app");
  app.innerHTML = h`
    <div class="view">
      <div class="section-head">
        <h2>Recipes for you</h2>
        <button class="link-btn" id="back-home">Edit search</button>
      </div>
      <div id="results-slot">
        <div class="recipe-grid">${[0,1,2,3].map(() => `<div class="skeleton" style="height:230px;"></div>`).join("")}</div>
      </div>
    </div>`;
  document.getElementById("back-home").onclick = () => go("/home");

  try {
    const data = await PantryAPI.searchRecipes({
      ingredients: APP.ingredients.join(","),
      diet: APP.filters.diet,
      cuisine: APP.filters.cuisine,
      maxReadyTime: APP.filters.maxReadyTime,
      number: 12,
    });
    const results = data.results || [];
    results.forEach(r => {
      APP.recipeMeta[r.id] = {
        usedIngredients: (r.usedIngredients || []).map(i => i.name),
        missedIngredients: (r.missedIngredients || []).map(i => i.name),
      };
    });

    const slot = document.getElementById("results-slot");
    if (!results.length) {
      slot.innerHTML = `<div class="empty"><h3>No matches yet</h3><p>Try removing a filter or adding a more common ingredient like rice or eggs.</p></div>`;
      return;
    }
    slot.innerHTML = `<div class="recipe-grid">${results.map(r => recipeCardHTML(r, true)).join("")}</div>`;
    slot.querySelectorAll(".recipe-card").forEach(card => {
      const id = Number(card.dataset.id);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".save-toggle")) return;
        openDetail(id, APP.recipeMeta[id]);
      });
      const saveBtn = card.querySelector(".save-toggle");
      if (saveBtn) saveBtn.onclick = () => toggleSaveFromCard(id, results.find(r => r.id === id));
    });
  } catch (err) {
    document.getElementById("results-slot").innerHTML = h`
      <div class="empty"><h3>Search failed</h3><p>${escapeHtml(friendlyError(err))}</p></div>`;
  }
}

function recipeCardHTML(r, withMeta) {
  const saved = APP.savedIds.has(r.id);
  const used = r.usedIngredientCount ?? (r.usedIngredients ? r.usedIngredients.length : null);
  const missed = r.missedIngredientCount ?? (r.missedIngredients ? r.missedIngredients.length : null);
  return h`
    <div class="recipe-card" data-id="${r.id}">
      <img src="${r.image || ""}" alt="${escapeHtml(r.title)}" loading="lazy" />
      <div class="recipe-card-body">
        <div class="recipe-card-title">${escapeHtml(r.title)}</div>
        <div class="recipe-meta">
          ${r.readyInMinutes ? `<span>⏱ ${r.readyInMinutes} min</span>` : ""}
          ${withMeta && used != null ? `<span class="tag">Have ${used}</span>` : ""}
          ${withMeta && missed ? `<span class="tag">Need ${missed}</span>` : ""}
        </div>
        <div class="recipe-card-foot">
          <span class="small-print">View recipe →</span>
          <button class="save-toggle" aria-label="Save recipe">${saved ? "♥" : "♡"}</button>
        </div>
      </div>
    </div>`;
}

async function refreshSavedCache() {
  try {
    APP.savedList = await DataAPI.getSaved();
    APP.savedIds = new Set(APP.savedList.map(r => r.id));
  } catch { /* leave cache as-is if this fails */ }
}

async function toggleSaveFromCard(id, sourceRecipe) {
  const wasSaved = APP.savedIds.has(id);
  try {
    if (wasSaved) {
      await DataAPI.unsaveRecipe(id);
      APP.savedIds.delete(id);
      toast("Removed from saved recipes");
    } else {
      const meta = APP.recipeMeta[id] || {};
      const record = {
        id,
        title: sourceRecipe.title,
        image: sourceRecipe.image,
        readyInMinutes: sourceRecipe.readyInMinutes || null,
        servings: sourceRecipe.servings || null,
        ingredientCount: (meta.usedIngredients?.length || 0) + (meta.missedIngredients?.length || 0),
      };
      await DataAPI.saveRecipe(record);
      APP.savedIds.add(id);
      toast("Saved to My Saved Recipes");
    }
    router();
  } catch (err) {
    toast(friendlyError(err));
  }
}

/* ================= RECIPE DETAIL ================= */
function openDetail(id, meta) {
  if (meta) APP.recipeMeta[id] = meta;
  go(`/recipe/${id}`);
}

async function renderRecipeDetail(idStr) {
  const id = Number(idStr);
  const app = document.getElementById("app");
  app.innerHTML = h`
    <div class="view">
      <button class="link-btn" id="back-btn" style="margin-bottom:14px;">← Back</button>
      <div class="skeleton" style="height:220px; margin-bottom:16px;"></div>
      <div class="skeleton" style="height:20px; width:60%; margin-bottom:10px;"></div>
      <div class="skeleton" style="height:14px; width:40%;"></div>
    </div>`;
  document.getElementById("back-btn").onclick = () => history.back();

  let info;
  try {
    info = await PantryAPI.getRecipeInfo(id);
  } catch (err) {
    app.innerHTML = h`<div class="view"><div class="empty"><h3>Couldn't load this recipe</h3><p>${escapeHtml(friendlyError(err))}</p></div></div>`;
    return;
  }

  const meta = APP.recipeMeta[id];
  const haveNames = new Set((meta?.usedIngredients || []).map(n => n.toLowerCase()));
  const missNames = new Set((meta?.missedIngredients || []).map(n => n.toLowerCase()));
  const ingredients = info.extendedIngredients || [];

  const steps = (info.analyzedInstructions?.[0]?.steps || []);
  const nutrients = (info.nutrition?.nutrients || []);
  const wanted = ["Calories", "Protein", "Fat", "Carbohydrates"];
  const nutriRows = wanted.map(name => nutrients.find(n => n.name === name)).filter(Boolean);
  const maxVal = Math.max(...nutriRows.map(n => n.amount), 1);

  const saved = APP.savedIds.has(id);

  app.innerHTML = h`
    <div class="view">
      <button class="link-btn" id="back-btn" style="margin-bottom:14px;">← Back</button>
      <img class="hero-image" src="${info.image || ""}" alt="${escapeHtml(info.title)}" />
      <h1>${escapeHtml(info.title)}</h1>
      <div class="detail-meta">
        <div><strong>${info.readyInMinutes ?? "–"}</strong><span>minutes</span></div>
        <div><strong>${info.servings ?? "–"}</strong><span>servings</span></div>
        <div><strong>${ingredients.length}</strong><span>ingredients</span></div>
      </div>

      ${ingredients.length ? h`
      <h3>Ingredients</h3>
      <ul class="ingredient-list">
        ${ingredients.map(ing => {
          const nl = ing.name.toLowerCase();
          const cls = haveNames.has(nl) ? "have" : (missNames.has(nl) ? "missing" : "");
          const icon = cls === "have" ? "✓" : (cls === "missing" ? "＋" : "•");
          return `<li class="${cls}">${icon} ${escapeHtml(ing.original || ing.name)}</li>`;
        }).join("")}
      </ul>` : ""}

      ${nutriRows.length ? h`
      <h3>Nutrition (per serving)</h3>
      <div class="nutri-bars">
        ${nutriRows.map(n => h`
          <div class="nutri-row">
            <span class="label">${n.name}</span>
            <div class="nutri-track"><div class="nutri-fill" style="width:${Math.round((n.amount / maxVal) * 100)}%"></div></div>
            <span class="value">${Math.round(n.amount)}${n.unit}</span>
          </div>`).join("")}
      </div>` : ""}

      ${steps.length ? h`
      <h3>Instructions</h3>
      <ol class="steps">${steps.map(s => `<li>${escapeHtml(s.step)}</li>`).join("")}</ol>
      ` : h`<h3>Instructions</h3><p>${escapeHtml(stripHtml(info.summary)).slice(0, 400)}…</p>`}

      <div class="detail-actions">
        <button class="btn btn-primary" id="save-btn">${saved ? "♥ Saved" : "♡ Save recipe"}</button>
        <button class="btn btn-secondary" id="share-btn">Share</button>
        ${info.sourceUrl ? `<a class="btn btn-secondary" href="${info.sourceUrl}" target="_blank" rel="noopener">Original source</a>` : ""}
      </div>
    </div>`;

  document.getElementById("back-btn").onclick = () => history.back();
  document.getElementById("save-btn").onclick = async () => {
    await toggleSaveFromDetail(info, ingredients.length);
    renderRecipeDetail(idStr);
  };
  document.getElementById("share-btn").onclick = async () => {
    const shareData = { title: info.title, text: `Check out this recipe: ${info.title}`, url: info.sourceUrl || location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(shareData.url);
      toast("Link copied to clipboard");
    }
  };
}

async function toggleSaveFromDetail(info, ingredientCount) {
  try {
    if (APP.savedIds.has(info.id)) {
      await DataAPI.unsaveRecipe(info.id);
      APP.savedIds.delete(info.id);
      toast("Removed from saved recipes");
    } else {
      await DataAPI.saveRecipe({
        id: info.id,
        title: info.title,
        image: info.image,
        readyInMinutes: info.readyInMinutes || null,
        servings: info.servings || null,
        ingredientCount,
      });
      APP.savedIds.add(info.id);
      toast("Saved to My Saved Recipes");
    }
  } catch (err) {
    toast(friendlyError(err));
  }
}

function savedCardHTML(r) {
  const ingredientsOnHand = r.ingredientCount ? Math.max(0, r.ingredientCount) : 0;
  return h`
    <div class="recipe-card" data-id="${r.id}">
      <img src="${r.image || ""}" alt="${escapeHtml(r.title)}" loading="lazy" />
      <div class="recipe-card-body">
        <div class="recipe-card-title">${escapeHtml(r.title)}</div>
        <div class="recipe-meta">
          ${r.readyInMinutes ? `<span>🕐 ${r.readyInMinutes} min</span>` : ""}
          ${r.servings ? `<span>🍽 ${r.servings} servings</span>` : ""}
        </div>
        <div class="recipe-meta" style="font-size:.78rem;">
          <span>${ingredientsOnHand} ingredients on hand</span>
          <span style="margin-left:auto; color:var(--sage-ink); font-weight:600;">Ready to cook</span>
        </div>
        <div class="recipe-card-foot">
          <span class="small-print">View recipe →</span>
          <button class="link-btn remove-btn" style="color:var(--terracotta);">🗑 Remove</button>
        </div>
      </div>
    </div>`;
}

/* ================= SAVED VIEW ================= */
async function renderSaved() {
  const app = document.getElementById("app");
  app.innerHTML = h`
    <div class="view">
      <p class="eyebrow">Keep a little inspiration close</p>
      <h1>For another good day.</h1>
      <p style="margin-bottom:24px;">Recipes you've tucked away for when the moment feels right.</p>
      <div class="recipe-grid" id="saved-slot">${[0,1].map(() => `<div class="skeleton" style="height:230px;"></div>`).join("")}</div>
    </div>`;

  try {
    APP.savedList = await DataAPI.getSaved();
    APP.savedIds = new Set(APP.savedList.map(r => r.id));
  } catch (err) {
    document.getElementById("app").innerHTML = h`<div class="view"><div class="empty"><h3>Couldn't load your saved recipes</h3><p>${escapeHtml(friendlyError(err))}</p></div></div>`;
    return;
  }

  const slot = document.getElementById("saved-slot");
  if (!APP.savedList.length) {
    slot.outerHTML = `<div class="empty" id="saved-slot"><h3>Nothing saved yet</h3><p>Recipes you save will show up here, ready whenever you need them.</p></div>`;
    return;
  }
  slot.innerHTML = APP.savedList.map(r => savedCardHTML(r)).join("");
  slot.querySelectorAll(".recipe-card").forEach(card => {
    const id = Number(card.dataset.id);
    card.addEventListener("click", (e) => {
      if (e.target.closest(".remove-btn")) return;
      openDetail(id, null);
    });
    const removeBtn = card.querySelector(".remove-btn");
    if (removeBtn) removeBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await DataAPI.unsaveRecipe(id);
        toast("Removed from saved recipes");
        renderSaved();
      } catch (err) { toast(friendlyError(err)); }
    };
  });
}

/* ================= IMPACT VIEW ================= */
async function renderImpact() {
  const app = document.getElementById("app");
  app.innerHTML = h`
    <div class="view">
      <div class="section-head"><h2>Your impact</h2></div>
      <div class="skeleton" style="height:220px;"></div>
    </div>`;

  let stats;
  try {
    stats = await DataAPI.getImpact();
  } catch (err) {
    app.innerHTML = h`<div class="view"><div class="empty"><h3>Couldn't load your impact</h3><p>${escapeHtml(friendlyError(err))}</p></div></div>`;
    return;
  }

  const { recipesSaved, ingredientsUsed, kgEstimate, totalGiven, donationCount } = stats;
  const goalKg = 10;
  const pct = Math.max(2, Math.min(100, Math.round((kgEstimate / goalKg) * 100)));
  const radius = 46, circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const demoPts = donationCount * 10 + recipesSaved * 5;

  app.innerHTML = h`
    <div class="view">
      <p class="eyebrow">A small start, counted honestly</p>
      <h1 style="font-size:clamp(1.9rem,4.5vw,2.6rem); max-width:13ch;">Good food.<br/>Less forgotten.</h1>

      <div class="impact-note" style="margin-top:20px;">
        <strong>Prototype estimates, not measured outcomes.</strong> All food figures below are illustrative estimates from PantryPal activity — not verified waste prevention or environmental impact. Fogmen totals are demo-only.
      </div>

      <div class="impact-hero">
        <div class="impact-hero-copy">
          <p class="eyebrow">The shared kitchen goal</p>
          <h2>A little more gets used.</h2>
          <p>Every recipe saved is a nudge toward a meal made with what's already at home. These early prototype estimates help us explore the idea; they are not a measurement of food saved.</p>
          <button class="btn btn-accent" id="go-support">Explore Fogmen →</button>
        </div>
        <div class="ring-wrap">
          <svg class="ring-svg" width="116" height="116" viewBox="0 0 116 116">
            <circle class="ring-track" cx="58" cy="58" r="${radius}" />
            <circle class="ring-fill" cx="58" cy="58" r="${radius}"
              stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"
              transform="rotate(-90 58 58)" id="ring-fill-circle" />
            <text x="58" y="64" text-anchor="middle" font-family="Fraunces, serif" font-size="22" fill="#F8F5E8" id="ring-pct-text">0%</text>
          </svg>
          <span class="ring-label">Of prototype goal</span>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><strong id="stat-recipes">0</strong><span>recipes saved</span></div>
        <div class="stat"><strong id="stat-ingredients">0</strong><span>ingredients put to use · estimate</span></div>
        <div class="stat"><strong id="stat-kg">0 kg</strong><span>estimated food utilised · prototype</span></div>
      </div>

      <div class="fogmen-card">
        <div class="fg-left">
          <p class="eyebrow" style="margin-bottom:6px;">A prototype partnership</p>
          <strong>Fogmen</strong>
          <p>A fictional partner for imagining community food support.</p>
        </div>
        <div class="fg-right">
          <p class="eyebrow" style="margin-bottom:6px;">Demo contributions</p>
          <strong id="stat-points">0 pts</strong>
          <span id="stat-donation-count">0 simulated contributions</span>
        </div>
      </div>
      <div style="text-align:right; margin-top:14px;">
        <button class="btn btn-secondary" id="how-it-works-btn">See how it works</button>
      </div>
    </div>`;

  document.getElementById("go-support").onclick = () => go("/support");
  document.getElementById("how-it-works-btn").onclick = () => go("/support");

  animateNumber(document.getElementById("stat-recipes"), recipesSaved);
  animateNumber(document.getElementById("stat-ingredients"), ingredientsUsed);
  animateNumber(document.getElementById("stat-kg"), kgEstimate, { decimals: 1, suffix: " kg" });
  animateNumber(document.getElementById("stat-points"), demoPts, { suffix: " pts" });
  document.getElementById("stat-donation-count").textContent =
    `${donationCount} simulated contribution${donationCount === 1 ? "" : "s"} · ₦${totalGiven.toLocaleString()}`;

  requestAnimationFrame(() => {
    const circle = document.getElementById("ring-fill-circle");
    if (circle) circle.style.strokeDashoffset = String(offset);
    const txt = document.getElementById("ring-pct-text");
    if (txt) animateNumber(txt, pct, { suffix: "%" });
  });
}

/* ================= SUPPORT / DONATION VIEW ================= */
let chosenAmount = 1000;
async function renderSupport(justDonated) {
  const app = document.getElementById("app");
  const presets = [500, 1000, 2500, 5000];

  if (justDonated) {
    app.innerHTML = h`
      <div class="view thankyou">
        <span class="big-emoji">🌾</span>
        <p class="eyebrow">Recorded, with thanks</p>
        <h1>A little more, given.</h1>
        <p>Your ₦${justDonated.toLocaleString()} demo contribution has been recorded toward your Fogmen impact.</p>
        <button class="btn btn-secondary" id="impact-link">See your impact</button>
      </div>`;
    document.getElementById("impact-link").onclick = () => go("/impact");
    return;
  }

  app.innerHTML = h`
    <div class="view">
      <p class="eyebrow">Backing the shared kitchen goal</p>
      <h1>Support Fogmen.</h1>
      <p style="max-width:44ch;">Help fund hunger-relief initiatives that put surplus food to good use across communities.</p>
      <div class="panel-sage" style="margin-top:18px;">
        <label style="margin-bottom:10px;">Choose an amount</label>
        <div class="amount-grid">
          ${presets.map(a => `<button class="amount-pill ${a === chosenAmount ? "active" : ""}" data-amount="${a}">₦${a.toLocaleString()}</button>`).join("")}
        </div>
        <label for="custom-amount">Custom amount (₦)</label>
        <input id="custom-amount" type="number" min="100" placeholder="e.g. 1500" style="background:var(--panel);" />
        <button class="btn btn-accent btn-block" id="donate-btn">Donate →</button>
      </div>
      <p class="small-print" style="margin-top:16px;">This is a demo checkout for the final-year project — no real payment is processed. Connect a provider like Paystack or Flutterwave to go live.</p>
    </div>`;

  app.querySelectorAll(".amount-pill").forEach(btn => {
    btn.onclick = () => {
      chosenAmount = Number(btn.dataset.amount);
      document.getElementById("custom-amount").value = "";
      renderSupport();
    };
  });
  document.getElementById("custom-amount").oninput = (e) => {
    if (e.target.value) {
      chosenAmount = Number(e.target.value);
      app.querySelectorAll(".amount-pill").forEach(b => b.classList.remove("active"));
    }
  };
  document.getElementById("donate-btn").onclick = async () => {
    const amount = Number(document.getElementById("custom-amount").value) || chosenAmount;
    if (!amount || amount < 100) { toast("Enter an amount of at least ₦100"); return; }
    const btn = document.getElementById("donate-btn");
    btn.disabled = true;
    try {
      await DataAPI.addDonation(amount);
      renderSupport(amount);
    } catch (err) {
      toast(friendlyError(err));
      btn.disabled = false;
    }
  };
}

/* ================= Theme + boot ================= */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("theme-toggle").textContent = theme === "dark" ? "☀" : "◐";
}

async function boot() {
  applyTheme(Store.getTheme());
  document.getElementById("theme-toggle").onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    Store.setTheme(next);
    applyTheme(next);
  };

  APP.user = AuthAPI.currentUser();
  renderAuthSlot();
  if (APP.user) await refreshSavedCache();

  window.addEventListener("hashchange", router);
  router();
}

document.addEventListener("DOMContentLoaded", boot);
