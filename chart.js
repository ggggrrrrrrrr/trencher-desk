/* trencher desk charts: smooth area chart + sparklines. No chart library. */
(function (global) {
  const GREEN = "#3ddc84", RED = "#ff5a52";

  function setup(canvas, fallbackH) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 358;
    const h = canvas.clientHeight || fallbackH;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function parse(points) {
    return (points || []).map((p) => ({ t: Date.parse(p.t || p.ts) || 0, v: Number(p.v) }))
      .filter((p) => p.t && Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  }

  // Bucket to at most n points by time, keeping the last point exact.
  function bucket(pts, n) {
    if (pts.length <= n) return pts;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
    const out = [];
    let cur = -1;
    for (const p of pts) {
      const b = Math.min(n - 1, Math.floor((p.t - t0) / span * n));
      if (b !== cur) { out.push({ t: p.t, v: p.v }); cur = b; }
      else out[out.length - 1] = { t: p.t, v: p.v };
    }
    out[out.length - 1] = pts[pts.length - 1];
    return out;
  }

  // Monotone cubic path through xy points (no overshoot).
  function smoothPath(ctx, xy, moveFirst) {
    const n = xy.length;
    if (!n) return;
    if (moveFirst) ctx.moveTo(xy[0][0], xy[0][1]); else ctx.lineTo(xy[0][0], xy[0][1]);
    if (n < 3) { for (let i = 1; i < n; i++) ctx.lineTo(xy[i][0], xy[i][1]); return; }
    const d = [], m = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = xy[i + 1][0] - xy[i][0] || 1e-6;
      d.push((xy[i + 1][1] - xy[i][1]) / dx);
    }
    m.push(d[0]);
    for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    for (let i = 0; i < n - 1; i++) {
      const dx = (xy[i + 1][0] - xy[i][0]) / 3;
      ctx.bezierCurveTo(xy[i][0] + dx, xy[i][1] + m[i] * dx, xy[i + 1][0] - dx, xy[i + 1][1] - m[i + 1] * dx, xy[i + 1][0], xy[i + 1][1]);
    }
  }

  function drawArea(canvas, pts, ref, opts) {
    const { ctx, w, h } = setup(canvas, 210);
    const padL = 12, padR = 16, padT = 14, padB = 8;
    const cw = w - padL - padR, ch = h - padT - padB;
    if (!pts.length) {
      ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(107,117,112,.6)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, padT + ch * .6); ctx.lineTo(padL + cw, padT + ch * .6); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    const vals = pts.map((p) => p.v);
    if (ref != null && Number.isFinite(ref)) vals.push(ref);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-12) { const e = Math.abs(hi) * 0.02 || 1; lo -= e; hi += e; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, dt = Math.max(1, t1 - t0);
    const xOf = (t) => pts.length === 1 ? padL + cw : padL + (t - t0) / dt * cw;
    const yOf = (v) => padT + (1 - (v - lo) / (hi - lo)) * ch;
    const xy = pts.map((p) => [xOf(p.t), yOf(p.v)]);
    const lastV = pts[pts.length - 1].v;
    const up = ref == null ? lastV >= pts[0].v : lastV >= ref;
    const col = opts && opts.color ? opts.color : (up ? GREEN : RED);
    const rgb = col === RED ? "255,90,82" : "61,220,132";

    // faint grid
    ctx.strokeStyle = "rgba(30,38,34,.9)"; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { const y = Math.round(padT + ch * i / 4) + .5; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke(); }

    if (ref != null && Number.isFinite(ref)) {
      const y = yOf(ref);
      ctx.setLineDash([3, 5]); ctx.strokeStyle = "rgba(138,148,143,.55)";
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.beginPath(); smoothPath(ctx, xy, true);
    ctx.lineTo(xy[xy.length - 1][0], padT + ch + padB); ctx.lineTo(xy[0][0], padT + ch + padB); ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, h);
    g.addColorStop(0, "rgba(" + rgb + ",.30)"); g.addColorStop(.6, "rgba(" + rgb + ",.08)"); g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath(); smoothPath(ctx, xy, true);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.shadowColor = "rgba(" + rgb + ",.45)"; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;

    const [lx, ly] = xy[xy.length - 1];
    const pulse = opts && opts.pulse != null ? opts.pulse : 0;
    if (pulse > 0) { ctx.beginPath(); ctx.arc(lx, ly, 5 + pulse * 7, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255," + (0.18 * (1 - pulse)) + ")"; ctx.fill(); }
    ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#0a0d0c"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
  }

  // Animated home chart: tweens the latest value when a new point arrives.
  function drawHomeChart(canvas, points, startValue) {
    if (!canvas) return;
    const pts = bucket(parse(points), 140);
    const st = canvas.__st || (canvas.__st = {});
    const ref = startValue != null ? Number(startValue) : null;
    const last = pts.length ? pts[pts.length - 1].v : null;
    const from = st.shown != null ? st.shown : last;
    if (st.raf) cancelAnimationFrame(st.raf);
    const t0 = performance.now(), dur = 700;
    const changed = from != null && last != null && Math.abs(from - last) > 1e-9;
    function frame(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      let p = pts;
      if (changed && pts.length) {
        p = pts.slice(); const v = from + (last - from) * e;
        p[p.length - 1] = { t: p[p.length - 1].t, v: v }; st.shown = v;
      } else st.shown = last;
      drawArea(canvas, p, ref, { pulse: changed ? k : 0 });
      if (k < 1 && changed) st.raf = requestAnimationFrame(frame); else st.raf = null;
    }
    if (changed && document.visibilityState !== "hidden") st.raf = requestAnimationFrame(frame);
    else frame(t0 + dur);
  }

  function drawPriceChart(canvas, points, entry) {
    if (!canvas) return;
    drawArea(canvas, bucket(parse(points), 140), entry != null ? Number(entry) : null, {});
  }

  function drawSpark(canvas, values, color) {
    if (!canvas) return;
    const { ctx, w, h } = setup(canvas, 22);
    const v = (values || []).map(Number).filter(Number.isFinite);
    ctx.lineWidth = 1.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (v.length < 2) {
      ctx.setLineDash([2, 4]); ctx.strokeStyle = "rgba(107,117,112,.6)";
      ctx.beginPath(); ctx.moveTo(1, h / 2); ctx.lineTo(w - 1, h / 2); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    let lo = Math.min(...v), hi = Math.max(...v);
    if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
    const xy = v.map((y, i) => [1 + i / (v.length - 1) * (w - 2), 2 + (1 - (y - lo) / (hi - lo)) * (h - 4)]);
    ctx.beginPath(); smoothPath(ctx, xy, true);
    ctx.strokeStyle = color || GREEN; ctx.stroke();
  }

  global.drawHomeChart = drawHomeChart;
  global.drawPriceChart = drawPriceChart;
  global.drawSpark = drawSpark;
})(window);
