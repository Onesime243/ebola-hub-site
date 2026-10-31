/* Ebola Outbreak, outil de la zone de santé : tableau de bord
   Identité de l'outil national (menu bleu marine, mêmes couleurs, mode clair / sombre).
   Filtres globaux : période d'analyse (du … au …, préréglages 7 j à Tout) et aire de santé. */
(function () {
  "use strict";
  const D = window.ZS_DATA;
  const Ch = window.HubCharts;
  document.addEventListener("click", e => {   // carte de rapport + commentaire dans un seul PNG
    const mp = e.target.closest("[data-map-png]"); if (!mp) return;
    const card = mp.closest(".map-card"), img = card && card.querySelector("img.map-img");
    if (img) { img.loading = "eager"; Ch.mapCaptionPNG(img, card.querySelector(".map-cap"), mp.dataset.mapFile).catch(() => {}); }
  });
  const { nf, esc } = G;
  const col = Ch.col;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  /* copies datées des fichiers chargés (dossier archives/AAAA-MM-JJ de la zone) */
  const archivesHTML = arr => arr && arr.length ? `<details class="archives" style="margin-top:12px"><summary><b>Copies datées</b> <span class="muted small">— une copie de chaque fichier chargé est gardée dans le dossier archives/&lt;date du jour&gt;</span></summary><div class="table-wrap files-tbl"><table><thead><tr><th>Date de chargement</th><th>Fichiers</th></tr></thead><tbody>${arr.map(a => `<tr><td style="white-space:nowrap">${esc(a.date.split("-").reverse().join("/"))}</td><td>${a.fichiers.map(esc).join("<br>")}</td></tr>`).join("")}</tbody></table></div></details>` : "";
  const filesHTML = r => (r.fichiers && r.fichiers.length ? `<div class="table-wrap files-tbl"><table><thead><tr><th>Fichiers présents dans le dossier de la zone</th><th class="num">Taille</th><th>Déposé le</th></tr></thead><tbody>${r.fichiers.map(f => `<tr><td>${esc(f.nom)}</td><td class="num">${nf(f.taille / 1e6, 1)} Mo</td><td>${esc(f.modifie)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">Aucun fichier déposé pour l'instant.</p>`) + archivesHTML(r.archives);
  if (!D) { sansAnalyse(); return; }
  window.ZS_FOOT = `ZS ${D.meta.zone_de_sante} · Ebola Outbreak, outil provincial`;
  const OUT = "../sortie/zs/" + encodeURIComponent(D.meta.zone_de_sante) + "/";   // rapports, classeurs et cartes de la zone
  const NIV_PROV = D.meta.niveau === "province";   // analyse provinciale détaillée : les unités sont les zones de santé
  /* vocabulaire : en vue provinciale, « aire de santé » devient « zone de santé » (textes, tableaux, graphiques) */
  function relabel(root) {
    if (!NIV_PROV || !root) return;
    const rep = t => t.replace(/aires de santé/g, "zones de santé").replace(/Aires de santé/g, "Zones de santé").replace(/aire de santé/g, "zone de santé").replace(/Aire de santé/g, "Zone de santé")
      .replace(/par aire\b/g, "par zone").replace(/Toute la zone de santé/g, "Toute la province").replace(/toute la zone de santé/g, "toute la province").replace(/de la zone de santé/g, "de la province")
      .replace(/ZS Province/g, "Province").replace(/[Zz]one de santé de Province/g, "Province");
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const v = rep(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    root.querySelectorAll("[title],[placeholder],[aria-label]").forEach(e => ["title", "placeholder", "aria-label"].forEach(a => { const v = e.getAttribute(a); if (v) e.setAttribute(a, rep(v)); }));
  }
  const PROV = window.NK_PROVINCE || null;
  let USER = window.NK_EN_LIGNE || null;   // version en ligne : compte connecté (en_ligne.js)
  const canUp = () => !!USER && (USER.role === "province" || USER.zone === D.meta.zone_de_sante);

  /* ------------------------------------------------------------------ données de base */
  const AIRES = D.aires || [];
  const AN = Object.fromEntries(AIRES.map(a => [a.cle, a.nom]));
  const AINFO = Object.fromEntries(AIRES.map(a => [a.cle, a]));
  const SU = D.suivi || null;
  const DATES = SU ? SU.dates : [];
  const C = D.cibles || {};
  const rowsToObj = blk => blk ? blk.rows.map(r => Object.fromEntries(blk.cols.map((c, i) => [c, r[i]]))) : [];
  const CAS = rowsToObj(D.cas);
  const CT = rowsToObj(D.contacts_liste);
  const SBC = rowsToObj(D.sbc);
  const RA = rowsToObj(D.ra);
  const day = s => s ? new Date(s + "T00:00:00Z").getTime() / 864e5 : null;
  const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
  CT.forEach(c => { c._dlc = day(c.dlc); c._ent = day(c.ent); });
  CAS.forEach(c => { c._d = day(c.date); });
  SBC.forEach(r => { r._d = day(r.date); });
  RA.forEach(r => { r._d = day(r.date); });
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const dfr = (s, y = true) => { if (!s) return "—"; const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}${y ? " " + d.getUTCFullYear() : ""}`; };
  const dshort = s => { if (!s) return ""; const d = new Date(s + "T00:00:00Z"); return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`; };
  const pc = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? "—" : nf(v, d) + " %";
  const ratio = (a, b) => b ? 100 * a / b : null;
  const addDays = (s, n) => iso(day(s) + n);
  const days = (a, b) => Math.round(day(b) - day(a));
  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }

  /* ------------------------------------------------------------------ état */
  const lastDate = DATES.length ? DATES[DATES.length - 1] : D.meta.date_rapport;
  const firstDate = (() => { const a = [DATES[0], ...CAS.map(c => c.date)].filter(Boolean).sort(); return a[0] || lastDate; })();
  const S = { menu: false, page: "jour", date: lastDate, preset: "21", from: null, aire: null, cas: null,
              mapInd: "categorie", ctStat: "a_retrouver", supKind: "superviseur", tables: {} };
  S.from = addDays(S.date, -20);
  try {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("p")) S.page = h.get("p"); if (h.get("a")) S.aire = h.get("a"); if (h.get("c")) S.cas = h.get("c");
    if (h.get("d") && DATES.includes(h.get("d"))) S.date = h.get("d");
    if (h.get("per")) S.preset = h.get("per");
    if (h.get("du")) S.from = h.get("du"); else applyPreset();
  } catch (e) { /* adresse invalide : valeurs par défaut */ }
  function applyPreset() {
    if (S.preset === "tout") S.from = firstDate;
    else if (/^\d+$/.test(S.preset)) S.from = addDays(S.date, -(Number(S.preset) - 1));
    if (S.from > S.date) S.from = S.date;
  }
  const ti = () => DATES.indexOf(S.date);
  const W = () => days(S.from, S.date) + 1;                     // longueur de la période (jours)
  const inPer = d => !!d && d >= S.from && d <= S.date;

  /* ------------------------------------------------------------------ séries de suivi (date × aire) */
  const AIDX = SU ? Object.fromEntries(SU.aires.map((a, i) => [a, i])) : {};
  function sv(key, t = ti(), aire = S.aire) {
    if (!SU || t < 0 || !SU[key]) return 0;
    const row = SU[key][t];
    if (aire) return row[AIDX[aire]] ?? 0;
    return row.reduce((a, b) => a + b, 0);
  }

  /* ------------------------------------------------------------------ statut d'un contact pour un jour (mêmes règles que le pipeline) */
  const EXIT = { "2": "Décédé", "3": "Confirmé", "6": "Doublon", "R": "Recyclé", "T": "Transféré" };
  function status(c, t) {
    if (c._dlc === null || (c._ent !== null && c._ent > t)) return null;
    const k = t - c._dlc;
    if (k < 0 || k > 21) return null;
    const cd = c.codes;
    for (let j = 0; j < k; j++) if (EXIT[cd[j]]) return { k, sortie: EXIT[cd[j]], j };
    if (k === 0) return { k, st: "En attente" };
    const cur = cd[k - 1], p1 = k >= 2 ? cd[k - 2] : null, p2 = k >= 3 ? cd[k - 3] : null;
    let any0 = false, allz = true;
    for (let j = 0; j < k; j++) { const x = cd[j]; if (x === "0") any0 = true; else if (x !== "-") { allz = false; break; } }
    if (allz && any0) return { k, st: "JMV" };
    let st = { "X": "Vu", "1": "Suspect", "4": "Refus", "5": "ReCo non passé", ".": "En attente", "?": "En attente", "-": "En attente" }[cur];
    if (cur === "0") st = (p1 === "0" && p2 === "0") ? "PDV" : "Absence";
    if (cur === "D") st = ((p1 === "0" && p2 === "0") || (p1 === "D" && (p2 === "0" || p2 === "D"))) ? "PDV" : "Déplacé";
    return { k, st: st || "En attente" };
  }
  const SEEN = new Set(["Vu", "Suspect"]);

  /* ------------------------------------------------------------------ cas, SBC, RA pour une date et une période */
  function casStats(aire, t) {
    const L = CAS.filter(c => !c.hors_zs && c._d !== null && c._d <= t && (!aire || c.aire === aire));
    const n7 = L.filter(c => c._d > t - 7).length, n7p = L.filter(c => c._d > t - 14 && c._d <= t - 7).length;
    const r21 = L.filter(c => c._d > t - 21);
    const last = L.length ? Math.max(...L.map(c => c._d)) : null;
    const kn = r21;   // « contact connu » vide = non documenté : compté comme non connu
    const di = r21.map(c => c.d_isol).filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
    return { n: L.length, n7, n7p, n21: r21.length, deces: L.filter(c => c.deces).length, last, jours: last === null ? null : t - last,
             connus: kn.length ? 100 * kn.filter(c => c.connu === true || c.src).length / kn.length : null, d_isol: di.length ? di[Math.floor(di.length / 2)] : null };
  }
  function categorie(cs) {
    if (!cs.n) return "Non touchée";
    if (cs.jours <= 7) return "Rouge";
    if (cs.jours <= 21) return "Orange";
    if (cs.jours <= 42) return "Jaune";
    return "Verte";
  }
  const CATCOL = { "Rouge": "#c8452f", "Orange": "#e0893a", "Jaune": "#e8c23a", "Verte": "#5aa267", "Non touchée": "#d5dad3" };
  const CATDEF = { "Rouge": "cas notifié dans les 7 derniers jours", "Orange": "dernier cas il y a 8 à 21 jours", "Jaune": "dernier cas il y a 22 à 42 jours", "Verte": "plus de 42 jours sans cas", "Non touchée": "aucun cas" };
  function sum(rows, k) { return rows.reduce((s, r) => s + (+r[k] || 0), 0); }
  function sbcStats(aire, t, w) {
    const L = SBC.filter(r => r._d <= t && r._d > t - w && (!aire || r.aire === aire));
    const rep = L.filter(r => r.rapporte);
    const nd = new Set(L.map(r => r._d)).size || w;
    const cacP = aire ? (AINFO[aire]?.cac || 0) : AIRES.reduce((s, a) => s + (a.cac || 0), 0);
    const alerts = sum(L, "alertes_total") || (sum(L, "alertes_malades") + sum(L, "alertes_deces"));
    return { rows: L, jours_rapportes: rep.length, cac_moy: nd ? sum(L, "cac") / nd : 0, cac_pct: cacP ? ratio(sum(L, "cac") / nd, cacP) : null,
             menages: sum(L, "menages"), alertes: alerts, malades: sum(L, "alertes_malades"), deces: sum(L, "alertes_deces"), investiguees: sum(L, "investiguees"), validees: sum(L, "validees"),
             inv_pct: alerts ? ratio(sum(L, "investiguees"), alerts) : null, sensibilises: sum(L, "sensibilises"), fosa: sum(L, "orientes_fosa"), cte: sum(L, "orientes_cte"),
             vaccines: sum(L, "vaccines_m") + sum(L, "vaccines_f"), swabes: sum(L, "deces_comm_swabes"), eds: sum(L, "deces_comm_eds"), resistances: sum(L, "resistances_levees"),
             visiteurs: sum(L, "visiteurs") };
  }
  function raStats(aire, t, w) {
    const L = RA.filter(r => r._d <= t && r._d > t - w && (!aire || r.aire === aire));
    const pl = sum(L, "planifiees"), vi = sum(L, "visitees"), rep = sum(L, "repondant");
    return { rows: L, jours: L.filter(r => r.rapporte).length, planifiees: pl, visitees: vi, vis_pct: pl ? ratio(vi, pl) : null,
             personnes: sum(L, "personnes"), connait_systeme: sum(L, "connait_systeme"), connait_numero: sum(L, "connait_numero"), connait_def: sum(L, "connait_def"), affichage: sum(L, "affichage"),
             consultations: sum(L, "consultations"), repondant: rep, investigues: sum(L, "investigues"), valides: sum(L, "valides"), ct_cte: sum(L, "ct_cte"),
             isolement: sum(L, "isolement"), refus: sum(L, "refus"), preleves: sum(L, "preleves"), evades: sum(L, "evades"), non_retrouves: sum(L, "non_retrouves"),
             inv_pct: rep ? ratio(sum(L, "investigues"), rep) : null };
  }

  /* ------------------------------------------------------------------ bulletin : feux tricolores par pilier */
  const lvl = (v, ok, warn, higher = true) => v === null || v === undefined || !isFinite(v) ? "na" : higher ? (v >= ok ? "ok" : v >= warn ? "warn" : "bad") : (v <= ok ? "ok" : v <= warn ? "warn" : "bad");
  const worst = (...l) => l.includes("bad") ? "bad" : l.includes("warn") ? "warn" : l.includes("ok") ? "ok" : "na";
  function bulletin(aire, t) {
    const cs = casStats(aire, t), ti_ = DATES.indexOf(iso(t));
    const as = sv("a_suivre", ti_, aire), vus = sv("vus", ti_, aire), pdv = sv("pdv", ti_, aire), jmv = sv("jmv", ti_, aire);
    const taux = as ? 100 * vus / as : null;
    const sb = sbcStats(aire, t, 7), ra = raStats(aire, t, 7);
    const fCas = cs.n21 ? worst(lvl(cs.connus, C.cas_connus_contacts_pct, 50), lvl(cs.d_isol, C.delai_isolement_j, C.delai_isolement_j + 2, false)) : "na";
    const fSui = as ? worst(lvl(taux, C.taux_suivi_pct, 75), pdv > 0 ? (pdv > 10 ? "bad" : "warn") : "ok") : "na";
    const fSbc = sb.rows.length ? worst(lvl(sb.cac_pct, C.cac_actifs_pct, 50), lvl(sb.inv_pct, 95, 70)) : "na";
    const fRa = ra.rows.length && ra.planifiees ? worst(lvl(ra.vis_pct, C.ra_structures_visitees_pct, 70), lvl(ra.inv_pct, 95, 70)) : "na";
    return { cs, cat: categorie(cs), as, vus, taux, pdv, jmv, sb, ra, feux: [fCas, fSui, fSbc, fRa] };
  }
  const FEUX = ["Cas", "Suivi", "SBC", "RA"];

  /* ------------------------------------------------------------------ composants (mêmes que l'outil national) */
  const POST = [];
  const after = fn => POST.push(fn);
  const scope = () => S.aire ? `Aire de santé de ${AN[S.aire]}` : `Toute la zone de santé`;
  const perTxt = () => `du ${dfr(S.from)} au ${dfr(S.date)} (${W()} j)`;
  function panel(title, sub, body, o = {}) {
    const tools = (o.tools || "") + (o.png ? `<button class="btn sm" data-png="${esc(o.png)}" title="Télécharger PNG">⤓ PNG</button>` : "") + (o.csv ? `<button class="btn sm" data-csv="${esc(o.csv)}" title="Exporter CSV">⤓ CSV</button>` : "");
    return `<section class="panel ${o.cls || ""}" ${o.id ? `id="${o.id}"` : ""}><div class="panel-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><div class="panel-tools">${tools}</div></div>${body}</section>`;
  }
  const box = (title, sub, body, tools = "") => panel(title, sub, body, { tools });
  function kpi(label, value, note, o = {}) {
    return `<div class="kpi ${o.cls || ""} ${o.go ? "clickable" : ""}" ${o.go ? `data-go="${o.go}"` : ""}><div class="label">${o.color ? `<i class="dot" style="background:${col(o.color)}"></i>` : ""}${label}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ""}${o.meter !== undefined && o.meter !== null ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, o.meter))}%;background:${col(o.meterColor || "--brand-2")}"></i></div>` : ""}</div>`;
  }
  const badge = (text, cls = "", dot) => `<span class="badge ${cls}">${dot ? `<i style="background:${col(dot)}"></i>` : ""}${esc(text)}</span>`;
  function legend(items) { return `<div class="legend">${items.map(x => `<span><i class="${x.round ? "round" : ""}" style="background:${col(x.c)}"></i>${esc(x.t)}${x.n !== undefined ? ` <b>${nf(x.n)}</b>` : ""}</span>`).join("")}</div>`; }
  const segBtns = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(S[key]) === String(v) ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const pngBtn = name => `<button class="btn sm" data-png="${esc(name)}">⤓ PNG</button>`;
  const csvBtn = id => `<button class="btn sm" data-csv="${esc(id)}">⤓ CSV</button>`;
  const pill = (txt, cls) => `<span class="pill ${cls || ""}">${esc(txt)}</span>`;
  const feuPill = (v, ok, warn, higher = true, fmt = x => pc(x, 0)) => pill(fmt(v), lvl(v, ok, warn, higher));
  const strip = items => `<div class="strip">${items.map(([v, k, s, c]) => `<div><div class="v ${c || ""}">${v}</div><div class="k">${k}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`).join("")}</div>`;

  /* ---- tableau simple (rapports) */
  const TABLES = {};
  function tableHTML(id, cols, rows, opt = {}) {
    TABLES[id] = { cols, rows, name: opt.name || id };
    const sorted = rows.slice();
    if (opt.sort) { const j = cols.findIndex(c => c.k === opt.sort); if (j >= 0) sorted.sort((a, b) => ((b[opt.sort] ?? -1e9) > (a[opt.sort] ?? -1e9) ? 1 : -1) * (opt.dir || 1)); }
    const cell = (c, r) => { const v = r[c.k]; const h = c.f ? c.f(v, r) : (typeof v === "number" ? nf(v, c.d || 0) : esc(v ?? "—")); return `<td class="${c.num || typeof v === "number" ? "num" : ""} ${c.wrap ? "wrap" : ""}">${h}</td>`; };
    const lim = opt.limit || 400;
    return `<div class="tbl-wrap" style="${opt.maxh ? `max-height:${opt.maxh}px` : ""}"><table><thead><tr>${cols.map(c => `<th class="${c.num ? "num" : ""}">${c.t}</th>`).join("")}</tr></thead><tbody>
      ${sorted.slice(0, lim).map(r => `<tr class="${opt.click ? "click" : ""} ${opt.sel && opt.sel(r) ? "sel" : ""}" ${opt.click ? `data-row="${esc(opt.click(r))}"` : ""}>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")}
      ${opt.total ? `<tr class="total">${cols.map(c => cell(c, opt.total)).join("")}</tr>` : ""}</tbody></table></div>
      ${sorted.length > lim ? `<p class="note">${nf(sorted.length - lim)} lignes supplémentaires : téléchargez le CSV pour la liste complète.</p>` : ""}`;
  }
  /* ---- tableau triable avec recherche (analyses de transmission, comme l'outil national) */
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const TABLESN = {};
  function table(id, rows, cols, o = {}) {
    const st = S.tables[id] || (S.tables[id] = { sort: o.sort || null, dir: o.dir || -1, limit: o.limit || 60, q: "" });
    let r = rows;
    if (st.q) { const q = norm(st.q); r = r.filter(x => cols.some(c => norm(x[c.k]).includes(q)) || norm(o.searchText ? o.searchText(x) : "").includes(q)); }
    if (st.sort) { const c = cols.find(c => c.k === st.sort); if (c) { const f = c.sortv || (x => x[c.k]); r = [...r].sort((a, b) => { const va = f(a), vb = f(b); if (va === vb) return 0; if (va === null || va === undefined || va === "") return 1; if (vb === null || vb === undefined || vb === "") return -1; return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * st.dir; }); } }
    TABLESN[id] = { rows: r, cols };
    const shown = r.slice(0, st.limit);
    const head = cols.map(c => `<th class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}" data-sort="${id}|${c.k}">${esc(c.t)}${st.sort === c.k ? `<span class="arrow">${st.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("");
    const body = shown.map(x => `<tr class="${o.rowClick ? "clickable" : ""} ${o.selected && o.selected(x) ? "selected" : ""}" ${o.rowClick ? `data-trow="${id}|${esc(o.rowKey(x))}"` : ""}>${cols.map(c => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}">${c.v ? c.v(x) : (c.num ? nf(x[c.k], c.d || 0) : esc(x[c.k] ?? "—"))}</td>`).join("")}</tr>`).join("");
    const bar = o.search !== false ? `<div class="table-bar"><input type="search" data-tsearch="${id}" placeholder="Filtrer le tableau…" value="${esc(st.q)}"><span class="count">${nf(r.length)} lignes</span></div>` : "";
    return `${bar}<div class="table-wrap" style="${o.maxh ? `max-height:${o.maxh}px` : ""}"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Aucune ligne</td></tr>`}</tbody></table></div>${r.length > shown.length ? `<button class="btn sm more" data-more="${id}">Afficher plus (${nf(r.length - shown.length)})</button>` : ""}`;
  }
  function csvN(id) {
    const t = TABLESN[id]; if (!t) return;
    const strip_ = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    G.csv(`${id}_${D.meta.zone_de_sante}_${S.date}`, t.cols.map(c => c.t), t.rows.map(x => t.cols.map(c => strip_(c.csv ? c.csv(x) : c.v ? c.v(x) : x[c.k]))));
  }

  /* ================================================================== VUE GÉNÉRALE */
  function pageJour() {
    const t = ti(), td = day(S.date);
    if (!SU) return pageJourSansSuivi();
    const g = k => sv(k, t);
    const as = g("a_suivre"), vus = g("vus"), taux = ratio(vus, as);
    const yest = t > 0 ? sv("a_suivre", t - 1) : null;
    const cs = casStats(S.aire, td);
    const sorties = g("fin21") + g("sortie_doublon") + g("sortie_recycle") + g("sortie_confirme") + g("sortie_decede") + g("sortie_transfere");
    const casPer = CAS.filter(c => !c.hors_zs && inPer(c.date) && (!S.aire || c.aire === S.aire));
    const connus = casPer.length ? 100 * casPer.filter(c => c.connu === true || c.src).length / casPer.length : null;
    const tiles = `<div class="grid g5">
      ${kpi("Contacts à suivre", nf(as), yest !== null ? `${as - yest >= 0 ? "+" : ""}${nf(as - yest)} depuis la veille · ${nf(g("nouveaux"))} nouveaux` : "", { color: "--s1" })}
      ${kpi("Taux de suivi des contacts", pc(taux), `${nf(vus)} / ${nf(as)} vus (du jour) · cible ${C.taux_suivi_pct} %`, { color: "--st-v24", cls: taux !== null && taux < C.taux_suivi_pct ? "alert" : "good", meter: taux, meterColor: taux < C.taux_suivi_pct ? "--critical" : "--good" })}
      ${kpi("Perdus de vue (≥ 72 h)", nf(g("pdv")), `${nf(g("jmv"))} jamais vus · ${nf(g("absence") + g("reco"))} absences du jour`, { cls: g("pdv") ? "alert" : "good", color: "--st-nv", go: "contacts" })}
      ${kpi("Cas sur la période", nf(casPer.length), `${perTxt()} · ${nf(casPer.filter(c => c.deces).length)} décès`, { color: "--s2", go: "cas" })}
      ${kpi("Cas connus comme contacts", pc(connus, 0), `${nf(casPer.filter(c => c.connu === true || c.src).length)} / ${nf(casPer.length)} cas de la période : « contact connu » ou retrouvés dans une liste de contacts · cible ${C.cas_connus_contacts_pct} %`, { cls: connus !== null && connus < C.cas_connus_contacts_pct ? "alert" : "", color: "--st-conf", meter: connus })}
    </div>`;
    const lead = `Le ${dfr(S.date)}, <b>${nf(vus)} contacts vus sur ${nf(as)} à suivre</b> (${pc(taux)}) ; ${nf(g("pdv"))} perdus de vue et ${nf(g("jmv"))} jamais vus restent à retrouver. `
      + (cs.n7 ? `<b>${nf(cs.n7)} cas</b> notifiés ces 7 derniers jours (${nf(cs.n7p)} la semaine précédente).` : cs.n ? `Aucun cas ces 7 derniers jours ; dernier cas le ${dfr(iso(cs.last))}.` : "Aucun cas notifié.");
    const list = S.aire ? [S.aire] : AIRES.map(a => a.cle);
    const rows = list.map(a => {
      const v = k => sv(k, t, a), vprev = t > 0 ? sv("a_suivre", t - 1, a) : null;
      const s_ = v("a_suivre");
      return { aire: AN[a] || a, report: vprev, nouveaux: v("nouveaux"), a_suivre: s_, vus: v("vus"), taux: ratio(v("vus"), s_), fin21: v("fin21"),
               autres_sorties: v("sortie_doublon") + v("sortie_recycle") + v("sortie_confirme") + v("sortie_decede") + v("sortie_transfere"),
               suspects: v("suspects_du_jour"), jmv: v("jmv"), absence: v("absence") + v("reco"), pdv: v("pdv"), refus: v("refus"), deplace: v("deplace"),
               attente: v("attente"), reste: s_ - v("fin21"), vacc: ratio(v("vaccines"), s_), _k: a };
    }).filter(r => S.aire || r.a_suivre || r.vus || r.nouveaux || r.fin21);
    const tot = {}; ["report", "nouveaux", "a_suivre", "vus", "fin21", "autres_sorties", "suspects", "jmv", "absence", "pdv", "refus", "deplace", "attente", "reste"].forEach(k => tot[k] = rows.reduce((s, r) => s + (r[k] || 0), 0));
    tot.aire = "Total"; tot.taux = ratio(tot.vus, tot.a_suivre); tot.vacc = ratio(sv("vaccines", t), sv("a_suivre", t));
    const cols = [{ k: "aire", t: "Aire de santé" }, { k: "report", t: "Report (veille)", num: 1 }, { k: "nouveaux", t: "Nouveaux", num: 1 }, { k: "a_suivre", t: "À suivre", num: 1 },
      { k: "vus", t: "Vus", num: 1 }, { k: "taux", t: "Taux de suivi", num: 1, f: v => feuPill(v, C.taux_suivi_pct, 75) }, { k: "fin21", t: "Fin 21 j", num: 1 }, { k: "autres_sorties", t: "Autres sorties", num: 1 },
      { k: "suspects", t: "Devenus suspects", num: 1 }, { k: "jmv", t: "Jamais vus", num: 1 }, { k: "absence", t: "Absences", num: 1 }, { k: "pdv", t: "PDV", num: 1 },
      { k: "refus", t: "Refus", num: 1 }, { k: "deplace", t: "Déplacés", num: 1 }, { k: "attente", t: "En attente", num: 1 }, { k: "reste", t: "Reste à suivre demain", num: 1 },
      { k: "vacc", t: "Vaccinés", num: 1, f: v => pc(v, 0) }];
    const idx = []; for (let i = Math.max(0, DATES.indexOf(S.from) >= 0 ? DATES.indexOf(S.from) : 0); i <= t; i++) idx.push(i);
    after(() => {
      G.lines($("#c-taux"), { labels: idx.map(i => DATES[i]), series: [{ label: "Taux de suivi", color: col("--s1"), values: idx.map(i => ratio(sv("vus", i), sv("a_suivre", i))) }],
        pct: 1, max: 100, target: C.taux_suivi_pct, fmtX: (d, l) => l ? dfr(d) : dshort(d), digits: 1 });
      G.bars($("#c-nonvus"), { labels: idx.map(i => DATES[i]), series: [{ label: "PDV", color: col("--s2"), values: idx.map(i => sv("pdv", i)) }, { label: "Jamais vus", color: col("--s7"), values: idx.map(i => sv("jmv", i)) },
        { label: "Absences", color: col("--st-nv"), values: idx.map(i => sv("absence", i) + sv("reco", i)) }], fmtX: (d, l) => l ? dfr(d) : dshort(d) });
      epiCurve($("#c-epi-ov"), CAS.filter(c => !c.hors_zs && (!S.aire || c.aire === S.aire) && c.date && c.date <= S.date));
    });
    return `<p class="lead">${lead}</p>${tiles}
      <div class="grid g21">
        ${panel("Courbe épidémique hebdomadaire", "Cas confirmés et probables par semaine de confirmation (ou d'isolement), décès en rouge foncé", `<div id="c-epi-ov"></div>`, { png: "courbe_epidemique" })}
        ${panel("Points d'attention", "Générés automatiquement à partir des données du jour", alertsHTML())}
      </div>
      ${panel(`Rapport de suivi des contacts du ${dfr(S.date)}`, "Recalculé à partir de la grille J1–J21 ; taux de suivi = contacts vus (dont suspects) / contacts à suivre ; absences = absence simple + ReCo non passé ; PDV = non vu depuis au moins 3 jours.",
        tableHTML("t-rapport", cols, rows, { total: S.aire ? null : tot, click: r => r._k, name: `rapport_suivi_${S.date}` }), { csv: "t-rapport" })}
      <div class="grid g2">
        ${panel("Taux de suivi quotidien", `Période ${perTxt()}`, `<div id="c-taux"></div>`, { png: "taux_suivi" })}
        ${panel("Contacts non vus", "Perdus de vue, jamais vus et absences, par jour", `<div id="c-nonvus"></div>`, { png: "contacts_non_vus" })}
      </div>`;
  }
  /* vue générale d'une zone sans base de suivi des contacts : cas, alertes et suspects ; suivi agrégé de la base provinciale */
  function pageJourSansSuivi() {
    const td = day(S.date), cs = casStats(S.aire, td);
    const casPer = CAS.filter(c => !c.hors_zs && inPer(c.date) && (!S.aire || c.aire === S.aire));
    const dec = casPer.filter(c => c.deces).length;
    const N = rowsToObj(D.notif).filter(r => !r.hors_zs && inPer(r.notif) && (!S.aire || r.aire === S.aire));
    const pre = N.filter(r => r.preleve), res = pre.filter(r => r.resultat === "Positif" || r.resultat === "Négatif");
    const spv = rowsToObj(D.suivi_prov).filter(r => r.date <= S.date), sl = spv[spv.length - 1];
    const su = sl ? { date: sl.date, a_suivre: sl.a_suivre, vus: sl.vus, jmv: sl.jmv, taux: ratio(sl.vus, sl.a_suivre) } : null;
    const di = casPer.map(c => c.d_isol).filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
    after(() => epiCurve($("#c-epi-ov"), CAS.filter(c => !c.hors_zs && (!S.aire || c.aire === S.aire) && c.date && c.date <= S.date)));
    const src = D.meta.cas_origine || "liste des cas";
    return `<p class="lead">${cs.n7 ? `<b>${nf(cs.n7)} cas confirmés</b> ces 7 derniers jours (${nf(cs.n7p)} la semaine précédente)` : cs.n ? `Aucun cas ces 7 derniers jours ; dernier cas le ${dfr(iso(cs.last))}` : "Aucun cas confirmé"} ; ${nf(casPer.length)} cas ${perTxt()}, dont ${nf(dec)} décès. Source des cas : ${esc(src)}.</p>
      <div class="grid g5">
        ${kpi("Cas sur la période", nf(casPer.length), `${perTxt()} · ${nf(dec)} décès`, { color: "--s2", go: "cas" })}
        ${kpi("Cas en 7 jours", nf(cs.n7), `${nf(cs.n7p)} les 7 jours précédents · ${nf(cs.n21)} en 21 j`, { color: "--st-conf", cls: cs.n7 > cs.n7p ? "alert" : "" })}
        ${N.length ? kpi("Alertes et suspects notifiés", nf(N.length), `${nf(pre.length)} prélevés · positivité ${pc(ratio(res.filter(r => r.resultat === "Positif").length, res.length), 1)}`, { color: "--s1", go: "notif" })
          : kpi("Létalité", pc(ratio(cs.deces, cs.n), 1), `${nf(cs.deces)} décès sur ${nf(cs.n)} cas depuis le début`, { color: "--rc-rt" })}
        ${kpi("Délai début des signes → isolement", di.length ? nf(di[Math.floor(di.length / 2)]) + " j" : "—", `médiane des cas de la période · cible ≤ ${C.delai_isolement_j} j`, { color: "--s4", cls: di.length && di[Math.floor(di.length / 2)] > C.delai_isolement_j ? "alert" : "" })}
        ${su ? kpi("Suivi des contacts (base provinciale)", pc(su.taux, 0), `${nf(su.vus)} / ${nf(su.a_suivre)} vus le ${dfr(su.date)} · ${nf(su.jmv)} jamais vus`, { color: "--st-v24", cls: su.taux !== null && su.taux < C.taux_suivi_pct ? "alert" : "good", meter: su.taux })
          : kpi("Suivi des contacts", "—", "Déposez la base de suivi des contacts de la zone", { color: "--st-v24" })}
      </div>
      <div class="grid g21">
        ${panel("Courbe épidémique hebdomadaire", "Cas confirmés par semaine de confirmation, décès en rouge foncé", `<div id="c-epi-ov"></div>`, { png: "courbe_epidemique" })}
        ${panel("Données de la zone", "Fichiers utilisés pour cette analyse", `<div class="alerts">${Object.values(D.meta.sources || {}).map(v => `<div class="alert-item info"><span class="ic">i</span><div><b>${esc(v.libelle)}</b><br>${esc(v.fichier)}${v.jusqu_au ? ` · données jusqu'au ${dfr(v.jusqu_au)}` : ""}</div></div>`).join("") || `<div class="alert-item warn"><span class="ic">!</span><div>Aucun fichier déposé par la zone : les cas viennent de la liste labo provinciale.</div></div>`}
          ${!D.suivi ? `<div class="alert-item warn"><span class="ic">!</span><div>Sans base de suivi des contacts, les vues « Suivi des contacts », « Cas index », « Parcours » et « Chaînes de transmission » ne sont pas disponibles.</div></div>` : ""}</div>`)}
      </div>`;
  }
  function epiCurve(el_, L) {
    const wk = {}; L.forEach(c => { const w = c._d - ((new Date(c._d * 864e5).getUTCDay() + 6) % 7); wk[w] = wk[w] || { v: 0, d: 0 }; wk[w][c.deces ? "d" : "v"]++; });
    const ks = Object.keys(wk).map(Number); if (!ks.length) { el_.innerHTML = `<div class="empty">Aucun cas</div>`; return; }
    const t = day(S.date), w0 = Math.max(Math.min(...ks), day(S.from) - ((new Date(day(S.from) * 864e5).getUTCDay() + 6) % 7)), w1 = t - ((new Date(t * 864e5).getUTCDay() + 6) % 7);
    const weeks = []; for (let w = w0; w <= w1; w += 7) weeks.push(w);
    G.bars(el_, { labels: weeks.map(iso), series: [{ label: "Décédés", color: col("--rc-rt"), values: weeks.map(w => wk[w]?.d || 0) }, { label: "Vivants", color: col("--s2"), values: weeks.map(w => wk[w]?.v || 0) }], fmtX: (d, l) => (l ? "Semaine du " + dfr(d) : dshort(d)) });
  }
  function alertsHTML() {
    const t = ti(), td = day(S.date), it = [];
    const pdvBy = AIRES.map(a => [a.nom, sv("pdv", t, a.cle)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    if (sv("pdv", t)) it.push(["crit", `<b>${nf(sv("pdv", t))} contacts perdus de vue (non vus depuis 3 jours ou plus)</b>${S.aire ? "" : ", " + pdvBy.slice(0, 3).map(x => `${esc(x[0])} (${nf(x[1])})`).join(", ")}.`]);
    const taux = ratio(sv("vus", t), sv("a_suivre", t));
    if (taux !== null && taux < C.taux_suivi_pct) it.push([taux < 75 ? "crit" : "warn", `<b>Taux de suivi ${pc(taux)}</b> sous la cible de ${C.taux_suivi_pct} %.`]);
    if (sv("jmv", t)) it.push(["warn", `<b>${nf(sv("jmv", t))} contacts jamais vus</b> depuis leur enregistrement.`]);
    const red = AIRES.filter(a => categorie(casStats(a.cle, td)) === "Rouge").map(a => a.nom);
    if (!S.aire && red.length) it.push(["crit", `<b>${red.length} aires de santé en rouge</b> (cas dans les 7 derniers jours) : ${red.slice(0, 6).map(esc).join(", ")}${red.length > 6 ? "…" : ""}.`]);
    const per = CAS.filter(c => !c.hors_zs && inPer(c.date) && (!S.aire || c.aire === S.aire));
    const noct = per.filter(c => !c.contacts).length;
    if (noct) it.push(["warn", `<b>${nf(noct)} cas de la période sans aucun contact listé</b> : investigation et listage à compléter.`]);
    const fin3 = CT.filter(c => (!S.aire || c.aire === S.aire) && c._dlc !== null && c._dlc + 21 > td && c._dlc + 21 <= td + 3 && status(c, td) && !status(c, td).sortie).length;
    if (fin3) it.push(["info", `${nf(fin3)} contacts terminent leur suivi dans les 3 prochains jours.`]);
    const TR = D.trans;
    if (TR) {
      const act = (TR.chains?.resume || []).filter(x => x.active_21j).length;
      if (act) it.push(["info", `${nf(act)} chaînes de transmission actives sur 21 jours (jusqu'à ${nf(TR.chains.stats.generations_max)} générations).`]);
      if (TR.liens?.a_verifier) it.push(["info", `${nf(TR.liens.a_verifier)} rapprochements contact → cas à vérifier (noms proches, non utilisés pour les chaînes).`]);
    }
    if (!it.length) it.push(["good", "Aucun signal particulier pour cette date."]);
    const ic = { crit: "!", warn: "!", info: "i", good: "✓" };
    return `<div class="alerts">${it.map(([c, h]) => `<div class="alert-item ${c}"><span class="ic">${ic[c]}</span><div>${h}</div></div>`).join("")}</div>`;
  }

  /* ================================================================== AIRES DE SANTÉ */
  function pageAires() {
    const t = day(S.date);
    const rows = AIRES.map(a => {
      const b = bulletin(a.cle, t), pop = a.population;
      return { aire: a.nom, cat: b.cat, cas: b.cs.n, cas7: b.cs.n7, cas21: b.cs.n21, inc: pop ? 1e4 * b.cs.n / pop : null, jours: b.cs.jours, deces: b.cs.deces,
               connus: b.cs.connus, as: b.as, taux: b.taux, pdv: b.pdv, jmv: b.jmv, cac: b.sb.cac_pct, inv: b.sb.inv_pct, ravis: b.ra.vis_pct, rainv: b.ra.inv_pct,
               feux: b.feux, pop, _k: a.cle };
    });
    const CO = ["Rouge", "Orange", "Jaune", "Verte", "Non touchée"];
    const cnt = Object.fromEntries(CO.map(c => [c, rows.filter(r => r.cat === c).length]));
    const cols = [{ k: "aire", t: "Aire de santé", f: (v, r) => `<span class="cat" style="background:${CATMAP[r.cat]}"></span>${esc(v)}` },
      { k: "feux", t: "Cas · Suivi · SBC · RA", f: v => `<span class="dots">${v.map(f => `<i class="dot ${f}"></i>`).join("")}</span>` },
      { k: "cas", t: "Cas (cumul)", num: 1 }, { k: "cas7", t: "Cas 7 j", num: 1 }, { k: "cas21", t: "Cas 21 j", num: 1 }, { k: "inc", t: "Incidence /10 000 hab.", num: 1, f: v => nf(v, 1) },
      { k: "jours", t: "Jours depuis le dernier cas", num: 1 }, { k: "connus", t: "Cas 21 j connus comme contacts", num: 1, f: v => feuPill(v, C.cas_connus_contacts_pct, 50) },
      { k: "as", t: "Contacts à suivre", num: 1 }, { k: "taux", t: "Taux de suivi", num: 1, f: v => feuPill(v, C.taux_suivi_pct, 75) }, { k: "pdv", t: "PDV", num: 1 }, { k: "jmv", t: "Jamais vus", num: 1 },
      { k: "cac", t: "CAC actifs (7 j)", num: 1, f: v => feuPill(v, C.cac_actifs_pct, 50) }, { k: "inv", t: "Alertes SBC investiguées", num: 1, f: v => feuPill(v, 95, 70) },
      { k: "ravis", t: "Structures RA visitées", num: 1, f: v => feuPill(v, C.ra_structures_visitees_pct, 70) }, { k: "rainv", t: "Alertes RA investiguées", num: 1, f: v => feuPill(v, 95, 70) }];
    after(() => drawMap($("#c-map")));
    after(() => {
      const t0 = ti(), i0 = Math.max(0, t0 - Math.min(W(), 90) + 1), idx = []; for (let i = i0; i <= t0; i++) idx.push(i);
      const act = AIRES.filter(a => idx.some(i => sv("a_suivre", i, a.cle) > 0));
      G.matrix($("#c-mat"), { cols: idx.map(i => DATES[i]), rows: act.map(a => ({ label: a.nom, values: idx.map(i => { const s_ = sv("a_suivre", i, a.cle); return s_ ? 100 * sv("vus", i, a.cle) / s_ : null; }) })),
        color: v => v >= C.taux_suivi_pct ? TL[0] : v >= 80 ? TL[1] : v >= 65 ? TL[2] : v >= 50 ? TL[3] : TL[4], fmtX: (d, l) => l ? dfr(d) : dshort(d), fmt: v => pc(v, 0) + " de contacts vus" });
    });
    return `<p class="lead">${CO.filter(c => cnt[c]).map(c => `<b>${cnt[c]}</b> en ${c.toLowerCase()}`).join(", ")} au ${dfr(S.date)}. Chaque feu compare l'aire aux cibles : cas connus comme contacts et délai d'isolement, taux de suivi et perdus de vue, fonctionnement des CAC et investigation des alertes, couverture de la recherche active.</p>
      <div class="grid32">
        ${box(`${(MAPIND.find(x => x[0] === S.mapInd) || MAPIND[0])[1]}`, D.geo ? MAPSUB + " · cliquez une aire pour filtrer toutes les vues" : "Carte schématique (positions non géographiques) : déposez les contours des aires de santé dans « Charger les données »",
          `<div class="filters"><label>Indicateur <select data-state="mapInd">${MAPIND.map(([k, l]) => `<option value="${k}" ${S.mapInd === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><div id="c-map"></div>`, pngBtn("carte_aires") + `<button class="btn sm" data-maprep>Carte (PNG rapport)</button>`)}
        ${box("Catégories", "Selon la date du dernier cas", `<table>${CO.map(c => `<tr><td><span class="cat" style="background:${CATMAP[c]}"></span>${c}</td><td>${CATDEF[c]}</td><td class="num"><b>${cnt[c]}</b></td></tr>`).join("")}</table>
          <h3 class="small" style="margin:16px 0 6px">Cibles utilisées</h3><table>
          <tr><td>Taux de suivi des contacts</td><td class="num">≥ ${C.taux_suivi_pct} %</td></tr><tr><td>Cas connus comme contacts</td><td class="num">≥ ${C.cas_connus_contacts_pct} %</td></tr>
          <tr><td>Délai début des signes → isolement</td><td class="num">≤ ${C.delai_isolement_j} j</td></tr><tr><td>CAC ayant travaillé</td><td class="num">≥ ${C.cac_actifs_pct} %</td></tr>
          <tr><td>Structures visitées (recherche active)</td><td class="num">≥ ${C.ra_structures_visitees_pct} %</td></tr></table><p class="note">Cibles modifiables dans config/zone_de_sante.json.</p>`)}
      </div>
      ${box("Bulletin par aire de santé", "Cliquez une ligne pour filtrer toutes les vues sur cette aire de santé", tableHTML("t-bulletin", cols, rows, { click: r => r._k, sel: r => r._k === S.aire, sort: "cas21", name: `bulletin_aires_${S.date}` }), csvBtn("t-bulletin"))}
      ${box("Taux de suivi par aire de santé et par jour", `Période ${perTxt()}${W() > 90 ? " (90 derniers jours affichés)" : ""} ; vert = cible atteinte, jaune 80 %, orange 65 %, rouge clair 50 %, rouge = moins de 50 % de contacts vus`, `<div id="c-mat"></div>`, pngBtn("matrice_suivi"))}`;
  }
  /* ---- cartes : palette « feu tricolore » de l'outil national (vert = favorable → rouge = critique ; gris = aucune donnée) */
  const TL = ["#A3C98F", "#EBDD92", "#EEB98A", "#E0927C", "#BD6F68"];
  const TL_NA = "#ECEAE4";
  const CATMAP = { "Rouge": TL[4], "Orange": TL[2], "Jaune": TL[1], "Verte": TL[0], "Non touchée": TL_NA };
  const MAPIND = [["categorie", "Catégorie (date du dernier cas)", "cat"], ["casper", "Cas confirmés + probables (période)", "count"], ["cas21", "Cas des 21 derniers jours", "count"],
    ["inc", "Incidence cumulée /10 000 hab.", "count", 1], ["taux", "Taux de suivi des contacts du jour (%)", "down"], ["pdv", "Contacts perdus de vue (≥ 72 h)", "count"], ["as", "Contacts à suivre", "count", 0, true]];
  const MAPSUB = "Couleurs épidémiologiques : vert = situation favorable, jaune = vigilance, orange = alerte, rouge = situation critique ; gris = aucune donnée";
  function countClasses(vals, d = 0, good = false) {
    const v = vals.filter(x => x > 0).sort((a, b) => a - b);
    const q = p_ => v.length ? v[Math.min(v.length - 1, Math.floor(p_ * (v.length - 1)))] : 1;
    let b = [q(.25), q(.5), q(.75)].map(x => d ? Math.round(x * 10) / 10 : Math.round(x)); b = [...new Set(b.map(x => Math.max(d ? .1 : 1, x)))];
    const cuts = [0, ...b], out = [{ lo: 0, hi: 0, color: good ? TL[4] : TL[0], label: "0" }];
    const pal = good ? [TL[3], TL[2], TL[1], TL[0]] : [TL[1], TL[2], TL[3], TL[4]];
    const f = x => nf(x, d);
    for (let i = 0; i < cuts.length; i++) {
      const lo = d ? cuts[i] + (i ? .1 : .01) : cuts[i] + 1, hi = i + 1 < cuts.length ? cuts[i + 1] : Infinity;
      if (hi < lo) continue;
      out.push({ lo, hi, color: pal[Math.min(pal.length - 1, i + (4 - cuts.length))], label: hi === Infinity ? `≥ ${f(lo)}` : (lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`) });
    }
    return out;
  }
  function mapValues() {
    const t = day(S.date);
    const B = Object.fromEntries(AIRES.map(a => [a.cle, bulletin(a.cle, t)]));
    const per = {}; CAS.forEach(c => { if (!c.hors_zs && inPer(c.date)) per[c.aire] = (per[c.aire] || 0) + 1; });
    const m = MAPIND.find(x => x[0] === S.mapInd) || MAPIND[0];
    const val = k => { const b = B[k]; if (!b) return null; switch (S.mapInd) { case "categorie": return b.cat; case "casper": return per[k] || 0; case "cas21": return b.cs.n21; case "inc": return AINFO[k]?.population ? 1e4 * b.cs.n / AINFO[k].population : null; case "taux": return b.taux; case "pdv": return b.pdv; case "as": return b.as; } };
    let cls = null, color, leg;
    if (m[2] === "cat") {
      color = v => CATMAP[v] || TL_NA;
      const cnt = c => AIRES.filter(a => B[a.cle].cat === c).length;
      leg = Object.keys(CATMAP).map(c => ({ label: `${c}, ${CATDEF[c]} (${cnt(c)})`, color: CATMAP[c] }));
    } else if (m[2] === "down") {
      const tg = C.taux_suivi_pct, br = [50, 65, 80, tg];
      cls = [{ lo: -Infinity, hi: br[0], color: TL[4], label: `< ${br[0]} %` }, { lo: br[0], hi: br[1], color: TL[3], label: `${br[0]}–${br[1]} %` }, { lo: br[1], hi: br[2], color: TL[2], label: `${br[1]}–${br[2]} %` }, { lo: br[2], hi: br[3], color: TL[1], label: `${br[2]}–${br[3]} %` }, { lo: br[3], hi: Infinity, color: TL[0], label: `≥ ${br[3]} % (cible)` }];
      color = v => { if (v === null || v === undefined) return TL_NA; return (cls.find(c => v >= c.lo && v < c.hi) || cls[cls.length - 1]).color; };
      leg = [...cls.map(c => ({ label: c.label, color: c.color })), { label: "aucun contact à suivre", color: TL_NA }];
    } else {
      cls = countClasses(AIRES.map(a => val(a.cle)).filter(v => typeof v === "number"), m[3] || 0, !!m[4]);
      color = v => { if (v === null || v === undefined) return TL_NA; return (cls.find(c => v >= c.lo && v <= c.hi) || cls[cls.length - 1]).color; };
      leg = [...cls.map(c => ({ label: c.label, color: c.color })), { label: "aucune donnée", color: TL_NA }];
    }
    leg.title = m[1] + (S.mapInd === "categorie" ? ", chiffre dans le cercle : cas confirmés des 7 derniers jours" : "");
    return { B, val, color, leg, m };
  }
  function drawMap(el_) {
    const { B, val, color, leg, m } = mapValues();
    G.map(el_, { areas: AIRES.map(a => ({ key: a.cle, name: a.nom })), geo: D.geo, value: val, color: v => color(v), selected: S.aire,
      dark: v => color(v) === TL[4],
      label: k => { const v = val(k); return S.mapInd === "categorie" ? (B[k].cs.n7 ? `${B[k].cs.n7}` : "") : (typeof v === "number" ? (S.mapInd === "taux" ? pc(v, 0) : nf(v, m[3] || 0)) : ""); },
      tipHtml: k => { const b = B[k]; return `<b>${esc(AN[k] || k)}</b>${b.cat} · ${nf(b.cs.n)} cas (${nf(b.cs.n21)} en 21 j)<br>${nf(b.as)} contacts à suivre · ${pc(b.taux, 0)} vus · ${nf(b.pdv)} PDV`; },
      onClick: k => { S.aire = S.aire === k ? null : k; render(); }, legend: leg, valueLabel: m[1] });
  }

  /* ================================================================== SUIVI DES CONTACTS */
  const RETROUVER = ["PDV", "JMV", "Absence", "ReCo non passé", "Déplacé", "Refus"];
  function pageContacts() {
    if (!CT.length) return `<div class="empty">Ajoutez la base de suivi des contacts.</div>`;
    const t = day(S.date);
    const L = CT.filter(c => !S.aire || c.aire === S.aire);
    const st = L.map(c => ({ c, s: status(c, t) })).filter(x => x.s);
    const fol = st.filter(x => !x.s.sortie);
    const byStat = {}; fol.forEach(x => byStat[x.s.st] = (byStat[x.s.st] || 0) + 1);
    const order = ["Vu", "Suspect", "Absence", "ReCo non passé", "PDV", "JMV", "Déplacé", "Refus", "En attente"];
    const scol = { "Vu": col("--st-v24"), "Suspect": col("--st-susp"), "Absence": col("--st-nv"), "ReCo non passé": col("--s4"), "PDV": col("--s2"), "JMV": col("--s7"), "Déplacé": col("--s1"), "Refus": col("--s5"), "En attente": col("--st-inc") };
    const want = S.ctStat === "a_retrouver" ? RETROUVER : S.ctStat === "suspects" ? ["Suspect"] : [S.ctStat];
    const lst = fol.filter(x => want.includes(x.s.st)).map(x => ({ id: x.c.id, ini: x.c.ini, sexe: x.c.sexe, age: x.c.age, aire: AN[x.c.aire] || x.c.aire, cas: x.c.cas, statut: x.s.st, jour: "J" + x.s.k,
      lien: x.c.lien, hr: x.c.hr ? "Oui" : "", sup: x.c.sup, reco: x.c.reco, grille: x.c.codes, _k: x.c.cas, _kk: x.s.k }));
    const iss = {}; L.filter(c => c._dlc !== null && t - c._dlc > 21 && (c._ent === null || c._ent <= t) && inPer(iso(c._dlc + 21))).forEach(c => { const s = status(c, c._dlc + 21); const k = s && s.sortie ? s.sortie : (c.compl !== null && c.compl >= 80 ? "Suivi terminé (≥ 80 % des jours vus)" : "Suivi incomplet (< 80 % des jours vus)"); iss[k] = (iss[k] || 0) + 1; });
    const lien = {}; L.filter(c => inPer(c.ent)).forEach(c => { const k = c.lien || "Non renseigné"; lien[k] = (lien[k] || 0) + 1; });
    const vac = {}; fol.forEach(x => { const k = x.c.vacc || "Inconnu"; vac[k] = (vac[k] || 0) + 1; });
    const wk = {}; L.forEach(c => { if (c._ent === null || c._dlc === null || !inPer(c.ent)) return; const dl = c._ent - c._dlc; if (dl < 0 || dl > 42) return; const w = c._ent - ((new Date(c._ent * 864e5).getUTCDay() + 6) % 7); (wk[w] = wk[w] || []).push(dl); });
    const wks = Object.keys(wk).map(Number).sort((a, b) => a - b);
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    after(() => {
      G.hbars($("#c-stat"), { items: order.filter(k => byStat[k]).map(k => ({ label: k, value: byStat[k], color: scol[k], sub: pc(100 * byStat[k] / fol.length, 0) })), onClick: it => { S.ctStat = it.label === "Vu" ? "a_retrouver" : it.label; render(); } });
      G.hbars($("#c-iss"), { items: Object.entries(iss).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: k.startsWith("Suivi terminé") ? col("--st-v24") : k.startsWith("Suivi incomplet") ? col("--st-nv") : col("--st-done") })) });
      G.bars($("#c-listage"), { labels: wks.map(iso), series: [{ label: "Délai médian (jours)", color: col("--s1"), values: wks.map(w => med(wk[w])) }], fmtX: (d, l) => (l ? "Semaine du " : "") + (l ? dfr(d) : dshort(d)), hline: C.delai_listage_j });
      G.hbars($("#c-lien"), { items: Object.entries(lien).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ label: k, value: v, color: col("--brand-2") })) });
    });
    const allDl = L.filter(c => c._ent !== null && c._dlc !== null && inPer(c.ent)).map(c => c._ent - c._dlc).filter(v => v >= 0 && v <= 42);
    const cols = [{ k: "id", t: "Contact" }, { k: "ini", t: "Initiales" }, { k: "sexe", t: "Sexe" }, { k: "age", t: "Âge", num: 1 }, { k: "aire", t: "Aire de santé" },
      { k: "cas", t: "Cas source", f: v => `<a href="#" data-gocas="${esc(v)}">${esc(v)}</a>` }, { k: "statut", t: "Statut du jour", f: v => pill(v, v === "PDV" || v === "Suspect" ? "bad" : "warn") },
      { k: "jour", t: "Jour" }, { k: "grille", t: "Grille J1–J21", f: (v, r) => miniGrid(v, r._kk) }, { k: "lien", t: "Lien avec le cas" }, { k: "hr", t: "Haut risque" }, { k: "sup", t: "Superviseur" }, { k: "reco", t: "ReCo" }];
    return `<p class="lead"><b>${nf(fol.length)}</b> contacts en suivi le ${dfr(S.date)} ; sur la période ${perTxt()}, délai médian entre le dernier contact et l'enregistrement : <b>${nf(med(allDl) ?? null)} jours</b> (${pc(allDl.length ? 100 * allDl.filter(v => v <= 1).length / allDl.length : null, 0)} enregistrés en 24 h ou moins).</p>
      <div class="grid2">
        ${box("Statut des contacts du jour", "Cliquez un statut pour afficher la liste correspondante", `<div id="c-stat"></div>`, pngBtn("statut_contacts"))}
        ${box("Issue des contacts sortis du suivi", "Contacts dont les 21 jours se sont terminés pendant la période", `<div id="c-iss"></div>`, pngBtn("issue_suivi"))}
      </div>
      ${box(`Contacts à retrouver, ${S.ctStat === "a_retrouver" ? "PDV, jamais vus, absents, déplacés, refus" : S.ctStat}`, "Liste pseudonymisée. Les listes nominatives (noms, téléphone, quartier, ReCo) sont dans le classeur confidentiel (menu Carte et rapports).",
        `<div class="filters"><label>Afficher <select data-state="ctStat">${[["a_retrouver", "Tous les contacts à retrouver"], ...order.filter(k => byStat[k]).map(k => [k, k])].map(([k, l]) => `<option value="${k}" ${S.ctStat === k ? "selected" : ""}>${l} ${byStat[k] ? `(${byStat[k]})` : ""}</option>`).join("")}</select></label></div>
        ${jLegend()}${tableHTML("t-retrouver", cols, lst, { name: `contacts_${S.ctStat}_${S.date}`, limit: 300 })}`, csvBtn("t-retrouver"))}
      <div class="grid2">
        ${box("Délai de listage", `Délai médian (jours) entre le dernier contact avec le cas et l'enregistrement du contact, par semaine ; trait = cible ${C.delai_listage_j} j`, `<div id="c-listage"></div>`, pngBtn("delai_listage"))}
        ${box("Lien avec le cas source", "Contacts enregistrés pendant la période (12 liens les plus fréquents)", `<div id="c-lien"></div>`, pngBtn("liens"))}
      </div>
      ${box("Vaccination des contacts en suivi", "", `<table>${Object.entries(vac).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${nf(v)}</td><td class="num">${pc(100 * v / Math.max(1, fol.length), 0)}</td></tr>`).join("")}</table>`)}`;
  }
  const CODE_LAB = { "X": "vu", "0": "non vu", "1": "suspect", "2": "décédé", "3": "confirmé", "4": "refus", "5": "ReCo non passé", "6": "doublon", "R": "recyclé", "D": "déplacé", "T": "transféré", ".": "en attente", "-": "avant l'enregistrement" };
  const ccls = ch => ch === "." ? "c-dot" : ch === "-" ? "c-pre" : ch === "?" ? "c-dot" : "c-" + ch;
  function miniGrid(codes, k) { return `<span style="display:inline-flex;gap:1px">${[...codes].map((ch, j) => `<i class="${j >= k ? "c-fut" : ccls(ch)}" style="width:7px;height:12px;display:inline-block;border-radius:1px" title="J${j + 1} : ${CODE_LAB[ch] || ch}"></i>`).join("")}</span>`; }
  const jLegend = () => `<div class="jleg">${Object.entries(CODE_LAB).map(([k, l]) => `<span><i class="${ccls(k)}"></i>${k === "." ? "vide" : k === "-" ? "" : k} ${l}</span>`).join("")}</div>`;

  /* ================================================================== CAS CONFIRMÉS ET PROBABLES */
  function pageCas() {
    const t = day(S.date);
    const L = CAS.filter(c => c._d !== null && c._d <= t && (!S.aire || c.aire === S.aire) && inPer(c.date));
    const all = CAS.filter(c => c._d !== null && c._d <= t && (!S.aire || c.aire === S.aire));
    const cols = [{ k: "id", t: "Cas", f: v => `<a href="#" data-gocas="${esc(v)}">${esc(v)}</a>` }, { k: "ini", t: "Initiales" }, { k: "classe", t: "Classe" }, { k: "aire_nom", t: "Aire de santé" },
      { k: "debut", t: "Début des signes", f: v => v ? dfr(v, false) : "—" }, { k: "isolement", t: "Isolement", f: v => v ? dfr(v, false) : "—" }, { k: "confirmation", t: "Confirmation", f: v => v ? dfr(v, false) : "—" },
      { k: "d_isol", t: "Délai DDS → isolement (j)", num: 1, f: v => v === null ? "—" : feuPill(v, C.delai_isolement_j, C.delai_isolement_j + 2, false, x => nf(x)) },
      { k: "connu", t: "Connu comme contact", f: (v, r) => v === true || r.src ? pill("Oui", "ok") : v === false ? pill("Non", "bad") : "—" }, { k: "src", t: "Cas source (liste de contacts)", f: (v, r) => v ? `<a href="#" data-gocas="${esc(v)}">${esc(v)}</a> ${badge(r.srcc, r.srcc === "Certain" ? "b-crit" : "b-high")}` : "—" },
      { k: "deces", t: "Issue", f: v => v ? "Décédé" : "Vivant" },
      { k: "contacts", t: "Contacts listés", num: 1, f: v => v ? nf(v) : pill("0", "bad") }, { k: "d_listage", t: "Délai de listage (j)", num: 1 }, { k: "suspects", t: "Contacts devenus suspects", num: 1 }, { k: "confirmes", t: "… confirmés", num: 1 }, { k: "ch", t: "Chaîne", f: v => v ? `<a href="#" data-gochain="${esc(v)}">${esc(v)}</a>` : "—" }];
    const byAs = {}; L.forEach(c => { const k = c.aire_nom || "Non renseignée"; byAs[k] = (byAs[k] || 0) + 1; });
    const noC = L.filter(c => !c.contacts).length, kn = L, di = L.map(c => c.d_isol).filter(v => v !== null).sort((a, b) => a - b);
    after(() => {
      epiCurve($("#c-epi"), all);
      G.hbars($("#c-cas-as"), { items: Object.entries(byAs).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: col("--s2") })), onClick: it => { const a = AIRES.find(x => x.nom === it.label); if (a) { S.aire = a.cle; render(); } } });
    });
    return `<p class="lead"><b>${nf(L.length)} cas</b> sur la période ${perTxt()}, dont ${nf(L.filter(c => c.deces).length)} décédés ; ${pc(kn.length ? 100 * kn.filter(c => c.connu === true || c.src).length / kn.length : null, 0)} étaient connus comme contacts (case « contact connu » à OUI ou contact retrouvé dans une liste de contacts) ; délai médian début des signes → isolement : ${nf(di[Math.floor(di.length / 2)] ?? null)} jours ; <b>${nf(noC)} cas sans aucun contact listé</b>.</p>
      <div class="grid2">
        ${box("Courbe épidémique", "Cas confirmés et probables par semaine de confirmation (ou d'isolement), selon l'issue", `<div id="c-epi"></div>`, pngBtn("courbe_epidemique"))}
        ${box("Cas par aire de santé", "Période choisie ; cliquez une aire pour filtrer", `<div id="c-cas-as"></div>`, pngBtn("cas_par_aire"))}
      </div>
      ${box("Liste des cas", "Cliquez un cas pour ouvrir son parcours : dates clés, graphe de contacts et grille de suivi de chacun de ses contacts",
        tableHTML("t-cas", cols, L, { click: r => "cas:" + r.id, sort: "date", name: `cas_${S.date}` }), csvBtn("t-cas"))}`;
  }

  /* ================================================================== ÉQUIPES */
  function pageEquipes() {
    const t = day(S.date);
    const key = S.supKind === "reco" ? "reco" : "sup";
    const L = CT.filter(c => !S.aire || c.aire === S.aire);
    const agg = {};
    for (let b = 0; b < 7; b++) {
      const d = t - b;
      L.forEach(c => { const s = status(c, d); if (!s || s.sortie) return; const g = (c[key] || "Non renseigné"); const a = agg[g] = agg[g] || { nom: g, a_suivre: 0, vus: 0, pdv: 0, jmv: 0, abs: 0, refus: 0, s7: 0, v7: 0, aires: new Set() };
        a.s7++; if (SEEN.has(s.st)) a.v7++; a.aires.add(AN[c.aire] || c.aire);
        if (b === 0) { a.a_suivre++; if (SEEN.has(s.st)) a.vus++; if (s.st === "PDV") a.pdv++; if (s.st === "JMV") a.jmv++; if (s.st === "Absence" || s.st === "ReCo non passé") a.abs++; if (s.st === "Refus") a.refus++; } });
    }
    const rows = Object.values(agg).filter(a => a.a_suivre || a.s7).map(a => ({ ...a, taux: ratio(a.vus, a.a_suivre), taux7: ratio(a.v7, a.s7), aires: [...a.aires].slice(0, 4).join(", ") }));
    const cols = [{ k: "nom", t: key === "reco" ? "ReCo" : "Superviseur" }, { k: "aires", t: "Aires de santé", wrap: 1 }, { k: "a_suivre", t: "À suivre", num: 1 }, { k: "vus", t: "Vus", num: 1 },
      { k: "taux", t: "Taux du jour", num: 1, f: v => feuPill(v, C.taux_suivi_pct, 75) }, { k: "taux7", t: "Taux sur 7 jours", num: 1, f: v => feuPill(v, C.taux_suivi_pct, 75) },
      { k: "pdv", t: "PDV", num: 1 }, { k: "jmv", t: "Jamais vus", num: 1 }, { k: "abs", t: "Absences", num: 1 }, { k: "refus", t: "Refus", num: 1 }];
    const low = rows.filter(r => r.a_suivre >= 10).sort((a, b) => (a.taux7 ?? 0) - (b.taux7 ?? 0)).slice(0, 15);
    after(() => G.hbars($("#c-eq"), { items: low.map(r => ({ label: r.nom, value: r.taux7 ?? 0, color: (r.taux7 ?? 0) >= C.taux_suivi_pct ? "#4f9d5d" : (r.taux7 ?? 0) >= 75 ? "#e8c23a" : "#c8452f", sub: `${nf(r.a_suivre)} à suivre` })), pct: 1, max: 100, digits: 1, target: C.taux_suivi_pct }));
    const miss = L.filter(c => { const s = status(c, t); return s && !s.sortie && !c[key]; }).length;
    return `<p class="lead">Performance de chaque ${key === "reco" ? "relais communautaire (ReCo)" : "superviseur"} au ${dfr(S.date)} : taux de suivi du jour et moyenne des 7 derniers jours (contacts vus / contacts à suivre, jour par jour). ${miss ? `<b>${nf(miss)} contacts en suivi n'ont pas de ${key === "reco" ? "ReCo" : "superviseur"} renseigné.</b>` : ""}</p>
      <div class="filters">${segBtns("supKind", [["superviseur", "Superviseurs"], ["reco", "ReCo"]])}</div>
      ${box(`${key === "reco" ? "ReCo" : "Superviseurs"} au taux de suivi le plus faible`, `7 derniers jours ; équipes ayant au moins 10 contacts à suivre ; trait = cible ${C.taux_suivi_pct} %`, `<div id="c-eq"></div>`, pngBtn("equipes_taux"))}
      ${box(`Tableau des ${key === "reco" ? "ReCo" : "superviseurs"}`, "", tableHTML("t-eq", cols, rows, { sort: "a_suivre", name: `equipes_${key}_${S.date}` }), csvBtn("t-eq"))}`;
  }

  /* ================================================================== SBC */
  function pageSbc() {
    if (!SBC.length) return `<div class="empty">Ajoutez la base SBC (CAC).</div>`;
    const t = day(S.date), w = W(), s = sbcStats(S.aire, t, w);
    const rows = AIRES.map(a => { const x = sbcStats(a.cle, t, w); return { aire: a.nom, cac: a.cac, cac_moy: x.cac_moy, cac_pct: x.cac_pct, men: x.menages, men_pct: a.menages ? ratio(x.menages, a.menages) : null, alertes: x.alertes, malades: x.malades, deces: x.deces, inv: x.investiguees, inv_pct: x.inv_pct, val: x.validees, fosa: x.fosa, cte: x.cte, sens: x.sensibilises, swab: x.swabes, eds: x.eds, res: x.resistances, jours: x.jours_rapportes, _k: a.cle }; });
    const cols = [{ k: "aire", t: "Aire de santé" }, { k: "jours", t: "Jours rapportés", num: 1 }, { k: "cac", t: "CAC", num: 1 }, { k: "cac_moy", t: "CAC actifs / jour", num: 1, f: v => nf(v, 1) },
      { k: "cac_pct", t: "% CAC actifs", num: 1, f: v => feuPill(v, C.cac_actifs_pct, 50) }, { k: "men", t: "Ménages visités", num: 1 }, { k: "men_pct", t: "Visites / ménages", num: 1, f: v => pc(v, 0) },
      { k: "alertes", t: "Alertes", num: 1 }, { k: "deces", t: "dont décès", num: 1 }, { k: "inv", t: "Investiguées", num: 1 }, { k: "inv_pct", t: "% investiguées", num: 1, f: v => feuPill(v, 95, 70) },
      { k: "val", t: "Validées", num: 1 }, { k: "fosa", t: "Orientés FOSA", num: 1 }, { k: "cte", t: "Orientés CT/CTE", num: 1 }, { k: "sens", t: "Sensibilisés", num: 1 },
      { k: "swab", t: "Décès swabés", num: 1 }, { k: "eds", t: "EDS", num: 1 }, { k: "res", t: "Résistances levées", num: 1 }];
    const dd = []; const d0 = Math.max(t - Math.min(w, 180) + 1, Math.min(...SBC.map(r => r._d))); for (let d = d0; d <= t; d++) dd.push(d);
    const byDay = d => SBC.filter(r => r._d === d && (!S.aire || r.aire === S.aire));
    after(() => {
      G.bars($("#c-sbc-al"), { labels: dd.map(iso), series: [{ label: "Alertes investiguées", color: col("--brand-2"), values: dd.map(d => sum(byDay(d), "investiguees")) }, { label: "Alertes non investiguées", color: col("--critical"), values: dd.map(d => Math.max(0, (sum(byDay(d), "alertes_total") || sum(byDay(d), "alertes_malades") + sum(byDay(d), "alertes_deces")) - sum(byDay(d), "investiguees"))) }], fmtX: (d, l) => l ? dfr(d) : dshort(d) });
      G.lines($("#c-sbc-cac"), { labels: dd.map(iso), series: [{ label: "CAC ayant travaillé", color: col("--s1"), values: dd.map(d => sum(byDay(d), "cac")) }], fmtX: (d, l) => l ? dfr(d) : dshort(d) });
    });
    return `${strip([[pc(s.cac_pct, 0), "CAC actifs (moyenne)", `${nf(s.cac_moy, 1)} CAC par jour`, lvl(s.cac_pct, C.cac_actifs_pct, 50)], [nf(s.menages), "ménages visités"], [nf(s.alertes), "alertes communautaires", `${nf(s.malades)} malades · ${nf(s.deces)} décès`],
      [pc(s.inv_pct, 0), "alertes investiguées", `${nf(s.investiguees)} investiguées · ${nf(s.validees)} validées`, lvl(s.inv_pct, 95, 70)], [nf(s.fosa + s.cte), "personnes orientées", `${nf(s.cte)} vers CT/CTE`],
      [nf(s.sensibilises), "personnes sensibilisées"], [nf(s.swabes), "décès communautaires swabés", `${nf(s.eds)} EDS`], [nf(s.resistances), "résistances levées"]])}
      <div class="grid2">${box("Alertes communautaires par jour", `Investiguées et non investiguées · ${perTxt()}`, `<div id="c-sbc-al"></div>`, pngBtn("sbc_alertes"))}${box("CAC ayant travaillé par jour", "", `<div id="c-sbc-cac"></div>`, pngBtn("sbc_cac"))}</div>
      ${box("Activités des CAC par aire de santé", `Période ${perTxt()} ; les jours sans aucune donnée sont comptés comme non rapportés`, tableHTML("t-sbc", cols, rows, { click: r => r._k, sel: r => r._k === S.aire, sort: "alertes", name: `sbc_${S.date}` }), csvBtn("t-sbc"))}`;
  }

  /* ================================================================== RECHERCHE ACTIVE */
  const RA_T = [["HGR", "Hôpital général"], ["CH", "Centre hospitalier"], ["CS", "Centre de santé"], ["LABO", "Laboratoire"], ["PS", "Poste de santé"], ["DISP", "Dispensaire"], ["TRADI", "Tradipraticien"], ["SPR", "Structure privée"], ["PHAR", "Pharmacie"]];
  function pageRa() {
    if (!RA.length) return `<div class="empty">Ajoutez le fichier de recherche active.</div>`;
    const t = day(S.date), w = W(), r = raStats(S.aire, t, w);
    const rows = AIRES.map(a => { const x = raStats(a.cle, t, w); return { aire: a.nom, jours: x.jours, pl: x.planifiees, vi: x.visitees, vis: x.vis_pct, pers: x.personnes, sys: ratio(x.connait_systeme, x.personnes), num: ratio(x.connait_numero, x.personnes), def: ratio(x.connait_def, x.personnes), cons: x.consultations, rep: x.repondant, inv: x.investigues, inv_pct: x.inv_pct, val: x.valides, cte: x.ct_cte, ref: x.refus, nr: x.non_retrouves, _k: a.cle }; });
    const cols = [{ k: "aire", t: "Aire de santé" }, { k: "jours", t: "Jours rapportés", num: 1 }, { k: "pl", t: "Structures planifiées", num: 1 }, { k: "vi", t: "Visitées", num: 1 }, { k: "vis", t: "% visitées", num: 1, f: v => feuPill(v, C.ra_structures_visitees_pct, 70) },
      { k: "pers", t: "Personnes rencontrées", num: 1 }, { k: "sys", t: "Connaissent le système d'alerte", num: 1, f: v => pc(v, 0) }, { k: "num", t: "… le numéro", num: 1, f: v => pc(v, 0) }, { k: "def", t: "… la définition de cas", num: 1, f: v => pc(v, 0) },
      { k: "cons", t: "Consultations", num: 1 }, { k: "rep", t: "Répondant à la définition", num: 1 }, { k: "inv", t: "Investigués", num: 1 }, { k: "inv_pct", t: "% investigués", num: 1, f: v => feuPill(v, 95, 70) },
      { k: "val", t: "Validés", num: 1 }, { k: "cte", t: "Vers CT/CTE", num: 1 }, { k: "ref", t: "Refus", num: 1 }, { k: "nr", t: "Non retrouvés", num: 1 }];
    const L = r.rows;
    const mal = Object.keys(L[0] || {}).filter(k => k.startsWith("mal_"));
    after(() => {
      G.hbars($("#c-ra-type"), { items: RA_T.map(([k, l]) => { const p = sum(L, "plan_" + k), v = sum(L, "vis_" + k); return { label: l, value: p ? 100 * v / p : 0, sub: `${nf(v)} / ${nf(p)}`, color: p && v / p >= C.ra_structures_visitees_pct / 100 ? "#4f9d5d" : "#e8c23a" }; }).filter((x, i) => sum(L, "plan_" + RA_T[i][0])), pct: 1, max: 100, digits: 0, target: C.ra_structures_visitees_pct });
      G.hbars($("#c-ra-casc"), { items: [["Consultations", r.consultations], ["Répondant à la définition de cas", r.repondant], ["Investigués", r.investigues], ["Validés", r.valides], ["Orientés vers CT/CTE", r.ct_cte], ["Isolement normé", r.isolement], ["Prélevés sur place", r.preleves], ["Refus", r.refus], ["Évadés", r.evades], ["Non retrouvés", r.non_retrouves]].map(([l, v]) => ({ label: l, value: v, color: /Refus|Évadés|Non retrouvés/.test(l) ? col("--critical") : col("--brand-2") })) });
    });
    return `${strip([[pc(r.vis_pct, 0), "structures visitées", `${nf(r.visitees)} / ${nf(r.planifiees)} planifiées`, lvl(r.vis_pct, C.ra_structures_visitees_pct, 70)], [nf(r.personnes), "personnes rencontrées"],
      [pc(ratio(r.connait_def, r.personnes), 0), "connaissent la définition de cas"], [nf(r.consultations), "consultations revues"], [nf(r.repondant), "répondant à la définition"],
      [pc(r.inv_pct, 0), "investigués", `${nf(r.investigues)} investigués · ${nf(r.valides)} validés`, lvl(r.inv_pct, 95, 70)], [nf(r.non_retrouves + r.evades + r.refus), "refus, évadés, non retrouvés", "", r.non_retrouves + r.evades + r.refus ? "bad" : ""]])}
      <div class="grid2">${box("Structures visitées selon le type", `% des visites planifiées réalisées · ${perTxt()} ; trait = cible ${C.ra_structures_visitees_pct} %`, `<div id="c-ra-type"></div>`, pngBtn("ra_structures"))}
        ${box("Issue des cas répondant à la définition", "Cascade de la recherche active", `<div id="c-ra-casc"></div>`, pngBtn("ra_cascade"))}</div>
      ${box("Recherche active par aire de santé", `Période ${perTxt()}`, tableHTML("t-ra", cols, rows, { click: r_ => r_._k, sel: r_ => r_._k === S.aire, sort: "rep", name: `recherche_active_${S.date}` }), csvBtn("t-ra"))}
      ${mal.length ? box("Maladies prioritaires notifiées pendant la recherche active", "", `<div class="tbl-wrap"><table><tr>${mal.map(m => `<th class="num">${esc(m.slice(4).replace(/_/g, " "))}</th>`).join("")}</tr><tr>${mal.map(m => `<td class="num">${nf(sum(L, m))}</td>`).join("")}</tr></table></div>`) : ""}`;
  }

  /* ================================================================== CARTE ET RAPPORTS */
  const PUBLIC = !!(D.meta && D.meta.public);   // version partagée en ligne (lecture seule, sans listes nominatives)
  const SERVED = location.protocol.startsWith("http") && !PUBLIC;
  const capHtml = t => Ch.esc(t || "").replace(/&lt;(\/?)b&gt;/g, "<$1b>");
  function pageCarte() {
    after(() => drawMap($("#c-map2")));
    const dl = D.exports || {};
    const link = (f, l, conf) => f ? `<a class="btn ${conf ? "" : "primary"}" href="${OUT}${conf ? "confidentiel/" : ""}${encodeURIComponent(f)}" download>${l}</a>` : "";
    return `${box(`${(MAPIND.find(x => x[0] === S.mapInd) || MAPIND[0])[1]}`, D.geo ? MAPSUB : "Carte schématique : déposez les contours des aires de santé dans « Charger les données » pour une carte géographique",
        `<div class="filters"><label>Indicateur <select data-state="mapInd">${MAPIND.map(([k, l]) => `<option value="${k}" ${S.mapInd === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><div id="c-map2"></div>`, `<button class="btn sm primary" data-maprep>Carte (PNG rapport)</button>`)}
      ${(() => { const cm = D.exports.cartes || {}; const lab = { categorie: "Catégorisation des aires de santé (date du dernier cas)", cas21: "Cas des 21 derniers jours", cas7: "Cas des 7 derniers jours", inc: "Incidence cumulée /10 000 hab.", taux: "Taux de suivi des contacts du jour", pdv: "Contacts perdus de vue", as: "Contacts à suivre" };
        const ks = Object.keys(cm); if (!ks.length) return "";
        return box("Cartes pour rapport", `Cartes A4 produites par l'analyse du ${dfr(D.meta.date_rapport)} : titre, légende avec le nombre d'aires, flèche du nord, échelle, source et date, prêtes pour Word ou PowerPoint`,
          `<div class="maps-grid">${ks.map(k => `<div class="map-card"><a href="${OUT}cartes/${encodeURIComponent(cm[k])}" target="_blank" rel="noopener"><img class="map-img" loading="lazy" src="${OUT}cartes/${encodeURIComponent(cm[k])}" alt="${esc(lab[k] || k)}"></a><div class="flex between" style="margin-top:8px"><b class="small">${esc(lab[k] || k)}</b><button class="btn sm" type="button" data-map-png="${k}" data-map-file="${esc(cm[k])}" title="Carte et commentaire dans une seule image">⤓ PNG</button></div>${(D.exports.commentaires || {})[k] ? `<p class="map-cap" id="map-cap-${k}">${capHtml(D.exports.commentaires[k])}</p>` : ""}</div>`).join("")}</div>`); })()}
      ${box("Rapports produits", `Produits à chaque analyse pour la date du ${dfr(D.meta.date_rapport)}${S.date !== D.meta.date_rapport ? ", la date affichée est différente : utilisez « Produire pour cette date »" : ""}`,
        `<div class="filters">${link(dl.rapport_pdf, "Rapport de la zone de santé (PDF)")}${link(dl.classeur, "Classeur des tableaux (Excel)")}
          ${SERVED ? `<button class="btn" data-run-date>Produire pour le ${dfr(S.date)}</button>` : ""}</div>
         ${PUBLIC ? `<p class="note">Version en ligne : les listes nominatives restent uniquement dans l'outil local de la coordination provinciale.</p>` : SERVED && !canUp() ? `<p class="note">Listes nominatives : réservées au compte provincial et au compte de la zone de santé de ${esc(D.meta.zone_de_sante)}.</p>` : `<h3 class="small" style="margin:14px 0 6px">Listes nominatives (confidentiel)</h3>
         <p class="note warn">Noms, téléphones et quartiers des contacts à retrouver et des suspects, par aire de santé et par ReCo : pour les équipes de terrain uniquement, à ne pas diffuser.</p>
         <div class="filters">${link(dl.liste_retrouver, "Contacts à retrouver (Excel)", 1)}${link(dl.liste_suspects, "Suspects et cas sans contacts (Excel)", 1)}</div>`}`)}`;
  }

  /* ================================================================== FICHIERS */
  function pagePresentation() {
    after(() => NKPres.wire($("#main")));
    const nom = D.meta.zone_de_sante;
    return NKPres.html(OUT + "presentation/", `Presentation_ZS_${nom.replace(/ /g, "-")}.pptx`, "Zone de santé de " + nom, "à la date de la dernière analyse provinciale (indiquée sur chaque graphique)");
  }
  function pageFichiers() {
    const f = D.meta.fichiers || {}, srcs = D.meta.sources || {};
    if (SERVED && canUp()) after(() => loadFiles());
    const lib = { contacts: "Base de suivi des contacts", cas: "Liste des cas", notif: "Liste linéaire des alertes et suspects", alertes: "Base des alertes", sbc: "Surveillance à base communautaire (CAC)", aires: "Paramètres des aires de santé", ra: "Recherche active", contours: "Contours des aires de santé" };
    const st = s_ => !s_ ? badge("absent", "b-crit") : /conserv/.test(s_.statut) ? badge("analyse précédente conservée", "b-mod") : s_.statut === "inchangé" ? badge("inchangé", "") : badge("mis à jour", "b-good");
    return `<p class="lead">Déposez <b>un, deux ou tous</b> les fichiers de la zone de santé (base de suivi ou listage des contacts, liste des cas, liste linéaire des suspects et confirmés, export DHIS2, base des alertes, SBC, recherche active, contours des aires). L'outil reconnaît chaque fichier par son contenu. Seules les analyses des fichiers déposés sont refaites ; pour les autres, les dernières analyses sont gardées. Les originaux ne sont jamais modifiés.${D.meta.cas_origine ? ` <br>Origine des cas : <b>${esc(D.meta.cas_origine)}</b>.` : ""}</p>
      ${SERVED && canUp() ? panel("Charger les données", `Les fichiers sont copiés dans le dossier de la zone de santé de ${esc(D.meta.zone_de_sante)} (donnees/zs/${esc(D.meta.zone_de_sante)}) ; les fichiers précédents y restent disponibles`, `<label class="drop" id="drop"><input type="file" id="up" multiple hidden accept=".xlsx,.xlsb,.xls,.xlsm,.ods,.csv,.tsv,.txt,.htm,.html,.zip,.geojson,.json"><b>Déposez les fichiers ici</b><span class="muted small">ou cliquez pour les choisir sur l'ordinateur</span></label>
        <div id="up-files" style="margin-top:12px"></div><p style="margin-top:12px"><button class="btn primary" data-run>Lancer l'analyse</button></p><div class="log" id="log" hidden></div>`) : SERVED ? `<p class="note">Votre compte ne peut pas charger les fichiers de cette zone de santé (seulement ceux de votre zone, ou toutes les zones pour le compte provincial).</p>` : PUBLIC ? "" : `<p class="note">Ouvrez l'outil avec « 00_OUVRIR_OUTIL » pour déposer des fichiers depuis cette page ; sinon copiez-les dans le dossier donnees/zs/${esc(D.meta.zone_de_sante)}/ puis lancez « 02_ANALYSER ».</p>`}
      ${box("État des données", `Dernière analyse : ${esc(D.meta.genere_le)} · situation au ${dfr(D.meta.date_rapport)} · données jusqu'au ${dfr(D.meta.donnees_jusqu_au)}`,
        `<div class="table-wrap"><table><thead><tr><th>Données</th><th>Fichier utilisé</th><th>Données jusqu'au</th><th>État</th><th>Analyse du</th></tr></thead><tbody>${Object.entries(lib).map(([k, l]) => { const s_ = srcs[k]; return `<tr><td>${l}</td><td>${s_ ? esc(s_.fichier) : f[k] ? esc(f[k]) : "—"}</td><td>${s_ && s_.jusqu_au ? dfr(s_.jusqu_au) : "—"}</td><td>${st(s_ || (f[k] ? { statut: "mis à jour" } : null))}</td><td>${s_ ? esc(s_.maj || "") : ""}</td></tr>`; }).join("")}</tbody></table></div>
        ${(D.meta.avertissements || []).map(w => `<p class="note warn">${esc(w)}</p>`).join("")}`)}`;
  }

  /* ------------------------------------------------------------------ navigation */
  const I = {
    presentation: "M2 3h20v13H2zm2 2v9h16V5zm5 13h6l1 3H8zM6 12l3-4 3 2 4-4 2 1.5-6 5-3-2-1.5 1.5z",
    jour: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z", aires: "M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z",
    carte: "M15 4 9 2 3 4v18l6-2 6 2 6-2V2zM9 4.4l6 2v13.2l-6-2z", cas: "M3 19h18v2H3zM5 17V9h3v8zm5 0V5h3v12zm5 0v-6h3v6z",
    contacts: "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0h-1c1.2.9 2 2 2 3.5V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z",
    equipes: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8c0-3.3 3.6-6 8-6s8 2.7 8 6z", index: "M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z",
    journey: "M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 18c0-3.9 3.1-7 7-7s7 3.1 7 7H5zM19 3l3 3-3 3", chains: "M7 7a3 3 0 1 1-2 5.2L10 15a3 3 0 1 1-.8 1.8L4.3 14A3 3 0 0 1 7 7zm10-4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
    recon: "M4 5h4v4H4zm12 0h4v4h-4zM10 15h4v4h-4zM6 9v2h4v4h2v-4h4V9h-2v2H8V9z", dynamics: "M3 19h18v2H3zM4 15l4-6 4 3 5-8 3 2-6.6 10.3-4-3L6.2 16.4z",
    children: "M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-4 8h8l-1 6h-1v6h-4v-6H9z", sbc: "M12 2 2 7v2h20V7zM4 11v7h3v-7zm6 0v7h4v-7zm7 0v7h3v-7zM2 20v2h20v-2z",
    ra: "M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z", fichiers: "M5 20h14v-2H5zm7-16-5 5h3v6h4V9h3z",
    alertes: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4h-2v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z", deces: "M10 2h4v6h6v4h-6v10h-4V12H4V8h6z",
    clinique: "M12 21l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.2z",
    notif: "M12 2 1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z", labo: "M9 2h6v2h-1v5l5 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l5-9V4H9z", pec: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4z" };
  const EXT = window.ZS_TRANSMISSION ? window.ZS_TRANSMISSION : null;
  let TV = {};
  const PAGES = [
    ["jour", "Vue générale", "Situation"], ["aires", "Aires de santé", "Situation"], ["cas", "Cas confirmés et probables", "Situation"], ["carte", "Carte et rapports", "Situation"],
    ["equipes", "Équipes de suivi", "Contact tracing"], ["index", "Cas index", "Contact tracing"], ["journey", "Parcours du cas", "Contact tracing"],
    ["chains", "Chaînes de transmission", "Contact tracing"], ["recon", "Reconstruction de la transmission", "Contact tracing"],
    ["dynamics", "Dynamique de transmission", "Analyses"], ["children", "Enfants (0–18 ans)", "Analyses"],
    ["alertes", "Surveillance des alertes", "Riposte"], ["deces", "Décès et EDS", "Riposte"], ["clinique", "Symptômes et clinique", "Riposte"], ["labo", "Laboratoire", "Riposte"],
    ["pec", "Prise en charge, vaccination, expositions", "Riposte"],
    ["sbc", "Surveillance communautaire (SBC)", "Communauté"], ["ra", "Recherche active", "Communauté"], ["presentation", "Présentation (diapositives)", "Réunions"], [PUBLIC ? "fichiers" : "fichiers", PUBLIC || !canUp() ? "État des données" : "Charger les données", "Données"]];
  if (D.notif || D.alertes_j) PAGES.splice(PAGES.findIndex(p => p[0] === "alertes"), 0, ["notif", "Alertes et cas suspects", "Riposte"]);
  const CTX = !!(D.trans && D.contacts_liste && D.contacts_liste.rows.length);
  const HASDATA = { contacts: !!D.suivi, equipes: !!(D.equipes && D.contacts_liste), index: CTX, journey: !!D.trans, chains: CTX, recon: !!D.trans, dynamics: !!D.trans, children: !!D.trans,
    sbc: !!D.sbc, ra: !!D.ra, presentation: !NIV_PROV && !!window.NKPres, alertes: !NIV_PROV && !!(D.sbc || D.ra || D.suivi), deces: !!(D.cas || D.sbc || D.alertes_j), clinique: !!D.cas, labo: !!(D.cas || D.notif), pec: !!(D.cas || D.suivi), aires: !!(D.cas || D.suivi), cas: !!D.cas };
  if (NIV_PROV) { PAGES.forEach(p => { if (p[0] === "aires") p[1] = "Zones de santé"; if (p[0] === "labo") p[1] = "Laboratoire et positivité"; if (p[0] === "dynamics") p[1] = "Dynamique de transmission et Rt"; }); }
  else PAGES.forEach(p => { if (p[0] === "labo" && D.notif) p[1] = "Laboratoire et positivité"; if (p[0] === "dynamics") p[1] = "Dynamique de transmission et Rt"; });
  const NAVP = () => PAGES.filter(p => HASDATA[p[0]] !== false).map(p => p[0] === "fichiers" ? [p[0], PUBLIC || !canUp() ? "État des données" : "Charger les données", p[2]] : p);
  const SUBT = { jour: () => `Situation au ${dfr(S.date)} · ${scope()} · données extraites le ${dfr(D.meta.donnees_jusqu_au)}`, aires: () => `Bulletin au ${dfr(S.date)}`,
    cas: () => `${scope()} · ${perTxt()}`, carte: () => `Situation au ${dfr(S.date)}`, contacts: () => `${scope()} · au ${dfr(S.date)}`, equipes: () => `${scope()} · au ${dfr(S.date)}`,
    sbc: () => `${scope()} · ${perTxt()}`, ra: () => `${scope()} · ${perTxt()}`, fichiers: () => `Analyse du ${esc(D.meta.genere_le)}`, presentation: () => "Graphiques et diapositives prêts pour les réunions" };
  function shell() {
    if (PUBLIC || (SERVED && !canUp())) { const b = document.querySelector('.controls [data-go="fichiers"]'); if (b) b.remove(); }
    if (!NAVP().find(x => x[0] === S.page)) S.page = "jour";
    document.title = NIV_PROV ? `Ebola, ${D.meta.zone_de_sante} (analyses détaillées)` : `Ebola : ZS ${D.meta.zone_de_sante}`;
    $("#brand-sub").textContent = NIV_PROV ? `${D.meta.zone_de_sante} · analyses détaillées` : `Zone de santé de ${D.meta.zone_de_sante}`;
    let g0 = "";
    const zl = PROV ? PROV.zones.filter(z => (PROV.meta.zones_detail || []).includes(z.nom)) : [];
    const pv = D.meta.province || (PROV && PROV.meta.province) || "";
    const pvt = (PROV && PROV.meta.titre) || ("Province du " + pv), pvc = (PROV && PROV.meta.detail_province) || ("province-du-" + pv.toLowerCase().replace(/\s+/g, "-"));
    const isProvUser = !USER || USER.role === "province";
    const top = !isProvUser ? "" : `<a class="back-prov" href="index.html">← Accueil de la province</a>`
      + `<div class="zs-switch"><select data-openzs aria-label="Changer de zone de santé"><option value="${encodeURIComponent(pvc)}" ${NIV_PROV ? "selected" : ""}>${esc(pvt)} (analyses détaillées)</option>${zl.map(z => `<option value="${z.code}" ${z.nom === D.meta.zone_de_sante ? "selected" : ""}>ZS ${esc(z.nom)}</option>`).join("")}</select></div>`;
    $("#user").innerHTML = USER ? `<button class="userchip" id="userchip" aria-haspopup="true"><span class="av">${esc((USER.nom || USER.identifiant).slice(0, 1).toUpperCase())}</span><span>${esc(USER.nom)}<small>${USER.role === "province" ? "Coordination provinciale" : "Zone de santé de " + esc(USER.zone)}</small></span></button>
      ${S.menu ? `<div class="menu-pop"><div class="who">Connecté : <b>${esc(USER.identifiant)}</b></div>${PUBLIC ? `<div class="who">Version en ligne, lecture seule. Le mot de passe se change dans l'outil local.</div>` : `<button data-mdp>Changer mon mot de passe</button>`}<button data-logout>Se déconnecter</button></div>` : ""}` : "";
    $("#nav").innerHTML = top + NAVP().map(([k, l, g]) => { const head = g !== g0 ? `<div class="nav-group">${g}</div>` : ""; g0 = g; return `${head}<button data-page="${k}" class="${S.page === k ? "active" : ""}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${I[k]}"/></svg>${l}</button>`; }).join("");
    const p = NAVP().find(x => x[0] === S.page) || PAGES[0];
    $("#title").textContent = p[1];
    $("#subtitle").innerHTML = (SUBT[S.page] || (() => `${scope()} · ${perTxt()}`))();
    $("#aire-select").innerHTML = `<option value="">Toute la zone de santé</option>` + AIRES.map(a => `<option value="${esc(a.cle)}" ${S.aire === a.cle ? "selected" : ""}>${esc(a.nom)}</option>`).join("");
    const z = bulletin(null, day(S.date));
    $("#side-status").innerHTML = `<b><span class="pulse"></span>ZS ${esc(D.meta.zone_de_sante)}</b><span>Données jusqu'au ${dfr(D.meta.donnees_jusqu_au)}</span>
      ${SU ? `<div class="row"><span>Contacts à suivre</span><b>${nf(z.as)}</b></div><div class="row"><span>Taux de suivi</span><b>${pc(z.taux, 0)}</b></div>` : ""}<div class="row"><span>Cas 7 j</span><b>${nf(z.cs.n7)}</b></div><div class="row"><span>Cas 21 j</span><b>${nf(z.cs.n21)}</b></div>`;
    $("#foot-l").textContent = `Ebola Outbreak, outil provincial · zone de santé de ${D.meta.zone_de_sante} · analyse du ${D.meta.genere_le} · v${D.meta.version || ""}`;
    if (!NIV_PROV) document.title = `Ebola : ZS ${D.meta.zone_de_sante}`;
    const PR = [["7", "7 j"], ["14", "14 j"], ["21", "21 j"], ["28", "28 j"], ["42", "42 j"], ["90", "90 j"], ["tout", "Tout"]];
    $("#periodbar").innerHTML = `<div class="pb-main"><span class="pb-title"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3v18H4V4h3zm-1 8v10h12V10z"/></svg>Période d'analyse</span>
      <label class="pb-date">Du <input type="date" id="pb-from" value="${S.from}" min="${firstDate}" max="${S.date}"></label>
      <label class="pb-date">au <input type="date" id="pb-to" value="${S.date}" min="${DATES[0] || firstDate}" max="${lastDate}"></label>
      <div class="seg pb-presets">${PR.map(([v, t]) => `<button data-preset="${v}" class="${S.preset === v ? "on" : ""}">${t}</button>`).join("")}</div>
      <span class="pb-state small">Choisissez les dates : tous les menus se recalculent automatiquement.</span></div>`;
    window.HUB_PERIOD = S.preset === "tout" ? null : { debut: S.from, fin: S.date };
  }

  /* ------------------------------------------------------------------ rendu et interactions */
  const VIEWS = { jour: pageJour, aires: pageAires, contacts: pageContacts, cas: pageCas, equipes: pageEquipes, sbc: pageSbc, ra: pageRa, carte: pageCarte, fichiers: pageFichiers, presentation: pagePresentation };
  const H = { D, S, CAS, CT, AIRES, AN, AINFO, DATES, nf, pc, esc, col, dfr, dshort, day, iso, addDays, days, inPer, perTxt, scope, W, status, EXIT, SEEN,
              panel, kpi, badge, legend, segBtns, table, tableHTML, pill, strip, miniGrid, jLegend, ccls, CODE_LAB, after, go, render: () => render(), Ch, $, $$, firstDate, lastDate };
  if (EXT) TV = EXT(H) || {};
  if (window.ZS_RIPOSTE) Object.assign(TV, window.ZS_RIPOSTE(H) || {});
  if (window.ZS_NOTIF) Object.assign(TV, window.ZS_NOTIF(H) || {});
  function go(page, param) {
    S.page = page;
    if (page === "journey" && param !== undefined) { S.cas = param; S.nodeSel = ""; }
    if (page === "chains" && param !== undefined) S.chain = param;
    render(); scrollTo(0, 0);
  }
  function render() {
    POST.length = 0;
    Ch.clearRegistry();
    shell();
    const v = TV[S.page];
    let html;
    try { html = v ? v.view() : (VIEWS[S.page] || pageJour)(); } catch (e) { console.error(e); html = `<div class="empty">Erreur d'affichage : ${esc(e.message)}</div>`; }
    $("#main").innerHTML = html;
    POST.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    if (v && v.charts) { try { v.charts(); } catch (e) { console.error(e); } }
    if (NIV_PROV) { relabel($("#main")); relabel($("#sidebar")); relabel(document.querySelector(".topbar")); relabel($("#periodbar")); setTimeout(() => relabel($("#main")), 400); }
    const h = new URLSearchParams({ p: S.page, d: S.date, per: S.preset, du: S.from }); if (S.aire) h.set("a", S.aire); if (S.cas) h.set("c", S.cas);
    history.replaceState(null, "", "#" + h.toString());
    $("#sidebar").classList.remove("open");
  }
  function setTheme(t) { document.documentElement.dataset.theme = t; localSet("zs-theme", t); render(); }
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#userchip")) { S.menu = !S.menu; shell(); return; }
    if (S.menu && !t.closest(".menu-pop")) { S.menu = false; shell(); }
    if (t.closest("[data-logout]") && window.NK_DECONNEXION) { window.NK_DECONNEXION(); return; }
    if (t.closest("[data-logout]")) { fetch("/api/deconnexion", { method: "POST", credentials: "same-origin" }).then(() => { location.href = "connexion.html"; }); return; }
    if (t.closest("[data-mdp]")) { S.menu = false; shell(); modalMdp(); return; }
    if (t.closest("#theme")) { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); return; }
    if (t.closest("#menu")) { $("#sidebar").classList.toggle("open"); return; }
    const nav = t.closest("[data-page]"); if (nav) { go(nav.dataset.page); return; }
    const gg = t.closest("[data-go]"); if (gg) { go(gg.dataset.go); return; }
    const pr = t.closest("[data-preset]"); if (pr) { S.preset = pr.dataset.preset; applyPreset(); render(); return; }
    const gc = t.closest("[data-gocas]"); if (gc) { e.preventDefault(); go("journey", gc.dataset.gocas); return; }
    const gch = t.closest("[data-gochain]"); if (gch) { e.preventDefault(); go("chains", gch.dataset.gochain); return; }
    const row = t.closest("tr[data-row]"); if (row) { const v = row.dataset.row; if (v.startsWith("cas:")) go("journey", v.slice(4)); else { S.aire = S.aire === v ? null : v; render(); } return; }
    const trow = t.closest("tr[data-trow]"); if (trow) { const i = trow.dataset.trow.indexOf("|"), id = trow.dataset.trow.slice(0, i), k = trow.dataset.trow.slice(i + 1); const v = TV[S.page]; if (v && v.onRow) v.onRow(id, k); else go("journey", k); return; }
    const srt = t.closest("th[data-sort]"); if (srt) { const [id, k] = srt.dataset.sort.split("|"); const st = S.tables[id]; if (st) { st.dir = st.sort === k ? -st.dir : -1; st.sort = k; render(); } return; }
    const more = t.closest("[data-more]"); if (more) { const st = S.tables[more.dataset.more]; if (st) { st.limit += 100; render(); } return; }
    const seg = t.closest(".seg[data-seg] button"); if (seg) { S[seg.parentElement.dataset.seg] = seg.dataset.v; render(); return; }
    const png = t.closest("[data-png]"); if (png) { const p = png.closest(".panel"); const name = `${png.dataset.png}_${S.aire ? AN[S.aire] : D.meta.zone_de_sante}_${S.date}`;
      if (!TV[S.page] && p.querySelector(".chart svg")) G.panelPNG(p, name, `ZS ${D.meta.zone_de_sante} · ${scope()} · ${perTxt()} · Ebola Outbreak, outil de la zone de santé`);
      else Ch.downloadPanelPNG(p, name); return; }
    const cv = t.closest("[data-csv]"); if (cv) { const id = cv.dataset.csv; if (TABLESN[id]) { csvN(id); return; } const T_ = TABLES[id]; if (T_) G.csv(T_.name, Array.isArray(T_.cols) && typeof T_.cols[0] === "object" ? T_.cols.map(c => c.t) : T_.cols, Array.isArray(T_.cols) && typeof T_.cols[0] === "object" ? T_.rows.map(r => T_.cols.map(c => { const v = r[c.k]; return Array.isArray(v) ? v.join(" ") : v; })) : T_.rows); return; }
    if (t.closest("[data-maprep]")) { mapReport(); return; }
    if (t.closest("[data-run]")) { runAnalysis(); return; }
    if (t.closest("[data-run-date]")) { runAnalysis(S.date); return; }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "aire-select") { S.aire = t.value || null; render(); return; }
    if (t.dataset.openzs !== undefined && t.value) { location.href = "zs.html?zone=" + encodeURIComponent(t.value); return; }
    if (t.id === "pb-to") { if (t.value && t.value >= (DATES[0] || firstDate) && t.value <= lastDate) { S.date = DATES.includes(t.value) || !DATES.length ? t.value : S.date; if (S.preset === "custom") { if (S.from > S.date) S.from = S.date; } else applyPreset(); } render(); return; }
    if (t.id === "pb-from") { if (t.value) { S.from = t.value > S.date ? S.date : t.value; S.preset = "custom"; } render(); return; }
    if (t.dataset.state) { S[t.dataset.state] = t.value; render(); return; }
    if (t.dataset.check) { S[t.dataset.check] = t.checked; render(); return; }
    if (t.id === "up") upload(t.files);
  });
  let tq;
  document.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.tsearch) { const id = t.dataset.tsearch, st = S.tables[id]; if (!st) return; st.q = t.value; clearTimeout(tq); tq = setTimeout(() => { render(); const n = document.querySelector(`[data-tsearch="${id}"]`); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }
  });
  document.addEventListener("dragover", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  document.addEventListener("dragleave", e => { const d = e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); upload(e.dataTransfer.files); } });

  /* ---- carte de rapport : grande carte + titre + légende + source */
  function mapReport() {
    const kind = { categorie: "categorie", cas21: "cas21", inc: "inc", taux: "taux", pdv: "pdv", as: "as" }[S.mapInd];
    const f = kind && (D.exports.cartes || {})[kind];
    if (f && S.date === D.meta.date_rapport) { const a = document.createElement("a"); a.href = OUT + "cartes/" + encodeURIComponent(f); a.download = f; document.body.appendChild(a); a.click(); a.remove(); return; }
    const host = document.createElement("div"); host.style.cssText = "position:absolute;left:-9999px;top:0;width:1100px"; document.body.appendChild(host);
    const b = document.createElement("section"); b.className = "panel"; host.appendChild(b);
    const ind = MAPIND.find(m => m[0] === S.mapInd)[1];
    b.innerHTML = `<div class="panel-head"><div><h2>ZS ${esc(D.meta.zone_de_sante)}, ${esc(ind)}</h2><p>Situation au ${dfr(S.date)}${S.mapInd === "casper" ? " · " + perTxt() : ""} · ${D.geo ? "contours des aires de santé" : "carte schématique (positions non géographiques)"}</p></div></div><div class="cm"></div>`;
    drawMap(b.querySelector(".cm"));
    G.panelPNG(b, `carte_${S.mapInd}_${D.meta.zone_de_sante}_${S.date}`, `Sources : base de suivi des contacts, liste des cas, SBC, recherche active · Ebola Outbreak, outil de la zone de santé · ${dfr(S.date)}`);
    setTimeout(() => host.remove(), 3000);
  }
  /* ---- dépôt de fichiers et analyse (serveur local) */
  async function loadFiles() {
    const box = $("#up-files"); if (!box) return;
    try { box.innerHTML = filesHTML(await (await fetch("/api/fichiers?zone=" + encodeURIComponent(D.meta.zone_de_sante), { credentials: "same-origin" })).json()); } catch (e) { box.innerHTML = ""; }
  }
  async function upload(files) {
    const log = $("#log"); log.hidden = false;
    for (const f of files) {
      log.textContent += `Envoi de ${f.name} (${nf(f.size / 1e6, 1)} Mo)…\n`;
      const r = await fetch(`/api/televerser?zone=${encodeURIComponent(D.meta.zone_de_sante)}&nom=${encodeURIComponent(f.name)}`, { method: "POST", body: f, credentials: "same-origin" });
      const j = await r.json().catch(() => ({}));
      log.textContent += (r.ok ? `  ✓ copié dans donnees/zs/${D.meta.zone_de_sante}/\n` : `  ✗ ${j.erreur || r.status}\n`);
    }
    log.textContent += "Une copie datée de chaque fichier est gardée dans archives/. Mise à jour automatique : analyse lancée…\n";
    loadFiles();
    runAnalysis(null, true);
  }
  async function runAnalysis(date, auto = false, essais = 180) {
    if (!date && !auto) { S.page = "fichiers"; render(); }
    let log = $("#log"); if (!log && !auto) { alert("Analyse lancée : patientez, la page se rechargera."); }
    const r = await fetch("/api/analyser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: D.meta.zone_de_sante, date: date || null }), credentials: "same-origin" });
    if (r.status === 409 && auto && essais > 0) { setTimeout(() => runAnalysis(date, true, essais - 1), 10000); return; }
    if (!r.ok) { alert((await r.json().catch(() => ({}))).erreur || "Analyse impossible"); return; }
    const poll = async () => { const s = await (await fetch("/api/etat", { credentials: "same-origin" })).json(); log = $("#log"); if (log) { log.hidden = false; log.textContent = s.log; log.scrollTop = log.scrollHeight; } if (s.running) setTimeout(poll, 1200); else if (s.ok) location.reload(); };
    poll();
  }

  if (SERVED) {
    fetch("/api/session", { credentials: "same-origin" }).then(r => r.json()).then(s => {
      if (!s.connecte) { location.href = "connexion.html?suite=" + encodeURIComponent(location.pathname + location.search); return; }
      if (s.role !== "province" && s.zone !== D.meta.zone_de_sante) { location.replace("zs.html?zone=" + encodeURIComponent(s.code)); return; }
      USER = s; render();
    }).catch(() => render());
  } else render();
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
  /* zone sans analyse (ou fichier de la zone refusé par le serveur) : un compte de zone est renvoyé vers sa propre zone ;
     le compte de la zone (ou la province) peut y déposer les fichiers et lancer la première analyse */
  function sansAnalyse() {
    const zq = new URLSearchParams(location.search).get("zone") || "";
    const show = (html, title) => {
      $("#main").innerHTML = html; $("#title").textContent = title || "Zone de santé";
      document.querySelectorAll('.controls [data-go], .controls .field, #periodbar, #side-status').forEach(e => { e.hidden = true; e.style.display = "none"; });
    };
    if (!location.protocol.startsWith("http")) { show(`<div class="empty">Aucune analyse pour cette zone de santé.</div>`); return; }
    fetch("/api/session", { credentials: "same-origin" }).then(r => r.json()).then(async s => {
      if (!s.connecte) { location.href = "connexion.html?suite=" + encodeURIComponent(location.pathname + location.search); return; }
      if (s.role !== "province" && s.code !== zq) { location.replace("zs.html?zone=" + encodeURIComponent(s.code)); return; }
      const zone = s.role === "province" ? (s.codes || {})[zq] : s.zone;
      if (!zone) { show(`<div class="empty">Zone de santé inconnue. <a href="index.html">Retour à la province</a></div>`); return; }
      show(`${s.role === "province" ? `<p><a href="index.html">← Accueil de la province</a></p>` : ""}<section class="panel"><div class="panel-head"><div><h2>Zone de santé de ${esc(zone)}, première analyse</h2><p>Aucune analyse n'a encore été produite pour cette zone. Déposez ses fichiers puis lancez l'analyse.</p></div></div>
        <label class="drop" id="drop0"><input type="file" id="up0" multiple hidden accept=".xlsx,.xlsb,.xls,.xlsm,.ods,.csv,.tsv,.txt,.htm,.html,.zip,.geojson,.json"><b>Déposez les fichiers ici</b><span class="muted small">ou cliquez pour les choisir · l'outil reconnaît chaque fichier par son contenu</span></label>
        <div id="up-files" style="margin-top:12px"></div><p style="margin-top:12px"><button class="btn primary" id="run0">Lancer l'analyse</button></p><div class="log" id="log" hidden></div></section>`, "ZS " + zone);
      const list = async () => { try { $("#up-files").innerHTML = filesHTML(await (await fetch("/api/fichiers?zone=" + encodeURIComponent(zone), { credentials: "same-origin" })).json()); } catch (e) {} };
      const send = async files => { const log = $("#log"); log.hidden = false; for (const f of files) { log.textContent += `Envoi de ${f.name}…\n`; const r = await fetch(`/api/televerser?zone=${encodeURIComponent(zone)}&nom=${encodeURIComponent(f.name)}`, { method: "POST", body: f, credentials: "same-origin" }); const j = await r.json().catch(() => ({})); log.textContent += r.ok ? "  ✓ copié (et copie datée gardée)\n" : `  ✗ ${j.erreur || r.status}\n`; } list(); log.textContent += "Analyse lancée automatiquement…\n"; $("#run0").click(); };
      $("#up0").addEventListener("change", e => send(e.target.files));
      const dz = $("#drop0"); dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over"); }); dz.addEventListener("dragleave", () => dz.classList.remove("over")); dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("over"); send(e.dataTransfer.files); });
      $("#run0").addEventListener("click", async () => {
        const r = await fetch("/api/analyser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone }), credentials: "same-origin" });
        if (!r.ok) { alert((await r.json().catch(() => ({}))).erreur || "Analyse impossible"); return; }
        const poll = async () => { const j = await (await fetch("/api/etat", { credentials: "same-origin" })).json(); const log = $("#log"); log.hidden = false; log.textContent = j.log; log.scrollTop = log.scrollHeight; if (j.running) setTimeout(poll, 1200); else if (j.ok) location.reload(); };
        poll();
      });
      list();
    }).catch(() => show(`<div class="empty">Aucune analyse pour cette zone de santé.</div>`));
  }
})();
