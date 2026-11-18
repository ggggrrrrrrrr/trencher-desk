(function () {
  "use strict";
  const TOKEN_KEY = "desk_app_token";
  const DATA_KEY = "desk_data_path";
  const STALE_AFTER_MS = 15 * 60 * 1000;
  const AGENTS_FRESH_MS = 6 * 60 * 1000;
  const DEX_TOKENS = "https://api.dexscreener.com/tokens/v1/solana/";
  const TZ = "Europe/Amsterdam";
  const $ = (id) => document.getElementById(id);

  /* ---------- login (unchanged behaviour) ---------- */
  function extractDataPath(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const fromPair = s.match(/(?:^|[?#&])d=([^&#\s]+)/);
    if (fromPair && fromPair[1]) {
      try { return decodeURIComponent(fromPair[1]); } catch (e) { return fromPair[1]; }
    }
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
      } else if (p.startsWith("k=") || p.startsWith("b=")) {
        savePushParams("#" + p);
      } else if (p && hash.indexOf(p) !== -1) keepHash.push(p);
    }
    history.replaceState(null, "", window.location.pathname + window.location.search + (keepHash.length ? "#" + keepHash.join("&") : ""));
  }
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function dataPath() { try { return localStorage.getItem(DATA_KEY) || ""; } catch (e) { return ""; } }
  function saveDataPath(value) {
    const d = extractDataPath(value);
    if (!d) return false;
    try { localStorage.setItem(DATA_KEY, d); } catch (e) { return false; }
    return true;
  }
  function pageBase() {
    const loc = window.location;
    let path = loc.pathname || "/";
    if (!path.endsWith("/")) {
      const last = path.split("/").pop() || "";
      if (last.includes(".")) path = path.slice(0, path.lastIndexOf("/") + 1); else path += "/";
    }
    return new URL(path, loc.origin);
  }
  function dataUrl(file) { return new URL("d/" + dataPath() + "/" + file, pageBase()).href; }
  function headers() { const t = token(); const h = { "Accept": "application/json" }; if (t) h["Authorization"] = "Bearer " + t; return h; }



  /* ---------- night shift recap (00:00–08:00 CET, real rows only) ---------- */
  let recapOpen = null;  // null = auto
  function localHour() { return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(new Date())); }
  function renderRecap() {
    const el = $("recap"), btn = $("btn-recap"); if (!el) return;
    const r = lastState && lastState.recap;
    const hasData = !!(r && r.sleepWith != null);
    const auto = !!(r && r.complete && hasData && localHour() >= 8);
    const open = recapOpen == null ? auto : recapOpen;
    el.classList.toggle("hidden", !open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "hide ‹" : "recap ›";
    if (!open) return;
    if (!r) { el.innerHTML = '<div class="empty">recap unavailable</div>'; return; }
    if (!hasData) { el.innerHTML = '<div class="recap-h"><b>Night shift · ' + esc(r.date) + '</b><span class="muted">' + esc(r.window) + '</span></div><div class="empty">No night shift recorded yet: the desk has no balance rows for ' + esc(r.window) + '.</div>'; return; }
    const d = r.wokeTo != null ? r.wokeTo - r.sleepWith : null;
    const kv = (k, v, c) => '<div class="kv"><span class="muted">' + k + '</span><b' + (c ? ' class="' + c + '"' : "") + ">" + v + "</b></div>";
    const tr = (t) => t ? esc("$" + String(t.symbol || "?").toUpperCase()) + " " + signed(t.pnl) + (t.pct != null ? " · " + pct(t.pct) : "") : "—";
    const from = r.sleepFrom && r.sleepFrom !== r.start ? " (from " + hhmm(r.sleepFrom) + ")" : "";
    el.innerHTML =
      '<div class="recap-h"><b>Night shift · ' + esc(r.date) + '</b><span class="muted">' + esc(r.window) + (r.complete ? "" : " · in progress") + " · PAPER</span></div>" +
      '<div class="recap-big"><div><span class="muted">went to sleep with</span><b>' + money(r.sleepWith) + '</b><small class="muted">' + "00:00 CET" + esc(from) + '</small></div><div><span class="muted">' + (r.complete ? "woke up to" : "now") + '</span><b class="' + cls(d) + '">' + money(r.wokeTo) + '</b><small class="' + cls(d) + '">' + signed(d) + (r.multiple != null ? " · " + Number(r.multiple).toFixed(2) + "×" : "") + "</small></div></div>" +
      kv("trades", String(r.trades) + (r.opened ? " · " + r.opened + " opened" : "")) +
      kv("win rate", r.winRate == null ? "—" : r.winRate.toFixed(0) + "% (" + r.wins + "/" + r.trades + ")") +
      kv("best", tr(r.best), r.best ? cls(r.best.pnl) : "") +
      kv("worst", tr(r.worst), r.worst ? cls(r.worst.pnl) : "") +
      kv("rugs dodged", String(r.rugsDodged) + " auditor rejects") +
      kv("coins skipped", String(r.coinsSkipped) + " scanner kills") +
      kv("risk", "stop −" + r.stopPct + "% · trail " + r.trailPct + "% · max hold " + r.maxHoldMin + "m");
  }

  /* ---------- web push (win notifications) ---------- */
  const PUSH_KEY = "desk_push_key", BOT_KEY = "desk_bot";
  function savePushParams(raw) {
    const s = String(raw || "");
    const k = s.match(/(?:^|[?#&])k=([A-Za-z0-9_-]{80,100})/), b = s.match(/(?:^|[?#&])b=([A-Za-z0-9_]{3,40})/);
    try { if (k) localStorage.setItem(PUSH_KEY, k[1]); if (b) localStorage.setItem(BOT_KEY, b[1]); } catch (e) {}
    return !!k;
  }
  function pushKey() { try { return localStorage.getItem(PUSH_KEY) || ""; } catch (e) { return ""; } }
  function botName() { try { return localStorage.getItem(BOT_KEY) || ""; } catch (e) { return ""; } }
  function b64uToBytes(s) { const pad = "=".repeat((4 - s.length % 4) % 4); const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function bytesToB64u(buf) { let bin = ""; new Uint8Array(buf).forEach((c) => { bin += String.fromCharCode(c); }); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function pushSupported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function pushStatus(msg, kind) { const el = $("push-status"); if (!el) return; el.textContent = msg; el.className = "push-status " + (kind || "muted"); }
  function renderPush() {
    const btn = $("btn-push"), keyRow = $("push-key-row"); if (!btn) return;
    if (!pushSupported()) { btn.disabled = true; pushStatus(/iPhone|iPad/.test(navigator.userAgent) ? "Zet de app eerst op je beginscherm (Deel → Zet op beginscherm), iOS 16.4+." : "Deze browser ondersteunt geen web push."); keyRow.classList.add("hidden"); return; }
    keyRow.classList.toggle("hidden", !!pushKey());
    if (!pushKey()) { pushStatus("Stuur /meldingen naar de desk-bot in Telegram en plak de link hieronder."); return; }
    if (Notification.permission === "denied") { pushStatus("Meldingen zijn geblokkeerd in Instellingen → Meldingen.", "neg"); return; }
    try { const c = localStorage.getItem("desk_push_code"); if (c && Notification.permission === "granted") { pushStatus("Aan op dit toestel. Code nog niet verstuurd? Tik nogmaals om hem te kopiëren.", "pos"); return; } } catch (e) {}
    pushStatus("Tik op Meldingen aan: je krijgt een melding bij elke winst (PAPER).");
  }
  async function onPushTap() {
    if (!pushSupported()) { renderPush(); return; }
    const key = pushKey(); if (!key) { renderPush(); return; }
    try {
      const perm = await Notification.requestPermission();  // must run inside the tap
      if (perm !== "granted") { pushStatus("Meldingen niet toegestaan.", "neg"); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
      const j = sub.toJSON();
      const code = "/push " + bytesToB64u(new TextEncoder().encode(JSON.stringify({ e: j.endpoint, p: j.keys.p256dh, a: j.keys.auth })));
      try { localStorage.setItem("desk_push_code", "1"); } catch (e) {}
      const box = $("push-code"); box.value = code; box.classList.remove("hidden");
      let copied = false; try { await navigator.clipboard.writeText(code); copied = true; } catch (e) { box.select(); }
      const bot = botName(), open = $("push-open");
      if (bot) { open.href = "https://t.me/" + bot; open.classList.remove("hidden"); }
      pushStatus((copied ? "Code gekopieerd. " : "Kopieer de code hieronder. ") + "Plak hem in de Telegram-chat met de desk; je krijgt dan een testmelding.", "pos");
    } catch (e) { pushStatus("Aanmelden mislukt: " + (e && e.message ? e.message : e), "neg"); }
  }
  function wirePush() {
    const btn = $("btn-push"); if (!btn) return;
    btn.addEventListener("click", onPushTap);
    $("push-key-save").addEventListener("click", () => { const i = $("push-key-input"); if (savePushParams(i.value)) { i.value = ""; renderPush(); } else pushStatus("Dat leek geen meldingen-link. Stuur /meldingen naar de bot.", "neg"); });
    renderPush();
  }

  /* ---------- formatting ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(n) { const v = Number(n); return Number.isFinite(v) ? v : null; }
  function money(n, dp) {
    const v = num(n); if (v == null) return "—";
    const d = dp == null ? 2 : dp;
    return (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function signed(n, dp) { const v = num(n); if (v == null) return "—"; return (v > 0 ? "+" : v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp }); }
  function pct(n) { const v = num(n); if (v == null) return "—"; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1) + "%"; }
  function cls(n) { const v = num(n); if (!v) return "flat"; return v > 0 ? "up" : "down"; }
  function px(n) {
    const v = num(n); if (!v || v <= 0) return "—";
    if (v >= 1) return "$" + v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    if (v >= 0.0001) return "$" + v.toPrecision(4);
    const zeros = Math.floor(-Math.log10(v)); // 2.881e-05 -> 4 zeros after "0."
    const SUB = "₀₁₂₃₄₅₆₇₈₉";
    const sub = String(zeros).split("").map((d) => SUB[Number(d)]).join("");
    const digits = (v * Math.pow(10, zeros + 4)).toFixed(0).slice(0, 4);
    return "$0.0" + sub + digits;
  }
  function compact(n) { const v = num(n); if (v == null) return "—"; if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M"; if (v >= 1e3) return "$" + Math.round(v / 1e3) + "k"; return "$" + Math.round(v); }
  function hhmm(t) { const ms = typeof t === "number" ? t : Date.parse(t || ""); if (!Number.isFinite(ms)) return "--:--"; return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false }).format(new Date(ms)); }
  function dur(ms) { if (!Number.isFinite(ms) || ms < 0) return "—"; const m = Math.floor(ms / 60000); const h = Math.floor(m / 60); return h ? h + "h " + (m % 60) + "m" : m + "m"; }
  function clock(ms) { if (!Number.isFinite(ms) || ms < 0) return "--:--"; const m = Math.floor(ms / 60000); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "···" : s; }
  const PALETTE = ["#3ddc84", "#4da3ff", "#f5b041", "#c084fc", "#ff7a6b", "#2dd4bf", "#facc15"];
  function hashColor(s) { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
  function icon(mint, sym, lg) {
    const m = meta[mint] || {};
    const c = "ci" + (lg ? " lg" : "");
    const init = esc(String(sym || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?");
    if (m.img) return '<img class="' + c + '" src="' + esc(m.img) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;' + c + '&quot; style=&quot;background:' + hashColor(mint) + '&quot;>' + init + '</span>\'">';
    return '<span class="' + c + '" style="background:' + hashColor(mint) + '">' + init + "</span>";
  }

  /* ---------- state ---------- */
  let lastState = null, lastChart = null, lastPositions = null, lastActivity = [];
  let lastLivePrices = {}, lastLiveAt = 0, liveChartExtra = [];
  let openCoinMint = null;
  const meta = {}; // mint -> {img, liq, mcap}

  function showError(msg) { const el = $("error"); if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; } el.textContent = msg; el.classList.remove("hidden"); }
  function showLogin(needed) { $("login-panel").classList.toggle("hidden", !needed); }
  function setTab(name) { document.querySelectorAll(".tab-panel").forEach((el) => el.classList.toggle("hidden", el.id !== "tab-" + name)); window.scrollTo(0, 0); }
  function setLiveDot(state) { const el = $("live-dot"); el.classList.remove("on", "off", "stale"); el.classList.add(state || "off"); }
  function isStale(iso) { const t = Date.parse(iso || ""); return Number.isFinite(t) && (Date.now() - t) > STALE_AFTER_MS; }

  function allPositions() { return [].concat((lastPositions && lastPositions.open) || [], (lastPositions && lastPositions.closed) || []); }
  function symOf(mint) { const r = allPositions().find((x) => x.mint === mint); return r ? r.symbol : null; }
  function nameOf(mint) { const r = allPositions().find((x) => x.mint === mint); return r ? r.name : null; }
  function startValue() { return lastChart && lastChart.startValue != null ? Number(lastChart.startValue) : null; }
  function chartPoints() {
    const base = (lastChart && lastChart.points) || [];
    let lastT = 0;
    if (base.length) { const p = Date.parse(base[base.length - 1].t || ""); if (Number.isFinite(p)) lastT = p; }
    liveChartExtra = liveChartExtra.filter((p) => Date.parse(p.t) > lastT);
    return base.concat(liveChartExtra);
  }
  function agentsWithStatus() {
    const s = lastState || {};
    const fresh = !!s.updatedAt && (Date.now() - Date.parse(s.updatedAt) <= AGENTS_FRESH_MS);
    return (s.agents || []).map((a) => Object.assign({}, a, { live: fresh && a.status === "running" }));
  }
  function agent(id) { return agentsWithStatus().find((a) => a.id === id) || null; }

  /* ---------- render: header + balance + chart ---------- */
  let scrubbing = false;
  function setBalance(v) {
    const bal = $("balance");
    if (v == null) { bal.innerHTML = '<span class="int">$—</span>'; return; }
    const cents = Math.round(Math.abs(v) * 100), int = Math.floor(cents / 100), dec = cents % 100;
    const html = '<span class="int">' + (v < 0 ? "−$" : "$") + int.toLocaleString("en-US") + '</span><span class="dec">.' + String(dec).padStart(2, "0") + "</span>";
    if (bal.__html !== html) { bal.innerHTML = html; bal.__html = html; }
  }
  function renderTop() {
    const s = lastState || {};
    const mtm = num(s.balance);
    const start = startValue();
    const pts = chartPoints();
    const firstT = pts.length ? Date.parse(pts[0].t) : NaN;
    const agents = agentsWithStatus();
    const active = agents.filter((a) => a.live).length;

    $("mode-pill").textContent = (s.mode || "PAPER").toLowerCase() + " mode";
    $("head-sub").textContent = "scanning new pairs · via telegram · " + (Number.isFinite(firstT) ? Math.max(0, Math.floor((Date.now() - firstT) / 3600000)) + "h in" : "—");

    if (!scrubbing) setBalance(mtm);

    // change over the last hour of balance points
    const dp = $("delta-pill");
    let ref1h = null;
    const cutoff = Date.now() - 3600000;
    for (const p of pts) { const t = Date.parse(p.t); if (t <= cutoff) ref1h = Number(p.v); else break; }
    if (ref1h == null && pts.length) ref1h = Number(pts[0].v);
    if (mtm != null && ref1h != null) {
      const d = mtm - ref1h;
      dp.textContent = (d >= 0 ? "+" : "−") + money(Math.abs(d));
      dp.className = "pill pill-delta " + cls(d); dp.title = "change over the last hour";
    } else { dp.textContent = "—"; dp.className = "pill pill-delta flat"; }

    const pos = allPositions();
    $("in-pill").textContent = "in " + (start != null ? money(start, 0) : "—") + " · " + pos.length + " trade" + (pos.length === 1 ? "" : "s");
    $("multiplier").textContent = (mtm != null && start) ? (mtm / start).toFixed(2) + "×" : "—×";
    const pl = $("pnl-line");
    if (mtm != null && start != null) { const d = mtm - start; pl.textContent = signed(d) + " · " + active + " agent" + (active === 1 ? "" : "s") + " active"; pl.className = cls(d) === "flat" ? "flat" : cls(d); }
    else { pl.textContent = active + " agents active"; pl.className = "flat"; }
    $("elapsed").textContent = Number.isFinite(firstT) ? clock(Date.now() - firstT) : "--:--";
    $("elapsed").title = "running time";
    // Chart window: from 15 min before tonight's first trade (else the last 2h), so the moves are readable.
    const opens = allPositions().map((r) => Date.parse(r.opened_at || "")).filter(Number.isFinite);
    let winStart = opens.length ? Math.min.apply(null, opens) - 15 * 60000 : Date.now() - 2 * 3600000;
    let view = pts.filter((p) => Date.parse(p.t) >= winStart);
    if (view.length < 2) { view = pts.slice(-2); }
    const viewT0 = view.length ? Date.parse(view[0].t) : NaN;
    $("chart-t0").textContent = Number.isFinite(viewT0) ? hhmm(viewT0) : "--:--";
    const viewT1 = view.length ? Date.parse(view[view.length - 1].t) : NaN;
    $("chart-t1").textContent = Number.isFinite(viewT1) ? hhmm(viewT1) : "--:--";
    $("chart-empty").classList.toggle("hidden", pts.length > 0);
    window.drawHomeChart($("home-chart"), view, start, (v) => money(v));
    const lc = window.chartColor($("home-chart"));
    document.documentElement.style.setProperty("--line-col", lc);
    $("acct-stack").textContent = money(mtm);
    $("acct-mode").textContent = s.mode || "PAPER";
  }

  /* ---------- ticker ---------- */
  function renderTicker() {
    const el = $("ticker");
    const pos = allPositions().slice().sort((a, b) => Date.parse(b.opened_at || "") - Date.parse(a.opened_at || ""));
    if (!pos.length) { el.__key = ""; el.className = "ticker-track still"; el.innerHTML = '<span class="ticker-empty">waiting for first signal · scanner listening</span>'; return; }
    const key = pos.map((r) => r.mint + ":" + ((meta[r.mint] || {}).img ? 1 : 0)).join(",");
    if (el.__key === key) {
      el.querySelectorAll("[data-pm]").forEach((sp) => { const r = pos.find((x) => x.mint === sp.getAttribute("data-pm")); if (r) { sp.textContent = pct(r.pnl_pct); sp.className = "pct " + cls(r.pnl_pct); } });
      return;
    }
    el.__key = key;
    const chips = pos.map((r) => '<span class="chip">' + icon(r.mint, r.symbol) + "<span>$" + esc(r.symbol) + '</span><span data-pm="' + esc(r.mint) + '" class="pct ' + cls(r.pnl_pct) + '">' + pct(r.pnl_pct) + "</span></span>").join("");
    const reps = Math.max(1, Math.ceil(8 / pos.length));
    const half = new Array(reps).fill(chips).join("");
    const html = half + half;
    el.innerHTML = html;
    el.className = "ticker-track";
    el.style.animationDuration = Math.max(20, reps * pos.length * 5) + "s";
  }

  /* ---------- agent cards ---------- */
  function setDot(id, on) { const d = $(id); if (d) d.classList.toggle("on", !!on); }
  function renderAgents() {
    const agents = agentsWithStatus();
    const ids = ["scanner", "auditor", "analyst", "executor", "risk"];
    ids.forEach((id) => { const a = agent(id); setDot("dot-" + id, a && a.live); });
    const active = agents.filter((a) => a.live).length;
    $("agents-meta").textContent = active + "/" + (agents.length || 5) + " agents → risk";

    // Scanner: the last coins it looked at (liq + verdict), from the desk snapshot.
    const sc = agent("scanner");
    const M = (lastState && lastState.metrics) || null;
    if (M && Array.isArray(M.scannerRecent)) {
      const rec = M.scannerRecent.slice(0, 10);
      $("scanner-rows").innerHTML = rec.length ? rec.map((r) => {
        const pass = r.verdict === "pass";
        return '<div class="r">' + icon(r.mint, r.symbol) + '<span class="nm' + (pass ? "" : " killed") + '">' + esc(trunc(r.name || r.symbol || String(r.mint).slice(0, 6), 12)) + '</span><span class="meta">' + hhmm(r.ts) + " · liq " + (r.liq != null ? compact(r.liq) : "—") + "</span>" +
          '<span class="rt"><span class="' + (pass ? "up" : "down") + '">' + (pass ? "→ auditor" : esc(trunc(r.reason || "kill", 16))) + "</span></span></div>";
      }).join("") : '<div class="empty">no coins seen yet tonight</div>';
      $("scanner-foot").textContent = (sc ? (sc.subtitle || "") : "") + " · last " + rec.length + " seen";
    } else {
    const picks = allPositions().slice().sort((a, b) => Date.parse(b.opened_at || "") - Date.parse(a.opened_at || "")).slice(0, 3);
    $("scanner-rows").innerHTML = picks.length ? picks.map((r) => {
      const m = meta[r.mint] || {};
      return '<div class="r">' + icon(r.mint, r.symbol) + '<span class="nm">' + esc(trunc(r.name, 12)) + '</span><span class="meta">#' + esc(r.id) + " · liq " + (m.liq != null ? compact(m.liq) : "—") + "</span>" +
        '<span class="rt"><span class="' + cls(r.pnl_pct) + '">' + pct(r.pnl_pct) + "</span><small>" + money(r.size, 0) + "</small></span></div>";
    }).join("") : '<div class="empty">waiting for first signal</div>';
    $("scanner-foot").textContent = sc ? (sc.subtitle || "—") : "—";
    }

    // Telegram feed: paper buys, sells, stops, declines from desk events.
    const rows = lastActivity || [];
    $("feed-count").textContent = M && M.alertsSent != null ? "· " + M.alertsSent.toLocaleString("en-US") + " alerts sent" : "· " + rows.length + " event" + (rows.length === 1 ? "" : "s");
    $("feed-rows").innerHTML = rows.length ? rows.slice(0, 5).map((r) => {
      const k = String(r.kind || "").toLowerCase();
      const sym = symOf(r.mint) || (r.title || "").replace(/^\w+\s+/, "");
      const val = String(r.value || "").split("·")[0].trim();
      return '<div class="r"><span class="meta" style="flex:0 0 52px">' + esc(r.agent || "desk") + '</span><span class="v-' + esc(k) + '" style="flex:0 0 52px">' + esc(k) + '</span><span class="sym nm">$' + esc(trunc(sym, 12)) + '</span><span class="rt ' + (/^[-−]/.test(val) ? "down" : "") + '">' + esc(val) + "</span></div>";
    }).join("") : '<div class="empty">waiting for first signal</div>';

    // Rug check (auditor)
    const au = agent("auditor");
    const am = String((au && au.subtitle) || "").match(/(\d+)\s+taken apart\s*·\s*(\d+)\s+rejected/);
    let nRej = am ? Number(am[2]) : 0, nPass = am ? Math.max(0, Number(am[1]) - Number(am[2])) : 0;
    if (M && M.auditorRejected != null) { nRej = Number(M.auditorRejected); nPass = Number(M.auditorPassed || 0); }
    $("rug-big").textContent = String(nRej);
    $("rug-sub").textContent = "rejected · " + nPass + " passed";
    window.drawSpark($("spark-rug"), (nRej + nPass) ? [0, nPass, nRej + nPass] : [], "#3ddc84");

    // Execution: paper fills
    const trades = allPositions().slice().sort((a, b) => Date.parse(a.opened_at || "") - Date.parse(b.opened_at || ""));
    const ex = agent("executor");
    const nT = ex && ex.count != null ? Number(ex.count) : trades.length;
    const avg = trades.length ? trades.reduce((s, r) => s + (Number(r.size) || 0), 0) / trades.length : null;
    const lat = M ? num(M.avgFillLatencyMs) : null;
    if (lat != null) {
      $("exec-big").textContent = lat >= 1000 ? (lat / 1000).toFixed(1) + "s" : Math.round(lat) + "ms";
      $("exec-sub").textContent = "avg fill · " + nT + " trade" + (nT === 1 ? "" : "s") + (avg != null ? " · avg " + money(avg, 0) : "");
    } else {
      $("exec-big").textContent = String(nT);
      $("exec-sub").textContent = "paper fills · avg " + (avg != null ? money(avg, 0) : "—");
    }
    window.drawSpark($("spark-exec"), trades.map((r) => r.size), "#4da3ff");

    // Risk
    const rk = agent("risk");
    const open = (lastPositions && lastPositions.open) || [];
    const closed = (lastPositions && lastPositions.closed) || [];
    const stopPct = (open[0] && open[0].stop_pct) || ((String((rk && rk.subtitle) || "").match(/stop -(\d+(?:\.\d+)?)%/) || [])[1]);
    const stops = closed.filter((r) => r.reason === "stop").length;
    $("risk-big").textContent = stopPct != null ? "−" + Number(stopPct).toFixed(0) + "%" : "—";
    $("risk-sub").textContent = "stop · " + stops + " stop" + (stops === 1 ? "" : "s") + " hit";
    let cum = 0; const series = [0].concat(closed.slice().sort((a, b) => Date.parse(a.closed_at || "") - Date.parse(b.closed_at || "")).map((r) => (cum += Number(r.pnl) || 0)));
    window.drawSpark($("spark-risk"), series.length > 1 ? series : [], "#f5b041");
  }

  /* ---------- decisions log ---------- */
  const KIND = { bought: "BUY", sold: "SELL", stopped: "STOP", rejected: "SKIP" };
  function logRows(rows, limit) {
    return rows.slice(0, limit).map((r) => {
      const k = KIND[String(r.kind || "").toLowerCase()] || "NOTE";
      const sym = symOf(r.mint);
      const nm = nameOf(r.mint) || (r.title || "").replace(/^\w+\s+/, "");
      const val = String(r.value || "").split("·")[0].trim();
      const vcls = /^[-−]/.test(val) ? "down" : (/^\+/.test(val) ? "up" : "muted");
      return '<div class="l"><span class="t">' + hhmm(r.ts) + '</span><span class="k k-' + k + '">' + k + '</span><span class="s">' + (sym ? "$" + esc(sym) + " " : "") + '<span class="muted">' + esc(trunc(nm, 16)) + "</span></span>" +
        '<span class="x ' + vcls + '">' + esc(val) + "</span></div>";
    }).join("");
  }
  function renderDecisions() {
    const rows = lastActivity || [];
    const an = agent("analyst");
    const tail = an && an.subtitle ? '<div class="l"><span class="t">' + hhmm(lastState && lastState.updatedAt) + '</span><span class="k k-SCAN">SCAN</span><span class="s muted">' + esc(an.subtitle) + "</span></div>" : "";
    $("decisions").innerHTML = rows.length ? tail + logRows(rows, 8) : (tail || '<div class="empty">waiting for first signal</div>');
    $("activity-full").innerHTML = rows.length ? logRows(rows, 50) : '<div class="empty">nothing yet tonight</div>';
    $("act-count").textContent = rows.length ? rows.length + " events" : "";
  }

  /* ---------- positions ---------- */
  function renderPositions() {
    const open = (lastPositions && lastPositions.open) || [];
    const closed = (lastPositions && lastPositions.closed) || [];
    $("open-positions").innerHTML = open.length ? open.map((r) => {
      const k = cls(r.pnl);
      return '<button type="button" class="card pos" data-mint="' + esc(r.mint) + '"><div class="pos-top">' + icon(r.mint, r.symbol, true) +
        '<div><div class="nm">' + esc(r.name) + '</div><div class="meta">$' + esc(r.symbol) + " · " + money(r.size, 0) + (r.trail_active ? ' · <span class="pos-tag trail">trailing</span>' : "") + "</div></div>" +
        '<div class="pnl ' + k + '">' + signed(r.pnl) + "<small>" + pct(r.pnl_pct) + "</small></div></div>" +
        '<div class="pos-grid"><div>entry<b>' + px(r.entry) + "</b></div><div>live<b>" + px(r.price) + "</b></div><div>stop<b>" + px(r.stop) + (r.stop_pct != null ? " <span class=\"muted\">−" + Number(r.stop_pct).toFixed(0) + "%</span>" : "") + "</b></div><div>held<b>" + dur(Date.now() - Date.parse(r.opened_at || "")) + "</b></div></div></button>";
    }).join("") : '<div class="card empty">no open positions</div>';
    const cl = closed.slice().sort((a, b) => Date.parse(b.closed_at || "") - Date.parse(a.closed_at || ""));
    const tot = cl.reduce((s, r) => s + (Number(r.pnl) || 0), 0);
    $("closed-meta").innerHTML = cl.length ? cl.length + " · <span class=\"" + cls(tot) + "\">" + signed(tot) + "</span>" : "";
    $("closed-positions").innerHTML = cl.length ? cl.map((r) => {
      const k = cls(r.pnl);
      return '<button type="button" class="card pos" data-mint="' + esc(r.mint) + '"><div class="pos-top">' + icon(r.mint, r.symbol, true) +
        '<div><div class="nm">' + esc(r.name) + '</div><div class="meta">$' + esc(r.symbol) + " · " + hhmm(r.closed_at) + ' · <span class="pos-tag">' + esc(r.reason || "closed") + "</span></div></div>" +
        '<div class="pnl ' + k + '">' + signed(r.pnl) + "<small>" + pct(r.pnl_pct) + "</small></div></div>" +
        '<div class="pos-grid"><div>size<b>' + money(r.size, 0) + "</b></div><div>entry<b>" + px(r.entry) + "</b></div><div>exit<b>" + px(r.exit) + "</b></div><div>fees<b>" + (r.fees != null ? money(r.fees) : "—") + "</b></div></div></button>";
    }).join("") : '<div class="card empty">no closed trades today</div>';
    if (openCoinMint) renderCoin(openCoinMint);
  }

  function renderCoin(mint) {
    openCoinMint = mint;
    const row = allPositions().find((r) => r.mint === mint);
    if (!row) { $("coin-empty").classList.remove("hidden"); $("coin-heading").innerHTML = ""; $("coin-detail").innerHTML = ""; return; }
    $("coin-empty").classList.add("hidden");
    const closed = !!row.closed_at, k = cls(row.pnl);
    $("coin-heading").innerHTML = icon(row.mint, row.symbol, true) + "<span>" + esc(row.name) + '</span><span class="meta">$' + esc(row.symbol) + "</span>";
    const lines = closed
      ? [["size", money(row.size)], ["entry", px(row.entry)], ["exit", px(row.exit)], ["pnl", signed(row.pnl) + " · " + pct(row.pnl_pct)], ["reason", row.reason || "closed"]]
      : [["size", money(row.size)], ["entry", px(row.entry)], ["live", px(row.price)], ["pnl", signed(row.pnl) + " · " + pct(row.pnl_pct)], ["stop", px(row.stop)]];
    const m = meta[row.mint] || {};
    if (m.liq != null) lines.push(["liquidity", compact(m.liq)]);
    $("coin-detail").innerHTML = '<article class="card">' + lines.map((x) => '<div class="kv"><span class="muted">' + esc(x[0]) + '</span><b class="' + (x[0] === "pnl" ? k : "") + '">' + esc(x[1]) + "</b></div>").join("") + "</article>";
    const candles = (row.candles || []).slice();
    if (row.price && !closed) candles.push({ t: new Date().toISOString(), v: row.price });
    $("coin-t0").textContent = candles.length ? hhmm(candles[0].t) : "";
    window.drawPriceChart($("coin-chart"), candles, row.entry);
  }
  function openCoin(mint) { if (!mint) return; setTab("coin"); renderCoin(mint); }

  function renderAll() { renderTop(); renderTicker(); renderAgents(); renderDecisions(); renderPositions(); renderRecap(); }

  /* ---------- honest PAPER costs (same model as desk/costs.py + fees.py) ---------- */
  const POOL_FEE = 0.0025, UNKNOWN_SLIP = 0.03;
  function sideFee(t) { t = Number(t) || 0; if (t <= 0) return 0; const raw = t < 47.5 ? t * 0.02 : (t <= 190 ? 0.95 : t * 0.005); return raw * (1 - feeDiscount()); }
  function feeDiscount() { const d = Number(lastState && lastState.feesRefDiscount); return Number.isFinite(d) ? d : 0; }
  function liquidation(entry, now, size, entryLiq, nowLiq) {
    size = Number(size) || 0; entry = Number(entry) || 0; now = Number(now) || 0;
    if (size <= 0 || entry <= 0) return 0;
    const ef = sideFee(size), spend = Math.max(0, size - ef);
    const x0 = Number(entryLiq) > 0 ? Number(entryLiq) / 2 : null, x1 = Number(nowLiq) > 0 ? Number(nowLiq) / 2 : null;
    const fill = entry * (1 + (x0 ? spend / x0 : UNKNOWN_SLIP)) * (1 + POOL_FEE);
    const valueMid = spend / fill * now;
    let out = x1 ? valueMid / (1 + valueMid / x1) : valueMid * (1 - UNKNOWN_SLIP);
    out *= (1 - POOL_FEE);
    return Math.max(0, out - sideFee(out));
  }

  /* ---------- live MTM (DexScreener, 10s) ---------- */
  function recomputeMtm(pos, prices) {
    const settled = Number(pos && pos.settled != null ? pos.settled : (lastState && lastState.settled));
    let unreal = 0;
    const open = ((pos && pos.open) || []).map((row) => {
      const next = Object.assign({}, row);
      const live = prices && prices[row.mint] != null ? prices[row.mint] : row.price;
      if (live != null) next.price = live;
      const liqNow = (meta[row.mint] && meta[row.mint].liq) || row.last_liq || row.entry_liq;
      if (next.price && next.entry) {
        // net of fees + slippage: what selling right now would actually pay
        const val = liquidation(next.entry, next.price, next.size, row.entry_liq, liqNow);
        next.pnl = val - Number(next.size);
        next.pnl_pct = Number(next.size) ? (val / Number(next.size) - 1) * 100 : 0;
        unreal += next.pnl;
      } else if (next.size) { unreal -= sideFee(next.size); }
      return next;
    });
    const base = Number.isFinite(settled) ? settled : 0;
    return { settled: base, mtm: Number((base + unreal).toFixed(4)), open: open, closed: (pos && pos.closed) || [] };
  }
  function applyLive() {
    if (!(Date.now() - lastLiveAt < 15000 && Object.keys(lastLivePrices).length)) return false;
    const eq = recomputeMtm(lastPositions, lastLivePrices);
    lastPositions = Object.assign({}, lastPositions, { open: eq.open, closed: eq.closed, mtm: eq.mtm });
    if (lastState) lastState.balance = eq.mtm;
    return eq.mtm;
  }
  function readDex(body) {
    const list = Array.isArray(body) ? body : ((body && body.pairs) || []);
    const best = {};
    for (const p of list) {
      const addr = String(((p && p.baseToken) || {}).address || "");
      if (!addr) continue;
      const liq = Number(((p.liquidity) || {}).usd) || 0;
      const v = Number(p.priceUsd);
      const pump = p.dexId === "pumpswap";
      if (best[addr] && best[addr].pump && !pump) { if (!best[addr].img && p.info && p.info.imageUrl) best[addr].img = p.info.imageUrl; continue; }
      if (!best[addr] || (pump && !best[addr].pump) || liq >= best[addr].liq) best[addr] = { pump: pump, liq: liq, price: v > 0 ? v : null, img: (p.info && p.info.imageUrl) || (best[addr] && best[addr].img) || null };
      else if (!best[addr].img && p.info && p.info.imageUrl) best[addr].img = p.info.imageUrl;
    }
    return best;
  }
  async function tickLivePrices() {
    const all = allPositions();
    if (!all.length) { setLiveDot("off"); return; }
    const openMints = ((lastPositions && lastPositions.open) || []).map((r) => r.mint);
    const mints = Array.from(new Set(openMints.concat(all.map((r) => r.mint).filter((m) => !meta[m])))).filter(Boolean).slice(0, 30);
    if (!mints.length) { setLiveDot("off"); return; }
    try {
      const r = await fetch(DEX_TOKENS + mints.join(","), { cache: "no-store" });
      if (!r.ok) throw new Error("dex " + r.status);
      const best = readDex(await r.json());
      const prices = {};
      for (const m of mints) {
        const b = best[m] || Object.keys(best).map((k) => k.toLowerCase() === m.toLowerCase() ? best[k] : null).find(Boolean);
        if (!b) { if (!meta[m]) meta[m] = {}; continue; }
        meta[m] = { liq: b.liq, img: b.img || (meta[m] && meta[m].img) || null };
        if (b.price && openMints.includes(m)) prices[m] = b.price;
      }
      if (!openMints.length) { setLiveDot("off"); renderAll(); return; }
      if (!Object.keys(prices).length) { setLiveDot("stale"); renderAll(); return; }
      lastLivePrices = Object.assign({}, lastLivePrices, prices);
      lastLiveAt = Date.now();
      const mtm = applyLive();
      if (mtm !== false) { liveChartExtra.push({ t: new Date().toISOString(), v: mtm }); if (liveChartExtra.length > 360) liveChartExtra = liveChartExtra.slice(-360); }
      renderAll();
      setLiveDot("on");
    } catch (err) { setLiveDot("stale"); }
  }

  /* ---------- account ---------- */
  function renderAccount(acct) {
    const err = $("acct-error");
    if (!acct) { $("acct-tg").textContent = "unavailable"; err.textContent = "Account data missing"; err.classList.remove("hidden"); return; }
    err.textContent = ""; err.classList.add("hidden");
    $("acct-mode").textContent = acct.mode || (lastState && lastState.mode) || "PAPER";
    $("acct-stack").textContent = money(lastState && lastState.balance != null ? lastState.balance : acct.stack);
    const profile = $("acct-profile"), invite = $("acct-invite");
    profile.href = acct.profile_url || "#";
    invite.href = acct.signup_url || "#";
    invite.onclick = function (ev) {
      const url = acct.signup_url;
      if (navigator.share && url) { ev.preventDefault(); navigator.share({ title: "FOMO", url: url }).catch(() => { try { navigator.clipboard.writeText(url); } catch (e) {} }); }
    };
    $("acct-tg").textContent = acct.telegram ? "connected" : "not connected";
  }

  /* ---------- loading ---------- */
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
  function ingest(s, c, a, p) {
    lastState = s; lastChart = c; lastActivity = (a && a.rows) || []; lastPositions = p || { open: [], closed: [] };
    applyLive();
    renderAll();
  }
  let refreshing = false;
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      const d = dataPath();
      if (!d && !token()) { showLogin(true); showError("No login saved. Paste the login link from Telegram."); return; }
      if (d) {
        showLogin(false);
        let s, c, a, p;
        try {
          [s, c, a, p] = await Promise.all([
            loadJson(dataUrl("state.json")),
            loadJson(dataUrl("chart.json")),
            loadJson(dataUrl("activity.json")).catch(() => ({ rows: [] })),
            loadJson(dataUrl("positions.json")).catch(() => ({ open: [], closed: [] })),
          ]);
        } catch (err) {
          if (err && err.status === 404) { showLogin(true); showError("Data not found (404). Paste the login link from Telegram again."); return; }
          throw err;
        }
        ingest(s, c, a, p);
        if (!lastLiveAt) tickLivePrices();
        loadJson(dataUrl("account.json")).then(renderAccount).catch(() => renderAccount(null));
        if (isStale(s && s.updatedAt)) showError("Desk paused since " + hhmm(s.updatedAt) + " CET, resumes automatically");
        else showError("");
        return;
      }
      showLogin(false);
      const [s, c, a, p] = await Promise.all([
        api("/api/state"), api("/api/chart?range=LIVE"),
        api("/api/activity").catch(() => ({ rows: [] })), api("/api/positions").catch(() => ({ open: [], closed: [] })),
      ]);
      ingest(s, c, a, p);
      showError("");
    } catch (e) {
      const when = lastState && lastState.updatedAt;
      showError("Desk offline · retrying in 5s · last update " + (when ? hhmm(when) + " CET" : "unknown"));
    } finally { refreshing = false; }
  }

  function onSaveLogin() {
    const input = $("login-link");
    if (!saveDataPath(input ? input.value : "")) { showError("That did not look like a login link. Paste the full Telegram link."); showLogin(true); return; }
    input.value = ""; showLogin(false); showError(""); refresh();
  }

  /* ---------- chart scrubbing (touch + mouse) ---------- */
  function showScrub(hit) {
    const tip = $("scrub-tip"), box = $("home-chart").parentNode;
    if (!hit) { tip.classList.add("hidden"); scrubbing = false; box.classList.remove("scrubbing"); renderTop(); return; }
    scrubbing = true; box.classList.add("scrubbing");
    const start = startValue();
    setBalance(hit.v);
    const d = start != null ? hit.v - start : null;
    const dEl = d == null ? "" : '<span class="' + cls(d) + '">' + signed(d) + " · " + pct(start ? d / start * 100 : 0) + "</span>";
    tip.innerHTML = "<b>" + money(hit.v) + "</b><span>" + hhmm(hit.t) + " CET</span>" + dEl;
    const pl = $("pnl-line");
    if (d != null) { pl.textContent = signed(d) + " vs " + money(start, 0) + " put in · " + hhmm(hit.t) + " CET"; pl.className = cls(d); }
    const bw = box.clientWidth, tw = tip.offsetWidth || 120;
    const left = Math.max(6, Math.min(bw - tw - 6, hit.x + 4 - tw / 2));
    tip.style.transform = "translate3d(" + Math.round(left) + "px,0,0)";
    tip.classList.remove("hidden");
  }
  function wireScrub() {
    const cv = $("home-chart");
    let sx = 0, sy = 0, mode = null, lastIdx = -1;
    function at(x) {
      const hit = window.scrubHomeChart(cv, x);
      if (hit && hit.index !== lastIdx) { lastIdx = hit.index; cv.parentNode.classList.remove("tick"); void cv.parentNode.offsetWidth; cv.parentNode.classList.add("tick"); }
      showScrub(hit);
    }
    function end() { mode = null; lastIdx = -1; window.scrubHomeChart(cv, null); showScrub(null); }
    cv.addEventListener("touchstart", (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; mode = "pending"; at(t.clientX); }, { passive: true });
    cv.addEventListener("touchmove", (e) => {
      const t = e.touches[0]; if (!t) return;
      if (mode === "pending") { const dx = Math.abs(t.clientX - sx), dy = Math.abs(t.clientY - sy); if (dx > 6 || dy > 6) mode = dx >= dy ? "scrub" : "scroll"; }
      if (mode === "scroll") { end(); return; }
      if (e.cancelable) e.preventDefault();
      at(t.clientX);
    }, { passive: false });
    cv.addEventListener("touchend", end); cv.addEventListener("touchcancel", end);
    cv.addEventListener("mousemove", (e) => at(e.clientX));
    cv.addEventListener("mouseleave", end);
  }

  /* ---------- wiring ---------- */
  wireScrub();
  wirePush();
  $("btn-recap").addEventListener("click", () => { const r = lastState && lastState.recap; const cur = !$("recap").classList.contains("hidden"); recapOpen = !cur; renderRecap(); });
  captureFromHash();
  $("login-save").addEventListener("click", onSaveLogin);
  $("login-link").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); onSaveLogin(); } });
  $("btn-account").addEventListener("click", () => { setTab("account"); renderPush(); if (dataPath()) loadJson(dataUrl("account.json")).then(renderAccount).catch(() => renderAccount(null)); });
  document.querySelectorAll("[data-home]").forEach((b) => b.addEventListener("click", () => { openCoinMint = null; setTab("home"); renderTop(); }));
  ["open-positions", "closed-positions"].forEach((id) => $(id).addEventListener("click", (ev) => { const b = ev.target.closest("[data-mint]"); if (b) openCoin(b.getAttribute("data-mint")); }));
  let rz = 0; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderAll, 120); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { refresh(); tickLivePrices(); } });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("sw.js?v=9", pageBase()).href).catch(() => {});

  refresh();
  setInterval(refresh, 5000);
  setInterval(tickLivePrices, 10000);
})();
