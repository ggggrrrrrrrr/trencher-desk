/* copy mode (PAPER): Trader scout · Leader feed · Grok core · copy decisions. Reads d/<path>/copy.json. */
(function () {
  "use strict";
  const DATA_KEY = "desk_data_path";
  const TZ = "Europe/Amsterdam";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const trunc = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  function dataPath() { try { return localStorage.getItem(DATA_KEY) || ""; } catch (e) { return ""; } }
  function pageBase() {
    const loc = window.location; let path = loc.pathname || "/";
    if (!path.endsWith("/")) { const last = path.split("/").pop() || ""; if (last.includes(".")) path = path.slice(0, path.lastIndexOf("/") + 1); else path += "/"; }
    return new URL(path, loc.origin);
  }
  function hhmm(ts) { try { return new Date(ts).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }); } catch (e) { return "--:--"; } }
  function usd(v) { if (v == null || isNaN(v)) return "—"; v = Number(v); return v >= 1000 ? "$" + (v / 1000).toFixed(1) + "k" : "$" + v.toFixed(0); }

  const css = ".copy-rank{flex:0 0 18px;color:var(--mute);font-weight:700}.copy-wr{font-weight:700}.copy-wr.hi{color:var(--green)}" +
    ".copy-side{flex:0 0 34px;font-weight:700}.copy-side.buy{color:var(--green)}.copy-side.sell{color:var(--amber)}" +
    ".copy-why{white-space:normal!important;color:var(--mute)}.copy-pill{font-size:10px;color:var(--mute)}" +
    ".log .l .k-NOTE{color:var(--blue)}#copy-decisions .l{white-space:normal}#copy-decisions .l .s{white-space:normal}";
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function render(c) {
    const box = $("copy-section"); if (!box) return;
    if (!c || !c.enabled) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const s = c.stats || {};
    const leaders = c.leaders || [];
    const fresh = c.updatedAt && (Date.now() - Date.parse(c.updatedAt) < 6 * 60 * 1000);
    $("copy-meta").textContent = (fresh ? "live" : "stale") + " · " + (s.copies || 0) + " copies · " + (s.skips || 0) + " skips";
    ["dot-copy-scout", "dot-copy-feed", "dot-copy-core"].forEach((id) => { const d = $(id); if (d) d.className = "dot" + (fresh ? " on" : ""); });
    const r = c.rules || {};
    $("copy-scout-head").textContent = "top " + leaders.length + " · ≥" + r.min_winrate + "% win · ≥" + r.min_trades + " trades";
    $("copy-scout").innerHTML = leaders.length ? leaders.map((l, i) =>
      '<div class="r"><span class="copy-rank">' + (i + 1) + '</span><div><div class="nm">' + esc(trunc(l.name, 14)) + '</div><div class="meta">' + esc(l.wallet) + " · " + l.trades + " trades · " + esc(l.window) + "</div></div>" +
      '<div class="rt"><span class="copy-wr' + (l.winrate >= 70 ? " hi" : "") + '">' + Number(l.winrate).toFixed(0) + "%</span><small>" + (l.profit_30d_sol != null ? "+" + Number(l.profit_30d_sol).toFixed(0) + " SOL 30d" : "+" + Number(l.profit_sol).toFixed(0) + " SOL " + esc(l.window)) + "</small></div></div>"
    ).join("") : '<div class="empty">no wallet passes the win-rate gate yet</div>';
    $("copy-scout-foot").textContent = "source " + (c.source || "—") + (c.leaders_ts ? " · " + hhmm(c.leaders_ts) : "");
    const feed = c.feed || [];
    $("copy-feed-count").textContent = "· " + (s.swaps_seen || 0) + " swaps";
    $("copy-feed").innerHTML = feed.length ? feed.slice(0, 6).map((f) =>
      '<div class="r"><span class="copy-side ' + esc(f.side) + '">' + (f.side === "buy" ? "BUY" : "SELL") + '</span><div><div class="nm"><a href="' + esc(f.link) + '" rel="noopener" class="sym">$' + esc(trunc(f.symbol, 10)) + '</a></div><div class="meta">' + esc(trunc(f.leader, 14)) + " · " + hhmm(f.ts) + "</div></div>" +
      '<div class="rt">' + usd(f.usd) + "<small>" + Number(f.sol || 0).toFixed(2) + " SOL</small></div></div>"
    ).join("") : '<div class="empty">watching ' + leaders.length + " wallets · no swap since start</div>";
    const dec = c.decisions || [];
    $("copy-decisions").innerHTML = dec.length ? dec.slice(0, 10).map((d) => {
      const k = d.kind === "COPY" ? "COPY" : (d.kind === "SELL" ? "SELL" : (d.kind === "SKIP" ? "SKIP" : "NOTE"));
      const v = String(d.value || ""); const vc = /^-/.test(v) ? "down" : (/^\+/.test(v) || k === "COPY" ? "up" : "muted");
      return '<div class="l"><span class="t">' + hhmm(d.ts) + '</span><span class="k k-' + k + '">' + k + '</span><span class="s">$' + esc(trunc(d.symbol, 10)) + ' <span class="muted">' + esc(trunc(d.leader, 12)) + " · " + esc(d.text) + '</span></span><span class="x ' + vc + '">' + esc(v) + "</span></div>";
    }).join("") : '<div class="empty">waiting for the first leader swap</div>';
    $("copy-core-foot").textContent = "paper · " + r.stack_pct + "% per copy · stop −" + r.stop_pct + "% · exit when leader sells · liq ≥" + usd(r.min_liquidity_usd) + " · top10 <" + r.max_top10_pct + "% · chase ≤" + r.max_chase_pct + "%";
  }

  function wr(v) { return v == null ? "—" : Number(v).toFixed(0) + "%"; }
  function sgn(v) { v = Number(v || 0); return (v >= 0 ? "+$" : "−$") + Math.abs(v).toFixed(2); }
  function renderLearn(L) {
    const el = $("copy-learn"); if (!el || !L || !L.overall) return;
    const o = L.overall;
    $("learn-head").textContent = (o.n || 0) + " closed · win " + wr(o.win_rate) + " · net " + sgn(o.net_pnl);
    const rows = [];
    Object.keys(L.by_source || {}).forEach((k) => { const v = L.by_source[k];
      rows.push('<div class="r"><div><div class="nm">' + esc(k) + '</div><div class="meta">' + v.n + " closed · " + (v.open || 0) + ' open</div></div><div class="rt"><span class="copy-wr' + ((v.win_rate || 0) >= 50 ? " hi" : "") + '">' + wr(v.win_rate) + '</span><small class="' + ((v.net_pnl || 0) >= 0 ? "up" : "down") + '">' + sgn(v.net_pnl) + "</small></div></div>"); });
    (L.per_leader || []).forEach((v) => {
      rows.push('<div class="r"><div><div class="nm">' + esc(trunc(v.name, 14)) + '</div><div class="meta">leader · ' + v.n + " copies" + (v.benched ? " · benched" : "") + '</div></div><div class="rt"><span class="copy-wr' + ((v.win_rate || 0) >= 50 ? " hi" : "") + '">' + wr(v.win_rate) + '</span><small class="' + ((v.net_pnl || 0) >= 0 ? "up" : "down") + '">' + sgn(v.net_pnl) + "</small></div></div>"); });
    el.innerHTML = rows.join("") || '<div class="empty">no closed paper trades yet</div>';
    const props = (L.proposals || []).map((p) => "proposal: " + p.proposal + " (" + p.trades + " trades, win " + wr(p.win_rate) + ", " + sgn(p.net_pnl) + ")");
    const bench = (L.benched || []).map((b) => "benched " + b.leader);
    $("learn-foot").textContent = (bench.concat(props).join(" · ")) || "no changes proposed · leaders bench after 5 losing copies";
  }
  async function refreshLearn() {
    const d = dataPath(); if (!d) return;
    try {
      const r = await fetch(new URL("d/" + d + "/learn.json", pageBase()).href, { cache: "no-store", headers: { "Accept": "application/json" } });
      if (r.ok) renderLearn(await r.json());
    } catch (e) {}
  }
  refreshLearn();
  setInterval(refreshLearn, 30000);

  let busy = false;
  async function refresh() {
    const d = dataPath(); if (!d || busy) return; busy = true;
    try {
      const r = await fetch(new URL("d/" + d + "/copy.json", pageBase()).href, { cache: "no-store", headers: { "Accept": "application/json" } });
      if (r.ok) render(await r.json());
    } catch (e) { /* keep last view */ } finally { busy = false; }
  }
  window.deskCopyRender = render;
  refresh();
  setInterval(refresh, 10000);
})();
