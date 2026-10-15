/* Graphiques SVG de l'outil zone de santé : barres (empilées), courbes, barres horizontales, matrice, carte (tuiles
   ou contours), info-bulles, export PNG d'un panneau et export CSV / Excel d'un tableau. Un seul axe par graphique. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || v;
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const nf = (v, d = 0) => v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- info-bulle */
  let tipEl;
  function tip(html, ev) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; document.body.appendChild(tipEl); }
    if (!html) { tipEl.style.display = "none"; return; }
    tipEl.innerHTML = html; tipEl.style.display = "block";
    const x = Math.min(ev.clientX + 14, innerWidth - tipEl.offsetWidth - 8), y = Math.min(ev.clientY + 14, innerHeight - tipEl.offsetHeight - 8);
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  const hideTip = () => tip(null);

  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

  function legend(box, items) {
    const lg = document.createElement("div"); lg.className = "legend";
    lg.innerHTML = (items.title ? `<span class="muted">${esc(items.title)}</span>` : "") + items.map(i => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join("");
    box.appendChild(lg);
  }

  /* ---- barres verticales (empilées si plusieurs séries) ; opt = {labels, series:[{label,color,values}], h, yLabel, fmtX, onClick, pct} */
  function bars(box, opt) {
    box.innerHTML = ""; box.classList.add("chart");
    const W = Math.max(320, box.clientWidth || 640), H = opt.h || 240, m = { l: 44, r: 10, t: 10, b: 30 };
    const n = opt.labels.length, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const tot = opt.labels.map((_, i) => opt.series.reduce((s, se) => s + (+se.values[i] || 0), 0));
    const mx = opt.max || niceMax(Math.max(1, ...tot));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.title || "graphique" }, box);
    const g = el("g", { class: "ax" }, svg);
    for (let k = 0; k <= 4; k++) { const y = m.t + ph - ph * k / 4; el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "gridl" }, g); el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, g).textContent = nf(mx * k / 4) + (opt.pct ? " %" : ""); }
    const bw = pw / n, gap = Math.min(4, bw * .25);
    const step = Math.max(1, Math.ceil(n / Math.floor(pw / 46)));
    opt.labels.forEach((lab, i) => {
      let y0 = m.t + ph;
      const x = m.l + i * bw + gap / 2;
      opt.series.forEach(se => {
        const v = +se.values[i] || 0; if (!v) return;
        const h = ph * v / mx; y0 -= h;
        const r = el("rect", { x, y: y0, width: Math.max(1, bw - gap), height: Math.max(0, h - (opt.series.length > 1 ? 1 : 0)), fill: se.color, rx: 1.5 }, svg);
        r.addEventListener("mousemove", ev => tip(`<b>${esc(opt.fmtX ? opt.fmtX(lab, true) : lab)}</b>${opt.series.map(s => `${esc(s.label)} : ${nf(s.values[i])}${opt.pct ? " %" : ""}`).join("<br>")}`, ev));
        r.addEventListener("mouseleave", hideTip);
        if (opt.onClick) { r.style.cursor = "pointer"; r.addEventListener("click", () => opt.onClick(i)); }
      });
      if (i % step === 0) el("text", { x: x + (bw - gap) / 2, y: H - 10, "text-anchor": "middle" }, g).textContent = opt.fmtX ? opt.fmtX(lab) : lab;
    });
    if (opt.hline !== undefined) { const y = m.t + ph - ph * opt.hline / mx; el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: css("--ink-2"), "stroke-dasharray": "4 3" }, svg); }
    if (opt.series.length > 1) legend(box, opt.series);
    box.__data = { cols: ["", ...opt.series.map(s => s.label)], rows: opt.labels.map((l, i) => [opt.fmtX ? opt.fmtX(l, true) : l, ...opt.series.map(s => s.values[i])]) };
  }

  /* ---- courbes ; opt = {labels, series:[{label,color,values,dash}], h, max, pct, target, fmtX} */
  function lines(box, opt) {
    box.innerHTML = ""; box.classList.add("chart");
    const W = Math.max(320, box.clientWidth || 640), H = opt.h || 240, m = { l: 44, r: 12, t: 10, b: 30 };
    const n = opt.labels.length, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const all = opt.series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
    const mx = opt.max || niceMax(Math.max(1, ...all, opt.target || 0));
    const X = i => m.l + (n <= 1 ? pw / 2 : pw * i / (n - 1)), Y = v => m.t + ph - ph * v / mx;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.title || "graphique" }, box);
    const g = el("g", { class: "ax" }, svg);
    for (let k = 0; k <= 4; k++) { const y = Y(mx * k / 4); el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "gridl" }, g); el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end" }, g).textContent = nf(mx * k / 4) + (opt.pct ? " %" : ""); }
    const step = Math.max(1, Math.ceil(n / Math.floor(pw / 52)));
    opt.labels.forEach((l, i) => { if (i % step === 0) el("text", { x: X(i), y: H - 10, "text-anchor": "middle" }, g).textContent = opt.fmtX ? opt.fmtX(l) : l; });
    if (opt.target !== undefined) { el("line", { x1: m.l, x2: W - m.r, y1: Y(opt.target), y2: Y(opt.target), stroke: css("--ok"), "stroke-dasharray": "5 4" }, svg); el("text", { x: W - m.r - 2, y: Y(opt.target) - 4, "text-anchor": "end", fill: css("--ok"), "font-size": 11 }, svg).textContent = "cible " + nf(opt.target) + (opt.pct ? " %" : ""); }
    opt.series.forEach(se => {
      let d = "", pen = false;
      se.values.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); pen = true; });
      el("path", { d, fill: "none", stroke: se.color, "stroke-width": se.width || 2, "stroke-dasharray": se.dash || null, "stroke-linejoin": "round" }, svg);
    });
    const hl = el("line", { y1: m.t, y2: m.t + ph, stroke: css("--muted"), "stroke-dasharray": "3 3", opacity: 0 }, svg);
    const ov = el("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent" }, svg);
    ov.addEventListener("mousemove", ev => {
      const b = svg.getBoundingClientRect(); const px = (ev.clientX - b.left) * W / b.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (pw / Math.max(1, n - 1)))));
      hl.setAttribute("x1", X(i)); hl.setAttribute("x2", X(i)); hl.setAttribute("opacity", 1);
      tip(`<b>${esc(opt.fmtX ? opt.fmtX(opt.labels[i], true) : opt.labels[i])}</b>${opt.series.map(s => `${esc(s.label)} : ${nf(s.values[i], opt.digits || 0)}${opt.pct ? " %" : ""}`).join("<br>")}`, ev);
    });
    ov.addEventListener("mouseleave", () => { hideTip(); hl.setAttribute("opacity", 0); });
    if (opt.series.length > 1) legend(box, opt.series);
    box.__data = { cols: ["", ...opt.series.map(s => s.label)], rows: opt.labels.map((l, i) => [opt.fmtX ? opt.fmtX(l, true) : l, ...opt.series.map(s => s.values[i])]) };
  }

  /* ---- barres horizontales ; opt = {items:[{label,value,color,sub}], pct, max, onClick} */
  function hbars(box, opt) {
    box.innerHTML = ""; box.classList.add("chart");
    const items = opt.items, W = Math.max(320, box.clientWidth || 520), rowH = 22, lw = Math.min(190, W * .38);
    const H = items.length * rowH + 8, mx = opt.max || Math.max(1, ...items.map(i => +i.value || 0));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, box);
    items.forEach((it, i) => {
      const y = 4 + i * rowH, w = (W - lw - 70) * (+it.value || 0) / mx;
      el("text", { x: lw - 8, y: y + 14, "text-anchor": "end", fill: css("--ink-2"), "font-size": 12 }, svg).textContent = it.label.length > 28 ? it.label.slice(0, 27) + "…" : it.label;
      const r = el("rect", { x: lw, y: y + 3, width: Math.max(1, w), height: rowH - 8, fill: it.color || css("--green-2"), rx: 2 }, svg);
      el("text", { x: lw + w + 6, y: y + 14, fill: css("--ink"), "font-size": 12 }, svg).textContent = nf(it.value, opt.digits || 0) + (opt.pct ? " %" : "") + (it.sub ? "  " + it.sub : "");
      r.addEventListener("mousemove", ev => tip(`<b>${esc(it.label)}</b>${nf(it.value, opt.digits || 0)}${opt.pct ? " %" : ""}${it.sub ? "<br>" + esc(it.sub) : ""}`, ev));
      r.addEventListener("mouseleave", hideTip);
      if (opt.onClick) { r.style.cursor = "pointer"; r.addEventListener("click", () => opt.onClick(it)); }
    });
    if (opt.target !== undefined) { const x = lw + (W - lw - 70) * opt.target / mx; el("line", { x1: x, x2: x, y1: 0, y2: H, stroke: css("--ok"), "stroke-dasharray": "4 3" }, svg); }
    box.__data = { cols: ["", "valeur"], rows: items.map(i => [i.label, i.value]) };
  }

  /* ---- matrice aires × jours (taux de suivi) ; opt = {rows:[{label, values}], cols:[dates], color:(v)=>css, fmt} */
  function matrix(box, opt) {
    box.innerHTML = ""; box.classList.add("chart");
    const W = Math.max(400, box.clientWidth || 800), lw = 120, n = opt.cols.length, cw = (W - lw - 8) / n, ch = 16;
    const H = opt.rows.length * (ch + 2) + 26;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, box);
    const step = Math.max(1, Math.ceil(n / Math.floor((W - lw) / 46)));
    opt.cols.forEach((c, j) => { if (j % step === 0) el("text", { x: lw + j * cw + cw / 2, y: 12, "text-anchor": "middle", fill: css("--muted"), "font-size": 10.5 }, svg).textContent = opt.fmtX ? opt.fmtX(c) : c; });
    opt.rows.forEach((r, i) => {
      const y = 20 + i * (ch + 2);
      el("text", { x: lw - 6, y: y + 12, "text-anchor": "end", fill: css("--ink-2"), "font-size": 11.5 }, svg).textContent = r.label;
      r.values.forEach((v, j) => {
        if (v === null || v === undefined) return;
        const rc = el("rect", { x: lw + j * cw, y, width: Math.max(1, cw - 1), height: ch, fill: opt.color(v), rx: 1 }, svg);
        rc.addEventListener("mousemove", ev => tip(`<b>${esc(r.label)}</b>${esc(opt.fmtX ? opt.fmtX(opt.cols[j], true) : opt.cols[j])}<br>${opt.fmt ? opt.fmt(v, i, j) : nf(v)}`, ev));
        rc.addEventListener("mouseleave", hideTip);
      });
    });
    box.__data = { cols: ["Aire de santé", ...opt.cols], rows: opt.rows.map(r => [r.label, ...r.values]) };
  }

  /* ---- carte : contours (geo) ou tuiles schématiques ; opt = {areas:[{key,name}], geo, value:(key)=>v, color:(v,key)=>css, label:(key)=>txt, tipHtml, onClick, selected} */
  function map(box, opt) {
    box.innerHTML = ""; box.classList.add("chart", "map-wrap");
    const W = Math.max(360, box.clientWidth || 700);
    let svg;
    if (opt.geo && opt.geo.features && opt.geo.features.length) {
      const rings = g => g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
      const feats = opt.geo.features, zb = opt.geo.zoom;
      const ext = fs => { const pts = fs.flatMap(f => rings(f.geometry).flat()); return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]; };
      const E = ext(feats), kx = Math.cos((E[1] + E[3]) / 2 * Math.PI / 180);
      const side = zb && W >= 760, mw = zb ? (side ? W * 0.6 : W) : W;
      const H0 = Math.min(640, Math.max(300, mw * (E[3] - E[1]) / ((E[2] - E[0]) * kx)));
      const zw = zb ? (side ? W - mw - 10 : W - 20) : 0;
      const zh = zb ? Math.min(side ? H0 : 520, Math.max(260, zw * (zb[3] - zb[1]) / ((zb[2] - zb[0]) * kx))) : 0;
      const H = side || !zb ? Math.max(H0, zh + 24) : H0 + zh + 34;
      const fk = new Set(feats.map(f => f.aire)), miss = opt.areas.filter(a => !fk.has(a.key)), ex = miss.length ? 50 : 0;
      svg = el("svg", { viewBox: `0 0 ${W} ${H + ex}` }, box);
      const proj = (bb, x, y, w, h) => { const sc = Math.min((w - 20) / ((bb[2] - bb[0]) * kx), (h - 20) / (bb[3] - bb[1]));
        const ox = x + (w - (bb[2] - bb[0]) * kx * sc) / 2, oy = y + (h - (bb[3] - bb[1]) * sc) / 2;
        return p => [ox + (p[0] - bb[0]) * kx * sc, oy + (bb[3] - p[1]) * sc]; };
      const nameOf = f => (opt.areas.find(a => a.key === f.aire) || {}).name || f.nom || "";
      const labOf = f => f.lab || (r => r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]))(rings(f.geometry).reduce((a, b) => b.length > a.length ? b : a, []));
      const draw = (P, parent, clip, labelIf) => {
        const labels = [];
        feats.forEach(f => {
          const v = opt.value(f.aire);
          const d = rings(f.geometry).map(r => r.map((p, i) => (i ? "L" : "M") + P(p).map(x => x.toFixed(1)).join(",")).join("") + "Z").join("");
          const g = el("g", { class: "tile" + (opt.selected === f.aire ? " sel" : ""), "clip-path": clip ? `url(#${clip})` : null }, parent);
          const pa = el("path", { d, fill: opt.color(v, f.aire) }, g);
          pa.addEventListener("mousemove", ev => tip(opt.tipHtml(f.aire), ev)); pa.addEventListener("mouseleave", hideTip);
          if (opt.onClick) pa.addEventListener("click", () => opt.onClick(f.aire));
          if (labelIf(f)) labels.push([P(labOf(f)), nameOf(f), opt.label(f.aire)]);
        });
        return labels;
      };
      const Pm = proj(E, 0, 0, mw, H0);
      let labels = draw(Pm, svg, null, f => !(zb && f.petite));
      if (zb) {
        const zx = side ? mw + 10 : 10, zy = side ? 22 : H0 + 30;
        const defs = el("defs", {}, svg), cp = el("clipPath", { id: "zclip" + Math.random().toString(36).slice(2, 7) }, defs);
        el("rect", { x: zx, y: zy, width: zw, height: zh }, cp);
        const a = Pm([zb[0], zb[3]]), b = Pm([zb[2], zb[1]]);
        el("rect", { x: a[0], y: a[1], width: b[0] - a[0], height: b[1] - a[1], fill: "none", stroke: css("--ink"), "stroke-dasharray": "4 3", "stroke-width": 1 }, svg);
        el("text", { x: zx, y: zy - 7, style: `font:12px system-ui,sans-serif;fill:${css("--ink-2")}` }, svg).textContent = "Agrandissement des petites aires (cadre pointillé)";
        const Pz = proj(zb, zx, zy, zw, zh);
        labels = labels.concat(draw(Pz, svg, cp.getAttribute("id"), f => f.petite));
        el("rect", { x: zx, y: zy, width: zw, height: zh, fill: "none", stroke: css("--line-2"), "stroke-dasharray": "4 3" }, svg);
      }
      if (miss.length) {
        el("text", { x: 10, y: H + 8, style: `font:12px system-ui,sans-serif;fill:${css("--ink-2")}` }, svg).textContent = "Aires sans contour dans le fichier des contours :";
        const tw = Math.min(150, (W - 20) / miss.length);
        miss.forEach((a, i) => {
          const x = 10 + i * tw, v = opt.value(a.key);
          const g = el("g", { class: "tile" + (opt.selected === a.key ? " sel" : "") }, svg);
          const r = el("rect", { x, y: H + 14, width: tw - 6, height: 32, rx: 4, fill: opt.color(v, a.key), stroke: css("--line-2"), "stroke-dasharray": "3 2" }, g);
          const t = opt.label(a.key);
          el("text", { x: x + 8, y: H + 35, "text-rendering": "geometricPrecision", style: "font:700 12.5px system-ui,-apple-system,'Segoe UI',Arial,sans-serif;fill:#111111" }, g).textContent = a.name + (t ? " · " + t : "");
          r.addEventListener("mousemove", ev => tip(opt.tipHtml(a.key), ev)); r.addEventListener("mouseleave", hideTip);
          if (opt.onClick) r.addEventListener("click", () => opt.onClick(a.key));
        });
      }
      /* étiquettes : écartement simple des chevauchements */
      const FS = W < 520 ? 11.5 : 12.5;
      const L = labels.map(([q, nm, t]) => { const txt = t ? `${nm} · ${t}` : nm; return { x: q[0], y: q[1], x0: q[0], y0: q[1], txt, w: txt.length * FS * .6 + 12, h: FS + 7 }; });
      for (let it = 0; it < 160; it++) {
        let moved = false;
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
          const A = L[i], B = L[j], ox = (A.w + B.w) / 2 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
          if (ox > 0 && oy > 0) { moved = true; if (oy <= ox) { const d = oy / 2 + .5, s = A.y >= B.y ? 1 : -1; A.y += d * s; B.y -= d * s; } else { const d = ox / 2 + .5, s = A.x >= B.x ? 1 : -1; A.x += d * s; B.x -= d * s; } }
        }
        if (!moved) break;
      }
      L.forEach(l => {
        if (Math.hypot(l.x - l.x0, l.y - l.y0) > 6) {
          el("line", { x1: l.x0, y1: l.y0, x2: l.x, y2: l.y, stroke: "#3a3f44", "stroke-width": .7, "stroke-opacity": .8 }, svg);
          el("circle", { cx: l.x0, cy: l.y0, r: 1.8, fill: "#3a3f44" }, svg);
        }
        const g = el("g", { class: "map-lbl", "pointer-events": "none" }, svg);
        const bg = el("rect", { rx: 4, ry: 4, fill: "#ffffff", "fill-opacity": .92, stroke: "rgba(0,0,0,.18)", "stroke-width": .6 }, g);
        const tx = el("text", { x: l.x, y: l.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": FS, "font-weight": 700, fill: "#111111",
          "text-rendering": "geometricPrecision", style: `font:700 ${FS}px system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;fill:#111111` }, g);
        tx.textContent = l.txt;
        let bw = l.w, bh = l.h; try { const b = tx.getBBox(); if (b.width) { bw = b.width + 10; bh = b.height + 4; } } catch (e) { /* hors document */ }
        bg.setAttribute("x", (l.x - bw / 2).toFixed(1)); bg.setAttribute("y", (l.y - bh / 2).toFixed(1)); bg.setAttribute("width", bw.toFixed(1)); bg.setAttribute("height", bh.toFixed(1));
      });
    } else {
      const items = opt.areas, cols = Math.max(3, Math.min(8, Math.floor((W - 10) / 132)));
      const tw = (W - 10) / cols, th = 58, rows = Math.ceil(items.length / cols), H = rows * (th + 6) + 4;
      svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, box);
      items.forEach((a, i) => {
        const x = 5 + (i % cols) * tw, y = 4 + Math.floor(i / cols) * (th + 6), v = opt.value(a.key);
        const g = el("g", { class: "tile" + (opt.selected === a.key ? " sel" : "") }, svg);
        const r = el("rect", { x, y, width: tw - 6, height: th, rx: 5, fill: opt.color(v, a.key) }, g);
        const dark = opt.dark ? opt.dark(v, a.key) : false;
        el("text", { x: x + 8, y: y + 20, style: `font:700 13px system-ui,sans-serif;fill:${dark ? "#fff" : "#111"}` }, g).textContent = a.name.length > 15 ? a.name.slice(0, 14) + "…" : a.name;
        el("text", { x: x + 8, y: y + 42, style: `font:700 15px system-ui,sans-serif;fill:${dark ? "#fff" : "#111"}` }, g).textContent = opt.label(a.key) || "";
        r.addEventListener("mousemove", ev => tip(opt.tipHtml(a.key), ev)); r.addEventListener("mouseleave", hideTip);
        if (opt.onClick) r.addEventListener("click", () => opt.onClick(a.key));
      });
    }
    if (opt.legend) legend(box, opt.legend);
    box.__data = { cols: ["Aire de santé", opt.valueLabel || "valeur"], rows: opt.areas.map(a => [a.name, opt.value(a.key)]) };
  }

  /* ---- export PNG d'un panneau (graphique + titre + légende + source) */
  function panelPNG(panel, name, foot) {
    const svg = panel.querySelector(".chart svg"); if (!svg) return;
    const clone = svg.cloneNode(true);
    const vb = svg.viewBox.baseVal, w = vb.width, h = vb.height;
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    clone.querySelectorAll("text").forEach(t => { t.style.fontFamily = getComputedStyle(document.body).fontFamily; if (!t.getAttribute("fill")) t.setAttribute("fill", css("--muted")); });
    clone.querySelectorAll(".gridl").forEach(l => l.setAttribute("stroke", css("--line-2")));
    const title = panel.querySelector(".panel-head h2, .box-h h2")?.textContent || name;
    const sub = panel.querySelector(".panel-head p, .box-h p")?.textContent || "";
    const legs = [...panel.querySelectorAll(".legend span")].map(s => ({ c: getComputedStyle(s.querySelector("i")).backgroundColor, t: s.textContent }));
    const mctx = document.createElement("canvas").getContext("2d"); mctx.font = "12px " + getComputedStyle(document.body).fontFamily;
    let nl = legs.length ? 1 : 0, lxm = 12; legs.forEach(l => { const wd = mctx.measureText(l.t).width + 34; if (lxm + wd > w + 12 && lxm > 12) { nl++; lxm = 12; } lxm += wd; });
    const img = new Image(), sc = 3, head = sub ? 54 : 36, lh = nl * 20 + (nl ? 6 : 0);
    const K = { ink: css("--ink"), ink2: css("--ink-2"), mut: css("--muted"), bg: css("--surface") || "#fff", ff: getComputedStyle(document.body).fontFamily };
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = (w + 24) * sc; c.height = (h + head + lh + 30) * sc;
      const x = c.getContext("2d"); x.scale(sc, sc); x.fillStyle = K.bg; x.fillRect(0, 0, w + 24, h + head + lh + 30);
      x.fillStyle = K.ink; x.font = "600 15px " + K.ff; x.fillText(title, 12, 22);
      if (sub) { x.fillStyle = K.ink2; x.font = "12px " + K.ff; x.fillText(sub.slice(0, 140), 12, 42); }
      x.drawImage(img, 12, head, w, h);
      let lx = 12, ly = head + h + 10; x.font = "12px " + K.ff;
      legs.forEach(l => { const wd = x.measureText(l.t).width + 34; if (lx + wd > w + 12 && lx > 12) { lx = 12; ly += 20; } x.fillStyle = l.c; x.fillRect(lx, ly, 11, 11); x.fillStyle = K.ink2; x.fillText(l.t, lx + 15, ly + 10); lx += wd; });
      x.fillStyle = K.mut; x.font = "10.5px " + K.ff; x.fillText(foot || "", 12, h + head + lh + 22);
      c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (name || title).replace(/[^\w\-]+/g, "_") + ".png"; document.body.appendChild(a); a.click(); a.remove(); });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  }

  /* ---- export d'un tableau : CSV (Excel français : « ; » et BOM) */
  function csv(name, cols, rows) {
    const q = v => { const s = v === null || v === undefined ? "" : (typeof v === "number" ? String(v).replace(".", ",") : String(v)); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const txt = "﻿" + [cols.map(q).join(";"), ...rows.map(r => r.map(q).join(";"))].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = name.replace(/[^\w\-]+/g, "_") + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  window.G = { bars, lines, hbars, matrix, map, panelPNG, csv, tip, hideTip, nf, esc, css };
})();
