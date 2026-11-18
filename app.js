(function () {
  const TOKEN_KEY = "desk_app_token";
  const DATA_KEY = "desk_data_path";
  const STALE_AFTER_MS = 15 * 60 * 1000;
  const AGENTS_FRESH_MS = 6 * 60 * 1000;

  function extractDataPath(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const fromPair = s.match(/(?:^|[?#&])d=([^&#\s]+)/);
    if (fromPair && fromPair[1]) {
      try { return decodeURIComponent(fromPair[1]); } catch (e) { return fromPair[1]; }
    }
    // A pasted bare token is accepted, but never a short string.
    if (/^[A-Za-z0-9_-]{32,}$/.test(s)) return s;
    return "";
  }

  function captureFromHash() {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const params = (hash.replace(/^#/, "") + "&" + search.replace(/^\?/, "")).split("&").filter(Boolean);
    const keepHash = [];
    for (const p of params) {
      if (p.startsWith("t=")) {
        try { localStorage.setItem(TOKEN_KEY, decodeURIComponent(p.slice(2))); } catch (e) {}
      } else if (p.startsWith("d=")) {
        try { localStorage.setItem(DATA_KEY, decodeURIComponent(p.slice(2))); } catch (e) {}
      } else if (p) {
        if (hash.indexOf(p) !== -1) keepHash.push(p);
      }
    }
    const next = window.location.pathname + window.location.search + (keepHash.length ? "#" + keepHash.join("&") : "");
    history.replaceState(null, "", next);
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }

  function dataPath() {
    try { return localStorage.getItem(DATA_KEY) || ""; } catch (e) { return ""; }
  }

  function saveDataPath(value) {
    const d = extractDataPath(value) || (value && /^[A-Za-z0-9_-]{32,}$/.test(value) ? value : "");
    if (!d) return false;
    try { localStorage.setItem(DATA_KEY, d); } catch (e) { return false; }
    return true;
  }

  function pageBase() {
    // Avoid new URL(".", href) dropping /trencher-desk when the path has no trailing slash.
    const loc = window.location;
    let path = loc.pathname || "/";
    if (!path.endsWith("/")) {
      const last = path.split("/").pop() || "";
      if (last.includes(".")) path = path.slice(0, path.lastIndexOf("/") + 1);
      else path += "/";
    }
    return new URL(path, loc.origin);
  }

  function dataUrl(file) {
    const d = dataPath();
    return new URL("d/" + d + "/" + file, pageBase()).href;
  }

  function headers() {
    const t = token();
    const h = { "Accept": "application/json" };
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  function money(n) {
    const v = Number(n);
    if (Number.isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setTab(name) {
    document.querySelectorAll(".tab-panel").forEach((el) => {
      el.classList.toggle("hidden", el.id !== "tab-" + name);
    });
    document.querySelectorAll(".tabbar button").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === name);
    });
  }

  function showError(msg) {
    const el = document.getElementById("error");
    if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function showLogin(needed) {
    const panel = document.getElementById("login-panel");
    if (!panel) return;
    panel.classList.toggle("hidden", !needed);
  }

  function formatWhen(iso) {
    if (!iso) return "unknown time";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    const dt = new Date(t);
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam", hour12: false
    }).format(dt);
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return time + " CET (just now)";
    if (mins === 1) return time + " CET (1 min ago)";
    return time + " CET (" + mins + " min ago)";
  }

  function isStale(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return false;
    return (Date.now() - t) > STALE_AFTER_MS;
  }

  let range = "LIVE";
  let lastState = null;
  let lastChart = null;

  function renderState(s) {
    lastState = s;
    document.getElementById("balance").textContent = money(s.balance);
    const today = Number(s.todayPct) || 0;
    const todayEl = document.getElementById("today");
    todayEl.textContent = (today >= 0 ? "+" : "") + today.toFixed(2) + "%";
    todayEl.style.color = today < 0 ? "#ff453a" : "rgba(235,235,245,0.6)";
    document.getElementById("multiplier").textContent = (Number(s.multiplier) || 0).toFixed(2) + "×";
    const badge = document.getElementById("paper-badge");
    badge.classList.toggle("hidden", s.mode !== "PAPER");
    const snapshotFresh = !!(s.updatedAt) && (Date.now() - Date.parse(s.updatedAt) <= AGENTS_FRESH_MS);
    const agents = (s.agents || []).map((a) => {
      const running = snapshotFresh && a.status === "running";
      return Object.assign({}, a, { status: running ? "running" : "idle" });
    });
    const running = agents.filter((a) => a.status === "running").length;
    document.getElementById("agents-running").textContent = running + " running";
    const car = document.getElementById("agent-carousel");
    car.innerHTML = agents.map((a) => (
      '<article class="agent-card">' +
        '<h3><span class="dot"></span>' + a.name + '</h3>' +
        '<div class="sub">' + (a.subtitle || "") + '</div>' +
      '</article>'
    )).join("");
    const full = document.getElementById("agents-full");
    if (!agents.length) {
      full.innerHTML = '<div class="activity empty">No agent cards yet</div>';
    } else {
      full.innerHTML = agents.map((a) => (
        '<article class="card agent-full">' +
          '<div class="row"><span><span class="dot"></span> ' + a.name +
          '</span><strong>' + (a.status || "") + '</strong></div>' +
          '<div class="sub">' + (a.subtitle || "") + '</div>' +
        '</article>'
      )).join("");
    }
    document.getElementById("acct-mode").textContent = s.mode;
    document.getElementById("acct-stack").textContent = money(s.balance);
  }

  function filterPoints(pts, rangeName) {
    const list = pts || [];
    if (!rangeName || rangeName === "LIVE" || rangeName === "ALL") return list;
    const ms = { "1H": 3600e3, "4H": 4 * 3600e3, "1D": 24 * 3600e3, "1W": 7 * 24 * 3600e3 }[rangeName];
    if (!ms) return list;
    const cutoff = Date.now() - ms;
    return list.filter((p) => {
      const t = Date.parse(p.t || p.ts || "");
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  function renderChart(c) {
    lastChart = c;
    const pts = filterPoints((c && c.points) || [], range);
    const empty = document.getElementById("chart-empty");
    if (pts.length === 0) empty.classList.remove("hidden");
    else empty.classList.add("hidden");
    window.drawHomeChart(document.getElementById("home-chart"), pts, c && c.startValue);
  }

  function renderActivity(rows) {
    const home = document.getElementById("activity-home");
    const full = document.getElementById("activity-full");
    const list = rows || [];
    if (!list.length) {
      home.className = "activity empty";
      home.textContent = "Nothing yet tonight";
      full.className = "activity empty";
      full.textContent = "Nothing yet tonight";
      return;
    }
    const html = list.map((r) => (
      '<div class="card"><div class="row"><span>' +
      (r.title || r.kind || "event") +
      '<div class="sub">' + (r.subtitle || "") + '</div>' +
      '</span><strong>' + (r.value || "") + '</strong></div></div>'
    )).join("");
    home.className = "activity";
    home.innerHTML = html;
    full.className = "activity";
    full.innerHTML = html;
  }


  function renderAccount(acct) {
    const mode = document.getElementById("acct-mode");
    const stack = document.getElementById("acct-stack");
    const profile = document.getElementById("acct-profile");
    const invite = document.getElementById("acct-invite");
    const tg = document.getElementById("acct-tg");
    if (!acct) {
      if (tg) tg.textContent = "unavailable";
      const err = document.getElementById("acct-error");
      if (err) { err.textContent = "Account data missing"; err.classList.remove("hidden"); }
      return;
    }
    const err = document.getElementById("acct-error");
    if (err) { err.textContent = ""; err.classList.add("hidden"); }
    if (mode) mode.textContent = acct.mode || (lastState && lastState.mode) || "PAPER";
    if (stack) stack.textContent = money(acct.stack);
    if (profile) {
      profile.href = acct.profile_url || "#";
      profile.setAttribute("rel", "noopener");
    }
    if (invite) {
      invite.href = acct.signup_url || "#";
      invite.setAttribute("rel", "noopener");
      invite.onclick = function (ev) {
        const url = acct.signup_url;
        if (navigator.share && url) {
          ev.preventDefault();
          navigator.share({ title: "FOMO", url: url }).catch(() => {
            try { navigator.clipboard.writeText(url); } catch (e) {}
          });
        }
      };
    }
    if (tg) tg.textContent = acct.telegram ? "connected" : "not connected";
  }

  async function api(path) {
    const r = await fetch(path, { headers: headers(), cache: "no-store" });
    if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
    if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status });
    return r.json();
  }

  async function loadJson(url) {
    const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
    if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status });
    return r.json();
  }

  async function refresh() {
    try {
      const d = dataPath();
      if (!d && !token()) {
        showLogin(true);
        showError("No login saved. Paste the login link from Telegram.");
        return;
      }
      if (d) {
        showLogin(false);
        let s, c, a;
        try {
          [s, c, a] = await Promise.all([
            loadJson(dataUrl("state.json")),
            loadJson(dataUrl("chart.json")),
            loadJson(dataUrl("activity.json")).catch(() => ({ rows: [] })),
          ]);
        } catch (err) {
          if (err && err.status === 404) {
            showLogin(true);
            showError("Data not found (404). Paste the login link from Telegram again.");
            return;
          }
          throw err;
        }
        renderState(s);
        renderChart(c);
        renderActivity((a && a.rows) || []);
        loadJson(dataUrl("account.json")).then(renderAccount).catch(() => renderAccount(null));
        if (isStale(s && s.updatedAt)) {
          const t0 = Date.parse(s.updatedAt);
          const hhmm = Number.isFinite(t0)
            ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam", hour12: false }).format(new Date(t0))
            : "unknown";
          showError("Desk paused since " + hhmm + ", resumes automatically");
        } else {
          showError("");
        }
        return;
      }
      showLogin(false);
      const [s, c, a] = await Promise.all([
        api("/api/state"),
        api("/api/chart?range=" + encodeURIComponent(range)),
        api("/api/activity").catch(() => ({ rows: [] })),
      ]);
      renderState(s);
      renderChart(c);
      renderActivity((a && a.rows) || []);
      showError("");
    } catch (e) {
      const when = lastState && lastState.updatedAt ? lastState.updatedAt : null;
      if (when) showError("Desk offline · retrying in 5s · last update " + formatWhen(when));
      else showError("Desk offline · retrying in 5s · last update unknown");
    }
  }

  async function loadAccount() {
    try {
      const d = dataPath();
      let a;
      if (d) {
        a = await loadJson(dataUrl("account.json"));
      } else if (token()) {
        a = await api("/api/account");
      } else {
        return;
      }
      const prof = document.getElementById("acct-profile");
      const inv = document.getElementById("acct-invite");
      if (a.profile_url) prof.href = a.profile_url;
      if (a.signup_url) inv.href = a.signup_url;
      document.getElementById("acct-tg").textContent = a.telegram ? "connected" : "not";
      document.getElementById("acct-mode").textContent = a.mode;
      document.getElementById("acct-stack").textContent = money(a.stack);
    } catch (e) {}
  }

  function onSaveLogin() {
    const input = document.getElementById("login-link");
    const raw = input ? input.value : "";
    if (!saveDataPath(raw)) {
      showError("That did not look like a login link. Paste the full Telegram link.");
      showLogin(true);
      return;
    }
    if (input) input.value = "";
    showLogin(false);
    showError("");
    refresh();
    loadAccount();
  }

  captureFromHash();
  document.querySelectorAll(".tabbar button").forEach((b) => {
    b.addEventListener("click", () => {
      setTab(b.dataset.tab);
      if (b.dataset.tab === "account") loadAccount();
    });
  });
  document.getElementById("btn-account").addEventListener("click", () => {
    setTab("account");
    loadAccount();
  });
  document.getElementById("ranges").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-range]");
    if (!b) return;
    range = b.dataset.range;
    document.querySelectorAll("#ranges button").forEach((x) => x.classList.toggle("on", x === b));
    refresh();
  });
  const saveBtn = document.getElementById("login-save");
  const loginInput = document.getElementById("login-link");
  if (saveBtn) saveBtn.addEventListener("click", onSaveLogin);
  if (loginInput) {
    loginInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onSaveLogin();
      }
    });
  }
  window.addEventListener("resize", () => { if (lastChart) renderChart(lastChart); });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js?v=5", pageBase()).href).catch(() => {});
  }
  refresh();
  setInterval(refresh, 5000);
})();
