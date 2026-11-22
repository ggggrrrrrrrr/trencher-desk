(function () {
  "use strict";
  const DATA_KEY = "desk_data_path";
  const START_KEY = "cd_demo_started";
  const TZ = "Europe/Amsterdam";
  const $ = (id) => document.getElementById(id);
  let snap = null, range = "LIVE", feedFilter = "all", homeSeg = "open", sumSeg = "today";

  /* ---------- login link (#d=...) — same as before, the data path stays in this device only ---------- */
  function extractDataPath(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/(?:^|[?#&])d=([^&#\s]+)/);
    if (m && m[1]) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    if (/^[A-Za-z0-9_-]{32,}$/.test(s)) return s;
    return "";
  }
  function captureFromHash() {
    const all = (location.hash.replace(/^#/, "") + "&" + location.search.replace(/^\?/, "")).split("&").filter(Boolean);
    for (const p of all) {
      if (p.startsWith("d=")) { try { localStorage.setItem(DATA_KEY, decodeURIComponent(p.slice(2))); } catch (e) {} }
      else if (p.startsWith("k=") || p.startsWith("b=")) savePushParams("#" + p);
    }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }
  function dataPath() { try { return localStorage.getItem(DATA_KEY) || ""; } catch (e) { return ""; } }
  function pageBase() {
    let path = location.pathname || "/";
    if (!path.endsWith("/")) { const last = path.split("/").pop() || ""; path = last.includes(".") ? path.slice(0, path.lastIndexOf("/") + 1) : path + "/"; }
    return new URL(path, location.origin);
  }
  function dataUrl(f) { return new URL("d/" + dataPath() + "/" + f + "?t=" + Math.floor(Date.now() / 5000), pageBase()).href; }

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

  /* ---------- format ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function money(v, d) { if (v == null || !isFinite(v)) return "$—"; const n = Number(v); const dd = d != null ? d : (Math.abs(n) >= 1000 ? 0 : 2); return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dd, maximumFractionDigits: dd }); }
  function signedMoney(v) { if (v == null || !isFinite(v)) return "—"; return (v >= 0 ? "+" : "-") + money(Math.abs(v)).replace("$", "$"); }
  function pct(v) { if (v == null || !isFinite(v)) return "—"; return (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%"; }
  function cls(v) { return v > 0 ? "pos" : v < 0 ? "neg" : ""; }
  function price(v) { if (v == null || !isFinite(v)) return "—"; const n = Number(v); if (n >= 1) return "$" + n.toFixed(4); const s = n.toPrecision(3); return "$" + (Number(s) < 1e-4 ? Number(s).toExponential(2) : s); }
  function hhmm(iso) { if (!iso) return ""; try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }); } catch (e) { return ""; } }
  function ago(iso) { const t = Date.parse(iso || ""); if (!isFinite(t)) return ""; const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return Math.round(s) + "s geleden"; if (s < 3600) return Math.round(s / 60) + " min geleden"; if (s < 86400) return Math.round(s / 3600) + " u geleden"; return Math.round(s / 86400) + " d geleden"; }
  function short(m) { return m ? m.slice(0, 4) + "…" + m.slice(-4) : ""; }

  /* ---------- render ---------- */
  function renderHome() {
    $("balance").textContent = money(snap.balance);
    const ch = $("change24"); ch.className = "change " + cls(snap.change24h);
    ch.textContent = signedMoney(snap.change24h) + " (" + pct(snap.change24h_pct) + ") · 24u";
    $("tracked-line").textContent = snap.tracked + " van " + snap.top_n + " gevolgd · 30D";
    $("trader-cards").innerHTML = (snap.leaders || []).slice(0, 12).map((l) =>
      '<div class="tcard"><div class="rk">#' + l.rank + '</div><div class="h">' + esc(l.handle) + '</div>' +
      '<div class="p">' + money(l.pnl_30d_usd, 0) + '</div><div class="muted tiny">30D PnL · ' + (l.trades || 0) + ' kopieën</div>' +
      (l.tracked ? '<span class="tag tag-on">' + (l.verified ? "gevolgd" : "gevolgd · niet geverifieerd") + '</span>' : '<span class="tag tag-off">geen wallet</span>') +
      '</div>').join("");
    const list = $("home-list");
    if (homeSeg === "open") {
      const o = snap.open || [];
      list.innerHTML = o.length ? o.map((p) => posRow(p, true)).join("") : '<div class="empty">Nog geen open kopieën. Zodra een gevolgde trader koopt, kopieert de desk ~' + snap.delay_s + 's later.</div>';
    } else if (homeSeg === "closed") {
      const c = snap.closed || [];
      list.innerHTML = c.length ? c.map((p) => posRow(p, false)).join("") : '<div class="empty">Nog geen gesloten trades in deze demo.</div>';
    } else {
      list.innerHTML = (snap.leaders || []).map((l) =>
        '<div class="row"><div class="main"><div class="t">#' + l.rank + " " + esc(l.handle) + '</div><div class="s">' +
        (l.tracked ? "wallet " + esc(l.wallet) + (l.verified ? " · geverifieerd" : " · niet geverifieerd") : esc(l.why_not || "geen wallet")) +
        '</div></div><div class="r pos">' + money(l.pnl_30d_usd, 0) + "</div></div>").join("");
    }
  }
  function posRow(p, open) {
    const v = open ? p.pct : p.pct;
    const right = open ? '<div class="r ' + cls(v) + '">' + pct(v) + '</div>' : '<div class="r ' + cls(p.pnl) + '">' + signedMoney(p.pnl) + '<div class="s">' + pct(p.pct) + "</div></div>";
    const sub = open ? "kopie van " + esc(p.leader) + " · " + money(p.size_usd) + (p.tp1_done ? " · 50% al verkocht" : "") : esc(p.reason || "") + " · " + esc(p.leader) + " · " + hhmm(p.closed);
    return '<div class="row click" data-pos="' + p.id + '"><div class="main"><div class="t">' + esc(p.symbol || short(p.mint)) + '</div><div class="s">' + sub + "</div></div>" + right + "</div>";
  }
  function rangeMs(r) { return { LIVE: 30 * 60e3, "1H": 3600e3, "4H": 4 * 3600e3, "1D": 86400e3, "1W": 7 * 86400e3, "1M": 30 * 86400e3 }[r] || Infinity; }
  function renderChart() {
    const svg = $("chart"); const W = 360, H = 160;
    const now = Date.now(), span = rangeMs(range);
    let pts = (snap.equity || []).map((p) => ({ t: Date.parse(p.t), v: p.v })).filter((p) => isFinite(p.t) && (span === Infinity || p.t >= now - span));
    if (pts.length < 2) { const last = (snap.equity || []).slice(-1)[0]; const v = last ? last.v : snap.balance; pts = [{ t: now - Math.min(span, 3600e3), v: v }, { t: now, v: snap.balance }]; }
    const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
    let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)); if (hi - lo < 0.01) { hi += 0.5; lo -= 0.5; }
    const xy = pts.map((p) => [((p.t - t0) / (t1 - t0)) * W, H - 8 - ((p.v - lo) / (hi - lo)) * (H - 16)]);
    const up = pts[pts.length - 1].v >= pts[0].v; const col = up ? "#22c55e" : "#ef4444";
    const line = xy.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
    svg.innerHTML = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".28"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + line + " L" + W + " " + H + " L0 " + H + ' Z" fill="url(#g)"/><path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.2" vector-effect="non-scaling-stroke"/>';
    const d = pts[pts.length - 1].v - pts[0].v;
    $("live-balance").textContent = money(snap.balance);
    const lc = $("live-change"); lc.className = "change " + cls(d); lc.textContent = signedMoney(d) + " · " + (range === "ALL" ? "All" : range);
  }
  function renderLive() {
    $("live-copying").textContent = "copying " + snap.tracked + " trader" + (snap.tracked === 1 ? "" : "s") + " • " + snap.delay_s + "s behind";
    $("live-updated").textContent = "bijgewerkt " + ago(snap.updatedAt) + " · top " + snap.top_n + " FOMO 30D";
    renderChart();
    const a = snap.agents || {};
    $("agent-pills").innerHTML = [["watcher", "Watcher"], ["copier", "Copier"], ["executor", "Executor"], ["risk", "Risk"]].map((k, i) =>
      (i ? '<span class="sep">·</span>' : "") + '<span class="pill ' + ((a[k[0]] || {}).ok ? "ok" : "bad") + '"><i></i>' + k[1] + "</span>").join("");
    const w = snap.watch || [];
    $("copy-grid").innerHTML = w.length ? w.slice(0, 8).map((e) =>
      '<div class="gcell"><div class="h">' + esc(e.leader) + '</div><div class="a ' + (e.value === "buy" ? "pos" : "neg") + '">' + (e.value === "buy" ? "KOOP " : "VERKOOP ") + esc(e.symbol || short(e.mint)) + '</div><div class="tm">' + hhmm(e.ts) + " · " + esc(e.text.split(" ").slice(-2).join(" ")) + "</div></div>").join("")
      : '<div class="empty" style="grid-column:1/-1">Nog geen trader-acties gezien. De Watcher kijkt naar ' + snap.tracked + " wallet" + (snap.tracked === 1 ? "" : "s") + ".</div>";
    const ev = (snap.events || []).filter((e) => e.kind !== "watch" && (feedFilter === "all" || e.kind === feedFilter));
    $("feed").innerHTML = ev.length ? ev.slice(0, 40).map((e) =>
      '<div class="row"><span class="feed-kind k-' + esc(e.kind) + '">' + esc(e.kind.toUpperCase()) + '</span><div class="main"><div class="t" style="white-space:normal">' + esc(e.text) + '</div><div class="s">' + hhmm(e.ts) + (e.leader ? " · " + esc(e.leader) : "") + "</div></div></div>").join("")
      : '<div class="empty">Nog niets in deze lijst.</div>';
  }
  function rulesLine() { const r = snap.rules || {}; return "stop −" + r.stop_pct + "% • TP 50% @+" + r.tp1_pct + "% • rest @+" + r.tp2_pct + "% • same exits"; }
  function openPos(id) {
    const p = (snap.open || []).concat(snap.closed || []).find((x) => String(x.id) === String(id)); if (!p) return;
    const isOpen = (snap.open || []).some((x) => x.id === p.id);
    $("pos-title").textContent = (p.symbol || short(p.mint)) + " · kopie van " + p.leader;
    const since = isOpen ? p.pct : p.pct;
    $("pos-body").innerHTML =
      '<div class="muted small">' + (isOpen ? "Sinds gekopieerd" : "Resultaat") + '</div><div class="big-pct ' + cls(since) + '">' + pct(since) + "</div>" +
      '<div class="cmp"><div class="card"><div class="lbl">Entry ' + esc(p.leader) + '</div><div class="val">' + price(p.leader_entry_usd) + '</div></div><div class="card"><div class="lbl">Onze entry</div><div class="val">' + price(p.entry_usd) + "</div></div></div>" +
      '<div class="card"><h3>Position</h3>' +
      '<div class="kv"><span>Inzet</span><b>' + money(p.size_usd) + "</b></div>" +
      (isOpen ? '<div class="kv"><span>Waarde nu</span><b>' + money(p.value) + '</b></div><div class="kv"><span>Prijs nu</span><b>' + price(p.price) + '</b></div><div class="kv"><span>Nog in bezit</span><b>' + Math.round((p.remaining || 0) * 100) + '%</b></div><div class="kv"><span>Gekopieerd</span><b>' + hhmm(p.opened) + (p.lag_s != null ? " · " + p.lag_s + "s na trader" : "") + "</b></div>"
        : '<div class="kv"><span>PnL</span><b class="' + cls(p.pnl) + '">' + signedMoney(p.pnl) + '</b></div><div class="kv"><span>Exit</span><b>' + esc(p.reason || "") + '</b></div><div class="kv"><span>Open → dicht</span><b>' + hhmm(p.opened) + " → " + hhmm(p.closed) + "</b></div>") +
      '<div class="kv"><span>Munt</span><b>' + esc(short(p.mint)) + "</b></div></div>" +
      '<div class="card"><h3>Risk</h3><div>' + esc(rulesLine()) + '</div><div class="muted small" style="margin-top:6px">Demo (paper). Kosten (FOMO-fee + slippage) zijn al meegerekend.</div></div>';
    $("pos-modal").classList.remove("hidden");
  }
  function renderSummary() {
    const s = (snap.summary || {})[sumSeg] || {};
    const best = s.best ? esc(s.best.symbol || "") + " (" + esc(s.best.leader) + ") " + signedMoney(s.best.pnl) : "—";
    const ex = s.exits || {}; const exTxt = Object.keys(ex).length ? Object.keys(ex).map((k) => esc(k) + " " + ex[k]).join(" · ") : "—";
    $("sum-body").innerHTML = '<div class="card"><div class="muted small">Resultaat</div><div class="big-pct ' + cls(s.pnl) + '">' + signedMoney(s.pnl || 0) + "</div>" +
      '<div class="kv"><span>Trades gesloten</span><b>' + (s.trades || 0) + '</b></div><div class="kv"><span>Winst / verlies</span><b>' + (s.wins || 0) + " / " + (s.losses || 0) + '</b></div><div class="kv"><span>Beste trade</span><b>' + best + '</b></div><div class="kv"><span>Exits</span><b>' + exTxt + '</b></div><div class="kv"><span>Demo-saldo nu</span><b>' + money(snap.balance) + '</b></div><div class="kv"><span>Gestart met</span><b>' + money((snap.book || {}).start_usd) + "</b></div></div>" +
      '<p class="muted tiny">SIM · demo. Nieuwe demo met $100? Stuur in Telegram: demo reset</p>';
  }
  function renderAll() { if (!snap) return; renderHome(); renderLive(); if (!$("sum-modal").classList.contains("hidden")) renderSummary(); }

  /* ---------- navigation ---------- */
  function setTab(t) {
    ["home", "live", "koppel"].forEach((k) => $("tab-" + k).classList.toggle("hidden", k !== t));
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === t));
    window.scrollTo(0, 0);
  }
  function wire() {
    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.getAttribute("data-tab"))));
    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => setTab(b.getAttribute("data-go"))));
    $("btn-koppel").addEventListener("click", () => setTab("koppel"));
    $("btn-summary").addEventListener("click", () => { $("sum-modal").classList.remove("hidden"); renderSummary(); });
    document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal").classList.add("hidden")));
    document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (ev) => { if (ev.target === m) m.classList.add("hidden"); }));
    $("ranges").addEventListener("click", (ev) => { const b = ev.target.closest("[data-r]"); if (!b) return; range = b.getAttribute("data-r"); $("ranges").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); if (snap) renderChart(); });
    $("feed-seg").addEventListener("click", (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; feedFilter = b.getAttribute("data-f"); $("feed-seg").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); if (snap) renderLive(); });
    $("home-seg").addEventListener("click", (ev) => { const b = ev.target.closest("[data-seg]"); if (!b) return; homeSeg = b.getAttribute("data-seg"); $("home-seg").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); if (snap) renderHome(); });
    $("sum-seg").addEventListener("click", (ev) => { const b = ev.target.closest("[data-s]"); if (!b) return; sumSeg = b.getAttribute("data-s"); $("sum-seg").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); if (snap) renderSummary(); });
    $("home-list").addEventListener("click", (ev) => { const r = ev.target.closest("[data-pos]"); if (r) openPos(r.getAttribute("data-pos")); });
    $("start-demo").addEventListener("click", () => { try { localStorage.setItem(START_KEY, "1"); } catch (e) {} $("start").classList.add("hidden"); setTab("home"); });
    $("start-koppel").addEventListener("click", () => { try { localStorage.setItem(START_KEY, "1"); } catch (e) {} $("start").classList.add("hidden"); setTab("koppel"); });
    $("login-save").addEventListener("click", () => { const d = extractDataPath($("login-link").value); if (!d) return; try { localStorage.setItem(DATA_KEY, d); } catch (e) {} $("login-panel").classList.add("hidden"); refresh(); });
  }

  /* ---------- load ---------- */
  async function refresh() {
    if (!dataPath()) { $("login-panel").classList.remove("hidden"); return; }
    try {
      const r = await fetch(dataUrl("app.json"), { cache: "no-store" });
      if (!r.ok) throw new Error("http " + r.status);
      snap = await r.json();
      const age = (Date.now() - Date.parse(snap.updatedAt || "")) / 1000;
      const b = $("error");
      if (isFinite(age) && age > 15 * 60) { b.textContent = "Gegevens zijn " + Math.round(age / 60) + " min oud. De desk wordt herstart door de watchdog."; b.classList.remove("hidden"); } else b.classList.add("hidden");
      renderAll();
    } catch (e) {
      const b = $("error"); b.textContent = "Kon de demo-gegevens niet laden (" + e.message + "). Opnieuw over 10s."; b.classList.remove("hidden");
    }
  }

  captureFromHash();
  wire();
  wirePush();
  let started = false; try { started = localStorage.getItem(START_KEY) === "1"; } catch (e) {}
  if (!started) $("start").classList.remove("hidden");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js?v=20", pageBase()).href, { updateViaCache: "none" }).then((reg) => { reg.update().catch(() => {}); }).catch(() => {});
    let reloaded = false; const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloaded || !had) return; reloaded = true; location.reload(); });
  }
  refresh();
  setInterval(refresh, 10000);
})();
