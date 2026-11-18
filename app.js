(function () {
  const TOKEN_KEY = "desk_app_token";
  const DATA_KEY = "desk_data_path";

  function captureFromHash() {
    const hash = window.location.hash || "";
    const params = hash.replace(/^#/, "").split("&").filter(Boolean);
    const keep = [];
    for (const p of params) {
      if (p.startsWith("t=")) {
        try { localStorage.setItem(TOKEN_KEY, decodeURIComponent(p.slice(2))); } catch (e) {}
      } else if (p.startsWith("d=")) {
        try { localStorage.setItem(DATA_KEY, decodeURIComponent(p.slice(2))); } catch (e) {}
      } else {
        keep.push(p);
      }
    }
    const next = window.location.pathname + window.location.search + (keep.length ? "#" + keep.join("&") : "");
    history.replaceState(null, "", next);
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }

  function dataPath() {
    try { return localStorage.getItem(DATA_KEY) || ""; } catch (e) { return ""; }
  }

  function pageBase() {
    return new URL(".", window.location.href);
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
    const running = (s.agents || []).filter((a) => a.status === "running").length;
    document.getElementById("agents-running").textContent = running + " running";
    const car = document.getElementById("agent-carousel");
    car.innerHTML = (s.agents || []).map((a) => (
      '<article class="agent-card">' +
        '<h3><span class="dot"></span>' + a.name + '</h3>' +
        '<div class="sub">' + (a.subtitle || "") + '</div>' +
      '</article>'
    )).join("");
    const full = document.getElementById("agents-full");
    full.innerHTML = (s.agents || []).map((a) => (
      '<div class="card"><div class="row"><span>' + a.name +
      '</span><strong>' + (a.status || "") + '</strong></div></div>'
    )).join("");
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
      '</span><strong>' + (r.value || r.subtitle || "") + '</strong></div></div>'
    )).join("");
    home.className = "activity";
    home.innerHTML = html;
    full.className = "activity";
    full.innerHTML = html;
  }

  async function api(path) {
    const r = await fetch(path, { headers: headers(), cache: "no-store" });
    if (r.status === 401) throw new Error("unauthorized");
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
  }

  async function loadJson(url) {
    const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
  }

  async function refresh() {
    try {
      const d = dataPath();
      if (d) {
        const [s, c, a] = await Promise.all([
          loadJson(dataUrl("state.json")),
          loadJson(dataUrl("chart.json")),
          loadJson(dataUrl("activity.json")).catch(() => ({ rows: [] })),
        ]);
        renderState(s);
        renderChart(c);
        renderActivity((a && a.rows) || []);
        showError("");
        return;
      }
      if (!token()) {
        showError("Desk offline · open the URL with the login fragment from Telegram");
        return;
      }
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
      const when = lastState && lastState.updatedAt ? lastState.updatedAt : "never";
      showError("Desk offline · retrying in 5s · last update " + when);
    }
  }

  async function loadAccount() {
    try {
      const d = dataPath();
      let a;
      if (d) {
        a = await loadJson(dataUrl("account.json"));
      } else {
        a = await api("/api/account");
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
  window.addEventListener("resize", () => { if (lastChart) renderChart(lastChart); });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js", pageBase()).href).catch(() => {});
  }
  refresh();
  setInterval(refresh, 5000);
})();
