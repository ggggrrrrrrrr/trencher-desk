(function () {
  "use strict";
  const DATA_KEY = "desk_data_path", START_KEY = "cd_demo_started", TZ = "Europe/Amsterdam";
  const DEX = "https://api.dexscreener.com/tokens/v1/solana/";
  const WSOL = "So11111111111111111111111111111111111111112";
  const MAJORS = [WSOL, "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"];
  const $ = (id) => document.getElementById(id);
  const HC = {};
  function setH(id) { return HC[id] || (HC[id] = { set v(html) { const el = $(id); if (el && el._h !== html) { el.innerHTML = html; el._h = html; } } }); }
  /* v39: two books. RAW = app.json; S = the book on screen (ECHT GELD = Phantom wallet, SIM = demo). */
  const BOOK_KEY = "cd_book"; let RAW = null;
  function book() { let b = ""; try { b = localStorage.getItem(BOOK_KEY) || ""; } catch (e) {} return b === "sim" ? "sim" : "live"; }
  function isLive() { return book() === "live" && !!(RAW && RAW.live_book); }
  const MOVE_KEY = "desk_demo_move";
  function pendMove() { try { const p = JSON.parse(localStorage.getItem(MOVE_KEY) || "null"); if (!p) return null; if (Date.now() - p.t > 6 * 60e3) { localStorage.removeItem(MOVE_KEY); return null; } return p; } catch (e) { return null; } }
  function withMove(j) {  // demo Storten/Opnemen sent via Telegram: show it at once until the desk snapshot has it
    const p = pendMove(); if (!p || !j || !j.book) return j;
    if (Math.abs(Number(j.book.start_usd) - p.base) > 0.005) { try { localStorage.removeItem(MOVE_KEY); } catch (e) {} return j; }
    return Object.assign({}, j, { balance: Number(j.balance) + p.d, cash: Math.max(0, Number(j.cash) + p.d), book: Object.assign({}, j.book, { start_usd: p.base + p.d }), move_pending: p.d });
  }
  /* v46: direct app actions via the desk tunnel with the separate app key (never APP_TOKEN; nothing in static files). */
  const APPKEY_KEY = "desk_app_key", DEMO_PEND_KEY = "desk_demo_pend";
  function savePair(v) { let k = ""; try { k = decodeURIComponent(v || ""); } catch (e) { k = v || ""; } if (!/^[A-Za-z0-9_-]{32,128}$/.test(k)) return false; try { localStorage.setItem(APPKEY_KEY, k); } catch (e) { return false; } savePair.just = true; return true; }
  function appKey() { try { return localStorage.getItem(APPKEY_KEY) || ""; } catch (e) { return ""; } }
  function actUrl() { const u = RAW && RAW.action_url; return typeof u === "string" && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(u) ? u : ""; }
  function canAct() { return !!(appKey() && actUrl()); }
  async function act(path, body, ms) {
    const ctl = "AbortController" in window ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), ms || 20000) : 0;
    try {
      const r = await fetch(actUrl() + path, { method: "POST", mode: "cors", cache: "no-store", headers: { "Content-Type": "application/json", "X-App-Key": appKey() }, body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (r.status === 401) { try { localStorage.removeItem(APPKEY_KEY); } catch (e) {} renderAppKey(); return { ok: false, status: 401, why: "App-sleutel ongeldig of ingetrokken. Stuur 'app koppel' in Telegram." }; }
      if (!r.ok) return { ok: false, status: r.status, why: (j && j.detail) || ("fout " + r.status) };
      return { ok: true, data: j || {} };
    } catch (e) { return { ok: false, status: 0, net: true, why: e.name === "AbortError" ? "geen antwoord van de desk (timeout)" : "desk niet bereikbaar" }; }
    finally { clearTimeout(to); }
  }
  function demoPend() { try { const p = JSON.parse(localStorage.getItem(DEMO_PEND_KEY) || "null"); if (!p || Date.now() - p.t > 4 * 60e3) return null; return p; } catch (e) { return null; } }
  function demoOn() { const snap = !!(RAW && RAW.demo_enabled), p = demoPend(); if (p && p.on !== snap) return p.on; if (p) { try { localStorage.removeItem(DEMO_PEND_KEY); } catch (e) {} } return snap; }
  function renderAppKey() {
    const st = $("ak-state"); if (!st) return; const k = !!appKey(), u = !!actUrl();
    st.textContent = k ? (u ? "Gekoppeld · acties gaan direct" : "Gekoppeld · desk-tunnel nu niet bereikbaar (valt terug op Telegram)") : "Niet gekoppeld · acties via Telegram";
    st.className = k && u ? "k-on" : "k-on warn"; const f = $("ak-forget"); if (f) f.classList.toggle("hidden", !k);
  }
  function viewOf(j) { if (!j) return j; if (book() !== "live" || !j.live_book) return withMove(j); const L = j.live_book; return Object.assign({}, j, L, { sim: false, live: true, tracked: j.tracked, top_n: j.top_n, public_n: j.public_n, leaders: j.leaders, watch: j.watch, last_watch: j.last_watch, tokens: j.tokens, agents: j.agents, delay_s: j.delay_s, pending: j.pending }); }
  function setBook(b) { try { localStorage.setItem(BOOK_KEY, b); } catch (e) {} if (RAW) { S = viewOf(RAW); } renderBookUI(); renderAll(); }
  const SOLSCAN = "https://solscan.io/tx/";
  function txLink(sig, lab) { return sig ? '<a class="tx" href="' + SOLSCAN + encodeURIComponent(sig) + '" target="_blank" rel="noopener">' + esc(lab || "tx ↗") + "</a>" : ""; }
  function renderBookUI() {
    const live = isLive();
    document.querySelectorAll("#booksw [data-b]").forEach((x) => x.classList.toggle("on", x.getAttribute("data-b") === (live ? "live" : "sim")));
    for (const id of ["h-mode", "l-mode"]) { const el = $(id); if (el) { el.textContent = live ? "ECHT GELD" : "SIM"; el.className = "modetag" + (live ? " real" : ""); } }
    document.title = live ? "Trencher · ECHT GELD" : "Trencher · demo";
    const w = $("h-wal"); if (w) { const L = RAW && RAW.live_book && RAW.live_book.wallet; w.textContent = live && L ? "Phantom " + short(L.address) + " · " + (num(L.sol) != null ? Number(L.sol).toFixed(4) + " SOL" : "") + (num(L.usdc) ? " + " + Number(L.usdc).toFixed(2) + " USDC" : "") + (L.positions_usd ? " + " + money(L.positions_usd) + " in posities" : "") : ""; }
  }
  let S = null, range = "LIVE", feedF = "all", homeTab = "tokens", chip = "trending", screen = "home", openPosId = null, prevScreen = "home", acRange = "24h", acOC = "open", acPF = "all";

  /* ---------- login link ---------- */
  function extractDataPath(raw) { const s = String(raw || "").trim(); const m = s.match(/(?:^|[?#&])d=([^&#\s]+)/); if (m && m[1]) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } } return /^[A-Za-z0-9_-]{32,}$/.test(s) ? s : ""; }
  function captureFromHash() {
    const all = (location.hash.replace(/^#/, "") + "&" + location.search.replace(/^\?/, "")).split("&").filter(Boolean);
    for (const p of all) { if (p.startsWith("d=")) { try { localStorage.setItem(DATA_KEY, decodeURIComponent(p.slice(2))); } catch (e) {} } else if (p.startsWith("k=") || p.startsWith("b=")) savePushParams("#" + p); else if (p.startsWith("pair=")) savePair(p.slice(5)); }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }
  function dataPath() { try { return localStorage.getItem(DATA_KEY) || ""; } catch (e) { return ""; } }
  function pageBase() { let p = location.pathname || "/"; if (!p.endsWith("/")) { const l = p.split("/").pop() || ""; p = l.includes(".") ? p.slice(0, p.lastIndexOf("/") + 1) : p + "/"; } return new URL(p, location.origin); }
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
    if (!pushSupported()) { pushStatus(/iPhone|iPad/.test(navigator.userAgent) ? "Zet de app eerst op je beginscherm (Deel → Zet op beginscherm), iOS 16.4+." : "Deze browser ondersteunt geen web push."); keyRow.classList.add("hidden"); return; }
    keyRow.classList.toggle("hidden", !!pushKey());
    if (!pushKey()) { pushStatus("Stuur /meldingen naar de desk-bot in Telegram en plak de link hieronder."); return; }
    if (Notification.permission === "denied") { pushStatus("Meldingen zijn geblokkeerd in Instellingen → Meldingen.", "neg"); return; }
    try { const c = localStorage.getItem("desk_push_code"); if (c && Notification.permission === "granted") { pushStatus("Aan op dit toestel. Code nog niet verstuurd? Tik nogmaals om hem te kopiëren.", "pos"); return; } } catch (e) {}
    pushStatus("Tik op Meldingen aan: je krijgt een melding bij elke winst (PAPER).");
  }
  async function onPushTap() {
    if (!pushSupported()) { renderPush(); toast("Meldingen niet beschikbaar", /iPhone|iPad/.test(navigator.userAgent) ? "Zet de app op je beginscherm (iOS 16.4+)." : "Deze browser ondersteunt geen web push."); return; }
    const key = pushKey(); if (!key) { renderPush(); const i = $("push-key-input"); if (i) i.focus(); toast("Eerst de meldingen-link", "Stuur /meldingen naar de desk-bot in Telegram en plak de link hier."); return; }
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
  const num = (v) => (v == null || v === "" || !isFinite(Number(v))) ? null : Number(v);
  /* v49 (Job, Nov 23 23:25 "Doe in euros"): desk math stays USD; display converts with app.json fx.usd_per_eur (ECB, cached). */
  let FX = 1.09;
  const eur = (v) => v / (FX > 0 ? FX : 1.09);
  function money(v, d) { v = num(v); if (v == null) return "€—"; v = eur(v); const dd = d != null ? d : 2; return (v < 0 ? "-€" : "€") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dd, maximumFractionDigits: dd }); }
  function txtEur(t) { return String(t == null ? "" : t).replace(/([+\-−]?)\$([+\-]?)(\d[\d,]*(?:\.\d+)?)([kKMB]?)/g, (m, sg, sg2, n, k) => { const x = eur(Number(n.replace(/,/g, ""))); const dec = (n.split(".")[1] || "").length; return sg + sg2 + "€" + (dec ? x.toFixed(dec) : (k ? x.toFixed(1) : Math.round(x).toLocaleString("en-US"))) + k; }); }
  function sMoney(v) { v = num(v); if (v == null) return "—"; return (v >= 0 ? "+" : "-") + money(Math.abs(v)); }
  function pct(v, d) { v = num(v); if (v == null) return "—"; return (v >= 0 ? "+" : "") + v.toFixed(d == null ? 1 : d) + "%"; }
  function cls(v) { v = num(v); return v == null || v === 0 ? "" : v > 0 ? "g" : "r"; }
  function big(v) { v = num(v); if (v == null) return '€—<span class="dec">.——</span>'; const s = money(v); const i = s.lastIndexOf("."); return esc(s.slice(0, i)) + '<span class="dec">' + esc(s.slice(i)) + "</span>"; }
  function kfmt(v) { v = num(v); if (v == null) return "—"; v = eur(v); const a = Math.abs(v); if (a >= 1e9) return "€" + (v / 1e9).toFixed(2) + "B"; if (a >= 1e6) return "€" + (v / 1e6).toFixed(2) + "M"; if (a >= 1e3) return "€" + (v / 1e3).toFixed(1) + "K"; return "€" + v.toFixed(0); }
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  function price(v) { v = num(v); if (v == null || v <= 0) return "€—"; v = eur(v); if (v >= 1) return "€" + v.toFixed(v >= 100 ? 2 : 4); const s = v.toFixed(20); const m = s.match(/^0\.(0*)(\d{4})/); if (!m) return "€" + v.toPrecision(4); const z = m[1].length; if (z < 3) return "€" + v.toFixed(z + 4); return "€0.0" + String(z).split("").map((c) => SUB[+c]).join("") + m[2]; }
  function hhmm(iso) { const t = Date.parse(iso || ""); if (!isFinite(t)) return ""; return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }); }
  function ago(iso) { const t = Date.parse(iso || ""); if (!isFinite(t)) return ""; const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; }
  const short = (m) => m ? m.slice(0, 4) + "…" + m.slice(-4) : "";
  function hue(s) { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
  function av(handle, extra) { const h = hue(handle); return '<span class="av ' + (extra || "") + '" style="background:linear-gradient(135deg,hsl(' + h + ',70%,55%),hsl(' + ((h + 50) % 360) + ',70%,38%))">' + esc(String(handle || "?").replace(/^@/, "").slice(0, 1)) + "</span>"; }
  /* token icons/prices from DexScreener (public, free) */
  const TOK = {};
  function tokIcon(mint, sym) { const t = TOK[mint]; const img = t && t.img; const h = hue(mint); if (img) return '<img class="ti" src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'; return '<span class="ti" style="background:hsl(' + h + ',45%,26%);color:hsl(' + h + ',80%,80%)">' + esc(String(sym || (t && t.sym) || "?").slice(0, 3)) + "</span>"; }
  async function loadTokens(mints) {
    const need = mints.filter((m) => m && (!TOK[m] || Date.now() - TOK[m].at > 30000));
    await Promise.all(Array.from({ length: Math.ceil(need.length / 30) }, (_, k) => k * 30).map(async (i) => {
      try {
        const r = await fetch(DEX + need.slice(i, i + 30).join(","), { cache: "no-store" }); if (!r.ok) return;
        const arr = await r.json(); const best = {};
        for (const p of arr || []) { const a = p && p.baseToken && p.baseToken.address; if (!a) continue; const l = (p.liquidity && p.liquidity.usd) || 0; if (!best[a] || l > best[a].l) best[a] = { p: p, l: l }; }
        for (const a in best) { const p = best[a].p; TOK[a] = { at: Date.now(), sym: p.baseToken.symbol, name: p.baseToken.name, price: num(p.priceUsd), mc: num(p.marketCap) || num(p.fdv), ch: p.priceChange ? num(p.priceChange.h24) : null, img: (p.info && p.info.imageUrl) || null, dex: p.dexId, pool: p.pairAddress }; }
        for (const m of need.slice(i, i + 30)) if (!TOK[m]) TOK[m] = { at: Date.now(), none: true };
      } catch (e) {}
    }));
    return need.length;
  }
  let trending = [], graduated = [], extAt = 0;
  async function loadExternal() {
    if (Date.now() - extAt < 60000) return; extAt = Date.now();
    await Promise.all([
      (async () => { try { const r = await fetch("https://api.dexscreener.com/token-boosts/top/v1", { cache: "no-store" }); const a = await r.json(); trending = (a || []).filter((x) => x.chainId === "solana").map((x) => x.tokenAddress).filter((v, i, s) => s.indexOf(v) === i).slice(0, 12); } catch (e) {} })(),
      (async () => { try { const r = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", { cache: "no-store" }); const a = await r.json(); graduated = (a || []).filter((x) => x.chainId === "solana" && /pump$/.test(x.tokenAddress || "")).map((x) => x.tokenAddress).slice(0, 24); } catch (e) {} })(),
    ]);
  }

  /* ---------- HOME ---------- */
  function dly() { const d = Number(S && S.delay_s); return isFinite(d) && d > 0 ? Math.round(d) : 0; }
  function dlyShort() { return dly() ? dly() + "s" : "direct"; }
  function behind() { return dly() ? dly() + "s behind" : "direct"; }
  function leaders() { return (S && S.leaders) || []; }
  function isPub(l) { return l && l.group === "public"; }
  function pnl30(l) { return isPub(l) ? "◎" + Math.round(l.pnl_30d_sol || 0) + " SOL" : kfmt(l.pnl_30d_usd); }
  function rankLbl(l) { return isPub(l) ? "publiek #" + l.pub_rank : "#" + l.rank; }
  function fomoTracked() { return leaders().filter((l) => !isPub(l) && l.tracked).length; }
  function renderHome() {
    const started = isStarted() || isLive();
    $("h-dep-pill").classList.toggle("hidden", started); $("h-btns").classList.toggle("hidden", !started || isLive());
    const st = S.leader_stats || {};
    setH("h-traders").v = leaders().filter((l) => l.tracked).concat(leaders().filter((l) => !l.tracked)).map((l) => '<button type="button" class="tc' + (l.tracked ? "" : " off") + '" data-tr="' + esc(l.handle) + '"><div class="n">' + av(l.handle) + esc(l.handle) + '</div><div class="st"><b>' + pnl30(l) + "</b> 30D" + (isPub(l) ? " · publiek" : "") + " · <b>" + ((st[l.handle] || {}).copies || 0) + "</b> " + (l.tracked ? "trades" : "· geen wallet") + "</div></button>").join("");
    renderTokenList();
  }
  function tokenMints() {
    if (homeTab === "watch") return (S.tokens || []).map((t) => t.mint);
    if (chip === "crypto") return MAJORS;
    if (chip === "trending") return trending;
    if (chip === "held") return (S.tokens || []).filter((t) => t.src !== "traders").map((t) => t.mint);
    return graduated;
  }
  function renderTokenList() {
    $("h-chips").classList.toggle("hidden", homeTab !== "tokens");
    const box = $("h-list");
    if (homeTab === "perps") { box.innerHTML = '<div class="empty">Perps zitten niet in deze demo. De copy desk kopieert alleen spot-kopen van de gevolgde traders.</div>'; return; }
    let mints = tokenMints();
    if (chip === "grad" && homeTab === "tokens") mints = mints.filter((m) => TOK[m] && TOK[m].dex === "pumpswap").slice(0, 10);
    const rows = mints.filter((m) => TOK[m] && !TOK[m].none);
    if (!rows.length) {
      const why = homeTab === "watch" ? "Nog geen munten: zodra een gevolgde trader iets koopt of verkoopt, staat het hier." : chip === "held" ? "De demo heeft nog geen munten gekocht." : "Laden…";
      box.innerHTML = '<div class="empty">' + why + "</div>"; return;
    }
    box.innerHTML = rows.map((m) => { const t = TOK[m]; const c = t.ch; return '<div class="tr" data-mint="' + esc(m) + '">' + tokIcon(m) + '<div class="nm"><b>' + esc(t.sym || short(m)) + "</b><span>" + (t.mc ? kfmt(t.mc) + " MC" : esc(t.name || "")) + '</span></div><div class="px"><b class="' + (c > 0 ? "g" : c < 0 ? "r" : "") + '">' + price(t.price) + '</b><span class="' + (c >= 0 ? "g" : "r") + '">' + (c == null ? "" : (c >= 0 ? "▲" : "▼") + Math.abs(c).toFixed(2) + "%") + "</span></div></div>"; }).join("");
  }
  /* ---------- activity rows ---------- */
  function symOf(a) { const t = TOK[a.mint]; return (a.symbol && !/…$/.test(a.symbol) ? a.symbol : null) || (t && t.sym) || short(a.mint) || "—"; }
  function actKey(a) { return (a.ts || "") + "|" + a.kind + "|" + (a.mint || "") + "|" + (a.pos || "") + "|" + (a.reason || ""); }
  const SEEN = { set: new Set(), primed: {} };
  function actRow(a, feedId) {
    const sym = symOf(a); let title, sub, right;
    const k = actKey(a), fresh = feedId && SEEN.primed[feedId] && !SEEN.set.has(k); if (feedId) SEEN.set.add(k);
    const nw = fresh ? " new" : "";
    if (a.kind === "copies") {
      title = "Bought " + esc(sym); sub = "Executor · " + (a.lag != null ? a.lag + "s after " : "after ") + esc(a.leader) + " · " + hhmm(a.ts) + (a.tx ? " · " + txLink(a.tx) : "");
      right = "<b>" + money(a.size) + "</b><span>" + (a.mcap ? kfmt(a.mcap) + " MC" : "") + "</span>";
    } else if (a.kind === "exits") {
      const r = String(a.reason || ""); const tp = /^TP/.test(r), stop = /^stop/.test(r);
      title = "Sold " + esc(sym);
      sub = "Executor · " + (tp ? "take profit " + esc((r.match(/\+\d+%/) || [""])[0]) : stop ? "stop −" + ((S && S.rules && S.rules.stop_pct) || 15) + "%" : esc(a.leader) + " sold · same exit") + " · " + hhmm(a.ts) + (a.tx ? " · " + txLink(a.tx) : "");
      right = '<b class="' + cls(a.gain) + '">' + sMoney(a.gain) + '</b><span class="' + cls(a.pct) + '">' + pct(a.pct) + "</span>";
    } else {
      title = esc(txtEur(a.text)); sub = "Risk · " + (a.leader ? esc(a.leader) + " · " : "") + (a.symbol ? esc(a.symbol) + " · " : "") + hhmm(a.ts); right = "";
      return '<div class="fr rule' + nw + '"' + (a.mint ? ' data-mint="' + esc(a.mint) + '"' : "") + '><div class="ic"><span class="ti" style="background:#2a1d08;color:#ff9f0a">R</span></div><div class="m"><b style="white-space:normal">' + title + "</b><span>" + sub + '</span></div><div class="v">' + right + "</div></div>";
    }
    return '<div class="fr' + nw + '" data-pos="' + esc(a.pos || "") + '"><div class="ic">' + tokIcon(a.mint, sym) + av(a.leader) + '</div><div class="m"><b>' + title + "</b><span>" + sub + '</span></div><div class="v num">' + right + "</div></div>";
  }
  function feedHtml(list, f, feedId) { const rows = (list || []).filter((a) => f === "all" || a.kind === f); const out = rows.length ? rows.map((a) => actRow(a, feedId)).join("") : ""; if (feedId) SEEN.primed[feedId] = true; return rows.length ? out : '<div class="empty">' + (f === "all" ? "Waiting for the first copy… De desk kijkt naar " + S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + "." : "Nog niets in deze lijst.") + "</div>"; }
  function tonightIso() { const d = new Date(new Date().toLocaleString("en-US", { timeZone: TZ })); d.setHours(0, 0, 0, 0); return d; }
  function copiesTonight() { const t0 = tonightIso().getTime(); return (S.activity || []).filter((a) => a.kind === "copies" && Date.parse(a.ts) >= t0).length; }

  /* ---------- LIVE ---------- */
  function rangeMs(r) { return { LIVE: 30 * 60e3, "1H": 3600e3, "4H": 4 * 3600e3, "1D": 86400e3, "1W": 7 * 86400e3 }[r] || Infinity; }
  function renderLiveChart() {
    const svg = $("l-chart"), W = 390, H = 190, now = Date.now(), span = rangeMs(range);
    let pts = (S.equity || []).map((p) => ({ t: Date.parse(p.t), v: p.v })).filter((p) => isFinite(p.t));
    if (span !== Infinity) { const inR = pts.filter((p) => p.t >= now - span); const before = pts.filter((p) => p.t < now - span).slice(-1); pts = before.map((p) => ({ t: now - span, v: p.v })).concat(inR); }
    pts.push({ t: now, v: S.balance });
    if (pts.length < 2) pts.unshift({ t: now - 60e3, v: S.balance });
    const t0 = pts[0].t, t1 = Math.max(now, t0 + 1); let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
    const pad = Math.max((hi - lo) * 0.25, 0.5); lo -= pad; hi += pad;
    const X = (t) => 14 + ((t - t0) / (t1 - t0)) * (W - 28), Y = (v) => 16 + (1 - (v - lo) / (hi - lo)) * (H - 40);
    const d = pts.map((p, i) => (i ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1)).join(" ");
    const vAt = (t) => { let best = pts[0]; for (const p of pts) if (p.t <= t) best = p; return best.v; };
    let marks = "", labels = "";
    const acts = (S.activity || []).filter((a) => (a.kind === "copies" || (a.kind === "exits" && a.closed)) && Date.parse(a.ts) >= t0);
    for (const a of acts) { const t = Date.parse(a.ts), x = X(t), y = Y(vAt(t)); const c = a.kind === "copies" ? "#0A84FF" : (a.gain > 0 ? "#00D26A" : "#FF3B30"); marks += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + c + '" stroke="#000" stroke-width="1.5"/>'; }
    const wins = acts.filter((a) => a.kind === "exits" && a.pnl > 0).slice(0, 3);
    for (const a of wins) { const t = Date.parse(a.ts); labels += '<span class="c-lab" style="left:' + Math.min(85, Math.max(12, X(t) / W * 100)).toFixed(1) + "%;top:" + (Y(vAt(t)) / H * 100).toFixed(1) + '%">' + esc(symOf(a)) + " " + sMoney(a.pnl).replace(".00", "") + "</span>"; }
    const lx = X(pts[pts.length - 1].t), ly = Y(pts[pts.length - 1].v);
    svg.innerHTML = '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00D26A" stop-opacity=".2"/><stop offset="1" stop-color="#00D26A" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + " L" + lx.toFixed(1) + " " + H + " L" + X(t0).toFixed(1) + " " + H + ' Z" fill="url(#lg)"/><path d="' + d + '" fill="none" stroke="#00D26A" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' + marks +
      '';
    const tip = $("l-tip"); if (tip) { const sd = num(S.since_deposit), xp = lx / W * 100, yp = ly / H * 100; tip.className = "tip num" + (sd != null && sd < 0 ? " neg" : "") + (SCR.on ? " hidden" : ""); tip.innerHTML = '<i class="tdot" style="left:' + xp.toFixed(2) + "%;top:" + yp.toFixed(2) + '%"></i><span class="tlab" style="left:' + Math.min(86, Math.max(14, xp)).toFixed(2) + "%;top:" + yp.toFixed(2) + '%">' + (sd == null ? "—" : esc(sMoney(sd))) + "</span>"; }
    setH("l-labels").v = labels;
    const real = (S.equity || []).map((p) => ({ t: Date.parse(p.t), v: p.v })).filter((p) => isFinite(p.t) && p.t >= t0 && p.t <= now);
    real.push({ t: now, v: S.balance, live: true });
    SCR.pts = real.map((p) => ({ t: p.t, v: p.v, live: p.live, x: X(p.t), y: Y(p.v) }));
    SCR.acts = acts.map((a) => ({ x: X(Date.parse(a.ts)), lab: a.kind === "copies" ? "Copied " + symOf(a) : symOf(a) + " " + sMoney(a.pnl != null ? a.pnl : a.gain) })); SCR.span = t1 - t0;
    if (SCR.on) scrubDraw();
  }
  /* ---------- balance chart scrubbing (finger / mouse) ---------- */
  const SCR = { on: false, pts: [], acts: [], fx: 0, raf: 0, span: 0 };
  function scrubTime(t) { const o = { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }; if (SCR.span > 20 * 3600e3) { o.day = "numeric"; o.month = "short"; } return new Date(t).toLocaleString("nl-NL", o); }
  function scrubDraw() {
    SCR.raf = 0; const pts = SCR.pts; if (!pts.length) return;
    const W = 390, H = 190, x = SCR.fx * W; let best = pts[0];
    for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    const box = $("l-scrub"); box.classList.remove("hidden"); const tp = $("l-tip"); if (tp) tp.classList.add("hidden");
    box.style.setProperty("--x", (best.x / W * 100).toFixed(2) + "%"); box.style.setProperty("--y", (best.y / H * 100).toFixed(2) + "%");
    let near = null, nd = 12; for (const a of SCR.acts) { const d = Math.abs(a.x - best.x); if (d <= nd) { nd = d; near = a; } }
    $("l-scrub-t").textContent = (best.live ? "nu · " : "") + scrubTime(best.t) + (near ? " · " + near.lab : "");
    const start = (S.book && S.book.start_usd) || 100, d = best.v - start;
    setH("l-bal").v = big(best.v);
    const c = $("l-ch"); c.className = cls(d) || "g"; c.textContent = (d >= 0 ? "▲ " : "▼ ") + money(Math.abs(d)) + " (" + pct(d / start * 100, 0) + ")";
  }
  function wireScrub() {
    const wrap = $("l-chart").parentElement;
    const at = (ev) => { const r = wrap.getBoundingClientRect(); SCR.fx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); if (!SCR.raf) SCR.raf = requestAnimationFrame(scrubDraw); };
    const end = () => { if (!SCR.on) return; SCR.on = false; if (SCR.raf) { cancelAnimationFrame(SCR.raf); SCR.raf = 0; } $("l-scrub").classList.add("hidden"); if (S && screen === "home") renderLive(); };
    wrap.addEventListener("pointerdown", (ev) => { if (ev.button > 0 || !S) return; SCR.on = true; try { wrap.setPointerCapture(ev.pointerId); } catch (e) {} at(ev); });
    wrap.addEventListener("pointermove", (ev) => { if (SCR.on) { at(ev); if (ev.cancelable) ev.preventDefault(); } });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) => wrap.addEventListener(n, end));
    let tx = 0, ty = 0, dir = "";
    wrap.addEventListener("touchstart", (ev) => { const t = ev.touches[0]; tx = t.clientX; ty = t.clientY; dir = ""; }, { passive: true });
    wrap.addEventListener("touchmove", (ev) => {
      if (!SCR.on) return; const t = ev.touches[0];
      if (!dir) { const dx = Math.abs(t.clientX - tx), dy = Math.abs(t.clientY - ty); if (dx < 4 && dy < 4) return; dir = dx >= dy ? "h" : "v"; }
      if (dir === "h") { if (ev.cancelable) ev.preventDefault(); } else end();
    }, { passive: false });
  }
  /* v41: animated balance count (tabular nums; skipped while scrubbing) */
  function animBal(id, v) {
    const el = $(id); v = num(v); if (!el) return; if (v == null) { setH(id).v = big(v); return; }
    const from = el._bv; el._bv = v;
    if (from == null || Math.abs(from - v) < 0.005 || document.hidden) { cancelAnimationFrame(el._raf); const h = big(v); el.innerHTML = h; el._h = h; return; }
    const t0 = performance.now(), dur = 650; cancelAnimationFrame(el._raf);
    const step = (t) => { if (id === "l-bal" && SCR.on) return; const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), x = from + (v - from) * e; const h = big(x); el.innerHTML = h; el._h = h; if (k < 1) el._raf = requestAnimationFrame(step); };
    el._raf = requestAnimationFrame(step);
  }
  function startUsd() { return (S && S.book && num(S.book.start_usd)) || null; }
  function renderHeader() {
    if (!S) return; const n = (S.open || []).length; const o = $("hd-open"); if (o) o.textContent = n + " open";
    tickClock();
  }
  function tickClock() { const el = $("hd-time"); if (el) el.textContent = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }); }
  function renderGrid() {
    const tr = leaders().filter((l) => l.tracked);
    $("l-gridsub").textContent = S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + " · " + dlyShort() + " → Grok Bot";
    const lw = S.last_watch || {};
    const score = (l) => ((S.open || []).some((p) => p.leader === l.handle) ? 4e15 : 0) + ((S.closed || []).some((p) => p.leader === l.handle) ? 2e15 : 0) + (lw[l.handle] ? Date.parse(lw[l.handle].ts) || 0 : 0);
    const cells = tr.slice().sort((a, b) => score(b) - score(a)).concat(leaders().filter((l) => !l.tracked)).slice(0, 4);
    setH("l-grid").v = cells.map((l) => {
      const w = lw[l.handle]; let a = l.tracked ? "watching for the first buy…" : "geen wallet · wacht op koppeling";
      if (w) { const t = TOK[w.mint]; a = (w.value === "buy" ? '<span class="bt">bought</span> ' : '<span class="sd">sold</span> ') + esc((t && t.sym) || short(w.mint)) + (t && t.mc ? " · " + kfmt(t.mc) : "") + " · " + ago(w.ts); }
      const mine = (S.open || []).find((p) => p.leader === l.handle) || (S.closed || []).find((p) => p.leader === l.handle);
      let res = '<div class="res"><span class="mut" style="font-weight:600">' + (l.tracked ? "nog geen kopie" : rankLbl(l) + " · " + pnl30(l) + " 30D") + "</span></div>";
      if (mine) { const isOpen = (S.open || []).some((p) => p.id === mine.id); const v = mine.pct; res = '<div class="res ' + (v > 0 ? "win" : v < 0 ? "loss" : "") + '" data-pos="' + mine.id + '">' + tokIcon(mine.mint, mine.symbol) + '<span class="' + cls(v) + '">' + pct(v) + '</span><span class="v">' + (isOpen ? money(mine.value) : esc(mine.reason || "")) + "</span></div>"; }
      return '<div class="cg' + (w && Date.now() - Date.parse(w.ts) < 120e3 ? " act" : "") + '" data-tr="' + esc(l.handle) + '" style="' + (l.tracked ? "" : "opacity:.5") + '"><div><div class="t">' + av(l.handle) + "<b>" + esc(l.handle) + '</b><span class="s30">' + dly() + 's</span></div><div class="a">' + a + "</div></div>" + res + "</div>";
    }).join("");
  }
  /* v41: bot rows from the real agent heartbeats + wallet state */
  function botList() {
    const ag = S.agents || {}, lc = S.last_copy, r = S.rules || {}, L = RAW && RAW.live_book;
    const ok = (k) => !!(ag[k] || {}).ok, age = (k) => (ag[k] || {}).age_s;
    const hb = (k) => ok(k) ? (age(k) != null ? " · " + age(k) + "s geleden" : "") : " · geen hartslag";
    const sum = (S.summary || {}).all || {};
    const rows = [
      { k: "watcher", n: "Watcher", c: "linear-gradient(135deg,#0A84FF,#5AC8FA)", g: "W", ok: ok("watcher"), s: "kijkt naar " + S.tracked + " wallets" + hb("watcher"), m: S.tracked + "", ml: "wallets" },
      { k: "copier", n: "Copier", c: "linear-gradient(135deg,#FF9F0A,#FFD60A)", g: "C", ok: ok("copier"), s: (S.pending ? S.pending + " wacht · " + dlyShort() : lc ? "laatste: " + esc(symOf(lc)) + " in " + (lc.lag != null ? lc.lag : dly()) + "s" : "wacht op de eerste koop") + hb("copier"), m: copiesTonight() + "", ml: "vandaag" },
      { k: "executor", n: "Executor", c: "linear-gradient(135deg,#5E5CE6,#BF5AF2)", g: "E", ok: ok("executor"), s: execState().t + hb("executor"), m: (S.open || []).length + "/" + (S.max_open || r.max_open || "—"), ml: "open" },
      { k: "risk", n: "Risk", c: "linear-gradient(135deg,#FF3B30,#FF6B81)", g: "R", ok: ok("risk"), s: (isLive() && r.exit_text) ? esc(r.exit_text) : "stop −" + r.stop_pct + "% · 50% @+" + r.tp1_pct + "% · rest @+" + r.tp2_pct + "%", m: isLive() && L && L.kill_floor != null ? money(L.kill_floor) : (sum.wins || 0) + "W " + (sum.losses || 0) + "L", ml: isLive() && L && L.kill_floor != null ? "stopt bij" : "score" },
    ];
    if (L) { const w = L.wallet || {}; const on = !!(L.enabled && L.buys_on && !L.killed); rows.push({ k: "wallet", n: "Phantom wallet", c: "linear-gradient(135deg,#00D26A,#34C759)", g: "P", ok: on, s: L.killed ? "gestopt · verlieslimiet" : !L.enabled ? "echt geld staat uit" : L.buys_on ? "kopen aan · " + (L.buys_24h || 0) + "/" + (L.max_buys_24h || 40) + " vandaag" : "kopen gepauzeerd" + (L.buys_off_why ? " · " + esc(L.buys_off_why) : ""), m: money(w.total_usd), ml: "saldo" }); }
    return rows;
  }
  function botRowsHtml(rows) { return rows.map((x) => '<div class="brow' + (x.ok ? "" : " dead") + '" data-ag="' + x.k + '"><span class="bic" style="background:' + x.c + '">' + x.g + '</span><div class="bm"><b>' + x.n + '<i class="bdot' + (x.ok ? " on" : "") + '"></i></b><span>' + x.s + '</span></div><div class="bv num"><b>' + esc(x.m) + "</b><span>" + esc(x.ml) + "</span></div></div>").join(""); }
  function execState() {
    const a = (S.activity || []).find((x) => x.kind === "copies" || x.kind === "exits"), ex = (S.agents || {}).executor || {};
    const fresh = a && Date.now() - Date.parse(a.ts) < 90e3;
    if (ex.ok === false) return { k: "offline", t: "offline" };
    if (fresh) return a.kind === "copies" ? { k: "buying", t: "koopt " + esc(symOf(a)) } : { k: "selling", t: "verkoopt " + esc(symOf(a)) };
    const n = (S.open || []).length; return n ? { k: "holding", t: "houdt " + n + " positie" + (n === 1 ? "" : "s") + " vast" } : { k: "idle", t: "idle" };
  }
  function tsTime(iso) { const t = Date.parse(iso || ""); return isFinite(t) ? new Date(t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ }) : "--:--:--"; }
  function renderLiveScreen() {
    const lines = [];
    for (const w of (S.watch || []).slice(0, 10)) { const t = TOK[w.mint]; lines.push({ ts: w.ts, tag: "watcher", c: "#5AC8FA", txt: esc(w.leader) + " " + (w.value === "buy" ? "kocht" : "verkocht") + " " + esc((t && t.sym) || (w.symbol && !/…$/.test(w.symbol) ? w.symbol : short(w.mint))) }); }
    for (const a of (S.activity || []).slice(0, 10)) {
      if (a.kind === "copies") lines.push({ ts: a.ts, tag: "executor", c: "#BF5AF2", txt: "buy " + esc(symOf(a)) + " " + money(a.size) + (a.lag != null ? " · +" + a.lag + "s" : "") + (a.tx ? " ✓" : "") });
      else if (a.kind === "exits") lines.push({ ts: a.ts, tag: "executor", c: "#BF5AF2", txt: "sell " + esc(symOf(a)) + ' <span class="' + cls(a.gain) + '">' + sMoney(a.gain) + " (" + pct(a.pct) + ")</span> · " + esc(exitName(a.reason)) });
      else lines.push({ ts: a.ts, tag: "risk", c: "#FF6B81", txt: esc(txtEur(String(a.text || "")).slice(0, 70)) });
    }
    lines.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const tail = lines.slice(-7);
    const es = execState();
    const ex = $("ls-exec"); ex.textContent = "Executor · " + es.k; ex.className = "ls-exec " + es.k;
    setH("ls-feed").v = (tail.length ? tail.map((l) => '<div class="ln"><span class="t">' + tsTime(l.ts) + '</span><span class="tg" style="color:' + l.c + '">' + l.tag + '</span><span class="lx">' + l.txt + "</span></div>").join("") : '<div class="ln"><span class="lx mut">wachten op het eerste signaal…</span></div>') +
      '<div class="ln cur"><span class="t">' + tsTime(S.updatedAt) + '</span><span class="tg" style="color:#00D26A">desk</span><span class="lx">watching ' + S.tracked + " wallets · " + (S.open || []).length + " open<i class=\"caret2\"></i></span></div>";
    const a = (S.activity || []).find((x) => x.kind === "copies" || x.kind === "exits");
    setH("ls-foot").v = a ? '<span class="lf-t">' + (a.kind === "copies" ? "Bought " + esc(symOf(a)) + " · " + money(a.size) : "Sold " + esc(symOf(a)) + ' · <span class="' + cls(a.gain) + '">' + sMoney(a.gain) + "</span>") + ' <span class="mut">· ' + ago(a.ts) + ' geleden</span></span><span class="lf-ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : '<span class="mut">Nog geen trade</span>';
  }
  function renderLive() {
    const tr = leaders().filter((l) => l.tracked);
    setH("l-stack").v = tr.slice(0, 4).map((l) => av(l.handle)).join("");
    $("l-behind").textContent = "· " + behind(); $("l-n").textContent = S.tracked + " trader" + (S.tracked === 1 ? "" : "s");
    $("l-open").textContent = "· " + (S.open || []).length + " open";
    if (!SCR.on) animBal("l-bal", S.balance);
    if (!SCR.on) { const c = $("l-ch"); c.className = "num " + (cls(S.since_deposit) || "g"); c.textContent = (S.since_deposit >= 0 ? "▲ " : "▼ ") + money(Math.abs(S.since_deposit)) + " (" + pct(S.since_deposit_pct, 2) + ")"; }
    const st = startUsd(), m = $("l-mult"); if (m) { const x = st ? S.balance / st : null; m.textContent = x != null && isFinite(x) ? x.toFixed(2) + "x" : "—"; m.className = "mult num" + (x != null && x < 1 ? " neg" : ""); }
    renderLiveChart();
    const rows = botList(); $("hb-run").textContent = rows.filter((x) => x.ok).length + " running"; setH("l-agents").v = botRowsHtml(rows);
    renderLiveScreen();
    $("l-actsub").textContent = copiesTonight() + " copies vandaag";
    setH("l-feed").v = feedHtml((S.activity || []).filter((a) => a.kind === "copies" || a.kind === "exits").slice(0, 6), "all", "home");
    const started = isStarted() || isLive(); $("h-dep-pill").classList.toggle("hidden", started); $("h-btns").classList.toggle("hidden", !started || isLive());
  }
  function renderBots() {
    const rows = botList(); $("b-sub").textContent = rows.filter((x) => x.ok).length + " van " + rows.length + " running · " + (isLive() ? "ECHT GELD" : "SIM");
    setH("b-agents").v = botRowsHtml(rows); renderGrid(); renderHome();
  }

  /* ---------- AGENTS (task chat, generated from the real rules) ---------- */
  let chatExtra = [];
  function renderChat() {
    const r = S.rules, tr = leaders().filter((l) => l.tracked), top = leaders().slice(0, 4).map((l) => "<b>@" + esc(l.handle) + "</b>").join(", ");
    $("c-sub").textContent = "new task · Trencher · " + money(S.balance);
    const user = "copy the top " + S.top_n + " traders on fomo by 30D PnL (" + top + ", …). buy " + (dly() ? dly() + "s after they buy, " : "right after they buy, ") + r.ticket_pct + "% per copy, max " + r.max_open + " open. sell when they sell. stop −" + r.stop_pct + "%, take 50% profit at +" + r.tp1_pct + "%, the rest at +" + r.tp2_pct + "%.";
    const waiting = S.top_n - fomoTracked();
    const bot = "On it. " + money(S.balance) + " on " + S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + ". Every buy copied " + (dly() ? dly() + "s later" : "directly") + ", same exits, stop −" + r.stop_pct + "%, 50% out at +" + r.tp1_pct + "%, rest at +" + r.tp2_pct + "%. " + (S.public_n ? S.public_n + " of them are publieke Solana-traders (kolscan.io leaderboard). " : "") + (waiting > 0 ? waiting + " of the top " + S.top_n + " wait for the FOMO connection (no wallet yet)." : "") + " Demo only.";
    const chips = tr.map((l) => '<span class="cchip">' + av(l.handle) + esc(l.handle) + "</span>").join("") + [["Watcher", "#38c6f4"], ["Copier", "#ff9f0a"], ["Executor", "#a259ff"], ["Risk", "#ff453a"]].map((x) => '<span class="cchip"><i style="background:' + x[1] + '"></i>' + x[0] + "</span>").join("");
    setH("c-body").v = '<div class="bub-u">' + user + '</div><div class="bot-row"><span class="gk"></span><div class="bub-b">' + esc(bot) + '</div></div><div class="cchips">' + chips + "</div>" +
      chatExtra.map((m) => (m.u ? '<div class="bub-u" style="margin-top:18px">' + esc(m.t) + "</div>" : '<div class="bot-row"><span class="gk"></span><div class="bub-b">' + esc(m.t) + "</div></div>")).join("");
  }

  /* ---------- ACTIVITY / ACCOUNT ---------- */
  function renderActivity() { $("a-sub").textContent = "tonight · copying " + S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + " · " + behind(); setH("a-feed").v = feedHtml(S.activity, feedF, "act"); }
  function renderAccount() { const r = S.rules; $("ac-tr").textContent = fomoTracked() + " van top " + S.top_n + " gevolgd" + (S.public_n ? " + " + S.public_n + " publieke Solana-traders" : ""); $("ac-size").textContent = isLive() ? "max " + r.ticket_pct + "% van saldo · max " + r.max_open + " open · min " + money(r.min_trade_usd || 2) + " · " + (r.sol_reserve || 0.02) + " SOL reserve" : r.ticket_pct + "% · max " + r.max_open + " open"; $("ac-rules").textContent = (isLive() && r.exit_text) ? r.exit_text : (isLive() ? "noodstop −" : "−") + r.stop_pct + "% · 50% @+" + r.tp1_pct + "% · rest @+" + r.tp2_pct + "% · verkoopt als trader verkoopt" + (isLive() && RAW.live_book ? " · stopt alles bij −" + money(RAW.live_book.loss_limit || 12.5) : ""); renderPhantom(); renderDemo(); renderAppKey(); renderProfile(); }
  /* v41: profile header, range chart, cash card and positions (all from the book on screen) */
  function acSpan(r) { return { "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3 }[r] || Infinity; }
  function renderProfile() {
    const live = isLive(), L = RAW && RAW.live_book, w = (L && L.wallet) || {};
    $("ac-handle").textContent = live ? "@phantom · " + short(w.address) : "@demo · SIM-boek";
    animBal("ac-bal", S.balance);
    const now = Date.now(), span = acSpan(acRange);
    let pts = (S.equity || []).map((p) => ({ t: Date.parse(p.t), v: num(p.v) })).filter((p) => isFinite(p.t) && p.v != null);
    if (span !== Infinity) { const inR = pts.filter((p) => p.t >= now - span), before = pts.filter((p) => p.t < now - span).slice(-1); pts = before.map((p) => ({ t: now - span, v: p.v })).concat(inR); }
    pts.push({ t: now, v: num(S.balance) });
    const base = pts.length ? pts[0].v : null, d = base != null ? S.balance - base : null;
    const ch = $("ac-ch"); ch.className = cls(d) || "g"; ch.textContent = d == null ? "—" : sMoney(d) + (base ? " (" + pct(d / base * 100, 2) + ")" : "");
    $("ac-chl").textContent = acRange === "All" ? "sinds start" : acRange;
    const svg = $("ac-chart"), W = 390, H = 120;
    if (pts.length < 2) pts.unshift({ t: now - 60e3, v: num(S.balance) });
    const t0 = pts[0].t, t1 = Math.max(now, t0 + 1); let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)); const pad = Math.max((hi - lo) * 0.15, 0.25); lo -= pad; hi += pad;
    const X = (t) => 4 + ((t - t0) / (t1 - t0)) * (W - 8), Y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 16);
    const col = d != null && d < 0 ? "#FF3B30" : "#00D26A";
    svg.innerHTML = '<path d="' + pts.map((p, i) => (i ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1)).join(" ") + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
    const cash = live ? num(w.total_usd) != null ? (num(w.total_usd) - (num(w.positions_usd) || 0)) : num(S.cash) : num(S.cash);
    $("ac-cash").textContent = money(cash);
    const open = S.open || [], closed = S.closed || [];
    const list = acOC === "open" ? open : closed;
    $("ac-pn").textContent = list.length;
    let rows = "";
    if (acOC === "open" && acPF === "all") {
      if (live) rows += '<div class="prow"><span class="ti" style="background:linear-gradient(135deg,#9945FF,#14F195);color:#000">◎</span><div class="pm"><b>SOL</b><span>' + (num(w.sol) != null ? Number(w.sol).toFixed(4) + " SOL" : "—") + '</span></div><div class="pv num"><b>' + money(num(w.sol) != null ? w.sol * (w.sol_usd || 0) : null) + "</b><span>wallet</span></div></div>" + (num(w.usdc) ? '<div class="prow"><span class="ti" style="background:#2775CA;color:#fff">$</span><div class="pm"><b>USDC</b><span>' + Number(w.usdc).toFixed(2) + ' USDC</span></div><div class="pv num"><b>' + money(w.usdc) + "</b><span>wallet</span></div></div>" : "");
      else rows += '<div class="prow"><span class="ti" style="background:#1f2a22;color:#00D26A">$</span><div class="pm"><b>Cash</b><span>demo · SIM</span></div><div class="pv num"><b>' + money(S.cash) + "</b><span>vrij</span></div></div>";
    }
    rows += list.map((p) => { const isOpen = acOC === "open"; const g = isOpen ? p.value - p.size_usd * p.remaining : p.pnl; return '<div class="prow" data-pos="' + esc(p.id) + '">' + tokIcon(p.mint, p.symbol) + '<div class="pm"><b>' + esc(p.symbol || short(p.mint)) + "</b><span>" + money(p.size_usd) + " in · " + (isOpen ? (p.tp1_done ? "50% verkocht · " : "") + esc(p.leader) : esc(exitName(p.reason))) + '</span></div><div class="pv num"><b>' + (isOpen ? money(p.value) : '<span class="' + cls(g) + '">' + sMoney(g) + "</span>") + '</b><span class="' + cls(p.pct) + '">' + pct(p.pct) + "</span></div></div>"; }).join("");
    setH("ac-pos").v = rows || '<div class="empty">' + (acOC === "open" ? "Geen open posities." : "Nog geen gesloten posities.") + "</div>";
    renderCloseAll();
  }
  function renderCloseAll() {
    const b = $("ac-closeall"); if (!b || !S) return; const n = (S.open || []).length;
    b.classList.toggle("hidden", !n || acOC !== "open"); b.textContent = "Sluit alle posities (" + n + ")" + (isLive() ? " · ECHT GELD" : " · demo");
  }
  function openCloseAll() {
    if (!S) return; const live = isLive(), n = (S.open || []).length, bot = (RAW && RAW.bot) || botName(), cmd = live ? "close_all_live" : "close_all_demo";
    if (!n) { toast("Geen open posities", ""); return; }
    $("cl-title").textContent = "Sluit alle posities · " + (live ? "ECHT GELD" : "demo");
    $("cl-text").textContent = live
      ? n + " echte positie(s) worden verkocht voor SOL (exacte wallet-saldi, alleen swaps via Phantom). De koop-schakelaar verandert niet. Bevestig daarna met Start in Telegram; de bot stuurt wat er verkocht is en de PnL."
      : n + " demo-positie(s) worden gesloten tegen de huidige prijs. ECHT GELD verandert niet. Bevestig daarna met Start in Telegram; de bot stuurt de PnL.";
    const go = $("cl-go");
    if (canAct()) {
      $("cl-text").textContent = live ? n + " echte positie(s) worden nu verkocht voor SOL (exacte wallet-saldi, alleen swaps via Phantom). Kopen blijft zoals het staat." : n + " demo-positie(s) worden nu gesloten tegen de huidige prijs. ECHT GELD verandert niet.";
      go.removeAttribute("href"); go.removeAttribute("target");
      go.onclick = (ev) => { ev.preventDefault(); closeAllDirect(live); };
      openSheet("sh-close"); return;
    }
    go.setAttribute("target", "_blank");
    if (bot) go.href = "https://t.me/" + bot + "?start=" + cmd; else go.removeAttribute("href");
    go.onclick = () => { setTimeout(closeSheets, 200); toast(bot ? "Tik in Telegram op Start" : "Stuur in Telegram", bot ? "Daarna worden alle " + (live ? "echte" : "demo") + " posities gesloten." : "sluit alles " + (live ? "live" : "demo")); };
    openSheet("sh-close");
  }
  async function closeAllDirect(live) {
    if (closeAllDirect.busy) return; closeAllDirect.busy = true; closeSheets();
    toast("Bezig met sluiten…", live ? "Echte posities worden verkocht via Phantom" : "Demo-posities worden gesloten");
    const r = await act("/api/app/close_all", { book: live ? "live" : "demo", confirm: true }, 120000); closeAllDirect.busy = false;
    if (!r.ok) { toast("Sluit alles niet gelukt", r.why + (r.net ? " · check Telegram voor de uitslag" : "")); return; }
    const d = r.data;
    if (d.pending) { toast("Sluiten loopt nog", "De uitslag komt in Telegram en hier binnen ~1 minuut."); return; }
    const nd = (d.done || []).length, nf = (d.failed || []).length;
    toast(nd || nf ? nd + " gesloten" + (nf ? ", " + nf + " mislukt" : "") + " · PnL " + (d.pnl >= 0 ? "+" : "-") + money(Math.abs(d.pnl)) : "Geen open posities", (live ? "ECHT GELD" : "Demo") + (nf ? " · probeer de rest opnieuw" : "") + " · details in Telegram");
    setTimeout(refresh, 4000);
  }
  function renderDemo() {
    const st = $("demo-state"), btn = $("demo-btn"), hint = $("demo-hint"); if (!st || !btn) return;
    const on = demoOn();
    st.textContent = on ? "AAN · kopieert met nepgeld, geen meldingen" : "UIT · alleen geschiedenis";
    st.className = on ? "k-on" : "";
    const bot = (RAW && RAW.bot) || botName();
    btn.textContent = on ? "Demo uitzetten" : "Demo aanzetten";
    if (canAct()) { btn.removeAttribute("href"); btn.removeAttribute("target"); hint.textContent = "Werkt direct (app-sleutel). ECHT GELD verandert niet."; return; }
    if (bot) { btn.setAttribute("target", "_blank"); btn.href = "https://t.me/" + bot + "?start=" + (on ? "demo_off" : "demo_on"); btn.classList.remove("hidden"); hint.textContent = "Na Start in Telegram ververst de status hier binnen ~1 minuut."; }
    else { btn.removeAttribute("href"); hint.textContent = "Stuur in Telegram: demo " + (on ? "uit" : "aan"); }
  }
  function renderPhantom() {
    const L = RAW && RAW.live_book; const st = $("ph-status"); if (!st) return;
    if (!L) { st.textContent = "Nog geen gegevens"; st.className = "k-on warn"; return; }
    const w = L.wallet || {};
    st.textContent = L.killed ? "Gestopt · verlieslimiet bereikt" : !L.enabled ? "Gekoppeld · echt geld staat uit" : L.buys_on ? "Gekoppeld · ECHT GELD actief" : "Gekoppeld · kopen gepauzeerd";
    st.className = "k-on" + (L.killed || !L.buys_on ? " warn" : "");
    $("ph-addr").textContent = short(w.address);
    $("ph-sol").textContent = num(w.sol) != null ? Number(w.sol).toFixed(4) + " SOL · " + money(w.sol * (w.sol_usd || 0)) : "—";
    $("ph-usdc").textContent = num(w.usdc) != null ? Number(w.usdc).toFixed(2) + " USDC" : "—";
    $("ph-pos").textContent = money(w.positions_usd || 0) + " · " + (L.open || []).length + " open";
    setH("ph-total").v = money(w.total_usd);
    $("ph-limit").textContent = L.start_equity != null ? money(L.start_equity) + " · " + money(L.kill_floor) : "nog niet gestart";
    $("ph-buys").textContent = L.buys_on ? "aan · " + (L.buys_24h || 0) + "/" + (L.max_buys_24h || 40) + " vandaag" : "uit · " + (L.buys_off_why || "");
    $("ph-upd").textContent = w.updated ? "Saldo uit de wallet · bijgewerkt " + hhmm(w.updated) + " (" + ago(w.updated) + " geleden)" : "";
  }
  /* ---------- POSITION detail ---------- */
  function findPos(id) { const o = (S.open || []).find((p) => String(p.id) === String(id)); if (o) return { p: o, open: true }; const c = (S.closed || []).find((p) => String(p.id) === String(id)); return c ? { p: c, open: false } : null; }
  /* v37: GeckoTerminal free tier is ~30 calls/min; renderPos runs on every 5s poll, so cache candles
     per pool+agg (30s), keep the last good set on errors/429 and back off 60s instead of flickering to a flat line. */
  const CANDLES = {};
  async function candles(pool, fromMs, toMs) {
    const span = (toMs - fromMs) / 60e3; const agg = span > 600 ? 15 : span > 200 ? 5 : 1;
    const key = pool + "|" + agg, c0 = CANDLES[key], now = Date.now();
    const cut = (l) => l ? l.filter((c) => c.t >= fromMs - 5 * 60e3 && c.t <= toMs + 5 * 60e3) : null;
    if (c0 && (now < c0.until || c0.busy)) return cut(c0.list);
    const ent = CANDLES[key] = { list: c0 ? c0.list : null, until: now + 30000, busy: true };
    try {
      const r = await fetch("https://api.geckoterminal.com/api/v2/networks/solana/pools/" + encodeURIComponent(pool) + "/ohlcv/minute?aggregate=" + agg + "&limit=300&currency=usd", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("http " + r.status); const j = await r.json(); const l = ((j.data || {}).attributes || {}).ohlcv_list || [];
      ent.list = l.map((c) => ({ t: c[0] * 1000, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] })).sort((a, b) => a.t - b.t);
    } catch (e) { ent.until = Date.now() + 60000; }
    finally { ent.busy = false; }
    return cut(ent.list);
  }
  async function renderPos() {
    const f = findPos(openPosId); if (!f) { setScreen(prevScreen || "home"); return; }
    const p = f.p, D = (S.detail || {})[p.id] || {}, sup = D.supply, r = S.rules;
    const mc = (px) => sup ? px * sup : px; const fmtV = (px) => sup ? kfmt(mc(px)) : price(px);
    const nowPx = f.open ? p.price : null;
    $("p-mc").textContent = f.open ? fmtV(nowPx) : (D.now_mcap ? kfmt(D.now_mcap) : fmtV(p.entry_usd));
    const since = p.pct; const s = $("p-since"); s.className = "sb " + (cls(since) || "g"); s.textContent = (since >= 0 ? "▲ " : "▼ ") + Math.abs(since || 0).toFixed(1) + "% since Grok Bot copied";
    const lag = p.lag_s != null ? p.lag_s : (D.leader_ts ? Math.round((Date.parse(p.opened) - Date.parse(D.leader_ts)) / 1000) : null);
    setH("p-who").v = av(p.leader, "xs") + "<b>" + esc(p.leader) + "</b> bought at " + (D.leader_entry_mcap ? kfmt(D.leader_entry_mcap) : price(p.leader_entry_usd)) + ' · <span class="bd"></span><b>Grok Bot</b> ' + (lag != null ? lag + "s later" : "later") + " at " + (D.entry_mcap ? kfmt(D.entry_mcap) : price(p.entry_usd));
    // cards
    const pos = f.open
      ? '<div class="pc">' + tokIcon(p.mint, p.symbol) + '<div class="m"><b>Position</b><span>' + money(p.size_usd) + " in · copied " + esc(p.leader) + (p.tp1_done ? " · 50% sold" : "") + '</span></div><div class="v"><b>' + money(p.value) + '</b><span class="' + cls(p.value - p.size_usd * p.remaining) + '">' + sMoney(p.value - p.size_usd * p.remaining) + "</span></div></div>"
      : '<div class="pc ' + (p.pnl > 0 ? "win" : "loss") + '">' + tokIcon(p.mint, p.symbol) + '<div class="m"><b>Sold · ' + esc(exitName(p.reason)) + "</b><span>" + money(p.size_usd) + " in → " + money(p.size_usd + p.pnl) + ' out</span></div><div class="v"><b class="' + cls(p.pnl) + '">' + sMoney(p.pnl) + '</b><span class="' + cls(p.pnl) + '">' + pct(p.pct) + "</span></div></div>";
    const shield = '<span class="shield"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" fill="#ff453a"/></svg></span>';
    const risk = f.open
      ? '<div class="pc">' + shield + '<div class="m"><b>Risk · watching ' + esc(p.leader) + "</b><span>same exits · stop −" + r.stop_pct + "% · 50% @+" + r.tp1_pct + "% · rest @+" + r.tp2_pct + '%</span></div><span class="armed">armed</span></div>'
      : '<div class="pc ' + (p.pnl > 0 ? "win" : "loss") + '">' + shield + '<div class="m"><b>' + esc(exitTitle(p.reason)) + "</b><span>" + esc(exitSub(p)) + '</span></div><span class="donebadge"' + (p.pnl > 0 ? "" : ' style="color:#ff8a80"') + ">done ✓</span></div>";
    let tl = '<div class="kv"><span>' + av(p.leader, "xs") + esc(p.leader) + " <em>bought</em></span><b class=\"mut\">" + (D.leader_ts ? hhmm(D.leader_ts) + " · " : "") + (D.leader_entry_mcap ? kfmt(D.leader_entry_mcap) : price(p.leader_entry_usd)) + "</b></div>" +
      '<div class="kv"><span><span class="gk sm"></span>Grok Bot <em>copied · ' + (lag != null ? lag + "s later" : "") + '</em></span><b class="mut">' + money(p.size_usd) + " · " + hhmm(p.opened) + "</b></div>";
    for (const e of (D.exits || [])) tl += '<div class="kv"><span><span class="gk sm"></span>Grok Bot <em>sold · ' + esc(String(e.reason || "").replace(/\s*\(.*\)/, "")) + '</em></span><b class="' + cls(e.gain) + '">' + sMoney(e.gain) + " · " + hhmm(e.ts) + "</b></div>";
    if (f.open) tl += '<div class="kv dim"><span><span class="gk sm"></span>Grok Bot <em>sells at ' + (p.tp1_done ? "+" + r.tp2_pct + "%" : "+" + r.tp1_pct + "% / +" + r.tp2_pct + "%") + '</em></span><b class="mut">waiting · ' + fmtV(p.entry_usd * (1 + (p.tp1_done ? r.tp2_pct : r.tp1_pct) / 100)) + "</b></div>";
    if (isLive()) { const txs = [D.tx || p.tx].concat(D.sell_txs || p.sell_txs || []).filter(Boolean); if (txs.length) tl += '<div class="kv"><span><span class="modetag real">ECHT GELD</span> transacties</span><b>' + txs.map((t, i) => txLink(t, i ? "verkoop " + i + " ↗" : "koop ↗")).join(" · ") + "</b></div>"; }
    setH("p-cards").v = pos + risk + '<div class="tl">' + tl + "</div>";
    // banner
    const b = $("p-banner");
    if (f.open) b.classList.add("hidden"); else { b.classList.remove("hidden"); b.className = "banner-x" + (p.pnl > 0 ? "" : " red"); b.textContent = exitBanner(p.reason, p.pct); }
    // chart
    const t1 = Date.parse(p.opened), tL = D.leader_ts ? Date.parse(D.leader_ts) : t1 - 30e3, tEnd = f.open ? Date.now() : Date.parse(p.closed || "") || Date.now();
    let cs = D.pool ? await candles(D.pool, tL - 10 * 60e3, tEnd) : null;
    if (openPosId !== String(p.id) && openPosId !== p.id) return;
    drawPosChart(p, D, cs, tL, t1, tEnd, f.open);
  }
  function exitName(r) { r = String(r || ""); return /^TP2/.test(r) ? "take profit" : /^TP1/.test(r) ? "take profit" : /^stop/.test(r) ? "stop" : /trader/.test(r) ? "same exit" : r; }
  function exitTitle(r) { r = String(r || ""); return /^TP/.test(r) ? "Took profit · " + r.replace(/^TP\d\s*/, "").replace(/\s*\(.*\)/, "") : /^stop/.test(r) ? "Stopped · " + r.replace(/^stop\s*/, "") : /trader/.test(r) ? "Trader sold · same exit" : r; }
  function exitSub(p) { return /trader/.test(p.reason || "") ? p.leader + " sold · rule kept" : "rule kept · " + p.leader; }
  function exitBanner(r, pc) { r = String(r || ""); if (/^TP/.test(r)) { const m = r.match(/\+\d+%/); return "TOOK PROFIT" + (m ? " · " + m[0] : ""); } if (/^stop/.test(r)) return "STOPPED · " + pct(pc, 0); if (/trader/.test(r)) return "SAME EXIT · " + pct(pc, 0); return r.toUpperCase(); }
  function drawPosChart(p, D, cs, tL, t1, tEnd, isOpen) {
    const svg = $("p-chart"), W = 390, H = 300, VH = 46, sup = D.supply, r = S.rules;
    const toV = (px) => sup ? px * sup : px; const lab = (px) => sup ? kfmt(px * sup) : price(px);
    const e = p.entry_usd, lines = [{ px: e * (1 + r.tp2_pct / 100), c: "#34d659", t: "TP2 +" + r.tp2_pct + "% · " + lab(e * (1 + r.tp2_pct / 100)) }, { px: e * (1 + r.tp1_pct / 100), c: "#34d659", t: "TP1 +" + r.tp1_pct + "% · " + lab(e * (1 + r.tp1_pct / 100)) }, { px: e * (1 - r.stop_pct / 100), c: "#ff453a", t: "stop −" + r.stop_pct + "% · " + lab(e * (1 - r.stop_pct / 100)) }];
    let series = cs && cs.length > 2 ? cs : null;
    if (!series) { const pts = [{ t: tL, c: p.leader_entry_usd || e }, { t: t1, c: e }, { t: tEnd, c: isOpen ? p.price : e * (1 + (p.pct || 0) / 100) }]; series = pts.map((q) => ({ t: q.t, o: q.c, h: q.c, l: q.c, c: q.c, v: 0 })); }
    const T0 = Math.min(series[0].t, tL), T1 = Math.max(series[series.length - 1].t, tEnd);
    let lo = Math.min(...series.map((c) => c.l), ...lines.map((l) => l.px)), hi = Math.max(...series.map((c) => c.h), ...lines.map((l) => l.px));
    const padv = (hi - lo) * 0.08; lo -= padv; hi += padv;
    const X = (t) => 8 + ((t - T0) / Math.max(1, T1 - T0)) * (W - 70), Y = (px) => 10 + (1 - (px - lo) / (hi - lo)) * (H - VH - 24);
    let g = "";
    for (const l of lines) g += '<line x1="0" x2="' + W + '" y1="' + Y(l.px).toFixed(1) + '" y2="' + Y(l.px).toFixed(1) + '" stroke="' + l.c + '" stroke-dasharray="4 4" stroke-width="1" opacity=".75" vector-effect="non-scaling-stroke"/>';
    g += '<line x1="0" x2="' + W + '" y1="' + Y(e).toFixed(1) + '" y2="' + Y(e).toFixed(1) + '" stroke="#3b82ff" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    const real = !!(cs && cs.length > 2);
    if (real) {
      const bw = Math.max(1.5, Math.min(7, (W - 70) / series.length * 0.62)); const vmax = Math.max(...series.map((c) => c.v)) || 1;
      for (const c of series) { const x = X(c.t), up = c.c >= c.o, col = up ? "#34d659" : "#ff453a"; g += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Y(c.h).toFixed(1) + '" y2="' + Y(c.l).toFixed(1) + '" stroke="' + col + '" stroke-width="1" vector-effect="non-scaling-stroke"/><rect x="' + (x - bw / 2).toFixed(1) + '" y="' + Y(Math.max(c.o, c.c)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, Math.abs(Y(c.o) - Y(c.c))).toFixed(1) + '" fill="' + col + '"/>'; const vh = (c.v / vmax) * (VH - 6); g += '<rect x="' + (x - bw / 2).toFixed(1) + '" y="' + (H - vh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + vh.toFixed(1) + '" fill="' + col + '" opacity=".55"/>'; }
    } else {
      g += '<path d="' + series.map((c, i) => (i ? "L" : "M") + X(c.t).toFixed(1) + " " + Y(c.c).toFixed(1)).join(" ") + '" fill="none" stroke="#34d659" stroke-width="2.2" vector-effect="non-scaling-stroke"/>';
    }
    for (const k of [hi - padv, (hi + lo) / 2, lo + padv]) g += '<text x="' + (W - 4) + '" y="' + (Y(k) + 4).toFixed(1) + '" fill="#6e6e73" font-size="10" text-anchor="end" font-family="Inter">' + esc(lab(k)) + "</text>";
    svg.innerHTML = g;
    const pc = (x, y) => "left:" + (x / W * 100).toFixed(1) + "%;top:" + (y / H * 100).toFixed(1) + "%";
    let L = "";
    L += '<span class="c-lab blue" style="' + pc(Math.max(W * 0.24, X(t1)), Y(e) - 26) + '">Grok Bot +' + (p.lag_s != null ? p.lag_s : dly()) + "s</span>";
    L += '<span class="c-lab blue" style="' + pc(W - 52, Y(e) + 24) + '">entry ' + esc(lab(e)) + "</span>";
    L += '<span class="c-lab green left" style="' + pc(6, Y(lines[0].px) + 20) + '">' + esc(lines[0].t) + "</span>";
    L += '<span class="c-lab green left" style="' + pc(6, Y(lines[1].px) + 20) + '">' + esc(lines[1].t) + "</span>";
    L += '<span class="c-lab red left" style="' + pc(W * 0.3, Y(lines[2].px) + 20) + '">' + esc(lines[2].t) + "</span>";
    if (p.leader_entry_usd) L += '<span style="position:absolute;' + pc(Math.max(24, X(tL)), Math.max(4, Math.min(H - VH - 40, Y(p.leader_entry_usd) + (Math.abs(Y(p.leader_entry_usd) - Y(lines[2].px)) < 44 ? -44 : 10)))) + ';transform:translate(-50%,0);text-align:center;font-size:11px;color:#fff;font-weight:600">' + av(p.leader, "xs") + "<br>" + esc(p.leader) + "</span>";
    if (!real) L += '<span style="position:absolute;left:8px;bottom:6px;font-size:11px;color:#6e6e73">koersdata (GeckoTerminal) niet beschikbaar · lijn tussen echte punten</span>';
    setH("p-labels").v = L;
  }
  /* ---------- sheets ---------- */
  function isStarted() { try { return localStorage.getItem(START_KEY) === "1"; } catch (e) { return false; } }
  function openSheet(id) { $("ov").classList.remove("hidden"); document.querySelectorAll(".sheet").forEach((s) => s.classList.add("hidden")); $(id).classList.remove("hidden"); }
  function closeSheets() { $("ov").classList.add("hidden"); document.querySelectorAll(".sheet").forEach((s) => s.classList.add("hidden")); }
  function toast(t, s) { $("toast-t").textContent = t; $("toast-s").textContent = s || ""; const el = $("toast"); el.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add("hidden"), 3500); }
  const PADV = { dep: "", wd: "" };
  function padShow(k) { const v = PADV[k]; setH(k + "-amt").v = esc(v ? "€" + v : "€0") + '<span class="caret"></span>'; const n = Number(v);
    const go = $(k + "-go"); go.disabled = !(n > 0); go.textContent = (k === "dep" ? "Stort " : "Neem ") + (n > 0 ? "€" + n.toFixed(2) + " " : "") + (k === "dep" ? "op demo" : "op van demo"); }
  function padKey(k, t) { let v = PADV[k]; if (t === "⌫") v = v.slice(0, -1); else if (t === ".") { if (!v.includes(".")) v = (v || "0") + "."; } else if (/^\d$/.test(t)) { if (/\.\d\d$/.test(v) || v.replace(".", "").length >= 8) return; v = v === "0" ? t : v + t; } PADV[k] = v; padShow(k); }
  function sendMove(k) {
    let n = Math.round(Number(PADV[k]) * FX * 100) / 100; if (!(n > 0) || !S || isLive()) return;  // € typed -> desk USD
    if (k === "wd") n = Math.min(n, Math.max(0, Math.floor(Number(S.cash || 0) * 100) / 100)); if (!(n > 0)) { toast("Niets vrij om op te nemen", "Geld in open posities blijft staan."); return; }
    if (canAct()) { sendMoveDirect(k, n); return; }
    const d = k === "dep" ? n : -n, bot = (RAW && RAW.bot) || botName(), cmd = (k === "dep" ? "demo_dep_" : "demo_wd_") + String(n).replace(".", "_");
    try { localStorage.setItem(MOVE_KEY, JSON.stringify({ d: d, base: Number(RAW.book.start_usd), t: Date.now() })); if (k === "dep") localStorage.setItem(START_KEY, "1"); } catch (e) {}
    if (bot) window.open("https://t.me/" + bot + "?start=" + cmd, "_blank", "noopener");
    closeSheets(); S = viewOf(RAW); renderAll();
    toast((k === "dep" ? "Gestort: +" : "Opgenomen: -") + money(n) + " (demo)", bot ? "Tik in Telegram op Start om te bevestigen · ECHT GELD verandert niet" : "Stuur in Telegram: demo " + (k === "dep" ? "storten " : "opnemen ") + n + " (USD)");
  }
  async function sendMoveDirect(k, n) {
    const go = $(k + "-go"); if (go.disabled && sendMoveDirect.busy) return; sendMoveDirect.busy = true; go.disabled = true; go.textContent = "Bezig…";
    const base = Number(RAW.book.start_usd), r = await act("/api/app/demo/move", { amount: k === "dep" ? n : -n });
    sendMoveDirect.busy = false; padShow(k);
    if (!r.ok) { toast("Niet gelukt", r.why + (r.net ? " · probeer opnieuw of gebruik Telegram" : "")); return; }
    const a = Number(r.data.amount) || 0;
    try { localStorage.setItem(MOVE_KEY, JSON.stringify({ d: a, base: base, t: Date.now() })); if (a > 0) localStorage.setItem(START_KEY, "1"); } catch (e) {}
    closeSheets(); S = viewOf(RAW); renderAll();
    toast((a > 0 ? "Gestort: +" : "Opgenomen: -") + money(Math.abs(a)) + " (demo)", "Nieuw demo-saldo " + money(r.data.equity) + " · vrij " + money(r.data.cash) + " · ECHT GELD verandert niet");
  }
  async function toggleDemoDirect() {
    if (toggleDemoDirect.busy) return; toggleDemoDirect.busy = true; const want = !demoOn(), btn = $("demo-btn"); btn.textContent = "Bezig…";
    const r = await act("/api/app/demo/enabled", { on: want }); toggleDemoDirect.busy = false;
    if (!r.ok) { renderDemo(); toast("Niet gelukt", r.why); return; }
    try { localStorage.setItem(DEMO_PEND_KEY, JSON.stringify({ on: !!r.data.demo_enabled, t: Date.now() })); } catch (e) {}
    renderDemo(); toast("Demo staat nu " + (r.data.demo_enabled ? "AAN" : "UIT"), "ECHT GELD verandert niet.");
  }
  function openDeposit() { PADV.dep = ""; padShow("dep"); openSheet("sh-dep"); }
  function openWithdraw() { PADV.wd = ""; padShow("wd"); const n = (S.open || []).length; $("wd-pos").textContent = n ? n + " open" : "all closed ✓"; $("wd-note").textContent = "Vrij: " + money(S.cash) + " · geld in open posities blijft staan · nooit onder $0."; openSheet("sh-wd"); }
  function openNight() {
    const sum = (S.summary || {}).all || {}, start = S.book.start_usd;
    const h = +new Date().toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false });
    $("n-title").textContent = h >= 6 && h < 12 ? "Night done" : "Tonight · so far";
    $("n-bal").textContent = money(S.balance);
    $("n-line").className = "sm b6 " + (cls(S.since_deposit) || "g"); $("n-line").textContent = money(start) + " → " + money(S.balance) + " · " + pct(S.since_deposit_pct);
    const tp = (S.activity || []).filter((a) => a.kind === "exits" && /^TP/.test(a.reason || "")).length;
    setH("n-grid").v = '<div class="cell"><span>Copies</span><b>' + (S.activity || []).filter((a) => a.kind === "copies").length + " · " + (sum.wins || 0) + "W " + (sum.losses || 0) + 'L</b></div><div class="cell"><span>Net profit</span><b class="' + (cls(S.since_deposit) || "") + '">' + sMoney(S.since_deposit) + '</b></div><div class="cell"><span>Take profit hits</span><b>' + tp + '</b></div><div class="cell"><span>Behind traders</span><b>' + dlyShort() + " · same exits</b></div>";
    const st = S.leader_stats || {}; const ks = Object.keys(st).sort((a, b) => st[b].pnl - st[a].pnl);
    setH("n-tr").v = ks.length ? ks.map((k) => '<div class="ntr">' + av(k) + esc(k) + ' <span class="mut">· ' + st[k].copies + " cop" + (st[k].copies === 1 ? "y" : "ies") + '</span><b class="' + cls(st[k].pnl) + '">' + sMoney(st[k].pnl) + "</b></div>").join("") : '<div class="mut sm">Nog geen kopieën in deze demo.</div>';
    openSheet("sh-night");
  }
  function openTrader(handle) {
    const l = leaders().find((x) => x.handle === handle); if (!l) return; const r = S.rules;
    const mine = (S.open || []).filter((p) => p.leader === handle).concat((S.closed || []).filter((p) => p.leader === handle));
    const rows = mine.length ? mine.map((p) => { const isOpen = (S.open || []).some((o) => o.id === p.id); const g = isOpen ? p.value - p.size_usd * p.remaining : p.pnl; return '<div class="fr" data-pos="' + p.id + '"><div class="ic">' + tokIcon(p.mint, p.symbol) + '</div><div class="m"><b>' + esc(p.symbol || short(p.mint)) + "</b><span>" + money(p.size_usd) + " in · " + (isOpen ? "open · live" : esc(exitName(p.reason))) + '</span></div><div class="v"><b class="' + cls(g) + '">' + sMoney(g) + "</b><span>" + pct(p.pct) + "</span></div></div>"; }).join("") : "";
    setH("tr-body").v = '<div class="sh-h left">' + av(handle, "big") + '<div><b style="font-size:20px">' + esc(handle) + '</b><div class="mut xs">' + rankLbl(l) + " · " + pnl30(l) + " 30D PnL" + (isPub(l) ? " · publieke Solana-trader (bron kolscan.io)" : "") + "</div></div>" + (l.tracked ? '<span class="cchip" style="margin-left:auto;color:#34d659">● copying</span>' : '<span class="cchip" style="margin-left:auto;color:#8e8e93">geen wallet</span>') + '<button type="button" class="x" data-x2 style="position:static;margin-left:10px;flex:none" aria-label="sluiten">✕</button></div>' +
      '<div class="mut xs b6" style="letter-spacing:.6px;margin:8px 0 6px">GROK BOT COPIED FROM ' + esc(handle.toUpperCase()) + '</div><div class="card" style="margin-top:0;padding:6px 14px">' + rows + '<div class="mut sm" style="padding:12px 0">' + (l.tracked ? "watching " + esc(handle) + " for the next buy…" + (l.verified ? "" : " (wallet niet geverifieerd)") : esc(l.why_not || "")) + "</div></div>" +
      (l.profile_url ? '<a class="btn-grey wide" style="margin-top:12px;display:block;text-align:center;text-decoration:none" href="' + esc(l.profile_url) + '" target="_blank" rel="noopener">Bekijk ' + esc(handle) + ' op kolscan.io</a>' : "") + '<div class="mut xs b6" style="letter-spacing:.6px;margin:16px 0 6px">COPY RULES</div><div class="g2" style="margin-top:0"><div class="cell"><span>Delay</span><b>' + (dly() ? dly() + 's after each buy' : 'direct, same moment') + '</b></div><div class="cell"><span>Exits</span><b>same as ' + esc(handle) + '</b></div><div class="cell"><span>Take profit</span><b>50% +' + r.tp1_pct + "% · rest +" + r.tp2_pct + '%</b></div><div class="cell"><span>Stop</span><b>−' + r.stop_pct + "% · " + r.ticket_pct + "% per copy</b></div></div>";
    openSheet("sh-trader"); const x = document.querySelector("#tr-body [data-x2]"); if (x) x.addEventListener("click", closeSheets);
  }
  function confetti() {
    const c = $("confetti"), x = c.getContext("2d"); c.width = innerWidth; c.height = innerHeight;
    const cols = ["#4b50f2", "#34d659", "#ff453a", "#ff9f0a", "#38c6f4", "#a259ff", "#fff"];
    const P = Array.from({ length: 120 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, s: 2 + Math.random() * 3, r: Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
    let n = 0; (function f() { x.clearRect(0, 0, c.width, c.height); for (const p of P) { p.y += p.s; p.r += 0.08; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); } if (++n < 260 && !$("done").classList.contains("hidden")) requestAnimationFrame(f); })();
  }
  function showDone() {
    closeSheets();
    $("d-amt").textContent = money(S.balance);
    setH("d-line").v = money(S.book.start_usd) + " in → " + money(S.balance) + ' nu · <span class="' + cls(S.since_deposit) + '">' + pct(S.since_deposit_pct) + "</span>";
    const tr = leaders().filter((l) => l.tracked); setH("d-tr").v = '<span class="stack">' + tr.slice(0, 4).map((l) => av(l.handle)).join("") + "</span> " + tr.length + " trader" + (tr.length === 1 ? "" : "s");
    $("done").classList.remove("hidden"); confetti();
  }

  /* ---------- navigation ---------- */
  function setScreen(s) {
    if (s === "live") s = "home";
    if (s === "pos" && screen !== "pos") prevScreen = screen;
    screen = s; ["home", "bots", "agents", "activity", "account", "pos"].forEach((k) => $("s-" + k).classList.toggle("hidden", k !== s));
    const navOn = s === "pos" ? (prevScreen === "pos" ? "home" : prevScreen) : s === "agents" ? "bots" : s;
    document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.getAttribute("data-s") === (navOn === "agents" ? "bots" : navOn)));
    $("topbar").classList.toggle("hidden", s === "pos");
    scrollTo(0, 0); if (S) renderAll();
  }
  function openPos(id) { if (!id) return; openPosId = String(id); closeSheets(); setScreen("pos"); }
  function renderAll() {
    if (!S) return; renderHeader();
    if (screen === "home") renderLive(); else if (screen === "bots") renderBots(); else if (screen === "agents") renderChat(); else if (screen === "activity") renderActivity(); else if (screen === "account") renderAccount(); else if (screen === "pos" && !renderAll.busy) { renderAll.busy = true; renderPos().finally(() => { renderAll.busy = false; }); }
  }
  function seg(el, attr, fn) { el.addEventListener("click", (ev) => { const b = ev.target.closest("[" + attr + "]"); if (!b) return; el.querySelectorAll("[" + attr + "]").forEach((x) => x.classList.toggle("on", x === b)); fn(b.getAttribute(attr)); }); }
  function wire() {
    document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => setScreen(b.getAttribute("data-s"))));
    $("p-back").addEventListener("click", () => setScreen(prevScreen && prevScreen !== "pos" ? prevScreen : "home"));
    document.addEventListener("click", (ev) => { const g = ev.target.closest("[data-go]"); if (g) setScreen(g.getAttribute("data-go")); });
    $("b-chat").addEventListener("click", () => setScreen("agents"));
    seg($("ac-tf"), "data-a", (r) => { acRange = r; if (S) renderProfile(); });
    seg($("ac-oc"), "data-o", (o) => { acOC = o; if (S) renderProfile(); });
    seg($("ac-pf"), "data-p", (f) => { acPF = f; if (S) renderProfile(); });
    $("ac-dep").addEventListener("click", () => { if (!S) return; if (!isLive()) { openDeposit(); return; } const L = RAW && RAW.live_book, a = L && L.wallet && L.wallet.address; if (!a) { toast("Geen wallet-adres", "Nog geen gegevens van de Phantom-wallet."); return; } const done = () => toast("Wallet-adres gekopieerd", short(a) + " · stuur SOL hierheen vanuit Phantom (Solana-netwerk)"); try { navigator.clipboard.writeText(a).then(done, () => toast("Wallet-adres", a)); } catch (e) { toast("Wallet-adres", a); } });
    $("ac-wd").addEventListener("click", () => { if (!S) return; if (!isLive()) { openWithdraw(); return; } toast("Opnemen doe je in Phantom", "Open de Phantom-app op deze wallet. Verkoop geen coins die de bot nog open heeft."); });
    seg($("l-tf"), "data-r", (r) => { range = r; renderLiveChart(); });
    seg($("a-chips"), "data-f", (f) => { feedF = f; renderActivity(); });
    seg($("h-tabs"), "data-t", (t) => { homeTab = t; renderTokenList(); refreshTokens(); });
    seg($("h-chips"), "data-c", (c) => { chip = c; renderTokenList(); refreshTokens(); });
    document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-tr]"); if (t && !ev.target.closest("[data-pos]")) { openTrader(t.getAttribute("data-tr")); return; } const p = ev.target.closest("[data-pos]"); if (p && p.getAttribute("data-pos") && !ev.target.closest("a")) openPos(p.getAttribute("data-pos")); });
    $("ov").addEventListener("click", closeSheets); document.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", closeSheets));
    $("h-dep-pill").addEventListener("click", openDeposit); $("h-dep").addEventListener("click", openDeposit);
    $("h-wd").addEventListener("click", () => { if (S) openWithdraw(); });
    $("wd-go").addEventListener("click", () => sendMove("wd"));
    $("wd-pad").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) padKey("wd", b.textContent); }); $("d-close").addEventListener("click", () => $("done").classList.add("hidden"));
    $("l-night").addEventListener("click", openNight);
    $("dep-pad").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) padKey("dep", b.textContent); });
    $("dep-go").addEventListener("click", () => sendMove("dep"));
    $("ac-closeall").addEventListener("click", openCloseAll);
    $("demo-btn").addEventListener("click", (ev) => { if (canAct()) { ev.preventDefault(); toggleDemoDirect(); } });
    $("ak-save").addEventListener("click", () => { const v = $("ak-link").value.trim(), m = v.match(/(?:^|[#&?])pair=([^&#\s]+)/); if (!savePair(m ? m[1] : v)) { toast("Dat is geen koppel-link", "Plak de link uit Telegram (met #pair=)."); return; } $("ak-link").value = ""; renderAppKey(); renderDemo(); toast("App gekoppeld", "Storten, opnemen, demo aan/uit en sluit alles werken nu direct."); });
    $("ak-forget").addEventListener("click", () => { try { localStorage.removeItem(APPKEY_KEY); } catch (e) {} renderAppKey(); renderDemo(); toast("App-sleutel vergeten op dit toestel", "Intrekken voor alle toestellen: stuur 'app intrekken' in Telegram."); });
    seg($("booksw"), "data-b", (b) => setBook(b));
    document.addEventListener("click", (ev) => { const a = ev.target.closest("[data-ag]"); if (a) { agentInfo(a.getAttribute("data-ag")); return; } const t = ev.target.closest("[data-mint]"); if (t && !ev.target.closest("a")) openToken(t.getAttribute("data-mint")); });
    $("c-send").addEventListener("click", sendChat); $("c-in").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
    $("login-save").addEventListener("click", () => { const d = extractDataPath($("login-link").value); if (!d) { toast("Dat is geen inloglink", "Plak de volledige link uit Telegram."); return; } try { localStorage.setItem(DATA_KEY, d); } catch (e) {} $("login-panel").classList.add("hidden"); refresh(); });
  }
  function agentInfo(k) {
    if (!S) return; if (k === "wallet") { const L = RAW && RAW.live_book; if (L) toast("Phantom wallet · " + (L.killed ? "gestopt" : L.buys_on ? "kopen aan" : "kopen uit"), money((L.wallet || {}).total_usd) + " · " + (L.buys_24h || 0) + "/" + (L.max_buys_24h || 40) + " kopen vandaag"); return; } const a = (S.agents || {})[k] || {}, r = S.rules || {};
    const what = { watcher: "kijkt naar " + S.tracked + " trader-wallets", copier: "koopt " + (dly() ? dly() + "s na de trader" : "direct na de trader") + (S.pending ? " · " + S.pending + " wacht" : ""), executor: "demo-fills met fees en slippage · " + (S.open || []).length + "/" + (S.max_open || r.max_open) + " open", risk: "stop −" + r.stop_pct + "% · 50% @+" + r.tp1_pct + "% · rest @+" + r.tp2_pct + "%" }[k] || "";
    toast(k.charAt(0).toUpperCase() + k.slice(1) + (a.ok ? " · actief" : " · geen hartslag"), what + (a.age_s != null ? " · " + a.age_s + "s geleden" : ""));
  }
  function openToken(mint) {
    if (!mint) return; const t = TOK[mint] || {}, sym = t.sym || ((S && (S.tokens || []).find((x) => x.mint === mint)) || {}).symbol || short(mint);
    const held = S ? (S.open || []).find((p) => p.mint === mint) : null;
    const seen = S ? (S.watch || []).filter((w) => w.mint === mint).slice(0, 6) : [];
    const rows = seen.map((w) => '<div class="kv"><span>' + av(w.leader, "xs") + esc(w.leader) + " <em>" + (w.value === "buy" ? "kocht" : "verkocht") + '</em></span><b class="mut">' + hhmm(w.ts) + "</b></div>").join("");
    setH("tk-body").v = '<div class="sh-h left">' + tokIcon(mint, sym) + '<div><b style="font-size:20px">' + esc(sym) + '</b><div class="mut xs">' + esc(t.name || short(mint)) + '</div></div><button type="button" class="x" data-x2>✕</button></div>' +
      '<div class="g2" style="margin-top:6px"><div class="cell"><span>Prijs</span><b>' + price(t.price) + '</b></div><div class="cell"><span>Market cap</span><b>' + kfmt(t.mc) + '</b></div><div class="cell"><span>24h</span><b class="' + cls(t.ch) + '">' + pct(t.ch, 2) + '</b></div><div class="cell"><span>' + (isLive() ? "Echt geld" : "Demo") + '</span><b>' + (held ? money(held.value) + " open" : "geen positie") + "</b></div></div>" +
      (rows ? '<div class="mut xs b6" style="letter-spacing:.6px;margin:14px 0 6px">GEVOLGDE TRADERS</div><div class="card" style="margin-top:0;padding:6px 14px">' + rows + "</div>" : "") +
      (held ? '<button type="button" class="btn-blue wide" style="margin-top:12px" data-pos="' + held.id + '">Bekijk demo-positie</button>' : "") +
      '<a class="btn-blue big" id="tk-fomo" style="margin-top:12px;display:block;text-align:center;text-decoration:none" href="https://fomo.family/tokens/solana/' + encodeURIComponent(mint) + '" target="_blank" rel="noopener">Open op FOMO</a>' +
      '<a class="btn-grey wide" style="margin-top:10px;display:block;text-align:center;text-decoration:none" href="https://dexscreener.com/solana/' + encodeURIComponent(mint) + '" target="_blank" rel="noopener">Grafiek op DexScreener</a>';
    openSheet("sh-token"); const x = document.querySelector("#tk-body [data-x2]"); if (x) x.addEventListener("click", closeSheets);
  }
  function sendChat() { const v = $("c-in").value.trim(); if (!v) return; $("c-in").value = ""; chatExtra.push({ u: 1, t: v }, { t: "Deze app is alleen-lezen. Geef taken via Telegram, bijv. “live”, “live stop”, “live start”, “demo” of “demo reset”." }); renderChat(); }

  /* ---------- load ---------- */
  async function refreshTokens() {
    if (!S) return; if (refreshTokens.busy) { refreshTokens.again = true; return; } refreshTokens.busy = true; refreshTokens.again = false;
    try { await loadExternal();
    const ms = new Set(tokenMints()); (S.tokens || []).forEach((t) => ms.add(t.mint)); (S.open || []).concat(S.closed || []).forEach((p) => ms.add(p.mint)); Object.values(S.last_watch || {}).forEach((w) => ms.add(w.mint));
    if (homeTab === "tokens" && chip === "grad") graduated.forEach((m) => ms.add(m));
    const n = await loadTokens([...ms]); if (n || !refreshTokens.done) renderAll(); refreshTokens.done = true;
    } finally { refreshTokens.busy = false; if (refreshTokens.again) setTimeout(refreshTokens, 0); }
  }
  const SNAP_KEY = "cd_last_app", POLL_MS = 5000;
  function useSnapshot(j, cached) {
    if (j && j.bot) { try { localStorage.setItem(BOT_KEY, j.bot); } catch (e) {} } else if (j && !j.bot && botName()) j = Object.assign({}, j, { bot: botName() });  // bot name blank ~1 min after a desk restart
    if (j && !j.action_url && actUrl.last && Date.now() - actUrl.lastT < 3 * 60e3) j = Object.assign({}, j, { action_url: actUrl.last });
    if (j && j.action_url) { actUrl.last = j.action_url; actUrl.lastT = Date.now(); }
    if (j && j.fx && num(j.fx.usd_per_eur)) FX = Number(j.fx.usd_per_eur);
    RAW = j; S = viewOf(j); renderBookUI(); const age = (Date.now() - Date.parse(S.updatedAt || "")) / 1000; const b = $("error");
    if (!cached && isFinite(age) && age > 15 * 60) { b.textContent = "Gegevens zijn " + Math.round(age / 60) + " min oud. De watchdog herstart de desk."; b.classList.remove("hidden"); } else b.classList.add("hidden");
    renderAll();
    if (!isLive() && !isStarted() && !refresh.asked) { refresh.asked = true; openDeposit(); }
  }
  async function refresh() {
    if (!dataPath()) { $("login-panel").classList.remove("hidden"); return; }
    if (refresh.busy) return; refresh.busy = true;
    const ctl = "AbortController" in window ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), 8000) : 0;
    try {
      const r = await fetch(dataUrl("app.json"), { cache: "no-store", signal: ctl ? ctl.signal : undefined }); if (!r.ok) throw new Error("http " + r.status);
      const txt = await r.text(); refresh.fails = 0;
      if (txt !== refresh.last) { refresh.last = txt; useSnapshot(JSON.parse(txt), false); try { localStorage.setItem(SNAP_KEY, txt); } catch (e) {} }
      else $("error").classList.add("hidden");
      if (!refreshTokens.done) refreshTokens();
    } catch (e) { refresh.fails = (refresh.fails || 0) + 1; if (refresh.fails >= 2 || !S) { const b = $("error"); b.textContent = "Kon de demo-gegevens niet laden (" + (e.name === "AbortError" ? "timeout" : e.message) + "). Probeert opnieuw…"; b.classList.remove("hidden"); } }
    finally { clearTimeout(to); refresh.busy = false; }
  }
  function loadCached() { try { const t = localStorage.getItem(SNAP_KEY); if (t && dataPath()) useSnapshot(JSON.parse(t), true); } catch (e) {} }
  let pollT = 0;
  function schedule() { clearTimeout(pollT); if (document.hidden) return; pollT = setTimeout(async () => { await refresh(); schedule(); }, POLL_MS); }
  function wake() { if (document.hidden) { clearTimeout(pollT); return; } refresh().then(schedule); refreshTokens(); }
  captureFromHash(); wire(); wirePush(); wireScrub();
  if (savePair.just) setTimeout(() => toast("App gekoppeld", "Acties gaan nu direct naar de desk (geen Telegram-bevestiging)."), 600);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js?v=42", pageBase()).href, { updateViaCache: "none" }).then((reg) => reg.update().catch(() => {})).catch(() => {});
    let rl = false; const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener("controllerchange", () => { if (rl || !had) return; rl = true; location.reload(); });
  }
  loadCached(); refresh().then(schedule);
  setInterval(() => { if (!document.hidden) refreshTokens(); }, 30000);
  tickClock(); setInterval(() => { if (!document.hidden) tickClock(); }, 10000);
  document.addEventListener("visibilitychange", wake); addEventListener("pageshow", (e) => { if (e.persisted) wake(); }); addEventListener("online", wake);
})();
