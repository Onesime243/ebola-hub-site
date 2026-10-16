/* Ebola Outbreak — outil provincial : page d'accueil et vues provinciales
   Données : window.NK_PROVINCE (donnees/province.js) — cas confirmés de la liste labo, suivi des contacts et alertes de la base
   chiffrée provinciale, indicateurs des analyses détaillées des zones. Filtres : période (du … au …) et zone de santé. */
(function () {
  "use strict";
  const Ch = window.HubCharts;
  const { nf, esc } = G;
  const col = Ch.col;
  const $ = s => document.querySelector(s);
  const EMPTY = { meta: { province: "Nord-Kivu", date_rapport: new Date().toISOString().slice(0, 10), genere_le: "—", jusqu_au: {}, sources: {}, totaux: { cas: 0, deces: 0, n7: 0, n21: 0, zones_touchees: 0, zones_actives: 0 }, zones_detail: [], avertissements: [] },
    cibles: { taux_suivi_pct: 90, cas_connus_contacts_pct: 80, delai_isolement_j: 3 }, zones: [], cas: { cols: [], rows: [] }, suivi: { cols: [], rows: [] }, alertes: { cols: [], rows: [] }, geo: { features: [] }, exports: {} };
  const P = window.NK_PROVINCE || EMPTY;
  const HAS = !!window.NK_PROVINCE;
  const PUBLIC = !!P.meta.public;
  const PROV = P.meta.province;
  const C = P.cibles || {};
  window.ZS_FOOT = `Province du ${PROV} · Ebola Outbreak — outil provincial`;

  /* ------------------------------------------------------------------ utilitaires */
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const day = s => s ? new Date(s + "T00:00:00Z").getTime() / 864e5 : null;
  const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const dfr = (s, y = true) => { if (!s) return "—"; const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}${y ? " " + d.getUTCFullYear() : ""}`; };
  const dshort = s => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`; };
  const pc = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? "—" : nf(v, d) + " %";
  const ratio = (a, b) => b ? 100 * a / b : null;
  const addDays = (s, n) => iso(day(s) + n);
  const wk = n => n - ((new Date(n * 864e5).getUTCDay() + 6) % 7);
  const rowsToObj = blk => blk && blk.rows ? blk.rows.map(r => Object.fromEntries(blk.cols.map((c, i) => [c, r[i]]))) : [];
  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  const TL = ["#A3C98F", "#EBDD92", "#EEB98A", "#E0927C", "#BD6F68"], TL_NA = "#ECEAE4";
  const CATMAP = { "Rouge": TL[4], "Orange": TL[2], "Jaune": TL[1], "Verte": TL[0], "Non touchée": TL_NA };
  const CATDEF = { "Rouge": "cas confirmé dans les 7 derniers jours", "Orange": "dernier cas il y a 8 à 21 jours", "Jaune": "dernier cas il y a 22 à 42 jours", "Verte": "plus de 42 jours sans cas", "Non touchée": "aucun cas" };
  const CO = ["Rouge", "Orange", "Jaune", "Verte", "Non touchée"];
  const PAL = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s7", "--s8"];

  /* ------------------------------------------------------------------ données */
  const ZONES = P.zones || [];
  const ZB = Object.fromEntries(ZONES.map(z => [z.code, z]));
  const ZN = Object.fromEntries(ZONES.map(z => [z.code, z.nom]));
  const CAS = rowsToObj(P.cas); CAS.forEach(c => c._d = day(c.date));
  const SV = rowsToObj(P.suivi); SV.forEach(r => r._d = day(r.date));
  const AL = rowsToObj(P.alertes); AL.forEach(r => r._d = day(r.date));
  const SVZ = {}; SV.forEach(r => (SVZ[r.zone] = SVZ[r.zone] || []).push(r)); Object.values(SVZ).forEach(a => a.sort((x, y) => x._d - y._d));
  const DETAIL = new Set((P.meta.zones_detail || []).map(n => (ZONES.find(z => z.nom === n) || {}).code).filter(Boolean));

  /* ------------------------------------------------------------------ état */
  const lastDate = P.meta.date_rapport;
  const firstDate = (() => { const a = CAS.map(c => c.date).filter(Boolean).sort(); return a[0] || addDays(lastDate, -90); })();
  const S = { page: "accueil", date: lastDate, preset: "21", from: null, zone: null, mapInd: "categorie", tables: {}, upZone: null, menu: false };
  S.from = addDays(S.date, -20);
  try {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("p")) S.page = h.get("p"); if (h.get("z") && ZB[h.get("z")]) S.zone = h.get("z");
    if (h.get("per")) S.preset = h.get("per");
    if (h.get("d") && h.get("d") <= lastDate) S.date = h.get("d");
    if (h.get("du")) S.from = h.get("du"); else applyPreset();
  } catch (e) { /* adresse invalide */ }
  function applyPreset() {
    if (S.preset === "tout") S.from = firstDate;
    else if (/^\d+$/.test(S.preset)) S.from = addDays(S.date, -(Number(S.preset) - 1));
    if (S.from > S.date) S.from = S.date;
  }
  const inPer = d => !!d && d >= S.from && d <= S.date;
  const perTxt = () => `du ${dfr(S.from)} au ${dfr(S.date)}`;
  const scope = () => S.zone ? `Zone de santé de ${ZN[S.zone]}` : `Province du ${PROV}`;
  let USER = null;
  const SERVED = location.protocol.startsWith("http") && !PUBLIC;
  const isProv = () => USER && USER.role === "province";
  const myZone = () => USER && USER.role === "zs" ? ZONES.find(z => z.nom === USER.zone) : null;

  /* ------------------------------------------------------------------ calculs */
  function casZone(code, t) {
    const L = CAS.filter(c => c._d !== null && c._d <= t && (!code || c.zone === code));
    const n7 = L.filter(c => c._d > t - 7).length, n7p = L.filter(c => c._d > t - 14 && c._d <= t - 7).length, r21 = L.filter(c => c._d > t - 21);
    const last = L.length ? Math.max(...L.map(c => c._d)) : null, jours = last === null ? null : t - last;
    const cat = !L.length ? "Non touchée" : jours <= 7 ? "Rouge" : jours <= 21 ? "Orange" : jours <= 42 ? "Jaune" : "Verte";
    return { n: L.length, n7, n7p, n21: r21.length, deces: L.filter(c => c.deces).length, deces21: r21.filter(c => c.deces).length, last, jours, cat };
  }
  function suiviAt(code, t, tol = 3) {
    const a = SVZ[code]; if (!a) return null;
    let r = null; for (const x of a) { if (x._d <= t) r = x; else break; }
    if (!r || t - r._d > tol) return null;
    return { ...r, taux: ratio(r.vus, r.a_suivre), retard: t - r._d };
  }
  function suiviProv(t, codes) {
    const o = { a_suivre: 0, vus: 0, jmv: 0, pdv: 0, suspects: 0, nouveaux: 0, zones: 0 };
    (codes || Object.keys(SVZ)).forEach(c => { const s = suiviAt(c, t); if (s) { o.zones++; ["a_suivre", "vus", "jmv", "pdv", "suspects", "nouveaux"].forEach(k => o[k] += s[k] || 0); } });
    o.taux = ratio(o.vus, o.a_suivre); return o;
  }
  function alertesPer(code, t0, t1) {
    const L = AL.filter(r => r._d >= t0 && r._d <= t1 && (!code || r.zone === code));
    const s = k => L.reduce((a, r) => a + (+r[k] || 0), 0);
    const o = { jours: new Set(L.map(r => r._d)).size }; ["total", "deces", "inv", "val", "prelev", "isolees", "src_ess", "src_ra", "src_comm", "src_contacts", "src_poe", "eds", "swab"].forEach(k => o[k] = s(k));
    o.inv_pct = ratio(o.inv, o.total); o.dernier = L.length ? iso(Math.max(...L.map(r => r._d))) : null; return o;
  }
  const lastAl = AL.length ? Math.max(...AL.map(r => r._d)) : null;
  function zoneRow(z, t) {
    const cs = casZone(z.code, t), s = suiviAt(z.code, t), al = lastAl !== null ? alertesPer(z.code, Math.min(t, lastAl) - 6, Math.min(t, lastAl)) : null, ind = (z.detail || {}).ind || {};
    return { z, code: z.code, nom: z.nom, cat: cs.cat, cs, s, al, ind, inc: z.population ? 1e5 * cs.n / z.population : null };
  }

  /* ------------------------------------------------------------------ composants */
  const POST = [];
  const after = fn => POST.push(fn);
  function panel(title, sub, body, o = {}) {
    const tools = (o.tools || "") + (o.png ? `<button class="btn sm" data-png="${esc(o.png)}" title="Télécharger PNG">⤓ PNG</button>` : "") + (o.csv ? `<button class="btn sm" data-csv="${esc(o.csv)}" title="Exporter CSV">⤓ CSV</button>` : "");
    return `<section class="panel ${o.cls || ""}" ${o.id ? `id="${o.id}"` : ""}><div class="panel-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><div class="panel-tools">${tools}</div></div>${body}</section>`;
  }
  function kpi(label, value, note, o = {}) {
    return `<div class="kpi ${o.cls || ""} ${o.go ? "clickable" : ""}" ${o.go ? `data-go="${o.go}"` : ""}><div class="label">${o.color ? `<i class="dot" style="background:${col(o.color)}"></i>` : ""}${label}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ""}${o.meter !== undefined && o.meter !== null ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, o.meter))}%;background:${col(o.meterColor || "--brand-2")}"></i></div>` : ""}</div>`;
  }
  const badge = (text, cls = "") => `<span class="badge ${cls}">${esc(text)}</span>`;
  const lvl = (v, ok, warn, higher = true) => v === null || v === undefined || !isFinite(v) ? "na" : higher ? (v >= ok ? "ok" : v >= warn ? "warn" : "bad") : (v <= ok ? "ok" : v <= warn ? "warn" : "bad");
  const pill = (txt, cls) => `<span class="pill ${cls || ""}">${esc(txt)}</span>`;
  const feu = (v, ok, warn, higher = true, fmt = x => pc(x, 0)) => v === null || v === undefined ? `<span class="muted">—</span>` : pill(fmt(v), lvl(v, ok, warn, higher));
  const catSq = c => `<span class="cat" style="background:${CATMAP[c] || TL_NA}" title="${esc(c)}"></span>`;
  const notice = (t, cls = "") => `<div class="notice ${cls}">${t}</div>`;
  const TABLES = {};
  function table(id, rows, cols, o = {}) {
    const st = S.tables[id] || (S.tables[id] = { sort: o.sort || null, dir: o.dir || -1, limit: o.limit || 60 });
    let r = rows;
    if (st.sort) { const c = cols.find(c => c.k === st.sort); if (c) { const f = c.sortv || (x => x[c.k]); r = [...r].sort((a, b) => { const va = f(a), vb = f(b); if (va === vb) return 0; if (va === null || va === undefined || va === "") return 1; if (vb === null || vb === undefined || vb === "") return -1; return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * st.dir; }); } }
    TABLES[id] = { rows: r, cols };
    const shown = r.slice(0, st.limit);
    const head = cols.map(c => `<th class="${c.num ? "num" : ""}" data-sort="${id}|${c.k}">${esc(c.t)}${st.sort === c.k ? `<span class="arrow">${st.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("");
    const body = shown.map(x => `<tr class="${o.rowClick ? "clickable" : ""} ${o.selected && o.selected(x) ? "selected" : ""}" ${o.rowClick ? `data-zrow="${esc(o.rowClick(x))}"` : ""}>${cols.map(c => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}">${c.v ? c.v(x) : (c.num ? nf(x[c.k], c.d || 0) : esc(x[c.k] ?? "—"))}</td>`).join("")}</tr>`).join("");
    const foot = o.total ? `<tr class="total">${cols.map(c => `<td class="${c.num ? "num" : ""}">${c.tv ? c.tv(o.total) : c.v && o.total[c.k] !== undefined && c.k !== "nom" ? c.v(o.total) : (c.num ? nf(o.total[c.k], c.d || 0) : esc(o.total[c.k] ?? ""))}</td>`).join("")}</tr>` : "";
    return `<div class="table-wrap" style="${o.maxh ? `max-height:${o.maxh}px` : ""}"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Aucune ligne</td></tr>`}${foot}</tbody></table></div>${r.length > shown.length ? `<button class="btn sm more" data-more="${id}">Afficher plus (${nf(r.length - shown.length)})</button>` : ""}`;
  }
  function csvT(id) {
    const t = TABLES[id]; if (!t) return;
    const strip = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    G.csv(`${id}_${PROV}_${S.date}`, t.cols.map(c => c.t), t.rows.map(x => t.cols.map(c => strip(c.csv ? c.csv(x) : c.v ? c.v(x) : x[c.k]))));
  }
  const openZS = code => `zs.html?zone=${encodeURIComponent(code)}`;
  const zsBtn = (code, txt = "Ouvrir", cls = "sm") => DETAIL.has(code) ? `<a class="btn ${cls}" href="${openZS(code)}">${txt} →</a>` : `<span class="btn ${cls}" disabled title="Aucune analyse détaillée pour cette zone">${txt}</span>`;
  const outp = f => "../sortie/province/" + f;
  function spark(code, t) {
    const w1 = wk(t), ws = []; for (let k = 7; k >= 0; k--) ws.push(w1 - 7 * k);
    const v = ws.map(w => CAS.filter(c => c.zone === code && c._d !== null && c._d >= w && c._d < w + 7 && c._d <= t).length), mx = Math.max(1, ...v);
    const bw = 100 / ws.length;
    return `<svg class="spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-label="Cas par semaine (8 semaines)">${v.map((x, i) => `<rect x="${i * bw + 1}" y="${26 - 24 * x / mx}" width="${bw - 2}" height="${24 * x / mx}" rx="1" fill="${i === v.length - 1 ? col("--s2") : col("--line-2")}"><title>Semaine du ${dfr(iso(ws[i]))} : ${x} cas</title></rect>`).join("")}</svg>`;
  }
  const ICON = {
    accueil: "M12 3 2 12h3v8h6v-6h2v6h6v-8h3z", situation: "M3 19h18v2H3zM5 17V9h3v8zm5 0V5h3v12zm5 0v-6h3v6z", zones: "M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z",
    carte: "M15 4 9 2 3 4v18l6-2 6 2 6-2V2zM9 4.4l6 2v13.2l-6-2z", contacts: "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0h-1c1.2.9 2 2 2 3.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z",
    alertes: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4h-2v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z", donnees: "M5 20h14v-2H5zm7-16-5 5h3v6h4V9h3z",
    comptes: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8c0-3.3 3.6-6 8-6s8 2.7 8 6z", publication: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.4-3.6C9 5.5 8.5 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zM16.3 14a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4z",
    zs: "M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z", pdf: "M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8 13h8v2H8zm0 4h8v2H8z",
    run: "M8 5v14l11-7z" };
  const svgI = k => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;

  /* ================================================================== ACCUEIL */
  function pageAccueil() {
    const t = day(S.date);
    const rows = ZONES.map(z => zoneRow(z, t));
    const pr = casZone(null, t);
    const sp = suiviProv(t);
    const al = lastAl !== null ? alertesPer(null, Math.min(t, lastAl) - 6, Math.min(t, lastAl)) : null;
    const act = rows.filter(r => r.cat === "Rouge" || r.cat === "Orange");
    const trend = pr.n7 - pr.n7p;
    const me = myZone();
    const greet = USER ? `${esc(USER.nom)}` : PUBLIC ? "Version en ligne (lecture seule)" : "";
    const quick = [];
    if (me) {
      quick.push(`<a href="${openZS(me.code)}">${svgI("zs")}<div><b>Tableau de bord de ${esc(me.nom)}</b><span>Toutes les analyses de votre zone</span></div></a>`);
      if (SERVED) quick.push(`<button data-go="donnees" data-upz="${me.code}">${svgI("donnees")}<div><b>Charger les fichiers de ${esc(me.nom)}</b><span>Base contacts, liste linéaire, SBC, RA…</span></div></button>`);
    }
    if (isProv() && SERVED) {
      quick.push(`<button data-go="donnees">${svgI("donnees")}<div><b>Charger des fichiers</b><span>Pour une zone ou pour la province</span></div></button>`);
      quick.push(`<button data-run="tout">${svgI("run")}<div><b>Tout analyser</b><span>Toutes les zones puis la province</span></div></button>`);
    }
    if (P.exports && P.exports.rapport_pdf) quick.push(`<a href="${outp(P.exports.rapport_pdf)}" target="_blank" rel="noopener">${svgI("pdf")}<div><b>Rapport provincial (PDF)</b><span>Situation au ${dfr(P.meta.date_rapport)}</span></div></a>`);
    if (P.exports && P.exports.classeur) quick.push(`<a href="${outp(P.exports.classeur)}" download>${svgI("zones")}<div><b>Classeur des tableaux</b><span>Excel, sans nom</span></div></a>`);
    quick.push(`<button data-go="carte">${svgI("carte")}<div><b>Cartes pour rapport</b><span>A4 avec titre, légende et nord</span></div></button>`);
    if (P.meta.detail_province) { const dz = encodeURIComponent(P.meta.detail_province);
      quick.push(`<a href="zs.html?zone=${dz}#p=dynamics">${svgI("situation")}<div><b>Dynamique et Rt</b><span>Province et zones de 25 cas ou plus</span></div></a>`);
      quick.push(`<a href="zs.html?zone=${dz}#p=chains">${svgI("zones")}<div><b>Cas index et chaînes</b><span>Parcours des cas, reconstruction</span></div></a>`);
      quick.push(`<a href="zs.html?zone=${dz}#p=labo">${svgI("pdf")}<div><b>Laboratoire et positivité</b><span>Post-mortem, re-prélèvements, délais</span></div></a>`);
      quick.push(`<a href="zs.html?zone=${dz}#p=deces">${svgI("alertes")}<div><b>Décès et EDS communautaires</b><span>Létalité, swabs, EDS par zone</span></div></a>`); }
    const ja = P.meta.jusqu_au || {};
    const fr = (lab, d) => { if (!d) return `<span><i class="none"></i>${lab} : non disponible</span>`; const r = t - day(d); return `<span><i class="${r > 7 ? "old" : r > 2 ? "late" : ""}"></i>${lab} : ${dfr(d)}</span>`; };
    after(() => drawMap($("#c-map-home"), "categorie", t));
    const watch = rows.filter(r => r.cs.n21 > 0).sort((a, b) => b.cs.n7 - a.cs.n7 || b.cs.n21 - a.cs.n21).slice(0, 10);
    const cards = rows.filter(r => r.cs.n || r.s || DETAIL.has(r.code)).sort((a, b) => CO.indexOf(a.cat) - CO.indexOf(b.cat) || b.cs.n21 - a.cs.n21 || b.cs.n - a.cs.n);
    const quiet = rows.filter(r => !(r.cs.n || r.s || DETAIL.has(r.code)));
    return `<section class="hero">
      <div class="hero-top"><div><div class="kicker">Riposte à la maladie à virus Ebola · ${greet}</div><h2>Province du ${esc(PROV)}</h2>
        <div class="when">Situation au ${dfr(S.date)} · ${nf(ZONES.length)} zones de santé · analyse du ${esc(P.meta.genere_le)}</div></div>
        <div class="who">${me ? `<a class="btn solid" href="${openZS(me.code)}">Ma zone : ${esc(me.nom)} →</a>` : ""}${P.exports && P.exports.rapport_pdf ? `<a class="btn" href="${outp(P.exports.rapport_pdf)}" target="_blank" rel="noopener">⤓ Rapport PDF</a>` : ""}</div></div>
      <div class="hero-kpis">
        <div><div class="v">${nf(pr.n7)}</div><div class="k">cas confirmés en 7 jours</div><div class="s ${trend > 0 ? "up" : trend < 0 ? "down" : ""}">${trend > 0 ? "▲ +" : trend < 0 ? "▼ " : "= "}${nf(trend)} vs 7 jours précédents</div></div>
        <div><div class="v">${P.rt ? nf(P.rt.rt, 2) : nf(pr.n21)}</div><div class="k">${P.rt ? "Rt de la province" : "cas en 21 jours"}</div><div class="s">${P.rt ? `IC 95 % ${nf(P.rt.lo, 2)}–${nf(P.rt.hi, 2)} · au ${dfr(P.rt.date, false)} · ${nf(pr.n21)} cas en 21 j` : `${nf(pr.n)} depuis le début`}</div></div>
        <div><div class="v">${nf(pr.deces21)}</div><div class="k">décès en 21 jours</div><div class="s">létalité cumulée ${pc(ratio(pr.deces, pr.n), 1)}</div></div>
        <div><div class="v">${nf(act.length)}<small style="font-size:15px;opacity:.75"> / ${nf(rows.filter(r => r.cs.n).length)}</small></div><div class="k">zones actives / touchées</div><div class="s">cas dans les 21 derniers jours</div></div>
        <div><div class="v">${nf(sp.a_suivre)}</div><div class="k">contacts à suivre</div><div class="s">${nf(sp.zones)} zones rapportées</div></div>
        <div><div class="v">${pc(sp.taux, 1)}</div><div class="k">taux de suivi</div><div class="s">cible ${nf(C.taux_suivi_pct)} % · ${nf(sp.jmv)} jamais vus</div></div>
        <div><div class="v">${al ? pc(al.inv_pct, 0) : "—"}</div><div class="k">alertes investiguées</div><div class="s">${al ? `${nf(al.total)} alertes · 7 j au ${dfr(al.dernier)}` : "base des alertes absente"}</div></div>
      </div></section>
      <div class="fresh">${fr("Liste labo des confirmés", ja.labo)}${fr("Suivi des contacts (base provinciale)", ja.suivi)}${fr("Alertes (base provinciale)", ja.alertes)}<span><i></i>Analyses détaillées : ${nf(DETAIL.size)} zones</span></div>
      ${!HAS ? notice("<b>Aucune donnée provinciale.</b> Chargez la liste labo provinciale et les fichiers des zones de santé dans « Données des zones », puis lancez l'analyse.", "warn") : ""}
      <div class="grid g21">
        ${panel("Catégorie des zones de santé", "Selon la date du dernier cas confirmé · cliquez une zone pour ouvrir sa fiche", `<div id="c-map-home"></div>`, { png: "carte_categories" })}
        ${panel("Zones à surveiller", "Cas des 7 et 21 derniers jours · 8 dernières semaines", watch.length ? `<div class="watch">${watch.map(r => `<div class="row" data-zrow="${r.code}">${catSq(r.cat)}<div><div class="nm">${esc(r.nom)}</div><div class="meta">${r.s ? `suivi ${pc(r.s.taux, 0)} · ` : ""}${r.cs.jours === 0 ? "cas aujourd'hui" : `dernier cas il y a ${nf(r.cs.jours)} j`}</div>${spark(r.code, t)}</div><div class="num"><b>${nf(r.cs.n7)}</b><small>en 7 j · ${nf(r.cs.n21)} en 21 j</small></div></div>`).join("")}</div>` : `<div class="empty">Aucun cas dans les 21 derniers jours.</div>`)}
      </div>
      ${panel("Accès rapide", "", `<div class="quick">${quick.join("")}</div>`)}
      ${panel("Zones de santé", `${CO.filter(c => rows.some(r => r.cat === c)).map(c => `${catSq(c)}${c} : <b>${rows.filter(r => r.cat === c).length}</b>`).join(" &nbsp; ")}`,
        `<div class="zcards">${cards.map(r => zcard(r, t)).join("")}</div>${quiet.length ? `<p class="note" style="margin-top:12px">Sans cas ni donnée de suivi : ${quiet.map(r => esc(r.nom)).join(", ")}.</p>` : ""}`)}`;
  }
  function zcard(r, t) {
    const me = myZone();
    const ind = r.ind || {};
    const lines = [];
    if (r.s) lines.push(`Suivi des contacts : <span class="${r.s.taux >= C.taux_suivi_pct ? "ok" : "bad"}">${pc(r.s.taux, 0)}</span> de ${nf(r.s.a_suivre)} · ${nf(r.s.jmv)} jamais vus${r.s.retard ? ` <span class="muted">(au ${dfr(r.s.date, false)})</span>` : ""}`);
    if (r.al && r.al.total) lines.push(`Alertes 7 j : ${nf(r.al.total)} · <span class="${r.al.inv_pct >= 90 ? "ok" : "bad"}">${pc(r.al.inv_pct, 0)}</span> investiguées`);
    if (ind.connus_pct !== undefined && ind.connus_pct !== null) lines.push(`Cas 21 j connus comme contacts : <span class="${ind.connus_pct >= C.cas_connus_contacts_pct ? "ok" : "bad"}">${pc(ind.connus_pct, 0)}</span>`);
    if (r.z.rt) lines.push(`Rt : <span class="${r.z.rt.rt < 1 ? "ok" : "bad"}">${nf(r.z.rt.rt, 2)}</span> <span class="muted">[${nf(r.z.rt.lo, 2)}–${nf(r.z.rt.hi, 2)}] au ${dfr(r.z.rt.date, false)}</span>`);
    if (r.z.labo && r.z.labo.n) lines.push(`Positivité : ${pc(r.z.labo.p, 1)} de ${nf(r.z.labo.n)} échantillons · post-mortem ${nf(r.z.labo.pm_pos)} positifs / ${nf(r.z.labo.pm)}`);
    else if (ind.positivite !== undefined && ind.positivite !== null) lines.push(`Positivité des prélèvements : ${pc(ind.positivite, 1)}`);
    const det = r.z.detail;
    const src = det ? (det.propres || []).length ? `Fichiers de la zone au ${dfr(det.date_rapport, false)}` : "Liste labo provinciale uniquement" : "Pas d'analyse détaillée";
    return `<div class="zcard ${me && me.code === r.code ? "mine" : ""}"><span class="bar" style="background:${CATMAP[r.cat]}"></span>
      <h3>${esc(r.nom)}<span class="catlab">${catSq(r.cat)}${r.cat}</span></h3>
      <div class="nums"><div><b>${nf(r.cs.n7)}</b><span>cas 7 j</span></div><div><b>${nf(r.cs.n21)}</b><span>cas 21 j</span></div><div><b>${nf(r.cs.n)}</b><span>cumul · ${nf(r.cs.deces)} déc.</span></div></div>
      ${spark(r.code, t)}
      <div class="lines">${lines.join("<br>") || `<span class="muted">Aucune donnée de suivi ni d'alerte</span>`}</div>
      <div class="foot"><span class="src">${src}</span>${zsBtn(r.code)}</div></div>`;
  }

  /* ================================================================== CARTE (fonction commune) */
  const MAPIND = [["categorie", "Catégorie (date du dernier cas)", "cat"], ["casper", "Cas confirmés (période)", "count"], ["cas7", "Cas des 7 derniers jours", "count"], ["cas21", "Cas des 21 derniers jours", "count"],
    ["inc", "Incidence cumulée /100 000 hab.", "count", 1], ["taux", "Taux de suivi des contacts (%)", "down"], ["as", "Contacts à suivre", "count"], ["jmv", "Contacts jamais vus", "count"], ["alinv", "Alertes investiguées 7 j (%)", "down90"]];
  function countClasses(vals, d = 0) {
    const v = vals.filter(x => x > 0).sort((a, b) => a - b);
    const q = p_ => v.length ? v[Math.min(v.length - 1, Math.floor(p_ * (v.length - 1)))] : 1;
    let b = [q(.25), q(.5), q(.75)].map(x => d ? Math.round(x * 10) / 10 : Math.round(x)); b = [...new Set(b.map(x => Math.max(d ? .1 : 1, x)))];
    const cuts = [0, ...b], out = [{ lo: 0, hi: 0, color: TL[0], label: "0" }], pal = [TL[1], TL[2], TL[3], TL[4]];
    for (let i = 0; i < cuts.length; i++) { const lo = d ? cuts[i] + (i ? .1 : .01) : cuts[i] + 1, hi = i + 1 < cuts.length ? cuts[i + 1] : Infinity; if (hi < lo) continue; out.push({ lo, hi, color: pal[Math.min(3, i + (4 - cuts.length))], label: hi === Infinity ? `≥ ${nf(lo, d)}` : (lo === hi ? nf(lo, d) : `${nf(lo, d)}–${nf(hi, d)}`) }); }
    return out;
  }
  function mapModel(ind, t) {
    const rows = Object.fromEntries(ZONES.map(z => [z.code, zoneRow(z, t)]));
    const per = {}; CAS.forEach(c => { if (inPer(c.date)) per[c.zone] = (per[c.zone] || 0) + 1; });
    const m = MAPIND.find(x => x[0] === ind) || MAPIND[0];
    const val = k => { const r = rows[k]; if (!r) return null; switch (ind) { case "categorie": return r.cat; case "casper": return per[k] || 0; case "cas7": return r.cs.n7; case "cas21": return r.cs.n21; case "inc": return r.inc; case "taux": return r.s ? r.s.taux : null; case "as": return r.s ? r.s.a_suivre : null; case "jmv": return r.s ? r.s.jmv : null; case "alinv": return r.al && r.al.total ? r.al.inv_pct : null; } };
    let color, leg;
    if (m[2] === "cat") { color = v => CATMAP[v] || TL_NA; leg = CO.map(c => ({ label: `${c} — ${CATDEF[c]} (${ZONES.filter(z => rows[z.code].cat === c).length})`, color: CATMAP[c] })); }
    else if (m[2].startsWith("down")) {
      const tg = m[2] === "down90" ? 90 : C.taux_suivi_pct, br = [50, 65, 80, tg];
      const cls = [{ lo: -Infinity, hi: br[0], color: TL[4], label: `< ${br[0]} %` }, { lo: br[0], hi: br[1], color: TL[3], label: `${br[0]}–${br[1]} %` }, { lo: br[1], hi: br[2], color: TL[2], label: `${br[1]}–${br[2]} %` }, { lo: br[2], hi: br[3], color: TL[1], label: `${br[2]}–${br[3]} %` }, { lo: br[3], hi: Infinity, color: TL[0], label: `≥ ${br[3]} % (cible)` }];
      color = v => v === null || v === undefined ? TL_NA : (cls.find(c => v >= c.lo && v < c.hi) || cls[cls.length - 1]).color;
      leg = [...cls.map(c => ({ label: c.label, color: c.color })), { label: "aucune donnée", color: TL_NA }];
    } else {
      const cls = countClasses(ZONES.map(z => val(z.code)).filter(v => typeof v === "number"), m[3] || 0);
      color = v => v === null || v === undefined ? TL_NA : (cls.find(c => v >= c.lo && v <= c.hi) || cls[cls.length - 1]).color;
      leg = [...cls.map(c => ({ label: c.label, color: c.color })), { label: "aucune donnée", color: TL_NA }];
    }
    leg.title = m[1];
    return { rows, val, color, leg, m };
  }
  function drawMap(el_, ind, t) {
    if (!el_) return;
    const { rows, val, color, leg, m } = mapModel(ind, t);
    const geo = { features: (P.geo.features || []).map(f => ({ aire: f.zone, nom: f.nom, geometry: f.geometry })) };
    G.map(el_, { areas: ZONES.map(z => ({ key: z.code, name: z.nom })), geo, value: val, color: v => color(v), selected: S.zone,
      label: k => { const v = val(k), r = rows[k]; if (!r) return ""; if (ind === "categorie") return r.cs.n7 ? `${r.cs.n7}` : ""; return typeof v === "number" ? (m[2].startsWith("down") ? pc(v, 0) : nf(v, m[3] || 0)) : ""; },
      tipHtml: k => { const r = rows[k]; if (!r) return esc(k); return `<b>${esc(r.nom)}</b>${r.cat} · ${nf(r.cs.n)} cas (${nf(r.cs.n7)} en 7 j, ${nf(r.cs.n21)} en 21 j) · ${nf(r.cs.deces)} décès${r.s ? `<br>${nf(r.s.a_suivre)} contacts à suivre · ${pc(r.s.taux, 0)} vus` : ""}${r.al && r.al.total ? `<br>${nf(r.al.total)} alertes (7 j) · ${pc(r.al.inv_pct, 0)} investiguées` : ""}<br><i>${DETAIL.has(k) ? "Cliquez pour ouvrir le tableau de bord de la zone" : "Cliquez pour filtrer sur cette zone"}</i>`; },
      onClick: k => { if (S.page === "accueil" && DETAIL.has(k)) location.href = openZS(k); else { S.zone = S.zone === k ? null : k; render(); } }, legend: leg, valueLabel: m[1] });
  }

  /* ================================================================== SITUATION ÉPIDÉMIOLOGIQUE */
  function pageSituation() {
    const t = day(S.date);
    const L = CAS.filter(c => inPer(c.date) && (!S.zone || c.zone === S.zone));
    const prev = CAS.filter(c => c._d !== null && c._d < day(S.from) && c._d >= day(S.from) - (t - day(S.from) + 1) && (!S.zone || c.zone === S.zone));
    const dec = L.filter(c => c.deces).length, h = L.filter(c => c.sexe === "M").length, f = L.filter(c => c.sexe === "F").length;
    const ages = L.map(c => c.age).filter(a => a !== null && a !== undefined).sort((a, b) => a - b);
    const kids = L.filter(c => c.age !== null && c.age < 15).length;
    const cs = casZone(S.zone, t);
    const ws = []; for (let w = wk(day(S.from)); w <= wk(t); w += 7) ws.push(w);
    const top = (() => { const n = {}; L.forEach(c => n[c.zone] = (n[c.zone] || 0) + 1); return Object.entries(n).sort((a, b) => b[1] - a[1]).map(x => x[0]); })();
    const groups = S.zone ? [S.zone] : top.slice(0, 6);
    after(() => {
      const ser = groups.map((z, i) => ({ label: ZN[z] || z, color: col(PAL[i % PAL.length]), values: ws.map(w => L.filter(c => c.zone === z && c._d >= w && c._d < w + 7).length) }));
      if (!S.zone && top.length > 6) ser.push({ label: "Autres zones", color: col("--rc-grey"), values: ws.map(w => L.filter(c => !groups.includes(c.zone) && c._d >= w && c._d < w + 7).length) });
      G.bars($("#c-epi"), { labels: ws.map(iso), series: ser, h: 280, fmtX: (d, l) => l ? "Semaine du " + dfr(d) : dshort(d) });
      const days = []; for (let d = day(S.from); d <= t; d++) days.push(d);
      G.bars($("#c-epi-j"), { labels: days.map(iso), series: [{ label: "Décédés", color: col("--rc-rt"), values: days.map(d => L.filter(c => c._d === d && c.deces).length) }, { label: "Vivants", color: col("--s2"), values: days.map(d => L.filter(c => c._d === d && !c.deces).length) }], h: 200, fmtX: (d, l) => l ? dfr(d) : dshort(d) });
      const AG = [["0–4", 0, 4], ["5–14", 5, 14], ["15–24", 15, 24], ["25–34", 25, 34], ["35–44", 35, 44], ["45–59", 45, 59], ["60+", 60, 200]];
      G.bars($("#c-age"), { labels: AG.map(a => a[0]), series: [{ label: "Hommes", color: col("--sex-m"), values: AG.map(([, a, b]) => L.filter(c => c.sexe === "M" && c.age >= a && c.age <= b).length) }, { label: "Femmes", color: col("--sex-f"), values: AG.map(([, a, b]) => L.filter(c => c.sexe === "F" && c.age >= a && c.age <= b).length) }], h: 220 });
      G.hbars($("#c-let"), { items: AG.map(([l, a, b]) => { const g = L.filter(c => c.age >= a && c.age <= b); return { label: `${l} ans (${g.length} cas)`, value: g.length ? 100 * g.filter(c => c.deces).length / g.length : 0, color: col("--rc-rt") }; }), pct: 1, max: 100 });
    });
    const zr = ZONES.map(z => { const l = L.filter(c => c.zone === z.code), p = prev.filter(c => c.zone === z.code), c = casZone(z.code, t); return { nom: z.nom, code: z.code, cat: c.cat, n: l.length, prev: p.length, deces: l.filter(x => x.deces).length, let: ratio(l.filter(x => x.deces).length, l.length), inc: z.population ? 1e5 * l.length / z.population : null, cum: c.n, jours: c.jours }; }).filter(r => r.n || r.prev);
    return `<p class="lead">${scope()} — <b>${nf(L.length)} cas confirmés</b> ${perTxt()} (${nf(prev.length)} sur la période précédente de même durée), dont <b>${nf(dec)} décès</b> (${pc(ratio(dec, L.length), 1)}). ${S.zone ? `Dernier cas il y a ${nf(cs.jours)} jours.` : `${nf(zr.filter(r => r.n).length)} zones ont notifié des cas sur la période.`}</p>
      <div class="grid g5">
        ${kpi("Cas confirmés sur la période", nf(L.length), `${L.length >= prev.length ? "+" : ""}${nf(L.length - prev.length)} vs période précédente`, { color: "--s2", cls: L.length > prev.length ? "alert" : "" })}
        ${kpi("Décès", nf(dec), `létalité ${pc(ratio(dec, L.length), 1)} sur la période`, { color: "--rc-rt" })}
        ${kpi("Cas en 7 jours", nf(cs.n7), `${nf(cs.n7p)} les 7 jours précédents`, { color: "--s1", cls: cs.n7 > cs.n7p ? "alert" : "" })}
        ${kpi("Hommes / femmes", `${nf(h)} / ${nf(f)}`, `${pc(ratio(f, h + f), 0)} de femmes`, { color: "--sex-f" })}
        ${kpi("Âge médian", ages.length ? nf(ages[Math.floor(ages.length / 2)]) + " ans" : "—", `${nf(kids)} enfants de moins de 15 ans (${pc(ratio(kids, L.length), 0)})`, { color: "--s3" })}
      </div>
      ${panel("Courbe épidémique hebdomadaire", `Cas confirmés par semaine de confirmation (date d'analyse au laboratoire) · ${S.zone ? esc(ZN[S.zone]) : "6 zones les plus touchées sur la période"}`, `<div id="c-epi"></div>`, { png: "courbe_epidemique" })}
      ${panel("Cas confirmés par jour", perTxt(), `<div id="c-epi-j"></div>`, { png: "cas_par_jour" })}
      <div class="grid g2">
        ${panel("Âge et sexe des cas", perTxt(), `<div id="c-age"></div>`, { png: "age_sexe" })}
        ${panel("Létalité par âge", "Part des cas décédés (liste labo : statut au prélèvement et issue)", `<div id="c-let"></div>`, { png: "letalite_age" })}
      </div>
      ${S.zone ? "" : panel("Cas par zone de santé", `${perTxt()} · cliquez une ligne pour filtrer`, table("t-sit", zr, [{ k: "nom", t: "Zone de santé", v: r => `${catSq(r.cat)}${esc(r.nom)}` }, { k: "n", t: "Cas (période)", num: 1 }, { k: "prev", t: "Période précédente", num: 1 },
        { k: "deces", t: "Décès", num: 1 }, { k: "let", t: "Létalité", num: 1, v: r => pc(r.let, 0) }, { k: "inc", t: "Incidence /100 000", num: 1, d: 1 }, { k: "cum", t: "Cumul", num: 1 }, { k: "jours", t: "Jours depuis le dernier cas", num: 1 }],
        { sort: "n", rowClick: r => r.code }), { csv: "t-sit" })}`;
  }

  /* ================================================================== ZONES DE SANTÉ (comparaison) */
  function pageZones() {
    const t = day(S.date);
    const rows = ZONES.map(z => zoneRow(z, t)).filter(r => r.cs.n || r.s || r.al?.total || DETAIL.has(r.code)).map(r => ({
      ...r, cas7: r.cs.n7, cas21: r.cs.n21, cum: r.cs.n, deces: r.cs.deces, jours: r.cs.jours, as: r.s ? r.s.a_suivre : null, taux: r.s ? r.s.taux : null, jmv: r.s ? r.s.jmv : null, pdv: r.s ? r.s.pdv : null,
      altot: r.al ? r.al.total : null, alinv: r.al && r.al.total ? r.al.inv_pct : null, rt: r.z.rt ? r.z.rt.rt : null, rtlo: r.z.rt ? r.z.rt.lo : null, rthi: r.z.rt ? r.z.rt.hi : null,
      posi: r.z.labo ? r.z.labo.p : null, pmpos: r.z.labo ? r.z.labo.pm_pos : null, pm: r.z.labo ? r.z.labo.pm : null, eds: r.al ? r.al.eds : null, swab: r.al ? r.al.swab : null, dcom: r.al ? r.al.deces : null, connus: r.ind.connus_pct ?? null, disol: r.ind.d_isol ?? null, dlist: r.ind.d_listage ?? null, pos: r.ind.positivite ?? null }));
    const cnt = Object.fromEntries(CO.map(c => [c, ZONES.filter(z => zoneRow(z, t).cat === c).length]));
    return `<p class="lead">${CO.filter(c => cnt[c]).map(c => `<b>${cnt[c]}</b> en ${c.toLowerCase()}`).join(", ")} au ${dfr(S.date)}. Chaque indicateur est comparé aux cibles : vert = atteinte, jaune = proche, rouge = loin de la cible. Cliquez une zone pour ouvrir son tableau de bord détaillé.</p>
      ${panel("Bulletin des zones de santé", "Cas : liste labo provinciale · suivi des contacts : dernier jour saisi dans la base chiffrée · alertes : 7 derniers jours saisis · cas connus comme contacts, délais et positivité : analyses détaillées des zones",
        table("t-zones", rows, [{ k: "nom", t: "Zone de santé", v: r => `${catSq(r.cat)}<b>${esc(r.nom)}</b>` }, { k: "cas7", t: "Cas 7 j", num: 1 }, { k: "cas21", t: "Cas 21 j", num: 1 }, { k: "cum", t: "Cumul", num: 1 }, { k: "deces", t: "Décès", num: 1 },
          { k: "jours", t: "Jours depuis le dernier cas", num: 1 }, { k: "rt", t: "Rt (IC 95 %)", num: 1, v: r => r.rt === null ? `<span class="muted">—</span>` : `${pill(nf(r.rt, 2), r.rthi < 1 ? "ok" : r.rtlo > 1 ? "bad" : "warn")} <span class="muted small">${nf(r.rtlo, 2)}–${nf(r.rthi, 2)}</span>`, csv: r => r.rt },
          { k: "posi", t: "Positivité (labo)", num: 1, v: r => pc(r.posi, 1) }, { k: "pmpos", t: "Post-mortem positifs", num: 1, v: r => r.pm ? `${nf(r.pmpos)} / ${nf(r.pm)}` : "—", csv: r => r.pmpos },
          { k: "as", t: "Contacts à suivre", num: 1 }, { k: "taux", t: "Taux de suivi", num: 1, v: r => feu(r.taux, C.taux_suivi_pct, 75) }, { k: "jmv", t: "Jamais vus", num: 1 }, { k: "pdv", t: "PDV", num: 1 },
          { k: "altot", t: "Alertes 7 j", num: 1 }, { k: "alinv", t: "Alertes investiguées", num: 1, v: r => feu(r.alinv, 95, 80) },
          { k: "dcom", t: "Décès comm. 7 j (swabés · EDS)", num: 1, v: r => r.dcom ? `${nf(r.dcom)} <span class="muted small">(${nf(r.swab)} · ${nf(r.eds)})</span>` : (r.dcom === 0 ? "0" : "—"), csv: r => r.dcom }, { k: "connus", t: "Cas 21 j connus comme contacts", num: 1, v: r => feu(r.connus, C.cas_connus_contacts_pct, 50) },
          { k: "disol", t: "Début des signes → isolement (j)", num: 1, v: r => feu(r.disol, C.delai_isolement_j, 5, false, x => nf(x, 0) + " j") }, { k: "dlist", t: "Délai de listage (j)", num: 1, v: r => feu(r.dlist, C.delai_listage_j || 1, 3, false, x => nf(x, 0) + " j") },
          { k: "pos", t: "Positivité", num: 1, v: r => pc(r.pos, 1) }, { k: "code", t: "", v: r => zsBtn(r.code), csv: () => "" }], { sort: "cas21", rowClick: r => r.code, limit: 60 }), { csv: "t-zones" })}`;
  }

  /* ================================================================== CARTE ET RAPPORTS */
  function pageCarte() {
    const t = day(S.date);
    after(() => drawMap($("#c-map"), S.mapInd, t));
    const cm = (P.exports || {}).cartes || {};
    const lab = { categorie: "Catégorie des zones de santé", cas21: "Cas des 21 derniers jours", cas7: "Cas des 7 derniers jours", inc: "Incidence cumulée", taux: "Taux de suivi des contacts", as: "Contacts à suivre" };
    const ks = Object.keys(cm);
    return `<div class="grid g21">
        ${panel(MAPIND.find(x => x[0] === S.mapInd)[1], `Situation au ${dfr(S.date)} · couleurs épidémiologiques : vert = favorable → rouge = critique ; gris = aucune donnée`,
          `<div class="filters"><label>Indicateur <select data-state="mapInd">${MAPIND.map(([k, l]) => `<option value="${k}" ${S.mapInd === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><div id="c-map"></div>`, { png: "carte_province" })}
        ${panel("Rapport et tableaux de la province", `Situation au ${dfr(P.meta.date_rapport)}`, `<div class="quick" style="grid-template-columns:1fr">
          ${P.exports && P.exports.rapport_pdf ? `<a href="${outp(P.exports.rapport_pdf)}" target="_blank" rel="noopener">${svgI("pdf")}<div><b>Rapport de situation provincial</b><span>PDF A4 : indicateurs, points d'attention, cartes, courbe, tableau par zone</span></div></a>` : ""}
          ${P.exports && P.exports.classeur ? `<a href="${outp(P.exports.classeur)}" download>${svgI("zones")}<div><b>Classeur des tableaux</b><span>Excel : synthèse par zone, cas par semaine, suivi, alertes</span></div></a>` : ""}
        </div><p class="note">Le rapport de chaque zone de santé se télécharge depuis son tableau de bord (« Carte et rapports »).</p>`)}
      </div>
      ${ks.length ? panel("Cartes pour rapport", "Format A4 paysage : titre, légende avec le nombre de zones par classe, flèche du nord, échelle, source", `<div class="maps-grid">${ks.map(k => `<div class="map-card"><a href="${outp("cartes/" + encodeURIComponent(cm[k]))}" target="_blank" rel="noopener"><img class="map-img" loading="lazy" src="${outp("cartes/" + encodeURIComponent(cm[k]))}" alt="${esc(lab[k] || k)}"></a><div class="flex between" style="margin-top:8px"><b class="small">${esc(lab[k] || k)}</b><a class="btn sm" href="${outp("cartes/" + encodeURIComponent(cm[k]))}" download>⤓ PNG</a></div></div>`).join("")}</div>`) : ""}`;
  }

  /* ================================================================== SUIVI DES CONTACTS */
  function pageContacts() {
    const t = day(S.date);
    if (!SV.length) return notice("<b>Suivi des contacts</b> — la base chiffrée provinciale (feuille « SaisieSuiviContact ») n'a pas été chargée.", "warn");
    const codes = S.zone ? [S.zone] : Object.keys(SVZ);
    const sp = suiviProv(t, codes);
    const days = []; for (let d = day(S.from); d <= t; d++) days.push(d);
    const serie = days.map(d => suiviProv(d, codes));
    const zr = Object.keys(SVZ).map(c => { const s = suiviAt(c, t, 7), z = ZB[c]; if (!s || !z) return null;
      const w = SVZ[c].filter(r => r._d > t - 7 && r._d <= t), a7 = w.reduce((x, r) => x + r.a_suivre, 0), v7 = w.reduce((x, r) => x + r.vus, 0);
      return { code: c, nom: z.nom, cat: casZone(c, t).cat, date: s.date, retard: s.retard, as: s.a_suivre, vus: s.vus, taux: s.taux, taux7: ratio(v7, a7), jmv: s.jmv, pdv: s.pdv, nv48: s.nv48, ret: s.reticences, dep: s.deplaces, susp7: w.reduce((x, r) => x + r.suspects, 0), nouv7: w.reduce((x, r) => x + r.nouveaux, 0), cas21: casZone(c, t).n21 }; }).filter(Boolean);
    after(() => {
      G.lines($("#c-taux"), { labels: days.map(iso), series: [{ label: S.zone ? ZN[S.zone] : "Province", color: col("--s1"), values: serie.map(o => o.taux) }], pct: 1, max: 100, target: C.taux_suivi_pct, digits: 1, fmtX: (d, l) => l ? dfr(d) : dshort(d) });
      G.bars($("#c-nv"), { labels: days.map(iso), series: [{ label: "Vus", color: col("--st-v24"), values: serie.map(o => o.vus) }, { label: "Jamais vus", color: col("--s7"), values: serie.map(o => o.jmv) }, { label: "Perdus de vue", color: col("--s2"), values: serie.map(o => o.pdv) }, { label: "Autres non vus", color: col("--st-nv"), values: serie.map(o => Math.max(0, o.a_suivre - o.vus - o.jmv - o.pdv)) }], fmtX: (d, l) => l ? dfr(d) : dshort(d) });
      if (!S.zone) {
        const d0 = Math.max(day(S.from), t - 89), dd = []; for (let d = d0; d <= t; d++) dd.push(d);
        const zs = zr.sort((a, b) => b.as - a.as).map(r => r.code);
        G.matrix($("#c-mat"), { cols: dd.map(iso), rows: zs.map(c => ({ label: ZN[c], values: dd.map(d => { const r = (SVZ[c] || []).find(x => x._d === d); return r && r.a_suivre ? 100 * r.vus / r.a_suivre : null; }) })),
          color: v => v >= C.taux_suivi_pct ? TL[0] : v >= 80 ? TL[1] : v >= 65 ? TL[2] : v >= 50 ? TL[3] : TL[4], fmtX: (d, l) => l ? dfr(d) : dshort(d), fmt: v => pc(v, 0) + " de contacts vus" });
      }
    });
    const late = zr.filter(r => r.retard > 1 && r.cas21);
    return `<p class="lead">${scope()} — le ${dfr(S.date)}, <b>${nf(sp.vus)} contacts vus sur ${nf(sp.a_suivre)} à suivre</b> (${pc(sp.taux, 1)}) dans ${nf(sp.zones)} zone(s) ayant rapporté ; ${nf(sp.jmv)} jamais vus et ${nf(sp.pdv)} perdus de vue.</p>
      <div class="grid g5">
        ${kpi("Contacts à suivre", nf(sp.a_suivre), `${nf(sp.zones)} zones rapportées`, { color: "--s1" })}
        ${kpi("Taux de suivi", pc(sp.taux, 1), `cible ${nf(C.taux_suivi_pct)} %`, { color: "--st-v24", cls: sp.taux !== null && sp.taux < C.taux_suivi_pct ? "alert" : "good", meter: sp.taux, meterColor: sp.taux < C.taux_suivi_pct ? "--critical" : "--good" })}
        ${kpi("Jamais vus", nf(sp.jmv), `${pc(ratio(sp.jmv, sp.a_suivre), 0)} des contacts à suivre`, { color: "--s7", cls: sp.jmv ? "alert" : "" })}
        ${kpi("Perdus de vue", nf(sp.pdv), "non vus depuis 72 h ou plus", { color: "--s2", cls: sp.pdv ? "alert" : "" })}
        ${kpi("Devenus suspects", nf(serie.slice(-7).reduce((a, o) => a + o.suspects, 0)), `7 derniers jours · ${nf(serie.slice(-7).reduce((a, o) => a + o.nouveaux, 0))} nouveaux contacts`, { color: "--st-susp" })}
      </div>
      ${late.length ? notice(`<b>Données de suivi en retard</b> pour des zones ayant eu des cas en 21 jours : ${late.map(r => `${esc(r.nom)} (dernier rapport le ${dfr(r.date, false)})`).join(", ")}.`, "warn") : ""}
      <div class="grid g2">
        ${panel("Taux de suivi quotidien", perTxt(), `<div id="c-taux"></div>`, { png: "taux_suivi" })}
        ${panel("Contacts vus et non vus par jour", perTxt(), `<div id="c-nv"></div>`, { png: "contacts_non_vus" })}
      </div>
      ${S.zone ? "" : panel("Suivi des contacts par zone de santé", `Dernier jour rapporté dans la base chiffrée provinciale (au plus tard le ${dfr(S.date)})`, table("t-ct", zr, [{ k: "nom", t: "Zone de santé", v: r => `${catSq(r.cat)}${esc(r.nom)}` }, { k: "date", t: "Rapport du", v: r => `${dfr(r.date, false)}${r.retard > 1 ? ` <span class="pill warn">${r.retard} j</span>` : ""}` },
        { k: "as", t: "À suivre", num: 1 }, { k: "vus", t: "Vus", num: 1 }, { k: "taux", t: "Taux de suivi", num: 1, v: r => feu(r.taux, C.taux_suivi_pct, 75) }, { k: "taux7", t: "Taux 7 j", num: 1, v: r => pc(r.taux7, 0) },
        { k: "jmv", t: "Jamais vus", num: 1 }, { k: "pdv", t: "PDV", num: 1 }, { k: "nv48", t: "Non vus 0–48 h", num: 1 }, { k: "ret", t: "Réticences", num: 1 }, { k: "dep", t: "Déplacés", num: 1 }, { k: "susp7", t: "Devenus suspects (7 j)", num: 1 }, { k: "nouv7", t: "Nouveaux (7 j)", num: 1 }],
        { sort: "as", rowClick: r => r.code, total: { nom: "Province", as: sp.a_suivre, vus: sp.vus, taux: sp.taux, jmv: sp.jmv, pdv: sp.pdv } }), { csv: "t-ct" })}
      ${S.zone ? "" : panel("Taux de suivi par zone et par jour", `${perTxt()} (90 jours au plus) ; vert = cible atteinte → rouge = moins de 50 % de contacts vus ; blanc = pas de rapport`, `<div id="c-mat"></div>`, { png: "matrice_suivi" })}`;
  }

  /* ================================================================== ALERTES */
  function pageAlertes() {
    const t = day(S.date);
    if (!AL.length) return notice("<b>Alertes</b> — la base chiffrée provinciale (feuille « DATA ENTRY ») n'a pas été chargée.", "warn");
    const t1 = Math.min(t, lastAl), t0 = day(S.from);
    const a = alertesPer(S.zone, t0, t1);
    const stale = t - lastAl;
    const ws = []; for (let w = wk(t0); w <= wk(t1); w += 7) ws.push(w);
    after(() => {
      const L = AL.filter(r => (!S.zone || r.zone === S.zone));
      const sw = (w, k) => L.filter(r => r._d >= w && r._d < w + 7).reduce((x, r) => x + (+r[k] || 0), 0);
      G.bars($("#c-al-src"), { labels: ws.map(iso), series: [{ label: "Formations sanitaires (ESS)", color: col("--s1"), values: ws.map(w => sw(w, "src_ess")) }, { label: "Recherche active", color: col("--s7"), values: ws.map(w => sw(w, "src_ra")) }, { label: "Communauté", color: col("--s3"), values: ws.map(w => sw(w, "src_comm")) }, { label: "Contacts", color: col("--st-susp"), values: ws.map(w => sw(w, "src_contacts")) }, { label: "Points d'entrée", color: col("--s4"), values: ws.map(w => sw(w, "src_poe")) }], h: 260, fmtX: (d, l) => l ? "Semaine du " + dfr(d) : dshort(d) });
      G.lines($("#c-al-inv"), { labels: ws.map(iso), series: [{ label: "Alertes investiguées", color: col("--brand-2"), values: ws.map(w => ratio(sw(w, "inv"), sw(w, "total"))) }, { label: "Alertes validées", color: col("--st-susp"), values: ws.map(w => ratio(sw(w, "val"), sw(w, "total"))) }], pct: 1, max: 100, digits: 0, fmtX: (d, l) => l ? "Semaine du " + dfr(d) : dshort(d) });
    });
    const zr = ZONES.map(z => { const x = alertesPer(z.code, t0, t1); if (!x.total) return null; return { code: z.code, nom: z.nom, cat: casZone(z.code, t).cat, ...x, cas: CAS.filter(c => c.zone === z.code && c._d >= t0 && c._d <= t1).length }; }).filter(Boolean);
    return `${stale > 3 ? notice(`<b>Base des alertes à jour au ${dfr(iso(lastAl))}</b> : les indicateurs portent sur la période ${perTxt().replace(dfr(S.date), dfr(iso(t1)))} ; les jours suivants n'ont pas encore été saisis.`, "warn") : ""}
      <p class="lead">${scope()} — <b>${nf(a.total)} alertes</b> ${perTxt()} (dont ${nf(a.deces)} décès), <b>${pc(a.inv_pct, 0)} investiguées</b>, ${nf(a.val)} validées comme suspects et ${nf(a.prelev)} prélevées.</p>
      <div class="grid g5">
        ${kpi("Alertes notifiées", nf(a.total), `${nf(a.deces)} décès communautaires`, { color: "--s1" })}
        ${kpi("Alertes investiguées", pc(a.inv_pct, 0), `${nf(a.inv)} investiguées · objectif 100 %`, { color: "--brand-2", cls: a.inv_pct !== null && a.inv_pct < 95 ? "alert" : "good", meter: a.inv_pct })}
        ${kpi("Alertes validées (suspects)", nf(a.val), `${pc(ratio(a.val, a.total), 0)} des alertes`, { color: "--st-susp" })}
        ${kpi("Suspects prélevés", nf(a.prelev), `${pc(ratio(a.prelev, a.val), 0)} des alertes validées`, { color: "--s3" })}
        ${kpi("Alertes par cas confirmé", nf(ratio(a.total, CAS.filter(c => c._d >= t0 && c._d <= t1 && (!S.zone || c.zone === S.zone)).length) / 100, 1), "sensibilité de la surveillance", { color: "--s4" })}
      </div>
      ${panel("Alertes par semaine et par source", perTxt(), `<div id="c-al-src"></div>`, { png: "alertes_sources" })}
      ${panel("Investigation et validation des alertes", "Part des alertes de la semaine", `<div id="c-al-inv"></div>`, { png: "alertes_investigation" })}
      ${S.zone ? "" : panel("Alertes par zone de santé", perTxt(), table("t-al", zr, [{ k: "nom", t: "Zone de santé", v: r => `${catSq(r.cat)}${esc(r.nom)}` }, { k: "total", t: "Alertes", num: 1 }, { k: "deces", t: "dont décès", num: 1 }, { k: "inv_pct", t: "Investiguées", num: 1, v: r => feu(r.inv_pct, 95, 80) },
        { k: "val", t: "Validées", num: 1 }, { k: "prelev", t: "Prélevées", num: 1 }, { k: "isolees", t: "Isolées", num: 1 }, { k: "cas", t: "Cas confirmés", num: 1 }, { k: "dernier", t: "Dernier jour saisi", v: r => dfr(r.dernier, false) }], { sort: "total", rowClick: r => r.code }), { csv: "t-al" })}`;
  }

  /* ================================================================== DONNÉES DES ZONES */
  const KIND_LIB = { contacts: "Base de suivi des contacts", cas: "Liste des cas", notif: "Liste linéaire (alertes et suspects)", alertes: "Base des alertes", sbc: "SBC (CAC)", ra: "Recherche active", contours: "Contours des aires", aires: "Paramètres des aires" };
  function guessZone(name) {
    const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    const hits = ZONES.filter(z => new RegExp("(^|[^A-Z])" + z.nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() + "([^A-Z]|$)").test(n));
    return hits.length === 1 ? hits[0] : null;
  }
  function pageDonnees() {
    const t = day(S.date);
    const me = myZone();
    if (!S.upZone) S.upZone = me ? me.code : (S.zone || "province");
    const rows = ZONES.map(z => { const d = z.detail || {}, s = suiviAt(z.code, t, 400), al = AL.filter(r => r.zone === z.code); return { code: z.code, nom: z.nom, cat: casZone(z.code, t).cat, cas: casZone(z.code, t).n,
      suivi: SVZ[z.code] ? SVZ[z.code][SVZ[z.code].length - 1].date : null, alertes: al.length ? iso(Math.max(...al.map(r => r._d))) : null, det: d.date_rapport || null,
      propres: (d.propres || []).filter(k => k !== "cas" || !(d.cas_origine || "").startsWith("Liste labo")).map(k => (d.fichiers || {})[k]?.libelle || KIND_LIB[k] || k), warn: d.avertissements || 0 }; });
    const can = USER && (isProv() || me);
    const tgtOpts = isProv() ? [["province", "Fichiers provinciaux (liste labo, base chiffrée)"], ...ZONES.map(z => [z.code, "Zone de santé de " + z.nom])] : me ? [[me.code, "Zone de santé de " + me.nom]] : [];
    const tgtName = S.upZone === "province" ? "la province" : `la zone de santé de ${ZN[S.upZone] || ""}`;
    if (SERVED && can) after(() => loadFiles());
    return `${SERVED && can ? panel("Charger les données", `Les fichiers sont copiés dans le dossier de ${esc(tgtName)} ; les originaux ne sont jamais modifiés. Seules les analyses des fichiers déposés sont refaites ; les autres analyses sont conservées.`,
        `<div class="target"><label class="field">Destination<select data-state="upZone" ${tgtOpts.length < 2 ? "disabled" : ""}>${tgtOpts.map(([v, l]) => `<option value="${v}" ${S.upZone === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          <span class="note">${S.upZone === "province" ? "Liste labo des confirmés (toutes les zones), base chiffrée du suivi des contacts et des alertes." : "Base de suivi des contacts (J1–J21) ou listage des contacts, liste des cas, liste linéaire des suspects et confirmés, export DHIS2, base des alertes, SBC, recherche active, contours des aires de santé."}</span></div>
        <label class="drop" id="drop"><input type="file" id="up" multiple hidden accept=".xlsx,.xlsb,.xls,.xlsm,.csv,.zip,.geojson,.json"><b>Déposez les fichiers ici</b><span class="muted small">ou cliquez pour les choisir · l'outil reconnaît chaque fichier par son contenu</span></label>
        <div id="up-files" style="margin-top:12px"></div>
        <p class="flex" style="gap:8px;margin-top:12px"><button class="btn primary" data-run="${S.upZone}">Analyser ${S.upZone === "province" ? "la province" : esc(ZN[S.upZone] || "")}</button>${isProv() ? `<button class="btn" data-run="tout">Tout analyser (toutes les zones)</button>` : ""}</p>
        <div class="log" id="log" hidden></div>`) : PUBLIC ? notice("Version en ligne en lecture seule : les fichiers se chargent dans l'outil local de la coordination provinciale.") : !SERVED ? notice("Ouvrez l'outil avec « 00_OUVRIR_OUTIL » pour charger des fichiers ; sinon copiez-les dans donnees/zs/&lt;Zone&gt;/ ou donnees/province/ puis lancez « 02_ANALYSER ».") : ""}
      ${panel("État des données par zone de santé", `Données provinciales : liste labo au ${dfr((P.meta.jusqu_au || {}).labo)} · suivi des contacts au ${dfr((P.meta.jusqu_au || {}).suivi)} · alertes au ${dfr((P.meta.jusqu_au || {}).alertes)}`,
        table("t-data", rows.filter(r => r.cas || r.suivi || r.det || r.alertes), [{ k: "nom", t: "Zone de santé", v: r => `${catSq(r.cat)}${esc(r.nom)}` }, { k: "cas", t: "Cas (liste labo)", num: 1 },
          { k: "suivi", t: "Suivi des contacts (base provinciale)", v: r => r.suivi ? dfr(r.suivi, false) + (t - day(r.suivi) > 2 ? ` <span class="pill warn">${t - day(r.suivi)} j</span>` : "") : "—" },
          { k: "alertes", t: "Alertes (base provinciale)", v: r => r.alertes ? dfr(r.alertes, false) : "—" }, { k: "det", t: "Analyse détaillée", v: r => r.det ? dfr(r.det, false) : "—" },
          { k: "propres", t: "Fichiers déposés par la zone", wrap: 1, v: r => r.propres.length ? esc(r.propres.join(" · ")) : `<span class="muted">aucun (liste labo provinciale)</span>`, csv: r => r.propres.join(", "), sortv: r => r.propres.length },
          { k: "warn", t: "Avertissements", num: 1 }, { k: "code", t: "", v: r => zsBtn(r.code), csv: () => "" }], { sort: "cas", limit: 60 }), { csv: "t-data" })}
      ${(P.meta.avertissements || []).length ? panel("Avertissements (fichiers provinciaux)", "", (P.meta.avertissements || []).map(w => `<p class="note warn">${esc(w)}</p>`).join("")) : ""}`;
  }
  async function loadFiles() {
    const box = $("#up-files"); if (!box) return;
    try {
      const r = await (await fetch("/api/fichiers?zone=" + encodeURIComponent(S.upZone === "province" ? "province" : ZN[S.upZone]), { credentials: "same-origin" })).json();
      box.innerHTML = r.fichiers && r.fichiers.length ? `<div class="table-wrap files-tbl"><table><thead><tr><th>Fichiers présents</th><th class="num">Taille</th><th>Déposé le</th><th></th></tr></thead><tbody>${r.fichiers.map(f => `<tr><td>${esc(f.nom)}</td><td class="num">${nf(f.taille / 1e6, 1)} Mo</td><td>${esc(f.modifie)}</td><td><button class="btn sm" data-retirer="${esc(f.nom)}" title="Retirer de l'analyse (le fichier est déplacé dans _retires, pas supprimé)">Retirer</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="note">Aucun fichier pour l'instant.</p>`;
      const ar = r.archives || [];
      if (ar.length) box.innerHTML += `<details class="archives" style="margin-top:12px"><summary><b>Copies datées</b> <span class="muted small">— une copie de chaque fichier chargé est gardée dans ${S.upZone === "province" ? "donnees/province" : "donnees/zs/" + esc(ZN[S.upZone] || "")}/archives/&lt;date du jour&gt;</span></summary><div class="table-wrap files-tbl"><table><thead><tr><th>Date de chargement</th><th>Fichiers</th></tr></thead><tbody>${ar.map(x => `<tr><td style="white-space:nowrap">${esc(x.date.split("-").reverse().join("/"))}</td><td>${x.fichiers.map(esc).join("<br>")}</td></tr>`).join("")}</tbody></table></div></details>`;
    } catch (e) { box.innerHTML = `<p class="note warn">Liste des fichiers indisponible.</p>`; }
  }
  async function upload(files) {
    const log = $("#log"); log.hidden = false;
    const zoneName = S.upZone === "province" ? "province" : ZN[S.upZone];
    for (const f of files) {
      if (S.upZone !== "province" && isProv()) { const g = guessZone(f.name); if (g && g.code !== S.upZone && !confirm(`Le nom du fichier « ${f.name} » évoque la zone de santé de ${g.nom}, mais la destination choisie est ${zoneName}. Continuer ?`)) { log.textContent += `Annulé : ${f.name}\n`; continue; } }
      log.textContent += `Envoi de ${f.name} (${nf(f.size / 1e6, 1)} Mo)…\n`;
      const r = await fetch(`/api/televerser?zone=${encodeURIComponent(zoneName)}&nom=${encodeURIComponent(f.name)}`, { method: "POST", body: f, credentials: "same-origin" });
      const j = await r.json().catch(() => ({}));
      log.textContent += r.ok ? `  ✓ copié (${S.upZone === "province" ? "donnees/province" : "donnees/zs/" + zoneName})\n` : `  ✗ ${j.erreur || r.status}\n`;
    }
    log.textContent += "Cliquez « Analyser » pour mettre à jour les tableaux de bord.\n";
    loadFiles();
  }
  async function runJob(target) {
    const body = { zone: target === "tout" || target === "province" ? target : ZN[target] };
    const r = await fetch("/api/analyser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.erreur || "Analyse impossible"); return; }
    if (S.page !== "donnees") { S.page = "donnees"; render(); }
    pollJob();
  }
  async function pollJob(reloadOnEnd = true) {
    const s = await (await fetch("/api/etat", { credentials: "same-origin" })).json();
    const log = $("#log") || $("#pub-log");
    if (log) { log.hidden = false; log.textContent = (s.par ? `${s.type === "publication" ? "Publication" : "Analyse"} : ${s.par} (début ${s.debut})\n` : "") + s.log; log.scrollTop = log.scrollHeight; }
    if (s.running) setTimeout(() => pollJob(reloadOnEnd), 1200); else if (s.ok && reloadOnEnd && s.type === "analyse") setTimeout(() => location.reload(), 900);
  }

  /* ================================================================== COMPTES */
  async function pageComptesLoad() {
    const box = $("#cpt"); if (!box) return;
    const r = await fetch("/api/comptes", { credentials: "same-origin" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { box.innerHTML = notice(esc(j.erreur || "Accès refusé"), "warn"); return; }
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Identifiant</th><th>Nom affiché</th><th>Rôle</th><th>Zone de santé</th><th>État</th><th>Dernière connexion</th><th></th></tr></thead><tbody>${j.comptes.map(c => `<tr><td><b>${esc(c.identifiant)}</b></td><td>${esc(c.nom)}</td><td>${c.role === "province" ? "Province" : "Zone de santé"}</td><td>${c.role === "zs" ? `<select data-cpt-zone="${esc(c.identifiant)}" aria-label="Zone de santé du compte">${ZONES.map(z => `<option ${z.nom === c.zone ? "selected" : ""}>${esc(z.nom)}</option>`).join("")}</select>${(() => { const g = guessZone(c.identifiant + " " + (c.nom || "")); return g && g.nom !== c.zone ? `<div class="msg err" style="margin-top:4px">Le nom évoque ${esc(g.nom)} : vérifiez la zone.</div>` : ""; })()}` : "—"}</td><td>${c.actif === false ? badge("désactivé", "b-crit") : badge("actif", "b-good")}</td><td>${esc(c.derniere_connexion || "—")}</td>
      <td><div class="flex" style="gap:4px;justify-content:flex-end;flex-wrap:wrap"><button class="btn sm" data-cpt-mdp="${esc(c.identifiant)}">Nouveau mot de passe</button><button class="btn sm" data-cpt-act="${esc(c.identifiant)}" data-v="${c.actif === false ? 1 : 0}">${c.actif === false ? "Activer" : "Désactiver"}</button>${c.identifiant !== USER.identifiant ? `<button class="btn sm" data-cpt-del="${esc(c.identifiant)}">Supprimer</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`;
  }
  function pageComptes() {
    if (!isProv()) return notice("Page réservée au compte provincial.", "warn");
    after(pageComptesLoad);
    return `<p class="lead">Créez un compte par zone de santé : la zone pourra se connecter, charger <b>uniquement ses propres fichiers</b> et lancer l'analyse de sa zone. Un compte de zone ne voit <b>que sa zone</b> : ses analyses, ses cartes, ses rapports et ses fichiers. Seul le compte provincial voit toutes les zones et la situation de la province. Vérifiez que chaque compte est rattaché à la bonne zone (colonne « Zone de santé », modifiable).</p>
      ${panel("Nouveau compte", "Communiquez l'identifiant et le mot de passe à la personne concernée ; elle pourra changer son mot de passe depuis son menu.", `<form class="form" id="f-cpt">
        <label>Rôle<select name="role" id="cpt-role"><option value="zs">Zone de santé</option><option value="province">Province (tous les droits)</option></select></label>
        <label>Zone de santé<select name="zone" id="cpt-zone" required><option value="">— choisir la zone —</option>${ZONES.map(z => `<option>${esc(z.nom)}</option>`).join("")}</select></label>
        <label>Identifiant<input name="identifiant" required pattern="[a-z0-9._\\-]{3,32}" placeholder="ex. zs-butembo"></label>
        <label>Nom affiché<input name="nom" placeholder="ex. BCZ Butembo"></label>
        <label>Mot de passe (8 caractères au moins)<input name="mot_de_passe" type="text" required minlength="8" autocomplete="off"></label>
        <button class="btn primary" type="submit">Créer le compte</button></form><div class="msg" id="cpt-msg"></div>`)}
      ${panel("Comptes existants", "", `<div id="cpt"><div class="empty">Chargement…</div></div>`)}`;
  }
  async function cptPost(body) {
    const r = await fetch("/api/comptes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erreur || "Erreur"); return j;
  }

  /* ================================================================== PUBLICATION */
  function pagePublication() {
    if (!isProv()) return notice("Page réservée au compte provincial.", "warn");
    const url = P.meta.site_url;
    return `<p class="lead">La version en ligne permet de partager un lien avec les zones de santé et les partenaires. Elle est <b>en lecture seule et pseudonymisée</b> : aucun nom, quartiers retirés, équipes codées, pas de listes nominatives. Un contrôle automatique bloque la publication si un nom ou un numéro de téléphone est trouvé.</p>
      ${panel("Publier la version en ligne", url ? `Adresse : <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : "Adresse de publication : config/publication.json", `
        <p class="note">La publication reprend la dernière analyse de la province et de chaque zone. Elle nécessite une connexion Internet et l'accès au dépôt GitHub configuré sur cet ordinateur (voir LISEZ-MOI).</p>
        <p><button class="btn primary" data-publier>Publier maintenant</button></p><div class="log" id="pub-log" hidden></div>`)}`;
  }

  /* ------------------------------------------------------------------ navigation */
  const PAGES = [["accueil", "Accueil", "Province"], ["situation", "Situation épidémiologique", "Province"], ["zones", "Zones de santé", "Province"], ["carte", "Carte et rapports", "Province"],
    ["contacts", "Suivi des contacts", "Riposte"], ["alertes", "Surveillance des alertes", "Riposte"], ["donnees", PUBLIC ? "État des données" : "Données des zones", "Données"],
    ["comptes", "Comptes", "Administration", () => isProv()], ["publication", "Publication en ligne", "Administration", () => isProv()]];
  const DETAIL_PAGES = [["index", "Cas index", "M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"], ["journey", "Parcours des cas", "M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 18c0-3.9 3.1-7 7-7s7 3.1 7 7H5zM19 3l3 3-3 3"],
    ["chains", "Chaînes de transmission", "M7 7a3 3 0 1 1-2 5.2L10 15a3 3 0 1 1-.8 1.8L4.3 14A3 3 0 0 1 7 7zm10-4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"], ["recon", "Reconstruction de la transmission", "M4 5h4v4H4zm12 0h4v4h-4zM10 15h4v4h-4zM6 9v2h4v4h2v-4h4V9h-2v2H8V9z"],
    ["dynamics", "Dynamique et Rt", "M3 19h18v2H3zM4 15l4-6 4 3 5-8 3 2-6.6 10.3-4-3L6.2 16.4z"], ["children", "Enfants (0–18 ans)", "M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-4 8h8l-1 6h-1v6h-4v-6H9z"],
    ["deces", "Décès et EDS communautaires", "M10 2h4v6h6v4h-6v10h-4V12H4V8h6z"], ["labo", "Laboratoire et positivité", "M9 2h6v2h-1v5l5 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l5-9V4H9z"],
    ["contacts", "Suivi des contacts (bases des zones)", "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3z"], ["pec", "Prise en charge et expositions", "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4z"]];
  const VIEWS = { accueil: pageAccueil, situation: pageSituation, zones: pageZones, carte: pageCarte, contacts: pageContacts, alertes: pageAlertes, donnees: pageDonnees, comptes: pageComptes, publication: pagePublication };
  const PERIOD_PAGES = new Set(["situation", "contacts", "alertes", "carte"]);
  const SUBT = { accueil: () => `Situation au ${dfr(S.date)}`, zones: () => `Bulletin au ${dfr(S.date)}`, donnees: () => `Analyse provinciale du ${esc(P.meta.genere_le)}`, comptes: () => "Accès des zones de santé et de la province", publication: () => "Lien de partage en lecture seule" };
  function shell() {
    const pages = PAGES.filter(p => !p[3] || p[3]());
    if (!pages.find(p => p[0] === S.page)) S.page = "accueil";
    document.title = `Ebola — Province du ${PROV}`;
    $("#brand-sub").textContent = `Outil provincial · ${PROV}`;
    let g0 = "";
    const zl = ZONES.filter(z => DETAIL.has(z.code));
    const DET = P.meta.detail_province;
    const detLinks = DET ? `<div class="nav-group">Analyses détaillées · province</div>` + DETAIL_PAGES.map(([k, l, ic]) => `<a class="navlink" href="zs.html?zone=${encodeURIComponent(DET)}#p=${k}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ic}"/></svg>${l}</a>`).join("") : "";
    $("#nav").innerHTML = pages.map(([k, l, g]) => { const head = g !== g0 ? `<div class="nav-group">${g}</div>` : ""; g0 = g; return `${head}<button data-page="${k}" class="${S.page === k ? "active" : ""}">${svgI(k)}${l}</button>`; }).join("") + detLinks
      + (zl.length ? `<div class="nav-group">Tableaux de bord des zones</div><div class="zs-switch"><select data-openzs aria-label="Ouvrir le tableau de bord d'une zone de santé"><option value="">Ouvrir une zone de santé…</option>${zl.map(z => `<option value="${z.code}">${esc(z.nom)}${myZone() && myZone().code === z.code ? " (ma zone)" : ""}</option>`).join("")}</select></div>` : "");
    const p = pages.find(x => x[0] === S.page);
    $("#title").textContent = p[1];
    $("#subtitle").innerHTML = (SUBT[S.page] || (() => `${scope()} · ${perTxt()}`))();
    $("#zone-select").innerHTML = `<option value="">Toute la province</option>` + ZONES.filter(z => casZone(z.code, day(S.date)).n || SVZ[z.code]).map(z => `<option value="${z.code}" ${S.zone === z.code ? "selected" : ""}>${esc(z.nom)}</option>`).join("");
    $("#zone-field").style.display = ["situation", "contacts", "alertes"].includes(S.page) ? "" : "none";
    const t = day(S.date), pr = casZone(null, t), sp = suiviProv(t);
    $("#side-status").innerHTML = `<b><span class="pulse"></span>Province du ${esc(PROV)}</b><span>Situation au ${dfr(P.meta.date_rapport)}</span>
      <div class="row"><span>Cas 7 j</span><b>${nf(pr.n7)}</b></div><div class="row"><span>Zones actives</span><b>${nf(ZONES.filter(z => ["Rouge", "Orange"].includes(casZone(z.code, t).cat)).length)}</b></div><div class="row"><span>Taux de suivi</span><b>${pc(sp.taux, 0)}</b></div>`;
    $("#foot-l").textContent = `Ebola Outbreak — outil provincial du ${PROV} · analyse du ${P.meta.genere_le} · v${P.meta.version || ""}`;
    $("#user").innerHTML = USER ? `<button class="userchip" id="userchip" aria-haspopup="true"><span class="av">${esc((USER.nom || USER.identifiant).slice(0, 1).toUpperCase())}</span><span>${esc(USER.nom)}<small>${USER.role === "province" ? "Coordination provinciale" : "Zone de santé de " + esc(USER.zone)}</small></span></button>
      ${S.menu ? `<div class="menu-pop"><div class="who">Connecté : <b>${esc(USER.identifiant)}</b></div><button data-mdp>Changer mon mot de passe</button><button data-logout>Se déconnecter</button></div>` : ""}` : PUBLIC ? `<span class="badge b-info">Version en ligne · lecture seule</span>` : "";
    const PR = [["7", "7 j"], ["14", "14 j"], ["21", "21 j"], ["28", "28 j"], ["42", "42 j"], ["90", "90 j"], ["tout", "Tout"]];
    $("#periodbar").style.display = PERIOD_PAGES.has(S.page) ? "" : "none";
    $("#periodbar").innerHTML = `<div class="pb-main"><span class="pb-title"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3v18H4V4h3zm-1 8v10h12V10z"/></svg>Période d'analyse</span>
      <label class="pb-date">Du <input type="date" id="pb-from" value="${S.from}" min="${firstDate}" max="${S.date}"></label>
      <label class="pb-date">au <input type="date" id="pb-to" value="${S.date}" min="${firstDate}" max="${lastDate}"></label>
      <div class="seg pb-presets">${PR.map(([v, t_]) => `<button data-preset="${v}" class="${S.preset === v ? "on" : ""}">${t_}</button>`).join("")}</div>
      <span class="pb-state small">Les indicateurs, graphiques et tableaux se recalculent pour la période choisie.</span></div>`;
    window.HUB_PERIOD = S.preset === "tout" ? null : { debut: S.from, fin: S.date };
  }
  function render() {
    POST.length = 0;
    Ch.clearRegistry();
    shell();
    let html;
    try { html = (VIEWS[S.page] || pageAccueil)(); } catch (e) { console.error(e); html = `<div class="empty">Erreur d'affichage : ${esc(e.message)}</div>`; }
    $("#main").innerHTML = html;
    POST.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    const h = new URLSearchParams({ p: S.page, d: S.date, per: S.preset, du: S.from }); if (S.zone) h.set("z", S.zone);
    history.replaceState(null, "", "#" + h.toString());
    $("#sidebar").classList.remove("open");
  }
  function go(page) { S.page = page; S.menu = false; render(); scrollTo(0, 0); }
  function modalMdp() {
    const m = document.createElement("div"); m.className = "modal-back";
    m.innerHTML = `<form class="modal"><h3>Changer mon mot de passe</h3><p>8 caractères au moins.</p><div class="form" style="grid-template-columns:1fr"><label>Mot de passe actuel<input type="password" name="a" required autocomplete="current-password"></label><label>Nouveau mot de passe<input type="password" name="n" required minlength="8" autocomplete="new-password"></label><label>Confirmer<input type="password" name="c" required minlength="8" autocomplete="new-password"></label></div><div class="msg" id="m-msg"></div><div class="acts"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) m.remove(); });
    m.querySelector("form").addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target, msg = m.querySelector("#m-msg");
      if (f.n.value !== f.c.value) { msg.className = "msg err"; msg.textContent = "Les deux saisies diffèrent."; return; }
      const r = await fetch("/api/mot-de-passe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ancien: f.a.value, nouveau: f.n.value }), credentials: "same-origin" });
      const j = await r.json().catch(() => ({})); msg.className = "msg " + (r.ok ? "ok" : "err"); msg.textContent = r.ok ? "Mot de passe modifié." : (j.erreur || "Erreur"); if (r.ok) setTimeout(() => m.remove(), 900);
    });
  }

  /* ------------------------------------------------------------------ interactions */
  document.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("#theme")) { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; localSet("zs-theme", document.documentElement.dataset.theme); render(); return; }
    if (t.closest("#menu")) { $("#sidebar").classList.toggle("open"); return; }
    if (t.closest("#userchip")) { S.menu = !S.menu; shell(); return; }
    if (S.menu && !t.closest(".menu-pop")) { S.menu = false; shell(); }
    if (t.closest("[data-logout]")) { await fetch("/api/deconnexion", { method: "POST", credentials: "same-origin" }); location.href = "connexion.html"; return; }
    if (t.closest("[data-mdp]")) { S.menu = false; shell(); modalMdp(); return; }
    const nav = t.closest("[data-page]"); if (nav) { go(nav.dataset.page); return; }
    const gg = t.closest("[data-go]"); if (gg) { if (gg.dataset.upz) S.upZone = gg.dataset.upz; go(gg.dataset.go); return; }
    const pr = t.closest("[data-preset]"); if (pr) { S.preset = pr.dataset.preset; applyPreset(); render(); return; }
    const zr = t.closest("[data-zrow]"); if (zr && !t.closest("a")) { const k = zr.dataset.zrow; if (S.page === "accueil" || S.page === "zones" || S.page === "donnees") { if (DETAIL.has(k)) location.href = openZS(k); } else { S.zone = S.zone === k ? null : k; render(); } return; }
    const srt = t.closest("th[data-sort]"); if (srt) { const [id, k] = srt.dataset.sort.split("|"); const st = S.tables[id]; if (st) { st.dir = st.sort === k ? -st.dir : -1; st.sort = k; render(); } return; }
    const more = t.closest("[data-more]"); if (more) { const st = S.tables[more.dataset.more]; if (st) { st.limit += 100; render(); } return; }
    const png = t.closest("[data-png]"); if (png) { const p = png.closest(".panel"); const name = `${png.dataset.png}_${S.zone ? ZN[S.zone] : PROV}_${S.date}`; if (p.querySelector(".chart svg")) G.panelPNG(p, name, `${scope()} · ${PERIOD_PAGES.has(S.page) ? perTxt() : "au " + dfr(S.date)} · Ebola Outbreak — outil provincial`); else Ch.downloadPanelPNG(p, name); return; }
    const cv = t.closest("[data-csv]"); if (cv) { csvT(cv.dataset.csv); return; }
    const rn = t.closest("[data-run]"); if (rn) { runJob(rn.dataset.run); return; }
    const rt = t.closest("[data-retirer]"); if (rt) { if (!confirm(`Retirer « ${rt.dataset.retirer} » des analyses ? Le fichier est déplacé dans le sous-dossier _retires (il n'est pas supprimé).`)) return;
      const r = await fetch("/api/retirer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: S.upZone === "province" ? "province" : ZN[S.upZone], nom: rt.dataset.retirer }), credentials: "same-origin" });
      if (!r.ok) alert((await r.json().catch(() => ({}))).erreur || "Erreur"); loadFiles(); return; }
    if (t.closest("[data-publier]")) { const r = await fetch("/api/publier", { method: "POST", credentials: "same-origin" }); const j = await r.json().catch(() => ({})); if (!r.ok) { alert(j.erreur || "Erreur"); return; } pollJob(false); return; }
    const cm = t.closest("[data-cpt-mdp]"); if (cm) { const m = prompt(`Nouveau mot de passe pour « ${cm.dataset.cptMdp} » (8 caractères au moins) :`); if (!m) return; try { await cptPost({ action: "modifier", identifiant: cm.dataset.cptMdp, mot_de_passe: m }); alert("Mot de passe modifié : communiquez-le à la personne concernée."); } catch (err) { alert(err.message); } return; }
    const ca = t.closest("[data-cpt-act]"); if (ca) { try { await cptPost({ action: "modifier", identifiant: ca.dataset.cptAct, actif: ca.dataset.v === "1" }); pageComptesLoad(); } catch (err) { alert(err.message); } return; }
    const cd = t.closest("[data-cpt-del]"); if (cd) { if (!confirm(`Supprimer le compte « ${cd.dataset.cptDel} » ?`)) return; try { await cptPost({ action: "supprimer", identifiant: cd.dataset.cptDel }); pageComptesLoad(); } catch (err) { alert(err.message); } return; }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "zone-select") { S.zone = t.value || null; render(); return; }
    if (t.id === "pb-to") { if (t.value && t.value >= firstDate && t.value <= lastDate) { S.date = t.value; if (S.preset === "custom") { if (S.from > S.date) S.from = S.date; } else applyPreset(); } render(); return; }
    if (t.id === "pb-from") { if (t.value) { S.from = t.value > S.date ? S.date : t.value; S.preset = "custom"; } render(); return; }
    if (t.dataset.openzs !== undefined && t.value) { location.href = openZS(t.value); return; }
    if (t.dataset.state) { S[t.dataset.state] = t.value; render(); return; }
    if (t.id === "up") upload(t.files);
    if (t.id === "cpt-role") { const z = $("#cpt-zone"); if (z) { z.disabled = t.value === "province"; z.required = t.value === "zs"; } }
    if (t.dataset.cptZone) { const id = t.dataset.cptZone; if (!confirm(`Rattacher le compte « ${id} » à la zone de santé de ${t.value} ? Il ne verra plus que les données de cette zone.`)) { pageComptesLoad(); return; }
      cptPost({ action: "modifier", identifiant: id, zone: t.value }).then(() => pageComptesLoad()).catch(err => { alert(err.message); pageComptesLoad(); }); return; }
  });
  document.addEventListener("input", e => {
    const f = e.target.form; if (!f || f.id !== "f-cpt" || !["identifiant", "nom"].includes(e.target.name)) return;
    const z = f.zone; if (!z || (z.value && !z.dataset.auto)) return;
    const g = guessZone(f.identifiant.value.replace(/[-_.]/g, " ") + " " + f.nom.value);
    if (g) { z.value = g.nom; z.dataset.auto = "1"; } else if (z.dataset.auto) { z.value = ""; }
  });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "f-cpt") return;
    e.preventDefault();
    const f = e.target, msg = $("#cpt-msg");
    try {
      const c = await cptPost({ action: "creer", role: f.role.value, zone: f.role.value === "zs" ? f.zone.value : null, identifiant: f.identifiant.value, nom: f.nom.value, mot_de_passe: f.mot_de_passe.value });
      msg.className = "msg ok"; msg.textContent = `Compte « ${c.compte.identifiant} » créé (${c.compte.role === "zs" ? "zone de santé de " + c.compte.zone : "province"}).`; f.reset(); delete f.zone.dataset.auto; pageComptesLoad();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
  });
  document.addEventListener("dragover", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  document.addEventListener("dragleave", e => { const d = e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); upload(e.dataTransfer.files); } });

  /* ------------------------------------------------------------------ démarrage : session (outil local) puis rendu */
  if (SERVED) {
    fetch("/api/session", { credentials: "same-origin" }).then(r => r.json()).then(s => {
      if (!s.connecte) { location.href = "connexion.html"; return; }
      USER = s; render();
      fetch("/api/etat", { credentials: "same-origin" }).then(r => r.json()).then(j => { if (j.running) { if (S.page !== "donnees" && j.type === "analyse") { S.page = "donnees"; render(); } pollJob(); } }).catch(() => {});
    }).catch(() => render());
  } else render();
})();
