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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function px(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "—";
    if (v >= 1) return "$" + v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return "$" + Number(v).toPrecision(4);
  }

  function pnlText(usd, pct) {
    if (usd == null || Number.isNaN(Number(usd))) return "—";
    const u = Number(usd);
    const sign = u > 0 ? "+" : (u < 0 ? "−" : "");
    let out = sign + "$" + money(Math.abs(u)).slice(1);
    if (pct != null && !Number.isNaN(Number(pct))) {
      const p = Number(pct);
      const ps = (p > 0 ? "+" : (p < 0 ? "−" : "")) + Math.abs(p).toFixed(2) + "%";
      out += " · " + ps;
    }
    return out;
  }

  function pnlClass(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return "";
    return n > 0 ? "up" : "down";
  }

  function setLiveDot(state) {
    const el = document.getElementById("live-dot");
    if (!el) return;
    el.classList.remove("on", "off", "stale");
    el.classList.add(state || "off");
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
  let lastPositions = null;
  let lastLivePrices = {};
  let lastLiveAt = 0;
  let liveChartExtra = [];
  let openCoinMint = null;
  const DEX_TOKENS = "https://api.dexscreener.com/tokens/v1/solana/";


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
    const pts0 = (c && c.points) || [];
    let lastT = 0;
    if (pts0.length) {
      const parsed = Date.parse(pts0[pts0.length - 1].t || pts0[pts0.length - 1].ts || "");
      if (Number.isFinite(parsed)) lastT = parsed;
    }
    liveChartExtra = liveChartExtra.filter((p) => Date.parse(p.t) > lastT);
    const pts = filterPoints(pts0.concat(range === "LIVE" ? liveChartExtra : []), range);
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
    const html = list.map((r) => {
      const kind = String(r.kind || "event").toLowerCase();
      const val = r.value || "";
      const trimmed = String(val).trim();
      const down = /^-|−/.test(trimmed);
      const up = /^\+/.test(trimmed);
      const amtClass = down ? "down" : (up ? "up" : "");
      return '<div class="card"><div class="row"><span>' +
        '<span class="kind ' + esc(kind) + '">' + esc(kind) + '</span>' +
        esc(r.title || kind) +
        '<div class="sub">' + esc(r.subtitle || "") + '</div>' +
        '</span><strong class="amt ' + amtClass + '">' + esc(val) + '</strong></div></div>';
    }).join("");
    home.className = "activity";
    home.innerHTML = html;
    full.className = "activity";
    full.innerHTML = html;
  }

  function recomputeMtm(pos, prices) {
    const settled = Number(pos && pos.settled != null ? pos.settled : (lastState && lastState.settled));
    let unreal = 0;
    const open = ((pos && pos.open) || []).map((row) => {
      const live = prices && prices[row.mint] != null ? prices[row.mint] : row.price;
      const next = Object.assign({}, row);
      if (live != null) next.price = live;
      if (next.price && next.entry) {
        next.pnl = Number(next.size) * (Number(next.price) / Number(next.entry) - 1);
        next.pnl_pct = (Number(next.price) / Number(next.entry) - 1) * 100;
        unreal += next.pnl;
      }
      return next;
    });
    const base = Number.isFinite(settled) ? settled : 0;
    return {
      settled: base,
      mtm: Number((base + unreal).toFixed(4)),
      open: open,
      closed: (pos && pos.closed) || [],
    };
  }

  function applyEquity(mtm, start) {
    const el = document.getElementById("balance");
    if (el) el.textContent = money(mtm);
    const startV = start != null ? Number(start) : (lastChart && lastChart.startValue);
    const todayEl = document.getElementById("today");
    if (todayEl && startV) {
      const today = (mtm - startV) / startV * 100;
      todayEl.textContent = (today >= 0 ? "+" : "") + today.toFixed(2) + "%";
      todayEl.style.color = today < 0 ? "#ff453a" : "rgba(235,235,245,0.6)";
      const mul = document.getElementById("multiplier");
      if (mul) mul.textContent = (mtm / startV).toFixed(2) + "×";
    }
    const stack = document.getElementById("acct-stack");
    if (stack) stack.textContent = money(mtm);
    if (lastState) lastState.balance = mtm;
  }

  function appendLiveChart(mtm) {
    if (range !== "LIVE") return;
    const start = lastChart && lastChart.startValue;
    const base = (lastChart && lastChart.points) ? lastChart.points.slice() : [];
    liveChartExtra.push({ t: new Date().toISOString(), v: mtm });
    if (liveChartExtra.length > 360) liveChartExtra = liveChartExtra.slice(-360);
    const pts = filterPoints(base.concat(liveChartExtra), "LIVE");
    window.drawHomeChart(document.getElementById("home-chart"), pts, start);
    const empty = document.getElementById("chart-empty");
    if (empty) empty.classList.toggle("hidden", pts.length > 0);
  }

  function renderPositions(data) {
    lastPositions = data || lastPositions;
    const openEl = document.getElementById("open-positions");
    const closedEl = document.getElementById("closed-positions");
    if (!openEl || !closedEl) return;
    const open = (data && data.open) || [];
    const closed = (data && data.closed) || [];
    if (!open.length) {
      openEl.className = "pos-list empty";
      openEl.textContent = "No open positions";
    } else {
      openEl.className = "pos-list";
      openEl.innerHTML = open.map((r) => {
        const k = pnlClass(r.pnl);
        const stopPct = r.stop_pct != null ? " (−" + Number(r.stop_pct).toFixed(0) + "%)" : "";
        return '<button type="button" class="pos-card" data-mint="' + esc(r.mint) + '">' +
          '<div class="pos-top"><div><span class="pos-name">' + esc(r.name) + '</span><span class="pos-sym">' + esc(r.symbol) + '</span></div>' +
          '<div class="pos-pnl ' + k + '">' + esc(pnlText(r.pnl, r.pnl_pct)) + '</div></div>' +
          '<div class="pos-grid">' +
          '<div>Size <b>' + esc(money(r.size)) + '</b></div>' +
          '<div>Entry <b>' + esc(px(r.entry)) + '</b></div>' +
          '<div>Live <b>' + esc(px(r.price)) + '</b></div>' +
          '<div>Stop <b>' + esc(px(r.stop)) + esc(stopPct) + '</b></div>' +
          '</div></button>';
      }).join("");
    }
    if (!closed.length) {
      closedEl.className = "pos-list empty";
      closedEl.textContent = "No closed trades today";
    } else {
      closedEl.className = "pos-list";
      const rows = closed.slice().reverse();
      closedEl.innerHTML = rows.map((r) => {
        const k = pnlClass(r.pnl);
        return '<button type="button" class="pos-card" data-mint="' + esc(r.mint) + '">' +
          '<div class="pos-top"><div><span class="pos-name">' + esc(r.name) + '</span><span class="pos-sym">' + esc(r.symbol) + '</span></div>' +
          '<div class="pos-pnl ' + k + '">' + esc(pnlText(r.pnl, r.pnl_pct)) + '</div></div>' +
          '<div class="pos-grid">' +
          '<div>Size <b>' + esc(money(r.size)) + '</b></div>' +
          '<div>Entry <b>' + esc(px(r.entry)) + '</b></div>' +
          '<div>Exit <b>' + esc(px(r.exit)) + '</b></div>' +
          '<div>PnL <b class="' + k + '">' + esc(pnlText(r.pnl, r.pnl_pct)) + '</b></div>' +
          '</div>' +
          '<div class="pos-reason">' + esc(r.reason || "closed") + '</div></button>';
      }).join("");
    }
    if (openCoinMint) renderCoin(openCoinMint);
  }

  function renderCoin(mint) {
    openCoinMint = mint;
    const empty = document.getElementById("coin-empty");
    const heading = document.getElementById("coin-heading");
    const detail = document.getElementById("coin-detail");
    const all = [].concat((lastPositions && lastPositions.open) || []).concat((lastPositions && lastPositions.closed) || []);
    const row = all.find((r) => r.mint === mint);
    if (!row) {
      if (empty) empty.classList.remove("hidden");
      if (heading) heading.innerHTML = "";
      if (detail) detail.innerHTML = "";
      return;
    }
    if (empty) empty.classList.add("hidden");
    if (heading) {
      heading.innerHTML = '<span class="pos-name">' + esc(row.name) + '</span><span class="pos-sym">' + esc(row.symbol) + '</span>';
    }
    const k = pnlClass(row.pnl);
    const closed = !!row.closed_at;
    const lines = closed ? [
      ["Size", money(row.size)], ["Entry", px(row.entry)], ["Exit", px(row.exit)],
      ["PnL", pnlText(row.pnl, row.pnl_pct)], ["Reason", row.reason || "closed"],
    ] : [
      ["Size", money(row.size)], ["Entry", px(row.entry)], ["Live", px(row.price)],
      ["PnL", pnlText(row.pnl, row.pnl_pct)], ["Stop", px(row.stop)],
    ];
    if (detail) {
      detail.innerHTML = '<div class="pos-card"><div class="pos-grid">' +
        lines.map((x) => '<div>' + esc(x[0]) + ' <b class="' + (x[0] === "PnL" ? k : "") + '">' + esc(x[1]) + '</b></div>').join("") +
        "</div></div>";
    }
    const candles = (row.candles || []).slice();
    if (row.price && !closed) candles.push({ t: new Date().toISOString(), v: row.price });
    if (window.drawPriceChart) {
      window.drawPriceChart(document.getElementById("coin-chart"), candles, row.entry);
    }
  }

  function openCoin(mint) {
    if (!mint) return;
    setTab("coin");
    renderCoin(mint);
  }

  function priceFromDex(body, mint) {
    const want = String(mint || "").toLowerCase();
    const list = Array.isArray(body) ? body : ((body && body.pairs) || []);
    let best = null, bestLiq = -1;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {};
      const addr = String(((p.baseToken) || {}).address || "").toLowerCase();
      if (addr !== want) continue;
      const liq = Number(((p.liquidity) || {}).usd) || 0;
      const v = Number(p.priceUsd);
      if (v > 0 && liq >= bestLiq) { bestLiq = liq; best = v; }
    }
    return best;
  }

  async function tickLivePrices() {
    const open = (lastPositions && lastPositions.open) || [];
    if (!open.length) { setLiveDot("off"); return; }
    const mints = open.map((r) => r.mint).filter(Boolean);
    try {
      const r = await fetch(DEX_TOKENS + mints.join(","), { cache: "no-store" });
      if (!r.ok) throw new Error("dex " + r.status);
      const body = await r.json();
      const prices = {};
      for (let i = 0; i < open.length; i++) {
        const v = priceFromDex(body, open[i].mint);
        if (v) prices[open[i].mint] = v;
      }
      if (!Object.keys(prices).length) { setLiveDot("stale"); return; }
      lastLivePrices = Object.assign({}, lastLivePrices, prices);
      lastLiveAt = Date.now();
      const eq = recomputeMtm(lastPositions, lastLivePrices);
      lastPositions = Object.assign({}, lastPositions, eq, { open: eq.open, closed: eq.closed, mtm: eq.mtm });
      renderPositions(lastPositions);
      applyEquity(eq.mtm, lastChart && lastChart.startValue);
      appendLiveChart(eq.mtm);
      setLiveDot("on");
    } catch (err) {
      setLiveDot("stale");
    }
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
        let p;
        try {
          [s, c, a, p] = await Promise.all([
            loadJson(dataUrl("state.json")),
            loadJson(dataUrl("chart.json")),
            loadJson(dataUrl("activity.json")).catch(() => ({ rows: [] })),
            loadJson(dataUrl("positions.json")).catch(() => ({ open: [], closed: [] })),
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
        renderPositions(p || { open: [], closed: [] });
        if (!lastLiveAt) tickLivePrices();
        if (Date.now() - lastLiveAt < 15000 && Object.keys(lastLivePrices).length) {
          const eq = recomputeMtm(lastPositions, lastLivePrices);
          lastPositions = Object.assign({}, lastPositions, eq, { open: eq.open, closed: eq.closed, mtm: eq.mtm });
          renderPositions(lastPositions);
          applyEquity(eq.mtm, c && c.startValue);
        }
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
      const [s, c, a, p] = await Promise.all([
        api("/api/state"),
        api("/api/chart?range=" + encodeURIComponent(range)),
        api("/api/activity").catch(() => ({ rows: [] })),
        api("/api/positions").catch(() => ({ open: [], closed: [] })),
      ]);
      renderState(s);
      renderChart(c);
      renderActivity((a && a.rows) || []);
      renderPositions(p || { open: [], closed: [] });
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
    navigator.serviceWorker.register(new URL("sw.js?v=6", pageBase()).href).catch(() => {});
  }
  function onPosClick(ev) {
    const btn = ev.target.closest("button.pos-card[data-mint]");
    if (btn) openCoin(btn.getAttribute("data-mint"));
  }
  const openEl = document.getElementById("open-positions");
  const closedEl = document.getElementById("closed-positions");
  if (openEl) openEl.addEventListener("click", onPosClick);
  if (closedEl) closedEl.addEventListener("click", onPosClick);
  const back = document.getElementById("coin-back");
  if (back) back.addEventListener("click", () => { openCoinMint = null; setTab("home"); });

  refresh();
  setInterval(refresh, 5000);
  tickLivePrices();
  setInterval(tickLivePrices, 10000);
})();
