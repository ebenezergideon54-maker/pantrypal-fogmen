/* Thin wrappers around the Netlify Functions: Spoonacular proxy + the
   MySQL-backed auth/data API. */

const TOKEN_KEY = "pantrypal_token";

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function apiRequest(path, { method = "GET", params, body, auth = false } = {}) {
  const qs = params
    ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString()
    : "";
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api/${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

const PantryAPI = {
  searchRecipes({ ingredients, diet, cuisine, maxReadyTime, number } = {}) {
    return apiRequest("search-recipes", { params: { ingredients, diet, cuisine, maxReadyTime, number } });
  },
  getRecipeInfo(id) {
    return apiRequest("recipe-info", { params: { id } });
  },
  getRandomRecipe(tags) {
    return apiRequest("random-recipe", { params: { tags } });
  },
};

const AuthAPI = {
  async signup(name, email, password) {
    const data = await apiRequest("auth-signup", { method: "POST", body: { name, email, password } });
    setToken(data.token);
    return data.user;
  },
  async login(email, password) {
    const data = await apiRequest("auth-login", { method: "POST", body: { email, password } });
    setToken(data.token);
    return data.user;
  },
  logout() { clearToken(); },
  isAuthed() { return !!getToken(); },
  /** Reads the current user straight out of the locally-held JWT payload,
   *  so a page refresh doesn't need a round trip just to show a name.
   *  Every actual data request is still re-verified server-side. */
  currentUser() {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp && Date.now() / 1000 > payload.exp) { clearToken(); return null; }
      return { id: payload.sub, name: payload.name, email: payload.email };
    } catch { return null; }
  },
};

const DataAPI = {
  getSaved() { return apiRequest("saved-recipes", { auth: true }); },
  saveRecipe(recipe) { return apiRequest("saved-recipes", { method: "POST", auth: true, body: recipe }); },
  unsaveRecipe(id) { return apiRequest("saved-recipes", { method: "DELETE", auth: true, params: { id } }); },

  getHistory() { return apiRequest("search-history", { auth: true }); },
  addHistory(ingredients) { return apiRequest("search-history", { method: "POST", auth: true, body: { ingredients } }); },
  clearHistory() { return apiRequest("search-history", { method: "DELETE", auth: true }); },

  getDonations() { return apiRequest("donations", { auth: true }); },
  addDonation(amount) { return apiRequest("donations", { method: "POST", auth: true, body: { amount } }); },

  getImpact() { return apiRequest("impact", { auth: true }); },
};
