/* Hand-drawn Home line chart. No chart library. */
(function (global) {
  const GREEN = "#00d35a";

  function drawHomeChart(canvas, points, startValue) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 358;
    const cssH = canvas.clientHeight || 180;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pts = (points || []).map((p) => ({
      t: Date.parse(p.t) || 0,
      v: Number(p.v),
    })).filter((p) => p.t && !Number.isNaN(p.v));

    const padL = 8, padR = 8, padT = 12, padB = 16;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    if (pts.length === 0) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = "rgba(235,235,245,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT + h * 0.6);
      ctx.lineTo(padL + w, padT + h * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const start = startValue != null ? Number(startValue) : pts[0].v;
    let minV = Math.min(start, ...pts.map((p) => p.v));
    let maxV = Math.max(start, ...pts.map((p) => p.v));
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const dt = Math.max(t1 - t0, 1);

    const xOf = (t) => padL + ((t - t0) / dt) * w;
    const yOf = (v) => padT + (1 - (v - minV) / (maxV - minV)) * h;

    // dashed start line
    const yStart = yOf(start);
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(235,235,245,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yStart);
    ctx.lineTo(padL + w, yStart);
    ctx.stroke();
    ctx.setLineDash([]);

    // fill under the line
    ctx.beginPath();
    ctx.moveTo(xOf(pts[0].t), yOf(pts[0].v));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(xOf(pts[i].t), yOf(pts[i].v));
    }
    ctx.lineTo(xOf(pts[pts.length - 1].t), padT + h);
    ctx.lineTo(xOf(pts[0].t), padT + h);
    ctx.closePath();
    const grd = ctx.createLinearGradient(0, padT, 0, padT + h);
    grd.addColorStop(0, "rgba(0,211,90,0.28)");
    grd.addColorStop(1, "rgba(0,211,90,0)");
    ctx.fillStyle = grd;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(xOf(pts[0].t), yOf(pts[0].v));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(xOf(pts[i].t), yOf(pts[i].v));
    }
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  global.drawHomeChart = drawHomeChart;
})(window);
