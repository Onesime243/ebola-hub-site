/* Composants graphiques SVG sans dépendance (fonctionne hors ligne, file://) */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const root = document.documentElement;
  const col = c => (c && c.startsWith("--")) ? getComputedStyle(root).getPropertyValue(c).trim() : c;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v)) ? "—" : new Intl.NumberFormat(window.HubLang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: d }).format(v);

  /* ---------------- Tooltip ---------------- */
  let tip;
  function tooltip() {
    if (!tip) { tip = document.createElement("div"); tip.className = "tooltip"; document.body.appendChild(tip); }
    return tip;
  }
  function showTip(html, ev) {
    const t = tooltip(); t.innerHTML = html; t.style.opacity = 1;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  function hideTip() { if (tip) tip.style.opacity = 0; }

  /* ---------------- Registre (re-rendu au redimensionnement / thème) ---------------- */
  const registry = new Map();
  function register(el, fn) { registry.set(el, fn); fn(); }
  function clearRegistry() { registry.clear(); }
  function rerenderAll() { for (const [el, fn] of registry) { if (document.body.contains(el)) fn(); else registry.delete(el); } }
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(rerenderAll, 150); });

  function niceStep(v) {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function niceMax(v) { const st = niceStep(v / 4); return Math.max(st, Math.ceil(v / st) * st); }
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ------------------------------------------------------------------
     XY chart : barres (groupées ou empilées) + lignes + bande, un seul axe Y
     opt = {data, x, xLabel(fn), series:[{key,label,color,type:'bar'|'line'|'area'}], stacked,
            band:{lo,hi,color,label}, height, yFmt, percent, onClick(row), markers}
     ------------------------------------------------------------------ */
  /* Mode période : les séries datées (axe x AAAA-MM-JJ) sont limitées à la période choisie ; les dates postérieures
     à la fin (prévisions, projections) restent affichées. Séries hebdomadaires : semaines qui recoupent la période. */
  function clipPeriod(opt) {
    const P = window.HUB_PERIOD;
    if (!P || opt.noClip || !opt.x || !Array.isArray(opt.data) || opt.data.length < 3) return opt;
    const iso = /^\d{4}-\d{2}-\d{2}/;
    const xs = opt.data.map(r => r[opt.x]);
    if (!xs.every(v => v === null || v === undefined || (typeof v === "string" && iso.test(v)))) return opt;
    const ds = xs.filter(Boolean).map(v => v.slice(0, 10)).sort();
    let step = 1;
    if (ds.length > 2) step = Math.round((new Date(ds[1] + "T00:00:00Z") - new Date(ds[0] + "T00:00:00Z")) / 864e5) || 1;
    const lo = step >= 7 ? new Date(new Date(P.debut + "T00:00:00Z").getTime() - 6 * 864e5).toISOString().slice(0, 10) : P.debut;
    const data = opt.data.filter(r => r[opt.x] === null || r[opt.x] === undefined || String(r[opt.x]).slice(0, 10) >= lo);
    if (data.length < 2 || data.length === opt.data.length) return opt;
    return Object.assign({}, opt, { data });
  }
  function xy(container, opt) {
    opt = clipPeriod(opt);
    register(container, () => drawXY(container, opt));
  }
  function drawXY(container, opt) {
    const data = opt.data || [];
    container.innerHTML = "";
    container.classList.add("chart");
    if (!data.length) { container.innerHTML = `<div class="empty">${esc(opt.empty || (window.HubT ? HubT("Aucune donnée") : "Aucune donnée"))}</div>`; container.__tbl = null; return; }
    container.__tbl = xyTable(opt);
    const W = Math.max(280, container.clientWidth || 700), H = opt.height || 260;
    const m = { t: 14, r: 14, b: 30, l: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const bars = opt.series.filter(s => (s.type || "bar") === "bar" && !s.hidden);
    const lines = opt.series.filter(s => (s.type === "line" || s.type === "area" || s.type === "points") && !s.hidden);
    const stems = opt.series.filter(s => s.type === "stem" && !s.hidden);
    const val = (r, k) => { const v = Number(r[k]); return Number.isFinite(v) ? v : 0; };
    let ymax = 0;
    data.forEach(r => {
      if (opt.stacked) ymax = Math.max(ymax, bars.reduce((s, b) => s + val(r, b.key), 0));
      else bars.forEach(b => ymax = Math.max(ymax, val(r, b.key)));
      lines.forEach(l => ymax = Math.max(ymax, val(r, l.key)));
      if (opt.band) ymax = Math.max(ymax, val(r, opt.band.hi));
      (opt.bands || []).forEach(b => ymax = Math.max(ymax, val(r, b.hi)));
      stems.forEach(l => ymax = Math.max(ymax, val(r, l.key)));
    });
    (opt.hlines || []).forEach(h => ymax = Math.max(ymax, h.y));
    if (opt.percent) ymax = Math.max(ymax, 1); if (opt.yMax) ymax = opt.yMax;
    ymax = opt.percent && ymax > 60 ? 100 : niceMax(ymax * 1.02);
    const n = data.length, bw = pw / n;
    const X = i => m.l + (i + .5) * bw, Y = v => m.t + ph - (v / ymax) * ph;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.title || "" });
    // grille et axe Y
    const stp = opt.percent && ymax === 100 ? 25 : niceStep(ymax / 4), ticks = Math.max(1, Math.round(ymax / stp));
    for (let i = 0; i <= ticks; i++) {
      const v = ymax * i / ticks, y = Y(v);
      el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: col(i === 0 ? "--line-2" : "--line"), "stroke-width": 1 }, svg);
      const t = el("text", { x: m.l - 6, y: y + 3.5, "text-anchor": "end", fill: col("--muted"), "font-size": 11 }, svg);
      t.textContent = opt.yFmt ? opt.yFmt(v) : nf(v, v < 10 && ymax <= 10 ? 1 : 0) + (opt.percent ? " %" : "");
    }
    // axe X
    const maxLabels = Math.max(2, Math.floor(pw / (opt.xLabelWidth || 64)));
    const step = Math.ceil(n / maxLabels);
    data.forEach((r, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      if (i === n - 1 && i % step !== 0 && (n - 1) % step < step * .6) return;
      const t = el("text", { x: X(i), y: H - 10, "text-anchor": "middle", fill: col("--muted"), "font-size": 11 }, svg);
      t.textContent = opt.xLabel ? opt.xLabel(r[opt.x], r) : r[opt.x];
    });
    // zone ombrée (ex. jours provisoires)
    if (opt.shade && opt.shade.from !== undefined && opt.shade.from !== null && opt.shade.from < n) {
      const x0 = m.l + opt.shade.from * bw, x1 = m.l + ((opt.shade.to ?? n - 1) + 1) * bw;
      el("rect", { x: x0, y: m.t, width: Math.max(0, x1 - x0), height: ph, fill: col(opt.shade.color || "--line"), "fill-opacity": .45 }, svg);
      if (opt.shade.label) { const t = el("text", { x: x0 + 4, y: m.t + 11, fill: col("--muted"), "font-size": 10 }, svg); t.textContent = opt.shade.label; }
    }
    // bandes multiples (éventail de projections)
    (opt.bands || []).forEach(b => {
      const idx = data.map((r, i) => i).filter(i => data[i][b.hi] !== null && data[i][b.hi] !== undefined);
      if (!idx.length) return;
      const up = idx.map(i => `${X(i)},${Y(val(data[i], b.hi))}`), lo = idx.map(i => `${X(i)},${Y(val(data[i], b.lo))}`).reverse();
      el("polygon", { points: up.concat(lo).join(" "), fill: col(b.color || "--s2"), "fill-opacity": b.opacity ?? .16 }, svg);
    });
    // bande d'incertitude
    if (opt.band) {
      const idx = data.map((r, i) => i).filter(i => data[i][opt.band.hi] !== null && data[i][opt.band.hi] !== undefined);
      const up = idx.map(i => `${X(i)},${Y(val(data[i], opt.band.hi))}`), lo = idx.map(i => `${X(i)},${Y(val(data[i], opt.band.lo))}`).reverse();
      el("polygon", { points: up.concat(lo).join(" "), fill: col(opt.band.color || "--s2"), "fill-opacity": .16 }, svg);
    }
    // barres
    const gap = Math.min(2, bw * .15), inner = Math.max(1, bw * (opt.barWidth || .72));
    data.forEach((r, i) => {
      let acc = 0;
      bars.forEach((b, j) => {
        const v = val(r, b.key); if (v <= 0) return;
        let x, w, y0, y1;
        if (opt.stacked) { x = X(i) - inner / 2; w = inner; y0 = Y(acc); y1 = Y(acc + v); acc += v; }
        else { const gw = inner / bars.length; x = X(i) - inner / 2 + j * gw; w = Math.max(1, gw - (bars.length > 1 ? gap : 0)); y0 = Y(0); y1 = Y(v); }
        const hgt = Math.max(0, y0 - y1 - (opt.stacked && acc - v > 0 ? gap : 0));
        const top = opt.stacked ? j === bars.length - 1 || bars.slice(j + 1).every(bb => val(r, bb.key) <= 0) : true;
        const rad = top ? Math.min(3, w / 2, hgt) : 0;
        const p = `M${x},${y0 - (opt.stacked && acc - v > 0 ? gap : 0)}V${y1 + rad}q0,-${rad} ${rad},-${rad}h${w - 2 * rad}q${rad},0 ${rad},${rad}V${y0 - (opt.stacked && acc - v > 0 ? gap : 0)}Z`;
        el("path", { d: hgt > 0 ? p : `M${x},${y0}h${w}`, fill: col(b.color), stroke: opt.barStroke ? col(opt.barStroke) : null, "stroke-width": opt.barStroke ? .8 : null }, svg);
        // représentation « un carré = un cas » (incidence::plot(show_cases = TRUE))
        if (opt.showCases && ymax <= 60 && hgt > 0) for (let u = 1; u < v; u++) { const yy = opt.stacked ? Y(acc - v + u) : Y(u); el("line", { x1: x, x2: x + w, y1: yy, y2: yy, stroke: col("--surface"), "stroke-width": 1 }, svg); }
      });
    });
    // tiges (ex. cas observés sur la force d'infection, earlyR)
    stems.forEach(l => data.forEach((r, i) => { const v = val(r, l.key); if (v <= 0) return; el("line", { x1: X(i), x2: X(i), y1: Y(0), y2: Y(v), stroke: col(l.color), "stroke-width": 1.3, "stroke-dasharray": l.dash || "3 2" }, svg); el("circle", { cx: X(i), cy: Y(v), r: 2, fill: col(l.color) }, svg); }));
    // lignes
    lines.forEach(l => {
      const pts = data.map((r, i) => (r[l.key] === null || r[l.key] === undefined) ? null : [X(i), Y(val(r, l.key))]);
      let d = "", pen = false;
      pts.forEach(p => { if (!p) { pen = false; return; } d += (pen ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); pen = true; });
      if (l.type === "area") {
        const valid = pts.filter(Boolean);
        if (valid.length) el("path", { d: d + `L${valid[valid.length - 1][0]},${Y(0)}L${valid[0][0]},${Y(0)}Z`, fill: col(l.color), "fill-opacity": .12 }, svg);
      }
      if (l.type !== "points") el("path", { d, fill: "none", stroke: col(l.color), "stroke-width": l.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": l.dash || null, "stroke-opacity": l.opacity ?? 1 }, svg);
      if (l.type === "points" || l.markers || (l.markers !== false && (opt.markers || n <= 24))) pts.forEach(p => p && el("circle", { cx: p[0], cy: p[1], r: l.r || 3, fill: col(l.color), stroke: col("--surface"), "stroke-width": l.type === "points" ? .8 : 1.5 }, svg));
    });
    // lignes de référence horizontales (ex. R = 1) et verticales (ex. aujourd'hui, R = 1 sur l'axe X)
    (opt.hlines || []).forEach(h => {
      const y = Y(h.y); el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: col(h.color || "--ink-2"), "stroke-width": h.width || 1.4, "stroke-dasharray": h.dash ?? "5 4" }, svg);
      if (h.label) { const t = el("text", { x: W - m.r - 4, y: y - 4, "text-anchor": "end", fill: col(h.color || "--ink-2"), "font-size": 10.5, "font-weight": 600 }, svg); t.textContent = h.label; }
    });
    (opt.vlines || []).forEach(v => {
      const i = typeof v.i === "number" ? v.i : data.findIndex(r => r[opt.x] === v.x); if (i < 0) return;
      const x = v.edge ? m.l + i * bw : X(i);
      el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ph, stroke: col(v.color || "--ink-2"), "stroke-width": v.width || 1.4, "stroke-dasharray": v.dash ?? "4 3" }, svg);
      if (v.label) { const t = el("text", { x: x + 4, y: m.t + 11 + (v.dy || 0), fill: col(v.color || "--ink-2"), "font-size": 10.5, "font-weight": 600 }, svg); t.textContent = v.label; }
    });
    // survol
    const hl = el("line", { y1: m.t, y2: m.t + ph, stroke: col("--ink-2"), "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0 }, svg);
    const ov = el("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent" }, svg);
    const idxAt = ev => { const b = svg.getBoundingClientRect(); const px = (ev.clientX - b.left) * W / b.width; return Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / bw))); };
    ov.addEventListener("mousemove", ev => {
      const i = idxAt(ev), r = data[i];
      hl.setAttribute("x1", X(i)); hl.setAttribute("x2", X(i)); hl.setAttribute("opacity", 1);
      const rows = opt.series.filter(s => !s.hidden && !s.noTip && !(opt.tipSkipNull && (r[s.key] === null || r[s.key] === undefined))).map(s => `<div class="row"><span><i style="background:${col(s.color)}"></i>${esc(s.label)}</span><b>${r[s.key] === null || r[s.key] === undefined ? "—" : nf(Number(r[s.key]), opt.digits ?? 1)}${opt.percent || s.percent ? " %" : ""}</b></div>`).join("");
      const band = (opt.band ? [opt.band] : []).concat(opt.bands || []).filter(b => r[b.hi] !== null && r[b.hi] !== undefined).map(b => `<div class="row"><span>${esc(b.label || "IC 95 %")}</span><b>${nf(val(r, b.lo), opt.digits ?? 1)}, ${nf(val(r, b.hi), opt.digits ?? 1)}</b></div>`).join("") + (opt.tipExtra ? opt.tipExtra(r) : "");
      showTip(`<b>${esc(opt.tipTitle ? opt.tipTitle(r) : (opt.xLabel ? opt.xLabel(r[opt.x], r, true) : r[opt.x]))}</b>${rows}${band}`, ev);
    });
    ov.addEventListener("mouseleave", () => { hideTip(); hl.setAttribute("opacity", 0); });
    if (opt.onClick) { ov.style.cursor = "pointer"; ov.addEventListener("click", ev => opt.onClick(data[idxAt(ev)])); }
    container.appendChild(svg);
    if (opt.legend !== false && opt.series.length + (opt.band ? 1 : 0) + (opt.bands || []).length > 1) {
      const lg = document.createElement("div"); lg.className = "legend";
      lg.innerHTML = opt.series.filter(s => !s.noLegend).map(s => `<span><i class="${s.type === "line" || s.type === "stem" ? "line" : s.type === "points" ? "round" : ""}" style="background:${col(s.color)}"></i>${esc(s.label)}</span>`).join("") +
        (opt.band ? `<span><i style="background:${col(opt.band.color || "--s2")};opacity:.3"></i>${esc(opt.band.label || "IC 95 %")}</span>` : "") +
        (opt.bands || []).map(b => `<span><i style="background:${col(b.color || "--s2")};opacity:${Math.min(1, (b.opacity ?? .16) * 2)}"></i>${esc(b.label || "")}</span>`).join("") +
        (opt.hlines || []).filter(h => h.legend).map(h => `<span><i class="line" style="background:${col(h.color || "--ink-2")}"></i>${esc(h.legend)}</span>`).join("");
      container.appendChild(lg);
    }
  }

  /* ---------------- Histogramme simple ---------------- */
  /* Tableau de données sous-jacent à un graphique (affiché par le bouton « Tableau », exporté en CSV) */
  const stripTags = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  function xyTable(opt) {
    const data = opt.data || [], ser = (opt.series || []).filter(x => !x.hidden);
    const cols = [stripTags(opt.xTitle || (window.HubT ? HubT("Abscisse") : "x"))];
    const getters = [];
    ser.forEach(x => { cols.push(stripTags(x.label || x.key)); getters.push(r => r[x.key]); });
    const bands = [...(opt.band ? [opt.band] : []), ...(opt.bands || [])];
    bands.forEach(b => { const lab = stripTags(b.label || "IC"); cols.push(lab + ", bas", lab + ", haut"); getters.push(r => r[b.lo], r => r[b.hi]); });
    const xl = r => { try { return stripTags(opt.xLabel ? opt.xLabel(r[opt.x], r, true) : r[opt.x]); } catch (e) { return r[opt.x]; } };
    const fmt = v => (v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v))) ? "" : (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
    return { cols, rows: data.map(r => [xl(r), ...getters.map(g => fmt(g(r)))]) };
  }
  function histogram(container, opt) { xy(container, Object.assign({ series: [{ key: opt.y, label: opt.label, color: opt.color || "--s1" }], barWidth: .86 }, opt)); }

  /* ---------------- Carte choroplèthe ----------------
     Carte interactive : zoom (boutons, double-clic, Ctrl/⌘ + molette ou pincement), déplacement à la souris,
     étiquettes posées sur la zone (jamais de trait de rappel : une étiquette qui ne tient pas est masquée et réapparaît
     en zoomant), limites de province, encart RDC (province(s) concernée(s) en orange, zone sélectionnée en rouge,
     emprise de la carte en rouge) et légende avec effectifs, comme les cartes de rapport. */
  const TT = s => (window.HubT ? HubT(s) : s);
  const MAPZ = new Map();
  const ringsOf = g => g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  let SEG = null, SEG_SRC = null;
  function segTable(all) {                       // segments de contour, avec les zones qui les partagent (calculé une fois)
    if (SEG && SEG_SRC === all) return SEG;
    const m = new Map();
    all.forEach(f => ringsOf(f.geometry).forEach(r => {
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i], ka = a[0] + "," + a[1], kb = b[0] + "," + b[1]; if (ka === kb) continue;
        const k = ka < kb ? ka + "|" + kb : kb + "|" + ka, o = m.get(k);
        if (o) o.f.push(f); else m.set(k, { a, b, f: [f] });
      }
    }));
    SEG = [...m.values()]; SEG_SRC = all;
    // segments non partagés (sommets voisins légèrement différents) : on regarde quelle zone se trouve de l'autre côté
    const bb = all.map(f => { const p = ringsOf(f.geometry).flat(); let a = 1e9, b = 1e9, c = -1e9, d = -1e9; p.forEach(q => { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; }); return [a, b, c, d]; });
    const inside = (f, x, y) => { let c = false; for (const r of ringsOf(f.geometry)) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
    const zoneAt = (x, y, not) => { for (let i = 0; i < all.length; i++) { const b = bb[i]; if (x < b[0] || x > b[2] || y < b[1] || y > b[3] || all[i] === not) continue; if (inside(all[i], x, y)) return all[i]; } return null; };
    SEG.forEach(s => {
      if (s.f.length !== 1) return;
      const f = s.f[0], mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2, dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy) || 1;
      let o = null;
      for (const e of [.0025, .008, .02]) {
        const nx = -dy / L * e, ny = dx / L * e;
        const p = inside(f, mx + nx, my + ny) ? [mx - nx, my - ny] : [mx + nx, my + ny];
        o = zoneAt(p[0], p[1], f); if (o) break;
      }
      s.o = o;
    });
    return SEG;
  }
  // limites de province + contour du territoire affiché : segments non partagés par deux zones d'une même province
  function provPath(feats, all, P) {
    const inSet = new Set(feats); let d = "", last = null;
    segTable(all).forEach(s => {
      let u0 = null, u1 = null;
      for (const f of s.f) { if (inSet.has(f)) { if (!u0) u0 = f; else { u1 = f; break; } } }
      if (!u0 || (u1 && u1.province === u0.province)) return;
      if (!u1 && s.f.length === 1 && s.o && inSet.has(s.o) && s.o.province === u0.province) return;   // faux bord (sommets décalés)
      const p = P(s.a), q = P(s.b);
      if (!last || Math.abs(last[0] - p[0]) > .01 || Math.abs(last[1] - p[1]) > .01) d += "M" + p[0].toFixed(1) + "," + p[1].toFixed(1);
      d += "L" + q[0].toFixed(1) + "," + q[1].toFixed(1); last = q;
    });
    return d;
  }
  const INSET = { W: 210 };
  let INSET_CACHE = null;
  function insetBase(all) {                      // géométrie de l'encart RDC (mise en cache)
    if (INSET_CACHE && INSET_CACHE.all === all) return INSET_CACHE;
    const pts = all.flatMap(f => ringsOf(f.geometry).flat());
    const minx = Math.min(...pts.map(p => p[0])), maxx = Math.max(...pts.map(p => p[0])), miny = Math.min(...pts.map(p => p[1])), maxy = Math.max(...pts.map(p => p[1]));
    const pad = 4, W = INSET.W, sc = (W - 2 * pad) / (maxx - minx), H = Math.round((maxy - miny) * sc + 2 * pad);
    const P = p => [pad + (p[0] - minx) * sc, pad + (maxy - p[1]) * sc];
    const dOf = new Map(all.map(f => [f, ringsOf(f.geometry).map(r => r.map((p, i) => { const q = P(p); return (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("") + "Z").join("")]));
    INSET_CACHE = { all, W, H, P, dOf, prov: provPath(all, all, P), minx, maxx, miny, maxy };
    return INSET_CACHE;
  }
  function choropleth(container, opt) { register(container, () => drawMap(container, opt)); }
  function drawMap(container, opt) {
    const feats = opt.features || [], all = opt.allFeatures || feats, report = !!opt.report;
    container.innerHTML = ""; container.classList.add("chart", "map");
    if (!feats.length) { container.innerHTML = `<div class="empty">${TT("Géométrie indisponible")}</div>`; return; }
    const compact = !report && (container.clientWidth || 0) < 1000;   // panneau étroit : encart posé sur la carte, légende dessous
    const grid = document.createElement("div"); grid.className = "map-grid" + (report ? " no-side" : compact ? " compact" : ""); container.appendChild(grid);
    const main = document.createElement("div"); main.className = "map-main"; grid.appendChild(main);
    const side = report ? null : document.createElement("aside"); if (side) { side.className = "map-side"; grid.appendChild(side); }
    const focusF = opt.focus ? feats.filter(f => opt.focusIf ? opt.focusIf(f) : opt.value(f) > 0) : [];
    const pts = (focusF.length ? focusF : feats).flatMap(f => ringsOf(f.geometry).flat());
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const W = Math.max(300, main.clientWidth || container.clientWidth || 700), ratio = (maxy - miny) / (maxx - minx || 1), H = Math.min(640, Math.max(340, W * ratio * 1.02)), pad = focusF.length ? 26 : 12;
    const sc = Math.min((W - 2 * pad) / (maxx - minx || 1), (H - 2 * pad) / (maxy - miny || 1));
    const ox = (W - (maxx - minx) * sc) / 2, oy = (H - (maxy - miny) * sc) / 2;
    const P = p => [ox + (p[0] - minx) * sc, oy + (maxy - p[1]) * sc];
    const unP = q => [minx + (q[0] - ox) / sc, maxy - (q[1] - oy) / sc];
    // état du zoom conservé entre deux rendus (clic sur une zone, changement de langue…)
    const key = [feats.length, feats[0]?.data_zone, focusF.length, Math.round(W)].join("|"), zid = container.id || "map";
    let st = MAPZ.get(zid); if (!st || st.key !== key || report) { st = { key, k: 1, tx: 0, ty: 0 }; if (!report) MAPZ.set(zid, st); }
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "geo-svg", style: "overflow:hidden" }, main);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" }, svg);
    const geo = el("g", { class: "geo" }, svg);
    const vals = feats.map(f => opt.value(f)).filter(v => v > 0), mx = Math.max(1, ...vals);
    const steps = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"].map(col);
    const colorOf = opt.colorFn ? ((v, f) => opt.colorFn(v, f)) : (v => !v ? col("--seq-0") : steps[Math.min(steps.length - 1, Math.floor(Math.sqrt(v / mx) * steps.length * .999))]);
    let dragged = false, selF = null;
    feats.forEach(f => {
      const v = opt.value(f);
      const d = ringsOf(f.geometry).map(r => r.map((p, i) => { const q = P(p); return (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("") + "Z").join("");
      if (opt.selected && opt.selected === f.data_zone) selF = { f, d };
      const p = el("path", { d, class: "zone", fill: colorOf(v, f), stroke: col("--map-stroke") || col("--surface"), "vector-effect": "non-scaling-stroke" }, geo);
      if (!report) {
        p.addEventListener("mousemove", ev => { if (!st.drag) showTip(opt.tip(f, v), ev); });
        p.addEventListener("mouseleave", hideTip);
        p.addEventListener("click", () => { if (dragged) return; opt.onClick && opt.onClick(f); });
      }
    });
    el("path", { d: provPath(feats, all, P), class: "prov-line", "vector-effect": "non-scaling-stroke", fill: "none", stroke: "#2f363d", "stroke-width": 1.6, "stroke-linejoin": "round" }, geo);
    if (selF) el("path", { d: selF.d, class: "zone-sel-outline", "vector-effect": "non-scaling-stroke", fill: "none", stroke: "#111", "stroke-width": 2.8 }, geo);
    const lblG = el("g", { class: "lbls" }, svg);
    // ÉTIQUETTES : « nom » + valeur dans un cercle, posées sur la zone ou juste à côté, sans trait de rappel
    const fs = opt.labelPx || 9.5, fsMin = Math.max(7.5, fs - 1.2);
    const centroidOf = f => {
      const rs = ringsOf(f.geometry), ring = rs.reduce((a, b) => b.length > a.length ? b : a, []);
      let A = 0, cx = 0, cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const k = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; A += k; cx += (ring[j][0] + ring[i][0]) * k; cy += (ring[j][1] + ring[i][1]) * k; }
      if (Math.abs(A) < 1e-12) { const m = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]); return P([m[0] / ring.length, m[1] / ring.length]); }
      return P([cx / (3 * A), cy / (3 * A)]);
    };
    const isMain = f => opt.labelIf ? !!opt.labelIf(f) : (opt.value(f) > 0);
    const rank = f => opt.labelRank ? opt.labelRank(f) : (opt.value(f) || 0);
    const showAll = opt.labelAll === true && opt.labelMode !== "none";
    const cands = opt.labelMode === "none" ? [] : feats.map(f => ({ f, main: isMain(f), q: centroidOf(f) })).filter(o => o.main || showAll)
      .sort((a, b) => (b.main - a.main) || (rank(b.f) - rank(a.f)));
    let hidden = 0;
    const layout = () => {
      lblG.innerHTML = ""; hidden = 0;
      const placed = [];
      const hit = r => r[0] < 2 || r[2] > W - 2 || r[1] < 2 || r[3] > H - 2 || placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
      cands.forEach(({ f, main, q: q0 }) => {
        const q = [st.tx + st.k * q0[0], st.ty + st.k * q0[1]];
        if (q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > H) return;
        const v = opt.value(f), size = main ? fs : fsMin;
        const txt = main ? (opt.labelText ? opt.labelText(f, v) : `${f.data_zone} · ${v === null || v === undefined ? "—" : nf(v, opt.digits || 0)}`) : (opt.labelTextMinor ? opt.labelTextMinor(f) : f.data_zone);
        const sep = main ? String(txt).indexOf(" · ") : -1;
        const nm = sep >= 0 ? txt.slice(0, sep) : txt, vt = sep >= 0 ? txt.slice(sep + 3) : "";
        const rr = vt ? Math.max(size * 1.05, labelWidth(vt, size + .5) / 2 + 4) : 0;
        const tw = Math.max(labelWidth(nm, size) + 6, 2 * rr + 2), th = size + 3 + (vt ? 2 * rr + 2 : 0);
        const rectAt = (x0, y0) => [x0 - tw / 2, y0 - size, x0 + tw / 2, y0 - size + th];
        // positions proches uniquement : sur le centre, puis légèrement décalées (l'étiquette reste sur sa zone)
        const dy0 = -th / 2 + size, near = [[0, dy0], [0, dy0 - th * .45], [0, dy0 + th * .45], [tw * .35, dy0], [-tw * .35, dy0]];
        let pos = null;
        for (const [dx, dy] of near) { const r = rectAt(q[0] + dx, q[1] + dy); if (!hit(r)) { pos = [q[0] + dx, q[1] + dy, r, true]; break; } }
        if (!pos && main && vt) {        // repli : valeur seule dans son cercle, centrée sur la zone
          const r = [q[0] - rr - 1, q[1] - rr - 1, q[0] + rr + 1, q[1] + rr + 1];
          if (!hit(r)) pos = [q[0], q[1], r, false];
        }
        if (!pos) { if (main) hidden++; return; }
        placed.push(pos[2]);
        const g = el("g", { class: "lbl-g" }, lblG);
        el("title", {}, g).textContent = f.data_zone + (vt ? " : " + vt : "");
        if (pos[3]) {
          const t = el("text", { x: pos[0], y: pos[1], "text-anchor": "middle", class: "lbl" + (main ? "" : " lbl-minor"), style: `font-size:${size}px` }, g);
          t.textContent = nm;
        }
        if (vt) {
          const cy = pos[3] ? pos[1] + 3 + rr : pos[1];
          el("circle", { cx: pos[0], cy, r: rr, fill: "#ffffff", stroke: "#5b6470", "stroke-width": 1.3 }, g);
          const v2 = el("text", { x: pos[0], y: cy, "text-anchor": "middle", "dominant-baseline": "central", style: `font:800 ${size + .5}px system-ui,-apple-system,'Segoe UI',Arial,sans-serif;fill:#1f2328` }, g);
          v2.textContent = vt;
        }
      });
      if (hintEl) hintEl.textContent = hidden ? `${hidden} ${TT("zone(s) sans étiquette à ce niveau de zoom : zoomez ou survolez la zone.")}` : "";
    };
    // ----- zoom et déplacement -----
    const apply = () => { geo.setAttribute("transform", `translate(${st.tx.toFixed(2)} ${st.ty.toFixed(2)}) scale(${st.k.toFixed(4)})`); drawRect(); };
    const clampPan = () => { st.tx = Math.min(W * .25, Math.max(W * .75 - W * st.k, st.tx)); st.ty = Math.min(H * .25, Math.max(H * .75 - H * st.k, st.ty)); if (st.k <= 1.0001) { st.k = 1; st.tx = 0; st.ty = 0; } };
    let lt = null; const relayout = (ms) => { clearTimeout(lt); lt = setTimeout(layout, ms || 0); };
    const zoomAt = (px, py, f) => { const k2 = Math.max(1, Math.min(16, st.k * f)); st.tx = px - (px - st.tx) * (k2 / st.k); st.ty = py - (py - st.ty) * (k2 / st.k); st.k = k2; clampPan(); apply(); relayout(120); };
    const toView = ev => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]; };
    let hintEl = null, rectEl = null, IB = null;
    function drawRect() {
      if (!rectEl || !IB) return;
      const a = unP([(0 - st.tx) / st.k, (0 - st.ty) / st.k]), b = unP([(W - st.tx) / st.k, (H - st.ty) / st.k]);
      const p = IB.P(a), q = IB.P(b);
      const x0 = Math.max(1, Math.min(p[0], q[0])), y0 = Math.max(1, Math.min(p[1], q[1])), x1 = Math.min(IB.W - 1, Math.max(p[0], q[0])), y1 = Math.min(IB.H - 1, Math.max(p[1], q[1]));
      rectEl.setAttribute("x", x0.toFixed(1)); rectEl.setAttribute("y", y0.toFixed(1)); rectEl.setAttribute("width", Math.max(3, x1 - x0).toFixed(1)); rectEl.setAttribute("height", Math.max(3, y1 - y0).toFixed(1));
    }
    if (!report) {
      const zb = document.createElement("div"); zb.className = "map-zoom";
      zb.innerHTML = `<button type="button" data-z="in" title="${TT("Zoomer")}" aria-label="${TT("Zoomer")}">+</button><button type="button" data-z="out" title="${TT("Dézoomer")}" aria-label="${TT("Dézoomer")}">−</button><button type="button" data-z="reset" title="${TT("Vue d’ensemble")}" aria-label="${TT("Vue d’ensemble")}">⤢</button>`;
      main.appendChild(zb);
      zb.addEventListener("click", ev => { const b = ev.target.closest("button"); if (!b) return; ev.stopPropagation(); const z = b.dataset.z;
        if (z === "reset") { st.k = 1; st.tx = 0; st.ty = 0; apply(); layout(); } else zoomAt(W / 2, H / 2, z === "in" ? 1.6 : 1 / 1.6); });
      svg.addEventListener("wheel", ev => { if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault(); const [x, y] = toView(ev); zoomAt(x, y, Math.exp(-ev.deltaY * .0025)); }, { passive: false });
      svg.addEventListener("dblclick", ev => { ev.preventDefault(); const [x, y] = toView(ev); zoomAt(x, y, ev.shiftKey ? 1 / 1.8 : 1.8); });
      let down = null;
      svg.addEventListener("pointerdown", ev => { if (ev.button !== 0) return; down = { x: ev.clientX, y: ev.clientY, tx: st.tx, ty: st.ty, id: ev.pointerId }; dragged = false; });
      svg.addEventListener("pointermove", ev => {
        if (!down || st.k <= 1) return;
        const r = svg.getBoundingClientRect(), dx = (ev.clientX - down.x) * W / r.width, dy = (ev.clientY - down.y) * H / r.height;
        if (!dragged && Math.hypot(dx, dy) < 4) return;
        if (!dragged) { dragged = true; st.drag = true; hideTip(); svg.setPointerCapture(down.id); svg.classList.add("dragging"); lblG.style.display = "none"; }
        st.tx = down.tx + dx; st.ty = down.ty + dy; clampPan(); apply();
      });
      const up = () => { if (!down) return; down = null; st.drag = false; svg.classList.remove("dragging"); if (dragged) { lblG.style.display = ""; layout(); setTimeout(() => { dragged = false; }, 0); } };
      svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
      hintEl = document.createElement("div"); hintEl.className = "map-hint"; main.appendChild(hintEl);
      const how = document.createElement("div"); how.className = "map-hint how";
      how.textContent = TT("Zoom : boutons + / −, double-clic ou Ctrl (⌘) + molette ; glisser pour déplacer la carte zoomée.");
      main.appendChild(how);
    }
    // ----- encart RDC -----
    let insetSvg = null;
    if (all.length > feats.length || opt.inset) {
      IB = insetBase(all);
      insetSvg = document.createElementNS(NS, "svg");
      insetSvg.setAttribute("viewBox", `0 0 ${IB.W} ${IB.H}`); insetSvg.setAttribute("xmlns", NS);
      const hiProv = new Set(opt.insetProvinces || []), selZ = opt.selected || null;
      el("rect", { x: 0, y: 0, width: IB.W, height: IB.H, fill: "#ffffff" }, insetSvg);
      all.forEach(f => el("path", { d: IB.dOf.get(f), fill: hiProv.has(f.province) ? "#f0a43a" : "#e7ebef", stroke: hiProv.has(f.province) ? "#f0a43a" : "#e7ebef", "stroke-width": .4 }, insetSvg));
      if (selZ) all.filter(f => f.data_zone === selZ).forEach(f => el("path", { d: IB.dOf.get(f), fill: "#b8322a", stroke: "#7a1d17", "stroke-width": .6 }, insetSvg));
      el("path", { d: IB.prov, fill: "none", stroke: "#6b7680", "stroke-width": .55, "stroke-linejoin": "round" }, insetSvg);
      rectEl = el("rect", { fill: "none", stroke: "#d62828", "stroke-width": 1.6 }, insetSvg);
      drawRect();
    }
    container.__inset = insetSvg;
    // ----- légende (comme la carte de rapport) -----
    const legend = opt.legend || null;
    if (side) {
      let h = "";
      if (insetSvg) {
        h += `<div class="map-inset"><div class="inset-title">${TT("Localisation en RDC")}</div><div class="inset-box"></div></div>`;
      }
      h += `<div class="map-legend"><div class="lg-title">${esc(opt.legendTitle || TT("Légende"))}</div>`;
      if (legend) h += (legend.some(it => it.count !== undefined) ? `<div class="li head"><span></span><span class="n">${esc(opt.countLabel || TT("zones"))}</span></div>` : "") + legend.map(it => `<div class="li"><i style="background:${it.color}"></i><span>${esc(it.label)}</span>${it.count !== undefined ? `<span class="n">${nf(it.count)}</span>` : ""}</div>`).join("");
      else if (opt.legendHTML) h += `<div class="lg-html">${opt.legendHTML}</div>`;
      h += `<div class="li sym"><i class="ln prov"></i><span>${TT("Limite de province")}</span></div><div class="li sym"><i class="ln zone"></i><span>${TT("Limite de zone de santé")}</span></div>`;
      if (selF) h += `<div class="li sym"><i class="sel"></i><span>${TT("Zone sélectionnée")} : ${esc(opt.selected)}</span></div>`;
      if (insetSvg) {
        h += `<div class="lg-sub">${TT("Encart")}</div><div class="li sym"><i style="background:#f0a43a"></i><span>${esc(opt.insetLabel || TT("Province(s) concernée(s)"))}</span></div>`;
        if (selF) h += `<div class="li sym"><i style="background:#b8322a"></i><span>${TT("Zone sélectionnée")}</span></div>`;
        h += `<div class="li sym"><i class="emp"></i><span>${TT("Emprise de la carte")}</span></div>`;
      }
      side.innerHTML = h + `</div>`;
      if (insetSvg) {
        side.querySelector(".inset-box").appendChild(insetSvg);
        if (compact) { const ib = side.querySelector(".map-inset"); ib.classList.add("inset-over"); main.insertBefore(ib, svg.nextSibling); }
      }
    }
    apply(); layout();
    container.__tbl = { cols: [TT("Zone de santé"), stripTags(opt.unit || TT("Valeur"))],
      rows: feats.map(f => [f.data_zone, opt.value(f)]).filter(r => r[1] !== null && r[1] !== undefined).sort((a, b) => (b[1] || 0) - (a[1] || 0)) };
    container.__export = (name, panel) => reportMapPNG(container, {
      title: panel?.querySelector(".panel-head h2")?.textContent || name, subtitle: panel?.querySelector(".panel-head .sub, .panel-head p")?.textContent || "",
      legendTitle: opt.legendTitle, legend: legend || [], countLabel: opt.countLabel || TT("zones"), file: name, inset: insetSvg,
      sideNotes: [TT("Limite noire épaisse : province ; encart : orange = province(s) concernée(s), rouge = zone sélectionnée, cadre rouge = emprise de la carte.")] });
  }

  /* ------------------------------------------------------------------
     Graphe de réseau (radial / arbre / chronologique), zoom + déplacement
     nodes: {id, parent, level, label, sub, color, shape:'case'|'contact'|'source', ring, title(html), strong}
     ------------------------------------------------------------------ */
  function network(container, opt) {
    const state = { k: 1, tx: 0, ty: 0, layout: opt.layout || "radial" };
    const draw = () => drawNetwork(container, opt, state);
    container._net = { state, draw, setLayout: l => { state.layout = l; state.k = 1; state.tx = 0; state.ty = 0; draw(); } };
    register(container, draw);
    return container._net;
  }
  function layoutNodes(opt, layout) {
    const nodes = opt.nodes, byId = new Map(nodes.map(n => [n.id, n]));
    const kids = new Map(); nodes.forEach(n => { if (n.parent && byId.has(n.parent)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); } });
    const rootN = byId.get(opt.rootId) || nodes.find(n => n.level === 0);
    const leaves = new Map();
    const countLeaves = n => { const c = kids.get(n.id) || []; const v = c.length ? c.reduce((s, x) => s + countLeaves(x), 0) : 1; leaves.set(n.id, v); return v; };
    const total = rootN ? countLeaves(rootN) : 1;
    const maxLevel = Math.max(1, ...nodes.map(n => n.level || 0));
    const pos = new Map();
    if (layout === "radial" && rootN) {
      // disposition « ballons » : niveau 1 sur un anneau autour du cas index ; chaque contact
      // devenu cas porte ses propres contacts sur un cercle tourné vers l'extérieur.
      const c1 = kids.get(rootN.id) || [];
      pos.set(rootN.id, [0, 0]);
      // taille de chaque « ballon » calculée d'abord, pour que les ballons voisins ne se chevauchent pas
      const gap = 2 * Math.PI * .16, NODE = 26;
      const geo = new Map();
      const measure = n => {
        const cs = kids.get(n.id) || [];
        if (!cs.length) { geo.set(n.id, { r: 0, lat: NODE / 2, out: NODE / 2 }); return geo.get(n.id); }
        const sub = cs.map(measure);
        const need = sub.reduce((s, g) => s + Math.max(NODE, 2 * g.lat + 10), 0);
        const r = Math.max(55, need / (2 * Math.PI - gap));
        const mx = Math.max(...sub.map(g => g.out));
        const G = { r, d: r + 70, lat: r + mx, out: r + 70 + r + mx };
        geo.set(n.id, G); return G;
      };
      c1.forEach(measure);
      // rayon de l'anneau 1 : assez grand pour que la somme des secteurs tienne dans 2π
      const angNeed = (c, R) => { const G = geo.get(c.id); return G.r ? Math.max(NODE / R, 2 * Math.atan((G.lat + 14) / (R + G.d))) : NODE / R; };
      let step = Math.max(150, c1.length * NODE / (2 * Math.PI));
      for (let it = 0; it < 60 && c1.reduce((s, c) => s + angNeed(c, step), 0) > 2 * Math.PI; it++) step *= 1.12;
      const balloon = (n, cx, cy, ang) => {
        const cs0 = kids.get(n.id) || []; if (!cs0.length) return;
        // les contacts qui portent leur propre ballon sont placés côté extérieur (milieu de l'arc), les autres sur les côtés
        const srt = [...cs0].sort((x, y) => geo.get(x.id).lat - geo.get(y.id).lat), cs = [];
        srt.forEach((c, i) => { if (i % 2) cs.push(c); else cs.unshift(c); });
        const G = geo.get(n.id), r = G.r;
        const ox = cx + Math.cos(ang) * G.d, oy = cy + Math.sin(ang) * G.d;
        const w = cs.map(c => Math.max(NODE, 2 * geo.get(c.id).lat + 10)), W = w.reduce((s, x) => s + x, 0);
        let acc = 0;
        cs.forEach((c, k) => {
          const a = cs.length === 1 ? ang : ang + Math.PI + gap / 2 + (2 * Math.PI - gap) * (acc + w[k] / 2) / W;
          acc += w[k];
          const px = ox + Math.cos(a) * r, py = oy + Math.sin(a) * r;
          pos.set(c.id, [px, py]);
          balloon(c, px, py, Math.atan2(py - oy, px - ox));
        });
      };
      const need1 = c1.map(c => angNeed(c, step)), tot1 = need1.reduce((s, x) => s + x, 0) || 1;
      const spare = Math.max(0, 2 * Math.PI - tot1) / Math.max(1, c1.length);
      let acc1 = 0;
      c1.forEach((c, k) => {
        const a = -Math.PI / 2 + acc1 + (need1[k] + spare) / 2; acc1 += need1[k] + spare;
        const x = Math.cos(a) * step, y = Math.sin(a) * step;
        pos.set(c.id, [x, y]); balloon(c, x, y, a);
      });
      state_rings = [step];
      const ups = nodes.filter(n => n.level < 0);
      ups.forEach((u, i) => pos.set(u.id, [(i - (ups.length - 1) / 2) * 90, -Math.max(95, step * .55)]));
    } else {
      // arbre horizontal (niveaux) ou chronologique (x = date)
      const rowH = 28; let row = 0;
      const tmin = Math.min(...nodes.filter(n => n.t).map(n => n.t)), tmax = Math.max(...nodes.filter(n => n.t).map(n => n.t));
      const tw = Math.max(600, (tmax - tmin) / 864e5 * 26);
      const xOf = n => layout === "time" && n.t ? ((n.t - tmin) / Math.max(1, tmax - tmin)) * tw : (n.level || 0) * 230;
      if (layout === "time" && isFinite(tmin)) timeAxis = { tmin, tmax, tw };
      const place = n => {
        const c = kids.get(n.id) || [];
        if (!c.length) { pos.set(n.id, [xOf(n), row * rowH]); row++; return row - 1; }
        const ys = c.map(place); pos.set(n.id, [xOf(n), (Math.min(...ys) + Math.max(...ys)) / 2 * rowH]);
        return (Math.min(...ys) + Math.max(...ys)) / 2;
      };
      const roots = nodes.filter(n => (n.level || 0) >= 0 && (!n.parent || !byId.has(n.parent)));
      roots.forEach(r => { place(r); row += .6; });
      state_rings = [];
      const ups = nodes.filter(n => n.level < 0);
      ups.forEach((u, i) => { const rp = pos.get(rootN?.id) || [0, 0]; pos.set(u.id, [rp[0] - 200, rp[1] - 30 + i * 40]); });
    }
    const ta = timeAxis; timeAxis = null;
    return { pos, kids, byId, rings: state_rings, timeAxis: ta };
  }
  let state_rings = [], timeAxis = null;
  function drawNetwork(container, opt, state) {
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "net-wrap";
    container.appendChild(wrap);
    if (!opt.nodes.length) { wrap.innerHTML = `<div class="empty">Aucun contact documenté</div>`; return; }
    const { pos, byId, rings, timeAxis: ta } = layoutNodes(opt, state.layout);
    const pts = [...pos.values()];
    const minx = Math.min(...pts.map(p => p[0])) - 60, maxx = Math.max(...pts.map(p => p[0])) + 60;
    const miny = Math.min(...pts.map(p => p[1])) - 60, maxy = Math.max(...pts.map(p => p[1])) + (state.layout === "time" ? 90 : 60);
    const W = wrap.clientWidth || 900;
    let H = (innerWidth < 860 ? 460 : (opt.height || 620));
    if (state.layout === "tree") H = Math.min(1500, Math.max(H, (maxy - miny) * .75));
    const fit = Math.min(W / (maxx - minx), H / (maxy - miny), 1.6);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.title || "Réseau", style: `height:${H}px` }, wrap);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: col("--surface-2") }, svg);
    const g = el("g", {}, svg);
    const apply = () => g.setAttribute("transform", `translate(${state.tx + W / 2} ${state.ty + H / 2}) scale(${fit * state.k}) translate(${-(minx + maxx) / 2} ${-(miny + maxy) / 2})`);
    apply();
    if (state.layout === "radial") rings.forEach((r, i) => {
      el("circle", { cx: 0, cy: 0, r, class: "ring", fill: "none", stroke: col("--line-2") }, g);
      const t = el("text", { x: 6, y: -r - 6, class: "ring-label", fill: col("--muted") }, g); t.textContent = (opt.ringLabel ? opt.ringLabel(i + 1) : `Niveau ${i + 1}`);
    });
    if (ta) {
      const yb = maxy - 20, nt = 6;
      el("line", { x1: 0, x2: ta.tw, y1: yb, y2: yb, stroke: col("--line-2") }, g);
      for (let i = 0; i <= nt; i++) {
        const t = ta.tmin + (ta.tmax - ta.tmin) * i / nt, x = ta.tw * i / nt;
        el("line", { x1: x, x2: x, y1: miny + 20, y2: yb, stroke: col("--line"), "stroke-dasharray": "2 4" }, g);
        const tx = el("text", { x, y: yb + 16, "text-anchor": "middle", fill: col("--muted"), "font-size": 11 }, g);
        tx.textContent = new Date(t).toLocaleDateString(window.HubLang === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short" });
      }
    }
    const lg = el("g", {}, g), ng = el("g", {}, g);
    const linkEls = [];
    opt.links.forEach(l => {
      const a = pos.get(l.source), b = pos.get(l.target); if (!a || !b) return;
      let d;
      if (state.layout === "radial") d = `M${a[0]},${a[1]}L${b[0]},${b[1]}`;
      else { const mx = (a[0] + b[0]) / 2; d = `M${a[0]},${a[1]}C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`; }
      const p = el("path", { d, class: "link" + (l.strong ? " strong" : "") + (l.up ? " up" : ""), fill: "none",
        stroke: col(l.strong ? "--st-conf" : l.up ? "--ink-2" : "--line-2"), "stroke-width": l.strong ? 2.4 : 1.2, "stroke-dasharray": l.up ? "5 4" : null }, lg);
      p._l = l; linkEls.push(p);
    });
    const nodeEls = [];
    opt.nodes.forEach(n => {
      const p = pos.get(n.id); if (!p) return;
      const gg = el("g", { class: "node", transform: `translate(${p[0]} ${p[1]})`, tabindex: 0 }, ng);
      const r = n.shape === "case" ? (n.level === 0 ? 24 : 16) : n.shape === "source" ? 15 : 11;
      const fill = col(n.color || "--st-done");
      const icons = opt.sexIcons && n.sex !== undefined;
      if (n.shape === "case" || n.shape === "source") {
        el("rect", { x: -r, y: -r, width: 2 * r, height: 2 * r, rx: n.shape === "source" ? 4 : 7, fill, stroke: col(n.selected ? "--ink" : "--surface"), "stroke-width": n.selected ? 3 : 2 }, gg);
        if (icons) sexIcon(gg, n.sex, r * 1.55, "#ffffff");
      } else if (icons) { el("circle", { r: r + 1, fill: "transparent" }, gg); sexIcon(gg, n.sex, r * 2.3, fill, col(n.selected ? "--ink" : "--surface"), n.selected ? 2.4 : 1.1); }
      else el("circle", { r, fill, stroke: col(n.selected ? "--ink" : "--surface"), "stroke-width": n.selected ? 3 : 1.5 }, gg);
      if (n.ring) el("circle", { r: r + 4, fill: "none", stroke: col(n.ring), "stroke-width": 2 }, gg);
      const below = n.shape === "contact" || icons;
      const t = el("text", { y: below ? r + (icons && n.shape === "contact" ? 13 : 11) + (icons && n.shape !== "contact" ? 2 : 0) : 3.5, "text-anchor": "middle", fill: col(below ? "--ink" : "#ffffff"), "font-size": n.level === 0 ? 11 : 9.5, "font-weight": 700 }, gg);
      t.textContent = n.label || "";
      if (n.sub && (n.shape !== "contact" || state.k > 1.6)) { const s = el("text", { y: n.shape === "contact" ? r + (icons ? 23 : 21) : r + (icons ? 24 : 12), "text-anchor": "middle", class: "lbl2", fill: col("--muted"), "font-size": 8.5 }, gg); s.textContent = n.sub; }
      gg._n = n; nodeEls.push(gg);
      gg.addEventListener("mousemove", ev => { showTip(n.title || esc(n.label), ev); highlight(n.id); });
      gg.addEventListener("mouseleave", () => { hideTip(); highlight(null); });
      gg.addEventListener("click", ev => { ev.stopPropagation(); opt.onSelect && opt.onSelect(n); });
      gg.addEventListener("keydown", ev => { if (ev.key === "Enter") opt.onSelect && opt.onSelect(n); });
    });
    function highlight(id) {
      if (!id) { nodeEls.forEach(e => e.classList.remove("dim")); linkEls.forEach(e => e.classList.remove("dim")); return; }
      const keep = new Set([id]);
      let cur = byId.get(id); while (cur && cur.parent) { keep.add(cur.parent); cur = byId.get(cur.parent); }
      opt.nodes.forEach(n => { let c = n; while (c && c.parent) { if (c.parent === id) { keep.add(n.id); break; } c = byId.get(c.parent); } });
      opt.links.forEach(l => { if (l.up && (keep.has(l.target))) keep.add(l.source); });
      nodeEls.forEach(e => e.classList.toggle("dim", !keep.has(e._n.id)));
      linkEls.forEach(e => e.classList.toggle("dim", !(keep.has(e._l.source) && keep.has(e._l.target))));
    }
    // zoom / déplacement
    let drag = null;
    svg.addEventListener("wheel", ev => { ev.preventDefault(); const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15; state.k = Math.max(.3, Math.min(8, state.k * f)); apply(); }, { passive: false });
    svg.addEventListener("pointerdown", ev => { if (ev.target.closest && ev.target.closest(".node")) return; drag = [ev.clientX, ev.clientY, state.tx, state.ty]; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener("pointermove", ev => { if (!drag) return; const b = svg.getBoundingClientRect(), s = W / b.width; state.tx = drag[2] + (ev.clientX - drag[0]) * s; state.ty = drag[3] + (ev.clientY - drag[1]) * s; apply(); });
    svg.addEventListener("pointerup", () => { drag = null; });
    const tools = document.createElement("div"); tools.className = "net-tools";
    tools.innerHTML = `<button class="btn sm" data-z="in" title="Zoom +">＋</button><button class="btn sm" data-z="out" title="Zoom −">－</button><button class="btn sm" data-z="fit" title="Recentrer">⤢</button>`;
    tools.addEventListener("click", ev => { const z = ev.target.closest("button")?.dataset.z; if (!z) return; if (z === "in") state.k *= 1.3; if (z === "out") state.k /= 1.3; if (z === "fit") { state.k = 1; state.tx = 0; state.ty = 0; } if (z === "in" || z === "out") apply(); else draw2(); });
    const draw2 = () => drawNetwork(container, opt, state);
    wrap.appendChild(tools);
    const info = document.createElement("div"); info.className = "net-info";
    info.textContent = opt.info || `${opt.nodes.length} nœuds · molette = zoom · glisser = déplacer`;
    wrap.appendChild(info);
  }


  /* ---------------- Pictogrammes homme / femme (équivalent des icônes « male » / « female » d'epicontacts) ---------------- */
  // tracés dans une boîte de 24 unités centrée sur (0, 0)
  const SEX_PATH = {
    M: "M0,-12a3.4,3.4 0 1 1 0,6.8a3.4,3.4 0 1 1 0,-6.8zM-4.6,-4.2h9.2a1.8,1.8 0 0 1 1.8,1.8v6.6a1.1,1.1 0 0 1 -2.2,0v-5.2h-.6v13a1.4,1.4 0 0 1 -2.8,0v-7.4h-.6v7.4a1.4,1.4 0 0 1 -2.8,0v-13h-.6v5.2a1.1,1.1 0 0 1 -2.2,0v-6.6a1.8,1.8 0 0 1 1.8,-1.8z",
    F: "M0,-12a3.4,3.4 0 1 1 0,6.8a3.4,3.4 0 1 1 0,-6.8zM-2.6,-4.2h5.2a1.6,1.6 0 0 1 1.5,1.1l3.2,8.4h-3.4v6.9a1.3,1.3 0 0 1 -2.6,0v-6.9h-.6v6.9a1.3,1.3 0 0 1 -2.6,0v-6.9h-3.4l3.2,-8.4a1.6,1.6 0 0 1 1.5,-1.1z"
  };
  const sexKey = s => { const v = String(s || "").toUpperCase(); return v.startsWith("M") ? "M" : v.startsWith("F") ? "F" : "I"; };
  function sexIcon(parent, sex, size, fill, stroke, sw) {
    const k = sexKey(sex), sc = size / 24;
    const g = el("g", { transform: `scale(${sc})` }, parent);
    if (k === "I") {
      el("circle", { r: 10, fill, stroke: stroke || "none", "stroke-width": (sw || 1.5) / sc }, g);
      const t = el("text", { y: 5, "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: "#ffffff" }, g); t.textContent = "?";
    } else el("path", { d: SEX_PATH[k], fill, stroke: stroke || "none", "stroke-width": (sw || 1.2) / sc, "stroke-linejoin": "round", "paint-order": "stroke" }, g);
    return g;
  }
  function sexIconHTML(sex, color, size = 16) {
    const k = sexKey(sex);
    const inner = k === "I" ? `<circle r="10" fill="${color}"/><text y="5" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">?</text>` : `<path d="${SEX_PATH[k]}" fill="${color}"/>`;
    return `<svg class="sexicon" width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true">${inner}</svg>`;
  }

  /* ---------------- Palettes RECON (practical-ebola-reconstruction / real-time-response-3) ---------------- */
  const ramp = stops => t => {
    t = Math.max(0, Math.min(1, t)); const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const a = stops[i].match(/\w\w/g).map(h => parseInt(h, 16)), b = stops[i + 1].match(/\w\w/g).map(h => parseInt(h, 16));
    return "#" + a.map((v, j) => Math.round(v + (b[j] - v) * f).toString(16).padStart(2, "0")).join("");
  };
  const PAL = {
    support: ramp(["918D98", "645877", "423359", "281449", "1A0340"]),
    supportDark: ramp(["6E6A75", "8B7FA0", "A99BC4", "C9BCE8", "E6DCFF"]),
    age: ramp(["3288BD", "ABDDA4", "FDAE61", "D53E4F"]),
    outcome: ramp(["3288BD", "ABDDA4"])
  };
  const isDark = () => document.documentElement.dataset.theme === "dark";

  /* ------------------------------------------------------------------
     Arbre de transmission daté (epicontacts « ttree ») : x = date, lignes ordonnées par taille de sous-arbre,
     arêtes coudées colorées selon le support, nœuds dimensionnés selon R_i.
     opt: nodes [{id, parent, t(ms), r(size value), color, sex, title, support}], height, sexIcons, onSelect
     ------------------------------------------------------------------ */
  function ttree(container, opt) {
    const state = { k: 1, tx: 0, ty: 0, focus: null };
    register(container, () => drawTtree(container, opt, state));
  }
  function drawTtree(container, opt, state) {
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "net-wrap"; container.appendChild(wrap);
    const nodes = opt.nodes || [];
    if (!nodes.length) { wrap.innerHTML = `<div class="empty">${esc(opt.empty || "Aucune donnée")}</div>`; return; }
    const byId = new Map(nodes.map(n => [n.id, n])), kids = new Map();
    nodes.forEach(n => { if (n.parent && byId.has(n.parent)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); } });
    const size = new Map();
    const sz = n => { if (size.has(n.id)) return size.get(n.id); let v = 1; (kids.get(n.id) || []).forEach(c => v += sz(c)); size.set(n.id, v); return v; };
    nodes.forEach(sz);
    const roots = nodes.filter(n => !n.parent || !byId.has(n.parent)).sort((a, b) => opt.rootOrder === "time" ? a.t - b.t : sz(b) - sz(a) || a.t - b.t);
    const rowOf = new Map(); let row = 0;
    const place = n => { rowOf.set(n.id, row++); (kids.get(n.id) || []).sort((a, b) => sz(b) - sz(a) || a.t - b.t).forEach(place); };
    roots.forEach(r => { place(r); row += .5; });
    const tmin = Math.min(...nodes.map(n => n.t)), tmax = Math.max(...nodes.map(n => n.t));
    const W = wrap.clientWidth || 900, rowH = opt.rowH || 16, m = { l: 18, r: 18, t: 30, b: 30 };
    const H = Math.min(opt.maxHeight || 1500, Math.max(opt.height || 420, row * rowH + m.t + m.b));
    const span = Math.max(1, tmax - tmin);
    const X = t => m.l + 10 + (t - tmin) / span * (W - m.l - m.r - 20), Yr = r => m.t + 8 + r * rowH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, style: `height:${H}px`, role: "img", "aria-label": opt.title || "Arbre de transmission" }, wrap);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: col("--surface-2") }, svg);
    const g = el("g", {}, svg);
    const apply = () => g.setAttribute("transform", `translate(${state.tx} ${state.ty}) scale(${state.k})`);
    apply();
    // axe temporel double (haut et bas)
    const nt = Math.max(3, Math.min(10, Math.floor(W / 110)));
    for (let i = 0; i <= nt; i++) {
      const t = tmin + span * i / nt, x = X(t);
      el("line", { x1: x, x2: x, y1: m.t - 6, y2: Yr(row) , stroke: col("--line"), "stroke-dasharray": "2 4" }, g);
      [m.t - 12, Yr(row) + 16].forEach(y => { const tx = el("text", { x, y, "text-anchor": "middle", fill: col("--muted"), "font-size": 10.5 }, g); tx.textContent = new Date(t).toLocaleDateString(window.HubLang === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit" }); });
    }
    const supCol = isDark() ? PAL.supportDark : PAL.support;
    const edges = [], nodeEls = [];
    nodes.forEach(n => {
      const p = n.parent && byId.get(n.parent); if (!p) return;
      const x0 = X(p.t), y0 = Yr(rowOf.get(p.id)), x1 = X(n.t), y1 = Yr(rowOf.get(n.id));
      const e = el("path", { d: `M${x0},${y0}V${y1}H${x1}`, fill: "none", stroke: supCol(n.support ?? 1), "stroke-width": 1.2 + 2.2 * (n.support ?? 1), "stroke-opacity": .9 }, g);
      e._n = n; edges.push(e);
    });
    const rad = n => (opt.minR || 3.2) + 2.4 * Math.sqrt(n.r || 0);
    nodes.forEach(n => {
      const gg = el("g", { class: "node", transform: `translate(${X(n.t)} ${Yr(rowOf.get(n.id))})`, tabindex: 0 }, g);
      const r = rad(n), fill = col(n.color || "--s1");
      if (opt.sexIcons) { el("circle", { r: r + 3, fill: "transparent" }, gg); sexIcon(gg, n.sex, Math.max(17, r * 3), fill, col(isDark() ? "--surface" : "--ink-2"), .6); }
      else el("circle", { r, fill, stroke: col(n.ring || "--surface"), "stroke-width": n.ring ? 2 : 1.2 }, gg);
      gg._n = n; nodeEls.push(gg);
      gg.addEventListener("mousemove", ev => { showTip(n.title || esc(n.id), ev); });
      gg.addEventListener("mouseleave", hideTip);
      gg.addEventListener("click", ev => { ev.stopPropagation(); state.focus = state.focus === n.id ? null : n.id; focus(); opt.onSelect && opt.onSelect(n); });
    });
    function focus() {
      if (!state.focus) { nodeEls.forEach(e => e.classList.remove("dim")); edges.forEach(e => e.classList.remove("dim")); return; }
      const keep = new Set(); const down = id => { keep.add(id); (kids.get(id) || []).forEach(c => down(c.id)); };
      down(state.focus); let c = byId.get(state.focus); while (c && c.parent && byId.has(c.parent)) { keep.add(c.parent); c = byId.get(c.parent); }
      nodeEls.forEach(e => e.classList.toggle("dim", !keep.has(e._n.id))); edges.forEach(e => e.classList.toggle("dim", !(keep.has(e._n.id) && keep.has(e._n.parent))));
    }
    focus();
    let drag = null;
    svg.addEventListener("wheel", ev => { ev.preventDefault(); const b = svg.getBoundingClientRect(), s = W / b.width, px = (ev.clientX - b.left) * s, py = (ev.clientY - b.top) * s; const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15, nk = Math.max(.4, Math.min(10, state.k * f)); state.tx = px - (px - state.tx) * nk / state.k; state.ty = py - (py - state.ty) * nk / state.k; state.k = nk; apply(); }, { passive: false });
    svg.addEventListener("pointerdown", ev => { if (ev.target.closest && ev.target.closest(".node")) return; drag = [ev.clientX, ev.clientY, state.tx, state.ty]; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener("pointermove", ev => { if (!drag) return; const b = svg.getBoundingClientRect(), s = W / b.width; state.tx = drag[2] + (ev.clientX - drag[0]) * s; state.ty = drag[3] + (ev.clientY - drag[1]) * s; apply(); });
    svg.addEventListener("pointerup", () => { drag = null; });
    svg.addEventListener("dblclick", () => { state.k = 1; state.tx = 0; state.ty = 0; state.focus = null; apply(); focus(); });
    const tools = document.createElement("div"); tools.className = "net-tools";
    tools.innerHTML = `<button class="btn sm" data-z="in" title="Zoom +">＋</button><button class="btn sm" data-z="out" title="Zoom −">－</button><button class="btn sm" data-z="fit" title="Recentrer">⤢</button>`;
    tools.addEventListener("click", ev => { const z = ev.target.closest("button")?.dataset.z; if (!z) return; if (z === "in") state.k *= 1.3; if (z === "out") state.k /= 1.3; if (z === "fit") { state.k = 1; state.tx = 0; state.ty = 0; state.focus = null; focus(); } apply(); });
    wrap.appendChild(tools);
    const info = document.createElement("div"); info.className = "net-info"; info.textContent = opt.info || `${nodes.length} cas`; wrap.appendChild(info);
  }

  /* ------------------------------------------------------------------
     Réseau global des cas (epicontacts) : chaque composante est disposée par forces puis rangée en grille,
     nœuds = pictogrammes homme / femme colorés par classification.
     opt: nodes [{id, color, sex, title, big}], links [{source, target, strong}], height, onSelect
     ------------------------------------------------------------------ */
  function forceNet(container, opt) {
    const state = { k: 1, tx: 0, ty: 0 };
    register(container, () => drawForce(container, opt, state));
  }
  function layoutComponents(nodes, links) {
    const adj = new Map(nodes.map(n => [n.id, []]));
    links.forEach(l => { if (adj.has(l.source) && adj.has(l.target)) { adj.get(l.source).push(l.target); adj.get(l.target).push(l.source); } });
    const seen = new Set(), comps = [];
    nodes.forEach(n => { if (seen.has(n.id)) return; const c = [], q = [n.id]; seen.add(n.id); while (q.length) { const x = q.pop(); c.push(x); adj.get(x).forEach(y => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); } comps.push(c); });
    comps.sort((a, b) => b.length - a.length);
    const pos = new Map(), boxes = [];
    comps.forEach(c => {
      const n = c.length, P = new Map();
      c.forEach((id, i) => { const a = 2 * Math.PI * i / n, r = 12 * Math.sqrt(n); P.set(id, [Math.cos(a) * r + (i % 3), Math.sin(a) * r]); });
      if (n > 1) {
        const E = links.filter(l => P.has(l.source) && P.has(l.target)), L0 = 46;
        for (let it = 0; it < (n > 150 ? 120 : 260); it++) {
          const F = new Map(c.map(id => [id, [0, 0]])), temp = 1 - it / 300;
          for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const a = P.get(c[i]), b = P.get(c[j]); let dx = a[0] - b[0], dy = a[1] - b[1], d2 = dx * dx + dy * dy + .01; if (d2 > 40000) continue;
            const f = 900 / d2; F.get(c[i])[0] += dx * f; F.get(c[i])[1] += dy * f; F.get(c[j])[0] -= dx * f; F.get(c[j])[1] -= dy * f;
          }
          E.forEach(l => { const a = P.get(l.source), b = P.get(l.target), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) + .01, f = (d - L0) * .08; F.get(l.source)[0] += dx / d * f; F.get(l.source)[1] += dy / d * f; F.get(l.target)[0] -= dx / d * f; F.get(l.target)[1] -= dy / d * f; });
          c.forEach(id => { const p = P.get(id), f = F.get(id); const m = Math.sqrt(f[0] * f[0] + f[1] * f[1]) || 1, s = Math.min(m, 8 * temp + .5) / m; p[0] += f[0] * s - p[0] * .004; p[1] += f[1] * s - p[1] * .004; });
        }
      }
      const xs = c.map(id => P.get(id)[0]), ys = c.map(id => P.get(id)[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 36, h = Math.max(...ys) - y0 + 36;
      boxes.push({ c, P, x0, y0, w, h });
    });
    return { boxes };
  }
  function drawForce(container, opt, state) {
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "net-wrap"; container.appendChild(wrap);
    if (!opt.nodes.length) { wrap.innerHTML = `<div class="empty">${esc(opt.empty || "Aucune donnée")}</div>`; return; }
    if (!opt._lay) opt._lay = layoutComponents(opt.nodes, opt.links);
    const W = wrap.clientWidth || 900;
    // rangement en étagères
    let x = 0, y = 0, rowH = 0; const pos = new Map(), totalW = Math.max(W, 600);
    opt._lay.boxes.forEach(b => { if (x + b.w > totalW && x > 0) { x = 0; y += rowH + 10; rowH = 0; } b.c.forEach(id => { const p = b.P.get(id); pos.set(id, [x + p[0] - b.x0 + 18, y + p[1] - b.y0 + 18]); }); x += b.w + 10; rowH = Math.max(rowH, b.h); });
    const fullH = y + rowH, H = Math.min(opt.maxHeight || 2600, Math.max(opt.height || 300, fullH + 10));
    const fit = Math.min(W / totalW, H / Math.max(fullH, 1));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, style: `height:${H}px` }, wrap);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: col("--surface-2") }, svg);
    const defs = el("defs", {}, svg), mk = el("marker", { id: "arr" + (opt.uid || ""), viewBox: "0 -4 8 8", refX: 15, refY: 0, markerWidth: 5, markerHeight: 5, orient: "auto" }, defs);
    el("path", { d: "M0,-4L8,0L0,4", fill: col("--ink-2") }, mk);
    const g = el("g", {}, svg);
    const apply = () => g.setAttribute("transform", `translate(${state.tx} ${state.ty}) scale(${fit * state.k})`); apply();
    opt.links.forEach(l => { const a = pos.get(l.source), b = pos.get(l.target); if (!a || !b) return; el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col(l.strong ? "--st-conf" : "--ink-2"), "stroke-opacity": l.strong ? .9 : .45, "stroke-width": l.strong ? 1.8 : 1, "marker-end": `url(#arr${opt.uid || ""})` }, g); });
    opt.nodes.forEach(n => {
      const p = pos.get(n.id); if (!p) return;
      const gg = el("g", { class: "node", transform: `translate(${p[0]} ${p[1]})` }, g);
      el("circle", { r: 10, fill: "transparent" }, gg);
      sexIcon(gg, n.sex, n.big ? 30 : 22, col(n.color || "--s1"), col(n.ring || "--surface"), n.ring ? 2.2 : 1.2);
      gg.addEventListener("mousemove", ev => showTip(n.title || esc(n.id), ev)); gg.addEventListener("mouseleave", hideTip);
      gg.addEventListener("click", ev => { ev.stopPropagation(); opt.onSelect && opt.onSelect(n); });
    });
    let drag = null;
    svg.addEventListener("wheel", ev => { ev.preventDefault(); const b = svg.getBoundingClientRect(), s = W / b.width, px = (ev.clientX - b.left) * s, py = (ev.clientY - b.top) * s; const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15, nk = Math.max(.3, Math.min(14, state.k * f)); state.tx = px - (px - state.tx) * nk / state.k; state.ty = py - (py - state.ty) * nk / state.k; state.k = nk; apply(); }, { passive: false });
    svg.addEventListener("pointerdown", ev => { if (ev.target.closest && ev.target.closest(".node")) return; drag = [ev.clientX, ev.clientY, state.tx, state.ty]; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener("pointermove", ev => { if (!drag) return; const b = svg.getBoundingClientRect(), s = W / b.width; state.tx = drag[2] + (ev.clientX - drag[0]) * s; state.ty = drag[3] + (ev.clientY - drag[1]) * s; apply(); });
    svg.addEventListener("pointerup", () => { drag = null; });
    const tools = document.createElement("div"); tools.className = "net-tools";
    tools.innerHTML = `<button class="btn sm" data-z="in">＋</button><button class="btn sm" data-z="out">－</button><button class="btn sm" data-z="fit">⤢</button>`;
    tools.addEventListener("click", ev => { const z = ev.target.closest("button")?.dataset.z; if (!z) return; if (z === "in") state.k *= 1.3; if (z === "out") state.k /= 1.3; if (z === "fit") { state.k = 1; state.tx = 0; state.ty = 0; } apply(); });
    wrap.appendChild(tools);
    const info = document.createElement("div"); info.className = "net-info"; info.textContent = opt.info || ""; wrap.appendChild(info);
  }


  /* ------------------------------------------------------------------
     Grappes par lieu de transmission (style « clusters » : bar / mariage / temple)
     opt.clusters: [{id, hub:{letter, title}, source:{label, title, color}, nodes:[{color, caseRing, frame:'solid'|'dashed'|null, title}]}]
     ------------------------------------------------------------------ */
  function settingNet(container, opt) {
    const state = { k: 1, tx: 0, ty: 0 };
    register(container, () => drawSettingNet(container, opt, state));
  }
  function drawSettingNet(container, opt, state) {
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "net-wrap"; container.appendChild(wrap);
    const CL = opt.clusters || [];
    if (!CL.length) { wrap.innerHTML = `<div class="empty">${esc(opt.empty || "Aucune donnée")}</div>`; return; }
    const W = wrap.clientWidth || 900, gap = 18, nr = 6.5, step = 17;
    // disposition de chaque grappe : nœud « lieu » au centre, contacts sur des anneaux concentriques, cas source au-dessus
    const lay = CL.map(c => {
      const pts = []; let ring = 0, placed = 0;
      while (placed < c.nodes.length) {
        const r = 34 + ring * step, cap = Math.max(6, Math.floor(2 * Math.PI * r / step)), n = Math.min(cap, c.nodes.length - placed);
        for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + Math.PI / Math.max(n, 1) + 2 * Math.PI * i / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        placed += n; ring++;
      }
      const R = 34 + Math.max(0, ring - 1) * step + 14;
      return { c, pts, R, w: 2 * R + 10, h: 2 * R + 46 };
    });
    let x = 0, y = 0, rowH = 0; const pos = [];
    lay.forEach(l => { if (x + l.w > W && x > 0) { x = 0; y += rowH + gap; rowH = 0; } pos.push([x + l.w / 2, y + 40 + l.R]); x += l.w + gap; rowH = Math.max(rowH, l.h); });
    const H = Math.min(opt.maxHeight || 1800, Math.max(opt.height || 380, y + rowH + 20));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, style: `height:${H}px` }, wrap);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: col("--surface-2") }, svg);
    const defs = el("defs", {}, svg), mk = el("marker", { id: "sarr", viewBox: "0 -4 8 8", refX: 13, refY: 0, markerWidth: 4.5, markerHeight: 4.5, orient: "auto" }, defs);
    el("path", { d: "M0,-4L8,0L0,4", fill: col("--muted") }, mk);
    const g = el("g", {}, svg);
    const apply = () => g.setAttribute("transform", `translate(${state.tx} ${state.ty}) scale(${state.k})`); apply();
    lay.forEach((l, i) => {
      const [cx, cy] = pos[i], c = l.c;
      const gg = el("g", { transform: `translate(${cx} ${cy})` }, g);
      // lien cas source -> lieu
      const sy = -l.R - 22;
      el("line", { x1: 0, y1: sy + 9, x2: 0, y2: -12, stroke: col("--ink-2"), "stroke-width": 1.6, "marker-end": "url(#sarr)" }, gg);
      l.pts.forEach(p => el("line", { x1: 0, y1: 0, x2: p[0], y2: p[1], stroke: col("--line-2"), "stroke-width": .8, "marker-end": "url(#sarr)" }, gg));
      c.nodes.forEach((n, j) => {
        const p = l.pts[j]; const ng = el("g", { class: "node", transform: `translate(${p[0]} ${p[1]})` }, gg);
        if (n.frame) el("rect", { x: -nr - 3.2, y: -nr - 3.2, width: 2 * nr + 6.4, height: 2 * nr + 6.4, rx: 1.5, fill: "none", stroke: col("--ink-2"), "stroke-width": 1, "stroke-dasharray": n.frame === "dashed" ? "2.5 2" : null }, ng);
        el("circle", { r: n.caseRing ? nr + 1.5 : nr, fill: n.color, stroke: n.caseRing ? col("--st-conf") : col("--surface"), "stroke-width": n.caseRing ? 2.6 : 1.2 }, ng);
        ng.addEventListener("mousemove", ev => showTip(n.title || "", ev)); ng.addEventListener("mouseleave", hideTip);
        if (opt.onNode) ng.addEventListener("click", () => opt.onNode(n));
      });
      const hub = el("g", { class: "node" }, gg);
      el("circle", { r: 12, fill: col("--surface"), stroke: col("--ink"), "stroke-width": 1.6 }, hub);
      const t = el("text", { y: 4, "text-anchor": "middle", "font-size": 11, "font-weight": 800, fill: col("--ink") }, hub); t.textContent = c.hub.letter;
      hub.addEventListener("mousemove", ev => showTip(c.hub.title || "", ev)); hub.addEventListener("mouseleave", hideTip);
      const src = el("g", { class: "node", transform: `translate(0 ${sy})` }, gg);
      el("circle", { r: 9, fill: c.source.color || "#E8A598", stroke: col("--surface"), "stroke-width": 1.5 }, src);
      const st = el("text", { y: -13, "text-anchor": "middle", "font-size": 9.5, "font-weight": 700, fill: col("--ink-2") }, src); st.textContent = c.source.label || "";
      src.addEventListener("mousemove", ev => showTip(c.source.title || "", ev)); src.addEventListener("mouseleave", hideTip);
      if (opt.onSource) src.addEventListener("click", () => opt.onSource(c));
      const cap = el("text", { y: l.R + 4, "text-anchor": "middle", "font-size": 10, fill: col("--muted") }, gg); cap.textContent = c.caption || "";
    });
    let drag = null;
    svg.addEventListener("wheel", ev => { ev.preventDefault(); const b = svg.getBoundingClientRect(), s = W / b.width, px = (ev.clientX - b.left) * s, py = (ev.clientY - b.top) * s; const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15, nk = Math.max(.4, Math.min(8, state.k * f)); state.tx = px - (px - state.tx) * nk / state.k; state.ty = py - (py - state.ty) * nk / state.k; state.k = nk; apply(); }, { passive: false });
    svg.addEventListener("pointerdown", ev => { if (ev.target.closest && ev.target.closest(".node")) return; drag = [ev.clientX, ev.clientY, state.tx, state.ty]; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener("pointermove", ev => { if (!drag) return; const b = svg.getBoundingClientRect(), s = W / b.width; state.tx = drag[2] + (ev.clientX - drag[0]) * s; state.ty = drag[3] + (ev.clientY - drag[1]) * s; apply(); });
    svg.addEventListener("pointerup", () => { drag = null; });
    const tools = document.createElement("div"); tools.className = "net-tools";
    tools.innerHTML = `<button class="btn sm" data-z="in">＋</button><button class="btn sm" data-z="out">－</button><button class="btn sm" data-z="fit">⤢</button>`;
    tools.addEventListener("click", ev => { const z = ev.target.closest("button")?.dataset.z; if (!z) return; if (z === "in") state.k *= 1.3; if (z === "out") state.k /= 1.3; if (z === "fit") { state.k = 1; state.tx = 0; state.ty = 0; } apply(); });
    wrap.appendChild(tools);
    const info = document.createElement("div"); info.className = "net-info"; info.textContent = opt.info || ""; wrap.appendChild(info);
  }

  /* ---------------- Schéma traçage prospectif / rétrograde (Endo et al. 2020) ---------------- */
  function tracingDiagram(container, opt) {
    register(container, () => {
      container.innerHTML = "";
      const W = Math.max(560, container.clientWidth || 800), H = 300;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, style: `height:${H}px;width:100%` }, container);
      const defs = el("defs", {}, svg);
      const arrow = (id, c) => { const m = el("marker", { id, viewBox: "0 -5 10 10", refX: 9, refY: 0, markerWidth: 6, markerHeight: 6, orient: "auto" }, defs); el("path", { d: "M0,-5L10,0L0,5", fill: c }, m); };
      const cT = col("--ink-2"), cOk = "#7E9BD1", cKo = "#D08B5B", cCase = "#9CBF7E", cIdx = "#7E9BD1", cQ = "#B98D6B";
      arrow("ar-t", cT); arrow("ar-ok", cOk); arrow("ar-ko", cKo);
      const half = W / 2;
      const node = (x, y, c, lab) => { el("circle", { cx: x, cy: y, r: 17, fill: c, stroke: col("--surface"), "stroke-width": 2 }, svg); if (lab) { const t = el("text", { x, y: y + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: "#fff" }, svg); t.textContent = lab; } };
      const line = (x1, y1, x2, y2, c, m, curve) => el("path", { d: curve ? `M${x1},${y1}Q${curve[0]},${curve[1]} ${x2},${y2}` : `M${x1},${y1}L${x2},${y2}`, fill: "none", stroke: c, "stroke-width": 2.2, "marker-end": `url(#${m})` }, svg);
      const title = (x, txt) => { const t = el("text", { x, y: 22, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: col("--ink") }, svg); t.textContent = txt; };
      [[0, false], [half, true]].forEach(([ox, back]) => {
        const X = f => ox + f * half;
        title(X(.5), back ? opt.tBack : opt.tFwd);
        const top = [X(.38), 60], mid = [X(.38), 140], right = [X(.66), 140], b1 = [X(.16), 225], b2 = [X(.38), 225], b3 = [X(.66), 225];
        line(top[0], top[1] + 17, mid[0], mid[1] - 19, cT, "ar-t"); line(top[0] + 14, top[1] + 10, right[0] - 12, right[1] - 14, cT, "ar-t");
        line(mid[0] - 12, mid[1] + 12, b1[0] + 10, b1[1] - 14, cT, "ar-t"); line(mid[0], mid[1] + 17, b2[0], b2[1] - 19, cT, "ar-t"); line(right[0], right[1] + 17, b3[0], b3[1] - 19, cT, "ar-t");
        line(mid[0] - 17, mid[1] - 2, b1[0] - 8, b1[1] - 17, cKo, "ar-ko", [X(.14), 140]);
        line(mid[0] + 17, mid[1] + 4, b2[0] + 14, b2[1] - 8, cOk, "ar-ok", [X(.5), 190]);
        if (back) { line(mid[0] + 14, mid[1] - 10, top[0] + 14, top[1] + 9, cOk, "ar-ok", [X(.52), 100]); line(top[0] + 17, top[1] - 4, right[0] + 6, right[1] - 18, cOk, "ar-ok", [X(.7), 62]); line(right[0] + 17, right[1] + 4, b3[0] + 14, b3[1] - 8, cOk, "ar-ok", [X(.8), 190]); }
        node(...top, back ? cQ : cCase); node(...mid, cIdx, "I"); node(...right, back ? cQ : cCase); node(...b1, cCase); node(...b2, cQ); node(...b3, back ? cQ : cCase);
        const note = el("text", { x: X(.5), y: 272, "text-anchor": "middle", "font-size": 11.5, fill: col("--ink-2") }, svg); note.textContent = back ? opt.nBack : opt.nFwd;
      });
      const lg = document.createElement("div"); lg.className = "legend";
      lg.innerHTML = `<span><i class="line" style="background:${cT}"></i>${esc(opt.lT)}</span><span><i class="line" style="background:${cOk}"></i>${esc(opt.lOk)}</span><span><i class="line" style="background:${cKo}"></i>${esc(opt.lKo)}</span><span><i class="round" style="background:${cCase}"></i>${esc(opt.lCase)}</span><span><i class="round" style="background:${cIdx}"></i>${esc(opt.lIdx)}</span><span><i class="round" style="background:${cQ}"></i>${esc(opt.lQ)}</span>`;
      container.appendChild(lg);
    });
  }

  /* largeur réelle d'une étiquette de carte (police grasse), pour éviter les chevauchements */
  const _meas = document.createElement("canvas").getContext("2d");
  function labelWidth(txt, fs) { _meas.font = `600 ${fs}px system-ui,-apple-system,"Segoe UI",Arial,sans-serif`; return _meas.measureText(txt).width; }

  /* Halo des étiquettes à l'export : certains navigateurs ignorent paint-order quand le SVG est converti en image
     (le contour blanc recouvre alors les lettres). On dessine un double du texte (contour seul) en dessous, puis le texte sans contour. */
  function fixHalo(svg) {
    svg.querySelectorAll("text").forEach(t => {
      const st = t.style.stroke || t.getAttribute("stroke"), sw = parseFloat(t.style.strokeWidth || t.getAttribute("stroke-width") || 0);
      if (!st || st === "none" || !(sw > 0)) return;
      const halo = t.cloneNode(true);
      halo.style.fill = st; halo.style.stroke = st; halo.style.strokeWidth = sw + "px"; halo.style.strokeLinejoin = "round"; halo.style.paintOrder = "normal";
      t.parentNode.insertBefore(halo, t);
      t.style.stroke = "none"; t.style.paintOrder = "normal";
    });
    svg.querySelectorAll("text").forEach(t => { if (!t.style.fontFamily) t.style.fontFamily = 'system-ui,-apple-system,"Segoe UI",Arial,sans-serif'; });
  }

  /* Carte de rapport dessinée hors écran en grand format (plus d'étiquettes lisibles), puis exportée avec légende */
  function reportChoropleth(opt, rep) {
    const box = document.createElement("div");
    box.style.cssText = `position:absolute;left:-12000px;top:0;width:${rep.width || 1000}px;background:#fff`;
    document.body.appendChild(box);
    try {
      choropleth(box, Object.assign({}, opt, { labelPx: rep.labelPx || 11, report: true }));
      reportMapPNG(box, rep);
    } finally { registry.delete(box); box.remove(); }
  }

  /* ---------------- Export PNG d'un panneau ---------------- */
  function inlineStyles(src, dst) {
    const cs = getComputedStyle(src);
    ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-weight", "font-family", "fill-opacity",
     "stroke-opacity", "paint-order", "stroke-linejoin", "text-anchor", "dominant-baseline", "letter-spacing"].forEach(p => {
      const v = cs.getPropertyValue(p); if (v) dst.style.setProperty(p, v);
    });
    for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
  }
  function downloadPNG(panel, name) {
    const mc = panel.querySelector(".chart.map"); if (mc && mc.__export) { mc.__export(name, panel); return; }
    const svg = panel.querySelector("svg"); if (!svg) { alert("Aucun graphique à exporter dans ce panneau."); return; }
    const clone = svg.cloneNode(true); inlineStyles(svg, clone); fixHalo(clone);
    const vb = svg.viewBox.baseVal, w = vb && vb.width ? vb.width : svg.clientWidth, h = vb && vb.height ? vb.height : svg.clientHeight;
    const title = panel.querySelector(".panel-head h2")?.textContent || name || "graphique";
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    const data = new XMLSerializer().serializeToString(clone);
    const items = [...panel.querySelectorAll(".legend span, .scale > span")].filter(sp => sp.querySelector("i") && sp.textContent.trim());
    const ramp = !items.length ? panel.querySelector(".scale .ramp") : null;
    const meas = document.createElement("canvas").getContext("2d"); meas.font = "12px system-ui,sans-serif";
    let lines = 1, lxm = 12; items.forEach(sp => { const wd = meas.measureText(sp.textContent.trim()).width + 32; if (lxm + wd > w - 12 && lxm > 12) { lines++; lxm = 12; } lxm += wd; });
    const img = new Image(), sc = 2, head = 44, legendH = items.length ? 10 + lines * 20 : ramp ? 30 : (panel.querySelector(".legend") ? 30 : 0);
    // méthodologie du panneau (encadré .method-box) reprise sous le graphique
    const mLines = [];
    panel.querySelectorAll(".method-box").forEach(mb => {
      [...mb.children].forEach(ch => {
        const tag = ch.tagName.toLowerCase();
        const wrapT = (txt, font, ind) => { meas.font = font; let cur = ""; String(txt).split(/\s+/).forEach(wd => { const n = cur ? cur + " " + wd : wd; if (meas.measureText(n).width > w - 24 - ind && cur) { mLines.push({ t: cur, font, ind }); cur = wd; } else cur = n; }); if (cur) mLines.push({ t: cur, font, ind }); };
        if (tag === "h4") { mLines.push({ gap: 4 }); wrapT(ch.textContent.trim(), "700 12px system-ui,sans-serif", 0); }
        else if (tag === "ul") ch.querySelectorAll("li").forEach(li => { const before = mLines.length; wrapT(li.textContent.trim(), "11.5px system-ui,sans-serif", 12); if (mLines[before]) mLines[before].bullet = true; });
        else wrapT(ch.textContent.trim(), "11.5px system-ui,sans-serif", 0);
      });
    });
    const methH = mLines.length ? 14 + mLines.reduce((a, l) => a + (l.gap || 16), 0) : 0;
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = w * sc; c.height = (h + head + legendH + methH + 24) * sc;
      const x = c.getContext("2d"); x.scale(sc, sc);
      x.fillStyle = col("--surface") || "#fff"; x.fillRect(0, 0, w, h + head + legendH + methH + 24);
      x.fillStyle = col("--ink"); x.font = "600 16px system-ui,sans-serif"; x.fillText(title, 12, 26);
      x.drawImage(img, 0, head, w, h);
      let lx = 12, ly = h + head + 10;
      x.font = "12px system-ui,sans-serif";
      items.forEach(sp => { const tx = sp.textContent.trim(), wd = x.measureText(tx).width + 32; if (lx + wd > w - 12 && lx > 12) { lx = 12; ly += 20; }
        const i = sp.querySelector("i"); x.fillStyle = i ? getComputedStyle(i).backgroundColor : "#999"; x.fillRect(lx, ly, 10, 10); x.fillStyle = col("--ink-2"); x.fillText(tx, lx + 14, ly + 9); lx += wd; });
      if (ramp) { const sp = ramp.parentElement.querySelectorAll(":scope > span"), cs = [...ramp.querySelectorAll("i")].map(i => getComputedStyle(i).backgroundColor);
        x.fillStyle = col("--ink-2"); const t0 = sp[0]?.textContent || ""; x.fillText(t0, 12, ly + 9); const rx = 18 + x.measureText(t0).width;
        cs.forEach((c, k) => { x.fillStyle = c; x.fillRect(rx + k * 26, ly, 26, 10); }); x.fillStyle = col("--ink-2"); x.fillText(sp[1]?.textContent || "", rx + cs.length * 26 + 6, ly + 9); }
      if (mLines.length) {
        let my = h + head + legendH + 14; x.strokeStyle = col("--line") || "#ddd"; x.beginPath(); x.moveTo(12, my - 6); x.lineTo(w - 12, my - 6); x.stroke();
        mLines.forEach(l => { if (l.gap) { my += l.gap; return; } x.font = l.font; x.fillStyle = l.font.startsWith("700") ? (col("--ink") || "#111") : (col("--ink-2") || "#333");
          if (l.bullet) x.fillText("•", 14, my + 11); x.fillText(l.t, 12 + l.ind, my + 11); my += 16; });
      }
      x.fillStyle = col("--muted"); x.font = "10px system-ui,sans-serif"; x.fillText("Ebola Outbreak, SGI-TASK FORCE · " + (window.DASHBOARD_DATA?.meta?.cutoff || ""), 12, h + head + legendH + methH + 16);
      c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (name || title).replace(/[^\w\-]+/g, "_") + ".png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
  }

  /* Carte de rapport produite dans le navigateur (toute période) : titre, sous-titre, carte, légende avec effectifs,
     nord, notes, source. opt = {title, subtitle, legendTitle, legend:[{color,label,count}], notes:[], source, file} */
  function reportMapPNG(container, opt) {
    const svg = container.querySelector("svg"); if (!svg) { alert("Carte indisponible."); return; }
    const clone = svg.cloneNode(true); inlineStyles(svg, clone); fixHalo(clone);
    const vb = svg.viewBox.baseVal, w = vb.width || svg.clientWidth, h = vb.height || svg.clientHeight;
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    const img = new Image(), sc = 2.5, side = 270, head = 74, notes = opt.notes || [];
    const insetSvg = opt.inset || container.__inset || null; let insetImg = insetSvg ? new Image() : null;
    const insetH = insetSvg ? Math.round(side * insetSvg.viewBox.baseVal.height / insetSvg.viewBox.baseVal.width) + 26 : 0;
    const W = w + side + 36;
    const meas = document.createElement("canvas").getContext("2d"); meas.font = "11px system-ui,sans-serif";
    const wrap = (t, mw) => { const out = []; let cur = ""; String(t).split(" ").forEach(wd => { const n = cur ? cur + " " + wd : wd; if (meas.measureText(n).width > mw && cur) { out.push(cur); cur = wd; } else cur = n; }); if (cur) out.push(cur); return out; };
    const noteLines = notes.flatMap(n => wrap(n, W - 40));
    const H = head + Math.max(h, insetH + 60 + (opt.legend || []).length * 24 + 150) + 20 + noteLines.length * 15 + 34;
    let pending = insetImg ? 2 : 1;
    const draw = () => {
      const c = document.createElement("canvas"); c.width = W * sc; c.height = H * sc;
      const x = c.getContext("2d"); x.scale(sc, sc);
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
      x.fillStyle = "#16202a"; x.font = "700 19px system-ui,sans-serif"; x.fillText(opt.title || "", 18, 32);
      x.fillStyle = "#4a5560"; x.font = "12.5px system-ui,sans-serif"; x.fillText(opt.subtitle || "", 18, 54);
      x.strokeStyle = "#d8dde2"; x.beginPath(); x.moveTo(18, head - 8); x.lineTo(W - 18, head - 8); x.stroke();
      x.drawImage(img, 18, head, w, h);
      x.strokeStyle = "#c9ced3"; x.strokeRect(18, head, w, h);
      // nord
      const nx = 18 + w - 26, ny = head + 16;
      x.fillStyle = "#16202a"; x.beginPath(); x.moveTo(nx, ny); x.lineTo(nx - 7, ny + 20); x.lineTo(nx, ny + 15); x.closePath(); x.fill();
      x.fillStyle = "#ffffff"; x.strokeStyle = "#16202a"; x.beginPath(); x.moveTo(nx, ny); x.lineTo(nx + 7, ny + 20); x.lineTo(nx, ny + 15); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = "#16202a"; x.font = "700 12px system-ui,sans-serif"; x.textAlign = "center"; x.fillText("N", nx, ny + 33); x.textAlign = "left";
      // encart RDC puis légende
      const lx = 18 + w + 18; let ly = head + 8;
      if (insetImg) {
        x.fillStyle = "#16202a"; x.font = "700 12.5px system-ui,sans-serif"; x.fillText(TT("Localisation en RDC"), lx, ly + 11); ly += 18;
        const ih = insetH - 26; x.drawImage(insetImg, lx, ly, side, ih); x.strokeStyle = "#9aa3ab"; x.strokeRect(lx, ly, side, ih); ly += ih + 14;
      }
      x.fillStyle = "#16202a"; x.font = "700 13px system-ui,sans-serif"; wrap(opt.legendTitle || "Légende", side).forEach(t => { x.fillText(t, lx, ly + 12); ly += 17; });
      if ((opt.legend || []).some(it => it.count !== undefined)) { x.fillStyle = "#6b7680"; x.font = "10.5px system-ui,sans-serif"; x.textAlign = "right"; x.fillText(opt.countLabel || "zones", lx + side - 6, ly + 10); x.textAlign = "left"; ly += 14; }
      ly += 6; x.font = "12px system-ui,sans-serif";
      (opt.legend || []).forEach(it => {
        x.fillStyle = it.color; x.fillRect(lx, ly, 16, 14); x.strokeStyle = "#9aa3ab"; x.strokeRect(lx, ly, 16, 14);
        x.fillStyle = "#26313b"; x.fillText(it.label, lx + 24, ly + 11);
        if (it.count !== undefined) { x.fillStyle = "#6b7680"; x.textAlign = "right"; x.fillText(String(it.count), lx + side - 6, ly + 11); x.textAlign = "left"; }
        ly += 24;
      });
      const sym = (kind, label) => {
        if (kind === "prov") { x.strokeStyle = "#2f363d"; x.lineWidth = 2; x.beginPath(); x.moveTo(lx, ly + 7); x.lineTo(lx + 16, ly + 7); x.stroke(); }
        else if (kind === "zone") { x.strokeStyle = "#b9c0c6"; x.lineWidth = 1; x.beginPath(); x.moveTo(lx, ly + 7); x.lineTo(lx + 16, ly + 7); x.stroke(); }
        else if (kind === "emp") { x.strokeStyle = "#d62828"; x.lineWidth = 1.6; x.strokeRect(lx + 1, ly + 1, 14, 12); }
        else { x.fillStyle = kind; x.fillRect(lx, ly, 16, 14); x.strokeStyle = "#9aa3ab"; x.lineWidth = 1; x.strokeRect(lx, ly, 16, 14); }
        x.lineWidth = 1; x.fillStyle = "#26313b"; x.font = "12px system-ui,sans-serif"; x.fillText(label, lx + 24, ly + 11); ly += 22;
      };
      if (opt.symbols !== false) {
        sym("prov", TT("Limite de province")); sym("zone", TT("Limite de zone de santé"));
        if (insetImg) { sym("#f0a43a", TT("Province(s) concernée(s), encart")); sym("emp", TT("Emprise de la carte, encart")); }
      }
      ly += 8; x.font = "11px system-ui,sans-serif"; x.fillStyle = "#4a5560";
      (opt.sideNotes || []).forEach(n => wrap(n, side).forEach(t => { x.fillText(t, lx, ly + 10); ly += 15; }));
      // notes
      let ny2 = head + Math.max(h, ly - head) + 22; x.fillStyle = "#4a5560"; x.font = "11px system-ui,sans-serif";
      noteLines.forEach(t => { x.fillText(t, 18, ny2); ny2 += 15; });
      x.fillStyle = "#8a949d"; x.font = "10.5px system-ui,sans-serif"; x.fillText(opt.source || ("Ebola Outbreak, SGI-TASK FORCE · " + (window.DASHBOARD_DATA?.meta?.cutoff || "")), 18, H - 12);
      c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (opt.file || opt.title || "carte").replace(/[^\w\-]+/g, "_") + ".png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    };
    const done = () => { if (--pending === 0) draw(); };
    img.onload = done;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    if (insetImg) { insetImg.onload = done; insetImg.onerror = () => { insetImg = null; done(); }; insetImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(insetSvg)); }
  }

  /* PNG d'un panneau sans graphique SVG : rendu du tableau (40 premières lignes) sur un canevas */
  function downloadPanelPNG(panel, name) {
    if (panel.querySelector("svg")) return downloadPNG(panel, name);
    const tb = panel.querySelector("table"); if (!tb) { alert("Rien à exporter dans ce panneau."); return; }
    const rows = [...tb.querySelectorAll("tr")].slice(0, 41).map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, " ").trim()));
    const title = panel.querySelector(".panel-head h2")?.textContent || name || "tableau";
    const c = document.createElement("canvas"), x = c.getContext("2d"), sc = 2, fs = 12, rh = 22;
    x.font = `${fs}px system-ui,sans-serif`;
    const ncol = Math.max(...rows.map(r => r.length));
    const w = Array.from({ length: ncol }, (_, j) => Math.min(260, Math.max(40, ...rows.map(r => x.measureText(r[j] || "").width + 16))));
    const W = Math.max(400, w.reduce((a, b) => a + b, 0) + 24), H = 56 + rows.length * rh + 30;
    c.width = W * sc; c.height = H * sc; x.scale(sc, sc);
    x.fillStyle = col("--surface") || "#fff"; x.fillRect(0, 0, W, H);
    x.fillStyle = col("--ink") || "#111"; x.font = "600 16px system-ui,sans-serif"; x.fillText(title, 12, 28);
    rows.forEach((r, i) => {
      const y = 50 + i * rh; let cx = 12;
      if (i === 0) { x.fillStyle = col("--surface-2") || "#eee"; x.fillRect(8, y, W - 16, rh); }
      x.fillStyle = i === 0 ? (col("--ink") || "#111") : (col("--ink-2") || "#333"); x.font = `${i === 0 ? "600 " : ""}${fs}px system-ui,sans-serif`;
      r.forEach((v, j) => { let t = v; while (t.length > 3 && x.measureText(t).width > w[j] - 10) t = t.slice(0, -2); x.fillText(t === v ? t : t + "…", cx, y + 15); cx += w[j]; });
      x.strokeStyle = col("--line") || "#ddd"; x.beginPath(); x.moveTo(8, y + rh); x.lineTo(W - 8, y + rh); x.stroke();
    });
    x.fillStyle = col("--muted") || "#888"; x.font = "10px system-ui,sans-serif"; x.fillText("Ebola Outbreak, SGI-TASK FORCE · " + (window.DASHBOARD_DATA?.meta?.cutoff || ""), 12, H - 10);
    c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (name || title).replace(/[^\w\-]+/g, "_") + ".png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  }


  /* ---------------- Carte de rapport + commentaire (Méthode, Résultats, Limites) dans un seul PNG ---------------- */
  async function mapCaptionPNG(img, capEl, fname) {
    if (!img.complete || !img.naturalWidth) await new Promise((ok, ko) => { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", ko, { once: true }); });
    const W = img.naturalWidth, H = img.naturalHeight, pad = Math.round(W * 0.03), fs = Math.max(16, Math.round(W / 78)), lh = Math.round(fs * 1.5);
    const font = (b) => `${b ? "700" : "400"} ${fs}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    // texte : morceaux gras / normaux ; chaque intertitre en gras ouvre un nouveau paragraphe
    const runs = [];
    (capEl ? [...capEl.childNodes] : []).forEach(n => {
      const b = n.nodeName === "B" || n.nodeName === "STRONG", s = (n.textContent || "").replace(/\s+/g, " ");
      if (!s.trim()) return;
      if (b && runs.length) runs.push({ br: true });
      s.split(/(\s+)/).forEach(w => { if (w) runs.push({ w, b }); });
    });
    const c = document.createElement("canvas"), x = c.getContext("2d");
    const maxW = W - 2 * pad, lines = [[]]; let cur = 0;
    runs.forEach(r => {
      if (r.br) { lines.push([]); cur = 0; return; }
      x.font = font(r.b); const w = x.measureText(r.w).width;
      if (/^\s+$/.test(r.w)) { if (cur) { lines[lines.length - 1].push({ ...r, w: " ", width: w }); cur += w; } return; }
      if (cur + w > maxW && cur > 0) { const L = lines[lines.length - 1]; while (L.length && L[L.length - 1].w === " ") L.pop(); lines.push([]); cur = 0; }
      lines[lines.length - 1].push({ ...r, width: w }); cur += w;
    });
    const paraGap = Math.round(lh * 0.35), nPara = runs.filter(r => r.br).length;
    const textH = lines.filter(l => l.length).length ? lines.length * lh + nPara * paraGap + 2 * pad : 0;
    c.width = W; c.height = H + textH;
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, W, H);
    if (textH) {
      x.strokeStyle = "#1b1b1b"; x.lineWidth = Math.max(2, W / 520);
      x.strokeRect(W * 0.008, H - x.lineWidth, W * 0.984, textH - W * 0.006);
      let y = H + pad + fs; x.textBaseline = "alphabetic";
      lines.forEach((L, i) => {
        if (i && L.length && L[0].b && lines[i - 1].length) y += paraGap;
        let xx = pad;
        L.forEach(r => { x.font = font(r.b); x.fillStyle = r.b ? "#1b1b1b" : "#333333"; x.fillText(r.w, xx, y); xx += r.width; });
        y += lh;
      });
    }
    const a = document.createElement("a");
    a.download = fname.replace(/\.png$/i, "") + "_commentaire.png";
    a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove();
  }

  window.HubCharts = { mapCaptionPNG, downloadPanelPNG, reportMapPNG, reportChoropleth, xyTable, stripTags, xy, histogram, choropleth, network, ttree, forceNet, settingNet, tracingDiagram, sexIcon, sexIconHTML, sexKey, PAL, downloadPNG, showTip, hideTip, clearRegistry, rerenderAll, col, esc, nf };
})();
