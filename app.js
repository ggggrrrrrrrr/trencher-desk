(function () {
  "use strict";
  const DATA_KEY = "desk_data_path", START_KEY = "cd_demo_started", TZ = "Europe/Amsterdam";
  const DEX = "https://api.dexscreener.com/tokens/v1/solana/";
  const WSOL = "So11111111111111111111111111111111111111112";
  const MAJORS = [WSOL, "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"];
  const $ = (id) => document.getElementById(id);
  let S = null, range = "LIVE", feedF = "all", homeTab = "tokens", chip = "trending", screen = "home", openPosId = null;

  /* ---------- login link ---------- */
  function extractDataPath(raw) { const s = String(raw || "").trim(); const m = s.match(/(?:^|[?#&])d=([^&#\s]+)/); if (m && m[1]) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } } return /^[A-Za-z0-9_-]{32,}$/.test(s) ? s : ""; }
  function captureFromHash() {
    const all = (location.hash.replace(/^#/, "") + "&" + location.search.replace(/^\?/, "")).split("&").filter(Boolean);
    for (const p of all) { if (p.startsWith("d=")) { try { localStorage.setItem(DATA_KEY, decodeURIComponent(p.slice(2))); } catch (e) {} } else if (p.startsWith("k=") || p.startsWith("b=")) savePushParams("#" + p); }
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
  const num = (v) => (v == null || v === "" || !isFinite(Number(v))) ? null : Number(v);
  function money(v, d) { v = num(v); if (v == null) return "$—"; const dd = d != null ? d : 2; return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dd, maximumFractionDigits: dd }); }
  function sMoney(v) { v = num(v); if (v == null) return "—"; return (v >= 0 ? "+" : "-") + money(Math.abs(v)); }
  function pct(v, d) { v = num(v); if (v == null) return "—"; return (v >= 0 ? "+" : "") + v.toFixed(d == null ? 1 : d) + "%"; }
  function cls(v) { v = num(v); return v == null || v === 0 ? "" : v > 0 ? "g" : "r"; }
  function big(v) { v = num(v); if (v == null) return '$—<span class="dec">.——</span>'; const s = money(v); const i = s.lastIndexOf("."); return esc(s.slice(0, i)) + '<span class="dec">' + esc(s.slice(i)) + "</span>"; }
  function kfmt(v) { v = num(v); if (v == null) return "—"; const a = Math.abs(v); if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B"; if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M"; if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K"; return "$" + v.toFixed(0); }
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  function price(v) { v = num(v); if (v == null || v <= 0) return "$—"; if (v >= 1) return "$" + v.toFixed(v >= 100 ? 2 : 4); const s = v.toFixed(20); const m = s.match(/^0\.(0*)(\d{4})/); if (!m) return "$" + v.toPrecision(4); const z = m[1].length; if (z < 3) return "$" + v.toFixed(z + 4); return "$0.0" + String(z).split("").map((c) => SUB[+c]).join("") + m[2]; }
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
    for (let i = 0; i < need.length; i += 30) {
      try {
        const r = await fetch(DEX + need.slice(i, i + 30).join(","), { cache: "no-store" }); if (!r.ok) continue;
        const arr = await r.json(); const best = {};
        for (const p of arr || []) { const a = p && p.baseToken && p.baseToken.address; if (!a) continue; const l = (p.liquidity && p.liquidity.usd) || 0; if (!best[a] || l > best[a].l) best[a] = { p: p, l: l }; }
        for (const a in best) { const p = best[a].p; TOK[a] = { at: Date.now(), sym: p.baseToken.symbol, name: p.baseToken.name, price: num(p.priceUsd), mc: num(p.marketCap) || num(p.fdv), ch: p.priceChange ? num(p.priceChange.h24) : null, img: (p.info && p.info.imageUrl) || null, dex: p.dexId, pool: p.pairAddress }; }
        for (const m of need.slice(i, i + 30)) if (!TOK[m]) TOK[m] = { at: Date.now(), none: true };
      } catch (e) {}
    }
  }
  let trending = [], graduated = [], extAt = 0;
  async function loadExternal() {
    if (Date.now() - extAt < 60000) return; extAt = Date.now();
    try { const r = await fetch("https://api.dexscreener.com/token-boosts/top/v1", { cache: "no-store" }); const a = await r.json(); trending = (a || []).filter((x) => x.chainId === "solana").map((x) => x.tokenAddress).filter((v, i, s) => s.indexOf(v) === i).slice(0, 12); } catch (e) {}
    try { const r = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", { cache: "no-store" }); const a = await r.json(); graduated = (a || []).filter((x) => x.chainId === "solana" && /pump$/.test(x.tokenAddress || "")).map((x) => x.tokenAddress).slice(0, 24); } catch (e) {}
  }

  /* ---------- HOME ---------- */
  function leaders() { return (S && S.leaders) || []; }
  function isPub(l) { return l && l.group === "public"; }
  function pnl30(l) { return isPub(l) ? "◎" + Math.round(l.pnl_30d_sol || 0) + " SOL" : kfmt(l.pnl_30d_usd); }
  function rankLbl(l) { return isPub(l) ? "publiek #" + l.pub_rank : "#" + l.rank; }
  function fomoTracked() { return leaders().filter((l) => !isPub(l) && l.tracked).length; }
  function renderHome() {
    $("h-bal").innerHTML = big(S.balance);
    const ch = $("h-ch"); ch.className = cls(S.change24h) || "g"; ch.textContent = sMoney(S.change24h);
    const started = isStarted();
    $("h-dep-pill").classList.toggle("hidden", started); $("h-btns").classList.toggle("hidden", !started);
    const st = S.leader_stats || {};
    $("h-traders").innerHTML = leaders().filter((l) => l.tracked).concat(leaders().filter((l) => !l.tracked)).map((l) => '<button type="button" class="tc' + (l.tracked ? "" : " off") + '" data-tr="' + esc(l.handle) + '"><div class="n">' + av(l.handle) + esc(l.handle) + '</div><div class="st"><b>' + pnl30(l) + "</b> 30D" + (isPub(l) ? " · publiek" : "") + " · <b>" + ((st[l.handle] || {}).copies || 0) + "</b> " + (l.tracked ? "trades" : "· geen wallet") + "</div></button>").join("");
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
    box.innerHTML = rows.map((m) => { const t = TOK[m]; const c = t.ch; return '<div class="tr">' + tokIcon(m) + '<div class="nm"><b>' + esc(t.sym || short(m)) + "</b><span>" + (t.mc ? kfmt(t.mc) + " MC" : esc(t.name || "")) + '</span></div><div class="px"><b class="' + (c > 0 ? "g" : c < 0 ? "r" : "") + '">' + price(t.price) + '</b><span class="' + (c >= 0 ? "g" : "r") + '">' + (c == null ? "" : (c >= 0 ? "▲" : "▼") + Math.abs(c).toFixed(2) + "%") + "</span></div></div>"; }).join("");
  }
  /* ---------- activity rows ---------- */
  function symOf(a) { const t = TOK[a.mint]; return (a.symbol && !/…$/.test(a.symbol) ? a.symbol : null) || (t && t.sym) || short(a.mint) || "—"; }
  function actRow(a) {
    const sym = symOf(a); let title, sub, right;
    if (a.kind === "copies") {
      title = "Copied " + esc(sym); sub = (a.lag != null ? a.lag + "s after " : "after ") + esc(a.leader) + " · " + hhmm(a.ts);
      right = "<b>" + money(a.size) + "</b><span>" + (a.mcap ? "at " + kfmt(a.mcap) + " MC" : "") + "</span>";
    } else if (a.kind === "exits") {
      const r = String(a.reason || ""); const tp = /^TP/.test(r), stop = /^stop/.test(r);
      title = (tp ? "Took profit · " : stop ? "Stopped · " : "Sold ") + esc(sym);
      sub = (tp ? esc(r.replace(/\s*\(.*\)/, "")) + " rule" : stop ? "stop rule · −15%" : esc(a.leader) + " sold · same exit") + " · " + hhmm(a.ts);
      right = '<b class="' + cls(a.gain) + '">' + sMoney(a.gain) + "</b><span>" + pct(a.pct) + "</span>";
    } else {
      title = esc(a.text); sub = "rule · " + hhmm(a.ts); right = "";
      return '<div class="fr"><div class="ic"><span class="ti" style="background:#1c1c1f;color:#ff9f0a">R</span></div><div class="m"><b style="white-space:normal">' + title + "</b><span>" + sub + '</span></div><div class="v">' + right + "</div></div>";
    }
    return '<div class="fr" data-pos="' + esc(a.pos || "") + '"><div class="ic">' + tokIcon(a.mint, sym) + av(a.leader) + '</div><div class="m"><b>' + title + "</b><span>" + sub + '</span></div><div class="v">' + right + "</div></div>";
  }
  function feedHtml(list, f) { const rows = (list || []).filter((a) => f === "all" || a.kind === f); return rows.length ? rows.map(actRow).join("") : '<div class="empty">' + (f === "all" ? "Waiting for the first copy… De desk kijkt naar " + S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + "." : "Nog niets in deze lijst.") + "</div>"; }
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
    for (const a of acts) { const t = Date.parse(a.ts), x = X(t), y = Y(vAt(t)); const c = a.kind === "copies" ? "#3b82ff" : (a.gain > 0 ? "#34d659" : "#ff453a"); marks += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + c + '" stroke="#000" stroke-width="1.5"/>'; }
    const wins = acts.filter((a) => a.kind === "exits" && a.pnl > 0).slice(0, 3);
    for (const a of wins) { const t = Date.parse(a.ts); labels += '<span class="c-lab" style="left:' + Math.min(85, Math.max(12, X(t) / W * 100)).toFixed(1) + "%;top:" + (Y(vAt(t)) / H * 100).toFixed(1) + '%">' + esc(symOf(a)) + " " + sMoney(a.pnl).replace(".00", "") + "</span>"; }
    const lx = X(pts[pts.length - 1].t), ly = Y(pts[pts.length - 1].v);
    svg.innerHTML = '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34d659" stop-opacity=".22"/><stop offset="1" stop-color="#34d659" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + " L" + lx.toFixed(1) + " " + H + " L" + X(t0).toFixed(1) + " " + H + ' Z" fill="url(#lg)"/><path d="' + d + '" fill="none" stroke="#34d659" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' + marks +
      '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="5.5" fill="#34d659" stroke="#0a2a12" stroke-width="2"/>';
    $("l-labels").innerHTML = labels;
  }
  function renderLive() {
    const tr = leaders().filter((l) => l.tracked);
    $("l-stack").innerHTML = tr.slice(0, 4).map((l) => av(l.handle)).join("");
    $("l-n").textContent = S.tracked + " trader" + (S.tracked === 1 ? "" : "s");
    $("l-open").textContent = (S.open || []).length + " open";
    $("l-bal").innerHTML = big(S.balance);
    const c = $("l-ch"); c.className = cls(S.since_deposit) || "g"; c.textContent = (S.since_deposit >= 0 ? "▲ " : "▼ ") + money(Math.abs(S.since_deposit)) + " (" + pct(S.since_deposit_pct, 0) + ")";
    renderLiveChart();
    $("l-gridsub").textContent = S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + " · " + S.delay_s + "s → Grok Bot";
    const lw = S.last_watch || {}; const cells = tr.concat(leaders().filter((l) => !l.tracked)).slice(0, 4);
    $("l-grid").innerHTML = cells.map((l) => {
      const w = lw[l.handle]; let a = l.tracked ? "watching for the first buy…" : "geen wallet · wacht op FOMO-koppeling";
      if (w) { const t = TOK[w.mint]; a = (w.value === "buy" ? '<span class="bt">bought</span> ' : '<span class="sd">sold</span> ') + esc((t && t.sym) || short(w.mint)) + (t && t.mc ? " · " + kfmt(t.mc) : "") + " · " + ago(w.ts); }
      const mine = (S.open || []).find((p) => p.leader === l.handle) || (S.closed || []).find((p) => p.leader === l.handle);
      let res = '<div class="res"><span class="mut" style="font-weight:600">' + (l.tracked ? "nog geen kopie" : rankLbl(l) + " · " + pnl30(l) + " 30D") + "</span></div>";
      if (mine) { const isOpen = (S.open || []).some((p) => p.id === mine.id); const v = isOpen ? mine.pct : mine.pct; res = '<div class="res ' + (v > 0 ? "win" : v < 0 ? "loss" : "") + '" data-pos="' + mine.id + '">' + tokIcon(mine.mint, mine.symbol) + '<span class="' + cls(v) + '">' + pct(v) + '</span><span class="v">' + (isOpen ? money(mine.value) : esc(mine.reason || "")) + "</span></div>"; }
      return '<div class="cg' + (w && Date.now() - Date.parse(w.ts) < 120e3 ? " act" : "") + '" data-tr="' + esc(l.handle) + '" style="' + (l.tracked ? "" : "opacity:.5") + '"><div><div class="t">' + av(l.handle) + "<b>" + esc(l.handle) + '</b><span class="s30">' + S.delay_s + 's</span></div><div class="a">' + a + "</div></div>" + res + "</div>";
    }).join("");
    const ag = S.agents || {}, lc = S.last_copy;
    const A = [["w", "watcher", "Watcher", "#38c6f4", "watching " + S.tracked], ["c", "copier", "Copier", "#ff9f0a", S.pending ? S.pending + " waiting · 30s" : lc ? esc(symOf(lc)) + " in " + (lc.lag || 30) + "s" : "idle"], ["e", "executor", "Executor", "#a259ff", lc ? "bought " + esc(symOf(lc)) : "no fills yet"], ["k", "risk", "Risk", "#ff453a", "−" + S.rules.stop_pct + "% · +" + S.rules.tp1_pct + "/+" + S.rules.tp2_pct]];
    $("l-agents").innerHTML = A.map((x) => '<div class="ag ' + x[0] + ((ag[x[1]] || {}).ok ? "" : " dead") + '"><div class="h"><i style="background:' + x[3] + '">●</i>' + x[2] + '</div><div class="s">' + x[4] + "</div></div>").join("");
    $("l-actsub").textContent = copiesTonight() + " copies tonight";
    $("l-feed").innerHTML = feedHtml((S.activity || []).slice(0, 12), "all");
  }

  /* ---------- AGENTS (task chat, generated from the real rules) ---------- */
  let chatExtra = [];
  function renderChat() {
    const r = S.rules, tr = leaders().filter((l) => l.tracked), top = leaders().slice(0, 4).map((l) => "<b>@" + esc(l.handle) + "</b>").join(", ");
    $("c-sub").textContent = "new task · copy desk · " + money(S.balance);
    const user = "copy the top " + S.top_n + " traders on fomo by 30D PnL (" + top + ", …). buy " + S.delay_s + "s after they buy, " + r.ticket_pct + "% per copy, max " + r.max_open + " open. sell when they sell. stop −" + r.stop_pct + "%, take 50% profit at +" + r.tp1_pct + "%, the rest at +" + r.tp2_pct + "%.";
    const waiting = S.top_n - fomoTracked();
    const bot = "On it. " + money(S.balance) + " on " + S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + ". Every buy copied " + S.delay_s + "s later, same exits, stop −" + r.stop_pct + "%, 50% out at +" + r.tp1_pct + "%, rest at +" + r.tp2_pct + "%. " + (S.public_n ? S.public_n + " of them are publieke Solana-traders (kolscan.io leaderboard). " : "") + (waiting > 0 ? waiting + " of the top " + S.top_n + " wait for the FOMO connection (no wallet yet)." : "") + " Demo only.";
    const chips = tr.map((l) => '<span class="cchip">' + av(l.handle) + esc(l.handle) + "</span>").join("") + [["Watcher", "#38c6f4"], ["Copier", "#ff9f0a"], ["Executor", "#a259ff"], ["Risk", "#ff453a"]].map((x) => '<span class="cchip"><i style="background:' + x[1] + '"></i>' + x[0] + "</span>").join("");
    $("c-body").innerHTML = '<div class="bub-u">' + user + '</div><div class="bot-row"><span class="gk"></span><div class="bub-b">' + esc(bot) + '</div></div><div class="cchips">' + chips + "</div>" +
      chatExtra.map((m) => (m.u ? '<div class="bub-u" style="margin-top:18px">' + esc(m.t) + "</div>" : '<div class="bot-row"><span class="gk"></span><div class="bub-b">' + esc(m.t) + "</div></div>")).join("");
  }

  /* ---------- ACTIVITY / ACCOUNT ---------- */
  function renderActivity() { $("a-sub").textContent = "tonight · copying " + S.tracked + " trader" + (S.tracked === 1 ? "" : "s") + " " + S.delay_s + "s behind"; $("a-feed").innerHTML = feedHtml(S.activity, feedF); }
  function renderAccount() { const r = S.rules; $("ac-tr").textContent = fomoTracked() + " van top " + S.top_n + " gevolgd" + (S.public_n ? " + " + S.public_n + " publieke Solana-traders" : ""); $("ac-size").textContent = r.ticket_pct + "% · max " + r.max_open + " open"; $("ac-rules").textContent = "−" + r.stop_pct + "% · 50% @+" + r.tp1_pct + "% · rest @+" + r.tp2_pct + "% · same exits"; }
  /* ---------- POSITION detail ---------- */
  function findPos(id) { const o = (S.open || []).find((p) => String(p.id) === String(id)); if (o) return { p: o, open: true }; const c = (S.closed || []).find((p) => String(p.id) === String(id)); return c ? { p: c, open: false } : null; }
  async function candles(pool, fromMs, toMs) {
    try {
      const span = (toMs - fromMs) / 60e3; const agg = span > 600 ? 15 : span > 200 ? 5 : 1;
      const r = await fetch("https://api.geckoterminal.com/api/v2/networks/solana/pools/" + encodeURIComponent(pool) + "/ohlcv/minute?aggregate=" + agg + "&limit=300&currency=usd", { headers: { Accept: "application/json" } });
      if (!r.ok) return null; const j = await r.json(); const l = ((j.data || {}).attributes || {}).ohlcv_list || [];
      return l.map((c) => ({ t: c[0] * 1000, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] })).filter((c) => c.t >= fromMs - 5 * 60e3 && c.t <= toMs + 5 * 60e3).sort((a, b) => a.t - b.t);
    } catch (e) { return null; }
  }
  async function renderPos() {
    const f = findPos(openPosId); if (!f) { setScreen("live"); return; }
    const p = f.p, D = (S.detail || {})[p.id] || {}, sup = D.supply, r = S.rules;
    const mc = (px) => sup ? px * sup : px; const fmtV = (px) => sup ? kfmt(mc(px)) : price(px);
    const nowPx = f.open ? p.price : null;
    $("p-mc").textContent = f.open ? fmtV(nowPx) : (D.now_mcap ? kfmt(D.now_mcap) : fmtV(p.entry_usd));
    const since = p.pct; const s = $("p-since"); s.className = "sb " + (cls(since) || "g"); s.textContent = (since >= 0 ? "▲ " : "▼ ") + Math.abs(since || 0).toFixed(1) + "% since Grok Bot copied";
    const lag = p.lag_s != null ? p.lag_s : (D.leader_ts ? Math.round((Date.parse(p.opened) - Date.parse(D.leader_ts)) / 1000) : null);
    $("p-who").innerHTML = av(p.leader, "xs") + "<b>" + esc(p.leader) + "</b> bought at " + (D.leader_entry_mcap ? kfmt(D.leader_entry_mcap) : price(p.leader_entry_usd)) + ' · <span class="bd"></span><b>Grok Bot</b> ' + (lag != null ? lag + "s later" : "later") + " at " + (D.entry_mcap ? kfmt(D.entry_mcap) : price(p.entry_usd));
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
    $("p-cards").innerHTML = pos + risk + '<div class="tl">' + tl + "</div>";
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
  function exitBanner(r, pc) { r = String(r || ""); if (/^TP/.test(r)) return "TOOK PROFIT · " + r.match(/\+\d+%/)[0]; if (/^stop/.test(r)) return "STOPPED · " + pct(pc, 0); if (/trader/.test(r)) return "SAME EXIT · " + pct(pc, 0); return r.toUpperCase(); }
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
    L += '<span class="c-lab blue" style="' + pc(Math.max(W * 0.24, X(t1)), Y(e) - 26) + '">Grok Bot +' + (p.lag_s != null ? p.lag_s : S.delay_s) + "s</span>";
    L += '<span class="c-lab blue" style="' + pc(W - 52, Y(e) + 24) + '">entry ' + esc(lab(e)) + "</span>";
    L += '<span class="c-lab green left" style="' + pc(6, Y(lines[0].px) + 20) + '">' + esc(lines[0].t) + "</span>";
    L += '<span class="c-lab green left" style="' + pc(6, Y(lines[1].px) + 20) + '">' + esc(lines[1].t) + "</span>";
    L += '<span class="c-lab red left" style="' + pc(W * 0.3, Y(lines[2].px) + 20) + '">' + esc(lines[2].t) + "</span>";
    if (p.leader_entry_usd) L += '<span style="position:absolute;' + pc(Math.max(24, X(tL)), Math.min(H - VH - 40, Y(p.leader_entry_usd) + 10)) + ';transform:translate(-50%,0);text-align:center;font-size:11px;color:#fff;font-weight:600">' + av(p.leader, "xs") + "<br>" + esc(p.leader) + "</span>";
    if (!real) L += '<span style="position:absolute;left:8px;bottom:6px;font-size:11px;color:#6e6e73">koersdata (GeckoTerminal) niet beschikbaar · lijn tussen echte punten</span>';
    $("p-labels").innerHTML = L;
  }
  /* ---------- sheets ---------- */
  function isStarted() { try { return localStorage.getItem(START_KEY) === "1"; } catch (e) { return false; } }
  function openSheet(id) { $("ov").classList.remove("hidden"); document.querySelectorAll(".sheet").forEach((s) => s.classList.add("hidden")); $(id).classList.remove("hidden"); }
  function closeSheets() { $("ov").classList.add("hidden"); document.querySelectorAll(".sheet").forEach((s) => s.classList.add("hidden")); }
  function toast(t, s) { $("toast-t").textContent = t; $("toast-s").textContent = s || ""; const el = $("toast"); el.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add("hidden"), 3500); }
  function openDeposit() {
    const start = (S && S.book && S.book.start_usd) || 100, go = $("dep-go");
    $("dep-amt").innerHTML = esc(money(start)) + '<span class="caret"></span>';
    go.className = "btn-blue big"; go.disabled = isStarted(); go.textContent = isStarted() ? "Demo loopt al · reset via Telegram" : "Start demo " + money(start);
    $("dep-note").textContent = "De demo start altijd met " + money(start) + ". Geen echt geld.";
    openSheet("sh-dep");
  }
  function openNight() {
    const sum = (S.summary || {}).all || {}, start = S.book.start_usd;
    const h = +new Date().toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false });
    $("n-title").textContent = h >= 6 && h < 12 ? "Night done" : "Tonight · so far";
    $("n-bal").textContent = money(S.balance);
    $("n-line").className = "sm b6 " + (cls(S.since_deposit) || "g"); $("n-line").textContent = money(start) + " → " + money(S.balance) + " · " + pct(S.since_deposit_pct);
    const tp = (S.activity || []).filter((a) => a.kind === "exits" && /^TP/.test(a.reason || "")).length;
    $("n-grid").innerHTML = '<div class="cell"><span>Copies</span><b>' + (S.activity || []).filter((a) => a.kind === "copies").length + " · " + (sum.wins || 0) + "W " + (sum.losses || 0) + 'L</b></div><div class="cell"><span>Net profit</span><b class="' + (cls(S.since_deposit) || "") + '">' + sMoney(S.since_deposit) + '</b></div><div class="cell"><span>Take profit hits</span><b>' + tp + '</b></div><div class="cell"><span>Behind traders</span><b>' + S.delay_s + "s · same exits</b></div>";
    const st = S.leader_stats || {}; const ks = Object.keys(st).sort((a, b) => st[b].pnl - st[a].pnl);
    $("n-tr").innerHTML = ks.length ? ks.map((k) => '<div class="ntr">' + av(k) + esc(k) + ' <span class="mut">· ' + st[k].copies + " cop" + (st[k].copies === 1 ? "y" : "ies") + '</span><b class="' + cls(st[k].pnl) + '">' + sMoney(st[k].pnl) + "</b></div>").join("") : '<div class="mut sm">Nog geen kopieën in deze demo.</div>';
    openSheet("sh-night");
  }
  function openTrader(handle) {
    const l = leaders().find((x) => x.handle === handle); if (!l) return; const r = S.rules;
    const mine = (S.open || []).filter((p) => p.leader === handle).concat((S.closed || []).filter((p) => p.leader === handle));
    const rows = mine.length ? mine.map((p) => { const isOpen = (S.open || []).some((o) => o.id === p.id); const g = isOpen ? p.value - p.size_usd * p.remaining : p.pnl; return '<div class="fr" data-pos="' + p.id + '"><div class="ic">' + tokIcon(p.mint, p.symbol) + '</div><div class="m"><b>' + esc(p.symbol || short(p.mint)) + "</b><span>" + money(p.size_usd) + " in · " + (isOpen ? "open · live" : esc(exitName(p.reason))) + '</span></div><div class="v"><b class="' + cls(g) + '">' + sMoney(g) + "</b><span>" + pct(p.pct) + "</span></div></div>"; }).join("") : "";
    $("tr-body").innerHTML = '<div class="sh-h left">' + av(handle, "big") + '<div><b style="font-size:20px">' + esc(handle) + '</b><div class="mut xs">' + rankLbl(l) + " · " + pnl30(l) + " 30D PnL" + (isPub(l) ? " · publieke Solana-trader (bron kolscan.io)" : "") + "</div></div>" + (l.tracked ? '<span class="cchip" style="margin-left:auto;color:#34d659">● copying</span>' : '<span class="cchip" style="margin-left:auto;color:#8e8e93">geen wallet</span>') + "</div>" +
      '<div class="mut xs b6" style="letter-spacing:.6px;margin:8px 0 6px">GROK BOT COPIED FROM ' + esc(handle.toUpperCase()) + '</div><div class="card" style="margin-top:0;padding:6px 14px">' + rows + '<div class="mut sm" style="padding:12px 0">' + (l.tracked ? "watching " + esc(handle) + " for the next buy…" + (l.verified ? "" : " (wallet niet geverifieerd)") : esc(l.why_not || "")) + "</div></div>" +
      '<div class="mut xs b6" style="letter-spacing:.6px;margin:16px 0 6px">COPY RULES</div><div class="g2" style="margin-top:0"><div class="cell"><span>Delay</span><b>' + S.delay_s + 's after each buy</b></div><div class="cell"><span>Exits</span><b>same as ' + esc(handle) + '</b></div><div class="cell"><span>Take profit</span><b>50% +' + r.tp1_pct + "% · rest +" + r.tp2_pct + '%</b></div><div class="cell"><span>Stop</span><b>−' + r.stop_pct + "% · " + r.ticket_pct + "% per copy</b></div></div>";
    openSheet("sh-trader");
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
    $("d-line").innerHTML = money(S.book.start_usd) + " in → " + money(S.balance) + ' nu · <span class="' + cls(S.since_deposit) + '">' + pct(S.since_deposit_pct) + "</span>";
    const tr = leaders().filter((l) => l.tracked); $("d-tr").innerHTML = '<span class="stack">' + tr.slice(0, 4).map((l) => av(l.handle)).join("") + "</span> " + tr.length + " trader" + (tr.length === 1 ? "" : "s");
    $("done").classList.remove("hidden"); confetti();
  }

  /* ---------- navigation ---------- */
  function setScreen(s) {
    screen = s; ["home", "live", "agents", "activity", "account", "pos"].forEach((k) => $("s-" + k).classList.toggle("hidden", k !== s));
    document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.getAttribute("data-s") === (s === "pos" ? "live" : s)));
    scrollTo(0, 0); if (S) renderAll();
  }
  function openPos(id) { if (!id) return; openPosId = String(id); closeSheets(); setScreen("pos"); }
  function renderAll() {
    if (!S) return;
    if (screen === "home") renderHome(); else if (screen === "live") renderLive(); else if (screen === "agents") renderChat(); else if (screen === "activity") renderActivity(); else if (screen === "account") renderAccount(); else if (screen === "pos" && !renderAll.busy) { renderAll.busy = true; renderPos().finally(() => { renderAll.busy = false; }); }
  }
  function seg(el, attr, fn) { el.addEventListener("click", (ev) => { const b = ev.target.closest("[" + attr + "]"); if (!b) return; el.querySelectorAll("[" + attr + "]").forEach((x) => x.classList.toggle("on", x === b)); fn(b.getAttribute(attr)); }); }
  function wire() {
    document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => setScreen(b.getAttribute("data-s"))));
    $("p-back").addEventListener("click", () => setScreen("live"));
    seg($("l-tf"), "data-r", (r) => { range = r; renderLiveChart(); });
    seg($("a-chips"), "data-f", (f) => { feedF = f; renderActivity(); });
    seg($("h-tabs"), "data-t", (t) => { homeTab = t; renderTokenList(); refreshTokens(); });
    seg($("h-chips"), "data-c", (c) => { chip = c; renderTokenList(); refreshTokens(); });
    document.addEventListener("click", (ev) => { const t = ev.target.closest("[data-tr]"); if (t && !ev.target.closest("[data-pos]")) { openTrader(t.getAttribute("data-tr")); return; } const p = ev.target.closest("[data-pos]"); if (p && p.getAttribute("data-pos")) openPos(p.getAttribute("data-pos")); });
    $("ov").addEventListener("click", closeSheets); document.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", closeSheets));
    $("h-dep-pill").addEventListener("click", openDeposit); $("h-dep").addEventListener("click", openDeposit);
    $("h-wd").addEventListener("click", () => { const n = (S.open || []).length; $("wd-pos").textContent = n ? n + " open" : "all closed ✓"; openSheet("sh-wd"); });
    $("wd-go").addEventListener("click", showDone); $("d-close").addEventListener("click", () => $("done").classList.add("hidden"));
    $("l-night").addEventListener("click", openNight);
    $("dep-pad").addEventListener("click", (ev) => { if (!ev.target.closest("button")) return; const a = $("dep-amt"); a.classList.add("shake"); setTimeout(() => a.classList.remove("shake"), 120); $("dep-note").textContent = "Demo-bedrag staat vast op " + money((S && S.book.start_usd) || 100) + " (geen echt geld)."; });
    $("dep-go").addEventListener("click", () => { if (isStarted()) return; try { localStorage.setItem(START_KEY, "1"); } catch (e) {} const g = $("dep-go"); g.className = "btn-blue big okd"; g.textContent = "✓ Gestart"; setTimeout(() => { closeSheets(); renderAll(); toast("Demo gestart", money((S && S.book.start_usd) || 100) + " demo-saldo · geen echt geld"); }, 900); });
    $("c-send").addEventListener("click", sendChat); $("c-in").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
    $("login-save").addEventListener("click", () => { const d = extractDataPath($("login-link").value); if (!d) return; try { localStorage.setItem(DATA_KEY, d); } catch (e) {} $("login-panel").classList.add("hidden"); refresh(); });
  }
  function sendChat() { const v = $("c-in").value.trim(); if (!v) return; $("c-in").value = ""; chatExtra.push({ u: 1, t: v }, { t: "Deze app is alleen-lezen. Geef taken via Telegram, bijv. “demo”, “demo reset” of “set app.ticket_pct to 20”. Echt geld is nog niet actief." }); renderChat(); }

  /* ---------- load ---------- */
  async function refreshTokens() {
    if (!S) return; await loadExternal();
    const ms = new Set(tokenMints()); (S.tokens || []).forEach((t) => ms.add(t.mint)); (S.open || []).concat(S.closed || []).forEach((p) => ms.add(p.mint)); Object.values(S.last_watch || {}).forEach((w) => ms.add(w.mint));
    if (homeTab === "tokens" && chip === "grad") graduated.forEach((m) => ms.add(m));
    await loadTokens([...ms]); renderAll();
  }
  async function refresh() {
    if (!dataPath()) { $("login-panel").classList.remove("hidden"); return; }
    try {
      const r = await fetch(dataUrl("app.json"), { cache: "no-store" }); if (!r.ok) throw new Error("http " + r.status);
      S = await r.json(); const age = (Date.now() - Date.parse(S.updatedAt || "")) / 1000; const b = $("error");
      if (isFinite(age) && age > 15 * 60) { b.textContent = "Gegevens zijn " + Math.round(age / 60) + " min oud. De watchdog herstart de desk."; b.classList.remove("hidden"); } else b.classList.add("hidden");
      renderAll(); refreshTokens();
      if (!isStarted() && !refresh.asked) { refresh.asked = true; openDeposit(); }
    } catch (e) { const b = $("error"); b.textContent = "Kon de demo-gegevens niet laden (" + e.message + "). Opnieuw over 10s."; b.classList.remove("hidden"); }
  }
  captureFromHash(); wire(); wirePush();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js?v=30", pageBase()).href, { updateViaCache: "none" }).then((reg) => reg.update().catch(() => {})).catch(() => {});
    let rl = false; const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener("controllerchange", () => { if (rl || !had) return; rl = true; location.reload(); });
  }
  refresh(); setInterval(refresh, 10000);
})();
