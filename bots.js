/* v2.0 PART 4/5: Bots + Activity tabs, Audit discs and Coin sell sheet.
   Plan B reads token-free snapshots (bots.json, orders.json, coin/{mint}.json);
   plan A (APP_TOKEN) uses /api. PAPER only: sells go to the desk's paper fill. */
(function () {
  "use strict";
  const D = window.deskData;
  if (!D) return;
  const $ = (id) => document.getElementById(id);
  const esc = D.esc, hhmm = D.hhmm;
  const BOTS = [["scanner", "Scanner", "#0a84ff"], ["analyst", "Analyst", "#30d158"], ["brain", "Brain", "#bf5af2"],
                ["executor", "Executor", "#ff9f0a"], ["risk", "Risk", "#ff453a"]];
  let bots = null, openBot = null, tab = "home";

  async function get(file, apiPath) {
    if (D.dataPath()) return D.loadJson(D.dataUrl(file));
    if (D.token()) return D.api(apiPath);
    throw new Error("no login");
  }
  function cards() { const s = D.state(); return (s && s.agents) || []; }

  function renderBots() {
    const list = cards();
    $("bots-cards").innerHTML = BOTS.map(([id, name, color]) => {
      const a = list.find((x) => x.id === id) || {};
      const st = a.status || "idle";
      return '<article class="card bot-card" data-bot="' + id + '" style="--c:' + color + '"><div class="card-head"><span><b style="color:' + color + '">●</b> ' + esc(name) +
        '</span><span class="bot-st ' + (st === "running" ? "up" : "muted") + '">' + esc(st) + '</span></div><div class="bot-sub muted">' + esc(a.subtitle || "—") + "</div></article>";
    }).join("");
    const lane = bots && bots.lane;
    $("screen-off").textContent = (lane && lane.text) || "Browser lane off · PAPER";
    if (openBot) renderBotDetail(openBot);
  }
  function renderBotDetail(id) {
    const rows = (bots && bots.bots && bots.bots[id]) || [];
    const name = (BOTS.find((b) => b[0] === id) || [id, id])[1];
    $("bot-detail").classList.remove("hidden");
    $("bot-detail").innerHTML = '<div class="sec-head"><span>' + esc(name) + ' · last 20 decisions</span><button type="button" class="link-btn" id="bot-close">close</button></div><article class="card">' +
      (rows.length ? rows.map((r) => '<div class="dec-row"><span class="t">' + hhmm(r.ts) + '</span><span class="d">' + esc(r.decision || "") + '</span><span class="n">' +
        esc(r.symbol || r.name || String(r.mint || "").slice(0, 6)) + " · " + esc(r.reason || "") + "</span></div>").join("") : '<div class="empty">no decisions yet</div>') + "</article>";
    $("bot-close").onclick = () => { openBot = null; $("bot-detail").classList.add("hidden"); };
  }
  async function loadBots() {
    try { bots = await get("bots.json", "/api/bots/scanner/decisions"); if (bots && bots.rows) bots = null; } catch (e) { bots = null; }
    if (!bots && D.token() && !D.dataPath()) {
      bots = { bots: {}, lane: null };
      for (const b of BOTS) { try { bots.bots[b[0]] = (await D.api("/api/bots/" + b[0] + "/decisions")).rows; } catch (e) { bots.bots[b[0]] = []; } }
      try { bots.lane = await D.api("/api/lane"); } catch (e) {}
    }
    renderBots();
  }

  function renderActivity(orders) {
    const rows = D.activity();
    $("act2-count").textContent = rows.length + " events";
    $("activity-v2").innerHTML = rows.length ? rows.slice(0, 40).map((r) => '<div class="dec-row"><span class="t">' + hhmm(r.ts) + '</span><span class="n"><b>' + esc(r.title || r.kind) + "</b> · " +
      esc(r.subtitle || "") + '</span><span class="d" style="text-align:right">' + esc(r.value || "") + "</span></div>").join("") : '<div class="empty">nothing yet tonight</div>';
    const o = (orders && orders.rows) || [];
    $("orders-v2").innerHTML = o.length ? o.slice(0, 30).map((r) => '<div class="dec-row"><span class="t">' + hhmm(r.ts) + '</span><span class="d">' + esc(r.side + " " + r.status) + '</span><span class="n">' +
      esc((r.bot || "") + " · " + (r.usd != null ? "$" + Number(r.usd).toFixed(2) : (r.pct != null ? r.pct + "%" : "")) + " · " + (r.reason || "")) + "</span></div>").join("") : '<div class="empty">no orders yet</div>';
  }
  async function loadActivity() {
    let o = null; try { o = await get("orders.json", "/api/orders"); } catch (e) {}
    renderActivity(o);
  }

  async function coin(mint) {
    $("audit-discs").innerHTML = '<div class="empty">loading audit</div>';
    $("sell-sheet").classList.add("hidden");
    let c = null, a = null;
    try {
      if (D.dataPath()) { const j = await D.loadJson(D.dataUrl("coin/" + mint + ".json")); c = j.coin; a = j.audit; }
      else if (D.token()) { [c, a] = await Promise.all([D.api("/api/coin/" + mint), D.api("/api/audit/" + mint)]); }
    } catch (e) {}
    if (!a || !a.layers || !a.layers.length) { $("audit-discs").innerHTML = '<div class="empty">no audit for this coin yet</div>'; $("audit-meta").textContent = ""; }
    else {
      $("audit-discs").innerHTML = a.layers.map((l) => '<div class="disc ' + (l.pass ? "ok" : "red") + '"><i></i><span>' + esc(l.n + " " + l.name) + "</span><span>" + esc(l.value || "") + "</span></div>").join("");
      $("audit-meta").textContent = (a.score != null ? "score " + a.score + " · " : "") + a.layers.filter((l) => l.pass).length + "/" + a.layers.length + " layers";
    }
    $("audit-social").textContent = (a && a.social && a.social.text) || (a && a.social && a.social.value != null ? "Social " + a.social.value : "Social: off");
    if (c) {
      $("coin-v2").innerHTML = '<article class="card"><div class="kv"><span class="muted">shield</span><b><span class="shield ' + esc(c.shield) + '">' + esc(c.shield) + '</span></b></div>' +
        (c.score != null ? '<div class="kv"><span class="muted">score</span><b>' + esc(c.score) + "</b></div>" : "") +
        '<a class="kv link" href="' + esc(c.link) + '" rel="noopener"><span>open on FOMO</span><b>›</b></a></article>';
      if (c.open && c.open.length) sellSheet(c);
    } else { $("coin-v2").innerHTML = ""; }
  }
  function sellSheet(c) {
    const el = $("sell-sheet"); const sym = c.symbol || c.name || "coin";
    el.classList.remove("hidden");
    const plain = !D.token() || !!D.dataPath();
    el.innerHTML = "<b>Sell " + esc(sym) + "</b> <span class='pill pill-paper'>PAPER</span>" + (plain
      ? '<p class="muted">Read-only app: send <b>sell ' + esc(sym) + ' 50</b> to the desk bot in Telegram, then tap yes.</p>'
      : '<div class="row"><button data-p="25">25%</button><button data-p="50">50%</button><button data-p="100">100%</button></div><p class="muted" id="sell-msg"></p>');
    if (plain) return;
    el.querySelectorAll("[data-p]").forEach((b) => b.onclick = async () => {
      const p = b.getAttribute("data-p");
      if (!window.confirm("Sell " + p + "% of " + sym + " now? (PAPER)")) return;
      try {
        const r = await fetch("/api/sell/" + c.mint, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + D.token() }, body: JSON.stringify({ pct: Number(p), confirm: true }) });
        const j = await r.json(); $("sell-msg").textContent = r.ok ? "PAPER sold " + p + "%" : (j.detail || "not sold");
      } catch (e) { $("sell-msg").textContent = "desk offline"; }
    });
  }

  function select(name) {
    tab = name;
    document.querySelectorAll("#tabbar [data-tab]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tab") === name));
    D.setTab(name);
    if (name === "bots") loadBots();
    if (name === "activity") loadActivity();
  }
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => b.addEventListener("click", () => select(b.getAttribute("data-tab"))));
  $("bots-cards").addEventListener("click", (ev) => { const c = ev.target.closest("[data-bot]"); if (c) { openBot = c.getAttribute("data-bot"); renderBotDetail(openBot); } });
  setInterval(() => { if (tab === "bots") loadBots(); if (tab === "activity") loadActivity(); }, 10000);
  window.deskBots = { coin: coin, select: select };
})();
