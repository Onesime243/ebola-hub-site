/* Ebola Outbreak Analytics Hub, application (v3) */
(function () {
  "use strict";
  const D = window.DASHBOARD_DATA;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const Ch = window.HubCharts, esc = Ch.esc, col = Ch.col;
  const O = window.HubOutil;
  if (!D) {
    if (O && O.SERVED) O.standalone();
    else document.getElementById("content").innerHTML = '<div class="empty">Données indisponibles : chargez les données dans l’outil (00_INTERFACE).</div>';
    return;
  }
  const PER = (D.meta && D.meta.periode) || null;   // mode période : { debut, fin }
  window.HUB_PERIOD = PER;

  /* ================= Langue ================= */
  let lang = localGet("hub-lang") || "fr";
  window.HubLang = lang;
  const T = s => lang !== "en" ? s : (window.HUB_EN && window.HUB_EN[s]) || (window.HubTr ? window.HubTr(s) : s);
  window.HubT = T;
  const nf = (v, d = 0) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) ? "—" : new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: d }).format(Number(v));
  const pc = (v, d = 1) => v === null || v === undefined ? "—" : nf(v, d) + " %";
  const dfmt = s => { if (!s) return "—"; const d = new Date(s + "T00:00:00"); return isNaN(d) ? s : d.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short", year: "numeric" }); };
  const dshort = s => { if (!s) return ""; const d = new Date(s + "T00:00:00"); return isNaN(d) ? s : d.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short" }); };
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  /* ---- Fenêtre temporelle (3, 7, 14, 21 derniers jours) ---- */
  const REF = () => D.meta.reference_suivi || D.meta.cutoff;
  const addDays = (str, n) => { const d = new Date(str + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const winStart = n => addDays(REF(), -(Number(n) - 1));
  const inWin = (dstr, n) => !Number(n) || (!!dstr && dstr >= winStart(n) && dstr <= (D.meta.cutoff > REF() ? D.meta.cutoff : REF()));
  const contactInWin = (x, n) => !Number(n) || [x.exp, x.v1, x.vl, x.ds, x.fin].some(d => inWin(d, n)) || (x.vu || []).some(d => inWin(d, n)) || (x.nv || []).some(d => inWin(d, n)) ||
    (x.exp && x.fin && x.exp < winStart(n) && x.fin >= winStart(n));
  const PERIODS = [["0", "Tout"], ["3", "3 j"], ["7", "7 j"], ["14", "14 j"], ["21", "21 j"]];
  const periodSeg = key => `<div class="seg" data-seg="${key}">${PERIODS.map(([v, t]) => `<button data-v="${v}" class="${S[key] === v ? "on" : ""}">${T(t)}</button>`).join("")}</div>`;
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }

  /* ================= Référentiels ================= */
  const STATUS = [
    { k: "Devenu confirmé", c: "--st-conf", s: "Devenu cas" }, { k: "Devenu suspect", c: "--st-susp", s: "Suspect" },
    { k: "Non vu >3 j", c: "--st-nv", s: "Non vu >3 j" }, { k: "Vu 1–3 j", c: "--st-v48", s: "Vu 1–3 j" },
    { k: "Vu ≤24 h", c: "--st-v24", s: "Vu ≤24 h" }, { k: "Suivi terminé (21 j)", c: "--st-done", s: "Terminé" },
    { k: "Suivi clôturé incomplet", c: "--st-inc", s: "Incomplet" }, { k: "Doublon", c: "--st-dup", s: "Doublon" }];
  const stColor = s => (STATUS.find(x => x.k === s) || { c: "--st-done" }).c;
  const CLS = { "Confirmé": "--st-conf", "Probable": "--s5", "Suspect": "--st-susp", "Non cas": "--st-done", "En attente / non classé": "--st-inc", "Hors Linelist": "--s7" };
  const clsColor = c => CLS[c] || "--st-inc";
  const RISK = { "Critique": "b-crit", "Élevée": "b-high", "Modérée": "b-mod", "Faible": "b-low" };
  const CONF = { "Élevée": "b-good", "Moyenne": "b-mod", "Faible": "b-high", "Faible, nom discordant": "b-crit", "Non retrouvé": "b-crit" };
  const LINKC = { "Certain": "b-crit", "Probable": "b-high", "À vérifier": "b-mod" };

  const cases = D.cases || [], contacts = D.contacts || [], idxCases = D.index_cases || [];
  const caseBy = new Map(cases.map(c => [c.k, c]));
  const contactBy = new Map(contacts.map(c => [c.k, c]));
  const byIndex = new Map(); contacts.forEach(c => { if (!byIndex.has(c.ix)) byIndex.set(c.ix, []); byIndex.get(c.ix).push(c); });
  const idxBy = new Map(idxCases.map(x => [x.index_key, x]));
  const isPublic = !!(D.meta && D.meta.public_safe);
  const pubParcours = isPublic && !!D.meta.public_parcours;   // site public avec parcours pseudonymisés (ID + initiales)
  const PARCOURS_TABS = new Set(["index", "journey", "recon"]);
  /* ---- Générations du réseau de contact tracing : 1 = cas index + ses contacts ; 2 = au moins un contact devenu cas
         ayant lui-même des contacts listés ; etc. ---- */
  const strongLink = x => x.lk && (x.lkc === "Certain" || x.lkc === "Probable") && x.st !== "Doublon";
  const NET = (() => {
    const memo = new Map();
    const info = (k, stack = new Set()) => {
      if (memo.has(k)) return memo.get(k);
      if (stack.has(k)) return { depth: 1, size: 0, cases: 0 };
      stack.add(k);
      let depth = 1, size = 0, cs = 0;
      (byIndex.get(k) || []).forEach(x => { if (x.st === "Doublon") return; size++; if (x.st === "Devenu confirmé") cs++;
        if (strongLink(x) && x.lk !== k && byIndex.has(x.lk)) { const sub = info(x.lk, stack); depth = Math.max(depth, 1 + sub.depth); size += sub.size; cs += sub.cases; } });
      stack.delete(k);
      const r = { depth, size, cases: cs }; memo.set(k, r); return r;
    };
    return { info: k => info(k), depth: k => info(k).depth };
  })();
  const genOk = (k, g) => !Number(g) || NET.depth(k) === Number(g);
  const GENS = [["0", "Toutes"], ["1", "1 génération"], ["2", "2 générations"], ["3", "3 générations"], ["4", "4 générations"]];

  /* ================= État & routage ================= */
  const S = {
    tab: "overview", province: "Toutes", zone: "", caseKey: "", nodeSel: "", netLayout: "radial", netDepth: 2,
    curveBy: "notification", mapMetric: "cas", mapPeriod: "14", mapFocus: "1", jrPeriod: "0", dlPeriod: "0", zoneSel: "", follLevel: "zone", follZone: "Toutes",
    idxQuery: "", idxActive: false, idxConf: "Toutes", idxZone: "Toutes", chain: "", chainLayout: "time",
    lab: "Tous", nowH: 30, fLevel: "National", fTerr: "National", fTarget: "confirmes", fH: 30, tables: {},
    ovStack: "aucun", netIcons: true, gen: "0", idxPeriod: "0", ssSet: "", ssPlace: "Tous", ssMin: "2", ssCases: true, dynG: "National", growBase: "dds", growWin: "12s", dyStack: "sexe", dyBase: "o", dyDays: "60", rtDays: "120",
    siCmp: false, rlWin: "28j", projH: "30", distK: "dds_notification", recZone: "", recSup: "0.3", recColor: "issue", recX: "onset", recIcons: true, recDoc: false, epiMin: "3", resZone: "", perfG: "National",
    rtmG: "National", rtmSet: "all", rtmDays: "120", zrCat: "Toutes", rtmMode: "zones", iclG: "National", rtzProv: "Toutes", rtzG: "National", rtzTau: "7", rtzDays: "60", opTab: "deces", opProv: "Toutes", opWin: "cumul", opZone: "Toutes", opCte: "Tous", opD1: "", opD2: "", opCls: "c", opChamp: "Tous", zrColor: "categorie", zrLab: "score", zrSel: "", pplProv: "Toutes", sitNiv: "national"
  };
  const TABS = [
    { id: "overview", t: "Vue générale", g: "Situation", i: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
    { id: "territories", t: "Territoires", g: "Situation", i: "M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" },
    { id: "maps", t: "Cartes pour rapport", g: "Situation", i: "M15 4 9 2 3 4v18l6-2 6 2 6-2V2zM9 4.4l6 2v13.2l-6-2z" },
    { id: "riskzones", t: "Zones à risque", g: "Situation", i: "M12 2 1 21h22L12 2zm1 15h-2v2h2zm0-7h-2v5h2z" },
    { id: "index", t: "Cas index", g: "Contact tracing", i: "M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z", priv: true },
    { id: "journey", t: "Parcours du cas", g: "Contact tracing", i: "M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 18c0-3.9 3.1-7 7-7s7 3.1 7 7H5zM19 3l3 3-3 3", priv: true },
    { id: "chains", t: "Chaînes de transmission", g: "Contact tracing", i: "M7 7a3 3 0 1 1-2 5.2L10 15a3 3 0 1 1-.8 1.8L4.3 14A3 3 0 0 1 7 7zm10-4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" },
    { id: "recon", t: "Reconstruction de la transmission", g: "Contact tracing", i: "M4 5h4v4H4zm12 0h4v4h-4zM10 15h4v4h-4zM6 9v2h4v4h2v-4h4V9h-2v2H8V9z", priv: true },
    { id: "dynamics", t: "Dynamique de transmission", g: "Analyses", i: "M3 19h18v2H3zM4 15l4-6 4 3 5-8 3 2-6.6 10.3-4-3L6.2 16.4z" },
    { id: "rtm", t: "Nombre de reproduction (Rt)", g: "Analyses", i: "M3 19h18v2H3zM3 12h4l3-7 4 14 3-7h4v2h-3l-4 9-4-14-2 5H3z" },
    { id: "ppl", t: "Personnel de santé (PPL)", g: "Analyses", i: "M10 2h4v4h4v4h-4v4h-4v-4H6V6h4zM4 18h16v3H4z" },
    { id: "ops", t: "Opérations par zone (EDS, CTE, swabs, PPL)", g: "Analyses", i: "M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm13 0h2v3h3v2h-3v3h-2v-3h-3v-2h3z" },
    { id: "children", t: "Enfants (0–18 ans)", g: "Analyses", i: "M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-4 8h8l-1 6h-1v6h-4v-6H9z" },
    { id: "labs", t: "Laboratoires", g: "Analyses", i: "M9 2h6v2h-1v5l5 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l5-9V4H9z" },
    { id: "nowcast", t: "Nowcasting", g: "Analyses", i: "M3 17l6-6 4 4 8-8v4h2V3h-8v2h4l-6 6-4-4-8 8z" },
    { id: "forecast", t: "Prévisions", g: "Analyses", i: "M3 20h18v2H3zm2-3l4-5 4 3 6-8 1.6 1.2-7.2 9.6-4-3L6.6 18z" },
    { id: "alerts", t: "Surveillance des alertes", g: "Linelist lln", i: "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.9V4h-2v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1z" },
    { id: "eds", t: "Décès et EDS", g: "Linelist lln", i: "M10 2h4v6h6v4h-6v10h-4V12H4V8h6z" },
    { id: "clinic", t: "Symptômes et clinique", g: "Linelist lln", i: "M12 21l-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.2z" },
    { id: "lab2", t: "Laboratoire (Ct, délais)", g: "Linelist lln", i: "M9 2h6v2h-1v5l5 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l5-9V4H9z" },
    { id: "pec", t: "Prise en charge, vaccination, expositions", g: "Linelist lln", i: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4z" },
    { id: "situation", t: "Situation par province", g: "Réunions", i: "M4 3h16v18H4zm3 4v2h10V7zm0 4v2h10v-2zm0 4v2h6v-2z" },
    { id: "indicateurs", t: "Indicateurs du pilier surveillance", g: "Réunions", i: "M3 3h18v18H3zm2 2v4h4V5zm6 0v4h8V5zm-6 6v4h4v-4zm6 0v4h8v-4zm-6 6v2h4v-2zm6 0v2h8v-2z", role: "lecteur", pub: true },
    { id: "presentation", t: "Présentation", g: "Réunions", i: "M3 4h18v2H3zm1 3h16v10H4zm7 11h2v3h-2zm-4 3h10v1H7zM7 14l3-4 2 2 3-4 2 6z", role: "lecteur", pub: true },
    { id: "upload", t: "Charger les données", g: "Données", i: "M5 20h14v-2H5zm7-16-5 5h3v6h4V9h3z", priv: true, role: "analyste" },
    { id: "comptes", t: "Comptes", g: "Administration", i: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z", priv: true, role: "admin" },
    { id: "publication", t: "Publication en ligne", g: "Administration", i: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15 15 0 0 0-1.3-3.9A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4zm.8 2h3a15 15 0 0 0 1.3 3.9A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-3.9A15 15 0 0 0 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.3 5.9a15 15 0 0 0 1.3-3.9h3a8 8 0 0 1-4.3 3.9zm1.7-5.9a16 16 0 0 0 0-4h3.4a8 8 0 0 1 0 4z", priv: true, role: "admin" }
  ].filter(t => !(isPublic && t.priv && !(pubParcours && PARCOURS_TABS.has(t.id))))
   .filter(t => !t.role || !O || !(window.HUB_USER) || O.can(t.role));

  function readHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
    if (h[0] && TABS.some(t => t.id === h[0])) S.tab = h[0];
    if (S.tab === "journey" && h[1]) S.caseKey = h[1];
    if (S.tab === "chains" && h[1]) S.chain = h[1];
  }
  function go(tab, param) {
    S.tab = tab;
    if (tab === "journey" && param !== undefined) { S.caseKey = param; S.nodeSel = ""; }
    if (tab === "chains" && param !== undefined) S.chain = param;
    const h = "#/" + tab + (param ? "/" + encodeURIComponent(param) : "");
    if (location.hash !== h) history.pushState(null, "", h);
    render(); window.scrollTo({ top: 0 });
  }
  addEventListener("popstate", () => { readHash(); render(); });

  /* ================= Filtres ================= */
  const inProv = x => S.province === "Toutes" || (x.province || x.prov) === S.province;
  const zones = () => (D.zones || []).filter(inProv);
  const areas = () => (D.areas || []).filter(inProv);

  /* ================= Petits composants HTML ================= */
  function panel(title, sub, body, opts = {}) {
    const tools = (opts.tools || "") + (opts.png ? `<button class="btn sm" data-png="${esc(opts.png)}" title="${T("Télécharger PNG")}">⤓ PNG</button>` : "") + (opts.csv ? `<button class="btn sm" data-csv="${esc(opts.csv)}" title="${T("Exporter CSV")}">⤓ CSV</button>` : "");
    return `<section class="panel ${opts.cls || ""}" ${opts.id ? `id="${opts.id}"` : ""}><div class="panel-head"><div>${opts.eyebrow ? `<div class="eyebrow">${T(opts.eyebrow)}</div>` : ""}<h2>${T(title)}</h2>${sub ? `<p>${sub}</p>` : ""}</div><div class="panel-tools">${tools}</div></div>${body}</section>`;
  }
  function kpi(label, value, note, o = {}) {
    return `<div class="kpi ${o.cls || ""} ${o.go ? "clickable" : ""}" ${o.go ? `data-go="${o.go}"` : ""}><div class="label">${o.color ? `<i class="dot" style="background:${col(o.color)}"></i>` : ""}${T(label)}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ""}${o.meter !== undefined && o.meter !== null ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, o.meter))}%;background:${col(o.meterColor || "--brand-2")}"></i></div>` : ""}</div>`;
  }
  const badge = (text, cls = "", dot) => `<span class="badge ${cls}">${dot ? `<i style="background:${col(dot)}"></i>` : ""}${esc(T(text))}</span>`;
  const statusBadge = s => badge(s, "", stColor(s));
  function stackbar(counts, total) {
    total = total || STATUS.reduce((s, x) => s + (counts[x.k] || 0), 0);
    if (!total) return `<div class="stackbar"></div>`;
    return `<div class="stackbar" title="${STATUS.filter(x => counts[x.k]).map(x => `${T(x.k)} : ${counts[x.k]}`).join(" · ")}">${STATUS.filter(x => counts[x.k]).map(x => `<i style="width:${100 * counts[x.k] / total}%;background:${col(x.c)}"></i>`).join("")}</div>`;
  }
  function hbars(rows, label, value, o = {}) {
    const a = [...rows].filter(r => Number(r[value]) > 0).sort((x, y) => Number(y[value]) - Number(x[value])).slice(0, o.limit || 12);
    if (!a.length) return `<div class="empty">${T("Aucune donnée")}</div>`;
    const m = Math.max(...a.map(r => Number(r[value])));
    return `<div class="hbars">${a.map(r => `<div class="hbar ${o.click ? "clickable" : ""}" ${o.click ? `data-${o.click}="${esc(r[label])}"` : ""}><span title="${esc(r[label])}">${esc(T(r[label]))}</span><div class="track"><i style="width:${Math.max(1, 100 * Number(r[value]) / m)}%;background:${col(typeof o.color === "function" ? o.color(r) : (o.color || "--s1"))}"></i></div><b>${o.pct ? pc(r[value], 1) : nf(r[value], o.d || 0)}</b></div>`).join("")}</div>`;
  }
  function legend(items) { return `<div class="legend">${items.map(x => `<span><i class="${x.round ? "round" : ""}" style="background:${col(x.c)}"></i>${esc(T(x.t))}${x.n !== undefined ? ` <b>${nf(x.n)}</b>` : ""}</span>`).join("")}</div>`; }

  /* ---- Table triable ---- */
  const TABLES = {};
  function table(id, rows, cols, o = {}) {
    const st = S.tables[id] || (S.tables[id] = { sort: o.sort || null, dir: o.dir || -1, limit: o.limit || 60, q: "" });
    let r = rows;
    if (st.q) { const q = norm(st.q); r = r.filter(x => cols.some(c => norm(typeof c.v === "function" ? c.txt?.(x) ?? "" : x[c.k]).includes(q)) || norm(o.searchText ? o.searchText(x) : "").includes(q)); }
    if (st.sort) { const c = cols.find(c => c.k === st.sort); if (c) { const f = c.sortv || (x => x[c.k]); r = [...r].sort((a, b) => { const va = f(a), vb = f(b); if (va === vb) return 0; if (va === null || va === undefined || va === "") return 1; if (vb === null || vb === undefined || vb === "") return -1; return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * st.dir; }); } }
    TABLES[id] = { rows: r, cols };
    const shown = r.slice(0, st.limit);
    const head = cols.map(c => `<th class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}" data-sort="${id}|${c.k}">${esc(T(c.t))}${st.sort === c.k ? `<span class="arrow">${st.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("");
    const body = shown.map(x => `<tr class="${o.rowClick ? "clickable" : ""} ${o.selected && o.selected(x) ? "selected" : ""}" ${o.rowClick ? `data-row="${id}|${esc(o.rowKey(x))}"` : ""}>${cols.map(c => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}">${c.v ? c.v(x) : (c.num ? nf(x[c.k], c.d || 0) : esc(T(x[c.k] ?? "—")))}</td>`).join("")}</tr>`).join("");
    const bar = o.search !== false ? `<div class="table-bar"><input type="search" data-tsearch="${id}" placeholder="${T("Filtrer le tableau…")}" value="${esc(st.q)}"><span class="count">${nf(r.length)} ${T("lignes")}</span></div>` : "";
    return `${bar}<div class="table-wrap" style="${o.maxh ? `max-height:${o.maxh}px` : ""}"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">${T("Aucune ligne")}</td></tr>`}</tbody></table></div>${r.length > shown.length ? `<button class="btn sm more" data-more="${id}">${T("Afficher plus")} (${nf(r.length - shown.length)})</button>` : ""}`;
  }
  function toCSV(id) {
    const t = TABLES[id]; if (!t) return;
    const strip = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const lines = [t.cols.map(c => T(c.t)).join(";")].concat(t.rows.map(x => t.cols.map(c => `"${strip(c.csv ? c.csv(x) : c.v ? c.v(x) : x[c.k]).replace(/"/g, '""')}"`).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = id + "_" + (D.meta.cutoff || "") + ".csv"; a.click();
  }

  /* ================= VUE GÉNÉRALE ================= */
  function overview() {
    const k = D.kpis, r = D.riposte || {}, p = D.period14, s = D.sources.sitrep || {};
    const stale = s.perime && !PER ? "alert" : "", srcNote = PER ? `${T("Période")} · ${T("source Linelist")}` : s.perime ? `<b style="color:${col("--critical")}">⚠ ${T("SitRep à mettre à jour")}</b>` : `${T("Cumul · source SitRep")}${s.date_sitrep ? " · " + dfmt(s.date_sitrep) : ""}`;
    const sitRows = Object.entries(s.labels || {}).filter(([kk]) => (s.indicateurs || {})[kk] !== null && (s.indicateurs || {})[kk] !== undefined);
    const alerts = buildAlerts();
    const zs = zones().filter(z => z.confirmes_14j > 0 || z.contacts_actifs > 0).sort((a, b) => b.confirmes_14j - a.confirmes_14j || b.contacts_actifs - a.contacts_actifs);
    const fromPdf = !PER && s.source_pdf;
    const plus = v => v === null || v === undefined ? "" : ` · <b>+${nf(v)}</b> ${T("en 24 h")}`;
    const sitTiles = fromPdf ? `
    <div class="sitrep-head"><span class="sitrep-badge">SitRep N° ${esc(String(s.numero || "—"))}</span> ${T("Chiffres officiels nationaux, rapport du")} <b>${dfmt(s.date_sitrep)}</b>${s.date_publication ? `, ${T("publié le")} ${dfmt(s.date_publication)}` : ""} · <span class="muted">${esc(s.source_pdf)}</span>${(s.avertissements || []).length ? ` · <b style="color:${col("--critical")}">⚠ ${esc(s.avertissements.join(" ; "))}</b>` : ""}</div>
    <div class="grid g6">
      ${kpi("Cumul des cas", nf(k.confirmes), `${T("Cas confirmés")}${plus(s.nouveaux_cas_24h)}`, { color: "--s2" })}
      ${kpi("Cumul des décès confirmés", nf(k.deces_confirmes), `${T("Décès")}${plus(s.deces_24h)}`, { color: "--critical" })}
      ${kpi("Létalité", pc(k.letalite_pct), T("Décès confirmés / cas confirmés"), { color: "--ink-2" })}
      ${kpi("Patients en isolement / CTE", k.isolement === null || k.isolement === undefined ? "N/C" : nf(k.isolement), T("Fin de journée, toutes provinces"), { color: "--s1" })}
      ${kpi("Cumul des guéris", k.gueris === null ? "N/C" : nf(k.gueris), T("Sorties guéries cumulées"), { color: "--good" })}
      ${kpi("Taux de suivi des contacts", pc(k.suivi_contacts_pct), s.contacts_a_suivre ? `${nf(s.contacts_vus)} / ${nf(s.contacts_a_suivre)} ${T("vus (du jour) · cible 95 %")}` : T("Du jour · cible 95 %"), { color: "--st-v24", cls: k.suivi_contacts_pct < 95 ? "alert" : "good", meter: k.suivi_contacts_pct, meterColor: k.suivi_contacts_pct < 95 ? "--critical" : "--good" })}
    </div>` : `
    <div class="grid g4">
      ${kpi("Cas confirmés", nf(k.confirmes), srcNote, { color: "--s2", cls: stale })}
      ${kpi("Décès", nf(k.deces_confirmes), srcNote, { color: "--critical", cls: stale })}
      ${kpi("Guéris", k.gueris === null ? "N/C" : nf(k.gueris), srcNote, { color: "--good", cls: stale })}
      ${kpi("Létalité", pc(k.letalite_pct), stale ? srcNote : T("Décès / confirmés"), { color: "--ink-2", cls: stale })}
    </div>`;
    return `${sitTiles}
    <div class="grid g5">
      ${kpi("Confirmés sur 14 jours", nf(p.confirmes), `${dshort(p.start)} → ${dshort(p.end)} · ${nf(p.deces_confirmes)} ${T("décès")}`)}
      ${kpi("Nouveaux cas connus comme contacts", pc(r.pct_nouveaux_cas_connus_contacts), T("Confirmés 14 j déjà listés comme contacts"), { cls: r.pct_nouveaux_cas_connus_contacts < 50 ? "alert" : "good", meter: r.pct_nouveaux_cas_connus_contacts, meterColor: r.pct_nouveaux_cas_connus_contacts < 50 ? "--critical" : "--good", go: "chains" })}
      ${kpi("Contacts en suivi actif", nf(r.contacts_actifs), `${T("Fenêtre de 21 jours ouverte")} · ${nf(r.cas_index_suivi_en_cours)} ${T("cas index")}`, {})}
      ${kpi("Contacts vus ≤24 h", pc(r.pct_contacts_vus_24h), `${nf(r.contacts_vus_24h)} / ${nf(r.contacts_actifs)} · ${dshort(r.date_reference_suivi)}`, { cls: r.pct_contacts_vus_24h < 80 ? "alert" : "good", meter: r.pct_contacts_vus_24h, meterColor: r.pct_contacts_vus_24h < 80 ? "--critical" : "--good" })}
      ${kpi("Contacts non vus >3 j", nf(r.contacts_non_vus_48h), T("À rechercher en priorité"), { cls: r.contacts_non_vus_48h > 0 ? "alert" : "good" })}
    </div>
    <div class="grid g21">
      ${panel("Courbe épidémique hebdomadaire", T("Cas confirmés par semaine (lundi) et décès confirmés, semaine en cours exclue car incomplète"), `<div id="c-epi"></div>`, { png: "courbe_epidemique", tools: `<div class="seg" data-seg="curveBy"><button data-v="notification" class="${S.curveBy === "notification" ? "on" : ""}">${T("Notification")}</button><button data-v="dds" class="${S.curveBy === "dds" ? "on" : ""}">${T("Début des symptômes")}</button></div><div class="seg" data-seg="ovStack"><button data-v="aucun" class="${S.ovStack === "aucun" ? "on" : ""}">${T("Total")}</button><button data-v="sexe" class="${S.ovStack === "sexe" ? "on" : ""}">${T("Par sexe")}</button><button data-v="age" class="${S.ovStack === "age" ? "on" : ""}">${T("Par âge")}</button><button data-v="prov" class="${S.ovStack === "prov" ? "on" : ""}">${T("Par province")}</button></div>` })}
      ${panel("Points d’attention", T("Générés automatiquement à partir des données du jour"), `<div class="alerts">${alerts.map(a => `<div class="alert-item ${a.lvl}"><span class="ic">${a.lvl === "crit" ? "!" : a.lvl === "warn" ? "!" : a.lvl === "good" ? "✓" : "i"}</span><div>${a.html}</div></div>`).join("")}</div>`)}
    </div>
    <div class="grid g21">
      ${panel("Zones de santé, 14 derniers jours", T("Cliquer une ligne pour ouvrir la zone"), table("ov-zones", zs, [
        { k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" },
        { k: "confirmes_14j", t: "Confirmés 14 j", num: true }, { k: "deces_14j", t: "Décès 14 j", num: true },
        { k: "pct_nouveaux_cas_connus_contacts", t: "% connus contacts", num: true, v: x => x.pct_nouveaux_cas_connus_contacts === null ? "—" : pc(x.pct_nouveaux_cas_connus_contacts, 0) },
        { k: "contacts_actifs", t: "Contacts actifs", num: true }, { k: "contacts_non_vus", t: "Non vus >3 j", num: true },
        { k: "niveau_risque", t: "Risque", v: x => x.niveau_risque && x.niveau_risque !== "nan" ? badge(x.niveau_risque, RISK[x.niveau_risque]) : "—", sortv: x => x.risk_score }],
        { sort: "confirmes_14j", rowClick: true, rowKey: x => x.zone_sante, limit: 15, maxh: 420 }), { csv: "ov-zones" })}
      ${panel("Pyramide des âges", T("Cas confirmés par sexe et groupe d’âge"), pyramid())}
    </div>
    <div class="grid g2">
      ${panel("Délais opérationnels", T("Médiane hebdomadaire en jours, cas confirmés"), `<div class="flex small muted" style="margin-bottom:6px">${[["dds_notification", "DDS → notification"], ["dds_prelevement", "DDS → prélèvement"], ["prelevement_resultat", "Prélèvement → résultat"], ["dds_admission", "DDS → admission"]].map(([k, t]) => `<span class="badge">${T(t)} : <b>&nbsp;${nf(D.delays?.[k], 1)} j</b></span>`).join("")}</div><div id="c-delays"></div>`, { png: "delais" })}
      ${PER ? panel("Source des chiffres clés", "", `<div class="notice">${T("En mode période, les chiffres clés sont calculés à partir de la Linelist (cas notifiés pendant la période). Le SitRep, qui donne des cumuls à la date du jour, est utilisé seulement pour la vue complète.")}</div>`) : fromPdf ? sitrepProvPanel() : panel("Source officielle des chiffres clés", esc(s.methode || ""), `${s.image ? `<img src="${esc(s.image)}" alt="SitRep" style="max-width:100%;max-height:300px;border-radius:8px;display:block;margin:auto">` : `<div class="empty">${T("Image SitRep non disponible")}</div>`}${sitRows.length ? `<table style="margin-top:10px"><tbody>${sitRows.map(([kk, lb]) => `<tr><td>${esc(T(lb))}</td><td class="num"><b>${kk.endsWith("_pct") ? pc(s.indicateurs[kk]) : nf(s.indicateurs[kk])}</b></td></tr>`).join("")}</tbody></table>` : ""}<div class="notice ${s.perime ? "crit" : s.validation_requise ? "warn" : ""}">${s.perime ? `<b>${T("L’image SitRep a changé mais les chiffres n’ont pas été mis à jour.")}</b> ${T("Lancez 05_METTRE_A_JOUR_SITREP (saisie guidée) ou installez Tesseract OCR, puis relancez l’actualisation.")}` : s.validation_requise ? T("Chiffres issus du fichier de validation manuelle : vérifier avant diffusion.") : T("Cohérence arithmétique OCR validée.")} ${T("Toutes les autres analyses proviennent des fichiers Linelist et Contact tracing.")}</div>`)}
    </div>
    ${fromPdf ? sitrepExtraPanels() : ""}
    ${perfPanel()}`;
  }
  /* ---- SitRep PDF : provinces, évolution, concordance avec la Linelist ---- */
  function sitrepProvPanel() {
    const s = D.sources.sitrep || {}, pil = Object.fromEntries((s.provinces_piliers || []).map(x => [x.province, x]));
    const rows = (s.provinces || []).map(p => ({ ...p, ...(pil[p.province] || {}) }));
    return panel("SitRep : situation par province", `${T("Tableau 1 et texte des piliers du SitRep N°")} ${esc(String(s.numero || ""))}, ${T("lus automatiquement")}`, table("sr-prov", rows, [
      { k: "province", t: "Province" }, { k: "nouveaux_24h", t: "Nouv. 24 h", num: true }, { k: "cas", t: "Cas cumulés", num: true }, { k: "deces", t: "Décès", num: true },
      { k: "letalite_pct", t: "Létalité", v: x => pc(x.letalite_pct, 1) }, { k: "zs_actives", t: "ZS actives", v: x => `${nf(x.zs_actives)}/${nf(x.zs_total)}` },
      { k: "suivi_contacts_pct", t: "Suivi contacts", v: x => x.suivi_contacts_pct === undefined ? "—" : pc(x.suivi_contacts_pct, 1), sortv: x => x.suivi_contacts_pct },
      { k: "isolement", t: "En isolement", num: true }, { k: "eds_non_realises_24h", t: "EDS non réalisés 24 h", num: true }, { k: "corps_swabes_24h", t: "Corps swabés 24 h", num: true }],
      { search: false, sort: "cas" }), { csv: "sr-prov" });
  }
  function sitrepExtraPanels() {
    const s = D.sources.sitrep || {}, h = s.historique || [], conc = D.sitrep_concordance || [];
    const hist = h.length >= 2 ? panel("Évolution selon les SitRep déposés", `${h.length} ${T("SitRep lus")} (${dfmt(h[0].date_rapport)} → ${dfmt(h[h.length - 1].date_rapport)})`, `<div class="grid g2"><div id="c-sr-cum"></div><div id="c-sr-suivi"></div></div>`, { png: "evolution_sitrep" })
      : `<div class="notice small">${T("Déposez chaque jour le SitRep PDF (SitRep_MVEBDB_n°_jj_mm_aaaa.pdf) dans data/ : l’outil reconstitue l’évolution des chiffres officiels à partir de tous les SitRep déposés.")}</div>`;
    const big = conc.filter(x => Math.abs(x.ecart_cas) >= 5).length;
    return `${hist}${conc.length ? panel("Concordance SitRep / Linelist par zone de santé", `${T("Cas et décès cumulés du tableau 2 du SitRep comparés à la Linelist ; écart = SitRep − Linelist")}, ${nf(big)} ${T("zone(s) avec un écart d’au moins 5 cas")}`, table("sr-conc", conc, [
      { k: "province", t: "Province" }, { k: "zone_sante", t: "Zone de santé" }, { k: "cas_sitrep", t: "Cas SitRep", num: true }, { k: "cas_linelist", t: "Cas Linelist", num: true },
      { k: "ecart_cas", t: "Écart", num: true, v: x => `<b style="color:${Math.abs(x.ecart_cas) >= 5 ? col("--critical") : "inherit"}">${x.ecart_cas > 0 ? "+" : ""}${nf(x.ecart_cas)}</b>`, sortv: x => Math.abs(x.ecart_cas) },
      { k: "deces_sitrep", t: "Décès SitRep", num: true }, { k: "deces_linelist", t: "Décès Linelist", num: true }, { k: "nouveaux_24h", t: "Nouv. 24 h", num: true }],
      { sort: "ecart_cas", maxh: 420 }), { csv: "sr-conc" }) : ""}`;
  }
  function sitrepCharts() {
    const h = (D.sources.sitrep || {}).historique || [];
    if (h.length < 2 || !$("#c-sr-cum")) return;
    const rows = h.map(x => ({ date: x.date_rapport, cas: x.confirmes, deces: x.deces, gueris: x.gueris, suivi: x.suivi_contacts_pct, iso: x.isolement }));
    Ch.xy($("#c-sr-cum"), { data: rows, x: "date", xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), height: 230, title: T("Cumuls officiels"), series: [{ key: "cas", label: T("Cumul des cas"), color: "--s2", type: "line" }, { key: "deces", label: T("Cumul des décès confirmés"), color: "--critical", type: "line" }, { key: "gueris", label: T("Cumul des guéris"), color: "--good", type: "line" }] });
    Ch.xy($("#c-sr-suivi"), { data: rows, x: "date", xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), height: 230, yFmt: v => nf(v, 0) + " %", series: [{ key: "suivi", label: T("Taux de suivi des contacts"), color: "--st-v24", type: "line" }], hlines: [{ y: 95, color: "--good", legend: T("cible 95 %") }] });
  }
  function overviewCharts() {
    sitrepCharts();
    perfCharts();
    const cut = D.meta.cutoff, full = x => addDays(x.week, 6) <= cut;
    const w = (D.weekly || []).filter(full).slice(-24);
    const key = S.curveBy === "dds" ? "confirmes_par_dds" : "confirmes";
    if (S.ovStack !== "aucun" && D.dynamique && D.dynamique.epicourbes) {
      const base = S.curveBy === "dds" ? "o" : "n", agg = new Map();
      const provs = [...new Set(D.dynamique.epicourbes.hebdo.filter(r => r[5] === 1).map(r => r[2]))];
      const ptot = {}; D.dynamique.epicourbes.hebdo.forEach(r => { if (r[5] === 1) ptot[r[2]] = (ptot[r[2]] || 0) + r[6]; });
      const topP = provs.sort((a, b) => ptot[b] - ptot[a]).slice(0, 5);
      D.dynamique.epicourbes.hebdo.forEach(r => { if (r[0] !== base || r[5] !== 1 || (S.province !== "Toutes" && r[2] !== S.province)) return; const o = agg.get(r[1]) || { week: r[1], M: 0, F: 0, I: 0, a0: 0, a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, pAutres: 0 }; o[r[3]] += r[6]; o["a" + r[4]] += r[6]; const pk = topP.includes(r[2]) ? "p" + topP.indexOf(r[2]) : "pAutres"; o[pk] = (o[pk] || 0) + r[6]; agg.set(r[1], o); });
      const rows = [...agg.values()].filter(full).sort((a, b) => a.week.localeCompare(b.week)).slice(-24);
      const PC = ["--s1", "--s2", "--s3", "--s4", "--s7"];
      const series = S.ovStack === "age" ? (D.dynamique.classes_age || []).map((a, i) => ({ key: "a" + i, label: a === "Inconnu" ? T("Âge inconnu") : a + " " + T("ans"), color: AGEC[i] }))
        : S.ovStack === "prov" ? [...topP.map((p, i) => ({ key: "p" + i, label: p, color: PC[i] })), { key: "pAutres", label: T("Autres provinces"), color: "--st-inc" }]
        : ["M", "F", "I"].map(k => ({ key: k, label: T(SEXL[k]), color: SEXC[k] }));
      Ch.xy($("#c-epi"), { data: rows, x: "week", stacked: true, height: 280, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), series });
    } else
    Ch.xy($("#c-epi"), { data: w, x: "week", xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), height: 280,
      series: [{ key, label: S.curveBy === "dds" ? T("Confirmés (semaine de début des symptômes)") : T("Confirmés (semaine de notification)"), color: "--s2" },
        { key: "deces", label: T("Décès confirmés"), color: "--critical", type: "line" }] });
    Ch.xy($("#c-delays"), { data: (D.delays_weekly || []).filter(full).slice(-16), x: "week", xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), height: 230, digits: 1,
      series: [{ key: "dds_notification", label: T("DDS → notification"), color: "--s1", type: "line" }, { key: "dds_prelevement", label: T("DDS → prélèvement"), color: "--s2", type: "line" },
        { key: "prelevement_resultat", label: T("Prélèvement → résultat"), color: "--s3", type: "line" }, { key: "dds_admission", label: T("DDS → admission"), color: "--s7", type: "line" }] });
  }
  function pyramid() {
    const rows = D.pyramid || []; if (!rows.length) return `<div class="empty">${T("Aucune donnée")}</div>`;
    const F = "Féminin", M = "Masculin", mx = Math.max(1, ...rows.flatMap(r => [r[F] || 0, r[M] || 0]));
    return `<div style="display:grid;grid-template-columns:1fr 54px 1fr;gap:5px 6px;align-items:center;font-size:12px">
      <div class="muted" style="text-align:right">${T("Hommes")} ${Ch.sexIconHTML("M", col("--sex-m"), 18)}</div><div></div><div class="muted">${Ch.sexIconHTML("F", col("--sex-f"), 18)} ${T("Femmes")}</div>
      ${rows.map(r => `<div style="display:flex;justify-content:flex-end;align-items:center;gap:6px"><span class="muted">${nf(r[M] || 0)}</span><i style="display:block;height:14px;border-radius:4px 0 0 4px;width:${100 * (r[M] || 0) / mx}%;background:${col("--sex-m")}"></i></div><div style="text-align:center;font-weight:600">${esc(T(r.groupe_age))}</div><div style="display:flex;align-items:center;gap:6px"><i style="display:block;height:14px;border-radius:0 4px 4px 0;width:${100 * (r[F] || 0) / mx}%;background:${col("--sex-f")}"></i><span class="muted">${nf(r[F] || 0)}</span></div>`).join("")}</div>`;
  }
  function buildAlerts() {
    const r = D.riposte || {}, out = [], zs = zones();
    if (D.sources?.sitrep?.perime) out.push({ lvl: "crit", html: `<b>${T("Chiffres SitRep non mis à jour")}</b>, ${T("l’image SitRep a changé : lancez 05_METTRE_A_JOUR_SITREP.")}` });
    (D.preprocessing?.avertissements || []).filter(w => w.startsWith("ALERTE")).forEach(w => out.push({ lvl: "crit", html: esc(w) }));
    const nv = [...zs].sort((a, b) => b.contacts_non_vus - a.contacts_non_vus).filter(z => z.contacts_non_vus > 0).slice(0, 3);
    if (r.contacts_non_vus_48h > 0) out.push({ lvl: "crit", html: `<b>${nf(r.contacts_non_vus_48h)} ${T("contacts non vus depuis plus de 3 jours (perdus de vue)")}</b>, ${nv.map(z => `${esc(z.zone_sante)} (${nf(z.contacts_non_vus)})`).join(", ")}.` });
    if (r.pct_nouveaux_cas_connus_contacts !== null && r.pct_nouveaux_cas_connus_contacts < 50) out.push({ lvl: "crit", html: `<b>${pc(r.pct_nouveaux_cas_connus_contacts)} ${T("des nouveaux confirmés étaient connus comme contacts")}</b>, ${T("la majorité des chaînes de transmission échappe au suivi ; renforcer l’investigation et le listage.")}` });
    const nc = D.nowcast || {};
    if (nc.probabilite_croissance_pct >= 70) out.push({ lvl: "warn", html: `<b>${T("Croissance probable")}</b> : ${pc(nc.probabilite_croissance_pct)} ${T("après correction des retards de notification.")}` });
    const newz = zs.filter(z => z.confirmes_14j > 0 && z.confirmes - z.confirmes_14j === 0);
    if (newz.length) out.push({ lvl: "warn", html: `<b>${T("Nouvelles zones touchées (14 j)")}</b> : ${newz.map(z => esc(z.zone_sante)).join(", ")}.` });
    if (r.sorties_suivi_3j) out.push({ lvl: "info", html: `${nf(r.sorties_suivi_3j)} ${T("contacts terminent leur suivi dans les 3 prochains jours.")}` });
    if (r.cas_index_hors_linelist) out.push({ lvl: "info", html: `${nf(r.cas_index_hors_linelist)} ${T("cas index du contact tracing sont absents de la Linelist (identifiants à réconcilier).")}` });
    const ch = D.chains?.stats; if (ch && ch.actives_21j) out.push({ lvl: "info", html: `${nf(ch.actives_21j)} ${T("chaînes de transmission actives sur 21 jours")} (${T("jusqu’à")} ${nf(ch.generations_max)} ${T("générations")}).` });
    if (!out.length) out.push({ lvl: "good", html: T("Aucun signal critique détecté.") });
    return out.slice(0, 7);
  }

  /* ================= TERRITOIRES ================= */
  /* ---- Échelles « feu tricolore » épidémiologiques (vert → jaune → orange → rouge) ---- */
  // palette « feu tricolore » atténuée (tons pastel, bordures blanches) : favorable → vigilance → alerte → critique
  const TL = ["#A3C98F", "#EBDD92", "#EEB98A", "#E0927C", "#BD6F68"];
  const TL_NA = "--map-na";
  // type : count (quantiles des valeurs > 0), up (seuils, élevé = défavorable), down (seuils, élevé = favorable)
  const MAPM = [
    { g: "Cas", k: "cas", t: "Cas confirmés + probables", type: "count", per: true },
    { g: "Cas", k: "confirmes", t: "Cas confirmés", type: "count", per: true },
    { g: "Cas", k: "suspects", t: "Cas suspects", type: "count", per: true },
    { g: "Cas", k: "alertes", t: "Alertes notifiées", type: "count", per: true },
    { g: "Cas", k: "deces_confirmes", t: "Décès confirmés", type: "count", per: true },
    { g: "Cas", k: "letalite_pct", t: "Létalité (%)", type: "up", br: [20, 35, 50, 70], unit: "%", d: 1, per: true },
    { g: "Cas", k: "positivite_pct", t: "Positivité laboratoire (%)", type: "up", br: [5, 10, 20, 40], unit: "%", d: 1, per: true },
    { g: "Cas", k: "variation_pct", t: "Variation vs période précédente (%)", type: "up", br: [-20, 0, 25, 100], unit: "%", d: 0, per: true, noAll: true },
    { g: "Suivi des contacts", k: "nouveaux_contacts", t: "Nouveaux contacts listés", type: "count", per: true, good: true },
    { g: "Suivi des contacts", k: "contacts_devenus_cas", t: "Contacts devenus cas", type: "count", per: true },
    { g: "Suivi des contacts", k: "pct_connus_contacts", t: "% nouveaux confirmés connus comme contacts", type: "down", br: [20, 40, 60, 80], unit: "%", d: 0, per: true },
    { g: "Suivi des contacts", k: "contacts_actifs", t: "Contacts actifs (aujourd’hui)", type: "count" },
    { g: "Suivi des contacts", k: "contacts_non_vus", t: "Contacts perdus de vue > 3 j (aujourd’hui)", type: "count" },
    { g: "Suivi des contacts", k: "pct_vus_24h", t: "% contacts vus ≤ 24 h (aujourd’hui)", type: "down", br: [20, 40, 60, 80], unit: "%", d: 0 },
    { g: "Dynamique et risque", k: "rt", t: "Rt de la zone (dernier consolidé)", type: "up", br: [.8, 1, 1.2, 1.5], d: 2 },
    { g: "Dynamique et risque", k: "risk_score", t: "Score de risque (priorisation)", type: "up", br: [25, 50, 65, 75], d: 1 },
    { g: "Dynamique et risque", k: "resurgence", t: "Score de risque de résurgence", type: "up", br: [20, 35, 50, 65], d: 0 },
    { g: "Dynamique et risque", k: "jours_depuis_dernier_cas", t: "Jours depuis le dernier cas confirmé", type: "down", br: [7, 14, 21, 42], d: 0 }];
  const PERIODS_T = [["7", "7 jours"], ["14", "14 jours"], ["21", "21 jours"], ["tout", "Depuis le début"]];
  function metricDef() { const m = MAPM.find(x => x.k === S.mapMetric) || MAPM[0]; if (m.noAll && S.mapPeriod === "tout") S.mapPeriod = "14"; return m; }
  function zonePeriodRows() {
    const rows = ((D.zones_periodes || {})[S.mapPeriod] || []).filter(inProv);
    const res = new Map(((D.resurgence || {}).zones || []).map(z => [z.zone_sante, z]));
    return rows.map(r => ({ ...r, resurgence: res.has(r.zone_sante) ? res.get(r.zone_sante).score : null, categorie_res: res.has(r.zone_sante) ? res.get(r.zone_sante).categorie : null }));
  }
  function classesFor(m, rows) {
    // renvoie [{lo, hi, color, label}]
    const f = (v) => nf(v, m.d ?? 0);
    if (m.type === "count") {
      const v = rows.map(r => Number(r[m.k]) || 0).filter(x => x > 0).sort((a, b) => a - b);
      const q = p => v.length ? v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))] : 1;
      let b = [q(.25), q(.5), q(.75)].map(Math.round); b = [...new Set(b.map(x => Math.max(1, x)))];
      const cuts = [0, ...b], out = [{ lo: 0, hi: 0, color: m.good ? TL[4] : TL[0], label: "0" }];
      const pal = m.good ? [TL[3], TL[2], TL[1], TL[0]] : [TL[1], TL[2], TL[3], TL[4]];
      for (let i = 0; i < cuts.length; i++) {
        const lo = cuts[i] + 1, hi = i + 1 < cuts.length ? cuts[i + 1] : Infinity;
        if (hi < lo) continue;
        out.push({ lo, hi, color: pal[Math.min(pal.length - 1, i + (4 - cuts.length))], label: hi === Infinity ? `≥ ${f(lo)}` : lo === hi ? f(lo) : `${f(lo)}–${f(hi)}` });
      }
      return out;
    }
    const br = m.br, pal = m.type === "up" ? [TL[0], TL[1], TL[2], TL[3], TL[4]] : [TL[4], TL[3], TL[2], TL[1], TL[0]];
    const u = m.unit === "%" ? " %" : "";
    return [{ lo: -Infinity, hi: br[0], color: pal[0], label: `< ${f(br[0])}${u}` }, { lo: br[0], hi: br[1], color: pal[1], label: `${f(br[0])}–${f(br[1])}${u}` },
      { lo: br[1], hi: br[2], color: pal[2], label: `${f(br[1])}–${f(br[2])}${u}` }, { lo: br[2], hi: br[3], color: pal[3], label: `${f(br[2])}–${f(br[3])}${u}` }, { lo: br[3], hi: Infinity, color: pal[4], label: `≥ ${f(br[3])}${u}` }];
  }
  const classOf = (cls, m, v) => { if (v === null || v === undefined || Number.isNaN(v)) return null; if (m.type === "count") return cls.find(c => v >= c.lo && v <= c.hi) || cls[cls.length - 1]; return cls.find(c => v >= c.lo && v < c.hi) || cls[cls.length - 1]; };
  function territories() {
    const m = metricDef(), zsP = zonePeriodRows(), zs = zones();
    if (!S.zoneSel || !zs.some(z => z.zone_sante === S.zoneSel)) S.zoneSel = (zs.slice().sort((a, b) => b.confirmes_14j - a.confirmes_14j)[0] || {}).zone_sante || "";
    const z = zs.find(x => x.zone_sante === S.zoneSel) || {}, zp = zsP.find(x => x.zone_sante === S.zoneSel) || {};
    const ar = areas().filter(a => a.zone_sante === z.zone_sante);
    const risk = (D.risk_scores || []).find(x => x.zone_sante === z.zone_sante) || {};
    const res = ((D.resurgence || {}).zones || []).find(x => x.zone_sante === z.zone_sante);
    const perLbl = T((PERIODS_T.find(p => p[0] === S.mapPeriod) || [])[1] || "");
    const groupsOpt = [...new Set(MAPM.map(x => x.g))].map(g => `<optgroup label="${esc(T(g))}">${MAPM.filter(x => x.g === g).map(x => `<option value="${x.k}" ${S.mapMetric === x.k ? "selected" : ""}>${T(x.t)}</option>`).join("")}</optgroup>`).join("");
    const cls = classesFor(m, zsP), cz = classOf(cls, m, zp[m.k]);
    return `
    <div class="flex" style="margin-bottom:12px">
      <span class="small muted">${T("Période")}</span>${segBtns("mapPeriod", PERIODS_T.filter(p => !(m.noAll && p[0] === "tout")))}
      <label class="field">${T("Indicateur de la carte")}<select data-state="mapMetric">${groupsOpt}</select></label>
      ${segBtns("mapFocus", [["1", "Zones touchées"], ["", "Vue complète"]])}
      <span class="small muted">${m.per ? `${T("Indicateur calculé sur")} : <b>${perLbl}</b> (${T("jusqu’au")} ${dshort(D.meta.cutoff)})` : T("Indicateur instantané (situation du jour), indépendant de la période")}</span>
    </div>
    <div class="grid g21">
      ${panel(`${T(m.t)}${m.per ? ", " + perLbl : ""}`, T("Couleurs épidémiologiques : vert = situation favorable, jaune = vigilance, orange = alerte, rouge = situation critique ; gris = aucune donnée"), `<div id="c-map"></div>`, { png: "carte_" + m.k + "_" + S.mapPeriod })}
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">${esc(z.province || "")}</div><h2>${esc(z.zone_sante || "—")}</h2></div><div class="panel-tools"><select data-state="zoneSel">${zs.map(x => `<option ${x.zone_sante === z.zone_sante ? "selected" : ""}>${esc(x.zone_sante)}</option>`).join("")}</select></div></div>
        ${cz ? `<div class="notice" style="border-color:${cz.color}"><b>${T(m.t)}</b> : ${zp[m.k] === null || zp[m.k] === undefined ? "—" : nf(zp[m.k], m.d ?? 0) + (m.unit === "%" ? " %" : "")} <span class="badge" style="background:${cz.color};color:#2b2b2b">${cz.label}</span></div>` : ""}
        <div class="grid g2" style="margin-bottom:8px">
          ${kpi(`${T("Confirmés")} · ${perLbl}`, nf(zp.confirmes), `${nf(zp.probables)} ${T("probables")} · ${nf(zp.suspects)} ${T("suspects")}`)}
          ${kpi(`${T("Décès confirmés")} · ${perLbl}`, nf(zp.deces_confirmes), zp.letalite_pct !== null && zp.letalite_pct !== undefined ? `${T("Létalité")} ${pc(zp.letalite_pct, 1)}` : "")}
          ${kpi("Contacts actifs", nf(zp.contacts_actifs), `${pc(zp.pct_vus_24h, 0)} ${T("vus ≤24 h")}`)}
          ${kpi("Perdus de vue > 3 j", nf(zp.contacts_non_vus), `${nf(z.sorties_3j)} ${T("sorties ≤3 j")}`, { cls: zp.contacts_non_vus > 0 ? "alert" : "" })}
        </div>
        <div class="statgrid">${stat("Rt de la zone", zp.rt !== null && zp.rt !== undefined ? fmtR(zp.rt) : "—", zp.rt_p_sup_1 !== null && zp.rt_p_sup_1 !== undefined ? `P(R > 1) = ${pc(100 * zp.rt_p_sup_1, 0)}` : "")}${stat("Variation", zp.variation_pct !== null && zp.variation_pct !== undefined ? pctS(zp.variation_pct) : "—", T("vs période précédente"))}${stat("Dernier cas confirmé", zp.jours_depuis_dernier_cas !== null && zp.jours_depuis_dernier_cas !== undefined ? `${nf(zp.jours_depuis_dernier_cas)} ${T("j")}` : "—", "")}${stat("Résurgence", res ? nf(res.score, 0) + "/100" : "—", res ? T(res.categorie) : "")}</div>
        <div class="flex" style="margin-top:8px"><span class="small muted">${T("Niveau de risque")}</span>${risk.niveau_risque ? badge(risk.niveau_risque, RISK[risk.niveau_risque]) : "—"}<span class="small muted">${esc(T(risk.explication || ""))}</span></div>
        <h3 class="small" style="margin:14px 0 6px">${T("Actions prioritaires 24–48 h")}</h3>${zoneActions(z, risk)}
      </section>
    </div>
    <div class="grid g2">
      ${panel("Tendance quotidienne (90 jours)", esc(z.zone_sante || ""), `<div id="c-zone"></div>`, { png: "tendance_zone" })}
      ${panel("Aires de santé de la zone", T("Cas et suivi des contacts"), table("ter-areas", ar, [{ k: "aire_sante", t: "Aire de santé" }, { k: "confirmes", t: "Confirmés", num: true }, { k: "deces_confirmes", t: "Décès", num: true }, { k: "contacts", t: "Contacts", num: true }, { k: "contacts_actifs", t: "Actifs", num: true }, { k: "contacts_non_vus", t: "Non vus >3 j", num: true }, { k: "taux_vus_24h_pct", t: "% vus ≤24 h", num: true, v: x => pc(x.taux_vus_24h_pct, 0) }], { sort: "confirmes", maxh: 330 }), { csv: "ter-areas" })}
    </div>
    ${panel(`${T("Toutes les zones de santé")}, ${perLbl}`, T("Tri par colonne ; clic pour sélectionner ; la pastille reprend la couleur de la carte"), table("ter-zones", zsP, [
      { k: "province", t: "Province" }, { k: "zone_sante", t: "Zone de santé", v: x => { const c = classOf(cls, m, x[m.k]); return `<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${c ? c.color : col(TL_NA)}"></span>${esc(x.zone_sante)}`; }, csv: x => x.zone_sante },
      { k: "cas", t: "Conf. + prob.", num: true }, { k: "confirmes", t: "Confirmés", num: true }, { k: "suspects", t: "Suspects", num: true }, { k: "deces_confirmes", t: "Décès", num: true },
      { k: "letalite_pct", t: "Létalité %", num: true, d: 1 }, { k: "variation_pct", t: "Variation %", num: true, v: x => x.variation_pct === null || x.variation_pct === undefined ? "—" : pctS(x.variation_pct) },
      { k: "nouveaux_contacts", t: "Nouveaux contacts", num: true }, { k: "contacts_actifs", t: "Actifs", num: true }, { k: "contacts_non_vus", t: "Perdus de vue >3 j", num: true },
      { k: "pct_connus_contacts", t: "% connus contacts", num: true, v: x => x.pct_connus_contacts === null || x.pct_connus_contacts === undefined ? "—" : pc(x.pct_connus_contacts, 0) },
      { k: "rt", t: "Rt", num: true, d: 2 }, { k: "risk_score", t: "Score de risque", num: true, d: 1 }, { k: "resurgence", t: "Résurgence", num: true, d: 0 }],
      { sort: m.k, rowClick: true, rowKey: x => x.zone_sante, selected: x => x.zone_sante === S.zoneSel }), { csv: "ter-zones" })}`;
  }
  function zoneActions(z, risk) {
    const it = [];
    if (z.contacts_non_vus > 0) it.push(`${T("Rechercher sous 24 h les")} <b>${nf(z.contacts_non_vus)}</b> ${T("contacts non vus depuis plus de 3 jours (perdus de vue).")}`);
    if (z.contacts_actifs > 0) it.push(`${T("Assurer la visite quotidienne des")} <b>${nf(z.contacts_actifs)}</b> ${T("contacts en suivi")} (${pc(z.taux_vus_24h_pct, 0)} ${T("vus ≤24 h")}).`);
    if (z.confirmes_14j > 0 && (z.pct_nouveaux_cas_connus_contacts ?? 0) < 50) it.push(`${T("Seuls")} ${pc(z.pct_nouveaux_cas_connus_contacts ?? 0, 0)} ${T("des nouveaux cas étaient connus comme contacts : investigation approfondie et listage autour des")} <b>${nf(z.confirmes_14j)}</b> ${T("nouveaux cas.")}`);
    if (z.deces_14j > 0) it.push(`${T("Réconcilier les")} ${nf(z.deces_14j)} ${T("décès récents avec les EDS (enterrements dignes et sécurisés) et le laboratoire.")}`);
    if (z.sorties_3j > 0) it.push(`${T("Préparer la clôture du suivi de")} ${nf(z.sorties_3j)} ${T("contacts (fin ≤3 jours).")}`);
    const res = ((D.resurgence || {}).zones || []).find(x => x.zone_sante === z.zone_sante);
    if (res && /Résurgence|Alerte/.test(res.categorie)) it.push(`<b>${T(res.categorie)}</b> : ${T("renforcer la recherche active de cas et la surveillance communautaire ; vérifier la chaîne d’origine des nouveaux cas.")}`);
    if (risk && risk.risk_score >= 50) it.push(`${T("Revue de coordination renforcée (risque")} ${esc(T(risk.niveau_risque))}).`);
    if (!it.length) it.push(T("Maintenir la surveillance active et la recherche active de cas."));
    return `<ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px">${it.slice(0, 6).map(x => `<li>${x}</li>`).join("")}</ol>`;
  }
  function territoriesCharts() {
    const m = metricDef(), rows = zonePeriodRows(), cls = classesFor(m, rows);
    const byZ = new Map(rows.map(z => [String(z.zone_sante).toUpperCase(), z]));
    const feats = (D.map_zones || []).filter(f => S.province === "Toutes" || norm(f.province) === norm(S.province));
    const val = f => { const r = byZ.get(String(f.data_zone).toUpperCase()); if (!r) return null; const v = r[m.k]; return v === null || v === undefined ? null : Number(v); };
    const touched = f => { const r = byZ.get(String(f.data_zone).toUpperCase()); return !!r && ((((D.zones_periodes || {}).tout || []).find(x => x.zone_sante === r.zone_sante) || {}).cas > 0); };
    const legendHTML = `<span>${T(m.t)}</span>${cls.map(c => `<span class="flex" style="gap:4px"><i style="display:inline-block;width:14px;height:10px;border-radius:2px;background:${c.color}"></i>${c.label}</span>`).join("")}<span class="flex" style="gap:4px"><i style="display:inline-block;width:14px;height:10px;border-radius:2px;background:${col(TL_NA)}"></i>${T("aucune donnée")}</span>`;
    Ch.choropleth($("#c-map"), { features: feats, focus: S.mapFocus, focusIf: touched, value: val, selected: S.zoneSel, digits: m.d ?? 0,
      colorFn: v => { const c = classOf(cls, m, v); return c ? c.color : col(TL_NA); }, legendHTML,
      labelIf: f => { const v = val(f); return v !== null && (m.type !== "count" || v > 0) && touched(f); }, labelRank: f => { const r = byZ.get(String(f.data_zone).toUpperCase()); return r ? (r.cas || 0) : 0; },
      tip: (f, v) => { const r = byZ.get(String(f.data_zone).toUpperCase()) || {}; return `<b>${esc(f.data_zone)}</b><div class="row"><span>${T(m.t)}</span><b>${v === null ? "—" : nf(v, m.d ?? 1)}${m.unit === "%" && v !== null ? " %" : ""}</b></div><div class="row"><span>${T("Confirmés")}</span><b>${nf(r.confirmes)}</b></div><div class="row"><span>${T("Décès")}</span><b>${nf(r.deces_confirmes)}</b></div><div class="row"><span>${T("Contacts actifs")}</span><b>${nf(r.contacts_actifs)}</b></div>`; },
      onClick: f => { S.zoneSel = f.data_zone; render(); } });
    const tr = (D.zone_daily || []).filter(r => r.zone_sante === S.zoneSel);
    const g = {}; tr.forEach(r => { const d = r.date; g[d] ??= { date: d, alertes: 0, confirmes: 0, contacts_vus: 0 }; g[d].alertes += r.alertes; g[d].confirmes += r.confirmes; g[d].contacts_vus += r.contacts_vus; });
    const rws = Object.values(g).sort((a, b) => a.date.localeCompare(b.date));
    const per = S.mapPeriod === "tout" ? 0 : Number(S.mapPeriod), i0 = per ? rws.findIndex(r => r.date >= addDays(D.meta.cutoff, -(per - 1))) : -1;
    Ch.xy($("#c-zone"), { data: rws, x: "date", xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), height: 250, shade: i0 >= 0 ? { from: i0, label: T("période") } : null, series: [{ key: "confirmes", label: T("Confirmés"), color: "--s2" }, { key: "alertes", label: T("Alertes"), color: "--s1", type: "line", markers: false }] });
  }

  /* ================= SUIVI DES CONTACTS ================= */
  function followup() {
    const r = D.riposte || {};
    const pz = S.province === "Toutes" ? contacts : contacts.filter(c => c.prov === S.province);
    const pub = !contacts.length;
    const act = pz.filter(c => ["Vu ≤24 h", "Vu 1–3 j", "Non vu >3 j"].includes(c.st));
    const counts = {}; pz.forEach(c => counts[c.st] = (counts[c.st] || 0) + 1);
    if (pub) (D.followup_status || []).forEach(x => counts[x.statut] = x.contacts);
    const nv = act.filter(c => c.st === "Non vu >3 j" && (S.follZone === "Toutes" || c.zs === S.follZone));
    const soon = act.filter(c => days(D.meta.reference_suivi, c.fin) <= 3 && (S.follZone === "Toutes" || c.zs === S.follZone));
    const zlist = ["Toutes", ...new Set(act.map(c => c.zs).filter(Boolean))].sort();
    const lvl = S.follLevel === "zone" ? zones() : areas();
    const idxLbl = c => { const x = caseBy.get(c.ix); return x ? (x.id || c.ix) : c.ix.replace(/^EXT-/, ""); };
    const v24 = pub ? (r.contacts_vus_24h || 0) : act.filter(c => c.st === "Vu ≤24 h").length;
    const nAct = pub ? (r.contacts_actifs || 0) : act.length, nAll = pub ? Object.values(counts).reduce((a, b) => a + b, 0) : pz.length;
    const nSoon = pub ? (r.sorties_suivi_3j || 0) : act.filter(c => days(D.meta.reference_suivi, c.fin) <= 3).length;
    return `
    <div class="notice"><b>${T("Date de référence du suivi")} : ${dfmt(D.meta.reference_suivi)}</b>, ${T("dernière date de visite disponible. Un contact est « actif » tant que sa fenêtre de 21 jours après la dernière exposition est ouverte.")}</div>
    <div class="grid g5">
      ${kpi("Contacts en suivi actif", nf(nAct), `${nf(nAll)} ${T("contacts listés au total")}`, { color: "--s1" })}
      ${kpi("Vus ≤24 h", pc(nAct ? 100 * v24 / nAct : null), `${nf(v24)} ${T("contacts")}`, { color: "--st-v24", meter: nAct ? 100 * v24 / nAct : 0, meterColor: "--good" })}
      ${kpi("Non vus >3 j", nf(counts["Non vu >3 j"] || 0), T("À rechercher en priorité"), { cls: counts["Non vu >3 j"] ? "alert" : "good", color: "--st-nv" })}
      ${kpi("Fin de suivi ≤3 jours", nf(nSoon), T("Préparer la clôture"))}
      ${kpi("Suivi complet sur 21 jours", pc(r.pct_suivi_complet_21j), `${T("Complétude moyenne des visites")} : ${pc(r.completude_moyenne_suivi_pct, 0)}`, { meter: r.pct_suivi_complet_21j })}
    </div>
    ${panel("Statut de suivi de tous les contacts", `${T("Répartition à la date de référence (1 contact = 1 statut)")}, ${T("pourcentages calculés sur")} ${nf(nAll)} ${T("contacts listés (hors doublons pour les taux)")}`, `${stackbar(counts)}<div style="height:10px"></div>${statusTable(counts)}`)}
    ${suspectPanel(pz, pub)}
    ${recoPanel()}
    <div class="grid g2">
      ${panel("Contacts à suivre et contacts vus par jour", T("42 derniers jours"), `<div id="c-fu"></div>`, { png: "suivi_quotidien" })}
      ${panel("Proportion de contacts vus par jour", T("Contacts vus / contacts à suivre"), `<div id="c-fu2"></div>`, { png: "taux_vus" })}
    </div>
    ${panel("Charge de suivi par territoire", T("Tri par colonne"), table("fu-geo", lvl.filter(x => x.contacts > 0), [
      ...(S.follLevel === "zone" ? [{ k: "zone_sante", t: "Zone de santé" }] : [{ k: "zone_sante", t: "Zone de santé" }, { k: "aire_sante", t: "Aire de santé" }]),
      { k: "contacts", t: "Contacts", num: true }, { k: "contacts_actifs", t: "Actifs", num: true }, { k: "contacts_vus_24h", t: "Vus ≤24 h", num: true },
      { k: "taux_vus_24h_pct", t: "% vus ≤24 h", num: true, v: x => pc(x.taux_vus_24h_pct, 0) }, { k: "contacts_non_vus", t: "Non vus >3 j", num: true },
      { k: "sorties_3j", t: "Sorties ≤3 j", num: true }, { k: "contacts_devenus_suspects", t: "Devenus suspects (cumul)", num: true }, { k: "contacts_suspects_en_attente", t: "Suspects issue en attente", num: true }, { k: "contacts_devenus_cas", t: "Devenus cas", num: true },
      { k: "completude_suivi_pct", t: "Complétude %", num: true, v: x => progress(x.completude_suivi_pct), sortv: x => x.completude_suivi_pct }],
      { sort: "contacts_actifs" }), { csv: "fu-geo", tools: `<div class="seg" data-seg="follLevel"><button data-v="zone" class="${S.follLevel === "zone" ? "on" : ""}">${T("Zones")}</button><button data-v="aire" class="${S.follLevel === "aire" ? "on" : ""}">${T("Aires")}</button></div>` })}
    ${isPublic ? "" : panel("Télécharger les listes (Excel)", `${T("Un onglet par province, trié par zone de santé puis aire de santé ; un onglet de synthèse.")} ${S.province === "Toutes" ? T("Toutes les provinces") : `${T("Province")} : ${esc(S.province)}`}`, `
      <div class="flex" style="margin-bottom:12px"><span class="small muted">${T("Période")}</span>${periodSeg("dlPeriod")}<span class="small muted">${Number(S.dlPeriod) ? `${dshort(winStart(S.dlPeriod))} → ${dshort(REF())}` : T("Toute la période")}</span></div>
      <div class="grid g3" style="margin-bottom:0">
        ${[["suspects", "Contacts suspects, issue à documenter", "--st-susp", "Déclarés suspects dans la période, ni confirmés ni redevenus « Non cas »"],
           ["nonvus", "Contacts non vus (>3 j)", "--st-nv", "Dernière visite où le contact a été vu (ou enregistrement s’il n’a jamais été vu) dans la période"],
           ["incomplet", "Suivi clôturé incomplet", "--st-inc", "Fin de la fenêtre de 21 jours dans la période"]].map(([k, t, c2, h]) => { const n = listRows(k).length;
          return `<div class="kpi"><div class="label"><i class="dot" style="background:${col(c2)}"></i>${T(t)}</div><div class="value">${nf(n)}</div><div class="note">${T(h)}</div><button class="btn primary" style="margin-top:10px" data-xlsx="${k}" ${n ? "" : "disabled"}>⤓ ${T("Télécharger Excel")}</button></div>`; }).join("")}
      </div>
      <div class="notice">${T("Listes pseudonymisées (identifiant et initiales). Les mêmes listes avec les noms sont générées à chaque actualisation dans outputs/confidentiel/LISTES_AAAAMMJJ/.")}</div>`)}
    ${isPublic ? "" : `<div class="grid g2">
      ${panel("Contacts à rechercher (non vus >3 j)", T("Liste pseudonymisée, la liste nominative est dans outputs/confidentiel"), table("fu-nv", nv, [
        { k: "id", t: "ID contact" }, { k: "ini", t: "Init." }, { k: "zs", t: "Zone" }, { k: "as", t: "Aire" },
        { k: "vl", t: "Dernier vu", v: x => x.vl ? dshort(x.vl) : T("jamais"), sortv: x => x.vl || "" },
        { k: "jdv", t: "Jours sans visite", num: true, v: x => x.vl ? nf(days(x.vl, D.meta.reference_suivi)) : "—", sortv: x => x.vl ? days(x.vl, D.meta.reference_suivi) : 999 },
        { k: "rnv", t: "Motif" }, { k: "ix", t: "Cas index", v: x => `<a href="#/journey/${encodeURIComponent(x.ix)}">${esc(idxLbl(x))}</a>`, csv: x => idxLbl(x) }],
        { sort: "jdv", dir: -1, maxh: 420 }), { csv: "fu-nv", tools: `<select data-state="follZone">${zlist.map(z => `<option ${z === S.follZone ? "selected" : ""}>${esc(T(z))}</option>`).join("")}</select>` })}
      ${panel("Fin de suivi dans les 3 prochains jours", T("Vérifier la dernière visite puis clôturer"), table("fu-soon", soon, [
        { k: "id", t: "ID contact" }, { k: "ini", t: "Init." }, { k: "zs", t: "Zone" }, { k: "fin", t: "Fin prévue", v: x => dshort(x.fin) },
        { k: "jv", t: "Jours vus", num: true, v: x => `${x.jv}/${x.ja}` }, { k: "st", t: "Statut", v: x => statusBadge(x.st), csv: x => x.st },
        { k: "ix", t: "Cas index", v: x => `<a href="#/journey/${encodeURIComponent(x.ix)}">${esc(idxLbl(x))}</a>`, csv: x => idxLbl(x) }], { sort: "fin", dir: 1, maxh: 420 }), { csv: "fu-soon" })}
    </div>`}${genPanel()}`;
  }


  /* ---- Statut : tableau effectif + % (dénominateur explicite) ---- */
  function statusTable(counts) {
    const tot = Object.entries(counts).filter(([k]) => k !== "Doublon").reduce((a, [, v]) => a + v, 0);
    const rows = STATUS.filter(x => counts[x.k]);
    return `<div class="status-grid">${rows.map(x => `<div class="st-cell"><i style="background:${col(x.c)}"></i><span>${esc(T(x.k))}</span><b>${nf(counts[x.k])}</b><em>${x.k === "Doublon" ? T("exclus") : pc(tot ? 100 * counts[x.k] / tot : null, 1)}</em></div>`).join("")}</div>
      <div class="small muted" style="margin-top:6px">${T("« Devenu suspect » = contact déclaré suspect dont l’issue n’est pas encore documentée ; un suspect redevenu « Non cas » reprend le statut de sa fenêtre de suivi ; un suspect confirmé passe en « Devenu confirmé ».")}</div>`;
  }

  /* ---- Contacts devenus suspects : cumul et issue ---- */
  function suspectPanel(pz, pub) {
    const r = D.riposte || {};
    let n, nAll, conf, inf, wait;
    if (pub || !pz.length) { n = r.contacts_devenus_suspects; nAll = D.reconciliation?.contacts || 0; conf = r.contacts_suspects_devenus_cas; inf = r.contacts_suspects_infirmes; wait = r.contacts_suspects_en_attente; }
    else {
      const nd = pz.filter(c => c.st !== "Doublon"), s = nd.filter(c => c.sc === "S" || c.ds);
      n = s.length; nAll = nd.length; conf = s.filter(c => c.st === "Devenu confirmé").length; inf = s.filter(c => c.si && c.st !== "Devenu confirmé").length; wait = s.filter(c => c.st === "Devenu suspect").length;
    }
    if (!n) return "";
    const allCas = pub || !pz.length ? r.contacts_devenus_cas : pz.filter(c => c.st === "Devenu confirmé").length;
    const k = (lab, v, den, denLab, color, note) => `<div class="kpi"><div class="label"><i class="dot" style="background:${col(color)}"></i>${T(lab)}</div><div class="value">${nf(v)}</div><div class="note"><b>${pc(den ? 100 * v / den : null, 1)}</b> ${T("de")} ${nf(den)} ${T(denLab)}${note ? `<br>${note}` : ""}</div></div>`;
    return panel("Contacts devenus suspects", `${S.province === "Toutes" ? T("Toutes les provinces") : esc(S.province)}, ${T("contact déclaré « suspect » (ou symptômes notés) à au moins une visite, puis issue documentée au suivi ou dans la Linelist")}`, `
      <div class="grid g4" style="margin-bottom:8px">
        ${k("Devenus suspects (cumul)", n, nAll, "contacts listés", "--st-susp")}
        ${k("Suspects devenus cas", conf, n, "suspects", "--st-conf", `${T("soit")} ${pc(allCas ? 100 * conf / allCas : null, 0)} ${T("des contacts devenus cas étaient d’abord signalés suspects")}`)}
        ${k("Suspicion levée (« Non cas »)", inf, n, "suspects", "--st-done")}
        ${k("Issue non documentée", wait, n, "suspects", "--warn", T("À investiguer : résultat du test ou classification à saisir"))}
      </div>
      <div class="stackbar">${[[conf, "--st-conf", "Suspects devenus cas"], [inf, "--st-done", "Suspicion levée"], [wait, "--warn", "Issue non documentée"]].filter(x => x[0]).map(([v, c, t]) => `<i title="${T(t)} : ${nf(v)}" style="width:${100 * v / n}%;background:${col(c)}"></i>`).join("")}</div>`, { cls: "suspects-panel" });
  }
  /* ---- Réconciliation Linelist ↔ Contact tracing ---- */
  function recoPanel() {
    const rc = D.reconciliation || {}; if (!rc.cas) return "";
    const pp = D.preprocessing?.journal || [];
    const visits = rc.visites !== undefined ? rc.visites : (pp.find(x => x.etape && x.etape.startsWith("Lignes de suivi lues")) || {}).apres;
    const gen = (pp.find(x => x.etape === "Génération des candidats (4 passes)") || {}).detail || "";
    // ligne : libellé complet (retour à la ligne), effectif, % avec son dénominateur explicite, barre proportionnelle
    const bar = (label, n, tot, color, note, den) => `<div class="mrow"><div class="mrow-top"><span class="mrow-l">${esc(T(label))}</span><b class="mrow-n">${nf(n)}</b><span class="mrow-p">${den === null ? "" : tot ? `${pc(100 * n / tot, 1)} <span class="muted">${T("de")} ${esc(T(den || "la ligne de base"))}</span>` : "—"}</span></div><div class="track"><i style="width:${tot ? Math.max(.5, Math.min(100, 100 * n / tot)) : 0}%;background:${col(color)}"></i></div>${note ? `<div class="small muted mrow-note">${note}</div>` : ""}</div>`;
    const miss = contacts.filter(c => c.sc && !["Certain", "Probable"].includes(c.lkc) && inProv(c));
    const pz = (rc.par_zone || []).filter(z => z.cas > 0).filter(z => S.province === "Toutes" || (zones().some(x => x.zone_sante === z.zone_sante)));
    return `
    ${panel("Réconciliation Linelist ↔ Contact tracing", T("Contrôle d’exhaustivité : chaque contact, chaque cas index et chaque contact devenu cas est recherché dans l’autre base"), `
      <div class="grid g3 reco-grid" style="margin-bottom:0">
        <div class="reco-col"><h3>${T("1. Contact tracing → cas index")}</h3>
          ${visits ? bar("Visites de suivi lues", visits, visits, "--s1", "", null) : ""}
          ${bar("Contacts uniques consolidés (hors doublons)", rc.contacts, rc.contacts, "--s1", "", null)}
          ${bar("Rattachés à un cas index de la Linelist", rc.contacts_index_linelist, rc.contacts, "--good", "", "contacts")}
          ${bar("Cas index hors Linelist (conservés)", rc.contacts_index_hors_linelist, rc.contacts, "--warn", T("Aucun contact n’est perdu : les contacts sans cas index retrouvé restent visibles sous un cas index externe."), "contacts")}
        </div>
        <div class="reco-col"><h3>${T("2. Contacts déclarés « Confirmé » ou « Suspect » au suivi → Linelist")}</h3>
          ${bar("Déclarés « Confirmé » au suivi", rc.suivi_confirme, rc.contacts, "--st-conf", "", "contacts")}
          ${bar("… retrouvés dans la Linelist (lien certain / probable)", rc.suivi_confirme_retrouves, rc.suivi_confirme, "--good", "", "déclarés « Confirmé »")}
          ${bar("… candidat à vérifier", rc.suivi_confirme_a_verifier, rc.suivi_confirme, "--warn", "", "déclarés « Confirmé »")}
          ${bar("Déclarés « Suspect » au moins une fois", rc.suivi_suspect, rc.contacts, "--st-susp", "", "contacts")}
          ${bar("… retrouvés dans la Linelist (lien certain / probable)", rc.suivi_suspect_retrouves, rc.suivi_suspect, "--good", "", "suspects")}
          ${rc.suivi_suspect_devenus_cas !== undefined ? bar("… devenus cas confirmés / probables", rc.suivi_suspect_devenus_cas, rc.suivi_suspect, "--st-conf", "", "suspects") : ""}
          ${rc.suivi_suspect_infirmes !== undefined ? bar("… suspicion levée (« Non cas »)", rc.suivi_suspect_infirmes, rc.suivi_suspect, "--st-done", "", "suspects") : ""}
          ${rc.suivi_suspect_en_attente !== undefined ? bar("… issue non documentée", rc.suivi_suspect_en_attente, rc.suivi_suspect, "--warn", "", "suspects") : ""}
        </div>
        <div class="reco-col"><h3>${T("3. Cas de la Linelist → contact tracing")}</h3>
          ${bar("Cas confirmés + probables", rc.cas, rc.cas, "--s2", "", null)}
          ${bar("Ayant eux-mêmes des contacts listés", rc.cas_avec_contacts_listes, rc.cas, "--s1", "", "cas")}
          ${bar("Connus comme contacts avant d’être cas", rc.cas_connus_contacts, rc.cas, "--good", "", "cas")}
          ${bar("Source connue (contact listé ou source déclarée)", rc.cas_source_connue, rc.cas, "--s3", "", "cas")}
          ${bar("Déclarent un contact avec un malade, non retrouvés", rc.cas_contact_malade_oui_non_retrouves, rc.cas, "--critical", "", "cas")}
          ${bar("Sans aucun lien (ni source, ni contacts)", rc.cas_sans_lien, rc.cas, "--st-inc", "", "cas")}
        </div>
      </div>
      ${interp("Lecture", [
        `${T("Appariement en 4 passes")} : ${esc(gen)}.`,
        `${T("Contacts « Confirmé » au suivi retrouvés avec certitude")} : <b>${nf(rc.suivi_confirme_retrouves)} / ${nf(rc.suivi_confirme)}</b> ; ${T("les autres sont listés ci-dessous et dans le fichier de validation (onglet « Suivi Confirmé-Suspect non retrouvés ») pour vérification sur le terrain.")}`,
        `<b>${pc(100 * rc.cas_connus_contacts / Math.max(rc.cas, 1), 1)}</b> ${T("des cas étaient connus comme contacts et")} ${pc(100 * rc.cas_avec_contacts_listes / Math.max(rc.cas, 1), 1)} ${T("ont eux-mêmes des contacts listés : la couverture du listage des contacts est l’écart principal à combler.")}`,
        `${nf(rc.cas_contact_malade_oui_non_retrouves)} ${T("cas déclarent un contact avec un malade sans figurer dans aucune liste : priorité pour l’investigation (onglet « Cas contact déclaré non listés »).")}`,
        `${T("Réseau")} : ${nf(rc.reseau_niveau2)} ${T("contacts devenus cas ont à leur tour des contacts listés (développement au niveau suivant du graphe).")}`])}
      ${isPublic ? "" : `<div style="margin-top:12px;display:grid;gap:16px">
        <div><h3 class="small" style="margin:0 0 6px">${T("Contacts « Confirmé » / « Suspect » au suivi non retrouvés avec certitude")}</h3>${table("reco-miss", miss, [
          { k: "id", t: "ID contact" }, { k: "ini", t: "Init." }, { k: "sc", t: "Statut au suivi", v: x => x.sc === "C" ? badge("Confirmé", "b-crit") : badge("Suspect", "b-high"), csv: x => x.sc === "C" ? "Confirmé" : "Suspect" },
          { k: "zs", t: "Zone" }, { k: "lk", t: "Meilleur candidat", v: x => x.lk && caseBy.has(x.lk) ? `<a href="#/journey/${encodeURIComponent(x.lk)}">${esc(caseBy.get(x.lk).id)}</a> ${badge(x.lkc || "", LINKC[x.lkc])}` : "—", csv: x => x.lk ? ((caseBy.get(x.lk) || {}).id || x.lk) : "" },
          { k: "lks", t: "Score", num: true }, { k: "ix", t: "Cas index", v: x => `<a href="#/journey/${encodeURIComponent(x.ix)}">${esc((caseBy.get(x.ix) || {}).id || x.ix)}</a>`, csv: x => (caseBy.get(x.ix) || {}).id || x.ix }],
          { sort: "sc", maxh: 360, search: false })}</div>
        <div><h3 class="small" style="margin:0 0 6px">${T("Couverture par zone de santé")}</h3>${table("reco-zone", pz, [
          { k: "zone_sante", t: "Zone" }, { k: "cas", t: "Cas", num: true },
          { k: "connus_contacts", t: "Connus contacts", num: true, v: x => `${nf(x.connus_contacts)} <span class="muted small">${pc(100 * x.connus_contacts / Math.max(x.cas, 1), 0)}</span>`, sortv: x => x.connus_contacts / Math.max(x.cas, 1) },
          { k: "avec_contacts_listes", t: "Avec contacts listés", num: true, v: x => `${nf(x.avec_contacts_listes)} <span class="muted small">${pc(100 * x.avec_contacts_listes / Math.max(x.cas, 1), 0)}</span>`, sortv: x => x.avec_contacts_listes / Math.max(x.cas, 1) },
          { k: "source_declaree", t: "Source déclarée", num: true }, { k: "contact_malade_non_retrouves", t: "Contact déclaré non listé", num: true }], { sort: "cas", maxh: 360 })}</div>
      </div>`}`, { id: "reco" })}`;
  }
  function progress(v, color) { return v === null || v === undefined ? "—" : `<div class="flex" style="gap:6px;flex-wrap:nowrap"><div class="progress" style="flex:1"><i style="width:${Math.min(100, v)}%;background:${col(color || (v >= 80 ? "--good" : v >= 50 ? "--warn" : "--critical"))}"></i></div><span class="small">${nf(v, 0)} %</span></div>`; }
  function listRows(kind) {
    const n = Number(S.dlPeriod);
    const pz = contacts.filter(c => S.province === "Toutes" || c.prov === S.province);
    if (kind === "suspects") return pz.filter(c => c.st === "Devenu suspect" && (!n || inWin(c.ds, n)));
    if (kind === "nonvus") return pz.filter(c => c.st === "Non vu >3 j" && (!n || inWin(c.vl || c.v1 || c.exp, n)));
    return pz.filter(c => c.st === "Suivi clôturé incomplet" && (!n || inWin(c.fin, n)));
  }
  function downloadList(kind) {
    const rows = listRows(kind), n = Number(S.dlPeriod);
    const idxLbl = c => { const x = caseBy.get(c.ix); return x ? (x.id || c.ix) : String(c.ix).replace(/^EXT-/, ""); };
    const cols = [{ t: T("Zone de santé"), w: 18 }, { t: T("Aire de santé"), w: 20 }, { t: T("ID contact"), w: 26 }, { t: T("Initiales"), w: 9 }, { t: T("Sexe"), w: 10 }, { t: T("Âge"), w: 6 },
      { t: T("Relation"), w: 13 }, { t: T("Type de contact"), w: 24 }, { t: T("ID cas index"), w: 28 }, { t: T("Dernière exposition"), w: 13 }, { t: T("Fin de suivi prévue"), w: 13 }];
    const extra = kind === "suspects" ? [{ t: T("Date devenu suspect"), w: 13 }, { t: T("Dernière visite (vu)"), w: 13 }]
      : kind === "nonvus" ? [{ t: T("Dernière visite (vu)"), w: 13 }, { t: T("Jours sans visite"), w: 10 }, { t: T("Dernier motif non vu"), w: 22 }]
      : [{ t: T("Dernière visite (vu)"), w: 13 }, { t: T("Jours vus / attendus"), w: 12 }, { t: T("Complétude %"), w: 10 }];
    const allCols = [...cols, ...extra, { t: T("Statut de suivi"), w: 18 }, { t: T("Action / observation terrain"), w: 28 }];
    const line = c => [c.zs, c.as, c.id, c.ini, T(c.sexe || ""), c.age, T(c.rel || ""), T(String(c.type || "").replace(/^\d\.\s*/, "")), idxLbl(c), c.exp, c.fin,
      ...(kind === "suspects" ? [c.ds, c.vl] : kind === "nonvus" ? [c.vl || T("jamais"), c.vl ? days(c.vl, REF()) : null, c.rnv] : [c.vl || T("jamais"), `${c.jv}/${c.ja}`, c.comp]), T(c.st), ""];
    const sortFn = (a, b) => String(a.zs || "~").localeCompare(String(b.zs || "~")) || String(a.as || "~").localeCompare(String(b.as || "~")) ||
      (kind === "nonvus" ? String(a.vl || "").localeCompare(String(b.vl || "")) : String(a.ds || a.fin || "").localeCompare(String(b.ds || b.fin || "")));
    const title = { suspects: "Contacts suspects, issue à documenter", nonvus: "Contacts non vus depuis plus de 3 jours (perdus de vue)", incomplet: "Contacts, suivi clôturé incomplet" }[kind];
    const perTxt = n ? `${winStart(n)} → ${REF()} (${n} ${T("derniers jours")})` : T("Toute la période");
    const provs = [...new Set(rows.map(c => c.prov || T("Province non renseignée")))].sort();
    const summary = { name: T("Synthèse"), title: `${T(title)}, ${perTxt}, ${T("situation au")} ${D.meta.cutoff}`, columns: [{ t: T("Province"), w: 18 }, { t: T("Zone de santé"), w: 22 }, { t: T("Contacts"), w: 10 }],
      rows: [] };
    const sheets = provs.map(pv => {
      const g = rows.filter(c => (c.prov || T("Province non renseignée")) === pv).sort(sortFn);
      const byZ = {}; g.forEach(c => { byZ[c.zs || "—"] = (byZ[c.zs || "—"] || 0) + 1; });
      Object.keys(byZ).sort().forEach(z => summary.rows.push([pv, z, byZ[z]]));
      return { name: pv, title: `${T(title)}, ${pv}, ${perTxt}`, columns: allCols, rows: g.map(line) };
    });
    summary.rows.push([T("Total"), "", rows.length]);
    const fname = `${{ suspects: "Contacts_devenus_suspects", nonvus: "Contacts_perdus_de_vue_3j", incomplet: "Suivi_cloture_incomplet" }[kind]}_${S.province === "Toutes" ? "toutes_provinces" : S.province.replace(/\W+/g, "_")}_${n ? n + "j_" : ""}${D.meta.cutoff}`;
    window.HubXLSX.download(fname, [summary, ...sheets]);
  }
  function followupCharts() {
    genChart();
    const tr = (D.followup_trend || []).filter(r => r.province === (S.province === "Toutes" ? "Toutes" : S.province));
    Ch.xy($("#c-fu"), { data: tr, x: "date", xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), height: 250, barWidth: .8,
      series: [{ key: "contacts_a_suivre", label: T("Contacts à suivre"), color: "--seq-2" }, { key: "contacts_vus", label: T("Contacts vus"), color: "--s3" }] });
    Ch.xy($("#c-fu2"), { data: tr, x: "date", xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), height: 250, percent: true, yMax: 100,
      series: [{ key: "taux_vus_pct", label: T("% de contacts vus"), color: "--s1", type: "area" }] });
  }

  /* ================= CAS INDEX ================= */
  function idxRows() {
    let rows = idxCases.filter(inProv);
    if (S.idxZone !== "Toutes") rows = rows.filter(x => x.zone_sante === S.idxZone);
    if (S.idxActive) rows = rows.filter(x => x.actifs > 0);
    if (S.idxConf !== "Toutes") rows = rows.filter(x => S.idxConf === "À vérifier" ? x.confiance !== "Élevée" : x.confiance === S.idxConf);
    if (Number(S.gen)) rows = rows.filter(x => genOk(x.index_key, S.gen));
    const per = Number(S.idxPeriod);
    if (per) rows = rows.filter(x => (byIndex.get(x.index_key) || []).some(y => contactInWin(y, per)));
    return rows.map(x => { const n = NET.info(x.index_key); return { ...x, gen: n.depth, reseau: n.size, reseau_cas: n.cases }; });
  }
  function indexView() {
    const rows = idxRows(), all = idxCases.filter(inProv);
    const zl = ["Toutes", ...new Set(all.map(x => x.zone_sante).filter(Boolean))].sort();
    const sum = k => rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    const nAct = sum("actifs"), v24 = sum("vus_24h"), nc = sum("contacts"), dc = sum("devenus_cas");
    const verif = rows.filter(x => x.confiance !== "Élevée").length;
    const med = (() => { const a = rows.map(x => x.contacts).sort((a, b) => a - b); return a.length ? a[Math.floor(a.length / 2)] : null; })();
    const genCount = [1, 2, 3, 4].map(g => ({ g: `G${g}`, n: all.filter(x => NET.depth(x.index_key) === g).length }));
    const filtTxt = [S.idxZone !== "Toutes" ? S.idxZone : "", Number(S.gen) ? `${S.gen} ${T("génération(s)")}` : "", Number(S.idxPeriod) ? `${S.idxPeriod} ${T("derniers jours")}` : "", S.idxActive ? T("suivi en cours") : "", S.idxConf !== "Toutes" ? T(S.idxConf) : ""].filter(Boolean).join(" · ");
    return `
    <section class="panel" style="padding-bottom:10px">
      <div class="flex">
        <label class="field">${T("Zone de santé")}<select data-state="idxZone">${zl.map(z => `<option value="${esc(z)}" ${z === S.idxZone ? "selected" : ""}>${esc(T(z))}</option>`).join("")}</select></label>
        <label class="field">${T("Confiance du lien")}<select data-state="idxConf">${["Toutes", "Élevée", "Moyenne", "À vérifier", "Non retrouvé"].map(z => `<option value="${z}" ${z === S.idxConf ? "selected" : ""}>${T(z)}</option>`).join("")}</select></label>
        <div><div class="small muted" style="margin-bottom:3px">${T("Générations du réseau")}</div>${segBtns("gen", GENS)}</div>
        <div><div class="small muted" style="margin-bottom:3px">${T("Contacts actifs sur la période")}</div>${periodSeg("idxPeriod")}</div>
        <label class="flex small" style="margin-top:14px"><input type="checkbox" data-check="idxActive" ${S.idxActive ? "checked" : ""}> ${T("Suivi en cours uniquement")}</label>
        <button class="btn sm" data-reset-idx style="margin-top:14px">↺ ${T("Réinitialiser les filtres")}</button>
      </div>
      <div class="small muted" style="margin-top:8px">${T("Filtres actifs")} : <b>${filtTxt || T("aucun")}</b>, ${nf(rows.length)} ${T("cas index sur")} ${nf(all.length)}</div>
    </section>
    <div class="grid g5">
      ${kpi("Cas index (filtrés)", nf(rows.length), `${T("Médiane")} ${nf(med)} ${T("contacts par cas index")}`)}
      ${kpi("Contacts listés", nf(nc), `${nf(nAct)} ${T("actifs")} · ${nAct ? pc(100 * v24 / nAct, 0) : "—"} ${T("vus ≤24 h")}`, { color: "--s1" })}
      ${kpi("Perdus de vue > 3 j", nf(sum("non_vus_48h")), T("À rechercher en priorité"), { cls: sum("non_vus_48h") ? "alert" : "good", color: "--st-nv" })}
      ${kpi("Contacts devenus cas", nf(dc), `${T("Taux d’attaque secondaire")} ${nc ? pc(100 * dc / nc, 2) : "—"}`, { color: "--st-conf" })}
      ${kpi("Liens à vérifier", nf(verif), T("Confiance moyenne, faible ou nom discordant"), { cls: verif ? "alert" : "" })}
    </div>
    <div class="grid g2">
      ${panel("Cas index par nombre de générations", T("Profondeur du réseau de contact tracing (tous les cas index de la province) ; cliquer pour filtrer"), `<div class="hbars">${genCount.map(x => `<div class="hbar clickable" data-gen-pick="${x.g.slice(1)}" style="grid-template-columns:60px 1fr 70px"><span>${x.g}</span><div class="track"><i style="width:${Math.max(1, 100 * x.n / Math.max(1, ...genCount.map(y => y.n)))}%;background:${col(["--s1", "--s3", "--s4", "--critical"][Number(x.g.slice(1)) - 1])}"></i></div><b>${nf(x.n)}</b></div>`).join("")}</div><div class="small muted" style="margin-top:6px">${T("G1 = cas index et ses contacts ; G2 = au moins un contact devenu cas a lui-même des contacts listés ; G3, G4 = chaînes de contacts plus longues.")}</div>`)}
      ${panel("Nombre de contacts par cas index", T("Cas index filtrés"), `<div id="c-idx-hist"></div>`, { png: "contacts_par_cas_index" })}
    </div>
    ${panel(Number(S.gen) ? `${T("Graphes des réseaux à")} ${S.gen} ${T("génération(s)")}` : T("Graphes des plus grands réseaux"), `${T("Les 12 premiers cas index filtrés (contacts devenus cas d’abord, puis taille du réseau) ; chaque graphe montre exactement les générations choisies ; cliquer pour ouvrir le parcours")}`, `<div class="grid g3" id="idx-gallery">${rows.slice().sort((a, b) => b.reseau_cas - a.reseau_cas || b.reseau - a.reseau).slice(0, 12).map(x => `<div class="mini-net clickable" data-open-case="${esc(x.index_key)}"><div class="flex between small"><b>${esc(x.id_cas || x.index_key)}</b><span class="badge">G${x.gen}</span></div><div class="small muted">${esc(x.zone_sante || "")} · ${nf(x.reseau)} ${T("contacts")} · ${nf(x.reseau_cas)} ${T("devenus cas")}</div><div class="mini-net-box" data-mini="${esc(x.index_key)}"></div></div>`).join("") || `<div class="empty">${T("Aucun cas index ne correspond aux filtres.")}</div>`}</div>
      ${legend([...STATUS.filter(x => x.k !== "Doublon").map(x => ({ t: x.k, c: x.c, round: true })), { t: "Cas (carré)", c: "--st-conf" }])}`)}
    ${panel("Cas index et leurs contacts", T("Chaque ligne = un cas index aligné sur la Linelist ; cliquer pour ouvrir le parcours et le graphe de contacts"), table("idx", rows, [
        { k: "id_cas", t: "Cas index", v: x => `<b>${esc(x.id_cas || x.index_key)}</b> <span class="muted">${esc(x.initiales || "")}</span>`, csv: x => x.id_cas || x.index_key },
        { k: "classification_std", t: "Classification", v: x => badge(x.dans_linelist ? (x.classification_std || "—") : "Hors Linelist", "", clsColor(x.dans_linelist ? x.classification_std : "Hors Linelist")) + (x.deces ? " " + badge("Décédé", "b-crit") : ""), csv: x => x.classification_std },
        { k: "zone_sante", t: "Zone" }, { k: "gen", t: "Générations", num: true, v: x => `<span class="badge">G${x.gen}</span>`, csv: x => x.gen }, { k: "contacts", t: "Contacts", num: true }, { k: "reseau", t: "Taille du réseau", num: true },
        { k: "statuts", t: "Statuts des contacts", v: x => stackbar(Object.fromEntries(STATUS.map(s => [s.k, x[s.k] || 0]))), csv: x => STATUS.map(s => `${s.k}:${x[s.k] || 0}`).join(" "), sortv: x => x.actifs },
        { k: "actifs", t: "Actifs", num: true }, { k: "non_vus_48h", t: "Non vus >3 j", num: true }, { k: "taux_vus_24h_pct", t: "% vus ≤24 h", num: true, v: x => x.actifs ? pc(x.taux_vus_24h_pct, 0) : "—" },
        { k: "devenus_cas", t: "Devenus cas", num: true }, { k: "fin_suivi", t: "Fin du suivi", v: x => dshort(x.fin_suivi) },
        { k: "confiance", t: "Lien Linelist", v: x => badge(x.confiance || "—", CONF[x.confiance]) + ` <span class="muted small">${esc(T(String(x.methode || "").replace(/ \(.*\)$/, "")))}</span>`, csv: x => `${x.confiance} (${x.methode})` },
        { k: "chaine", t: "Chaîne", v: x => x.chaine ? `<a href="#/chains/${x.chaine}">${x.chaine}</a>` : "—" }],
        { sort: Number(S.gen) > 1 ? "reseau" : "actifs", rowClick: true, rowKey: x => x.index_key, limit: 80, searchText: x => `${x.id_cas} ${x.initiales} ${x.zone_sante}` }), { csv: "idx" })}`;
  }
  function indexCharts() {
    const rows = idxRows();
    const bins = [[1, 5], [6, 10], [11, 20], [21, 30], [31, 50], [51, 100], [101, 1e9]];
    Ch.xy($("#c-idx-hist"), { data: bins.map(([a, b]) => ({ b: b > 1e8 ? `> ${a - 1}` : `${a}–${b}`, n: rows.filter(x => x.contacts >= a && x.contacts <= b).length })), x: "b", height: 200, barWidth: .8,
      series: [{ key: "n", label: T("Cas index"), color: "--s1" }], legend: false, xLabel: (v, r, tip) => tip ? `${v} ${T("contacts")}` : v });
    $$("[data-mini]").forEach(box => {
      const c = caseBy.get(box.dataset.mini); if (!c) return;
      const net = buildNetwork(c, Number(S.gen) || 4, S.idxPeriod);
      Ch.network(box, { nodes: net.nodes.map(n => ({ ...n, sub: n.level === 0 ? n.sub : "" })), links: net.links, rootId: "C:" + c.k, layout: "radial", height: 260, sexIcons: false, ringLabel: () => "", info: `${nf(net.nodes.length - 1)} ${T("nœuds")}`, onSelect: () => go("journey", c.k) });
    });
  }

  /* ================= PARCOURS DU CAS ================= */
  function journeyList() {
    const per = Number(S.jrPeriod);
    return idxCases.filter(inProv).filter(x => genOk(x.index_key, S.gen) && (!per || (byIndex.get(x.index_key) || []).some(y => contactInWin(y, per))))
      .sort((a, b) => NET.info(b.index_key).cases - NET.info(a.index_key).cases || b.actifs - a.actifs || b.contacts - a.contacts);
  }
  function defaultCase() {
    if (Number(S.gen)) { const l = journeyList(); if (l.length) return l[0].index_key; }
    const a = idxCases.filter(inProv).sort((x, y) => (y.classification_std === "Confirmé") - (x.classification_std === "Confirmé") || y.actifs - x.actifs || y.contacts - x.contacts)[0];
    return a ? a.index_key : (cases.find(c => c.cls === "Confirmé") || {}).k;
  }
  function caseLabel(c) { return c ? `${c.id || c.k}` : "—"; }
  function journey() {
    if (!S.caseKey || !caseBy.has(S.caseKey) || (Number(S.gen) && byIndex.has(S.caseKey) && !genOk(S.caseKey, S.gen)) || (Number(S.gen) && !byIndex.has(S.caseKey))) S.caseKey = defaultCase();
    const c = caseBy.get(S.caseKey);
    if (!c) return `<div class="empty">${T("Aucun cas disponible.")}</div>`;
    const ctAll = byIndex.get(c.k) || [];
    const ct = ctAll.filter(x => contactInWin(x, S.jrPeriod));
    const counts = {}; ct.forEach(x => counts[x.st] = (counts[x.st] || 0) + 1);
    const ix = idxBy.get(c.k);
    const per = Number(S.jrPeriod), perTxt = per ? `${T("Période")} : ${dshort(winStart(per))} → ${dshort(REF())} (${per} ${T("derniers jours")})` : T("Toute la période");
    const activeIdx = journeyList();
    const conv = ct.filter(x => x.st === "Devenu confirmé").length;
    const ev = (c.ev || []).find(e => e[0] === "symptomes");
    const srcs = c.src || [];
    const asContact = contacts.filter(x => x.lk === c.k && (x.lkc === "Certain" || x.lkc === "Probable"));
    return `
    <div class="flex between" style="margin-bottom:12px">
      <div class="search-box"><input type="search" id="case-search" placeholder="${T("Rechercher un cas : identifiant, initiales, zone…")}" autocomplete="off"><div id="case-results" class="search-results hide"></div></div>
      <div class="flex small"><span class="muted">${T("Période")}</span>${periodSeg("jrPeriod")}<span class="muted">${T("Générations")}</span>${segBtns("gen", GENS)}
        <select data-state="caseKey" title="${T("Cas index actifs sur la période")}" style="max-width:280px"><option value="">${T("Cas index, période et génération choisies")} (${nf(activeIdx.length)})</option>${activeIdx.slice(0, 400).map(x => `<option value="${esc(x.index_key)}" ${x.index_key === c.k ? "selected" : ""}>${esc(x.id_cas || x.index_key)} · ${esc(x.zone_sante || "")} · G${NET.depth(x.index_key)} · ${nf(NET.info(x.index_key).size)} ${T("contacts")}</option>`).join("")}</select></div>
      <div class="flex small muted">${T("Navigation")} :
        <button class="btn sm" data-nav="prev">← ${T("Cas précédent")}</button><button class="btn sm" data-nav="next">${T("Cas suivant")} →</button></div>
    </div>
    <section class="panel">
      <div class="case-head">
        <div class="avatar" style="background:${col(clsColor(c.cls))}">${esc(c.ini || "?")}</div>
        <div><h2>${esc(c.id || c.k)}</h2><div class="meta">${badge(c.cls || "—", "", clsColor(c.cls))} ${c.dc ? badge("Décédé", "b-crit") : ""} ${c.hcw ? badge("Personnel de santé", "b-info") : ""} ${c.kc ? badge("Était un contact suivi", "b-good") : ""} ${c.ext ? badge("Cas index hors Linelist", "b-high") : ""}
          <span style="margin-left:6px">${c.age !== null && c.age !== undefined ? nf(c.age, c.age < 1 ? 1 : 0) + " " + T("ans") : ""} ${esc(T(c.sexe || ""))} · ${esc([c.prov, c.zs, c.as, c.vil].filter(Boolean).join(" / "))}</span></div></div>
        <div class="flex">${c.ch ? `<a class="btn sm" href="#/chains/${c.ch}">⛓ ${T("Chaîne")} ${c.ch}${c.gen ? " · G" + c.gen : ""}</a>` : ""}<button class="btn sm" data-print>🖨 ${T("Imprimer")}</button></div>
      </div>
      <div class="facts">
        <div class="fact"><span>${T("Début des symptômes")}</span><b>${ev ? dfmt(ev[1]) : "—"}</b></div>
        <div class="fact"><span>${T("Date de rapportage")}</span><b>${dfmt(c.date)}</b></div>
        <div class="fact"><span>${T("Réseau de contact tracing")}</span><b>G${NET.depth(c.k)} · ${nf(NET.info(c.k).size)} ${T("contacts")} · ${nf(NET.info(c.k).cases)} ${T("devenus cas")}</b></div>
        <div class="fact"><span>${T("Contacts listés")}</span><b>${nf(ctAll.length)}${per ? ` <span class="muted small">(${nf(ct.length)} ${T("sur la période")})</span>` : ""}</b></div>
        <div class="fact"><span>${T("Contacts actifs")}</span><b>${nf(ix ? ix.actifs : 0)}</b></div>
        <div class="fact"><span>${T("Contacts devenus cas")}</span><b>${nf(conv)} ${ct.length ? `(${pc(100 * conv / ct.length)})` : ""}</b></div>
        <div class="fact"><span>${T("Devenus suspects (cumul)")}</span><b>${nf(ct.filter(x => x.sc === "S" || x.ds).length)}</b></div>
        <div class="fact"><span>${T("Fin du suivi des contacts")}</span><b>${ix ? dfmt(ix.fin_suivi) : "—"}</b></div>
        <div class="fact"><span>${T("Lien contact tracing ↔ Linelist")}</span><b>${ix ? badge(ix.confiance, CONF[ix.confiance]) : "—"}</b></div>
        <div class="fact"><span>${T("Laboratoire")}</span><b>${esc(c.lab || "—")}</b></div>
      </div>
    </section>
    <div class="grid g21" style="margin-top:14px">
      ${panel("Trajectoire du cas", `${T("Événements datés ; l’écart entre étapes est indiqué en jours")} · <b>${perTxt}</b>`, timelineHTML(c))}
      ${panel("Origine du cas (amont)", T("Cas source identifié par la liste de contacts ou l’investigation"), srcs.length || asContact.length ? `<div class="detail-card">${srcs.map(s => { const sc = caseBy.get(s.k); return `<div class="detail-row"><span>${s.t === "contact" ? T("Listé comme contact de") : T("Source déclarée")}</span><b><a href="#/journey/${encodeURIComponent(s.k)}">${esc(sc ? caseLabel(sc) : s.k)}</a> ${badge(s.c || "", s.t === "contact" ? LINKC[s.c] : "b-info")}</b></div>`; }).join("")}${asContact.length && !srcs.some(s => s.t === "contact") ? asContact.map(x => `<div class="detail-row"><span>${T("Listé comme contact de")}</span><b><a href="#/journey/${encodeURIComponent(x.ix)}">${esc((caseBy.get(x.ix) || {}).id || x.ix)}</a></b></div>`).join("") : ""}</div>` : `<div class="empty">${T("Aucune source identifiée pour ce cas.")}</div>`)}
    </div>
    ${ctAll.length ? panel("Trajectoire du suivi des contacts", `${T("Contacts à suivre, vus et non vus chaque jour")} · ${perTxt}`, `<div id="c-jrtraj"></div>`, { png: "trajectoire_suivi_" + (c.id || c.k) }) : ""}
    <div class="grid g21">
      ${panel("Graphe de contact tracing", T("Cas index au centre ; contacts colorés selon leur statut ; un contact devenu cas ouvre ses propres contacts (niveau suivant)"), `<div id="c-net"></div>
        ${legend([...STATUS.filter(x => x.k !== "Doublon").map(x => ({ t: x.k, c: x.c, round: true })), { t: "Cas (carré)", c: "--st-conf" }, { t: "Cas source (amont)", c: "--s7" }])}${S.netIcons ? `<div class="legend">${["M", "F", "I"].map(k => `<span>${Ch.sexIconHTML(k, col("--ink-2"), 15)}${T(SEXL[k])}</span>`).join("")}<span class="muted">${T("couleur = statut du suivi")}</span></div>` : ""}`,
        { png: "graphe_contacts_" + (c.id || c.k), tools: `${Number(S.gen) ? `<span class="badge">${T("Générations affichées")} : ${S.gen}</span>` : `<label class="small muted">${T("Profondeur")}</label><select data-state="netDepth">${[1, 2, 3, 4].map(n => `<option value="${n}" ${S.netDepth == n ? "selected" : ""}>${T("Niveau")} ${n}</option>`).join("")}</select>`}<div class="seg" data-seg="netLayout"><button data-v="radial" class="${S.netLayout === "radial" ? "on" : ""}">${T("Radial")}</button><button data-v="tree" class="${S.netLayout === "tree" ? "on" : ""}">${T("Arbre")}</button></div><label class="small flex" style="gap:4px"><input type="checkbox" data-check="netIcons" ${S.netIcons ? "checked" : ""}>${T("Homme / femme")}</label>` })}
      ${panel("Nœud sélectionné", T("Cliquer un nœud du graphe"), `<div id="node-detail">${nodeDetail()}</div><h3 class="small" style="margin:16px 0 6px">${T("Statut des contacts directs")}</h3>${stackbar(counts)}${legend(STATUS.filter(x => counts[x.k]).map(x => ({ t: x.k, c: x.c, n: counts[x.k] })))}`)}
    </div>
    ${panel("Contacts du cas index", `${T("Suivi individuel sur 21 jours, pseudonymisé")} · ${perTxt}`, table("jr-ct", ct, [
      { k: "id", t: "ID contact", v: x => `<b>${esc(x.id)}</b> <span class="muted">${esc(x.ini)}</span>`, csv: x => x.id }, { k: "age", t: "Âge", num: true, d: 0 }, { k: "sexe", t: "Sexe" },
      { k: "rel", t: "Relation" }, { k: "type", t: "Exposition", v: x => esc(T(String(x.type || "—").replace(/^\d\.\s*/, ""))) + (x.hr ? " " + badge("Haut risque", "b-high") : "") + (x.hosp ? " " + badge("Soins", "b-info") : ""), csv: x => x.type },
      { k: "as", t: "Aire" }, { k: "exp", t: "Dernière exposition", v: x => dshort(x.exp) }, { k: "fin", t: "Fin de suivi", v: x => dshort(x.fin) },
      { k: "comp", t: "Jours vus / attendus", v: x => `<div class="flex" style="gap:6px;flex-wrap:nowrap"><div class="progress" style="width:80px"><i style="width:${x.ja ? Math.min(100, 100 * x.jv / x.ja) : 0}%;background:${col(stColor(x.st))}"></i></div><span class="small">${x.jv}/${x.ja}</span></div>`, sortv: x => x.comp, csv: x => `${x.jv}/${x.ja}` },
      { k: "vl", t: "Dernier vu", v: x => x.vl ? dshort(x.vl) : T("jamais") }, { k: "st", t: "Statut", v: x => statusBadge(x.st), csv: x => x.st },
      { k: "lk", t: "Rapprochement Linelist", v: x => x.lk && caseBy.has(x.lk) ? `<a href="#/journey/${encodeURIComponent(x.lk)}">${esc(caseBy.get(x.lk).id)}</a> ${badge(x.lkc, LINKC[x.lkc])}` : (x.lk ? badge(x.lkc, LINKC[x.lkc]) : "—"), csv: x => x.lk ? `${(caseBy.get(x.lk) || {}).id || x.lk} (${x.lkc})` : "" }],
      { sort: "st", rowClick: true, rowKey: x => x.k, selected: x => x.k === S.nodeSel, maxh: 460 }), { csv: "jr-ct" })}`;
  }
  function timelineHTML(c) {
    const EVL = { symptomes: ["Début des symptômes", "--s2"], notification: ["Notification", "--s1"], investigation: ["Investigation", "--s7"], prelevement: ["Prélèvement", "--s4"], laboratoire: ["Résultat laboratoire", "--s3"], admission: ["Admission (CTE)", "--s5"], sortie: ["Sortie / issue", "--st-done"], rapportage: ["Rapportage", "--muted"] };
    let ev = (c.ev || []).filter(e => e[1]);
    const ct = byIndex.get(c.k) || [];
    const lastExp = ct.map(x => x.exp).filter(Boolean).sort().pop(), fin = ct.map(x => x.fin).filter(Boolean).sort().pop();
    if (ct.length && ct[0].v1) ev.push(["contacts", ct.map(x => x.v1).filter(Boolean).sort()[0], "Début du suivi des contacts", "--s6"]);
    if (fin) ev.push(["finsuivi", fin, "Fin prévue du suivi des contacts", "--good"]);
    const per = Number(S.jrPeriod);
    if (per) {
      // événements du cas dans la fenêtre + activité quotidienne de suivi des contacts
      ev = ev.filter(e => inWin(e[1], per));
      const days_ = [...new Set(ct.flatMap(x => [...(x.vu || []), ...(x.nv || [])]).filter(d => inWin(d, per)))].sort();
      days_.forEach(d => { const v = ct.filter(x => (x.vu || []).includes(d)).length, n = ct.filter(x => (x.nv || []).includes(d)).length; ev.push(["jour", d, `${T("Suivi")} : ${v} ${T("vus")}${n ? ` · ${n} ${T("non vus")}` : ""}`, n > v ? "--st-nv" : "--st-v24"]); });
      ct.filter(x => inWin(x.ds, per)).forEach(x => ev.push(["susp", x.ds, `${T("Contact devenu suspect")} (${x.ini})`, "--st-susp"]));
    }
    if (!ev.length) return `<div class="empty">${per ? T("Aucun événement pour ce cas sur la période choisie.") : T("Aucun événement daté.")}</div>`;
    ev.sort((a, b) => a[1].localeCompare(b[1]));
    const span = days(ev[0][1], ev[ev.length - 1][1]);
    const items = ev.map((e, i) => {
      const [lbl, c2] = e[2] ? [e[2], e[3]] : (EVL[e[0]] || [e[0], "--muted"]);
      const gap = i ? days(ev[i - 1][1], e[1]) : null;
      return `${i ? `<div class="tl-gap"><span>${gap ? "+" + gap + " " + T("j") : T("même jour")}</span></div>` : ""}<div class="tl-ev"><i style="background:${col(c2)}"></i><b>${esc(T(lbl))}</b><time>${dfmt(e[1])}</time></div>`;
    }).join("");
    return `<div class="tl">${items}</div><div class="small muted" style="margin-top:8px">${T("Durée totale")} : ${nf(span)} ${T("jours")}${lastExp ? ` · ${T("dernière exposition d’un contact")} : ${dshort(lastExp)}` : ""}</div>`;
  }
  function buildNetwork(c, depthMax, period) {
    depthMax = depthMax || (Number(S.gen) || S.netDepth); period = period === undefined ? S.jrPeriod : period;
    const nodes = [], links = [], seenCase = new Set([c.k]), maxNodes = 900;
    const ctitle = x => `<b>${esc(x.id)}</b> · ${esc(x.ini)}<div class="row"><span>${T("Statut")}</span><b>${esc(T(x.st))}</b></div><div class="row"><span>${T("Relation")}</span><b>${esc(T(x.rel || "—"))}</b></div><div class="row"><span>${T("Zone / aire")}</span><b>${esc([x.zs, x.as].filter(Boolean).join(" / "))}</b></div><div class="row"><span>${T("Jours vus")}</span><b>${x.jv}/${x.ja}</b></div>${x.lk ? `<div class="row"><span>${T("Lien Linelist")}</span><b>${esc(T(x.lkc))}</b></div>` : ""}`;
    nodes.push({ id: "C:" + c.k, level: 0, shape: "case", label: c.ini, sub: c.id, color: clsColor(c.cls), sex: c.sexe, selected: S.nodeSel === "C:" + c.k, title: `<b>${esc(c.id)}</b><div>${esc(T(c.cls))}</div><div>${esc([c.zs, c.as].filter(Boolean).join(" / "))}</div>`, ref: { type: "case", k: c.k } });
    (c.src || []).forEach((s, i) => { const sc = caseBy.get(s.k); const id = "S:" + s.k + i; nodes.push({ id, level: -1, shape: "source", label: sc ? sc.ini : "?", sub: sc ? sc.id : s.k, color: "--s7", sex: sc ? sc.sexe : null, title: `<b>${T("Cas source")}</b> · ${esc(sc ? sc.id : s.k)}<div>${esc(T(s.t === "contact" ? "Listé comme contact" : "Source déclarée"))}</div>`, ref: { type: "case", k: s.k } }); links.push({ source: id, target: "C:" + c.k, up: true }); });
    const expand = (caseKey, parentId, level) => {
      const ct = (byIndex.get(caseKey) || []).filter(x => x.st !== "Doublon" && contactInWin(x, period));
      ct.forEach(x => {
        if (nodes.length > maxNodes) return;
        const id = "K:" + x.k + "@" + level;
        const linked = x.lk && (x.lkc === "Certain" || x.lkc === "Probable") ? caseBy.get(x.lk) : null;
        nodes.push({ id, parent: parentId, level, shape: linked && ["Confirmé", "Probable"].includes(linked.cls) ? "case" : "contact", label: x.ini, sub: x.id.slice(-6),
          color: stColor(x.st), ring: linked ? "--ink" : null, selected: S.nodeSel === x.k, title: ctitle(x), ref: { type: "contact", k: x.k }, sex: x.sexe });
        links.push({ source: parentId, target: id, strong: x.st === "Devenu confirmé" });
        if (linked && level < depthMax && !seenCase.has(linked.k) && byIndex.has(linked.k)) { seenCase.add(linked.k); expand(linked.k, id, level + 1); }
      });
    };
    expand(c.k, "C:" + c.k, 1);
    nodes.forEach(n => { if (n.parent === undefined && n.level > 0) n.parent = "C:" + c.k; if (n.level === -1) n.parent = null; });
    return { nodes, links };
  }
  function nodeDetail() {
    const k = S.nodeSel; if (!k) return `<div class="muted small">${T("Aucun nœud sélectionné.")}</div>`;
    const x = contactBy.get(k);
    if (x) {
      const lc = x.lk ? caseBy.get(x.lk) : null;
      const rows = [["ID contact", x.id], ["Initiales", x.ini], ["Âge / sexe", `${x.age ?? "—"} ${T("ans")} · ${T(x.sexe || "—")}`], ["Relation", T(x.rel || "—")], ["Exposition", T(String(x.type || "—").replace(/^\d\.\s*/, ""))],
        ["Circonstance", T(String(x.circ || "—").replace(/^\d\.\s*/, ""))], ["Zone / aire", [x.zs, x.as].filter(Boolean).join(" / ")], ["Dernière exposition", dfmt(x.exp)], ["Fin de suivi", dfmt(x.fin)],
        ["Jours vus / attendus", `${x.jv} / ${x.ja}`], ["Dernière visite (vu)", x.vl ? dfmt(x.vl) : T("jamais")], ["Motif non vu", x.rnv || "—"], ["Lien au cas index", `${T(x.ic || "")} · ${T(String(x.im || "").replace(/ \(.*\)$/, ""))}`]];
      return `<div class="detail-card"><div>${statusBadge(x.st)}</div>${rows.map(([a, b]) => `<div class="detail-row"><span>${T(a)}</span><b>${esc(b)}</b></div>`).join("")}
        ${x.lk ? `<div class="notice ${x.lkc === "À vérifier" ? "warn" : ""}"><b>${T("Rapprochement Linelist")} : ${esc(T(x.lkc))}</b> (${T("score")} ${nf(x.lks)} %)<br>${lc ? `<a href="#/journey/${encodeURIComponent(x.lk)}">${esc(lc.id)}</a> · ${esc(T(lc.cls))}` : ""}${x.lkp ? `<br><span class="small">${esc(x.lkp)}</span>` : ""}</div>` : ""}</div>`;
    }
    const c = caseBy.get(k);
    if (c) return `<div class="detail-card"><div class="detail-row"><span>${T("Cas")}</span><b><a href="#/journey/${encodeURIComponent(c.k)}">${esc(c.id)}</a></b></div><div class="detail-row"><span>${T("Classification")}</span><b>${esc(T(c.cls))}</b></div><div class="detail-row"><span>${T("Zone")}</span><b>${esc(c.zs || "—")}</b></div><div class="detail-row"><span>${T("Contacts listés")}</span><b>${nf(c.nc)}</b></div></div>`;
    return "";
  }
  function journeyCharts() {
    const c = caseBy.get(S.caseKey); if (!c) return;
    const ctAll = (byIndex.get(c.k) || []).filter(x => x.st !== "Doublon");
    if ($("#c-jrtraj") && ctAll.length) {
      const per = Number(S.jrPeriod);
      let d0 = per ? winStart(per) : ctAll.map(x => x.exp || x.v1).filter(Boolean).sort()[0];
      const d1 = REF(), rows = [];
      if (d0 && !per && days(d0, d1) > 60) d0 = addDays(d1, -59);
      for (let d = d0; d && d <= d1; d = addDays(d, 1)) {
        rows.push({ date: d, a_suivre: ctAll.filter(x => x.exp && x.fin && x.exp < d && x.fin >= d).length,
          vus: ctAll.filter(x => (x.vu || []).includes(d)).length, non_vus: ctAll.filter(x => (x.nv || []).includes(d)).length,
          suspects: ctAll.filter(x => x.ds === d).length });
      }
      Ch.xy($("#c-jrtraj"), { data: rows, x: "date", height: 230, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), xLabelWidth: 48,
        series: [{ key: "vus", label: T("Contacts vus"), color: "--st-v24" }, { key: "non_vus", label: T("Contacts non vus (visite sans contact)"), color: "--st-nv" },
          { key: "suspects", label: T("Devenus suspects"), color: "--st-susp" }, { key: "a_suivre", label: T("Contacts à suivre"), color: "--s1", type: "line" }] });
    }
    const net = buildNetwork(c);
    Ch.network($("#c-net"), { nodes: net.nodes, links: net.links, rootId: "C:" + c.k, layout: S.netLayout, ringLabel: i => `${T("Niveau")} ${i}`, sexIcons: S.netIcons,
      info: `${nf(net.nodes.length - 1)} ${T("nœuds · molette = zoom · glisser = déplacer")}`,
      onSelect: n => { if (n.ref.type === "contact") { S.nodeSel = n.ref.k; $("#node-detail").innerHTML = nodeDetail(); $$("tr[data-row^='jr-ct|']").forEach(tr => tr.classList.toggle("selected", tr.dataset.row === "jr-ct|" + n.ref.k)); } else if (n.ref.k !== c.k) go("journey", n.ref.k); else { S.nodeSel = c.k; $("#node-detail").innerHTML = nodeDetail(); } } });
    const inp = $("#case-search"), res = $("#case-results");
    const pool = cases.filter(x => inProv(x)).sort((a, b) => (b.nc - a.nc));
    let hl = 0, list = [];
    const show = () => {
      const q = norm(inp.value); if (!q) { res.classList.add("hide"); return; }
      list = pool.filter(x => norm(`${x.id} ${x.ini} ${x.zs} ${x.as}`).includes(q)).slice(0, 25);
      res.innerHTML = list.map((x, i) => `<button data-k="${esc(x.k)}" class="${i === hl ? "hl" : ""}"><span><b>${esc(x.id)}</b> · ${esc(x.ini)} <span class="muted">${esc(x.zs || "")}</span></span><span>${badge(x.cls, "", clsColor(x.cls))} <span class="muted small">${nf(x.nc)} ${T("contacts")}</span></span></button>`).join("") || `<div class="muted small" style="padding:10px">${T("Aucun résultat")}</div>`;
      res.classList.remove("hide");
    };
    inp.addEventListener("input", () => { hl = 0; show(); });
    inp.addEventListener("keydown", e => { if (e.key === "ArrowDown") { hl = Math.min(hl + 1, list.length - 1); show(); e.preventDefault(); } if (e.key === "ArrowUp") { hl = Math.max(hl - 1, 0); show(); e.preventDefault(); } if (e.key === "Enter" && list[hl]) go("journey", list[hl].k); if (e.key === "Escape") res.classList.add("hide"); });
    res.addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) go("journey", b.dataset.k); });
  }

  /* ================= CHAÎNES ================= */
  function chainsView() {
    const ch = D.chains || {}, st = ch.stats || {}, si = ch.intervalle_seriel || {};
    const rows = (ch.resume || []).filter(x => (S.province === "Toutes" || String(x.provinces || "").includes(S.province)) && (!Number(S.gen) || x.generations === Number(S.gen)));
    if (!S.chain || !rows.some(x => x.chaine === S.chain)) S.chain = (rows[0] || {}).chaine || "";
    const cur = rows.find(x => x.chaine === S.chain) || {};
    const r = D.riposte || {};
    return `
    <div class="grid g5">
      ${kpi("Chaînes reconstituées", nf(st.chaines), `${nf(st.cas_dans_chaines)} ${T("cas reliés")}`)}
      ${kpi("Chaînes de 3 cas ou plus", nf(st.chaines_3plus), `${T("jusqu’à")} ${nf(st.generations_max)} ${T("générations")}`)}
      ${kpi("Chaînes actives (21 j)", nf(st.actives_21j), T("Dernier cas depuis moins de 21 jours"), { cls: st.actives_21j ? "alert" : "" })}
      ${kpi("Intervalle sériel médian", si.mediane !== undefined ? nf(si.mediane, 1) + " j" : "—", si.n ? `IQR ${nf(si.q1)}–${nf(si.q3)} j · n = ${nf(si.n)}` : "")}
      ${kpi("Nouveaux cas avec source connue", pc(r.pct_nouveaux_cas_source_connue), T("Confirmés 14 j : contact listé ou source déclarée"), { cls: r.pct_nouveaux_cas_source_connue < 50 ? "alert" : "", meter: r.pct_nouveaux_cas_source_connue })}
    </div>
    <div class="flex" style="margin-bottom:10px"><span class="small muted">${T("Générations de la chaîne")}</span>${segBtns("gen", GENS)}<span class="small muted">${nf(rows.length)} ${T("chaînes")}</span></div>
    <div class="grid g12">
      ${panel("Liste des chaînes", T("Cliquer pour afficher la chaîne"), table("ch", rows, [{ k: "chaine", t: "Chaîne" }, { k: "cas", t: "Cas", num: true }, { k: "deces", t: "Décès", num: true }, { k: "generations", t: "Gén.", num: true }, { k: "dernier_cas", t: "Dernier cas", v: x => dshort(x.dernier_cas) }, { k: "active_21j", t: "Active", v: x => x.active_21j ? badge("Active", "b-crit") : badge("Éteinte", "") }, { k: "zones", t: "Zones", wrap: true }],
        { sort: "cas", rowClick: true, rowKey: x => x.chaine, selected: x => x.chaine === S.chain, maxh: 640 }), { csv: "ch" })}
      ${panel(`${T("Chaîne")} ${esc(S.chain)}`, `${nf(cur.cas)} ${T("cas")} · ${nf(cur.generations)} ${T("générations")} · ${esc(cur.zones || "")}`, `<div id="c-chain"></div>${legend([{ t: "Confirmé", c: "--st-conf" }, { t: "Probable", c: "--s5" }, { t: "Décédé (anneau)", c: "--ink" }, { t: "Lien contact suivi → cas", c: "--st-conf" }, { t: "Lien source déclarée", c: "--line-2" }])}<div class="legend">${["M", "F", "I"].map(k => `<span>${Ch.sexIconHTML(k, col("--ink-2"), 15)}${T(SEXL[k])}</span>`).join("")}</div>`,
        { png: "chaine_" + S.chain, tools: `<div class="seg" data-seg="chainLayout"><button data-v="time" class="${S.chainLayout === "time" ? "on" : ""}">${T("Chronologique")}</button><button data-v="tree" class="${S.chainLayout === "tree" ? "on" : ""}">${T("Générations")}</button></div>` })}
    </div>
    ${panel("Intervalle sériel", T("Jours entre le début des symptômes du cas source et du cas secondaire (dernière barre : 40 j et plus)"), `<div id="c-si"></div><div class="notice">${T("Un lien représente une relation épidémiologique documentée (contact suivi retrouvé comme cas, ou source déclarée lors de l’investigation), pas une preuve génomique de transmission.")}</div>`, { png: "intervalle_seriel" })}`;
  }
  function chainsCharts() {
    const ch = D.chains || {};
    const hm = new Map((ch.intervalle_seriel?.histogramme || []).map(x => [x.jours, x.paires]));
    Ch.histogram($("#c-si"), { data: Array.from({ length: 41 }, (_, i) => ({ jours: i === 40 ? "40+" : i, paires: hm.get(i) || 0 })), x: "jours", y: "paires", label: T("Paires de cas"), height: 220, xLabel: v => v, xLabelWidth: 26 });
    if (!S.chain) return;
    const members = cases.filter(c => c.ch === S.chain), set = new Set(members.map(c => c.k));
    const L = (ch.liens || []).filter(l => set.has(l.source) && set.has(l.target));
    const parentOf = {}; L.forEach(l => { if (!parentOf[l.target]) parentOf[l.target] = l.source; });
    const nodes = members.map(c => ({ id: c.k, parent: parentOf[c.k] || null, level: (c.gen || 1) - 1, shape: "case", label: c.ini, sex: c.sexe, sub: (c.id || "").slice(-9), color: clsColor(c.cls), ring: c.dc ? "--ink" : null,
      t: c.dde ? new Date(c.dde).getTime() : null, title: `<b>${esc(c.id)}</b><div>${esc(T(c.cls))}${c.dc ? " · " + T("décédé") : ""}</div><div>${T("Début")} : ${dfmt(c.dde)}</div><div>${esc(c.zs || "")}</div><div>${T("Génération")} ${c.gen || "?"}</div>`, ref: { type: "case", k: c.k } }));
    const links = L.map(l => ({ source: l.source, target: l.target, strong: String(l.type).includes("Contact") }));
    if (!nodes.length) { $("#c-chain").innerHTML = `<div class="empty">${T(isPublic ? "Graphe individuel non publié dans la version publique." : "Aucune donnée")}</div>`; return; }
    Ch.network($("#c-chain"), { nodes, links, rootId: (nodes.find(n => !n.parent) || {}).id, layout: S.chainLayout === "time" ? "time" : "tree", height: 520, sexIcons: S.netIcons,
      info: `${nodes.length} ${T("cas · cliquer un cas pour ouvrir son parcours")}`, onSelect: n => go("journey", n.ref.k) });
  }

  /* ================= DYNAMIQUE DE TRANSMISSION (approche RECON) ================= */
  const DY = D.dynamique || {}, RC = D.reconstruction || {};
  const SEXL = { M: "Hommes", F: "Femmes", I: "Sexe non renseigné" }, SEXC = { M: "--sex-m", F: "--sex-f", I: "--sex-i" };
  const AGEC = ["#3288BD", "#9ED1A3", "#FDAE61", "#E8684F", "#B0213A", "--sex-i"];
  const fmtR = v => v === null || v === undefined ? "—" : nf(v, 2);
  const ci = (a, b, d = 2) => (a === null || a === undefined) ? "" : `[${nf(a, d)}, ${nf(b, d)}]`;
  const sexIco = (s, size) => Ch.sexIconHTML(s, col(SEXC[s] || "--sex-i"), size);
  function dyGroups() { return DY.groupes || []; }
  function dyGroup() {
    const gs = dyGroups();
    if (S.province !== "Toutes" && S._lastProv !== S.province) { S._lastProv = S.province; if (gs.some(g => g.id === "P:" + S.province)) S.dynG = "P:" + S.province; }
    if (S.province === "Toutes" && S._lastProv && S._lastProv !== "Toutes") { S._lastProv = "Toutes"; S.dynG = "National"; }
    if (!gs.some(g => g.id === S.dynG)) S.dynG = "National";
    return gs.find(g => g.id === S.dynG) || { id: "National", nom: "National", niveau: "National" };
  }
  function groupSelect() {
    const gs = dyGroups(), lv = ["National", "Province", "Zone de santé"];
    return `<label class="field">${T("Territoire")}<select data-state="dynG">${lv.map(l => { const o = gs.filter(g => g.niveau === l); return o.length ? `<optgroup label="${esc(T(l))}">${o.map(g => `<option value="${esc(g.id)}" ${S.dynG === g.id ? "selected" : ""}>${esc(T(g.nom))} (${nf(g.cas)})</option>`).join("")}</optgroup>` : ""; }).join("")}</select></label>`;
  }
  function seriesRows(gid) {
    const s = (DY.series || {})[gid]; if (!s) return [];
    return s.observes.map((v, i) => ({ date: addDays(s.debut, i), obs: v, corr: s.corriges[i], comp: s.completude[i], imp: s.imputes[i], notif: s.notification[i] }));
  }
  const firstIdx = (rows, f) => { const i = rows.findIndex(f); return i < 0 ? null : i; };
  const segBtns = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(S[key]) === String(v) ? "on" : ""}">${T(t)}</button>`).join("")}</div>`;
  const interp = (title, items, q) => `<div class="interp"><b>${T(title)}</b><ul>${items.filter(Boolean).map(x => `<li>${x}</li>`).join("")}</ul>${q ? `<span class="q">${q}</span>` : ""}</div>`;
  const stat = (label, value, sub) => `<div class="stat"><span>${T(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const pctS = v => (v >= 0 ? "+" : "") + nf(v, 1) + " %";

  function growthFit() {
    const g = ((DY.croissance || {})[S.dynG] || {})[S.growBase];
    if (!g) return {};
    const fits = g.fits || {}; let w = S.growWin;
    if (!fits[w]) w = fits["12s"] ? "12s" : "tout";
    return { g, fit: fits[w], win: w };
  }
  function growthText(f, name) {
    if (!f || f.r === undefined) return [];
    const up = f.sens === "croissance", down = f.sens === "decroissance";
    const dbl = f.sens === "incertain" ? "" : f.temps_doublement ? `${T("temps de doublement")} ${nf(f.temps_doublement, 1)} ${T("j")}${f.temps_doublement_ic95 ? ` (IC 95 % ${nf(f.temps_doublement_ic95[0], 1)}, ${f.temps_doublement_ic95[1] ? nf(f.temps_doublement_ic95[1], 1) : "∞"} ${T("j")})` : ""}` : "";
    const half = f.sens === "incertain" ? "" : f.temps_demi ? `${T("temps de division par deux")} ${nf(f.temps_demi, 1)} ${T("j")}${f.temps_demi_ic95 ? ` (IC 95 % ${nf(f.temps_demi_ic95[0], 1)}, ${f.temps_demi_ic95[1] ? nf(f.temps_demi_ic95[1], 1) : "∞"} ${T("j")})` : ""}` : "";
    return [
      `${T("Taux de croissance journalier")} r = <b>${nf(f.r, 4)}</b> ${ci(f.r_ic95[0], f.r_ic95[1], 4)}, ${T("soit une variation hebdomadaire de")} <b>${pctS(f.variation_hebdo_pct)}</b> ${ci(f.variation_hebdo_ic95[0], f.variation_hebdo_ic95[1], 1)} ; ${dbl || half || T("aucune tendance nette")}.`,
      up ? `<b>${T("Croissance exponentielle significative")}</b> : ${T("l’intervalle de confiance de r est entièrement positif.")}` : down ? `<b>${T("Décroissance significative")}</b> : ${T("l’intervalle de confiance de r est entièrement négatif.")}` : `<b>${T("Tendance non significative")}</b> : ${T("l’intervalle de confiance de r contient 0 (plateau ou données insuffisantes) ; le temps de doublement n’est pas interprétable.")}`,
      f.R_implicite ? `${T("R implicite (Wallinga & Lipsitch, intervalle sériel retenu)")} : <b>${fmtR(f.R_implicite)}</b> ${f.R_implicite_ic95 && f.R_implicite_ic95[0] ? ci(f.R_implicite_ic95[0], f.R_implicite_ic95[1]) : ""}.` : "",
      `${T("Ajustement sur")} ${nf(f.semaines)} ${T("semaines")} (${dshort(f.debut)} → ${dshort(f.fin)}), R² = ${nf(f.r2, 2)}${f.zeros_ignores ? ` ; ${f.zeros_ignores} ${T("semaine(s) à 0 cas ignorée(s)")}` : ""}.`
    ];
  }

  function dynamicsView() {
    const grp = dyGroup(), gid = grp.id;
    const rt = (DY.rt || {})[gid] || {}, cons = rt.dernier_consolide || {}, last = rt.dernier || {};
    const lik = (DY.R_vraisemblance || {})[gid] || {}, l28 = lik["28j"] || {};
    const pj = (DY.projections || {})[gid] || {}, p14 = (pj.totaux || {})["14j"] || {};
    const { fit } = growthFit();
    const siu = DY.intervalle_seriel_utilise || {}, imp = DY.imputation || {};
    const winOpts = [["6s", "6 sem."], ["12s", "12 sem."], ["pic", "Depuis le pic"], ["split", "2 phases"], ["tout", "Tout"]];
    const rtTrend = cons.mediane === undefined ? "" : cons.q975 < 1 ? T("transmission en recul (R < 1 avec ≥ 97,5 % de probabilité)") : cons.q025 > 1 ? T("transmission en expansion (R > 1 avec ≥ 97,5 % de probabilité)") : T("transmission proche du seuil (R ≈ 1)");
    return `
    <div class="flex between" style="margin-bottom:12px">
      <div class="flex">${groupSelect()}</div>
      <div class="small muted">${T("Cas confirmés et probables par date de début des symptômes")} · ${nf(imp.dds_imputee)} ${T("dates imputées")} (${pc(imp.pct_imputee, 0)}) · ${T("dernier jour consolidé")} : ${dshort(cons.date)}</div>
    </div>
    <div class="grid g5">
      ${kpi("Rt consolidé", cons.mediane !== undefined ? fmtR(cons.mediane) : "—", cons.mediane !== undefined ? `IC 95 % ${fmtR(cons.q025)}, ${fmtR(cons.q975)} · ${dshort(cons.date)} · P(R>1) = ${pc(100 * cons.p_sup_1, 0)}` : "", { cls: cons.q025 > 1 ? "alert" : cons.q975 < 1 ? "good" : "", color: "--rc-rt" })}
      ${kpi("Rt provisoire (derniers jours)", last.mediane !== undefined ? fmtR(last.mediane) : "—", last.mediane !== undefined ? `IC 95 % ${fmtR(last.q025)}, ${fmtR(last.q975)} · ${dshort(last.date)} · ${T("à confirmer")}` : "", { color: "--muted" })}
      ${kpi("Variation hebdomadaire", fit && fit.r !== undefined ? pctS(fit.variation_hebdo_pct) : fit && fit.apres ? pctS(fit.apres.variation_hebdo_pct) : "—", fit && fit.r !== undefined ? (fit.sens === "croissance" ? `${T("Doublement")} ${nf(fit.temps_doublement, 0)} ${T("j")} · ` : fit.sens === "decroissance" ? `${T("Division par deux")} ${nf(fit.temps_demi, 0)} ${T("j")} · ` : "") + `${T(fit.sens === "croissance" ? "croissance significative" : fit.sens === "decroissance" ? "décroissance significative" : "tendance non significative (plateau)")} · ${T(S.growWin === "6s" ? "6 sem." : S.growWin === "12s" ? "12 sem." : S.growWin === "pic" ? "depuis le pic" : "toute la période")}` : T("Modèle à 2 phases"), { color: "--s2" })}
      ${kpi("R (vraisemblance, 28 j)", l28.R_ml !== undefined ? fmtR(l28.R_ml) : "—", l28.R_ml !== undefined ? `IC 95 % ${fmtR(l28.ic95[0])}, ${fmtR(l28.ic95[1])} · ${nf(l28.cas, 0)} ${T("cas")}` : "", { color: "--rc-r1" })}
      ${kpi("Cas projetés sur 14 jours", p14.mediane !== undefined ? nf(p14.mediane) : "—", p14.mediane !== undefined ? `${T("Intervalle 80 %")} ${nf(p14.q10)}, ${nf(p14.q90)} · P(0 ${T("cas")}) ${pc(100 * p14.p_aucun_cas, 0)}` : "", { color: "--s7" })}
    </div>
    ${rt.dernier_consolide ? `<div class="notice ${cons.q025 > 1 ? "crit" : ""}"><b>${T("Synthèse")}, ${esc(T(grp.nom))}</b> : ${rtTrend}. ${T("Intervalle sériel utilisé")} : ${nf(siu.moyenne, 1)} ± ${nf(siu.ecart_type, 1)} ${T("j")} (${esc(T(siu.source || ""))}). ${T("Les derniers jours restent incomplets malgré la correction du retard de notification : privilégier le Rt consolidé pour la décision.")}</div>` : ""}

    ${panel("Courbe épidémique hebdomadaire et ajustement log-linéaire", T("incidence::fit, régression du logarithme de l’incidence hebdomadaire ; la courbe et sa bande donnent la tendance exponentielle et son IC 95 %"),
      `<div id="c-grow"></div><div class="statgrid" id="grow-stats"></div><div id="grow-interp"></div>`,
      { png: "croissance_loglineaire", tools: `${segBtns("growBase", [["dds", "Début des symptômes (corrigé)"], ["notification", "Notification"]])}${segBtns("growWin", winOpts)}` })}

    ${panel("Courbe épidémique quotidienne, hommes et femmes", T("Un carré = un cas lorsque les effectifs sont faibles (incidence::plot, show_cases) ; zone grisée = jours encore incomplets"),
      `<div id="c-dsex"></div><div id="dsex-interp"></div>`,
      { png: "courbe_quotidienne_sexe", tools: `${segBtns("dyStack", [["sexe", "Sexe"], ["age", "Classe d’âge"]])}${segBtns("dyBase", [["o", "Début des symptômes"], ["n", "Notification"]])}${segBtns("dyDays", [["30", "30 j"], ["60", "60 j"], ["120", "120 j"]])}` })}

    ${panel("Nombre de reproduction effectif Rt (EpiEstim)", T("Fenêtres glissantes de 7 jours, intervalle sériel paramétrique avec incertitude ; en haut l’incidence, en bas Rt (médiane, IC 50 % et 95 %), ligne pointillée : seuil R = 1"),
      `<div class="chart-stack"><div id="c-rt-inc"></div><div id="c-rt"></div></div><div id="rt-interp"></div>`,
      { png: "rt_epiestim", tools: `${segBtns("rtDays", [["60", "60 j"], ["120", "120 j"], ["200", "Tout"]])}${gid === "National" ? `<label class="small flex" style="gap:4px"><input type="checkbox" data-check="siCmp" ${S.siCmp ? "checked" : ""}>${T("Comparer SI OMS 2014")}</label>` : ""}` })}

    <div class="grid g2">
      ${panel("Vraisemblance de R (earlyR)", T("R supposé constant sur la fenêtre ; ligne verticale : seuil R = 1"), `<div id="c-rlik"></div><div id="rlik-interp"></div>`, { png: "vraisemblance_R", tools: segBtns("rlWin", [["14j", "14 j"], ["28j", "28 j"], ["tout", "Tout"]]) })}
      ${panel("Force d’infection λ", T("λt = Σ I(t−s)·w(s) : cas attendus si R = 1 (barres) ; cas observés (tiges pointillées)"), `<div id="c-lambda"></div><div id="lambda-interp"></div>`, { png: "force_infection" })}
    </div>

    ${panel("Projections à court terme (processus de branchement)", `${T("projections::project, 1 000 simulations, R tiré du posterior du dernier Rt consolidé et supposé constant")} · ${T("départ")} ${dshort(pj.depart)}`,
      `<div id="c-proj"></div><div id="proj-table"></div><div id="proj-interp"></div>`,
      { png: "projections", tools: segBtns("projH", [["14", "14 j"], ["30", "30 j"]]) })}

    <div class="grid g2">
      ${panel("Intervalle sériel", T("Histogramme (saumon) et loi gamma discrétisée ajustée (points violets), epitrix::fit_disc_gamma" + " · " + T("Ensemble des données (national)")), `<div id="c-si-fit"></div><div id="si-sum"></div>`, { png: "intervalle_seriel_ajuste" })}
      ${panel("Période d’incubation", T("Dernière exposition déclarée du contact → début des symptômes du cas (contacts devenus cas, lien certain ou probable)" + " · " + T("Ensemble des données (national)")), `<div id="c-inc-fit"></div><div id="inc-sum"></div>`, { png: "incubation_ajustee" })}
    </div>
    ${panel("Autres délais épidémiologiques", T("Distribution observée et loi gamma discrétisée ajustée (cas débutés il y a plus de 30 jours pour limiter la troncature)" + " · " + T("Ensemble des données (national)")), `<div id="c-dl-fit"></div><div id="dl-sum"></div>`,
      { png: "delais_ajustes", tools: `<select data-state="distK">${[["dds_notification", "Début des symptômes → notification"], ["dds_prelevement", "Début des symptômes → prélèvement"], ["dds_admission", "Début des symptômes → admission (CTE)"], ["prelevement_resultat", "Prélèvement → résultat de laboratoire"], ["admission_sortie", "Admission → sortie / issue"]].map(([k, t]) => `<option value="${k}" ${S.distK === k ? "selected" : ""}>${T(t)}</option>`).join("")}</select>` })}

    ${demoPanels()}`;
  }

  function demoPanels() {
    const dm = DY.demographie || {}, sx = dm.par_sexe || [], ct = dm.contacts_par_sexe || [];
    const card = r => `<div class="sexcard"><div>${sexIco(r.code, 40)}</div><div><div class="flex between"><b>${T(SEXL[r.code])}</b><span class="big">${nf(r.cas)}</span></div>
      <div class="row"><span>${T("Part des cas")}</span><b>${pc(r.pct, 1)}</b></div>
      <div class="row"><span>${T("Décès")}</span><b>${nf(r.deces)}</b></div>
      <div class="row"><span>${T("Létalité")}</span><b>${pc(r.letalite_pct, 1)} <span class="muted small">${ci(r.letalite_ic95[0], r.letalite_ic95[1], 1)}</span></b></div>
      <div class="row"><span>${T("Âge médian (IQR)")}</span><b>${nf(r.age_median, 0)} ${T("ans")} <span class="muted small">(${nf(r.age_q1, 0)}–${nf(r.age_q3, 0)})</span></b></div>
      <div class="row"><span>${T("Personnels de santé")}</span><b>${nf(r.agents_sante)}</b></div>
      ${r.connus_contacts !== null && r.connus_contacts !== undefined ? `<div class="row"><span>${T("Connus comme contacts")}</span><b>${nf(r.connus_contacts)} (${pc(100 * r.connus_contacts / Math.max(r.cas, 1), 1)})</b></div>` : ""}</div></div>`;
    const m = sx.find(r => r.code === "M"), f = sx.find(r => r.code === "F"), tst = dm.test_letalite_sexe;
    const items = m && f ? [
      `${T("Rapport de masculinité")} (H/F) : <b>${nf(dm.sex_ratio_MF, 2)}</b>, ${dm.sex_ratio_MF < 1 ? T("les femmes sont majoritaires parmi les cas, ce qui est classique pour Ebola (soins aux malades, rites funéraires).") : T("les hommes sont majoritaires parmi les cas.")}`,
      `${T("Létalité")} : ${T("hommes")} ${pc(m.letalite_pct, 1)} vs ${T("femmes")} ${pc(f.letalite_pct, 1)}${tst ? ` (χ² = ${nf(tst.chi2, 2)}, p = ${tst.p < .001 ? "< 0,001" : nf(tst.p, 3)}, ${tst.p < .05 ? T("différence statistiquement significative") : T("différence non significative")})` : ""}.`,
      ct.length ? `${T("Contacts devenus cas")} : ${ct.filter(c => c.code !== "I").map(c => `${T(SEXL[c.code])} ${pc(c.taux_pct, 2)} ${ci(c.taux_ic95[0], c.taux_ic95[1], 2)}`).join(" · ")}.` : ""
    ] : [];
    const ctTable = ct.length ? `<h3 class="small" style="margin:14px 0 4px">${T("Contacts suivis par sexe")}</h3><div class="table-wrap"><table class="rsum"><thead><tr><th>${T("Sexe")}</th><th>${T("Contacts")}</th><th>${T("Devenus cas")}</th><th>${T("Taux")} (IC 95 %)</th><th>${T("Devenus suspects")}</th><th>${T("Âge médian")}</th></tr></thead><tbody>${ct.map(r => `<tr><td>${sexIco(r.code, 14)} ${T(SEXL[r.code])}</td><td>${nf(r.contacts)}</td><td>${nf(r.devenus_cas)}</td><td>${pc(r.taux_pct, 2)} <span class="muted">${ci(r.taux_ic95[0], r.taux_ic95[1], 2)}</span></td><td>${nf(r.devenus_suspects)}</td><td>${nf(r.age_median, 0)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const ages = (dm.par_age || []).filter(r => r.classe_age !== "Inconnu");
    const ageTable = ages.length ? `<div class="table-wrap" style="margin-top:10px"><table class="rsum"><thead><tr><th>${T("Âge")}</th><th>${sexIco("M", 13)} ${T("cas")}</th><th>${sexIco("M", 13)} ${T("létalité")}</th><th>${sexIco("F", 13)} ${T("cas")}</th><th>${sexIco("F", 13)} ${T("létalité")}</th></tr></thead><tbody>${ages.map(r => `<tr><td>${esc(r.classe_age)}</td><td>${nf(r.cas_M)}</td><td>${pc(r.letalite_M, 1)}</td><td>${nf(r.cas_F)}</td><td>${pc(r.letalite_F, 1)}</td></tr>`).join("")}</tbody></table></div>` : "";
    return `<div class="grid g2">
      ${panel("Hommes et femmes, profil des cas", T("Cas confirmés et probables ; létalité avec intervalle de Wilson à 95 %") + " · " + T("Ensemble des données (national)"), `<div class="sexcards">${sx.filter(r => r.code !== "I").map(card).join("")}</div>${ctTable}${interp("Lecture", items)}`)}
      ${panel("Létalité par classe d’âge et sexe", T("Classes d’âge des practicals RECON (0–10, 11–20, 21–30, 31–40, 41+)") + " · " + T("Ensemble des données (national)"), `<div id="c-cfr-age"></div>${ageTable}`, { png: "letalite_age_sexe" })}
    </div>`;
  }

  function distChart(id, d, opt = {}) {
    const box = $(id); if (!box) return;
    if (!d || !d.histogramme) { box.innerHTML = `<div class="empty">${T("Données insuffisantes")}</div>`; return; }
    const n = d.n || 1, fitp = d.ajustement && d.ajustement.pmf;
    const maxK = Math.min(60, Math.max(15, ...d.histogramme.map((v, i) => v ? i : 0)) + 3);
    const rows = Array.from({ length: maxK + 1 }, (_, k) => ({ k, freq: d.histogramme[k] / n, fit: fitp ? fitp[k] : null, ref: opt.ref ? opt.ref[k] : null }));
    Ch.xy(box, { data: rows, x: "k", height: 240, barWidth: .98, barStroke: "--surface", xLabel: (v, r, tip) => tip ? `${v} ${T("jours")}` : v, xLabelWidth: 26, digits: 3, yFmt: v => nf(v, 2),
      series: [{ key: "freq", label: T("Distribution observée (proportion)"), color: "--rc-salmon" }, ...(fitp ? [{ key: "fit", label: T("Gamma discrétisée ajustée"), color: "--rc-purple", type: "line", dash: "5 4", markers: true, r: 2.6 }] : []),
        ...(opt.ref ? [{ key: "ref", label: opt.refLabel, color: "--ink-2", type: "line", dash: "2 3", markers: false, width: 1.5 }] : [])] });
  }
  function discGammaJS(mean, sd, nmax = 60) {
    // CDF gamma par intégration numérique (pour la courbe de référence)
    const sh = (mean / sd) ** 2, sc = sd * sd / mean, lg = lgamma(sh), pdf = x => x <= 0 ? 0 : Math.exp((sh - 1) * Math.log(x) - x / sc - lg - sh * Math.log(sc));
    const out = []; for (let k = 0; k <= nmax; k++) { let s = 0; for (let j = 0; j < 20; j++) s += pdf(k + (j + .5) / 20) / 20; out.push(s); } return out;
  }
  function lgamma(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < .5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + .5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x); }
  function distSummary(d, ref) {
    if (!d || !d.resume) return `<div class="muted small">${T("Données insuffisantes")} (n = ${nf(d ? d.n : 0)})</div>`;
    const r = d.resume, f = d.ajustement || {};
    return `<table class="rsum"><thead><tr><th>${T("Résumé")}</th><th>Min.</th><th>1st Qu.</th><th>${T("Médiane")}</th><th>${T("Moyenne")}</th><th>3rd Qu.</th><th>Max.</th><th>n</th></tr></thead>
      <tbody><tr><td>${T("Observé")}</td><td>${nf(r.min)}</td><td>${nf(r.q1, 1)}</td><td>${nf(r.mediane, 1)}</td><td>${nf(r.moyenne, 2)}</td><td>${nf(r.q3, 1)}</td><td>${nf(r.max)}</td><td>${nf(d.n)}</td></tr></tbody></table>
      ${f.moyenne ? `<div class="statgrid">${stat("Moyenne μ (gamma)", `${nf(f.moyenne, 2)} ${T("j")}`, `IC 95 % ${nf(f.moyenne_ic95[0], 2)}, ${nf(f.moyenne_ic95[1], 2)}`)}${stat("Écart-type σ", `${nf(f.ecart_type, 2)} ${T("j")}`, `CV = ${nf(f.cv, 3)}`)}${stat("Forme / échelle", `${nf(f.shape, 3)} / ${nf(f.scale, 3)}`, `log-vraisemblance ${nf(f.loglik, 1)}`)}${stat("Médiane / 95e percentile", `${nf(f.mediane, 1)} / ${nf(f.p95, 1)} ${T("j")}`, "")}</div>` : ""}
      ${(d.exclus_negatifs || d.exclus_sup_60 || d.exclus_inf_1) ? `<div class="small muted" style="margin-top:6px">${T("Exclus")} : ${nf(d.exclus_negatifs || 0)} ${T("valeurs négatives")} · ${nf(d.exclus_sup_60 || 0)} > 60 ${T("j")}${d.exclus_inf_1 ? ` · ${nf(d.exclus_inf_1)} < 1 ${T("j")} (${T("exposition déclarée après le début des symptômes")})` : ""}</div>` : ""}
      ${ref ? `<div class="interp"><b>${T("Comparaison")}</b> : ${ref}</div>` : ""}`;
  }

  function dynamicsCharts() {
    const grp = dyGroup(), gid = grp.id;
    const rows = seriesRows(gid);
    const lastDay = (DY.series || {})[gid]?.dernier_jour_fiable;
    /* --- croissance log-linéaire --- */
    const { g, fit, win } = growthFit();
    if (g && $("#c-grow")) {
      const wk = g.semaines.map(r => ({ week: r.week, n: r.n }));
      const put = (f, k) => (f?.ajuste || []).forEach(a => { const r = wk.find(x => x.week === a.week); if (r) { r["fit" + k] = a.fit; r["lo" + k] = a.lo; r["hi" + k] = a.hi; } });
      const split = win === "split" && fit && fit.avant;
      if (split) { put(fit.avant, 1); put(fit.apres, 2); } else if (fit) put(fit, 1);
      Ch.xy($("#c-grow"), { data: wk, x: "week", height: 290, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), tipSkipNull: true,
        bands: [{ lo: "lo1", hi: "hi1", color: "--s2", label: T("IC 95 % de l’ajustement"), opacity: .18 }, ...(split ? [{ lo: "lo2", hi: "hi2", color: "--s7", label: T("IC 95 %, phase 2"), opacity: .18 }] : [])],
        vlines: split ? [{ x: fit.separation, color: "--ink-2", label: T("Changement de phase") }] : [],
        series: [{ key: "n", label: S.growBase === "dds" ? T("Cas / semaine (début des symptômes, corrigé)") : T("Cas / semaine (notification)"), color: "--rc-bar" },
          { key: "fit1", label: split ? T("Phase 1 (croissance)") : T("Ajustement log-linéaire"), color: "--s2", type: "line", markers: false, width: 2.5 },
          ...(split ? [{ key: "fit2", label: T("Phase 2"), color: "--s7", type: "line", markers: false, width: 2.5 }] : [])] });
      const fs = split ? [["Phase 1", fit.avant], ["Phase 2", fit.apres]] : [["", fit]];
      $("#grow-stats").innerHTML = fs.filter(x => x[1]).map(([lab, f]) => [
        stat(`${lab ? T(lab) + " · " : ""}r ${T("par jour")}`, nf(f.r, 4), ci(f.r_ic95[0], f.r_ic95[1], 4)),
        stat(`${lab ? T(lab) + " · " : ""}${T("Variation hebdomadaire")}`, pctS(f.variation_hebdo_pct), ci(f.variation_hebdo_ic95[0], f.variation_hebdo_ic95[1], 1)),
        stat(`${lab ? T(lab) + " · " : ""}${f.r >= 0 ? T("Temps de doublement") : T("Temps de division par deux")}`, f.sens === "incertain" ? T("non interprétable") : f.r >= 0 ? (f.temps_doublement ? nf(f.temps_doublement, 1) + " " + T("j") : "—") : (f.temps_demi ? nf(f.temps_demi, 1) + " " + T("j") : "—"),
          f.r >= 0 ? (f.temps_doublement_ic95 ? `[${nf(f.temps_doublement_ic95[0], 1)}, ${f.temps_doublement_ic95[1] ? nf(f.temps_doublement_ic95[1], 1) : "∞"}]` : "") : (f.temps_demi_ic95 ? `[${nf(f.temps_demi_ic95[0], 1)}, ${f.temps_demi_ic95[1] ? nf(f.temps_demi_ic95[1], 1) : "∞"}]` : "")),
        stat(`${lab ? T(lab) + " · " : ""}${T("R implicite")}`, fmtR(f.R_implicite), f.R_implicite_ic95 && f.R_implicite_ic95[0] ? ci(f.R_implicite_ic95[0], f.R_implicite_ic95[1]) : ""),
        stat(`${lab ? T(lab) + " · " : ""}R²`, nf(f.r2, 3), `${nf(f.semaines)} ${T("semaines")}`)].join("")).join("");
      const items = split ? [`${T("Meilleure séparation en deux phases (incidence::fit_optim_split) le")} <b>${dfmt(fit.separation)}</b>.`, ...growthText(fit.avant).slice(0, 2).map(x => `${T("Phase 1")}, ${x}`), ...growthText(fit.apres).slice(0, 3).map(x => `${T("Phase 2")}, ${x}`)] : growthText(fit);
      $("#grow-interp").innerHTML = interp("Interprétation", [...items, S.growBase === "dds" ? T("Base « début des symptômes » : les semaines dont la complétude moyenne est < 80 % sont exclues ; l’incidence est corrigée du retard de notification.") : T("Base « notification » : reflète aussi l’effort de détection et les retards de saisie ; la semaine en cours est exclue.")],
        T("Limites : modèle exponentiel simple (pas de saturation), sensible aux changements de détection ; le temps de doublement n’a de sens que si r est significativement différent de 0."));
    }
    /* --- courbe quotidienne hommes / femmes --- */
    if ($("#c-dsex")) {
      const E = DY.epicourbes || {}, nd = Number(S.dyDays), base = S.dyBase;
      const end = D.meta.cutoff, start = addDays(end, -(nd - 1));
      const match = r => gid === "National" || (gid.startsWith("P:") ? r[2] === gid.slice(2) : r[3] === gid.slice(2));
      const map = new Map(); for (let d = start; d <= end; d = addDays(d, 1)) map.set(d, { date: d, M: 0, F: 0, I: 0, a0: 0, a1: 0, a2: 0, a3: 0, a4: 0, a5: 0 });
      (E.quotidien || []).forEach(r => { if (r[0] !== base || !map.has(r[1]) || !match(r)) return; const o = map.get(r[1]); o[r[4]] += r[7]; o["a" + r[5]] += r[7]; });
      const data = [...map.values()];
      const compOf = d => { const x = rows.find(y => y.date === d); return x ? x.comp : 1; };
      const prov = base === "o" ? firstIdx(data, r => compOf(r.date) < .9) : Math.max(0, data.length - 3);
      const series = S.dyStack === "age" ? (DY.classes_age || []).map((a, i) => ({ key: "a" + i, label: a === "Inconnu" ? T("Âge inconnu") : a + " " + T("ans"), color: AGEC[i] }))
        : ["M", "F", "I"].map(k => ({ key: k, label: T(SEXL[k]), color: SEXC[k] }));
      Ch.xy($("#c-dsex"), { data, x: "date", stacked: true, showCases: true, height: 260, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), xLabelWidth: 52, series,
        shade: prov !== null ? { from: prov, label: T("incomplet") } : null });
      const tot = data.reduce((s, r) => ({ M: s.M + r.M, F: s.F + r.F, I: s.I + r.I }), { M: 0, F: 0, I: 0 });
      const all = tot.M + tot.F + tot.I;
      $("#dsex-interp").innerHTML = interp("Lecture", [`${T("Sur les")} ${nd} ${T("derniers jours")} (${esc(T(grp.nom))}) : <b>${nf(all)}</b> ${T("cas")}, ${sexIco("M", 14)} ${nf(tot.M)} ${T("hommes")} (${pc(100 * tot.M / Math.max(all, 1), 0)}) · ${sexIco("F", 14)} ${nf(tot.F)} ${T("femmes")} (${pc(100 * tot.F / Math.max(all, 1), 0)})${tot.I ? ` · ${nf(tot.I)} ${T("non renseignés")}` : ""}.`,
        base === "o" ? T("Par date de début des symptômes, les derniers jours sont sous-estimés tant que les cas n’ont pas été notifiés (zone grisée).") : T("Par date de notification, les 3 derniers jours peuvent être incomplets (saisie en cours).")]);
    }
    /* --- Rt --- */
    const rt = (DY.rt || {})[gid];
    if (rt && $("#c-rt")) {
      const nd = Number(S.rtDays);
      const R = rt.lignes.map(a => Object.fromEntries(rt.cols.map((c, i) => [c, a[i]]))).slice(-nd);
      if (S.siCmp && rt.sensibilite_si_oms) { const m = new Map(rt.sensibilite_si_oms.map(a => [a[0], a])); R.forEach(r => { const x = m.get(r.date); if (x) { r.oms = x[1]; } }); }
      const prov = firstIdx(R, r => r.provisoire);
      const inc = R.map(r => { const x = rows.find(y => y.date === r.date) || {}; return { date: r.date, obs: x.obs, corr: x.corr }; });
      Ch.xy($("#c-rt-inc"), { data: inc, x: "date", height: 150, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), shade: prov !== null ? { from: prov, label: T("provisoire") } : null,
        series: [{ key: "obs", label: T("Cas observés (début des symptômes)"), color: "--rc-bar" }, { key: "corr", label: T("Corrigés du retard de notification"), color: "--s2", type: "line", markers: false }] });
      Ch.xy($("#c-rt"), { data: R, x: "date", height: 250, digits: 2, xLabel: (v, r, tip) => tip ? `${T("Fenêtre se terminant le")} ${dfmt(v)}` : dshort(v),
        shade: prov !== null ? { from: prov, label: T("provisoire") } : null,
        bands: [{ lo: "q025", hi: "q975", color: "--rc-rt", label: T("IC crédible 95 %"), opacity: .22 }, { lo: "q25", hi: "q75", color: "--rc-rt", label: T("IC 50 %"), opacity: .3 }],
        hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }],
        tipExtra: r => `<div class="row"><span>P(R > 1)</span><b>${pc(100 * r.p_sup_1, 0)}</b></div><div class="row"><span>${T("Cas dans la fenêtre")}</span><b>${nf(r.cas_fenetre, 0)}</b></div>`,
        series: [{ key: "mediane", label: T("Rt médian"), color: "--rc-rt", type: "line", markers: false, width: 2.4 }, ...(S.siCmp && rt.sensibilite_si_oms ? [{ key: "oms", label: T("Rt médian avec SI OMS 2014 (15,3 ± 9,3 j)"), color: "--ink-2", type: "line", dash: "4 3", markers: false }] : [])] });
      const c = rt.dernier_consolide || {}, l = rt.dernier || {};
      const R7 = R.filter(r => !r.provisoire); const prev = R7.length > 14 ? R7[R7.length - 15] : null;
      $("#rt-interp").innerHTML = interp("Interprétation", [
        c.mediane !== undefined ? `${T("Dernier Rt consolidé")} (${dfmt(c.date)}) : <b>${fmtR(c.mediane)}</b> ${ci(c.q025, c.q975)} ; P(R > 1) = <b>${pc(100 * c.p_sup_1, 0)}</b>.` : "",
        prev ? `${T("Il y a deux semaines")} : ${fmtR(prev.mediane)} ${ci(prev.q025, prev.q975)} → ${c.mediane < prev.mediane ? T("baisse") : T("hausse")} ${T("de la transmission")}.` : "",
        l.mediane !== undefined && l.provisoire ? `${T("Les fenêtres les plus récentes")} (${T("zone grisée")}) ${T("donnent")} ${fmtR(l.mediane)} ${ci(l.q025, l.q975)} : ${T("valeur provisoire, généralement sous-estimée tant que les notifications tardives ne sont pas saisies.")}` : "",
        c.mediane !== undefined ? (c.q975 < 1 ? T("Chaque cas génère en moyenne moins d’un cas secondaire : l’épidémie décroît si les mesures sont maintenues.") : c.q025 > 1 ? T("Chaque cas génère en moyenne plus d’un cas secondaire : l’épidémie croît ; renforcer isolement, suivi des contacts et vaccination en anneau.") : T("R est proche de 1 : situation d’équilibre fragile, un relâchement peut relancer la croissance.")) : "",
        S.siCmp ? T("Sensibilité : avec l’intervalle sériel plus long de l’OMS (2014), Rt s’écarte davantage de 1 (plus haut en croissance, plus bas en décroissance) ; le sens de la tendance est inchangé.") : ""
      ], T("Limites (EpiEstim) : suppose une détection constante et des cas tous locaux ; mélange des zones dans l’estimation nationale ; sensibilité au choix de l’intervalle sériel."));
    }
    /* --- earlyR --- */
    const lk = (DY.R_vraisemblance || {})[gid];
    if (lk && $("#c-rlik")) {
      const L0 = lk[S.rlWin] || lk["28j"] || lk.tout;
      if (L0) {
        const Sx = L0.cas, Lm = Sx / L0.R_ml, se = Math.sqrt(Sx) / Lm;
        const lo = Math.max(0.001, Math.min(L0.ic95[0] - 4 * se, .97)), hi = Math.max(L0.ic95[1] + 4 * se, 1.03);
        const grid = Array.from({ length: 161 }, (_, i) => lo + (hi - lo) * i / 160);
        const llm = Sx * Math.log(L0.R_ml) - L0.R_ml * Lm;
        const data = grid.map(R => ({ R: R.toFixed(R < 10 ? 3 : 2), v: Math.exp(Sx * Math.log(R) - R * Lm - llm) }));
        const idxOf = v => grid.reduce((b, R, i) => Math.abs(R - v) < Math.abs(grid[b] - v) ? i : b, 0);
        Ch.xy($("#c-rlik"), { data, x: "R", height: 250, digits: 3, xLabel: (v, r, tip) => tip ? `R = ${nf(Number(v), 3)}` : nf(Number(v), 2), xLabelWidth: 54, yFmt: v => nf(v, 1),
          series: [{ key: "v", label: T("Vraisemblance relative"), color: "--rc-purple", type: "area", markers: false }],
          vlines: [{ i: idxOf(1), color: "--rc-r1", label: "R = 1", dash: "0" }, { i: idxOf(L0.R_ml), color: "--ink-2", label: `${T("MV")} ${nf(L0.R_ml, 3)}`, dy: 14 }, { i: idxOf(L0.ic95[0]), color: "--muted", dash: "2 3" }, { i: idxOf(L0.ic95[1]), color: "--muted", dash: "2 3" }] });
        $("#rlik-interp").innerHTML = interp("Interprétation", [`${T("Estimation du maximum de vraisemblance")} : <b>R = ${nf(L0.R_ml, 3)}</b> ${ci(L0.ic95[0], L0.ic95[1], 3)} ${T("sur")} ${L0.fenetre_jours} ${T("jours")} (${nf(L0.cas, 0)} ${T("cas")}) ; P(R > 1) = ${pc(100 * L0.p_sup_1, 1)}.`,
          (L0.ic95[1] < 1) ? T("R = 1 est en dehors de l’intervalle : la décroissance est nette sur cette fenêtre.") : (L0.ic95[0] > 1) ? T("R = 1 est en dehors de l’intervalle : la croissance est nette sur cette fenêtre.") : T("R = 1 est compatible avec les données de cette fenêtre."),
          S.rlWin === "tout" ? T("Sur toute la période, R constant est une hypothèse forte (earlyR est conçu pour le début d’épidémie) : comparer avec Rt.") : T("Comparer la fenêtre de 14 j à celle de 28 j : une valeur plus basse sur 14 j indique un ralentissement récent (ou des notifications tardives).")],
          T("Hypothèse clé : R constant et intervalle sériel connu, c’est la principale limite soulignée dans les practicals RECON."));
      }
      const lam = (lk.lambda || []).map(a => ({ date: a[0], lam: a[1], obs: a[2] })).slice(-60);
      Ch.xy($("#c-lambda"), { data: lam, x: "date", height: 250, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), digits: 1,
        series: [{ key: "lam", label: T("Force d’infection λ (cas attendus si R = 1)"), color: "--rc-grey" }, { key: "obs", label: T("Cas observés (corrigés)"), color: "--rc-rt", type: "stem" }] });
      const l14 = lam.slice(-14), sl = l14.reduce((s, r) => s + r.lam, 0), so = l14.reduce((s, r) => s + (r.obs || 0), 0);
      $("#lambda-interp").innerHTML = interp("Lecture", [`${T("Sur les 14 derniers jours disponibles")} : ${nf(so, 0)} ${T("cas observés pour")} ${nf(sl, 0)} ${T("attendus si R = 1")} → ${T("rapport")} <b>${nf(so / Math.max(sl, 1e-9), 2)}</b> (${T("estimation grossière de R")}).`, T("Quand les tiges restent sous les barres, chaque génération est plus petite que la précédente.")]);
    }
    /* --- projections --- */
    const pj = (DY.projections || {})[gid];
    if (pj && $("#c-proj")) {
      const H = Number(S.projH), P = pj.lignes.map(a => Object.fromEntries(pj.cols.map((c, i) => [c, a[i]])));
      const end = D.meta.cutoff, stop = addDays(end, H);
      const hist = rows.filter(r => r.date >= addDays(pj.depart, -45) && r.date < pj.depart).map(r => ({ date: r.date, obs: r.obs, corr: r.corr }));
      const fut = P.filter(r => r.date <= stop).map(r => { const x = rows.find(y => y.date === r.date) || {}; return { date: r.date, obs: x.obs, corr: x.corr, med: r.mediane, q10: r.q10, q90: r.q90, q025: r.q025, q975: r.q975, p1: r.p_au_moins_1, mean: r.moyenne }; });
      const data = hist.concat(fut), iEnd = data.findIndex(r => r.date === end);
      Ch.xy($("#c-proj"), { data, x: "date", height: 300, digits: 1, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), tipSkipNull: true,
        bands: [{ lo: "q025", hi: "q975", color: "--s7", label: T("Intervalle 95 %"), opacity: .12 }, { lo: "q10", hi: "q90", color: "--s7", label: T("Intervalle 80 % (q10–q90)"), opacity: .22 }],
        vlines: [{ x: pj.depart, edge: true, color: "--muted", label: T("début de projection") }, ...(iEnd >= 0 ? [{ i: iEnd, color: "--ink-2", label: T("aujourd’hui"), dy: 14 }] : [])],
        tipExtra: r => r.p1 !== undefined ? `<div class="row"><span>P(≥ 1 ${T("cas")})</span><b>${pc(100 * r.p1, 0)}</b></div>` : "",
        series: [{ key: "obs", label: T("Observés (début des symptômes)"), color: "--rc-bar" }, { key: "corr", label: T("Corrigés du retard"), color: "--s2", type: "line", markers: false }, { key: "med", label: T("Projection médiane"), color: "--s7", type: "line", markers: false, width: 2.4 }] });
      const pick = P.filter(r => r.date > end && r.date <= stop).filter((r, i, a) => i % 7 === 6 || i === 0 || i === a.length - 1);
      const tt = pj.totaux || {};
      $("#proj-table").innerHTML = `<table class="rsum"><thead><tr><th>${T("Date")}</th><th>Min.</th><th>1st Qu.</th><th>${T("Médiane")}</th><th>${T("Moyenne")}</th><th>3rd Qu.</th><th>Max.</th><th>P(≥ 1 ${T("cas")})</th></tr></thead><tbody>${pick.map(r => `<tr><td>${dfmt(r.date)}</td><td>${nf(r.min)}</td><td>${nf(r.q25)}</td><td>${nf(r.mediane)}</td><td>${nf(r.moyenne, 2)}</td><td>${nf(r.q75)}</td><td>${nf(r.max)}</td><td>${pc(100 * r.p_au_moins_1, 1)}</td></tr>`).join("")}</tbody></table>
        <div class="statgrid">${["7j", "14j", "30j"].filter(k => tt[k]).map(k => stat(`${T("Total sur")} ${k.replace("j", " " + T("jours"))}`, nf(tt[k].mediane), `80 % : ${nf(tt[k].q10)}, ${nf(tt[k].q90)} · 95 % : ${nf(tt[k].q025)}, ${nf(tt[k].q975)}`)).join("")}${stat("R utilisé", `${fmtR(pj.R_utilise?.mediane)}`, ci(pj.R_utilise?.q025, pj.R_utilise?.q975))}</div>`;
      const t14 = tt["14j"] || {};
      const back = fut.filter(r => r.date <= end && r.corr !== null && r.corr !== undefined);
      const inside = back.filter(r => r.corr >= r.q025 && r.corr <= r.q975).length;
      $("#proj-interp").innerHTML = interp("Interprétation", [
        `${T("Si la transmission reste au niveau du dernier Rt consolidé")} (${fmtR(pj.R_utilise?.mediane)}), ${T("on attend environ")} <b>${nf(t14.mediane)}</b> ${T("nouveaux cas (date de début) sur les 14 prochains jours")} (80 % : ${nf(t14.q10)}, ${nf(t14.q90)}).`,
        t14.p_aucun_cas !== undefined ? `${T("Probabilité qu’aucun cas n’apparaisse sur 14 jours")} : <b>${pc(100 * t14.p_aucun_cas, 1)}</b>, ${t14.p_aucun_cas < .05 ? T("la fin de l’épidémie n’est pas en vue à court terme ; ne pas réduire la riposte.") : T("la probabilité d’extinction devient non négligeable, mais la surveillance doit être maintenue 42 jours.")}` : "",
        back.length ? `${T("Contrôle")} : ${inside}/${back.length} ${T("jours déjà partiellement observés (entre le départ de la projection et aujourd’hui) tombent dans l’intervalle 95 %.")}` : ""
      ], T("Limites : R constant (pas d’effet des interventions futures), incidence par date de début (différente des notifications), pas d’importations ; au-delà de 2–3 semaines, ce sont des scénarios."));
    }
    /* --- distributions --- */
    const ds = DY.distributions || {};
    const si = ds.si, inc = ds.incubation;
    distChart("#c-si-fit", si, { ref: discGammaJS(15.3, 9.3), refLabel: T("Référence OMS 2014 (15,3 ± 9,3 j)") });
    if ($("#si-sum")) $("#si-sum").innerHTML = distSummary(si, si && si.ajustement ? `${T("moyenne locale")} ${nf(si.ajustement.moyenne, 1)} ± ${nf(si.ajustement.ecart_type, 1)} ${T("j")} ${T("contre")} 15,3 ± 9,3 ${T("j")} ${T("en Afrique de l’Ouest (OMS, 2014)")}. ${si.ajustement.moyenne < 15.3 ? T("Un intervalle plus court est cohérent avec un isolement plus précoce des cas.") : ""} ${T("Paires utilisées")} : ${nf(si.n)} (${T("contact suivi devenu cas et sources déclarées, deux dates de début connues")}).` : "");
    distChart("#c-inc-fit", inc);
    if ($("#inc-sum")) $("#inc-sum").innerHTML = distSummary(inc, inc && inc.ajustement ? `${T("moyenne locale")} ${nf(inc.ajustement.moyenne, 1)} ${T("j")} (95e percentile ${nf(inc.ajustement.p95, 1)} ${T("j")}) ${T("contre")} 11,4 ${T("j")} (95e percentile 21 ${T("j")}) ${T("pour l’OMS (2014)")}. ${inc.n < 50 ? T("Effectif limité : interpréter avec prudence ; la durée de suivi de 21 jours reste la norme.") : ""}` : "");
    distChart("#c-dl-fit", ds[S.distK]);
    if ($("#dl-sum")) $("#dl-sum").innerHTML = distSummary(ds[S.distK]);
    /* --- démographie --- */
    const dm = DY.demographie || {};
    if ($("#c-cfr-age") && dm.par_age) {
      const a = dm.par_age.filter(r => r.classe_age !== "Inconnu");
      Ch.xy($("#c-cfr-age"), { data: a, x: "classe_age", height: 230, percent: true, digits: 1, xLabel: (v, r, tip) => tip ? `${v} ${T("ans")}, ${nf(r.cas_M)} H / ${nf(r.cas_F)} F` : v,
        series: [{ key: "letalite_M", label: T("Létalité, hommes"), color: "--sex-m" }, { key: "letalite_F", label: T("Létalité, femmes"), color: "--sex-f" }] });
    }
  }

  /* ================= RECONSTRUCTION (qui a infecté qui) ================= */
  function reconView() {
    const s = RC.resume || {}, A = s.A || {}, B = s.B || {}, off = s.offspring || {}, nb = off.ajustement || {};
    const zones = [...new Set(cases.filter(c => c.on && (c.cls === "Confirmé" || c.cls === "Probable") && inProv(c)).map(c => c.zs).filter(Boolean))].sort();
    if (S.recZone && !zones.includes(S.recZone)) S.recZone = "";
    if (!S.recZone) { const cnt = {}; (RC.liens || []).forEach(l => { if (l[2] >= Number(S.recSup)) { const c = caseBy.get(l[1]); if (c && c.zs && inProv(c)) cnt[c.zs] = (cnt[c.zs] || 0) + 1; } }); S.recZone = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || zones[0] || ""; }
    return `
    <div class="notice"><b>${T("Reconstruction probabiliste de la transmission")}</b>, ${T("inspirée d’outbreaker2 (practicals RECON), sans données génomiques")} : ${T("pour chaque cas, les infecteurs candidats sont les cas de la même aire de santé débutés 1 à 60 jours avant (modèle A, temporel seul), auxquels s’ajoutent les liens documentés par le suivi des contacts et l’investigation, fortement favorisés (modèle B, temporel + contacts, ε = 0,05). Le support d’un lien est la probabilité a posteriori que ce cas soit l’infecteur.")}</div>
    <div class="grid g5">
      ${kpi("Cas analysés", nf(s.cas), T("Confirmés et probables avec date de début"))}
      ${kpi("Infecteur probable identifié", pc(100 * (RC.liens || []).filter(l => l[2] >= .5).length / Math.max(s.cas, 1), 1), `${nf((RC.liens || []).filter(l => l[2] >= .5).length)} ${T("cas avec un lien de support ≥ 0,5 (modèle B)")}`, { color: "--rc-purple" })}
      ${kpi("Support médian", `${nf(A.support_median, 2)} → ${nf(B.support_median, 2)}`, T("Modèle A (temporel) → modèle B (temporel + contacts)"))}
      ${kpi("Liens documentés retenus", nf(B.liens_documentes), T("Contact suivi devenu cas ou source déclarée"), { color: "--st-conf" })}
      ${kpi("Dispersion k", nb.k !== undefined ? nf(nb.k, 2) : "—", nb.k !== undefined ? `IC 95 % ${nf(nb.k_ic95?.[0], 2)}, ${nf(nb.k_ic95?.[1], 2)} · ${pc(100 * nb.part_cas_80pct, 1)} ${T("des cas → 80 % des transmissions identifiées")}` : "", { color: "--s2" })}
    </div>
    <div class="grid g2">
      ${panel("Support des liens, modèle A (temporel seul)", T("Consensus : infecteur de support maximal pour chaque cas"), `<div id="c-supA"></div>`, { png: "support_modele_A" })}
      ${panel("Support des liens, modèle B (temporel + contacts)", T("L’ajout des données de contact déplace les supports vers 1 pour les liens documentés"), `<div id="c-supB"></div>`, { png: "support_modele_B" })}
    </div>
    ${interp("Interprétation", [
      `${T("Modèle A")} : ${T("support médian")} <b>${nf(A.support_median, 2)}</b>, ${pc(A.pct_sup_05, 1)} ${T("des liens ≥ 0,5")}, ${T("la seule chronologie ne permet pas de savoir « qui a infecté qui » quand beaucoup de cas surviennent au même endroit au même moment (résolution faible, comme dans les practicals RECON).")}`,
      `${T("Modèle B")} : ${T("support médian")} <b>${nf(B.support_median, 2)}</b>, ${pc(B.pct_sup_05, 1)} ${T("des liens ≥ 0,5")} ; ${nf(B.liens_documentes)} ${T("liens documentés retenus.")} ${T("Les données de contact rendent les liens beaucoup plus certains, mais elles ne couvrent qu’une petite partie des cas.")}`,
      T("Conséquence pour la riposte : la plupart des cas n’ont pas de source identifiée ; améliorer l’investigation (source MA‑1/2/3), le listage des contacts et le séquençage (INRB) est la priorité pour reconstruire les chaînes.")
    ], T("Peut-on toujours se fier aux données de contact ? Non : erreurs d’identifiants, contacts non listés ; c’est pourquoi le modèle garde une probabilité ε de transmission hors contacts."))}
    ${panel("Arbre de transmission daté", T("epicontacts « ttree » : x = date, lignes ordonnées par taille de sous-arbre ; arêtes colorées selon le support (gris clair → violet foncé), taille des nœuds = nombre de cas secondaires R_i ; cliquer un cas isole son sous-arbre, double-clic = réinitialiser"),
      `<div class="flex" style="margin-bottom:8px">
        <label class="field">${T("Zone de santé")}<select data-state="recZone">${zones.map(z => `<option ${S.recZone === z ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label>
        <label class="field">${T("Support minimal")}<select data-state="recSup">${[["0.05", "≥ 0,05"], ["0.3", "≥ 0,3 (RECON)"], ["0.5", "≥ 0,5"], ["0.8", "≥ 0,8"]].map(([v, t]) => `<option value="${v}" ${S.recSup === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field">${T("Couleur des nœuds")}<select data-state="recColor">${[["issue", "Issue (décès / vivant)"], ["age", "Classe d’âge"], ["sexe", "Sexe"], ["cls", "Classification"]].map(([v, t]) => `<option value="${v}" ${S.recColor === v ? "selected" : ""}>${T(t)}</option>`).join("")}</select></label>
        <label class="field">${T("Axe des dates")}<select data-state="recX"><option value="onset" ${S.recX === "onset" ? "selected" : ""}>${T("Début des symptômes")}</option><option value="inf" ${S.recX === "inf" ? "selected" : ""}>${T("Infection estimée")}</option></select></label>
        <label class="small flex" style="gap:4px"><input type="checkbox" data-check="recIcons" ${S.recIcons ? "checked" : ""}>${T("Symboles homme / femme")}</label>
        <label class="small flex" style="gap:4px"><input type="checkbox" data-check="recDoc" ${S.recDoc ? "checked" : ""}>${T("Liens documentés uniquement")}</label>
      </div><div id="c-ttree"></div><div id="ttree-legend"></div>`, { png: "arbre_transmission_" + S.recZone })}
    <div class="grid g21">
      ${panel("Distribution du nombre de cas secondaires (R_i)", T("Liens consensus de support ≥ 0,5 ; cas débutés il y a plus de 30 jours ; points : binomiale négative ajustée"), `<div id="c-off"></div>${nb.k !== undefined ? interp("Interprétation", [`${T("Moyenne")} ${nf(nb.R_moyen, 3)} ${T("cas secondaires identifiés par cas")} ; ${T("dispersion")} <b>k = ${nf(nb.k, 2)}</b> ${ci(nb.k_ic95?.[0], nb.k_ic95?.[1])} ; ${pc(100 * nb.part_zero, 1)} ${T("des cas sans cas secondaire identifié")}.`, nb.k < 1 ? T("k < 1 : transmission très hétérogène (« super-propagation »), une minorité de cas (souvent soins à domicile, funérailles, structures de santé) produit la majorité des cas secondaires ; cibler ces contextes.") : T("k ≥ 1 : transmission relativement homogène."), T("La moyenne est très inférieure à Rt car la majorité des transmissions ne sont pas documentées : k décrit l’hétérogénéité des transmissions identifiées, pas la totalité.")]) : ""}`, { png: "cas_secondaires" })}
      ${panel("Principaux propagateurs identifiés", T("Cas ayant le plus de cas secondaires (support ≥ 0,5), pseudonymisé"), table("rec-top", cases.filter(c => c.ri > 0 && inProv(c)).sort((a, b) => b.ri - a.ri).slice(0, 60), [{ k: "id", t: "Cas", v: x => `<a href="#/journey/${encodeURIComponent(x.k)}">${esc(x.id)}</a> <span class="muted">${esc(x.ini || "")}</span>`, csv: x => x.id }, { k: "sexe", t: "Sexe", v: x => `${sexIco(Ch.sexKey(x.sexe), 14)} ${esc(T(x.sexe || "—"))}`, csv: x => x.sexe }, { k: "age", t: "Âge", num: true }, { k: "zs", t: "Zone" }, { k: "on", t: "Début", v: x => dshort(x.on) }, { k: "ri", t: "Cas secondaires", num: true }, { k: "hcw", t: "Agent de santé", v: x => x.hcw ? badge("Oui", "b-info") : "" }, { k: "dc", t: "Décédé", v: x => x.dc ? badge("Oui", "b-crit") : "" }], { sort: "ri", maxh: 420, search: false }), { csv: "rec-top" })}
    </div>
    ${panel("Réseau des cas reliés (epicontacts)", T("Tous les liens documentés entre cas (contact suivi devenu cas, source déclarée) ; formes = homme / femme, couleur = classification, anneau = décédé ; chaque grappe est une chaîne"),
      `<div class="flex" style="margin-bottom:8px"><span class="small muted">${T("Taille minimale des chaînes")}</span>${segBtns("epiMin", [["2", "≥ 2 cas"], ["3", "≥ 3 cas"], ["5", "≥ 5 cas"]])}</div><div id="c-epinet"></div>${legend([{ t: "Confirmé", c: "--st-conf" }, { t: "Probable", c: "--s5" }, { t: "Lien contact suivi → cas", c: "--st-conf" }, { t: "Lien source déclarée", c: "--ink-2" }])}<div class="legend">${["M", "F", "I"].map(k => `<span>${sexIco(k, 15)}${T(SEXL[k])}</span>`).join("")}</div>`, { png: "reseau_cas" })}`;
  }
  function supHist(id, h) {
    if (!$(id)) return;
    const data = (h || []).map((v, i) => ({ b: (i * .05).toFixed(2) + "–" + ((i + 1) * .05).toFixed(2), v }));
    Ch.xy($(id), { data, x: "b", height: 220, barWidth: .98, barStroke: "--surface", xLabel: (v, r, tip) => tip ? `${T("Support")} ${v}` : v.split("–")[0], xLabelWidth: 34, series: [{ key: "v", label: T("Nombre de liens"), color: "--rc-grey" }], legend: false });
  }
  function reconCharts() {
    const s = RC.resume || {};
    supHist("#c-supA", s.A?.histogramme); supHist("#c-supB", s.B?.histogramme);
    const off = s.offspring || {}, nb = off.ajustement;
    if ($("#c-off") && off.histogramme) {
      const n = off.n_cas || 1;
      const data = off.histogramme.map((v, i) => ({ k: i, p: v / n, nb: nb ? nb.pmf[i] : null }));
      Ch.xy($("#c-off"), { data, x: "k", height: 230, digits: 4, barWidth: .9, barStroke: "--surface", yFmt: v => nf(v, 2), xLabel: (v, r, tip) => tip ? `${v} ${T("cas secondaires")}, ${nf(off.histogramme[v])} ${T("cas")}` : v,
        series: [{ key: "p", label: T("Proportion observée"), color: "--rc-salmon" }, ...(nb ? [{ key: "nb", label: T("Binomiale négative ajustée"), color: "--rc-purple", type: "line", dash: "5 4", markers: true, r: 2.6 }] : [])] });
    }
    /* arbre daté */
    if ($("#c-ttree")) {
      const minS = Number(S.recSup);
      const zc = cases.filter(c => c.zs === S.recZone && c.on && (c.cls === "Confirmé" || c.cls === "Probable"));
      const set = new Set(zc.map(c => c.k));
      const par = new Map();
      (RC.liens || []).forEach(l => { if (set.has(l[1]) && set.has(l[0]) && l[2] >= minS && (!S.recDoc || l[3])) par.set(l[1], l); });
      const inTree = new Set(); par.forEach((l, t) => { inTree.add(t); inTree.add(l[0]); });
      const incMed = DY.distributions?.incubation?.ajustement?.mediane || 9;
      const ageIdx = a => a === null || a === undefined ? 5 : a <= 10 ? 0 : a <= 20 ? 1 : a <= 30 ? 2 : a <= 40 ? 3 : 4;
      const colorOf = c => S.recColor === "age" ? AGEC[ageIdx(c.age)] : S.recColor === "sexe" ? SEXC[Ch.sexKey(c.sexe)] : S.recColor === "cls" ? clsColor(c.cls) : (c.dc ? "#3288BD" : "#ABDDA4");
      const nodes = zc.filter(c => inTree.has(c.k)).map(c => { const l = par.get(c.k); const t = new Date(c.on + "T00:00:00Z").getTime() - (S.recX === "inf" ? incMed * 864e5 : 0);
        return { id: c.k, parent: l ? l[0] : null, support: l ? l[2] : 1, t, r: c.ri || 0, sex: c.sexe, color: colorOf(c),
          title: `<b>${esc(c.id)}</b> · ${esc(c.ini || "")}<div class="row"><span>${T("Début des symptômes")}</span><b>${dfmt(c.on)}${c.oi ? " (" + T("imputé") + ")" : ""}</b></div><div class="row"><span>${T("Sexe / âge")}</span><b>${esc(T(c.sexe || "—"))} · ${c.age ?? "—"} ${T("ans")}</b></div><div class="row"><span>${T("Aire de santé")}</span><b>${esc(c.as || "—")}</b></div><div class="row"><span>${T("Cas secondaires (R_i)")}</span><b>${nf(c.ri || 0)}</b></div>${l ? `<div class="row"><span>${T("Infecteur probable")}</span><b>${esc((caseBy.get(l[0]) || {}).id || l[0])}</b></div><div class="row"><span>${T("Support")}</span><b>${nf(l[2], 2)}${l[3] ? " · " + T("documenté") : ""}</b></div><div class="row"><span>${T("Intervalle sériel")}</span><b>${l[4]} ${T("j")}</b></div>` : `<div class="muted">${T("Racine (aucun infecteur retenu)")}</div>`}${c.dc ? `<div><b>${T("Décédé")}</b></div>` : ""}`, ref: c.k }; });
      Ch.ttree($("#c-ttree"), { nodes, sexIcons: S.recIcons, height: 480, maxHeight: 1600, rowH: S.recIcons ? 24 : 15,
        empty: T("Aucun lien au-dessus du seuil de support dans cette zone."), info: `${nf(nodes.length)} ${T("cas")} · ${nf(par.size)} ${T("liens")} · ${T("molette = zoom · glisser = déplacer")}`, onSelect: () => {} });
      const legC = S.recColor === "age" ? (DY.classes_age || []).map((a, i) => ({ t: a === "Inconnu" ? "Âge inconnu" : a + " ans", c: AGEC[i] })) : S.recColor === "sexe" ? ["M", "F", "I"].map(k => ({ t: SEXL[k], c: SEXC[k] })) : S.recColor === "cls" ? [{ t: "Confirmé", c: "--st-conf" }, { t: "Probable", c: "--s5" }] : [{ t: "Décédé", c: "#3288BD" }, { t: "Vivant / guéri / inconnu", c: "#ABDDA4" }];
      const sp = Ch.PAL[document.documentElement.dataset.theme === "dark" ? "supportDark" : "support"];
      $("#ttree-legend").innerHTML = `${legend(legC)}<div class="gradient-legend"><span>${T("Support du lien")}</span><span>0</span><div class="bar" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(sp).join(",")})"></div><span>1</span>${S.recIcons ? ["M", "F", "I"].map(k => `<span>${sexIco(k, 14)} ${T(SEXL[k])}</span>`).join("") : ""}<span class="muted">${T("Taille du nœud ∝ √R_i")}</span></div>`;
    }
    /* réseau epicontacts */
    if ($("#c-epinet")) {
      let L = ((D.chains || {}).liens || []).filter(l => { const a = caseBy.get(l.source), b = caseBy.get(l.target); return a && b && (inProv(a) || inProv(b)); });
      // taille des chaînes (composantes) : par défaut on n'affiche que les grappes de ≥ 3 cas
      const chainSize = {}; cases.forEach(x => { if (x.ch) chainSize[x.ch] = (chainSize[x.ch] || 0) + 1; });
      const minC = Number(S.epiMin);
      L = L.filter(l => { const c = (caseBy.get(l.source) || {}).ch; return !c || (chainSize[c] || 2) >= minC; });
      const ids = new Set(); L.forEach(l => { ids.add(l.source); ids.add(l.target); });
      const nodes = [...ids].map(k => { const c = caseBy.get(k); return { id: k, sex: c.sexe, color: clsColor(c.cls), ring: c.dc ? "--ink" : null, big: (c.ri || 0) >= 3,
        title: `<b>${esc(c.id)}</b> · ${esc(c.ini || "")}<div>${esc(T(c.cls))}${c.dc ? " · " + T("décédé") : ""}</div><div>${esc(T(c.sexe || ""))} · ${c.age ?? "—"} ${T("ans")}</div><div>${esc(c.zs || "")}</div>${c.ch ? `<div>${T("Chaîne")} ${c.ch}</div>` : ""}` }; });
      Ch.forceNet($("#c-epinet"), { nodes, links: L.map(l => ({ source: l.source, target: l.target, strong: String(l.type).includes("Contact") })), height: 560, uid: "epi",
        info: `${nf(nodes.length)} ${T("cas")} · ${nf(L.length)} ${T("liens")} · ${T("cliquer un cas pour ouvrir son parcours")}`, onSelect: n => go("journey", n.id), empty: T(isPublic ? "Graphe individuel non publié dans la version publique." : "Aucune donnée") });
    }
  }

  /* ================= ENFANTS (0–18 ANS) ================= */
  const KC = { c0_5: "#E8684F", c5_10: "#FDAE61", c10_18: "#3288BD", adulte: "#8a94a0" };
  function kidsView() {
    const E = D.enfants || {}, G = E.groupes || [];
    if (!G.length) return `<div class="empty">${T("Aucune donnée")}</div>`;
    const kids = G.filter(g => g.cle !== "adulte"), ad = G.find(g => g.cle === "adulte") || {};
    const nk = kids.reduce((s, g) => s + g.cas, 0), tot = G.reduce((s, g) => s + g.cas, 0);
    const card = g => { const r = (g.rt || {}).dernier_consolide, si = (g.intervalle_seriel || {}).ajustement, tr = g.cas_14j_prec ? 100 * (g.cas_14j - g.cas_14j_prec) / g.cas_14j_prec : null;
      return `<div class="kpi"><div class="label"><i class="dot" style="background:${KC[g.cle]}"></i>${T(g.groupe)}</div><div class="value">${nf(g.cas)}</div>
        <div class="note">${pc(g.pct_cas, 1)} ${T("des cas")} · ${nf(g.deces)} ${T("décès")} · ${T("létalité")} <b>${pc(g.letalite_pct, 1)}</b> ${ci(g.letalite_ic95[0], g.letalite_ic95[1], 1)}</div>
        <div class="statgrid" style="grid-template-columns:1fr 1fr">${stat("Rt consolidé", r ? fmtR(r.mediane) : "—", r ? `${ci(r.q025, r.q975)} · P(R>1) ${pc(100 * r.p_sup_1, 0)}` : T("effectif insuffisant"))}${stat("Intervalle sériel", si ? `${nf(si.moyenne, 1)} ± ${nf(si.ecart_type, 1)} ${T("j")}` : "—", `n = ${nf((g.intervalle_seriel || {}).n || 0)} ${T("paires")}`)}${stat("Cas 14 j", nf(g.cas_14j), tr === null ? "" : `${pctS(tr)} ${T("vs 14 j précédents")}`)}${stat("Connus comme contacts", pc(g.pct_connus_contacts, 1), `${T("source connue")} ${pc(g.pct_source_connue, 1)}`)}</div></div>`; };
    const rows = [
      ["Cas confirmés + probables", g => nf(g.cas)], ["Part de l’ensemble des cas", g => pc(g.pct_cas, 1)], ["dont confirmés", g => nf(g.confirmes)],
      ["Garçons / hommes", g => `${sexIco("M", 13)} ${nf(g.hommes)}`], ["Filles / femmes", g => `${sexIco("F", 13)} ${nf(g.femmes)}`],
      ["Âge médian (ans)", g => nf(g.age_median, 1)], ["Moins d’un an", g => nf(g.moins_1_an)], ["Décès", g => nf(g.deces)],
      ["Létalité (IC 95 %)", g => `${pc(g.letalite_pct, 1)} <span class="muted small">${ci(g.letalite_ic95[0], g.letalite_ic95[1], 1)}</span>`],
      ["Admis en CTE", g => pc(g.pct_admis, 1)], ["Délai DDS → notification (médiane, j)", g => nf(g.delai_dds_notification, 1)], ["Délai DDS → admission (médiane, j)", g => nf(g.delai_dds_admission, 1)],
      ["Connus comme contacts", g => pc(g.pct_connus_contacts, 1)], ["Source connue", g => pc(g.pct_source_connue, 1)], ["Vaccinés (déclaré)", g => nf(g.vaccines)],
      ["Cas sur 14 jours", g => nf(g.cas_14j)], ["Cas 14 jours précédents", g => nf(g.cas_14j_prec)],
      ["Zones les plus touchées", g => (g.zones || []).slice(0, 3).map(z => `${esc(z.zone_sante)} (${nf(z.cas)})`).join(", ")]];
    const M = E.matrice || [];
    const matrix = M.length ? `<div class="table-wrap"><table class="rsum"><thead><tr><th>${T("Cas source ↓ / cas secondaire →")}</th>${G.map(g => `<th>${T(g.groupe)}</th>`).join("")}<th>${T("Total")}</th></tr></thead><tbody>${M.map((row, i) => { const t = row.reduce((a, b) => a + b, 0), mx = Math.max(1, ...M.flat()); return `<tr><td><b>${T(G[i].groupe)}</b></td>${row.map(v => `<td style="background:rgba(198,83,83,${(.08 + .6 * v / mx).toFixed(2)})">${nf(v)} <span class="muted small">${t ? pc(100 * v / t, 0) : ""}</span></td>`).join("")}<td>${nf(t)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">${T("Aucune paire documentée")}</div>`;
    const kidsAsTarget = M.length ? [0, 1, 2].reduce((s, j) => s + M.reduce((a, row) => a + row[j], 0), 0) : 0;
    const fromAdults = M.length ? [0, 1, 2].reduce((s, j) => s + M[3][j], 0) : 0;
    const ctRows = G.map(g => ({ ...g.contacts, groupe: g.groupe, cle: g.cle }));
    return `
    <div class="notice"><b>${T("Analyses pédiatriques")}</b>, ${T("classes d’âge")} ${esc(E.bornes || "")}. ${E.age_douteux ? `<b>${nf(E.age_douteux)}</b> ${T("cas enregistrés « 0 an, 0 mois » (âge très probablement non saisi) sont exclus des classes d’âge ;")} ${nf(E.age_inconnu)} ${T("cas au total sans âge exploitable.")}` : ""} ${T("Cas confirmés et probables ; Rt calculé sur l’incidence de chaque classe (date de début des symptômes corrigée du retard de notification) avec l’intervalle sériel global ; intervalle sériel de chaque classe estimé sur les paires dont le cas secondaire appartient à la classe.")}</div>
    <div class="grid g4">${G.map(card).join("")}</div>
    ${interp("Synthèse", [
      `${T("Les enfants de moins de 18 ans représentent")} <b>${pc(100 * nk / Math.max(tot, 1), 1)}</b> ${T("des cas")} (${nf(nk)}).`,
      kids[0] ? `${T("Létalité chez les 0–5 ans")} : <b>${pc(kids[0].letalite_pct, 1)}</b> ${ci(kids[0].letalite_ic95[0], kids[0].letalite_ic95[1], 1)} ${T("contre")} ${pc(ad.letalite_pct, 1)} ${T("chez les adultes")}, ${kids[0].letalite_ic95[0] > (ad.letalite_ic95 || [0, 0])[1] ? T("surmortalité significative des jeunes enfants : prise en charge pédiatrique précoce et nutrition prioritaires.") : T("différence non significative.")}` : "",
      M.length ? `${T("Parmi les")} ${nf(kidsAsTarget)} ${T("enfants dont la source est documentée,")} ${nf(fromAdults)} (${pc(100 * fromAdults / Math.max(kidsAsTarget, 1), 0)}) ${T("ont été infectés par un adulte : la transmission aux enfants est surtout intrafamiliale (soins aux parents malades, allaitement).")}` : "",
      T("Rt et intervalle sériel par classe d’âge reposent sur des effectifs plus faibles : lire les intervalles de crédibilité avant de conclure.")])}
    <div class="grid g21">
      ${panel("Courbe épidémique hebdomadaire par classe d’âge", T("Cas confirmés et probables par semaine de notification (semaines complètes)"), `<div id="c-kids-epi"></div><div id="c-kids-pct" style="margin-top:8px"></div>`, { png: "enfants_courbe" })}
      ${panel("Pyramide des âges des enfants", T("Année d’âge révolue × sexe"), `<div id="kids-pyr">${kidsPyramid(E.pyramide || [])}</div>`)}
    </div>
    ${panel("Nombre de reproduction Rt par classe d’âge", T("EpiEstim, fenêtres de 7 jours ; bande = IC crédible 95 % ; ligne pointillée = R = 1 ; zone grisée = provisoire"), `<div class="grid g2" id="kids-rt">${G.map(g => `<div><h3 class="small" style="margin:0 0 4px"><i class="dot" style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${KC[g.cle]}"></i> ${T(g.groupe)}</h3><div id="c-krt-${g.cle}"></div></div>`).join("")}</div>`, { png: "enfants_rt" })}
    ${panel("Intervalle sériel par classe d’âge", T("Paires cas source → cas secondaire (le cas secondaire appartient à la classe) ; histogramme saumon et gamma discrétisée ajustée"), `<div class="grid g2">${G.map(g => `<div><h3 class="small" style="margin:0 0 4px">${T(g.groupe)}</h3><div id="c-ksi-${g.cle}"></div>${kidsSiSummary(g)}</div>`).join("")}</div>`, { png: "enfants_intervalle_seriel" })}
    <div>
      ${panel("Profil descriptif comparé", T("Cas confirmés et probables"), `<div class="table-wrap"><table class="rsum"><thead><tr><th>${T("Indicateur")}</th>${G.map(g => `<th>${T(g.groupe)}</th>`).join("")}</tr></thead><tbody>${rows.map(([lab, f]) => `<tr><td>${T(lab)}</td>${G.map(g => `<td>${f(g)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`)}
      ${panel("Qui infecte qui ? Matrice par classe d’âge", T("Paires documentées (contact suivi devenu cas, source déclarée) ; % = répartition des cas secondaires d’une même source"), matrix)}
    </div>
    ${panel("Contacts suivis par classe d’âge", T("Contacts listés (hors doublons)"), `<div class="table-wrap"><table class="rsum"><thead><tr><th>${T("Classe d’âge")}</th><th>${T("Contacts")}</th><th>${T("Devenus cas")}</th><th>${T("Taux")} (IC 95 %)</th><th>${T("Devenus suspects")}</th><th>${T("Actifs")}</th><th>${T("Perdus de vue >3 j")}</th><th>${T("Relations les plus fréquentes")}</th></tr></thead><tbody>${ctRows.map(r => `<tr><td><b>${T(r.groupe)}</b></td><td>${nf(r.n)}</td><td>${nf(r.devenus_cas)}</td><td>${pc(r.taux_pct, 2)} <span class="muted small">${ci(r.taux_ic95[0], r.taux_ic95[1], 2)}</span></td><td>${nf(r.devenus_suspects)}</td><td>${nf(r.actifs)}</td><td>${nf(r.perdus_de_vue)}</td><td class="small" style="text-align:left">${(r.relations || []).slice(0, 3).map(x => `${esc(T(String(x.relation).replace(/^\d\.\s*/, "")))} (${nf(x.n)})`).join(", ")}</td></tr>`).join("")}</tbody></table></div>`)}`;
  }
  function kidsPyramid(rows) {
    if (!rows.length) return `<div class="empty">${T("Aucune donnée")}</div>`;
    const mx = Math.max(1, ...rows.flatMap(r => [r.M, r.F]));
    return `<div style="display:grid;grid-template-columns:1fr 40px 1fr;gap:3px 6px;align-items:center;font-size:11.5px">
      <div class="muted" style="text-align:right">${T("Garçons")} ${sexIco("M", 16)}</div><div></div><div class="muted">${sexIco("F", 16)} ${T("Filles")}</div>
      ${[...rows].reverse().map(r => `<div style="display:flex;justify-content:flex-end;align-items:center;gap:5px"><span class="muted">${nf(r.M)}</span><i style="display:block;height:11px;border-radius:3px 0 0 3px;width:${100 * r.M / mx}%;background:${col("--sex-m")}"></i></div><div style="text-align:center;font-weight:600">${r.age}</div><div style="display:flex;align-items:center;gap:5px"><i style="display:block;height:11px;border-radius:0 3px 3px 0;width:${100 * r.F / mx}%;background:${col("--sex-f")}"></i><span class="muted">${nf(r.F)}</span></div>`).join("")}</div>`;
  }
  function kidsSiSummary(g) {
    const d = g.intervalle_seriel || {}, f = d.ajustement, r = d.resume;
    if (!r) return `<div class="small muted">${T("Données insuffisantes")} (n = ${nf(d.n || 0)})</div>`;
    return `<div class="small" style="margin-top:4px">n = <b>${nf(d.n)}</b> · ${T("médiane")} ${nf(r.mediane, 1)} ${T("j")} (IQR ${nf(r.q1, 0)}–${nf(r.q3, 0)})${f ? ` · ${T("gamma")} : <b>${nf(f.moyenne, 1)} ± ${nf(f.ecart_type, 1)} ${T("j")}</b> (IC 95 % ${T("de la moyenne")} ${nf(f.moyenne_ic95[0], 1)}–${nf(f.moyenne_ic95[1], 1)})` : ""}${d.n < 30 ? ` · <span style="color:${col("--critical")}">${T("effectif faible")}</span>` : ""}</div>`;
  }
  function kidsCharts() {
    const E = D.enfants || {}, G = E.groupes || [];
    const wk = E.hebdo || [];
    if ($("#c-kids-epi")) {
      Ch.xy($("#c-kids-epi"), { data: wk, x: "week", stacked: true, height: 250, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), series: (E.cles || []).map((k, i) => ({ key: k, label: T(E.labels[i]), color: KC[k] })) });
      Ch.xy($("#c-kids-pct"), { data: wk, x: "week", height: 150, percent: true, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), series: [{ key: "pct_enfants", label: T("Part des enfants (< 18 ans) parmi les cas"), color: "#E8684F", type: "area" }] });
    }
    G.forEach(g => {
      const box = $("#c-krt-" + g.cle); if (!box) return;
      if (!g.rt) { box.innerHTML = `<div class="empty">${T("Effectif insuffisant")}</div>`; return; }
      const R = g.rt.lignes.map(a => Object.fromEntries(g.rt.cols.map((c, i) => [c, a[i]]))).slice(-120);
      const prov = firstIdx(R, r => r.provisoire);
      Ch.xy(box, { data: R, x: "date", height: 190, digits: 2, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), shade: prov !== null ? { from: prov } : null, legend: false,
        bands: [{ lo: "q025", hi: "q975", color: KC[g.cle], opacity: .25, label: T("IC crédible 95 %") }], hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }],
        tipExtra: r => `<div class="row"><span>P(R > 1)</span><b>${pc(100 * r.p_sup_1, 0)}</b></div><div class="row"><span>${T("Cas dans la fenêtre")}</span><b>${nf(r.cas_fenetre, 0)}</b></div>`,
        series: [{ key: "mediane", label: T("Rt médian"), color: KC[g.cle], type: "line", markers: false, width: 2.2 }] });
    });
    G.forEach(g => distChart("#c-ksi-" + g.cle, g.intervalle_seriel));
  }

  /* ================= RISQUE DE RÉSURGENCE ================= */
  const RESC = { "Résurgence en cours": "#BD6F68", "Alerte de remontée": "#E0927C", "Transmission active (pas de baisse)": "#EEB98A", "En baisse, sous surveillance": "#EBDD92", "Sans cas récent": "#C9DDB0", "Éteinte (≥ 42 j sans cas)": "#A3C98F" };
  const spark = (vals, color) => { const mx = Math.max(1, ...vals), w = 4; return `<svg width="${vals.length * (w + 1)}" height="22" viewBox="0 0 ${vals.length * (w + 1)} 22" aria-hidden="true">${vals.map((v, i) => `<rect x="${i * (w + 1)}" y="${22 - 20 * v / mx}" width="${w}" height="${Math.max(.5, 20 * v / mx)}" fill="${color}"/>`).join("")}</svg>`; };
  function resurgenceView() {
    const R = D.resurgence || {}, Z = (R.zones || []).filter(inProv);
    const cats = Object.keys(RESC), cnt = c => Z.filter(z => z.categorie === c).length;
    if (!S.resZone || !Z.some(z => z.zone_sante === S.resZone)) S.resZone = (Z[0] || {}).zone_sante || "";
    const z = Z.find(x => x.zone_sante === S.resZone) || {};
    const ser = (R.series || {})[z.zone_sante];
    const top = Z.filter(x => /Résurgence|Alerte/.test(x.categorie));
    return `
    <div class="notice"><b>${T("Risque de flambée dans les zones où les cas avaient baissé")}</b>, ${esc(T(R.methode || ""))}</div>
    <div class="grid g5">${cats.filter(c => c !== "Sans cas récent").map(c => kpi(c, nf(cnt(c)), T(c === "Résurgence en cours" ? "Hausse nette après une baisse" : c === "Alerte de remontée" ? "Signal de reprise à confirmer" : c === "En baisse, sous surveillance" ? "Baisse confirmée, pas de signal" : c === "Éteinte (≥ 42 j sans cas)" ? "Aucun cas depuis 42 jours" : "Pas encore de baisse"), { color: RESC[c], cls: c === "Résurgence en cours" && cnt(c) ? "alert" : "" })).join("")}</div>
    <div class="grid g21">
      ${panel("Carte du risque de résurgence", T("Catégorie de chaque zone de santé (zones ayant au moins 10 cas)"), `<div id="c-resmap"></div>`, { png: "carte_resurgence" })}
      ${panel(`${esc(z.zone_sante || "—")}`, `${esc(T(z.categorie || ""))} · ${T("score")} ${nf(z.score, 0)}/100`, `<div id="c-reszone"></div>
        <div class="statgrid">${stat("Cas 7 derniers jours", nf(z.cas_7j), `${T("7 j précédents")} : ${nf(z.cas_7j_prec)}`)}${stat("P(hausse)", pc(100 * (z.p_hausse || 0), 0), T("7 j vs 7 j précédents"))}${stat("Rt (zone)", z.rt === null || z.rt === undefined ? "—" : fmtR(z.rt), z.rt_p_sup_1 === null || z.rt_p_sup_1 === undefined ? "" : `P(R>1) ${pc(100 * z.rt_p_sup_1, 0)}`)}${stat("Pic (7 j)", nf(z.pic_7j), dshort(z.date_pic))}${stat("Creux (7 j)", nf(z.creux_7j), dshort(z.date_creux))}${stat("Réintroduction", z.reintroduction ? T("Oui") : T("Non"), z.reintroduction ? `${nf(z.jours_sans_cas_avant_reprise)} ${T("j sans cas avant la reprise")}` : "")}${stat("Nouveaux cas sans lien", z.pct_nouveaux_non_lies === null || z.pct_nouveaux_non_lies === undefined ? "—" : pc(z.pct_nouveaux_non_lies, 0), T("14 derniers jours"))}${stat("Perdus de vue >3 j", nf(z.contacts_perdus_de_vue), `${nf(z.contacts_suspects_7j)} ${T("contacts devenus suspects (7 j)")}`)}</div>
        ${interp("Lecture", resText(z))}`, { tools: `<select data-state="resZone">${Z.map(x => `<option ${x.zone_sante === z.zone_sante ? "selected" : ""}>${esc(x.zone_sante)}</option>`).join("")}</select>`, png: "resurgence_" + (z.zone_sante || "") })}
    </div>
    ${panel("Zones classées par risque de résurgence", T("Courbe = cas notifiés par semaine (20 dernières semaines) ; score 0–100 : P(hausse) 30 %, P(Rt > 1) 20 %, réintroduction 15 %, nouveaux cas sans lien 15 %, contacts perdus de vue 10 %, contacts devenus suspects 10 % (× 0,6 si la zone n’a pas encore connu de baisse)"), table("res", Z, [
      { k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" },
      { k: "rang_res", t: "Rang (province)", num: true, v: x => nf(resRank(Z, x)), sortv: x => resRank(Z, x) },
      { k: "categorie", t: "Catégorie", v: x => `<span class="badge" style="background:${RESC[x.categorie]};color:#2b2b2b">${esc(T(x.categorie))}</span>`, csv: x => x.categorie },
      { k: "score", t: "Score /100", num: true, v: x => `<div class="flex" style="gap:6px;flex-wrap:nowrap"><div class="progress" style="flex:1;min-width:50px"><i style="width:${Math.min(100, x.score)}%;background:${x.score >= 60 ? TL[4] : x.score >= 40 ? TL[3] : x.score >= 20 ? TL[2] : TL[0]}"></i></div><span class="small">${nf(x.score, 0)}</span></div>`, sortv: x => x.score, csv: x => nf(x.score, 0) },
      { k: "serie", t: "20 semaines", v: x => spark(((R.series || {})[x.zone_sante] || {}).valeurs || [], RESC[x.categorie]), csv: x => (((R.series || {})[x.zone_sante] || {}).valeurs || []).join(" ") },
      { k: "cas_7j", t: "Cas 7 j", num: true }, { k: "cas_7j_prec", t: "7 j préc.", num: true }, { k: "p_hausse", t: "P(hausse)", num: true, v: x => pc(100 * x.p_hausse, 0) },
      { k: "rt", t: "Rt", num: true, d: 2 }, { k: "reintroduction", t: "Réintroduction", v: x => x.reintroduction ? badge("Oui", "b-crit") : "" },
      { k: "pct_nouveaux_non_lies", t: "% sans lien", num: true, d: 0 }, { k: "contacts_perdus_de_vue", t: "Perdus de vue", num: true }, { k: "jours_depuis_dernier_cas", t: "Jours sans cas", num: true }],
      { sort: "score", rowClick: true, rowKey: x => x.zone_sante, selected: x => x.zone_sante === S.resZone, maxh: 560 }), { csv: "res" })}
    ${panel("Rt hebdomadaire par zone de santé", T("Carte de chaleur : Rt consolidé en fin de semaine (EpiEstim) ; vert < 0,8 · jaune 0,8–1 · orange 1–1,2 · rouge 1,2–1,5 · rouge foncé > 1,5 ; vide = moins de 3 cas dans la fenêtre ou semaine pas encore consolidée"), `<div id="res-heat">${rtHeat(R.rt_heat || {})}</div>`)}
    ${top.length ? interp("Zones à signaler", top.slice(0, 8).map(x => `<b>${esc(x.zone_sante)}</b> (${esc(T(x.categorie))}) : ${resText(x)[0]}`)) : ""}`;
  }
  function resText(z) {
    if (!z || !z.zone_sante) return [];
    const out = [];
    if (z.baisse_observee) out.push(`${T("Pic de")} ${nf(z.pic_7j)} ${T("cas sur 7 jours le")} ${dshort(z.date_pic)}, ${T("creux de")} ${nf(z.creux_7j)} ${T("le")} ${dshort(z.date_creux)} ; ${T("maintenant")} ${nf(z.cas_7j)} ${T("cas sur 7 jours")} (${T("probabilité de hausse")} ${pc(100 * z.p_hausse, 0)}).`);
    else out.push(`${T("La zone n’a pas encore connu de baisse nette")} : ${nf(z.cas_7j)} ${T("cas sur 7 jours")} (${T("7 jours précédents")} : ${nf(z.cas_7j_prec)}).`);
    if (z.rt !== null && z.rt !== undefined) out.push(`Rt ${fmtR(z.rt)} (P(R > 1) = ${pc(100 * z.rt_p_sup_1, 0)}).`);
    if (z.reintroduction) out.push(`${T("Réintroduction")} : ${T("nouveaux cas après")} ${nf(z.jours_sans_cas_avant_reprise)} ${T("jours sans cas, rechercher l’origine (déplacement, chaîne non suivie).")}`);
    if (z.pct_nouveaux_non_lies !== null && z.pct_nouveaux_non_lies !== undefined && z.pct_nouveaux_non_lies > 50) out.push(`${pc(z.pct_nouveaux_non_lies, 0)} ${T("des nouveaux cas sans lien connu : transmission non détectée probable.")}`);
    if (z.contacts_perdus_de_vue > 0) out.push(`${nf(z.contacts_perdus_de_vue)} ${T("contacts perdus de vue (> 3 jours) à retrouver.")}`);
    return out;
  }
  function rtHeat(h) {
    const W = h.semaines || [], Z = (h.zones || []).filter(z => S.province === "Toutes" || zones().some(x => x.zone_sante === z.zone_sante));
    if (!Z.length) return `<div class="empty">${T("Aucune donnée")}</div>`;
    const c = v => v === null || v === undefined ? "transparent" : v < .8 ? TL[0] : v < 1 ? TL[1] : v < 1.2 ? TL[2] : v < 1.5 ? TL[3] : TL[4];
    const tc = v => v === null || v === undefined ? "" : "#2b2b2b";
    return `<div class="table-wrap"><table class="rsum" style="font-size:11.5px"><thead><tr><th>${T("Zone de santé")}</th>${W.map(w => `<th>${dshort(w)}</th>`).join("")}</tr></thead><tbody>${Z.map(z => `<tr><td>${esc(z.zone_sante)} <span class="muted small">(${nf(z.cas)})</span></td>${z.valeurs.map(v => `<td style="background:${c(v)};color:${tc(v)};text-align:center">${v === null || v === undefined ? "" : nf(v, 2)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function resurgenceCharts() {
    const R = D.resurgence || {}, Z = (R.zones || []);
    const byZ = new Map(Z.map(z => [String(z.zone_sante).toUpperCase(), z]));
    const feats = (D.map_zones || []).filter(f => S.province === "Toutes" || norm(f.province) === norm(S.province));
    if ($("#c-resmap")) Ch.choropleth($("#c-resmap"), { features: feats, focus: "1", focusIf: f => byZ.has(String(f.data_zone).toUpperCase()), value: f => (byZ.get(String(f.data_zone).toUpperCase()) || {}).score ?? null, selected: S.resZone, digits: 0,
      colorFn: (v, f) => { const z = byZ.get(String(f.data_zone).toUpperCase()); return z ? RESC[z.categorie] : col("--seq-0"); }, labelIf: f => !!byZ.get(String(f.data_zone).toUpperCase()),
      legendHTML: Object.entries(RESC).map(([k, c]) => `<span class="flex" style="gap:4px"><i style="display:inline-block;width:14px;height:10px;border-radius:2px;background:${c}"></i>${T(k)}</span>`).join(""),
      tip: f => { const z = byZ.get(String(f.data_zone).toUpperCase()); return z ? `<b>${esc(z.zone_sante)}</b><div>${esc(T(z.categorie))}</div><div class="row"><span>${T("Score")}</span><b>${nf(z.score, 0)}</b></div><div class="row"><span>${T("Cas 7 j / 7 j préc.")}</span><b>${nf(z.cas_7j)} / ${nf(z.cas_7j_prec)}</b></div>` : `<b>${esc(f.data_zone)}</b><div>${T("moins de 10 cas")}</div>`; },
      onClick: f => { if (byZ.has(String(f.data_zone).toUpperCase())) { S.resZone = byZ.get(String(f.data_zone).toUpperCase()).zone_sante; render(); } } });
    const z = Z.find(x => x.zone_sante === S.resZone), ser = z && (R.series || {})[z.zone_sante];
    if (ser && $("#c-reszone")) {
      const rows = ser.valeurs.map((v, i) => ({ week: addDays(ser.debut, 7 * i), n: v }));
      Ch.xy($("#c-reszone"), { data: rows, x: "week", height: 210, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), series: [{ key: "n", label: T("Cas notifiés par semaine"), color: RESC[z.categorie] }], legend: false,
        vlines: [{ x: rows.reduce((b, r) => r.week <= z.date_pic ? r.week : b, rows[0].week), color: "--ink-2", label: T("pic") }, ...(z.date_creux ? [{ x: rows.reduce((b, r) => r.week <= z.date_creux ? r.week : b, rows[0].week), color: "--good", label: T("creux"), dy: 14 }] : [])] });
    }
  }

  /* ================= INDICATEURS HEBDOMADAIRES DE LA RIPOSTE ================= */
  function perfPanel() {
    const P = D.performance || {}; const keys = Object.keys(P).filter(k => !k.startsWith("_"));
    if (!keys.length) return "";
    if (!keys.includes(S.perfG)) S.perfG = S.province !== "Toutes" && keys.includes(S.province) ? S.province : "National";
    return panel("Indicateurs hebdomadaires de la riposte", T("Semaines complètes de notification ; chaque courbe a sa propre échelle"), `
      <div class="grid g2" style="margin-bottom:0">
        <div><h3 class="small" style="margin:0 0 4px">${T("Cas et décès cumulés")}</h3><div id="c-pf-cum"></div></div>
        <div><h3 class="small" style="margin:0 0 4px">${T("Létalité hebdomadaire (décès / confirmés notifiés)")}</h3><div id="c-pf-cfr"></div></div>
        <div><h3 class="small" style="margin:0 0 4px">${T("Lien des nouveaux cas avec le suivi des contacts (%)")}</h3><div id="c-pf-link"></div></div>
        <div><h3 class="small" style="margin:0 0 4px">${T("Délais (médiane, jours) et contacts listés par cas")}</h3><div id="c-pf-del"></div></div>
      </div>`, { png: "indicateurs_hebdo", tools: `<select data-state="perfG">${keys.map(k => `<option ${S.perfG === k ? "selected" : ""}>${esc(T(k))}</option>`).join("")}</select>` });
  }
  function perfCharts() {
    const rows = (D.performance || {})[S.perfG]; if (!rows || !$("#c-pf-cum")) return;
    const xl = (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v);
    Ch.xy($("#c-pf-cum"), { data: rows, x: "week", height: 200, xLabel: xl, series: [{ key: "cumul_confirmes", label: T("Confirmés cumulés"), color: "--s2", type: "area", markers: false }, { key: "cumul_deces", label: T("Décès cumulés"), color: "--critical", type: "line", markers: false }] });
    Ch.xy($("#c-pf-cfr"), { data: rows, x: "week", height: 200, percent: true, xLabel: xl, digits: 1, series: [{ key: "letalite_pct", label: T("Létalité hebdomadaire"), color: "--critical", type: "line" }] });
    Ch.xy($("#c-pf-link"), { data: rows, x: "week", height: 200, percent: true, xLabel: xl, digits: 1, series: [{ key: "pct_source_connue", label: T("Source connue"), color: "--s3", type: "line" }, { key: "pct_connus_contacts", label: T("Connus comme contacts"), color: "--good", type: "line" }, { key: "pct_avec_contacts_listes", label: T("Avec contacts listés"), color: "--s1", type: "line" }] });
    Ch.xy($("#c-pf-del"), { data: rows, x: "week", height: 200, xLabel: xl, digits: 1, series: [{ key: "delai_dds_notification", label: T("DDS → notification"), color: "--s1", type: "line" }, { key: "delai_dds_isolement", label: T("DDS → isolement"), color: "--s7", type: "line" }, { key: "contacts_par_cas", label: T("Contacts listés par cas"), color: "--s4", type: "line", dash: "4 3" }] });
  }

  /* ================= SUPER-PROPAGATION ET LIEUX DE TRANSMISSION ================= */
  const SETC = { "Famille": "#7FA7A8", "Voisinage / social": "#9C7A4E", "Soins (structure de santé)": "#C98BA0", "Travail": "#A88BBF", "Funérailles": "#6E8F68", "Non précisé": "#B7B2A8" };
  const HUBL = { "Foyer": ["M", "Ménage / foyer"], "Hôpital": ["H", "Structure de santé"], "Lieu du travail": ["T", "Lieu de travail"], "Funérailles": ["F", "Funérailles"] };
  const circKey = c => { const s = String(c || "").replace(/^\d\.\s*/, "").trim(); return s || "Non précisé"; };
  const FAM = ["Fratrie", "Enfant", "Parent", "Epoux/ Épouse", "Époux/Épouse", "Epoux/Epouse"];
  function transCat(x) {
    const c = circKey(x.circ);
    if (c === "Hôpital") return "Soins (structure de santé)";
    if (c === "Lieu du travail") return "Travail";
    if (c === "Funérailles") return "Funérailles";
    if (FAM.includes(x.rel)) return "Famille";
    if (x.rel === "Voisinage") return "Voisinage / social";
    return "Non précisé";
  }
  function ssData() { const sp = D.superpropagation || {}; const keys = Object.keys(sp.jeux || {}); if (!keys.includes(S.ssSet)) S.ssSet = sp.reference || keys[0]; return { sp, set: (sp.jeux || {})[S.ssSet] }; }
  function superView() {
    const { sp, set } = ssData();
    if (!set) return `<div class="empty">${T("Données insuffisantes")}</div>`;
    const nb = set.nb, tr = sp.tracage || {}, pe = sp.p_epidemie || {};
    const kTxt = nb.k < .1 ? T("hétérogénéité extrême (super-propagation très marquée)") : nb.k < 1 ? T("transmission hétérogène : une minorité de cas génère la majorité des cas secondaires") : T("transmission relativement homogène");
    const setNames = { index: "Cas index suivis", tous: "Tous les cas (liens documentés)", chaines: "Cas des chaînes documentées" };
    return `
    <div class="notice"><b>${T("Super-propagation")}</b>, ${T("le nombre de cas secondaires par cas (distribution de descendance) est ajusté par une loi binomiale négative de moyenne R et de dispersion k (fitdistrplus / superspreading, Epiverse-TRACE). Plus k est petit, plus la transmission est concentrée sur quelques cas : c’est ce qui rend le traçage rétrograde (vers la source) particulièrement rentable.")}</div>
    <div class="flex" style="margin-bottom:12px"><span class="small muted">${T("Jeu de données")}</span>${segBtns("ssSet", Object.keys(sp.jeux || {}).map(k => [k, setNames[k] || k]))}<span class="small muted">${esc(T(set.nom))} · n = ${nf(set.n)} ${T("cas")} · ${nf(set.total_secondaires)} ${T("cas secondaires")}</span></div>
    <div class="grid g5">
      ${kpi("Dispersion k", nf(nb.k, 2), nb.k_ic95 ? `IC 95 % ${nf(nb.k_ic95[0], 2)}, ${nf(nb.k_ic95[1], 2)}` : "", { color: "--rc-purple", cls: nb.k < 1 ? "alert" : "" })}
      ${kpi("Cas secondaires par cas (R)", nf(nb.R, 2), nb.R_ic95 ? `IC 95 % ${nf(nb.R_ic95[0], 2)}, ${nf(nb.R_ic95[1], 2)} · ${pc(set.zeros_pct, 0)} ${T("sans cas secondaire")}` : "", { color: "--rc-rt" })}
      ${kpi("Cas responsables de 80 % de la transmission", pc(set.pct_cas_80, 1), `${T("observé")} : ${pc(set.pct_cas_80_empirique, 1)} · ${T("les 20 % les plus infectieux")} → ${pc(set.part_top20, 0)}`, { color: "--s2" })}
      ${kpi("Événements de super-propagation", nf(set.n_sse), `${T("cas ayant infecté plus de")} ${nf(set.seuil_sse)} ${T("personnes (99e percentile de Poisson)")} · ${pc(set.transmission_sse_pct, 0)} ${T("de la transmission")}`, { color: "--critical" })}
      ${kpi("Gain du traçage rétrograde", "× " + nf(set.gain_retrograde, 1), `${T("cas « frères » attendus par source retrouvée")} : ${nf(set.retrograde_freres, 2)} ${T("contre")} ${nf(nb.R, 2)} ${T("en prospectif")}`, { color: "--s1" })}
    </div>
    ${interp("Interprétation (lecture d’épidémiologiste)", [
      `k = <b>${nf(nb.k, 2)}</b> ${nb.k_ic95 ? ci(nb.k_ic95[0], nb.k_ic95[1]) : ""} : ${kTxt}.`,
      `${T("La binomiale négative est le meilleur modèle")} (ΔAIC ${T("Poisson")} = ${nf((set.modeles.find(m => m.modele === "Poisson") || {}).delta_AIC, 1)}) : ${T("la variance")} (${nf(set.variance, 2)}) ${T("dépasse largement la moyenne")} (${nf(set.moyenne, 2)}), ${T("surdispersion")}.`,
      `${pc(set.pct_cas_80, 1)} ${T("des cas expliquent 80 % de la transmission (règle 20/80 de Woolhouse : la proportion est d’autant plus faible que k est petit).")}`,
      S.ssSet === "tous" ? T("Attention : sur « tous les cas », la grande majorité des cas n’a aucun lien documenté ; les zéros sont gonflés par le sous-enregistrement des liens, ce qui exagère l’hétérogénéité. Le jeu « cas index suivis » (dénominateur complet, suivi clos) est la référence.") : S.ssSet === "chaines" ? T("Sur les seuls cas des chaînes documentées, les cas sans descendance sont sous-représentés : k est surestimé (hétérogénéité sous-estimée). À lire comme une borne.") : T("Jeu de référence : cas index dont tous les contacts ont terminé leur suivi ; le nombre de contacts devenus cas mesure directement la descendance observée par le traçage."),
      T("Conséquence opérationnelle : quand k < 1, chercher en priorité la SOURCE et l’ÉVÉNEMENT (funérailles, soins à domicile, structure de santé) de chaque nouveau cas, puis lister tous les participants : c’est là que se trouvent les grappes.")])}
    <div class="grid g2">
      ${panel("Distribution du nombre de cas secondaires", T("Histogramme observé (saumon), binomiale négative ajustée (violet) et Poisson de même moyenne (gris), epicontacts::get_degree + fitdistrplus::fitdist"), `<div id="c-ss-off"></div><div class="table-wrap" style="margin-top:8px"><table class="rsum"><thead><tr><th>${T("Modèle")}</th><th>${T("Paramètres")}</th><th>log-L</th><th>AIC</th><th>BIC</th><th>ΔAIC</th><th>${T("Poids AIC")}</th></tr></thead><tbody>${set.modeles.map(m => `<tr><td>${m.delta_AIC === 0 ? "<b>" + T(m.modele) + "</b>" : T(m.modele)}</td><td>${m.parametres}</td><td>${nf(m.loglik, 1)}</td><td>${nf(m.AIC, 1)}</td><td>${nf(m.BIC, 1)}</td><td>${nf(m.delta_AIC, 1)}</td><td>${pc(100 * m.poids_AIC, 1)}</td></tr>`).join("")}</tbody></table></div>`, { png: "distribution_descendance" })}
      ${panel("Concentration de la transmission", T("Part cumulée de la transmission (y) due à la part x des cas les plus infectieux ; diagonale = transmission homogène ; courbes de référence (Ebola, SARS)"), `<div id="c-ss-lor"></div>`, { png: "concentration_transmission" })}
    </div>
    <div class="grid g2">
      ${panel("Probabilité d’appartenir à une grappe", T("superspreading::proportion_cluster_size, probabilité qu’un cas détecté appartienne à une grappe (cas secondaires d’une même source) d’au moins c cas"), `<div id="c-ss-cl"></div>${interp("Lecture", [`${T("Un nouveau cas a")} <b>${pc(100 * (set.grappes["5"] || 0), 1)}</b> ${T("de probabilité (modèle) de provenir d’une grappe d’au moins 5 cas")} (${T("observé")} : ${pc(100 * (set.grappes_empiriques["5"] || 0), 1)}) ${T("et")} ${pc(100 * (set.grappes["2"] || 0), 0)} ${T("d’une grappe d’au moins 2 cas : remonter à la source permet de découvrir les autres cas de la grappe.")}`])}`, { png: "probabilite_grappes" })}
      ${panel("Probabilité qu’une introduction déclenche une épidémie", T("Processus de branchement à descendance binomiale négative : 1 − q, avec q = (1 + R(1 − q)/k)^−k"), `<div class="table-wrap"><table class="rsum"><thead><tr><th>R</th><th>k ${T("local")} (${nf(nb.k, 2)})</th><th>k = 5,1 (${T("Ebola, homogène")})</th></tr></thead><tbody>${(pe.scenarios || []).map(r => `<tr><td>${nf(r.R, 1)}</td><td>${pc(100 * r.p_k_local, 1)}</td><td>${pc(100 * r.p_k_homogene, 1)}</td></tr>`).join("")}</tbody></table></div>${interp("Lecture", [pe.R_actuel ? `${T("Avec le Rt actuel")} (${fmtR(pe.R_actuel)}), ${pe.R_actuel < 1 ? T("une nouvelle introduction s’éteint presque toujours.") : `${T("probabilité d’épidémie")} : ${pc(100 * pe.p_actuel, 1)}.`}` : "", T("Plus k est petit, plus une introduction a de chances de s’éteindre seule, mais quand elle ne s’éteint pas, elle démarre souvent par une flambée explosive (super-propagation). La surveillance doit donc détecter très tôt les événements à risque.")])}`)}
    </div>
    ${panel("Contrôler la super-propagation par le traçage des contacts", T("Traçage prospectif (vers les contacts du cas) et rétrograde (vers la source et ses autres contacts) : Endo et al. 2020 ; Raymenants et al. 2022"), `<div id="c-ss-trace"></div>
      <div class="grid g4" style="margin-top:10px">${kpi("Traçage prospectif réussi", pc(tr.prospectif_pct, 1), `${nf(tr.prospectif)} / ${nf(tr.cas)} ${T("confirmés (28 j) déjà listés comme contacts")}`, { color: "#7E9BD1" })}${kpi("Traçage rétrograde réussi", pc(tr.retrograde_pct, 1), `${nf(tr.retrograde)} ${T("confirmés avec une source identifiée")}`, { color: "#B98D6B" })}${kpi("Cas avec contacts listés", pc(tr.avec_contacts_listes_pct, 1), `${nf(tr.avec_contacts_listes)} ${T("confirmés (28 j) ayant au moins un contact listé")}`)}${kpi("Aucun lien", pc(tr.aucun_pct, 1), `${nf(tr.aucun)} ${T("confirmés (28 j) ni connus comme contacts, ni reliés à une source")}`, { cls: tr.aucun_pct > 50 ? "alert" : "", color: "#D08B5B" })}</div>
      ${interp("Interprétation (expertise épidémiologique)", [
        `${T("Avec k =")} ${nf(nb.k, 2)}, ${T("la source d’un cas a en moyenne")} <b>${nf(set.retrograde_freres, 2)}</b> ${T("autres cas secondaires (R(1 + 1/k)), contre")} ${nf(nb.R, 2)} ${T("cas secondaires attendus pour un cas pris au hasard : retrouver la source rapporte environ")} <b>${nf(set.gain_retrograde, 1)} ${T("fois")}</b> ${T("plus de cas que le seul traçage prospectif.")}`,
        `${T("Sur les 28 derniers jours, seuls")} ${pc(tr.prospectif_pct, 1)} ${T("des nouveaux confirmés étaient connus comme contacts (traçage prospectif) et")} ${pc(tr.retrograde_pct, 1)} ${T("ont une source identifiée (traçage rétrograde) : la grande majorité des chaînes échappe au traçage.")}`,
        T("Recommandations : (1) pour chaque nouveau cas, investigation rétrograde sur 21 jours avant le début des symptômes (funérailles, soins à un malade, visites en structure de santé, tradipraticiens) ; (2) listage exhaustif de tous les participants aux événements identifiés ; (3) priorité de suivi aux contacts des événements de super-propagation ; (4) suivi quotidien de l’indicateur « % de nouveaux cas connus comme contacts » (objectif > 80 %)."),
        T("Limites : les liens sont incomplets (sous-détection des sources) et la descendance d’un cas peut être répartie entre plusieurs listes ; k et R observés décrivent la transmission documentée, pas la transmission totale.")])}`, { png: "tracage_prospectif_retrograde" })}
    <div class="grid g21">
      ${panel("Taux d’attaque secondaire par lieu d’exposition", T("Contacts listés devenus cas ; IC de Wilson à 95 % ; test du χ² d’homogénéité"), `${sarTable(sp.lieux?.circonstance)}`)}
      ${panel("Par type de contact et par relation", "", `${sarTable(sp.lieux?.type_contact)}<div style="height:10px"></div>${sarTable(sp.lieux?.relation)}`)}
    </div>
    ${isPublic && !pubParcours ? "" : panel("Graphe des lieux potentiels de transmission", T("Chaque grappe = un cas index (rond rose = source avec source connue, blanc = source non identifiée) relié au lieu d’exposition (M = ménage/foyer, H = structure de santé, T = travail, F = funérailles), puis à ses contacts ; couleur = type de transmission ; anneau rouge = contact devenu cas ; carré plein = suivi de 21 jours terminé (quarantaine menée à terme), carré pointillé = suivi en cours, sans carré = perdu de vue ou suivi incomplet"),
      `<div class="flex" style="margin-bottom:8px">
        <label class="field">${T("Lieu")}<select data-state="ssPlace">${["Tous", "Funérailles", "Hôpital", "Lieu du travail", "Foyer"].map(v => `<option value="${v}" ${S.ssPlace === v ? "selected" : ""}>${T(v === "Tous" ? "Tous les lieux" : HUBL[v][1])}</option>`).join("")}</select></label>
        <label class="field">${T("Taille minimale de la grappe")}<select data-state="ssMin">${["2", "5", "10", "20"].map(v => `<option value="${v}" ${S.ssMin === v ? "selected" : ""}>≥ ${v} ${T("contacts")}</option>`).join("")}</select></label>
        <label class="small flex" style="gap:4px"><input type="checkbox" data-check="ssCases" ${S.ssCases ? "checked" : ""}>${T("Grappes avec au moins un contact devenu cas")}</label>
      </div><div id="c-ss-net"></div><div class="legend">${Object.entries(SETC).map(([k, c]) => `<span><i class="round" style="background:${c}"></i>${T(k)}</span>`).join("")}<span><i class="round" style="background:#E8A598"></i>${T("Source avec source connue")}</span><span><i class="round" style="background:#F4F2EC;border:1px solid #999"></i>${T("Source non identifiée")}</span><span><i style="background:transparent;border:2px solid ${col("--st-conf")};border-radius:50%"></i>${T("Devenu cas")}</span><span><i style="background:transparent;border:1.5px solid ${col("--ink-2")}"></i>${T("Suivi 21 j terminé")}</span><span><i style="background:transparent;border:1.5px dashed ${col("--ink-2")}"></i>${T("Suivi en cours")}</span></div>`, { png: "lieux_transmission" })}`;
  }
  function sarTable(t) {
    if (!t) return "";
    const mx = Math.max(1, ...t.lignes.map(r => r.ic95[1] || 0));
    return `<h3 class="small" style="margin:0 0 6px">${T(t.label)}${t.test ? ` <span class="muted">(χ² = ${nf(t.test.chi2, 1)}, p ${t.test.p < .001 ? "< 0,001" : "= " + nf(t.test.p, 3)})</span>` : ""}</h3>
      <div class="table-wrap"><table class="rsum"><thead><tr><th>${T("Catégorie")}</th><th>${T("Contacts")}</th><th>${T("Devenus cas")}</th><th style="min-width:180px">${T("Taux d’attaque secondaire (IC 95 %)")}</th><th>${T("Suspects")}</th><th>${T("Perdus de vue")}</th></tr></thead><tbody>${t.lignes.map(r => `<tr><td>${esc(T(r.valeur))}</td><td>${nf(r.contacts)}</td><td>${nf(r.devenus_cas)}</td><td><div style="position:relative;height:14px;background:${col("--surface-3")};border-radius:3px"><i style="position:absolute;left:${100 * r.ic95[0] / mx}%;width:${Math.max(.5, 100 * (r.ic95[1] - r.ic95[0]) / mx)}%;top:5px;height:4px;background:${col("--rc-purple")};opacity:.45"></i><i style="position:absolute;left:calc(${100 * (r.taux_pct || 0) / mx}% - 4px);top:3px;width:8px;height:8px;border-radius:50%;background:${col("--rc-purple")}"></i></div><span class="small">${pc(r.taux_pct, 2)} ${ci(r.ic95[0], r.ic95[1], 2)}</span></td><td>${nf(r.devenus_suspects)}</td><td>${nf(r.perdus_de_vue)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function superCharts() {
    const { sp, set } = ssData(); if (!set) return;
    const n = set.n || 1;
    const off = set.histogramme.map((v, i) => ({ k: i, p: v / n, nb: set.pmf_nb[i], po: set.pmf_poisson[i] }));
    Ch.xy($("#c-ss-off"), { data: off, x: "k", height: 240, barWidth: .9, barStroke: "--surface", digits: 4, yFmt: v => nf(v, 2), xLabel: (v, r, tip) => tip ? `${v} ${T("cas secondaires")}, ${nf(set.histogramme[v])} ${T("cas")}` : v, xLabelWidth: 22,
      vlines: [{ i: Math.min(set.seuil_sse + 1, off.length - 1), edge: true, color: "--critical", label: `${T("seuil SSE")} > ${set.seuil_sse}` }],
      series: [{ key: "p", label: T("Proportion observée"), color: "--rc-salmon" }, { key: "nb", label: T("Binomiale négative"), color: "--rc-purple", type: "line", dash: "5 4", markers: true, r: 2.6 }, { key: "po", label: T("Poisson (même moyenne)"), color: "--ink-2", type: "line", dash: "2 3", markers: false }] });
    const L = set.lorenz.map((a, i) => ({ x: Math.round(100 * a[0]) + " %", nb: 100 * a[1], emp: set.lorenz_empirique[i] ? 100 * set.lorenz_empirique[i][1] : null, homo: 100 * a[0],
      ebo: sp.references?.[1]?.lorenz?.[i] ? 100 * sp.references[1].lorenz[i][1] : null, sars: sp.references?.[2]?.lorenz?.[i] ? 100 * sp.references[2].lorenz[i][1] : null }));
    Ch.xy($("#c-ss-lor"), { data: L, x: "x", height: 280, percent: true, digits: 1, xLabel: (v, r, tip) => tip ? `${T("les")} ${v} ${T("cas les plus infectieux")}` : v, xLabelWidth: 40,
      vlines: [{ i: 8, color: "--muted", label: "20 %" }], hlines: [{ y: 80, color: "--muted", label: "80 %" }],
      series: [{ key: "nb", label: `${T("Binomiale négative")} (k = ${nf(set.nb.k, 2)})`, color: "--rc-purple", type: "line", markers: false, width: 2.6 }, { key: "emp", label: T("Observé"), color: "--rc-salmon", type: "line", markers: false },
        { key: "sars", label: "SARS-1 (k = 0,16)", color: "--critical", type: "line", dash: "4 3", markers: false, width: 1.4 }, { key: "ebo", label: "Ebola (k = 5,1)", color: "--s3", type: "line", dash: "4 3", markers: false, width: 1.4 },
        { key: "homo", label: T("Transmission homogène"), color: "--line-2", type: "line", dash: "2 3", markers: false, width: 1 }] });
    const cl = ["2", "5", "10", "25"].map(c => ({ c: "≥ " + c, nb: 100 * (set.grappes[c] || 0), emp: 100 * (set.grappes_empiriques[c] || 0) }));
    Ch.xy($("#c-ss-cl"), { data: cl, x: "c", height: 220, percent: true, digits: 1, xLabel: (v, r, tip) => tip ? `${T("grappe")} ${v} ${T("cas")}` : v, series: [{ key: "nb", label: T("Modèle (binomiale négative)"), color: "--rc-purple" }, { key: "emp", label: T("Observé"), color: "--rc-salmon" }] });
    const tr = sp.tracage || {};
    Ch.tracingDiagram($("#c-ss-trace"), { tFwd: T("Traçage prospectif seul"), tBack: T("Traçage prospectif et rétrograde"),
      nFwd: `${T("Observé")} : ${pc(tr.prospectif_pct, 1)} ${T("des nouveaux cas déjà listés comme contacts")}`, nBack: `${T("Observé")} : ${pc(tr.retrograde_pct, 1)} ${T("avec source retrouvée")} · ${T("gain attendu")} × ${nf(set.gain_retrograde, 1)}`,
      lT: T("Transmission"), lOk: T("Traçage réussi"), lKo: T("Traçage échoué"), lCase: T("Cas non détecté"), lIdx: T("Cas index du traçage"), lQ: T("Cas mis en quarantaine / suivi") });
    if ($("#c-ss-net")) {
      const minN = Number(S.ssMin), groups = new Map();
      contacts.forEach(x => { if (x.st === "Doublon" || !inProv(x)) return; const c = circKey(x.circ); if (S.ssPlace !== "Tous" && c !== S.ssPlace) return; if (!HUBL[c]) return; const key = x.ix + "§" + c; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(x); });
      let cls = [...groups.entries()].map(([key, xs]) => { const [ix, c] = key.split("§"); return { ix, c, xs, cases: xs.filter(x => x.st === "Devenu confirmé").length }; })
        .filter(g => g.xs.length >= minN && (!S.ssCases || g.cases > 0)).sort((a, b) => b.cases - a.cases || b.xs.length - a.xs.length).slice(0, 30);
      const clusters = cls.map(g => { const ic = caseBy.get(g.ix) || {}; const hasSrc = (ic.src || []).length > 0;
        return { id: g.ix + g.c, hub: { letter: HUBL[g.c][0], title: `<b>${T(HUBL[g.c][1])}</b><div>${nf(g.xs.length)} ${T("contacts exposés")} · ${nf(g.cases)} ${T("devenus cas")}</div>` },
          source: { label: ic.ini || "", color: hasSrc ? "#E8A598" : "#F4F2EC", title: `<b>${esc(ic.id || g.ix)}</b> ${esc(ic.ini || "")}<div>${esc(T(ic.cls || ""))} · ${esc(ic.zs || "")}</div><div>${hasSrc ? T("source connue") : T("source non identifiée")}</div>`, k: g.ix },
          caption: `${esc((ic.id || g.ix).slice(-12))} · ${nf(g.xs.length)}`,
          nodes: g.xs.map(x => ({ color: SETC[transCat(x)], caseRing: x.st === "Devenu confirmé", frame: x.st === "Suivi terminé (21 j)" ? "solid" : ["Vu ≤24 h", "Vu 1–3 j"].includes(x.st) ? "dashed" : null, k: x.k,
            title: `<b>${esc(x.id)}</b> · ${esc(x.ini)}<div>${esc(T(transCat(x)))} · ${esc(T(String(x.rel || "—")))}</div><div>${esc(T(String(x.type || "").replace(/^\d\.\s*/, "")))}</div><div>${T("Statut")} : <b>${esc(T(x.st))}</b></div>` })) }; });
      Ch.settingNet($("#c-ss-net"), { clusters, height: 420, maxHeight: 2000, empty: T("Aucune grappe ne correspond aux filtres."), info: `${nf(clusters.length)} ${T("grappes")} · ${nf(clusters.reduce((s, c) => s + c.nodes.length, 0))} ${T("contacts")} · ${T("cliquer la source pour ouvrir son parcours")}`, onSource: c => go("journey", c.source.k) });
    }
  }

  /* ================= LABORATOIRES ================= */
  function labsView() {
    const labs = D.labs || [];
    const tot = labs.reduce((s, x) => s + x.tests_valides, 0), pos = labs.reduce((s, x) => s + x.positifs, 0);
    return `
    <div class="grid g4">${kpi("Échantillons analysés", nf(tot), T("Résultat positif ou négatif"))}${kpi("Positifs", nf(pos), "", { color: "--s2" })}${kpi("Positivité globale", pc(tot ? 100 * pos / tot : null), T("Positifs / analysés"))}${kpi("Laboratoires", nf(labs.length), "")}</div>
    <div class="grid g2">
      ${panel("Échantillons analysés par semaine", T("Positifs et négatifs (barres empilées)"), `<div id="c-lab1"></div>`, { png: "labo_volumes", tools: `<select data-state="lab"><option value="Tous">${T("Tous les laboratoires")}</option>${labs.map(l => `<option ${S.lab === l.laboratoire ? "selected" : ""}>${esc(l.laboratoire)}</option>`).join("")}</select>` })}
      ${panel("Taux de positivité hebdomadaire", T("Positifs / échantillons analysés"), `<div id="c-lab2"></div>`, { png: "labo_positivite" })}
    </div>
    ${panel("Comparaison des laboratoires", T("Intervalle de confiance de Wilson à 95 %"), table("labs", labs, [{ k: "laboratoire", t: "Laboratoire" }, { k: "tests_valides", t: "Analysés", num: true }, { k: "positifs", t: "Positifs", num: true }, { k: "negatifs", t: "Négatifs", num: true }, { k: "taux_positivite_pct", t: "Positivité %", num: true, d: 1 }, { k: "ic", t: "IC 95 %", v: x => `${nf(x.ic95_inf_pct, 1)}, ${nf(x.ic95_sup_pct, 1)}` }], { sort: "tests_valides" }), { csv: "labs" })}`;
  }
  function labWeekly() {
    if (S.lab === "Tous") return D.lab_weekly || [];
    const g = {}; (D.lab_daily || []).filter(x => x.laboratoire === S.lab).forEach(r => { const wd = (new Date(r.date + "T00:00:00Z").getUTCDay() + 6) % 7, k = addDays(r.date, -wd); g[k] ??= { week: k, tests: 0, positifs: 0, non_positifs: 0 }; g[k].tests += r.tests; g[k].positifs += r.positifs; g[k].non_positifs += r.negatifs; });
    return Object.values(g).sort((a, b) => a.week.localeCompare(b.week)).map(r => ({ ...r, positivite_pct: r.tests ? 100 * r.positifs / r.tests : null }));
  }
  function labsCharts() {
    const w = labWeekly().slice(-20);
    Ch.xy($("#c-lab1"), { data: w, x: "week", stacked: true, height: 250, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), series: [{ key: "positifs", label: T("Positifs"), color: "--s2" }, { key: "non_positifs", label: T("Négatifs"), color: "--seq-2" }] });
    Ch.xy($("#c-lab2"), { data: w, x: "week", height: 250, percent: true, xLabel: (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v), series: [{ key: "positivite_pct", label: T("Positivité"), color: "--s1", type: "line" }] });
  }

  /* ================= NOWCASTING ================= */
  function nowcastView() {
    const n = D.nowcast || {}, rows = (n.series || []).slice(-S.nowH), l7 = rows.slice(-7);
    const obs = l7.reduce((s, x) => s + x.observes, 0), adj = l7.reduce((s, x) => s + x.attendus_corriges, 0), p = n.probabilite_croissance_pct || 0;
    const sig = p >= 70 ? T("une croissance probable") : p <= 30 ? T("une diminution probable") : T("une évolution incertaine ou stable");
    const last = rows[rows.length - 1] || {};
    return `
    <div class="grid g4">${kpi("Délai médian DDS → notification", nf(n.delai_median_jours, 1) + " j", `P90 : ${nf(n.delai_p90_jours, 1)} j`)}${kpi("Observés (7 derniers jours)", nf(obs), T("Par date de début des symptômes"))}${kpi("Attendus après correction", nf(adj, 0), `${T("Écart")} : ${nf(Math.max(0, adj - obs), 0)} ${T("cas non encore notifiés")}`, { color: "--s2" })}${kpi("Probabilité de croissance", p < 1 ? "< 1 %" : p > 99 ? "> 99 %" : pc(p, 0), sig, { cls: p >= 70 ? "alert" : "" })}</div>
    ${panel("Cas confirmés observés et corrigés du retard", T("Par date de début des symptômes"), `<div id="c-now"></div><div class="notice"><b>${T("Interprétation")} :</b> ${T("sur les 7 derniers jours,")} ${nf(obs)} ${T("cas observés contre")} ${nf(adj, 1)} ${T("attendus après correction, ce qui suggère")} ${sig}. ${T("Complétude estimée du dernier jour")} : ${pc(last.completude_estimee_pct, 0)}. ${T("Les derniers jours sont les plus incertains.")}</div>`, { png: "nowcasting", tools: `<select data-state="nowH">${[14, 30, 60, 90, 120].map(h => `<option value="${h}" ${S.nowH == h ? "selected" : ""}>${h} ${T("jours")}</option>`).join("")}</select>` })}
    ${panel("Détail", esc(T(n.methode || "")), table("now", [...rows].reverse(), [{ k: "date", t: "Date", v: x => dfmt(x.date) }, { k: "observes", t: "Observés", num: true }, { k: "attendus_corriges", t: "Attendus corrigés", num: true, d: 1 }, { k: "borne_inf_95", t: "Borne inf. 95 %", num: true, d: 1 }, { k: "borne_sup_95", t: "Borne sup. 95 %", num: true, d: 1 }, { k: "completude_estimee_pct", t: "Complétude %", num: true }], { maxh: 360, search: false }), { csv: "now" })}`;
  }
  function nowcastCharts() {
    Ch.xy($("#c-now"), { data: (D.nowcast?.series || []).slice(-S.nowH), x: "date", height: 290, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), band: { lo: "borne_inf_95", hi: "borne_sup_95", color: "--s2", label: T("Intervalle 95 %") },
      series: [{ key: "observes", label: T("Observés"), color: "--seq-3" }, { key: "attendus_corriges", label: T("Corrigés du retard"), color: "--s2", type: "line" }] });
  }

  /* ================= PRÉVISIONS ================= */
  const FT = { confirmes: "Cas confirmés", alertes: "Alertes", suspects: "Cas suspects", deces: "Décès", contacts_symptomatiques: "Contacts symptomatiques", prelevements: "Prélèvements", demande_lits: "Admissions (lits)", charge_laboratoire: "Charge laboratoire" };
  function forecastView() {
    const all = S.fLevel === "National" ? (D.forecast_national || []) : (D.forecast_geo || []).filter(x => x.niveau === S.fLevel);
    const terr = [...new Set(all.map(x => x.territoire))].sort(); if (!terr.includes(S.fTerr)) S.fTerr = terr[0] || "National";
    const tg = [...new Set(all.filter(x => x.territoire === S.fTerr).map(x => x.cible))]; if (!tg.includes(S.fTarget)) S.fTarget = tg[0] || "confirmes";
    const rows = all.filter(x => x.territoire === S.fTerr && x.cible === S.fTarget && x.horizon_jour <= S.fH);
    // intervalle du total : somme des variances journalières (les bornes journalières ne s'additionnent pas)
    const tot = rows.reduce((s, x) => s + x.attendu, 0), sdT = Math.sqrt(rows.reduce((s, x) => s + Math.pow((x.borne_sup_95 - x.borne_inf_95) / 3.92, 2), 0));
    const lo = Math.max(0, tot - 1.96 * sdT), hi = tot + 1.96 * sdT;
    return `
    <div class="flex" style="margin-bottom:12px">
      <label class="field">${T("Niveau")}<select data-state="fLevel">${["National", "Province", "Zone de santé"].map(x => `<option value="${x}" ${S.fLevel === x ? "selected" : ""}>${T(x)}</option>`).join("")}</select></label>
      <label class="field">${T("Territoire")}<select data-state="fTerr">${terr.map(x => `<option ${S.fTerr === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="field">${T("Indicateur")}<select data-state="fTarget">${tg.map(x => `<option value="${x}" ${S.fTarget === x ? "selected" : ""}>${T(FT[x] || x)}</option>`).join("")}</select></label>
      <label class="field">${T("Horizon")}<select data-state="fH">${[14, 30, 60, 90, 120].map(x => `<option value="${x}" ${S.fH == x ? "selected" : ""}>${x} ${T("jours")}</option>`).join("")}</select></label>
    </div>
    <div class="grid g3">${kpi("Total attendu sur l’horizon", nf(tot), `${T("Intervalle 95 %")} : ${nf(lo)}, ${nf(hi)}`, { color: "--s2" })}${kpi("Moyenne attendue par jour", nf(rows.length ? tot / rows.length : null, 1), "")}${kpi("Horizon", `${S.fH} ${T("jours")}`, T("Au-delà de 30 jours : scénarios exploratoires"))}</div>
    ${panel(`${T(FT[S.fTarget] || S.fTarget)}, ${esc(S.fTerr)}`, T("Historique récent observé puis prévision de l’ensemble pondéré"), `<div id="c-fc"></div>`, { png: "prevision" })}
    ${panel("Validation rétrospective des modèles", T("Erreur sur les derniers jours retenus ; poids de l’ensemble inversement proportionnels à la MAE"), table("fv", (D.forecast_validation || []).filter(x => x.target === S.fTarget), [{ k: "modele", t: "Modèle" }, { k: "MAE", t: "MAE", num: true, d: 2 }, { k: "RMSE", t: "RMSE", num: true, d: 2 }, { k: "WIS95", t: "WIS95", num: true, d: 2 }, { k: "couverture_95_pct", t: "Couverture 95 %", num: true, d: 0 }], { search: false }))}`;
  }
  function forecastCharts() {
    const all = S.fLevel === "National" ? (D.forecast_national || []) : (D.forecast_geo || []).filter(x => x.niveau === S.fLevel);
    const rows = all.filter(x => x.territoire === S.fTerr && x.cible === S.fTarget && x.horizon_jour <= S.fH);
    let hist = [];
    const map = { confirmes: "confirmes", alertes: "alertes", suspects: "suspects", deces: "deces" };
    if (map[S.fTarget]) {
      if (S.fLevel === "National") hist = (D.daily || []).slice(-45).map(r => ({ date: r.date, observe: r[map[S.fTarget]] }));
      else { const g = {}; (D.zone_daily || []).filter(r => (S.fLevel === "Province" ? r.province : r.zone_sante) === S.fTerr).forEach(r => { g[r.date] = (g[r.date] || 0) + (r[map[S.fTarget]] || 0); }); hist = Object.keys(g).sort().slice(-45).map(d => ({ date: d, observe: g[d] })); }
    }
    const kInc = Number(D.preprocessing?.parametres?.jours_incomplets_prevision ?? 3);
    hist.forEach((r, i) => { if (i >= hist.length - kInc) { r.observe_inc = r.observe; r.observe = null; } });
    const data = hist.concat(rows.map(r => ({ date: r.date, attendu: r.attendu, lo: r.borne_inf_95, hi: r.borne_sup_95 })));
    Ch.xy($("#c-fc"), { data, x: "date", height: 300, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), band: { lo: "lo", hi: "hi", color: "--s2", label: T("Intervalle 95 %") },
      series: [{ key: "observe", label: T("Observé"), color: "--seq-3" }, { key: "observe_inc", label: T("Observé (jours incomplets, exclus du modèle)"), color: "--seq-1" }, { key: "attendu", label: T("Prévision"), color: "--s2", type: "line" }], stacked: true });
  }

  /* ================= PRIORISATION ================= */
  const CONTRIB = [["nouveaux_confirmes", "Nouveaux confirmés", "--s2"], ["croissance", "Croissance", "--s8"], ["deces_14j", "Décès", "--s7"], ["contacts_non_vus", "Contacts non vus", "--s4"], ["contacts_suspects", "Contacts suspects/cas", "--s5"], ["nouveaux_cas_hors_contacts_pct", "Nouveaux cas hors contacts", "--s1"], ["positivite_pct", "Positivité", "--s3"], ["autres", "Délai et couverture", "--s6"]];
  function priorityView() {
    const r = (D.risk_scores || []).filter(inProv).map(x => ({ ...x, c: { ...x.contributions, autres: (x.contributions?.delai_notification_jours || 0) + (x.contributions?.couverture_geo_pct || 0) } }));
    const mx = Math.max(1, ...r.map(x => x.risk_score));
    return `<div class="notice"><b>${T("Score de risque additif et explicable")}</b>, ${T("somme pondérée d’indicateurs normalisés entre zones : nouveaux confirmés 22 %, croissance 16 %, décès 14 %, contacts non vus 12 %, contacts devenus suspects/cas 10 %, nouveaux cas hors listes de contacts 10 %, positivité 7 %, délai de notification 5 %, couverture géographique 4 %.")}</div>
    ${panel("Classement des zones", T("Longueur = score ; couleurs = contribution de chaque facteur"), `<div class="hbars">${r.slice(0, 25).map(x => `<div class="hbar" style="grid-template-columns:minmax(90px,160px) 1fr 110px"><span>${esc(x.zone_sante)}</span><div class="track" style="display:flex;width:${100 * x.risk_score / mx}%;background:none">${CONTRIB.map(([k, t, c]) => (x.c[k] || 0) > 0 ? `<i title="${T(t)} : ${nf(x.c[k], 1)}" style="width:${100 * x.c[k] / Math.max(x.risk_score, 1e-9)}%;background:${col(c)};border-radius:0"></i>` : "").join("")}</div><b>${nf(x.risk_score, 1)} ${badge(x.niveau_risque, RISK[x.niveau_risque])}</b></div>`).join("")}</div>${legend(CONTRIB.map(([k, t, c]) => ({ t, c })))}`)}
    ${panel("Détail des indicateurs", "", table("prio", r, [{ k: "zone_sante", t: "Zone" }, { k: "risk_score", t: "Score", num: true, d: 1 }, { k: "niveau_risque", t: "Niveau", v: x => badge(x.niveau_risque, RISK[x.niveau_risque]), csv: x => x.niveau_risque }, { k: "nouveaux_confirmes", t: "Confirmés 7 j", num: true }, { k: "croissance", t: "Croissance", num: true, d: 2 }, { k: "deces_14j", t: "Décès 14 j", num: true }, { k: "contacts_non_vus", t: "Non vus >3 j", num: true }, { k: "nouveaux_cas_hors_contacts_pct", t: "% hors contacts", num: true }, { k: "positivite_pct", t: "Positivité %", num: true, d: 1 }, { k: "explication", t: "Explication", wrap: true }], { sort: "risk_score" }), { csv: "prio" })}`;
  }

  /* ================= QUALITÉ & PREPROCESSING ================= */
  function qualityView() {
    const q = D.quality_framework || {}, pp = D.preprocessing || {}, lk = D.linkage || {};
    const j = pp.journal || [];
    return `
    <div class="grid g3">
      ${panel("Score de qualité des données", T("Moyenne des dimensions calculables"), `<div class="score-ring" style="--v:${q.score_global_pct || 0}"><b>${pc(q.score_global_pct, 0)}</b></div>`)}
      ${panel("Dimensions", "", hbars((q.dimensions || []).filter(d => d.score_pct !== null), "dimension", "score_pct", { pct: true, limit: 10, color: r => r.score_pct >= 90 ? "--good" : r.score_pct >= 75 ? "--warn" : "--critical" }), { cls: "" })}
      ${panel("Alignement cas index ↔ contacts", T("Méthode de liaison de chaque contact à son cas index"), hbars(lk.methodes || [], "methode", "contacts", { color: "--s1" }) + `<div style="margin-top:12px">${(lk.confiance || []).map(x => badge(`${T(x.confiance)} : ${nf(x.contacts)}`, CONF[x.confiance])).join(" ")}</div>`)}
    </div>
    ${panel("Journal de preprocessing", `${T("Fenêtre de dates plausibles")} : ${dfmt(pp.fenetre_dates?.[0])} → ${dfmt(pp.fenetre_dates?.[1])}`, `<div class="pipeline">${j.map((s, i) => `<div class="pstep"><div class="n">${i + 1}</div><div><h4>${esc(T(s.etape))} <span class="badge">${esc(T(s.base))}</span></h4><p>${esc(s.detail || "")}</p></div><div class="io">${s.avant !== null ? `${nf(s.avant)} → ` : ""}<b>${s.apres !== null ? nf(s.apres) : ""}</b></div></div>`).join("")}</div>${(pp.avertissements || []).length ? `<div class="notice warn">${pp.avertissements.map(esc).join("<br>")}</div>` : ""}`)}
    ${isPublic ? "" : panel("Liens cas index à vérifier", T("Liens de confiance moyenne ou faible ; les noms sont dans le fichier Excel de validation (outputs/confidentiel)"), table("lk-verif", lk.a_verifier || [], [{ k: "id_saisi", t: "ID saisi (contact tracing)" }, { k: "initiales_saisies", t: "Init. saisies" }, { k: "id_linelist", t: "ID retenu (Linelist)" }, { k: "initiales_linelist", t: "Init. Linelist" }, { k: "methode", t: "Méthode" }, { k: "confiance", t: "Confiance", v: x => badge(x.confiance, CONF[x.confiance]), csv: x => x.confiance }, { k: "similarite_nom", t: "Similarité nom %", num: true }, { k: "n_lignes", t: "Lignes", num: true }, { k: "zone_contacts", t: "Zone" }], { sort: "n_lignes" }), { csv: "lk-verif" })}
    ${panel("Registre des contrôles", T("Règles déterministes, probabilistes, statistiques et ML"), table("dq", q.issues || [], [{ k: "dimension", t: "Dimension" }, { k: "controle", t: "Contrôle", wrap: true }, { k: "anomalies", t: "Anomalies", num: true }, { k: "denominateur", t: "Dénominateur", num: true }, { k: "taux_conformite_pct", t: "Conformité %", num: true, v: x => progress(x.taux_conformite_pct), sortv: x => x.taux_conformite_pct }, { k: "type_regle", t: "Type" }, { k: "severite", t: "Sévérité" }], { sort: "taux_conformite_pct", dir: 1 }), { csv: "dq" })}
    ${panel("Complétude des variables clés", "", table("compl", q.completude_variables || [], [{ k: "base", t: "Base" }, { k: "variable", t: "Variable" }, { k: "completude_pct", t: "Complétude", v: x => progress(x.completude_pct), sortv: x => x.completude_pct }, { k: "manquants", t: "Manquants", num: true }], { sort: "completude_pct", dir: 1, search: false }))}`;
  }

  /* ================= MÉTHODOLOGIE ================= */
  // « Priority N » en gras, en anglais dans les deux versions (demande de l'équipe), suivi du reste de l'orientation
  function prioHtml(s) {
    const tx = T(s || ""), m = tx.match(/^Priorit(?:é|y)\s*(\d)(.*)$/s);
    return m ? `<b>Priority ${m[1]}</b>${esc(m[2])}` : esc(tx);
  }
  function methodView() { return panel("Méthodologie", T("Définitions, preprocessing, alignement et modèles"), `<div class="method">${(window.HUB_METHOD || {})[lang] || ""}</div>`); }
  function termsView() { return panel("Conditions d’utilisation", "", `<div class="method">${(window.HUB_TERMS || {})[lang] || ""}</div>`); }

  /* ================= Rendu ================= */
  /* ======================================================================
     v3.4 : Rt multi-méthodes, zones à risque, analyses lln, Linelist fusionnée, chargement des fichiers
     ====================================================================== */
  const RTM_COL = { RP: "--s1", RPa: "--s5", WT: "--s3", EG: "--s4", DSS: "--s2", BPS: "--s6", FBI: "--s7", FBIs: "--s8", SB: "--ink-2", ICL: "--critical" };
  const RTM_INFO = {
    RP: ["Renouvellement (Cori 2013, EpiEstim)", "Fenêtre glissante de 7 jours, a priori Gamma(1, 5)", "Référence opérationnelle ; bien calibré en transmission modérée", "Retard d’environ une demi-fenêtre ; sensible au choix de la fenêtre et de l’intervalle sériel"],
    RPa: ["EpiEstim, fenêtre optimale (Parag & Donnelly 2020)", "Fenêtre choisie parmi 3 à 21 jours par l’erreur de prédiction cumulée (APE)", "Fenêtre objective, adaptée aux données", "Même hypothèses qu’EpiEstim"],
    WT: ["Wallinga & Teunis 2004 (Rt de cas)", "Probabilité de chaque paire infecteur–infecté selon l’intervalle sériel ; censure à droite corrigée (Cauchemez 2006)", "Interprétation directe : nombre de cas secondaires d’un cas apparu ce jour", "Utilise des données futures : les 2 à 3 dernières semaines ne sont pas estimables"],
    EG: ["Croissance exponentielle (Wallinga & Lipsitch 2007 ; package R0)", "Pente r d’une régression de Poisson sur 21 jours, R = (1 + r σ²/ρ)^(ρ²/σ²)", "Simple ; bon outil d’alerte en croissance", "Biaisé et faux négatifs près du seuil R = 1 (article : 15 % de faux négatifs)"],
    DSS: ["Lissage spline par dérivée (Barro et al. 2026)", "P-spline de Poisson (vraisemblance marginale), dérivée de log μ(t), puis fonction génératrice des moments", "Le plus précis (biais, EQM) et le mieux calibré en transmission forte ou faible dans l’article", "Effets de bord en fin de série ; dépend de la qualité de la courbe"],
    BPS: ["P-splines bayésiennes (Gressani 2022, EpiLPS)", "Binomiale négative + P-spline, approximation de Laplace (LPSMAP), Rt = μt / Σ μ(t−s) ws", "Gère la surdispersion ; courbe lisse", "Le moins robuste pour R0 dans l’article (queues longues, sous-couverture)"],
    FBI: ["Filtrage bayésien (Parag 2021, EpiFilter)", "Rt suit une marche aléatoire ; filtre récursif sur grille (η = 0,1)", "Robuste quand les cas sont peu nombreux ; temps réel", "Surestimation et transitions lissées selon η (article)"],
    FBIs: ["EpiFilter, lisseur avant–arrière", "Même modèle, utilise aussi les données futures", "Meilleure précision rétrospective", "Non opérationnel en temps réel (révisé quand arrivent de nouvelles données)"],
    ICL: ["Rt des infections corrigé de la détection (ICL–INRB 2026)", "Alertes validées vivantes et décédées ; non testées pondérées par la positivité de leur type ; détection = p + (1 − p) × létalité hors CTE (42,8 %) ; infections = positives attendues / détection ; Rt = infections / infectiosité, droite de Theil–Sen sur 13 jours", "Corrige les écarts de détection entre zones et dans le temps ; dates de début imputées au hasard ; IC = imputations × bootstrap", "Repose sur une létalité hors CTE supposée et sur la notification de tous les décès ; fenêtre centrée : retard de 6 jours ; sensible aux non-cas non saisis"],
    SB: ["Bayésien séquentiel (Bettencourt & Ribeiro 2008)", "I(t+1) ~ Poisson(I(t) exp(γ (Rt − 1))), γ = 1 / moyenne du SI", "Mise à jour jour par jour", "Peu informatif quand γ est petit (Ebola) : intervalles larges"],
  };
  const rtmData = () => D.rt_methodes || { groupes: [], resultats: {}, methodes: [] };
  function rtmMethodsView() {
    const R = rtmData(), gs = R.groupes || [];
    if (!gs.length) return `<div class="empty">${T("Rt multi-méthodes indisponible (série trop courte).")}</div>`;
    if (!gs.some(g => g.id === S.rtmG)) S.rtmG = gs[0].id;
    const r = R.resultats[S.rtmG] || {}, cons = r.consensus || {}, last = r.dernier || [], perf = r.performance || [];
    const best = perf[0];
    const sigTxt = cons.n_croissance > cons.n_methodes / 2 ? T("croissance") : cons.n_controle > cons.n_methodes / 2 ? T("contrôle (décroissance)") : T("signal incertain");
    const r0 = Object.entries(r.R0 || {}).map(([k, v]) => ({ methode: k, libelle: T((R.methodes.find(m => m.code === k) || {}).libelle || k), R0: v.R0, lo: v.ic95?.[0], hi: v.ic95?.[1] }));
    const byGroup = gs.map(g => { const x = R.resultats[g.id] || {}; const f = k => (x.dernier || []).find(d => d.methode === k); return { id: g.id, nom: g.nom, niveau: g.niveau, cons: x.consensus?.mediane, min: x.consensus?.min, max: x.consensus?.max, nc: x.consensus?.n_croissance, nd: x.consensus?.n_controle, nm: x.consensus?.n_methodes, RP: f("RP")?.mediane, DSS: f("DSS")?.mediane, FBI: f("FBI")?.mediane, BPS: f("BPS")?.mediane }; });
    const sigBadge = s => badge(s, s === "Croissance" ? "b-crit" : s === "Contrôle" ? "b-good" : "b-mod");
    return `
    <div class="flex" style="margin-bottom:12px">
      <label class="field">${T("Territoire")}<select data-state="rtmG">${gs.map(g => `<option value="${esc(g.id)}" ${S.rtmG === g.id ? "selected" : ""}>${esc(T(g.niveau))}, ${esc(g.nom)}</option>`).join("")}</select></label>
      <label class="field">${T("Méthodes")}<select data-state="rtmSet">${[["all", "Toutes"], ["rt", "Temps réel seulement"], ["smooth", "Lissage et rétrospectives"]].map(([v, t]) => `<option value="${v}" ${S.rtmSet === v ? "selected" : ""}>${T(t)}</option>`).join("")}</select></label>
      <div class="seg" data-seg="rtmDays">${[["60", "60 j"], ["120", "120 j"], ["0", "Tout"]].map(([v, t]) => `<button data-v="${v}" class="${S.rtmDays === v ? "on" : ""}">${T(t)}</button>`).join("")}</div>
    </div>
    <div class="grid g4">
      ${kpi("Consensus (médiane des méthodes)", nf(cons.mediane, 2), `${T("Étendue")} ${nf(cons.min, 2)}, ${nf(cons.max, 2)}`, { color: cons.mediane > 1 ? "--critical" : "--s2" })}
      ${kpi("Méthodes en croissance", `${nf(cons.n_croissance)} / ${nf(cons.n_methodes)}`, T("Borne inférieure de l’IC > 1"), { color: "--critical" })}
      ${kpi("Méthodes en contrôle", `${nf(cons.n_controle)} / ${nf(cons.n_methodes)}`, T("Borne supérieure de l’IC < 1"), { color: "--s2" })}
      ${kpi("Meilleure prévision à 1 jour", best ? esc(T(best.libelle)) : "—", best ? `${T("Couverture IC 95 %")} : ${pc(best.couverture_95_pct, 0)}` : "")}
    </div>
    <div class="notice"><b>${T("Lecture")} :</b> ${T("au dernier jour consolidé, les méthodes indiquent")} <b>${sigTxt}</b> ${T("pour")} ${esc(r && gs.find(g => g.id === S.rtmG)?.nom || "")}. ${T("Aucune méthode n’est supérieure partout (Barro et al. 2026) : on décide sur la concordance des méthodes, en privilégiant EpiEstim (contrôle du risque) et le lissage DSS (précision), et on vérifie la calibration empirique ci-dessous.")}</div>
    ${panel("Rt estimé par chaque méthode", T("Médianes ; ligne pointillée : seuil R = 1 ; zone grisée : jours non consolidés (notifications tardives)"), `<div id="c-rtm-all"></div>`, { png: "rt_toutes_methodes" })}
    <div class="grid g3">${(r.series ? Object.keys(r.series) : []).filter(rtmKeep).map(k => panel(METH(k), esc(T(RTM_INFO[k]?.[1] || "")), `<div id="c-rtm-${k}"></div>`, { png: "rt_" + k, cls: "compact" })).join("")}</div>
    <div class="grid g2">
      ${panel("Dernier Rt par méthode", `${T("Dernier jour consolidé ; Wallinga–Teunis s’arrête plus tôt (descendance non encore observée)")}`, table("rtm-last", last, [{ k: "libelle", t: "Méthode", v: x => esc(T(x.libelle)) }, { k: "date", t: "Date", v: x => dfmt(x.date) }, { k: "mediane", t: "Rt médian", num: true, d: 2 }, { k: "ic", t: "IC 95 %", v: x => `${nf(x.ic95[0], 2)}, ${nf(x.ic95[1], 2)}` }, { k: "signal", t: "Signal", v: x => sigBadge(x.signal) }, { k: "temps_reel", t: "Temps réel", v: x => x.temps_reel ? T("Oui") : T("Non") }], { search: false, sort: null }))}
      ${panel("R0 de la phase initiale", `${T("Médiane de Rt jusqu’au point t* où le taux de croissance est maximal")} (${dfmt(r.t_star)}), ${T("méthode de l’article")}`, table("rtm-r0", r0, [{ k: "libelle", t: "Méthode" }, { k: "R0", t: "R0", num: true, d: 2 }, { k: "lo", t: "IC bas", num: true, d: 2 }, { k: "hi", t: "IC haut", num: true, d: 2 }], { search: false, sort: null }))}
    </div>
    ${panel("Calibration empirique : prévision à 1 jour", T("Pour chaque méthode temps réel, Rt(t) × Λ(t+1) prédit les cas du lendemain sur les 60 derniers jours consolidés. Score logarithmique (plus bas = meilleur), erreur absolue moyenne et couverture de l’intervalle à 95 % (idéal : 95 %)."), table("rtm-perf", perf, [{ k: "libelle", t: "Méthode", v: x => esc(T(x.libelle)) }, { k: "score_log", t: "Score log", num: true, d: 2 }, { k: "mae", t: "Erreur absolue moyenne", num: true, d: 1 }, { k: "couverture_95_pct", t: "Couverture IC 95 %", v: x => pc(x.couverture_95_pct, 0) }, { k: "jours", t: "Jours", num: true }], { search: false, sort: null }))}
    ${panel("Comparaison par territoire", T("Dernier Rt consolidé ; consensus = médiane des méthodes ; nombre de méthodes signalant une croissance / un contrôle"), table("rtm-geo", byGroup, [{ k: "nom", t: "Territoire" }, { k: "niveau", t: "Niveau", v: x => T(x.niveau) }, { k: "cons", t: "Consensus", num: true, d: 2 }, { k: "min", t: "Min", num: true, d: 2 }, { k: "max", t: "Max", num: true, d: 2 }, { k: "RP", t: "EpiEstim", num: true, d: 2 }, { k: "DSS", t: "DSS", num: true, d: 2 }, { k: "BPS", t: "EpiLPS", num: true, d: 2 }, { k: "FBI", t: "EpiFilter", num: true, d: 2 }, { k: "nc", t: "Croissance", num: true }, { k: "nd", t: "Contrôle", num: true }], { rowClick: true, rowKey: x => x.id, sort: "cons", dir: -1 }))}
    ${panel("Guide des méthodes", T("Principe, forces et limites ; d’après Barro et al., Discover Public Health 2026, et la littérature citée"), table("rtm-guide", Object.entries(RTM_INFO).map(([k, v]) => ({ code: k, nom: v[0], principe: v[1], forces: v[2], limites: v[3] })), [{ k: "nom", t: "Méthode", wrap: true }, { k: "principe", t: "Principe", wrap: true }, { k: "forces", t: "Forces", wrap: true }, { k: "limites", t: "Limites", wrap: true }], { search: false, sort: null }))}
    <div class="notice small">${T("Paramètres")} : ${T("intervalle sériel")} ${nf(r.parametres?.SI_moyenne, 1)} ± ${nf(r.parametres?.SI_ecart_type, 1)} j ; ${T("fenêtre APE retenue")} ${nf(r.parametres?.fenetre_APE)} j ; DSS λ = ${nf(r.parametres?.DSS?.lambda, 1)}, ${T("ddl")} ${nf(r.parametres?.DSS?.edf, 1)} ; EpiLPS λ = ${nf(r.parametres?.BPS?.lambda, 1)}, φ = ${nf(r.parametres?.BPS?.dispersion_nb, 0)} ; EpiFilter η = ${nf(r.parametres?.EpiFilter_eta, 2)}.</div>`;
  }
  const METH = k => (rtmData().methodes.find(m => m.code === k) || {}).libelle || k;
  const rtmKeep = k => S.rtmSet === "all" || (S.rtmSet === "rt" ? ["RP", "RPa", "EG", "FBI", "SB"].includes(k) : ["WT", "DSS", "BPS", "FBIs", "ICL"].includes(k));
  function rtmRows() {
    const r = rtmData().resultats[S.rtmG]; if (!r) return { rows: [], prov: null };
    const n = r.n, start = r.debut;
    const rows = Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), inc: r.incidence[i] }));
    Object.entries(r.series).forEach(([k, v]) => rows.forEach((x, i) => { const cap = z => z === null || z === undefined ? null : Math.min(z, 4); x[k] = cap(v.med[i]); x[k + "_lo"] = cap(v.lo[i]); x[k + "_hi"] = cap(v.hi[i]); }));
    const d = Number(S.rtmDays) || n;
    const out = rows.slice(-d);
    const prov = r.provisoire_des ? out.findIndex(x => x.date >= r.provisoire_des) : -1;
    return { rows: out, prov: prov >= 0 ? prov : null };
  }
  function rtmMethodsCharts() {
    const { rows, prov } = rtmRows(); if (!rows.length) return;
    const keys = Object.keys(rtmData().resultats[S.rtmG]?.series || {}).filter(rtmKeep);
    const xl = (v, r, tip) => tip ? dfmt(v) : dshort(v);
    const shade = prov !== null ? { from: prov, label: T("provisoire") } : null;
    Ch.xy($("#c-rtm-all"), { data: rows, x: "date", height: 320, xLabel: xl, xTitle: T("Date"), shade, hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }], tipSkipNull: true,
      series: keys.map(k => ({ key: k, label: T(METH(k)), color: RTM_COL[k], type: "line", width: k === "RP" || k === "DSS" ? 2.6 : 1.6 })) });
    keys.forEach(k => Ch.xy($("#c-rtm-" + k), { data: rows, x: "date", height: 200, xLabel: xl, xTitle: T("Date"), shade, hlines: [{ y: 1, color: "--ink-2", dash: "6 4" }], tipSkipNull: true,
      bands: [{ lo: k + "_lo", hi: k + "_hi", color: RTM_COL[k], label: T("IC 95 %"), opacity: .22 }], series: [{ key: k, label: T("Rt médian"), color: RTM_COL[k], type: "line" }] }));
  }

  const resRank = (Z, x) => 1 + Z.filter(z => z.province === x.province && (z.score || 0) > (x.score || 0)).length;
  /* ---------------- Rt par province et zone de santé (EpiEstim, fenêtres 7 / 14 / 21 j) ---------------- */
  const TAU_COL = { "7": "--s1", "14": "--s3", "21": "--s7" };
  function rtmView() {
    const modes = [["zones", "Par province et zone de santé"], ["methodes", "Comparaison des 10 méthodes"], ["detection", "Détection et Rt des infections (ICL)"]];
    const seg = `<div class="seg big-seg" data-seg="rtmMode" style="margin-bottom:12px">${modes.map(([v, t]) => `<button data-v="${v}" class="${S.rtmMode === v ? "on" : ""}">${T(t)}</button>`).join("")}</div>`;
    return seg + (S.rtmMode === "methodes" ? rtmMethodsView() : S.rtmMode === "detection" ? iclView() : rtzView());
  }
  function rtmCharts() { if (S.rtmMode === "methodes") rtmMethodsCharts(); else if (S.rtmMode === "detection") iclCharts(); else rtzCharts(); }
  /* ---------------- Détection et Rt des infections (approche ICL–INRB) ---------------- */
  const ICLD = () => D.rt_icl || { groupes: [], series: {} };
  const TEND = { hausse: "▲ hausse", baisse: "▼ baisse", stable: "● stable" };
  function iclView() {
    const R = ICLD(), gs = R.groupes || [];
    if (!gs.length) return `<div class="empty">${T("Méthode ICL indisponible : relancez l’analyse complète.")}</div>`;
    if (!gs.some(g => g.id === S.iclG)) S.iclG = "National";
    const g = gs.find(x => x.id === S.iclG) || gs[0], r = g.rt, a = g.detection, P = R.parametres || {};
    const rtTxt = x => x ? `${nf(x.mediane, 2)} (${nf(x.ic95[0], 2)}–${nf(x.ic95[1], 2)})` : T("données insuffisantes");
    const detTxt = x => x ? `${pc(100 * x.moyenne, 0)} (${nf(100 * x.ic95[0], 0)}–${nf(100 * x.ic95[1], 0)})` : "—";
    const low = x => x.pct_testees_14j !== null && x.pct_testees_14j < 50;
    const rows = gs.filter(x => x.id !== "National").map(x => ({ ...x, rtm: x.rt?.mediane, det: x.detection?.moyenne }));
    const fillR = x => !x.rt ? "" : x.rt.ic95[0] > 1 ? "b-crit" : x.rt.ic95[1] < 1 ? "b-good" : "b-mod";
    const map = (D.cartes?.cartes || []).find(c => /detection/.test(c.fichier));
    const base = D.cartes ? (D.cartes.base || `../reports/${encodeURIComponent(D.cartes.dossier)}/`) : "";
    return `
    <div class="flex" style="margin-bottom:12px">
      <label class="field">${T("Territoire")}<select data-state="iclG">${gs.map(x => `<option value="${esc(x.id)}" ${S.iclG === x.id ? "selected" : ""}>${esc(T(x.niveau))}, ${esc(x.nom)}</option>`).join("")}</select></label>
    </div>
    <div class="grid g4">
      ${kpi("Rt des infections", r ? nf(r.mediane, 2) : "—", r ? `${T("IC 95 %")} ${nf(r.ic95[0], 2)}–${nf(r.ic95[1], 2)} · P(Rt>1) ${pc(100 * r.p_sup_1, 0)} · ${T("centre")} ${dshort(r.date)}${r.tendance_14j ? " · " + T(TEND[r.tendance_14j]) : ""}` : T("moins de 20 cas confirmés sur 28 jours"), { color: r && r.ic95[0] > 1 ? "--critical" : r && r.ic95[1] < 1 ? "--good" : "--warn" })}
      ${kpi("Part des infections détectées", a ? pc(100 * a.moyenne, 0) : "—", a ? `${T("IC 95 %")} ${nf(100 * a.ic95[0], 0)}–${nf(100 * a.ic95[1], 0)} % · ${dshort(a.debut)}–${dshort(a.fin)}${a.tendance ? " · " + T(TEND[a.tendance]) : ""}` : "", { color: "--s1" })}
      ${kpi("Alertes déjà décédées (14 j)", pc(g.pct_decedees_14j, 0), `${nf(g.alertes_valides_14j)} ${T("alertes validées")}`, { color: "--ink-2" })}
      ${kpi("Alertes validées testées (14 j)", pc(g.pct_testees_14j, 0), `${T("positivité")} ${pc(g.positivite_14j, 0)}`, { color: low(g) ? "--critical" : "--s3", cls: low(g) ? "alert" : "" })}
    </div>
    <div class="notice"><b>${T("Méthode (ICL–INRB)")} :</b> ${T("les alertes validées non testées reçoivent la probabilité d’être positives des alertes testées du même type (vivante / décédée). Une infection est détectée vivante avec la probabilité p, sinon elle meurt avec la létalité hors CTE")} (${pc(100 * (P.letalite_hors_cte || .428), 1)}) ${T("et devient une alerte décès ; p découle de la part d’alertes vivantes parmi les positives. Infections = alertes positives attendues / probabilité de générer une alerte. Rt = infections / infectiosité des infections antérieures, droite de Theil–Sen sur 13 jours, valeur au centre. Dates de début manquantes tirées au hasard dans le délai observé")} (${nf(P.imputations)} ${T("jeux imputés")} × ${nf(P.bootstraps)} ${T("bootstraps")}). ${T("Rt affiché seulement avec au moins 20 cas confirmés sur 28 jours.")}${low(g) ? `<br><b>${T("Attention")} :</b> ${T("moins de la moitié des alertes validées ont un résultat saisi ; si les non-cas ne sont pas saisis, la détection est sous-estimée et le Rt des infections peut être biaisé.")}` : ""}</div>
    <div class="grid g2">
      ${panel(`${T("Rt des infections")}, ${esc(g.nom)}`, T("Médiane et IC 95 % ; ligne pointillée : R = 1 ; zone grisée : jours non consolidés"), `<div id="c-icl-rt"></div>`, { png: "rt_infections_icl" })}
      ${panel(`${T("Part des infections détectées")}, ${esc(g.nom)}`, T("Cas confirmés / infections estimées, sommes glissantes sur 14 jours ; IC 95 %"), `<div id="c-icl-det"></div>`, { png: "detection_icl" })}
    </div>
    ${panel("Détection et Rt des infections par province et zone de santé", T("Zones avec au moins 20 cas confirmés sur 28 jours ou 100 cas au total ; tendance : comparaison avec 14 jours plus tôt (probabilité ≥ 80 %) ; ⚠ : moins de la moitié des alertes testées, détection probablement sous-estimée"), table("icl-geo", rows, [
      { k: "nom", t: "Territoire", v: x => `${esc(x.nom)}${low(x) ? ` <span title="${T("moins de la moitié des alertes testées")}">⚠</span>` : ""}` }, { k: "niveau", t: "Niveau", v: x => T(x.niveau) }, { k: "province", t: "Province", v: x => esc(x.province || "") },
      { k: "confirmes_28j", t: "Confirmés 28 j", num: true },
      { k: "rtm", t: "Rt des infections (IC 95 %)", v: x => x.rt ? badge(rtTxt(x.rt), fillR(x)) : `<span class="muted">${T("insuffisant")}</span>`, sortv: x => x.rtm },
      { k: "p1", t: "P(Rt > 1)", num: true, v: x => x.rt ? pc(100 * x.rt.p_sup_1, 0) : "—", sortv: x => x.rt?.p_sup_1 },
      { k: "tr", t: "Tendance Rt", v: x => x.rt?.tendance_14j ? T(TEND[x.rt.tendance_14j]) : "—" },
      { k: "det", t: "Détection (IC 95 %)", v: x => detTxt(x.detection), sortv: x => x.det },
      { k: "trd", t: "Tendance détection", v: x => x.detection?.tendance ? T(TEND[x.detection.tendance]) : "—" },
      { k: "pct_decedees_14j", t: "% alertes décédées 14 j", num: true, d: 0 }, { k: "pct_testees_14j", t: "% testées 14 j", num: true, d: 0 }, { k: "positivite_14j", t: "Positivité 14 j", num: true, d: 0 }],
      { rowClick: true, rowKey: x => x.id, sort: "confirmes_28j", maxh: 520 }), { csv: "icl-geo" })}
    ${map ? panel("Carte de la part des infections détectées", T("Carte de rapport (A4) ; légende et commentaire identiques à ceux du menu « Cartes pour rapport »"), `<img class="map-img" style="width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:6px" src="${base}${encodeURIComponent(map.fichier)}" alt="${esc(map.titre)}" loading="lazy"><p class="map-cap">${capHtml(map.commentaire)}</p>`) : ""}`;
  }
  function iclCharts() {
    const s = (ICLD().series || {})[S.iclG]; if (!s || !$("#c-icl-rt")) return;
    const rows = Array.from({ length: s.n }, (_, i) => ({ date: addDays(s.debut, i), rt: s.rt.med[i] == null ? null : Math.min(s.rt.med[i], 4), lo: s.rt.lo[i] == null ? null : Math.min(s.rt.lo[i], 4), hi: s.rt.hi[i] == null ? null : Math.min(s.rt.hi[i], 4),
      det: s.detection.med[i] == null ? null : 100 * s.detection.med[i], dlo: s.detection.lo[i] == null ? null : 100 * s.detection.lo[i], dhi: s.detection.hi[i] == null ? null : 100 * s.detection.hi[i] }));
    const out = rows.slice(-150);
    const prov = s.provisoire_des && out.some(x => x.date >= s.provisoire_des) ? { from: s.provisoire_des, label: T("provisoire") } : null;
    const xl = (v, r, tip) => tip ? dfmt(v) : dshort(v);
    Ch.xy($("#c-icl-rt"), { data: out, x: "date", height: 260, xLabel: xl, shade: prov, tipSkipNull: true, hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }],
      bands: [{ lo: "lo", hi: "hi", color: "--critical", label: T("IC 95 %"), opacity: .2 }], series: [{ key: "rt", label: T("Rt des infections"), color: "--critical", type: "line", width: 2.2 }] });
    Ch.xy($("#c-icl-det"), { data: out, x: "date", height: 260, xLabel: xl, shade: prov, tipSkipNull: true, yFmt: v => nf(v, 0) + " %",
      bands: [{ lo: "dlo", hi: "dhi", color: "--s1", label: T("IC 95 %"), opacity: .2 }], series: [{ key: "det", label: T("Part des infections détectées"), color: "--s1", type: "line", width: 2.2 }] });
  }
  const RZ = () => D.rt_zones || { groupes: [], series: {}, taus: [7, 14, 21] };
  function rtzView() {
    const R = RZ(), gs = R.groupes || [];
    if (!gs.length) return `<div class="empty">${T("Rt par zone indisponible : relancez l’analyse complète.")}</div>`;
    const provs = ["Toutes", ...new Set(gs.filter(g => g.niveau === "Province").map(g => g.nom))];
    if (!provs.includes(S.rtzProv)) S.rtzProv = "Toutes";
    const opts = gs.filter(g => S.rtzProv === "Toutes" ? true : (g.nom === S.rtzProv && g.niveau === "Province") || g.province === S.rtzProv);
    if (!opts.some(g => g.id === S.rtzG)) S.rtzG = S.rtzProv === "Toutes" ? "National" : `P:${S.rtzProv}`;
    const g = gs.find(x => x.id === S.rtzG) || gs[0];
    const d = g.dernier || {};
    const ref = D.meta.cutoff;
    const old = x => x && days(x.date, ref) > 21;
    const sig = x => !x ? "—" : x.ic95[0] > 1 ? badge("Croissance", "b-crit") : x.ic95[1] < 1 ? badge("Contrôle", "b-good") : badge("Incertain", "b-mod");
    const zones = gs.filter(x => x.niveau === "Zone de santé" && (S.rtzProv === "Toutes" || x.province === S.rtzProv));
    const tbl = zones.map(x => ({ id: x.id, nom: x.nom, province: x.province, cas: x.cas, cas_21j: x.cas_21j,
      r7: x.dernier?.["7"], r14: x.dernier?.["14"], r21: x.dernier?.["21"] }));
    const rv = k => ({ k, t: `Rt ${k.slice(1)} j`, num: true, v: x => x[k] ? `${nf(x[k].mediane, 2)}${old(x[k]) ? ` <span class="muted small" title="${T("Dernière estimation ancienne : pas de cas récents")}">(${dshort(x[k].date)})</span>` : ""}` : "—", sortv: x => x[k] ? x[k].mediane : null });
    return `
    <div class="flex" style="margin-bottom:12px">
      <label class="field">${T("Province")}<select data-state="rtzProv">${provs.map(p => `<option value="${esc(p)}" ${S.rtzProv === p ? "selected" : ""}>${esc(T(p))}</option>`).join("")}</select></label>
      <label class="field">${T("Zone de santé")}<select data-state="rtzG">${opts.map(o => `<option value="${esc(o.id)}" ${S.rtzG === o.id ? "selected" : ""}>${o.niveau === "Zone de santé" ? "— " : ""}${esc(o.niveau === "Zone de santé" ? o.nom : (o.niveau === "National" ? T("National") : `${T("Toute la province")} ${o.nom}`))}${o.niveau === "Zone de santé" ? ` (${nf(o.cas)} ${T("cas")})` : ""}</option>`).join("")}</select></label>
      <div class="field"><span>${T("Fenêtre d’estimation")}</span><div class="seg" data-seg="rtzTau">${[["7", "7 j"], ["14", "14 j"], ["21", "21 j"], ["cmp", "Comparer"]].map(([v, t]) => `<button data-v="${v}" class="${S.rtzTau === v ? "on" : ""}">${T(t)}</button>`).join("")}</div></div>
      <div class="field"><span>${T("Affichage")}</span><div class="seg" data-seg="rtzDays">${[["7", "7 j"], ["14", "14 j"], ["21", "21 j"], ["28", "28 j"], ["42", "42 j"], ["60", "60 j"], ["90", "90 j"], ["120", "120 j"], ["0", "Tout"]].map(([v, t]) => `<button data-v="${v}" class="${S.rtzDays === v ? "on" : ""}">${T(t)}</button>`).join("")}</div></div>
    </div>
    <div class="grid g4">
      ${["7", "14", "21"].map(t => kpi(`Rt, fenêtre de ${t} jours`, d[t] ? nf(d[t].mediane, 2) : "—", d[t] ? `${T("IC 95 %")} ${nf(d[t].ic95[0], 2)}–${nf(d[t].ic95[1], 2)} · P(Rt>1) ${pc(100 * d[t].p_sup_1, 0)} · ${dshort(d[t].date)}${old(d[t]) ? ` · <b>${T("ancienne")}</b>` : ""}` : T("Trop peu de cas"), { color: TAU_COL[t] })).join("")}
      ${kpi("Cas (21 derniers jours)", nf(g.cas_21j), `${nf(g.cas)} ${T("cas au total")} · ${esc(T(g.niveau))}`)}
    </div>
    ${panel(`Rt, ${g.niveau === "National" ? T("National") : esc(g.nom)}`, T("EpiEstim (Cori 2013) sur l’incidence par date de début des symptômes corrigée du retard de notification ; fenêtre glissante de 7, 14 ou 21 jours ; zone grisée : jours non consolidés ; Rt masqué quand le territoire compte moins de 20 cas sur les 28 jours précédents (critère ICL–INRB)."), `<div id="c-rtz"></div><div id="c-rtz-inc"></div>`, { png: "rt_" + g.nom })}
    <div class="notice small"><b>${T("Lecture")} :</b> ${T("la fenêtre de 7 jours réagit vite mais fluctue ; 14 et 21 jours lissent les variations dues aux petits effectifs (zones avec peu de cas). Une zone est en croissance quand la borne inférieure de l’IC 95 % dépasse 1, en contrôle quand la borne supérieure est sous 1.")}</div>
    ${panel(S.rtzProv === "Toutes" ? "Dernier Rt par zone de santé" : `Dernier Rt par zone de santé, ${esc(S.rtzProv)}`, T("Cliquer une zone pour afficher ses courbes ; entre parenthèses : date de la dernière estimation quand elle date de plus de 21 jours"), table("rtz-geo", tbl, [
      { k: "nom", t: "Zone de santé" }, { k: "province", t: "Province" }, { k: "cas", t: "Cas", num: true }, { k: "cas_21j", t: "Cas 21 j", num: true }, rv("r7"), rv("r14"), rv("r21"),
      { k: "sig", t: "Signal (7 j)", v: x => old(x.r7) ? `<span class="muted">${T("pas de cas récents")}</span>` : sig(x.r7), sortv: x => x.r7 ? x.r7.ic95[0] : null }],
      { rowClick: true, rowKey: x => x.id, sort: "cas_21j", maxh: 460 }), { csv: "rtz-geo" })}`;
  }
  function rtzCharts() {
    const R = RZ(), ser = (R.series || {})[S.rtzG]; if (!ser || !$("#c-rtz")) return;
    const rows = Array.from({ length: ser.n }, (_, i) => ({ date: addDays(ser.debut, i), inc: ser.incidence[i] }));
    ["7", "14", "21"].forEach(t => { const v = ser.rt[t]; if (!v) return; rows.forEach((x, i) => { const c = z => z === null || z === undefined ? null : Math.min(z, 5); x["r" + t] = c(v.med[i]); x["lo" + t] = c(v.lo[i]); x["hi" + t] = c(v.hi[i]); }); });
    const nd = Number(S.rtzDays) || rows.length;
    const out = rows.slice(-Math.max(nd, 2));
    const prov = ser.provisoire_des && out.some(x => x.date >= ser.provisoire_des) ? { from: ser.provisoire_des, label: T("provisoire") } : null;
    const xl = (v, r, tip) => tip ? dfmt(v) : dshort(v);
    const taus = S.rtzTau === "cmp" ? ["7", "14", "21"] : [S.rtzTau];
    Ch.xy($("#c-rtz"), { data: out, x: "date", height: 300, xLabel: xl, xTitle: T("Date"), shade: prov, noClip: true, tipSkipNull: true,
      hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }],
      bands: taus.length === 1 ? [{ lo: "lo" + taus[0], hi: "hi" + taus[0], color: TAU_COL[taus[0]], label: T("IC 95 %"), opacity: .2 }] : [],
      series: taus.map(t => ({ key: "r" + t, label: `Rt (${T("fenêtre")} ${t} j)`, color: TAU_COL[t], type: "line", width: 2.2 })) });
    Ch.xy($("#c-rtz-inc"), { data: out, x: "date", height: 150, xLabel: xl, noClip: true, barWidth: .8, series: [{ key: "inc", label: T("Cas par date de début des symptômes"), color: "--seq-2" }] });
  }

  /* ---------------- Opérations par province et zone de santé : décès au CTE / hors CTE, EDS, CTE, swabs, PPL ----------------
     Recalcul dans le navigateur à partir des lignes pseudonymisées (D.operations.lignes) : plage de dates, province, zone, CTE. */
  const opNk = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const OPT = [["deces", "Décès au CTE et hors CTE"], ["eds", "EDS"], ["cte", "CTE (admissions, issues)"], ["swabs", "Swabs"], ["ppl", "PPL"], ["qualite", "Contrôle des données"]];
  const opsRows = () => {
    const G = D.operations?.lignes; if (!G || !G.rows) return null;
    if (G._arr) return G;
    const R = G.rows, n = R.c.length, arr = new Array(n);
    for (let i = 0; i < n; i++) arr[i] = { p: R.p[i], z: R.z[i], c: R.c[i], dn: R.dn[i], dp: R.dp[i], da: R.da[i], ds: R.ds[i], dd: R.dd[i], al: R.al[i], pl: R.pl[i], o: R.o[i], cte: R.cte[i], sw: R.sw[i], pp: R.pp[i], e: R.e[i] };
    G._arr = arr; return G;
  };
  const opOff = s => s ? days(D.operations.lignes.base, s) : null;
  const opIso = o => addDays(D.operations.lignes.base, o);
  function opsFilter(G) {
    const pi = S.opProv === "Toutes" ? -1 : G.provinces.indexOf(S.opProv), zi = S.opZone === "Toutes" ? -1 : G.zones.indexOf(S.opZone), ci = S.opCte === "Tous" ? -1 : G.ctes.indexOf(S.opCte);
    return r => (pi < 0 || r.p === pi) && (zi < 0 || r.z === zi) && (ci < 0 || r.cte === ci);
  }
  function opsDefaults(G) {
    const last = G.sources?.derniere_notification || D.meta.cutoff;
    if (!S.opD2) S.opD2 = last;
    if (!S.opD1) S.opD1 = addDays(S.opD2, -20);
    if (S.province && S.province !== "Toutes" && S.opProv === "Toutes") S.opProv = S.province;
  }
  const inR = (o, a, b) => o !== null && o !== undefined && o >= a && o <= b;
  function opsAgg(G, rows, a, b) {
    const by = new Map(), tot = { n: 0 };
    const key = r => r.z;
    const add = (r, k, v = 1) => { const z = key(r); if (!by.has(z)) by.set(z, { z, p: r.p }); const o = by.get(z); o[k] = (o[k] || 0) + v; tot[k] = (tot[k] || 0) + v; };
    const cls = S.opCls === "cp" ? [1, 2] : [1];
    for (const r of rows) {
      // décès des cas
      if (cls.includes(r.c) && r.pl > 0 && inR(r.dd, a, b)) { add(r, "dec"); add(r, r.pl === 1 ? "dec_cte" : "dec_hors"); if (r.pl === 2) add(r, "dec_comm"); if (r.pl === 3) add(r, "dec_struct"); if (r.pl === 4) add(r, "dec_np"); }
      // alertes décès et EDS
      if ((r.al || r.pl > 0) && inR(r.dd, a, b)) { add(r, "dal"); if (r.e === 1) add(r, "eds_ok"); else if (r.e === 2) add(r, "eds_non"); else add(r, "eds_nd"); if (r.c === 1) add(r, "dal_conf"); }
      // CTE
      if (r.c === 1 && inR(r.da, a, b)) { add(r, "adm"); add(r, { G: "gueri", D: "dcd", E: "evade", T: "transf", A: "aband", C: "encours", S: "sortie_nd" }[r.o] || "issue_nd"); }
      if (r.c === 1 && inR(r.dn, a, b)) { add(r, "conf"); if (r.da === null) add(r, "non_adm"); }
      // prélèvements
      if (inR(r.dp, a, b)) { add(r, "prel"); if (r.sw) { add(r, "sw"); if (r.sw === 2) add(r, "sw_pm"); if (r.c === 1) add(r, "sw_pos"); } }
      // PPL
      if (r.pp && inR(r.dn, a, b)) { add(r, "ppl"); if (r.c === 1) { add(r, "ppl_conf"); if (r.pl > 0) add(r, "ppl_dec"); } }
    }
    const Z = [...by.values()].map(o => ({ ...o, zone_sante: G.zones[o.z] || T("Non précisée"), province: G.provinces[o.p] || "" }));
    return { Z, tot };
  }
  function opsView() {
    const O = D.operations, G = opsRows();
    if (!O || !G) return `<div class="empty">${T("Indicateurs opérationnels indisponibles : relancez l’analyse complète.")}</div>`;
    opsDefaults(G);
    if (!OPT.some(x => x[0] === S.opTab)) S.opTab = "deces";
    const provs = ["Toutes", ...G.provinces];
    if (!provs.includes(S.opProv)) S.opProv = "Toutes";
    const zs = ["Toutes", ...G.zones.filter(z => S.opProv === "Toutes" || G.zone_province[z] === S.opProv)];
    if (!zs.includes(S.opZone)) S.opZone = "Toutes";
    const ctes = ["Tous", ...G.ctes];
    if (!ctes.includes(S.opCte)) S.opCte = "Tous";
    const a = opOff(S.opD1), b = opOff(S.opD2), f = opsFilter(G);
    const rows = G._arr.filter(f);
    const { Z, tot } = opsAgg(G, rows, a, b);
    const quick = [["7", "7 j"], ["14", "14 j"], ["21", "21 j"], ["28", "28 j"], ["90", "90 j"], ["all", "Tout"]];
    const lastN = G.sources?.derniere_notification || D.meta.cutoff;
    const sel = (k, opts, lab) => `<label class="field">${T(lab)}<select data-state="${k}">${opts.map(v => `<option value="${esc(v)}" ${S[k] === v ? "selected" : ""}>${esc(T(v))}</option>`).join("")}</select></label>`;
    const head = `
    <div class="seg big-seg" data-seg="opTab" style="margin-bottom:12px">${OPT.map(([k, t]) => `<button data-v="${k}" class="${S.opTab === k ? "on" : ""}">${T(t)}</button>`).join("")}</div>
    ${S.opTab === "qualite" ? "" : `<div class="panel" style="padding:12px 16px;margin-bottom:14px"><div class="flex" style="align-items:flex-end">
      <label class="field">${T("Du")}<input type="date" data-state="opD1" value="${esc(S.opD1)}" max="${esc(lastN)}"></label>
      <label class="field">${T("au")}<input type="date" data-state="opD2" value="${esc(S.opD2)}" max="${esc(lastN)}"></label>
      <div class="seg" data-opquick>${quick.map(([v, t]) => `<button type="button" data-opq="${v}">${T(t)}</button>`).join("")}</div>
      ${sel("opProv", provs, "Province")}${sel("opZone", zs, "Zone de santé")}${["deces", "cte"].includes(S.opTab) ? sel("opCte", ctes, "CTE") : ""}
      ${S.opTab === "deces" ? `<div class="field"><span>${T("Cas")}</span><div class="seg" data-seg="opCls"><button data-v="c" class="${S.opCls !== "cp" ? "on" : ""}">${T("Confirmés")}</button><button data-v="cp" class="${S.opCls === "cp" ? "on" : ""}">${T("Confirmés + probables")}</button></div></div>` : ""}
    </div><div class="small muted" style="margin-top:6px">${T("Période")} : ${dfmt(S.opD1)} → ${dfmt(S.opD2)} (${nf(days(S.opD1, S.opD2) + 1)} ${T("jours")}) · ${S.opProv === "Toutes" ? T("toutes les provinces") : esc(S.opProv)}${S.opZone !== "Toutes" ? " · " + esc(S.opZone) : ""}${S.opCte !== "Tous" && ["deces", "cte"].includes(S.opTab) ? " · " + esc(S.opCte) : ""}</div></div>`}`;
    const src = G.sources || {};
    const stale = src.derniere_sortie_lln && S.opD2 > src.derniere_sortie_lln;
    const staleNote = stale && ["deces", "cte"].includes(S.opTab) ? `<div class="notice warn"><b>${T("Données du CTE incomplètes après le")} ${dfmt(src.derniere_sortie_lln)}</b> : ${T("les issues au CTE (guérison, décès au CTE) et le lieu du décès viennent de l’export lln, dont la dernière sortie saisie date du")} ${dfmt(src.derniere_sortie_lln)}. ${T("Déposez un export lln récent dans « Charger les données » pour compléter les décès au CTE ; les décès à l’alerte (hors CTE) sont à jour jusqu’au")} ${dfmt(src.derniere_notification)}.</div>` : "";
    const col2 = (k, t, o = {}) => ({ k, t, num: true, ...o });
    const zt = (cols, sortK) => table("op-z-" + S.opTab, Z.filter(z => cols.some(c => z[c.k])), [{ k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" }, ...cols], { sort: sortK, maxh: 520 });
    const pcs = (x, y) => pc(y ? 100 * x / y : null, 1);
    let body = "";
    if (S.opTab === "deces") {
      const t = tot, dec = t.dec || 0;
      const cteRows = (() => { const m = new Map(); const cls = S.opCls === "cp" ? [1, 2] : [1]; rows.forEach(r => { if (cls.includes(r.c) && r.pl === 1 && inR(r.dd, a, b)) { const k = r.cte >= 0 ? G.ctes[r.cte] : T("Nom du CTE non saisi"); m.set(k, (m.get(k) || 0) + 1); } }); return [...m].map(([k, v]) => ({ cte: k, n: v })); })();
      body = `
      ${staleNote}
      <div class="grid g4">
        ${kpi("Décès (cas " + (S.opCls === "cp" ? "confirmés + probables" : "confirmés") + ")", nf(dec), `${dfmt(S.opD1)} → ${dfmt(S.opD2)}`, { color: "--ink-2" })}
        ${kpi("Décès au CTE", nf(t.dec_cte || 0), `${pcs(t.dec_cte || 0, dec)} ${T("des décès")}`, { color: "--s1" })}
        ${kpi("Décès hors CTE", nf(t.dec_hors || 0), `${pcs(t.dec_hors || 0, dec)} ${T("des décès")} · ${nf(t.dec_comm || 0)} ${T("dans la communauté")}`, { color: "--critical" })}
        ${kpi("Hors CTE : autre structure / lieu non précisé", `${nf(t.dec_struct || 0)} / ${nf(t.dec_np || 0)}`, T("décès en structure de santé hors CTE / lieu non saisi"), { color: "--warn" })}
      </div>
      <div class="notice small"><b>${T("Définitions")} :</b> ${esc(T(G.definitions.deces_cte))} ${esc(T(G.definitions.deces_hors_cte))}</div>
      ${panel("Décès au CTE et hors CTE par jour", T("Date du décès ; barres empilées"), `<div id="c-op-dec"></div>`, { png: "deces_cte_hors_cte" })}
      <div class="grid g21">
        ${panel("Par zone de santé", T("Zone de notification ; tri par colonne ; export CSV"), zt([col2("dec", "Décès"), col2("dec_cte", "Au CTE"), col2("dec_hors", "Hors CTE"), col2("dec_comm", "dont communauté"), col2("dec_struct", "dont autre structure"), col2("dec_np", "dont lieu non précisé"), { k: "pcte", t: "% au CTE", v: x => pcs(x.dec_cte || 0, x.dec || 0), sortv: x => x.dec ? (x.dec_cte || 0) / x.dec : null }], "dec"), { csv: "op-z-deces" })}
        ${panel("Décès au CTE par CTE", T("Nom du CTE normalisé (fautes de frappe corrigées)"), table("op-cte-dec", cteRows, [{ k: "cte", t: "CTE" }, { k: "n", t: "Décès", num: true }], { search: false, sort: "n" }), { csv: "op-cte-dec" })}
      </div>
      ${opsSitrepPanel(G)}`;
    } else if (S.opTab === "eds") {
      const t = tot, doc = (t.eds_ok || 0) + (t.eds_non || 0);
      body = `
      <div class="grid g4">
        ${kpi("Alertes décès", nf(t.dal || 0), `${nf(t.dal_conf || 0)} ${T("cas confirmés")}`, { color: "--ink-2" })}
        ${kpi("EDS réalisés", nf(t.eds_ok || 0), T("funérailles par l’équipe d’enterrement"), { color: "--good" })}
        ${kpi("EDS non réalisés", nf(t.eds_non || 0), `${pcs(t.eds_non || 0, doc)} ${T("des funérailles documentées")}`, { color: "--critical" })}
        ${kpi("Funérailles non documentées", nf(t.eds_nd || 0), `${pcs(t.eds_nd || 0, t.dal || 0)} ${T("des décès : à compléter dans le lln")}`, { color: "--warn" })}
      </div>
      <div class="notice small"><b>${T("Définition")} :</b> ${esc(T(O.definitions.eds))}</div>
      ${panel("Par zone de santé", T("Date du décès ; zone de notification"), zt([col2("dal", "Alertes décès"), col2("dal_conf", "Décès confirmés"), col2("eds_ok", "EDS réalisés"), col2("eds_non", "EDS non réalisés"), col2("eds_nd", "Non documentés"), { k: "pnr", t: "% non réalisés", v: x => pcs(x.eds_non || 0, (x.eds_ok || 0) + (x.eds_non || 0)), sortv: x => (x.eds_ok || 0) + (x.eds_non || 0) ? (x.eds_non || 0) / ((x.eds_ok || 0) + (x.eds_non || 0)) : null }], "dal"), { csv: "op-z-eds" })}
      ${opsEdsSitrep(O)}`;
    } else if (S.opTab === "cte") {
      const t = tot;
      const cteRows = (() => { const m = new Map(); rows.forEach(r => { if (r.c === 1 && inR(r.da, a, b)) { const k = r.cte >= 0 ? G.ctes[r.cte] : T("Nom du CTE non saisi"); const o = m.get(k) || { cte: k, adm: 0, gueri: 0, dcd: 0, evade: 0, encours: 0 }; o.adm++; if (r.o === "G") o.gueri++; if (r.o === "D") o.dcd++; if (r.o === "E") o.evade++; if (r.o === "C") o.encours++; m.set(k, o); } }); return [...m.values()]; })();
      body = `
      ${staleNote}
      <div class="grid g4">
        ${kpi("Confirmés admis en CTE", nf(t.adm || 0), `${T("date d’admission dans la période")}`, { color: "--s1" })}
        ${kpi("Issues : guéris / décédés", `${nf(t.gueri || 0)} / ${nf(t.dcd || 0)}`, `${T("létalité au CTE")} ${pcs(t.dcd || 0, (t.gueri || 0) + (t.dcd || 0))} · ${nf(t.evade || 0)} ${T("évadés")}`, { color: "--good" })}
        ${kpi("Encore hospitalisés", nf(t.encours || 0), `${nf((t.sortie_nd || 0) + (t.issue_nd || 0))} ${T("sorties sans issue saisie")}`, { color: "--s3" })}
        ${kpi("Confirmés sans admission", nf(t.non_adm || 0), `${pcs(t.non_adm || 0, t.conf || 0)} ${T("des confirmés notifiés dans la période")}`, { color: "--warn" })}
      </div>
      <div class="notice small"><b>${T("Définition")} :</b> ${esc(T(O.definitions.cte))} ${esc(T(G.definitions.cte))}</div>
      <div class="grid g21">
        ${panel("Par zone de santé", T("Zone de notification ; admissions dans la période"), zt([col2("conf", "Confirmés notifiés"), col2("adm", "Admis au CTE"), col2("gueri", "Guéris"), col2("dcd", "Décédés"), col2("evade", "Évadés"), col2("encours", "En cours"), col2("non_adm", "Sans admission")], "adm"), { csv: "op-z-cte" })}
        ${panel("Par CTE", T("Nom du CTE normalisé ; « Nom du CTE non saisi » : admission sans nom de CTE dans la Linelist ni le lln ; « CTE (lieu non précisé) » : saisi « CTE » sans lieu"), table("op-cte", cteRows, [{ k: "cte", t: "CTE" }, { k: "adm", t: "Admis", num: true }, { k: "gueri", t: "Guéris", num: true }, { k: "dcd", t: "Décédés", num: true }, { k: "evade", t: "Évadés", num: true }, { k: "encours", t: "En cours", num: true }], { search: false, sort: "adm" }), { csv: "op-cte" })}
      </div>`;
    } else if (S.opTab === "swabs") {
      const t = tot;
      body = `
      <div class="grid g4">
        ${kpi("Prélèvements", nf(t.prel || 0), T("date du prélèvement dans la période"), { color: "--ink-2" })}
        ${kpi("Swabs (écouvillons)", nf(t.sw || 0), `${pcs(t.sw || 0, t.prel || 0)} ${T("des prélèvements")}`, { color: "--s7" })}
        ${kpi("Swabs post-mortem", nf(t.sw_pm || 0), `${pcs(t.sw_pm || 0, t.sw || 0)} ${T("des swabs")}`, { color: "--ink-2" })}
        ${kpi("Swabs positifs", nf(t.sw_pos || 0), `${T("positivité")} ${pcs(t.sw_pos || 0, t.sw || 0)}`, { color: "--critical" })}
      </div>
      <div class="notice small"><b>${T("Définition")} :</b> ${esc(T(O.definitions.swabs))}</div>
      ${panel("Par zone de santé", T("Date du prélèvement ; zone de notification"), zt([col2("prel", "Prélèvements"), col2("sw", "Swabs"), col2("sw_pm", "Post-mortem"), col2("sw_pos", "Positifs"), { k: "psw", t: "Positivité", v: x => pcs(x.sw_pos || 0, x.sw || 0), sortv: x => x.sw ? (x.sw_pos || 0) / x.sw : null }], "sw"), { csv: "op-z-swabs" })}`;
    } else if (S.opTab === "ppl") {
      const t = tot;
      body = `
      <div class="grid g4">
        ${kpi("Alertes parmi le personnel", nf(t.ppl || 0), T("date de notification dans la période"), { color: "--ink-2" })}
        ${kpi("PPL confirmés", nf(t.ppl_conf || 0), `${pcs(t.ppl_conf || 0, t.conf || 0)} ${T("des confirmés")}`, { color: "--critical" })}
        ${kpi("PPL décédés", nf(t.ppl_dec || 0), `${T("létalité")} ${pcs(t.ppl_dec || 0, t.ppl_conf || 0)}`, { color: "--ink-2" })}
        ${kpi("Positivité parmi le personnel", pcs(t.ppl_conf || 0, t.ppl || 0), T("confirmés / alertes"), { color: "--s1" })}
      </div>
      <div class="notice small"><b>${T("Définition")} :</b> ${esc(T(O.definitions.ppl))}</div>
      ${panel("Par zone de santé", T("Date de notification ; zone de notification"), zt([col2("ppl", "Alertes PPL"), col2("ppl_conf", "PPL confirmés"), col2("ppl_dec", "PPL décédés")], "ppl_conf"), { csv: "op-z-ppl" })}`;
    } else {
      body = opsQualite(O, G);
    }
    return head + body;
  }
  function opsSitrepPanel(G) {
    const sr = D.operations?.sitrep_zones; if (!sr || !sr.zones?.length) return "";
    const cls = S.opCls === "cp" ? [1, 2] : [1];
    const cum = new Map(); G._arr.forEach(r => { if (cls.includes(r.c) && r.pl > 0) { const z = G.zones[r.z]; cum.set(opNk(z), (cum.get(opNk(z)) || 0) + 1); } });
    const rows = sr.zones.filter(z => !z.a_ventiler && (S.opProv === "Toutes" || opNk(z.province) === opNk(S.opProv))).map(z => ({ zone_sante: z.zone_sante, province: z.province, sitrep: z.deces, outil: cum.get(opNk(z.zone_sante)) || 0, comm24: z.deces_communautaires_24h, cte24: z.deces_cte_24h }));
    rows.forEach(r => { r.ecart = r.outil - (r.sitrep || 0); });
    const pr = (sr.provinces || []).filter(p => S.opProv === "Toutes" || opNk(p.province) === opNk(S.opProv));
    return `<div class="grid g12">
      ${panel(`SitRep ${esc(String(sr.numero || ""))} : ${T("décès des dernières 24 h")}`, `${T("Officiel, rapport du")} ${dfmt(sr.date)} ${T("(décès communautaires = swabs positifs ; intra-CTE = confirmés décédés au CTE)")}`, table("op-sr-dec", pr, [{ k: "province", t: "Province" }, { k: "deces_communautaires_24h", t: "Communautaires", num: true }, { k: "deces_cte_24h", t: "Intra-CTE", num: true }, { k: "deces_24h", t: "Total 24 h", num: true }, { k: "deces", t: "Cumul décès", num: true }], { search: false, sort: null }))}
      ${panel("Contrôle : décès cumulés par zone, SitRep et outil", T("Tous les décès depuis le début (sans filtre de dates) ; un écart signale une saisie manquante ou en retard dans la Linelist ou le lln"), table("op-sr-z", rows, [{ k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" }, { k: "sitrep", t: "SitRep", num: true }, { k: "outil", t: "Outil", num: true }, { k: "ecart", t: "Écart", num: true, v: x => `<b style="color:${col(Math.abs(x.ecart) > Math.max(5, .1 * (x.sitrep || 0)) ? "--critical" : "--muted")}">${x.ecart > 0 ? "+" : ""}${nf(x.ecart)}</b>`, sortv: x => Math.abs(x.ecart) }, { k: "cte24", t: "Intra-CTE 24 h", num: true }], { sort: "sitrep", maxh: 420 }), { csv: "op-sr-z" })}
    </div>`;
  }
  function opsEdsSitrep(O) {
    const sr = O.sitrep_24h; if (!sr) return "";
    const rows = (sr.provinces || []).filter(x => x.eds_attendus_24h !== undefined);
    if (!rows.length) return "";
    return panel(`SitRep N° ${esc(String(sr.numero || ""))} : EDS des dernières 24 h`, `${T("Lu dans le pilier PCI/EDS du SitRep du")} ${dfmt(sr.date)}`, table("op-sr", rows, [
      { k: "province", t: "Province" }, { k: "eds_attendus_24h", t: "EDS attendus", num: true }, { k: "eds_realises_24h", t: "EDS réalisés", num: true }, { k: "eds_non_realises_24h", t: "EDS non réalisés", num: true },
      { k: "pct", t: "% réalisés", v: x => pc(x.eds_attendus_24h ? 100 * x.eds_realises_24h / x.eds_attendus_24h : null, 1) }, { k: "corps_swabes_24h", t: "Corps swabés", num: true }, { k: "eds_echecs_24h", t: "Échecs", num: true }], { search: false, sort: null }));
  }
  function opsQualite(O, G) {
    const C = O.controle_excel || [], Q = G.incoherences || [], K = G.corrections || [], s = G.sources || {};
    const champs = ["Tous", ...new Set(K.map(x => x.champ))];
    if (!champs.includes(S.opChamp)) S.opChamp = "Tous";
    return `
    <div class="notice"><b>${T("Fraîcheur des données")} :</b> ${T("dernière notification")} ${dfmt(s.derniere_notification)} ; ${T("dernière admission saisie dans la Linelist")} ${dfmt(s.derniere_admission_linelist)} ; ${T("export lln : dernière admission")} ${dfmt(s.derniere_admission_lln)}, ${T("dernière sortie")} ${dfmt(s.derniere_sortie_lln)}.</div>
    ${panel("Contrôle avec les fichiers de base", T("Recompte direct dans les fichiers Excel / CSV déposés, sans traitement de l’outil ; chaque écart est expliqué"), table("op-ctl", C, [{ k: "indicateur", t: "Indicateur", wrap: true }, { k: "fichier", t: "Fichier" }, { k: "excel", t: "Fichier de base", num: true }, { k: "outil", t: "Outil", num: true },
      { k: "ecart", t: "Écart", num: true, v: x => x.ecart === null || x.ecart === undefined ? "—" : `<b style="color:${col(x.ecart === 0 ? "--good" : Math.abs(x.ecart) <= Math.max(20, .01 * (x.excel || 0)) ? "--warn" : "--critical")}">${x.ecart > 0 ? "+" : ""}${nf(x.ecart)}</b>` }, { k: "explication", t: "Explication", wrap: true }], { search: false, sort: null }), { csv: "op-ctl" })}
    ${panel("Incohérences de saisie à corriger", T("Nombre de lignes concernées et exemples d’identifiants (pseudonymisés) ; à transmettre aux équipes de saisie"), table("op-inc", Q, [{ k: "controle", t: "Contrôle", wrap: true }, { k: "lignes", t: "Lignes", num: true }, { k: "confirmes", t: "Dont confirmés", num: true }, { k: "exemples", t: "Exemples", wrap: true, v: x => `<span class="small">${esc((x.exemples || []).join(", "))}</span>`, csv: x => (x.exemples || []).join(" ") }], { search: false, sort: "lignes" }), { csv: "op-inc" })}
    ${panel("Valeurs corrigées automatiquement", T("Fautes de frappe et variantes d’écriture : valeur saisie → valeur retenue par l’outil"), `<div class="flex" style="margin-bottom:8px"><label class="field">${T("Champ")}<select data-state="opChamp">${champs.map(c => `<option value="${esc(c)}" ${S.opChamp === c ? "selected" : ""}>${esc(T(c))}</option>`).join("")}</select></label></div>` +
      table("op-corr", K.filter(x => S.opChamp === "Tous" || x.champ === S.opChamp), [{ k: "champ", t: "Champ" }, { k: "saisi", t: "Valeur saisie" }, { k: "retenu", t: "Valeur retenue" }, { k: "lignes", t: "Lignes", num: true }], { sort: "lignes", maxh: 460 }), { csv: "op-corr" })}`;
  }
  function opsCharts() {
    if (S.opTab !== "deces" || !$("#c-op-dec")) return;
    const G = opsRows(); if (!G) return;
    const a = opOff(S.opD1), b = opOff(S.opD2), f = opsFilter(G), cls = S.opCls === "cp" ? [1, 2] : [1];
    const n = b - a + 1, weekly = n > 120;
    const bins = new Map();
    const keyOf = o => { if (!weekly) return opIso(o); const d = new Date(opIso(o) + "T00:00:00Z"); const wd = (d.getUTCDay() + 6) % 7; return addDays(opIso(o), -wd); };
    for (let o = a; o <= b; o++) { const k = keyOf(o); if (!bins.has(k)) bins.set(k, { date: k, cte: 0, hors: 0 }); }
    G._arr.forEach(r => { if (f(r) && cls.includes(r.c) && r.pl > 0 && inR(r.dd, a, b)) { const x = bins.get(keyOf(r.dd)); if (x) { if (r.pl === 1) x.cte++; else x.hors++; } } });
    const data = [...bins.values()];
    const xl = (v, r, tip) => tip ? (weekly ? T("semaine du") + " " + dfmt(v) : dfmt(v)) : dshort(v);
    Ch.xy($("#c-op-dec"), { data, x: "date", height: 260, xLabel: xl, noClip: true, stacked: true, barWidth: .85,
      series: [{ key: "cte", label: T("Décès au CTE"), color: "--s1", type: "bar" }, { key: "hors", label: T("Décès hors CTE"), color: "--critical", type: "bar" }] });
  }

  /* ---------------- Personnel de santé (PPL) ---------------- */
  const SIT_BASE = () => isPublic ? "situation/" : "../reports/situation/";
  const dlBtn = (f, lab, primary) => f ? `<a class="btn ${primary ? "primary" : ""} sm" href="${SIT_BASE()}${encodeURIComponent(f)}" download="${esc(f)}">⤓ ${T(lab)}</a>` : "";
  function pplView() {
    const P = D.ppl; if (!P || !P.totaux) return `<div class="empty">${PER ? T("Disponible pour la situation complète : choisissez « Tout » dans la période d’analyse.") : T("Analyse des PPL indisponible : relancez l’analyse complète.")}</div>`;
    const provs = ["Toutes", ...P.provinces.map(p => p.province)];
    if (!provs.includes(S.pplProv)) S.pplProv = "Toutes";
    const all = S.pplProv === "Toutes", t = all ? P.totaux : P.provinces.find(p => p.province === S.pplProv) || {};
    const zs = P.zones.filter(z => all || z.province === S.pplProv), ar = P.aires.filter(a => all || a.province === S.pplProv);
    const sr = P.sitrep, srN = sr ? (all ? sr.total : Object.entries(sr.provinces || {}).find(([k]) => norm(k) === norm(S.pplProv))?.[1]) : null;
    const ex = all ? P.exposition : Object.values(P.exposition_province.filter(r => r.province === S.pplProv).reduce((o, r) => { o[r.lieu] = { lieu: r.lieu, infectes: r.infectes }; return o; }, {}));
    const fx = all ? P.fonctions : Object.values(P.fonctions_province.filter(r => r.province === S.pplProv).reduce((o, r) => { o[r.fonction] = { categorie: r.fonction, alertes: r.alertes, confirmes: r.confirmes, deces: r.deces }; return o; }, {}));
    const F = D.situation?.fichiers || {}, ctx = P.contexte || {};
    const liste = (P.liste_cas || []).filter(r => all || r.province === S.pplProv);
    const mcols = [{ k: "alertes", t: "Alertes PPL", num: true }, { k: "preleves", t: "Prélevés", num: true }, { k: "swabs", t: "Swabs", num: true },
      { k: "confirmes", t: "Confirmés", num: true }, { k: "probables", t: "Probables", num: true }, { k: "non_cas", t: "Non-cas", num: true }, { k: "en_attente", t: "En attente", num: true },
      { k: "deces", t: "Décès", num: true }, { k: "deces_confirmes", t: "Décès confirmés", num: true }, { k: "confirmes_21j", t: "Confirmés 21 j", num: true },
      { k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct), sortv: x => x.positivite_pct }, { k: "letalite_pct", t: "Létalité", v: x => pc(x.letalite_pct), sortv: x => x.letalite_pct },
      { k: "pct_parmi_confirmes", t: "% des confirmés", v: x => pc(x.pct_parmi_confirmes), sortv: x => x.pct_parmi_confirmes }];
    return `
    <div class="flex" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
      <label class="field">${T("Province")}<select data-state="pplProv">${provs.map(p => `<option value="${esc(p)}" ${S.pplProv === p ? "selected" : ""}>${esc(T(p))}</option>`).join("")}</select></label>
      <div class="flex" style="gap:8px;align-items:flex-end">${dlBtn(F.ppl_docx, "Analyse détaillée des PPL (Word)", true)}${dlBtn(F.ppl_xlsx, "Tableaux et liste (Excel)")}</div>
    </div>
    <div class="grid g4">
      ${kpi("PPL infectés", nf(t.infectes), `${nf(t.confirmes)} ${T("confirmés")} · ${nf(t.probables)} ${T("probables")} · ${pc(t.pct_parmi_confirmes)} ${T("des confirmés")}${srN !== undefined && srN !== null ? ` · SitRep : ${nf(srN)}` : ""}`, { color: "--critical" })}
      ${kpi("PPL décédés", nf(t.deces), `${nf(t.deces_confirmes)} ${T("confirmés")} · ${T("létalité")} ${pc(t.letalite_pct)}`, { color: "--ink-2" })}
      ${kpi("Prélevés / swabés", `${nf(t.preleves)} / ${nf(t.swabs)}`, `${T("positivité")} ${pc(t.positivite_pct)} · ${nf(t.swabs_post_mortem)} ${T("swabs post-mortem")}`, { color: "--s7" })}
      ${kpi("Infections récentes", `${nf(t.confirmes_7j)} / ${nf(t.confirmes_21j)}`, T("PPL confirmés 7 j / 21 j"), { color: "--s4" })}
    </div>
    <div class="notice small"><b>${T("Définition")} :</b> ${esc(T(P.definition))} ${nf(t.alertes)} ${T("lignes « personnel de santé »")} (${nf(P.positions_distinctes)} ${T("valeurs différentes saisies")} ; ${nf(t.doublons)} ${T("doublons probables")}).${sr ? ` ${T("Le SitRep")} n° ${esc(String(sr.numero))} ${T("rapporte")} ${nf(sr.total)} ${T("PPL touchés : l’écart vient des PPL non encore saisis ou non identifiés dans la Linelist.")}` : ""}</div>
    <div class="grid g21">
      ${panel("PPL infectés par semaine", T("Confirmés et probables, semaine de début des signes (sinon de notification), par province"), `<div id="c-ppl-wk"></div>`, { png: "ppl_hebdo" })}
      ${panel("Zones de santé ayant le plus de PPL infectés", all ? T("Toutes les provinces") : esc(S.pplProv), hbars(zs.map(z => ({ ...z, lab: `${z.zone_sante}${all ? " (" + z.province + ")" : ""}` })), "lab", "infectes", { limit: 12, color: "--critical" }))}
    </div>
    ${panel(all ? "Par province" : `Zones de santé, ${esc(S.pplProv)}`, T("Alertes, prélèvements, classification, décès ; tri par colonne"),
      table("ppl-niv", all ? P.provinces : zs, [all ? { k: "province", t: "Province" } : { k: "zone_sante", t: "Zone de santé" }, ...mcols], { sort: "confirmes", search: !all, maxh: 460 }), { csv: "ppl-niv" })}
    ${all ? panel("Par zone de santé", T("Toutes les zones ayant au moins une alerte chez un PPL"), table("ppl-zs", zs, [{ k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" }, ...mcols], { sort: "confirmes", maxh: 460 }), { csv: "ppl-zs" }) : ""}
    <div class="grid g2">
      ${panel("Fonctions des PPL", T("Valeur saisie dans « S1 - Personnel santé - position », regroupée par fonction"), hbars(fx, "categorie", "confirmes", { limit: 14, color: "--s4" }) + table("ppl-fx", fx, [{ k: "categorie", t: "Fonction" }, { k: "alertes", t: "Alertes", num: true }, { k: "confirmes", t: "Confirmés", num: true }, { k: "deces", t: "Décès", num: true }, ...(all ? [{ k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct), sortv: x => x.positivite_pct }] : [])], { sort: "confirmes", search: false, maxh: 300 }), { csv: "ppl-fx" })}
      ${panel("Lieux d'exposition des PPL infectés", T("Fiche de contact (lieu déclaré), funérailles, ou contact avec un cas connu"), hbars(ex, "lieu", "infectes", { limit: 8, color: "--s1" }) + `<div class="notice small">${all ? `${T("Exposition documentée pour")} ${nf(ctx.exposition_documentee)} ${T("PPL infectés sur")} ${nf(ctx.infectes)} (${pc(ctx.pct_exposition_documentee)}) ; ${nf(ctx.connus_comme_contacts)} ${T("étaient suivis comme contacts avant leur notification.")} ` : ""}${T("Un PPL sans exposition communautaire documentée doit faire l’objet d’une investigation d’infection nosocomiale (structure, service, port des EPI, triage).")}</div>`
        + (all ? `<h3 style="margin:14px 0 6px;font-size:13px">${T("Lieu de détection (source de l’alerte)")}</h3>` + hbars(P.detection, "source", "infectes", { limit: 8, color: "--s3" }) : ""))}
    </div>
    ${panel("Aires de santé les plus touchées", T("PPL infectés (confirmés + probables)"), table("ppl-as", ar, [{ k: "aire_sante", t: "Aire de santé" }, { k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" }, { k: "infectes", t: "PPL infectés", num: true }, { k: "confirmes", t: "Confirmés", num: true }, { k: "deces", t: "Décès", num: true }], { sort: "infectes", maxh: 360 }), { csv: "ppl-as" })}
    ${liste.length ? panel("PPL infectés (liste pseudonymisée)", T("Identifiant et initiales uniquement"), table("ppl-list", liste, [{ k: "id", t: "Identifiant" }, { k: "ini", t: "Initiales" }, { k: "province", t: "Province" }, { k: "zone", t: "Zone" }, { k: "aire", t: "Aire" },
      { k: "fonction", t: "Fonction" }, { k: "structure", t: "Structure mentionnée" }, { k: "cls", t: "Classification" }, { k: "date", t: "Notification", v: x => dfmt(x.date), sortv: x => x.date }, { k: "dds", t: "Début des signes", v: x => dfmt(x.dds), sortv: x => x.dds },
      { k: "dc", t: "Décédé", v: x => x.dc ? badge("Oui", "b-crit") : "", sortv: x => x.dc ? 1 : 0 }, { k: "expo", t: "Lieu d’exposition", wrap: true }, { k: "src", t: "Source de l’alerte" }], { sort: "date", maxh: 480 }), { csv: "ppl-list" }) : ""}
    <details class="panel" style="padding:14px 18px"><summary><b>${T("Valeurs saisies dans la colonne et fonction retenue")}</b> (${nf(P.positions_distinctes)})</summary>
      ${table("ppl-pos", P.positions_saisies, [{ k: "position", t: "Valeur saisie" }, { k: "lignes", t: "Lignes", num: true }, { k: "fonction", t: "Fonction retenue" }], { sort: "lignes", maxh: 380 })}</details>`;
  }
  function pplCharts() {
    const P = D.ppl, el = $("#c-ppl-wk"); if (!P || !el) return;
    const H = P.hebdo || { provinces: [], rows: [] }, all = S.pplProv === "Toutes";
    const provs = all ? H.provinces : H.provinces.filter(p => p === S.pplProv);
    const pal = ["--s1", "--critical", "--s4", "--s3", "--s5", "--s7", "--s2", "--s6"];
    const data = H.rows.map(r => { const o = { week: r[0] }; H.provinces.forEach((p, i) => o[p] = r[1 + i]); return o; });
    Ch.xy(el, { data, x: "week", stacked: true, height: 260, xLabel: wkLab, xTitle: T("Semaine"), series: provs.map((p, i) => ({ key: p, label: p, color: pal[i % pal.length] })) });
  }

  /* ---------------- Situation épidémiologique par province ---------------- */
  function sitTexte(nom, N, Sx) {
    const a = N.alertes, c = N.contacts, p = N.ppl, hr = N.haut_risque || [];
    const l = [`Situation épidémiologique, ${nom}, au ${dfmt(Sx.date)}`,
      `• Alertes : ${nf(a.jour.recues)} reçues le ${dfmt(Sx.jour || Sx.date)}, ${nf(a.sept_jours.recues)} sur 7 jours (${nf(a.cumul.recues)} au total) ; ${pc(a.sept_jours.pct_investiguees)} investiguées sur 7 jours (${pc(a.sept_jours.pct_investiguees_24h)} dans les 24 h) ; ${nf(a.sept_jours.validees)} validées (${pc(a.sept_jours.pct_validees)}).`,
      `• Suivi des contacts : ${nf(c.actifs)} contacts en cours de suivi ; taux de suivi ${pc(c.pct_vus_24h)} (vus ≤ 24 h, Linelist)${c.sitrep_pct_suivi !== null && c.sitrep_pct_suivi !== undefined ? `, ${pc(c.sitrep_pct_suivi)} selon le SitRep` : ""}.`,
      `• Contacts devenus suspects : ${nf(c.devenus_suspects)} (${pc(c.pct_devenus_suspects)} des contacts listés) ; ${nf(c.devenus_suspects_21j)} ces 21 derniers jours (${pc(c.pct_devenus_suspects_21j)}) ; ${nf(c.devenus_cas)} contacts devenus cas confirmés.`,
      `• PPL infectés : ${nf(p.infectes)} (${nf(p.confirmes)} confirmés, ${nf(p.probables)} probables)${N.ppl_sitrep !== null && N.ppl_sitrep !== undefined ? ` : SitRep : ${nf(N.ppl_sitrep)}` : ""} ; ${nf(p.confirmes_21j)} ces 21 derniers jours ; ${nf(p.deces)} décès.`,
      `• Zones de santé avec le plus de PPL infectés : ${(N.zones_ppl || []).slice(0, 5).map(z => `${z.zone_sante} (${z.infectes})`).join(", ") || "aucune"}.`,
      `• Lieux d’exposition des PPL infectés : ${(N.exposition_ppl || []).map(r => `${r.lieu} (${r.infectes})`).join(", ") || "—"}.`,
      `• Lieux d’exposition de plus haut risque : ${hr.map(r => `${r.categorie} (${pc(r.taux_cas_pct)} des contacts devenus cas, ${nf(r.devenus_cas)}/${nf(r.contacts)})`).join(" ; ") || "—"}.`];
    if (N.pci?.actions) l.push(`• Actions PCI (SitRep n° ${Sx.sitrep?.numero} du ${dfmt(Sx.sitrep?.date)}) : ${N.pci.actions}`);
    return l.join("\n");
  }
  function sitView() {
    const Sx = D.situation; if (!Sx || !Sx.national) return `<div class="empty">${PER ? T("Disponible pour la situation complète : choisissez « Tout » dans la période d’analyse.") : T("Situation par province indisponible : relancez l’analyse complète.")}</div>`;
    const opts = [["national", "National (RDC)"], ...Sx.provinces.map(p => [p.code, p.province])];
    if (!opts.some(o => o[0] === S.sitNiv)) S.sitNiv = "national";
    const nat = S.sitNiv === "national", N = nat ? Sx.national : Sx.provinces.find(p => p.code === S.sitNiv), nom = nat ? "National (RDC)" : `Province : ${N.province}`;
    const a = N.alertes, c = N.contacts, p = N.ppl, F = Sx.fichiers || {}, sr = Sx.sitrep || {};
    const exL = (N.exposition_contacts || []).filter(r => r.dimension === "Lieu d'exposition"), exT = (N.exposition_contacts || []).filter(r => r.dimension !== "Lieu d'exposition");
    const hr0 = (N.haut_risque || [])[0];
    const exCols = [{ k: "categorie", t: "Catégorie" }, { k: "contacts", t: "Contacts", num: true }, { k: "devenus_suspects", t: "Devenus suspects", num: true }, { k: "devenus_cas", t: "Devenus cas", num: true },
      { k: "taux_suspects_pct", t: "% suspects", v: x => pc(x.taux_suspects_pct), sortv: x => x.taux_suspects_pct },
      { k: "taux_cas_pct", t: "% devenus cas (IC 95 %)", v: x => `<b>${pc(x.taux_cas_pct)}</b> <span class="muted">${x.ic95 && x.ic95[0] !== null ? `(${nf(x.ic95[0], 1)}–${nf(x.ic95[1], 1)})` : ""}</span>`, sortv: x => x.taux_cas_pct, csv: x => x.taux_cas_pct }];
    const comp = nat ? panel("Comparaison des provinces", T("Indicateurs clés de la fiche, une ligne par province"), table("sit-comp", Sx.provinces.map(x => ({ province: x.province, code: x.code,
      al7: x.alertes.sept_jours.recues, inv: x.alertes.sept_jours.pct_investiguees_24h, val: x.alertes.sept_jours.validees, act: x.contacts.actifs, suiv: x.contacts.pct_vus_24h, srs: x.contacts.sitrep_pct_suivi,
      dsus: x.contacts.devenus_suspects, pdsus: x.contacts.pct_devenus_suspects, ppl: x.ppl.infectes, ppl21: x.ppl.confirmes_21j, hr: (x.haut_risque || [])[0]?.categorie })),
      [{ k: "province", t: "Province", v: x => `<a href="#" data-sitniv="${esc(x.code)}">${esc(x.province)}</a>`, sortv: x => x.province, csv: x => x.province }, { k: "al7", t: "Alertes 7 j", num: true }, { k: "inv", t: "Investiguées ≤ 24 h", v: x => pc(x.inv), sortv: x => x.inv },
        { k: "val", t: "Validées 7 j", num: true }, { k: "act", t: "Contacts suivis", num: true }, { k: "suiv", t: "Suivi ≤ 24 h", v: x => pc(x.suiv), sortv: x => x.suiv }, { k: "srs", t: "Suivi (SitRep)", v: x => pc(x.srs), sortv: x => x.srs },
        { k: "dsus", t: "Devenus suspects", num: true }, { k: "pdsus", t: "% devenus suspects", v: x => pc(x.pdsus), sortv: x => x.pdsus }, { k: "ppl", t: "PPL infectés", num: true }, { k: "ppl21", t: "PPL conf. 21 j", num: true }, { k: "hr", t: "Lieu le plus à risque" }],
      { sort: "al7", search: false }), { csv: "sit-comp" }) : "";
    const pci = nat ? Sx.provinces.filter(x => x.pci?.actions).map(x => `<p><b>${esc(x.province)} :</b> ${esc(x.pci.actions)}</p>`).join("") + (sr.pci_defis ? `<p><b>${T("Défis")} :</b> ${esc(sr.pci_defis)}</p>` : "")
      : N.pci?.actions ? `<p>${esc(N.pci.actions)}</p>` : `<div class="empty">${T("Aucune action PCI mentionnée pour cette province dans le dernier SitRep déposé.")}</div>`;
    const eds = N.pci || {};
    return `
    <div class="flex" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
      <label class="field">${T("Niveau")}<select data-state="sitNiv">${opts.map(([k, l]) => `<option value="${esc(k)}" ${S.sitNiv === k ? "selected" : ""}>${esc(T(l))}</option>`).join("")}</select></label>
      <div class="flex" style="gap:8px;align-items:flex-end">${dlBtn(nat ? F.situation_docx : N.fichier, nat ? "Fiches national + provinces (Word)" : "Fiche de la province (Word)", true)}${dlBtn(F.situation_xlsx, "Tableaux (Excel)")}${nat ? "" : dlBtn(F.situation_docx, "Toutes les fiches (Word)")}</div>
    </div>
    <div class="notice small">${T("Situation au")} <b>${dfmt(Sx.date)}</b> : Linelist et suivi des contacts${sr.numero ? ` ; actions PCI et taux de suivi officiels : SitRep n° ${esc(String(sr.numero))} du ${dfmt(sr.date)}` : ""}. ${T("Mise à jour automatique à chaque analyse.")}</div>
    <h3 style="margin:18px 0 8px;font-size:14px;color:var(--ink-2)">${T("Alertes")}</h3>
    <div class="grid g4">
      ${kpi("Alertes reçues", nf(a.jour.recues), `${T("le")} ${dfmt(Sx.jour || Sx.date)} · ${nf(a.sept_jours.recues)} ${T("sur 7 j")} · ${nf(a.cumul.recues)} ${T("au total")}`, { color: "--s1" })}
      ${kpi("Alertes investiguées (7 j)", nf(a.sept_jours.investiguees), `${pc(a.sept_jours.pct_investiguees)} · ${T("≤ 24 h")} : ${pc(a.sept_jours.pct_investiguees_24h)}`, { color: "--s3", meter: a.sept_jours.pct_investiguees_24h, meterColor: (a.sept_jours.pct_investiguees_24h ?? 0) >= 95 ? "--good" : "--warn" })}
      ${kpi("Alertes validées (7 j)", nf(a.sept_jours.validees), `${pc(a.sept_jours.pct_validees)} ${T("des alertes")} · ${T("cumul")} ${nf(a.cumul.validees)}`, { color: "--s4" })}
      ${kpi("Alertes de décès (7 j)", nf(a.sept_jours.deces), `${nf(a.sept_jours.confirmees)} ${T("alertes confirmées sur 7 j")}`, { color: "--ink-2" })}
    </div>
    <h3 style="margin:18px 0 8px;font-size:14px;color:var(--ink-2)">${T("Suivi des contacts")}</h3>
    <div class="grid g4">
      ${kpi("Contacts en cours de suivi", nf(c.actifs), `${nf(c.non_vus_3j)} ${T("non vus depuis plus de 3 j")}`, { color: "--s1" })}
      ${kpi("Taux de suivi des contacts", pc(c.pct_vus_24h), `${T("vus ≤ 24 h (Linelist)")} · ≤ 72 h : ${pc(c.pct_vus_72h)}${c.sitrep_pct_suivi !== null && c.sitrep_pct_suivi !== undefined ? ` · SitRep : <b>${pc(c.sitrep_pct_suivi)}</b>` : ""}`, { color: "--good", meter: c.sitrep_pct_suivi ?? c.pct_vus_24h, meterColor: (c.sitrep_pct_suivi ?? c.pct_vus_24h ?? 0) >= 95 ? "--good" : "--warn" })}
      ${kpi("Contacts devenus suspects", nf(c.devenus_suspects), `${pc(c.pct_devenus_suspects)} ${T("des contacts listés")} · 21 j : ${nf(c.devenus_suspects_21j)} (${pc(c.pct_devenus_suspects_21j)})`, { color: "--warn" })}
      ${kpi("Contacts devenus cas", nf(c.devenus_cas), `${pc(c.pct_devenus_cas)} ${T("des")} ${nf(c.listes)} ${T("contacts listés")} · 21 j : ${nf(c.devenus_cas_21j)}`, { color: "--critical" })}
    </div>
    <h3 style="margin:18px 0 8px;font-size:14px;color:var(--ink-2)">${T("Personnel de santé (PPL)")}</h3>
    <div class="grid g4">
      ${kpi("PPL infectés", nf(p.infectes), `${nf(p.confirmes)} ${T("confirmés")} · ${nf(p.probables)} ${T("probables")}${N.ppl_sitrep !== null && N.ppl_sitrep !== undefined ? ` · SitRep : ${nf(N.ppl_sitrep)}` : ""}`, { color: "--critical", go: "ppl" })}
      ${kpi("PPL confirmés récents", `${nf(p.confirmes_7j)} / ${nf(p.confirmes_21j)}`, T("7 j / 21 j"), { color: "--s4" })}
      ${kpi("PPL décédés", nf(p.deces), `${nf(p.deces_confirmes)} ${T("confirmés")} · ${T("létalité")} ${pc(p.letalite_pct)}`, { color: "--ink-2" })}
      ${kpi("Alertes chez des PPL", nf(p.alertes), `${nf(p.preleves)} ${T("prélevés")} · ${nf(p.swabs)} ${T("swabs")} · ${pc(p.pct_parmi_confirmes)} ${T("des confirmés")}`, { color: "--s1" })}
    </div>
    ${comp}
    <div class="grid g2">
      ${panel("Zones de santé ayant le plus de PPL infectés", esc(nom), N.zones_ppl.length ? table("sit-zs", N.zones_ppl, [{ k: "zone_sante", t: "Zone de santé" }, ...(nat ? [{ k: "province", t: "Province" }] : []), { k: "infectes", t: "PPL infectés", num: true }, { k: "confirmes", t: "Confirmés", num: true }, { k: "deces", t: "Décès", num: true }, { k: "confirmes_21j", t: "Confirmés 21 j", num: true }], { sort: "infectes", search: false }) : `<div class="empty">${T("Aucun PPL infecté")}</div>`, { csv: "sit-zs" })}
      ${panel("Lieux d'exposition des PPL infectés", T("Fiche de contact, funérailles ou contact avec un cas connu"), hbars(N.exposition_ppl || [], "lieu", "infectes", { limit: 8, color: "--s1" }))}
    </div>
    ${panel("Lieux d'exposition et risque de devenir cas", T("Contacts listés par lieu d’exposition déclaré : part devenue suspecte ou cas (IC 95 % de Wilson)"),
      (hr0 ? `<div class="notice crit"><b>${T("Lieu de plus haut risque")} : ${esc(T(hr0.categorie))}</b>, ${pc(hr0.taux_cas_pct)} ${T("des contacts qui y ont été exposés sont devenus des cas")} (${nf(hr0.devenus_cas)} / ${nf(hr0.contacts)}). ${T("Renforcer en priorité la PCI et le suivi des contacts autour de ce type d’exposition.")}</div>` : "")
      + `<div class="grid g2">${table("sit-exl", exL, [{ k: "categorie", t: "Lieu d’exposition" }, ...exCols.slice(1)], { sort: "taux_cas_pct", search: false })}${table("sit-ext", exT, [{ k: "categorie", t: "Type de contact" }, ...exCols.slice(1)], { sort: "taux_cas_pct", search: false })}</div>`, { csv: "sit-exl" })}
    ${panel("Actions PCI réalisées", sr.numero ? `SitRep n° ${esc(String(sr.numero))} du ${dfmt(sr.date)}, pilier PCI/EDS` : T("Déposez le SitRep PDF du jour dans les données"),
      `<div class="sit-pci">${pci}</div>` + (eds.eds_realise !== null && eds.eds_realise !== undefined ? `<div class="notice small"><b>EDS</b> : ${nf(eds.eds_realise)} ${T("réalisés")}, ${nf(eds.eds_non_realise)} ${T("non réalisés")} (${T("cumul Linelist/lln")})${eds.eds_attendus_24h !== null && eds.eds_attendus_24h !== undefined ? ` ; ${T("dernières 24 h (SitRep)")} : ${nf(eds.eds_realises_24h)} / ${nf(eds.eds_attendus_24h)} ${T("EDS réalisés")}, ${nf(eds.corps_swabes_24h)} ${T("corps swabés")}` : ""}.</div>` : ""))}
    ${panel("Texte prêt à envoyer", T("Résumé de la fiche à copier dans un message ou un rapport"), `<pre class="sit-txt" id="sit-txt" style="white-space:pre-wrap;font:inherit;font-size:13px;margin:0">${esc(sitTexte(nom, N, Sx))}</pre>`,
      { tools: `<button class="btn sm" type="button" data-sit-copy>${T("Copier le texte")}</button>` })}
    <details class="panel" style="padding:14px 18px"><summary><b>${T("Définitions et sources")}</b></summary>${Object.entries(Sx.definitions || {}).map(([k, v]) => `<p><b>${esc(k)}</b> : ${esc(T(v))}</p>`).join("")}</details>`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-sit-copy]");
    if (b) { const el = $("#sit-txt"); if (el && navigator.clipboard) navigator.clipboard.writeText(el.innerText).then(() => { b.textContent = "✓ " + T("Copié"); }); return; }
    const a = e.target.closest("[data-sitniv]");
    if (a) { e.preventDefault(); S.sitNiv = a.dataset.sitniv; render(); window.scrollTo(0, 0); }
  });

  /* ---------------- Zones à risque (grille de la riposte) ---------------- */
  const ZCOL = { "Rouge": "#BD6F68", "Orange": "#EEB98A", "Jaune": "#EBDD92", "Verte": "#A3C98F", "Non touchée": "#D9D6CF" };
  const ZORD = ["Rouge", "Orange", "Jaune", "Verte", "Non touchée"];
  const zrData = () => D.zones_risque || { zones: [], criteres: [], resume: {} };
  function riskZonesView() {
    const Z = zrData(), zs = (Z.zones || []).filter(inProv), sum = Z.resume || {};
    const shown = S.zrCat === "Toutes" ? zs : zs.filter(z => z.categorie === S.zrCat);
    const crit = Z.criteres || [], miss = crit.filter(c => !c.disponible);
    const yes = v => v === true ? `<b style="color:${col("--critical")}">✔</b>` : v === false ? `<span class="muted">—</span>` : `<span class="muted" title="${T("Donnée manquante")}">?</span>`;
    const cnt = c => zs.filter(z => z.categorie === c).length;
    const perNote = PER ? `<div class="notice"><b>${T("Période")} ${dfmt(PER.debut)} → ${dfmt(PER.fin)}</b> : ${T("seuls les cas notifiés pendant la période sont pris en compte ; la catégorie est évaluée à la date de fin.")} ${days(PER.debut, PER.fin) + 1 < 43 ? T("Période de moins de 43 jours : les catégories Jaune (22–42 j sans cas) et Verte (> 42 j) ne peuvent apparaître que si la période est assez longue ; une zone sans cas dans la période est « non touchée » pour cette période.") : ""}</div>` : "";
    return `${perNote}
    <div class="grid g5">${ZORD.map(c => `<div class="kpi clickable" data-zrcat="${c}"><div class="label"><i class="dot" style="background:${ZCOL[c]}"></i>${T(c === "Rouge" ? "Hotspot / Rouge" : c === "Orange" ? "Orange (< 21 j)" : c === "Jaune" ? "Jaune (21–42 j)" : c === "Verte" ? "Verte (> 42 j)" : "Non touchée")}</div><div class="value">${nf(cnt(c))}</div><div class="note">${T("zones de santé")}</div></div>`).join("")}</div>
    ${miss.length ? `<div class="notice"><b>${T("Données manquantes pour ce calibrage")} :</b> ${miss.map(c => esc(T(c.critere))).join(" · ")}. ${T("Ces critères sont affichés « ? » et seront intégrés au prochain calibrage dès que les données seront fournies.")}</div>` : ""}
    <div class="grid g21">
      ${panel(S.zrColor === "score" ? "Carte du score de risque" : "Carte des catégories de zones", `${T("Situation au")} ${dfmt(Z.date)}, ${T("survolez une zone pour le détail, cliquez pour l’analyser ; étiquettes : zone et score de risque (0–100)")}`, `
        <div class="flex" style="margin-bottom:8px"><div class="seg" data-seg="zrColor"><button data-v="categorie" class="${S.zrColor !== "score" ? "on" : ""}">${T("Couleur : catégorie")}</button><button data-v="score" class="${S.zrColor === "score" ? "on" : ""}">${T("Couleur : score")}</button></div>
        <div class="seg" data-seg="zrLab">${[["score", "Étiquettes : score"], ["nom", "Noms seuls"], ["aucune", "Sans étiquette"]].map(([v, t]) => `<button data-v="${v}" class="${S.zrLab === v ? "on" : ""}">${T(t)}</button>`).join("")}</div></div>
        <div id="c-zr-map"></div>`, { tools: mapReportBtn(S.zrColor === "score" ? "03b_score_risque.png" : "03_categories_zones_risque.png") })}
      ${zrDetail(zs)}
    </div>
    ${zrProvPanel(zs)}
    <div class="grid g2">
      ${panel("Règles de classement", T("Grille de la riposte ; seuils modifiables dans config/parametres.json"), `<div class="table-wrap"><table><thead><tr><th>${T("Catégorie")}</th><th>${T("Règle appliquée")}</th></tr></thead><tbody>
        <tr><td>${badge("Rouge", "", "--critical")}</td><td class="wrap">${T("Cas notifiés dans les 21 derniers jours ET au moins un critère d’aggravation (hausse > 25 % des confirmés vs semaine précédente, Rt > 1, décès communautaire testé positif, décès groupés) OU au moins deux critères de contexte (zone frontalière, sites miniers, insécurité, camps de déplacés, résistance).")}</td></tr>
        <tr><td>${T("Orange")}</td><td class="wrap">${T("Cas notifiés dans les 21 derniers jours sans critère rouge ; les critères favorables (baisse sur 21 jours, capacité de surveillance) sont indiqués.")}</td></tr>
        <tr><td>${T("Jaune")}</td><td class="wrap">${T("Dernier cas il y a 22 à 42 jours ; contacts encore en file active signalés.")}</td></tr>
        <tr><td>${T("Verte")}</td><td class="wrap">${T("Plus de 42 jours sans cas : zone de résilience.")}</td></tr>
        <tr><td>${T("Non touchée")}</td><td class="wrap">${T("Aucun cas confirmé ou probable ; contexte (frontière, mines, proximité) affiché pour la préparation.")}</td></tr>
        <tr><td><b>${T("Score")}</b></td><td class="wrap">${T("Score de risque 0–100 : cas 21 j (20), tendance (12), P(Rt > 1) (12), décès communautaires (8), décès groupés (5), proximité d’une zone à incidence élevée (10), frontière (5), mines (5), contacts non vus > 3 j (8), résurgence (10), EDS non réalisés (5). Priorité 1 ≥ 70 ; priorité 2 : 50–69 ; priorité 3 : 30–49 ; veille < 30.")}</td></tr></tbody></table></div>
        <p class="small muted">${T("Références")} : ${esc(Z.references?.mines?.fichier || "—")} (${nf(Z.references?.mines?.sites)} ${T("sites")}) · ${esc(Z.references?.frontalieres?.fichier || "—")} (${nf(Z.references?.frontalieres?.zones)} ${T("zones")})</p>`)}
    </div>
    ${panel(`${T("Zones classées")}, ${T(S.zrCat)}`, T("✔ critère rempli ·, non rempli · ? donnée manquante"), table("zr", shown, [
      { k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" },
      { k: "categorie", t: "Catégorie", v: x => `<span class="badge"><i style="background:${ZCOL[x.categorie]}"></i>${esc(T(x.categorie))}</span>`, sortv: x => ZORD.indexOf(x.categorie) },
      { k: "score_risque", t: "Score", num: true, d: 0 }, { k: "rang_province", t: "Rang (province)", num: true },
      { k: "jours_depuis_dernier_cas", t: "Jours depuis le dernier cas", num: true }, { k: "cas_21j", t: "Cas 21 j", num: true }, { k: "cas_21j_prec", t: "21 j précédents", num: true },
      { k: "c_hausse_25", t: "Hausse > 25 %", v: x => yes(x.c_hausse_25) }, { k: "rt", t: "Rt", num: true, d: 2 }, { k: "c_deces_communautaire_pos", t: "Décès comm. +", v: x => yes(x.c_deces_communautaire_pos) },
      { k: "c_deces_groupes", t: "Décès groupés", v: x => yes(x.c_deces_groupes) }, { k: "c_frontaliere", t: "Frontalière", v: x => yes(x.c_frontaliere) }, { k: "c_proximite", t: "Proximité incidence élevée", v: x => yes(x.c_proximite) },
      { k: "sites_miniers", t: "Sites miniers", num: true }, { k: "c_insecurite", t: "Insécurité", v: x => yes(x.c_insecurite) }, { k: "c_deplaces", t: "Déplacés", v: x => yes(x.c_deplaces) },
      { k: "c_resistance", t: "Résistance", v: x => yes(x.c_resistance) }, { k: "eleves_confirmes_21j", t: "Élèves confirmés 21 j", num: true },
      { k: "pct_investiguees_24h", t: "% alertes investiguées ≤ 24 h", v: x => pc(x.pct_investiguees_24h, 0) }, { k: "contacts_actifs", t: "Contacts actifs", num: true },
      { k: "explication", t: "Justification", wrap: true }], { sort: "categorie", dir: 1, limit: 80, rowClick: true, rowKey: x => x.zone_sante }))}
    ${panel("Critères et disponibilité des données", T("Chaque critère de la grille, sa source et son statut"), table("zr-crit", crit, [{ k: "critere", t: "Critère", wrap: true }, { k: "categorie", t: "Catégorie" }, { k: "type", t: "Type" }, { k: "source", t: "Source", wrap: true }, { k: "zones_concernees", t: "Zones concernées", num: true }, { k: "statut", t: "Statut", v: x => x.disponible ? badge(x.statut, "b-good") : badge(x.statut, "b-mod") }], { search: false, sort: null }))}`;
  }

  const SCORE_PARTS = [["s_cas_21j", "Cas 21 j"], ["s_tendance", "Tendance à la hausse"], ["s_rt", "P(Rt > 1)"], ["s_deces_communautaires", "Décès communautaires +"], ["s_deces_groupes", "Décès groupés"],
    ["s_proximite", "Proximité incidence élevée"], ["s_frontiere", "Frontière"], ["s_mines", "Sites miniers"], ["s_suivi_contacts", "Contacts non vus > 3 j"], ["s_resurgence", "Résurgence"], ["s_eds", "EDS non réalisés"]];
  const PRIO_COL = s => s >= 70 ? "#8f2d2a" : s >= 50 ? "#d9673f" : s >= 30 ? "#f0b48a" : "#f3e6d8";
  function mapReportBtn(file) {
    return `<button class="btn sm" type="button" data-zr-report data-png="carte" title="${T("Carte de rapport pour la période et la province affichées : légende des couleurs avec effectifs, scores, nord, source")}">⤓ ${T("Carte (PNG rapport)")}</button>`;
  }
  function zrDetail(zs) {
    if (!zs.length) return panel("Zone sélectionnée", "", `<div class="empty">${T("Aucune zone")}</div>`);
    const z = zs.find(x => x.zone_sante === S.zrSel) || [...zs].sort((a, b) => (b.score_risque || 0) - (a.score_risque || 0))[0];
    const parts = SCORE_PARTS.map(([k, t]) => ({ t, v: z[k] || 0 })).filter(x => x.v > 0);
    return panel(`${esc(z.zone_sante)}, ${T("score")} ${nf(z.score_risque, 0)}/100`, `${esc(T(z.province || ""))} · ${T("rang")} ${nf(z.rang_province)} ${T("dans la province")} · <span class="badge"><i style="background:${ZCOL[z.categorie]}"></i>${esc(T(z.categorie))}</span>`, `
      <div class="prio-chip" style="background:${PRIO_COL(z.score_risque || 0)};color:${(z.score_risque || 0) >= 50 ? "#fff" : "#3a2a20"}">${prioHtml(z.niveau_priorite)}</div>
      <div class="small" style="margin:8px 0"><b>${T("Orientation opérationnelle")} :</b> ${prioHtml(z.orientation)}</div>
      <h3 class="small" style="margin:10px 0 6px">${T("Contribution de chaque facteur au score")}</h3>
      ${parts.length ? hbars(parts, "t", "v", { color: "--critical", d: 1 }) : `<div class="muted small">${T("Aucun facteur de risque")}</div>`}
      <div class="small muted" style="margin-top:8px">${esc(T(z.explication || ""))}${z.zones_voisines_incidence_elevee ? ` · ${T("Zones voisines à incidence élevée")} : ${esc(z.zones_voisines_incidence_elevee)}` : ""}</div>`);
  }
  function zrProvPanel(zs) {
    const pmax = {}; zs.forEach(z => { pmax[z.province] = Math.max(pmax[z.province] || 0, z.score_risque || 0); });
    const rows = zs.filter(z => (z.score_risque || 0) > 0 && z.province).sort((a, b) => (pmax[b.province] - pmax[a.province]) || String(a.province).localeCompare(String(b.province)) || a.rang_province - b.rang_province);
    const byP = {};
    zs.forEach(z => { const p = z.province || "—"; byP[p] = byP[p] || { province: p, p1: 0, p2: 0, p3: 0, veille: 0, max: 0, top: "" }; const o = byP[p], sc = z.score_risque || 0;
      if (sc >= 70) o.p1++; else if (sc >= 50) o.p2++; else if (sc >= 30) o.p3++; else o.veille++; if (sc > o.max) { o.max = sc; o.top = z.zone_sante; } });
    const prov = Object.values(byP).filter(o => o.max > 0 && o.province !== "—").sort((a, b) => b.max - a.max);
    return `<div>
      ${panel("Priorités par province", T("Nombre de zones par niveau de priorité et zone la plus prioritaire"), table("zr-pv", prov, [{ k: "province", t: "Province" }, { k: "p1", t: "Priorité 1", num: true }, { k: "p2", t: "Priorité 2", num: true }, { k: "p3", t: "Priorité 3", num: true }, { k: "veille", t: "Veille", num: true }, { k: "top", t: "Zone la plus prioritaire", v: x => `${esc(x.top)} (${nf(x.max, 0)})` }], { search: false, sort: null }), { csv: "zr-pv" })}
      ${panel("Classement des zones par province (score de risque)", T("Cliquer une zone pour afficher sa décomposition ; l’orientation résume les actions prioritaires"), table("zr-rank", rows, [
        { k: "province", t: "Province" }, { k: "rang_province", t: "Rang", num: true }, { k: "zone_sante", t: "Zone de santé" },
        { k: "score_risque", t: "Score", v: x => `<span class="score-pill" style="background:${PRIO_COL(x.score_risque)};color:${x.score_risque >= 50 ? "#fff" : "#3a2a20"}">${nf(x.score_risque, 0)}</span>`, sortv: x => x.score_risque },
        { k: "categorie", t: "Catégorie", v: x => `<span class="badge"><i style="background:${ZCOL[x.categorie]}"></i>${esc(T(x.categorie))}</span>`, sortv: x => ZORD.indexOf(x.categorie) },
        { k: "facteurs_principaux", t: "Facteurs principaux", wrap: true, v: x => `<span class="small">${esc(x.facteurs_principaux || "")}</span>` }, { k: "orientation", t: "Orientation opérationnelle", wrap: true, v: x => `<span class="small">${prioHtml(x.orientation)}</span>`, csv: x => x.orientation || "" }],
        { rowClick: true, rowKey: x => x.zone_sante, sort: null, maxh: 560, limit: 150 }), { csv: "zr-rank" })}
    </div>`;
  }
  function riskZonesCharts() { Ch.choropleth($("#c-zr-map"), zrMapOpts()); }
  function zrMapOpts() {
    const Z = zrData(), by = new Map((Z.zones || []).map(z => [norm(z.zone_sante), z]));
    const code = { "Rouge": 5, "Orange": 4, "Jaune": 3, "Verte": 2, "Non touchée": 1 };
    const feats = (D.map_zones || []).filter(f => S.province === "Toutes" || norm(f.province) === norm(S.province));
    return { features: feats, focus: true, focusIf: f => { const z = by.get(norm(f.data_zone)); return z && z.categorie !== "Non touchée"; },
      value: f => S.zrColor === "score" ? (by.get(norm(f.data_zone))?.score_risque ?? null) : (code[by.get(norm(f.data_zone))?.categorie] || null),
      colorFn: (v, f) => { const z = by.get(norm(f.data_zone)); return S.zrColor === "score" ? (z ? PRIO_COL(z.score_risque || 0) : "#E9E6DF") : (ZCOL[z?.categorie] || "#E9E6DF"); },
      selected: S.zrSel || null, onClick: f => { S.zrSel = by.get(norm(f.data_zone))?.zone_sante || f.data_zone; render(); },
      labelMode: S.zrLab === "aucune" ? "none" : "all",
      labelIf: f => { const z = by.get(norm(f.data_zone)); return !!z && z.categorie !== "Non touchée" && (S.zrColor !== "score" || (z.score_risque || 0) >= 30); }, labelRank: f => by.get(norm(f.data_zone))?.score_risque || 0,
      labelText: f => { const z = by.get(norm(f.data_zone)); return S.zrLab === "nom" ? f.data_zone : `${f.data_zone} · ${nf(z?.score_risque, 0)}`; },
      tip: f => { const z = by.get(norm(f.data_zone)); return `<b>${esc(f.data_zone)}</b>${z ? `<div class="row"><span>${T("Score de risque")}</span><b>${nf(z.score_risque, 0)} / 100</b></div><div class="row"><span>${T("Rang dans la province")}</span><b>${nf(z.rang_province)}</b></div><div class="row"><span>${T("Priorité")}</span><b>${esc(T(z.niveau_priorite || ""))}</b></div>` : ""}<div class="row"><span>${T("Catégorie")}</span><b>${esc(T(z?.categorie || "—"))}</b></div>${z ? `<div class="row"><span>${T("Cas 21 j")}</span><b>${nf(z.cas_21j)}</b></div><div class="row"><span>${T("Jours sans cas")}</span><b>${nf(z.jours_depuis_dernier_cas)}</b></div><div class="small" style="max-width:280px">${esc(z.explication || "")}</div>` : ""}`; },
      legendHTML: S.zrColor === "score" ? [[80, "Priorité 1 (≥ 70)"], [60, "Priorité 2 (50–69)"], [40, "Priorité 3 (30–49)"], [10, "Veille (< 30)"]].map(([v, t]) => `<span><i style="background:${PRIO_COL(v)};display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px"></i>${T(t)}</span>`).join(" ")
        : ZORD.map(c => `<span><i style="background:${ZCOL[c]};display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px"></i>${T(c)}</span>`).join(" "), unit: S.zrColor === "score" ? T("score de risque (0–100)") : T("catégorie (5 = rouge … 1 = non touchée)") };
  }
  /* Carte de rapport des zones à risque, produite dans le navigateur pour la période et la province affichées */
  function zrReportPNG() {
    const Z = zrData(), zs = (Z.zones || []).filter(z => S.province === "Toutes" || norm(z.province) === norm(S.province));
    const score = S.zrColor === "score";
    const PR = [[70, 101, "Priorité 1 (≥ 70)", 80], [50, 70, "Priorité 2 (50–69)", 60], [30, 50, "Priorité 3 (30–49)", 40], [-1, 30, "Veille (< 30)", 10]];
    const legend = score
      ? PR.map(([a, b, t, v]) => ({ color: PRIO_COL(v), label: T(t), count: zs.filter(z => z.categorie !== "Non touchée" && (z.score_risque || 0) >= a && (z.score_risque || 0) < b).length }))
      : ZORD.map(c => ({ color: ZCOL[c], label: T(c === "Rouge" ? "Rouge, hotspot" : c === "Orange" ? "Orange, cas < 21 j" : c === "Jaune" ? "Jaune, 22–42 j sans cas" : c === "Verte" ? "Verte, > 42 j sans cas" : "Non touchée"), count: zs.filter(z => z.categorie === c).length }));
    const top = [...zs].filter(z => z.categorie !== "Non touchée").sort((a, b) => (b.score_risque || 0) - (a.score_risque || 0)).slice(0, 6);
    const per = PER ? `${T("Période du")} ${dfmt(PER.debut)} ${T("au")} ${dfmt(PER.fin)}` : `${T("Situation au")} ${dfmt(Z.date || D.meta.cutoff)}`;
    const prov = S.province === "Toutes" ? T("Toutes provinces") : `${T("Province")} : ${S.province}`;
    const opt = zrMapOpts();
    Ch.reportChoropleth(opt, {
      title: score ? T("Score de risque de résurgence par zone de santé, zones prioritaires (score ≥ 30)") : T("Catégories de risque des zones de santé"),
      subtitle: `${per} · ${prov} · ${score ? T("étiquettes : zones de priorité 1 à 3 (score ≥ 30)") : T("étiquettes : zone · score de risque (0–100)")}`,
      legendTitle: score ? T("Niveau de priorité (score 0–100)") : T("Catégorie de la zone"), legend, countLabel: T("zones"),
      sideNotes: [score ? T("Score = cas 21 j (20) + tendance (12) + P(Rt>1) (12) + décès communautaires (8) + décès groupés (5) + proximité d’une incidence élevée (10) + frontière (5) + mines (5) + contacts non vus > 3 j (8) + résurgence (10) + EDS non réalisés (5).")
        : T("Rouge : cas dans les 21 derniers jours et au moins un critère d’aggravation, ou deux critères de contexte. Orange : cas < 21 j sans critère rouge.")],
      notes: top.length ? [`${T("Zones les plus prioritaires")} : ${top.map(z => `${z.zone_sante} (${nf(z.score_risque, 0)}${z.niveau_priorite ? ", " + T(z.niveau_priorite) : ""})`).join(" ; ")}.`] : [],
      source: `${T("Source")} : Linelist, contact tracing, SitRep · Ebola Outbreak, SGI-TASK FORCE · ${per}`,
      file: `carte_${score ? "score_risque" : "categories_zones"}_${PER ? PER.debut + "_" + PER.fin : (Z.date || D.meta.cutoff)}${S.province === "Toutes" ? "" : "_" + S.province}` });
  }

  /* ---------------- Linelist lln : surveillance des alertes ---------------- */
  const LL = () => D.lln || {};
  const noLln = () => `<div class="empty">${T("Ajoutez le Linelist lln (export lln_mve_notifications) pour ces analyses.")}</div>`;
  const wkRows = (h, keys) => (h?.semaines || []).map((w, i) => { const o = { week: w }; keys.forEach(k => o[k] = (h.series?.[k] || [])[i] ?? 0); return o; });
  const wkLab = (v, r, tip) => tip ? `${T("Semaine du")} ${dfmt(v)}` : dshort(v);
  function alertsView() {
    const s = LL().surveillance; if (!s) return noLln();
    const val = (s.conclusion || []).find(x => x.conclusion === "Validee"), di = s.delai_investigation || {};
    const casc = s.cascade || [];
    return `
    <div class="grid g4">
      ${kpi("Alertes notifiées", nf(s.n_alertes), `${nf(s.n_alertes_21j)} ${T("sur les 21 derniers jours")}`)}
      ${kpi("Alertes validées", pc(val?.pct, 1), `${nf(val?.n)} ${T("alertes")}`)}
      ${kpi("Investiguées en ≤ 24 h", pc(di.pct_24h, 1), `${T("Délai médian")} ${nf(di.mediane, 1)} j · P90 ${nf(di.p90, 1)} j`, { color: di.pct_24h >= 80 ? "--s2" : "--critical" })}
      ${kpi("Commission PEC prévenue", pc(s.commission_pec_prevenue_pct, 1), `${T("Mobilisation sociale prévenue")} : ${pc(s.mobilisation_sociale_prevenue_pct, 1)}`)}
    </div>
    <div class="grid g2">
      ${panel("Alertes par semaine selon la conclusion", T("Validées, invalidées, en cours d’investigation"), `<div id="c-al-w"></div>`, { png: "alertes_conclusion" })}
      ${panel("Délai notification → investigation", T("Médiane hebdomadaire (jours) et part des alertes investiguées en ≤ 24 h"), `<div id="c-al-d"></div>`, { png: "alertes_delai" })}
    </div>
    <div class="grid g2">
      ${panel("Cascade alerte → prélèvement → résultat", T("Toutes les alertes du lln"), `<div class="hbars">${casc.map(c => `<div class="hbar"><span class="lbl">${esc(T(c.etape))}</span><span class="bar"><i style="width:${Math.max(1, c.pct_alertes || 0)}%;background:${col("--s1")}"></i></span><span class="val">${nf(c.n)} · ${pc(c.pct_alertes, 0)}</span></div>`).join("")}</div>`)}
      ${panel("Orientation initiale de l’alerte", T("Classification initiale à l’investigation"), table("al-or", s.orientation_initiale || [], [{ k: "orientation", t: "Orientation" }, { k: "n", t: "Alertes", num: true }, { k: "pct", t: "%", v: x => pc(x.pct, 1) }], { search: false }))}
    </div>
    ${panel("Performance de la surveillance par zone de santé", T("Validation, rapidité d’investigation, prélèvement et positivité (zones ≥ 20 alertes)"), table("al-z", (s.par_zone || []).filter(inProv), [{ k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" }, { k: "alertes", t: "Alertes", num: true }, { k: "alertes_21j", t: "21 derniers jours", num: true }, { k: "pct_validees", t: "% validées", v: x => pc(x.pct_validees, 0) }, { k: "pct_investiguees_24h", t: "% investiguées ≤ 24 h", v: x => pc(x.pct_investiguees_24h, 0) }, { k: "delai_investigation_median_j", t: "Délai médian (j)", num: true, d: 1 }, { k: "pct_validees_prelevees", t: "% validées prélevées", v: x => pc(x.pct_validees_prelevees, 0) }, { k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct, 0) }, { k: "pct_deces_parmi_alertes", t: "% alertes décès", v: x => pc(x.pct_deces_parmi_alertes, 0) }], { sort: "alertes_21j", dir: -1 }))}`;
  }
  function alertsCharts() {
    const s = LL().surveillance; if (!s) return;
    const keys = Object.keys(s.hebdo_conclusion?.series || {});
    const pal = { "Validee": "--s2", "Invalidee(Non validee)": "--st-done", "En cours d'investigation": "--s4", "Non Investiguee": "--critical", "Non renseigné": "--st-inc" };
    Ch.xy($("#c-al-w"), { data: wkRows(s.hebdo_conclusion, keys), x: "week", stacked: true, height: 260, xLabel: wkLab, xTitle: T("Semaine"), series: keys.map(k => ({ key: k, label: T(k), color: pal[k] || "--s7" })) });
    Ch.xy($("#c-al-d"), { data: (s.delai_investigation_hebdo || []).map(x => ({ week: x.semaine, med: x.mediane_j, p24: x.pct_24h })), x: "week", height: 260, xLabel: wkLab, xTitle: T("Semaine"), percent: true, hlines: [{ y: 80, color: "--muted", label: "80 %" }],
      series: [{ key: "p24", label: T("% investiguées ≤ 24 h"), color: "--s1", type: "line" }] });
  }

  /* ---------------- Décès communautaires et EDS ---------------- */
  function edsView() {
    const d = LL().deces_eds; if (!d) return noLln();
    const f = d.funerailles || {}, p = d.participation_funerailles || {};
    return `
    <div class="grid g4">
      ${kpi("Alertes décès", nf(d.alertes_deces), `${pc(d.pct_prelevees, 0)} ${T("prélevées")}`)}
      ${kpi("Positivité des décès testés", pc(d.positivite_deces_pct, 1), `${nf(d.alertes_deces_positives)} / ${nf(d.alertes_deces_testees)} · IC ${nf(d.positivite_deces_ic95?.[0], 0)}–${nf(d.positivite_deces_ic95?.[1], 0)} %`, { color: "--critical" })}
      ${kpi("Enterrements dignes et sécurisés (EDS)", pc(f.pct_eds, 0), `${nf(f.eds)} / ${nf(f.renseignees)} ${T("funérailles renseignées")}`, { color: f.pct_eds >= 90 ? "--s2" : "--critical" })}
      ${kpi("Participation aux funérailles", `RC ${nf(p.rapport_cotes, 2)}`, `${T("Confirmés")} ${pc(p.pct_confirmes, 0)} ${T("vs non-cas")} ${pc(p.pct_non_cas, 0)} · IC ${nf(p.ic95?.[0], 2)}–${nf(p.ic95?.[1], 2)}`)}
    </div>
    <div class="grid g2">
      ${panel("Alertes décès par semaine selon le résultat", T("Prélèvement post-mortem : positif, négatif ou sans résultat"), `<div id="c-eds-a"></div>`, { png: "alertes_deces" })}
      ${panel("Funérailles : EDS ou famille / communauté", T("Décès confirmés avec mode d’enterrement renseigné ; ligne : % EDS"), `<div id="c-eds-w"></div>`, { png: "eds_hebdo" })}
    </div>
    <div class="grid g3">
      ${panel("Lieu de décès des cas confirmés", T("Statut final"), table("eds-l", d.lieu_deces_confirmes || [], [{ k: "lieu", t: "Lieu" }, { k: "n", t: "Décès", num: true }, { k: "pct", t: "%", v: x => pc(x.pct, 1) }], { search: false }))}
      ${panel("Délais et mobilité des funérailles", "", `<div class="table-wrap"><table><tbody>
        <tr><td>${T("Délai décès → funérailles (médiane)")}</td><td class="num">${nf(f.delai_deces_funerailles?.mediane, 1)} j (P90 ${nf(f.delai_deces_funerailles?.p90, 1)} j)</td></tr>
        <tr><td>${T("Funérailles hors de la zone du décès")}</td><td class="num">${nf(f.funerailles_hors_zone_deces)} / ${nf(f.avec_zones)}</td></tr>
        <tr><td>${T("Corps touché aux funérailles (déclaré)")}</td><td class="num">${nf(f.corps_touche_funerailles)}</td></tr></tbody></table></div>`)}
      ${panel("Participation aux funérailles et infection", T("Tableau 2 × 2 chez les alertes testées"), `<div class="table-wrap"><table><thead><tr><th></th><th class="num">${T("Confirmés")}</th><th class="num">${T("Non-cas")}</th></tr></thead><tbody>
        <tr><td>${T("A participé")}</td><td class="num">${nf(p.confirmes_oui)}</td><td class="num">${nf(p.non_cas_oui)}</td></tr>
        <tr><td>${T("N’a pas participé")}</td><td class="num">${nf(p.confirmes_non)}</td><td class="num">${nf(p.non_cas_non)}</td></tr></tbody></table></div>
        <p class="small">${T("Rapport de cotes")} ${nf(p.rapport_cotes, 2)} [${nf(p.ic95?.[0], 2)}–${nf(p.ic95?.[1], 2)}] ; p ${p.p !== null && p.p < .001 ? "< 0,001" : "= " + nf(p.p, 3)}</p>`)}
    </div>
    ${panel("Décès et EDS par zone de santé", T("Zones avec au moins 10 alertes"), table("eds-z", (d.par_zone || []).filter(inProv), [{ k: "zone_sante", t: "Zone de santé" }, { k: "province", t: "Province" }, { k: "deces_confirmes", t: "Décès confirmés", num: true }, { k: "deces_domicile", t: "Dont à domicile", num: true }, { k: "funerailles_renseignees", t: "Funérailles renseignées", num: true }, { k: "pct_eds", t: "% EDS", v: x => pc(x.pct_eds, 0) }, { k: "alertes_deces", t: "Alertes décès", num: true }, { k: "alertes_deces_positives", t: "Positives", num: true }], { sort: "deces_confirmes", dir: -1 }))}`;
  }
  function edsCharts() {
    const d = LL().deces_eds; if (!d) return;
    const keys = Object.keys(d.hebdo_alertes_deces?.series || {});
    const pal = { "Positif": "--critical", "Négatif": "--st-done", "Sans résultat": "--st-inc" };
    Ch.xy($("#c-eds-a"), { data: wkRows(d.hebdo_alertes_deces, keys), x: "week", stacked: true, height: 260, xLabel: wkLab, xTitle: T("Semaine"), series: keys.map(k => ({ key: k, label: T(k), color: pal[k] || "--s7" })) });
    Ch.xy($("#c-eds-w"), { data: (d.hebdo_eds || []).map(x => ({ week: x.semaine, eds: x.eds, fam: x.famille })), x: "week", stacked: true, height: 260, xLabel: wkLab, xTitle: T("Semaine"),
      series: [{ key: "eds", label: T("Équipe d’enterrement (EDS)"), color: "--s2" }, { key: "fam", label: T("Famille / communauté"), color: "--critical" }] });
  }

  /* ---------------- Symptômes et score clinique ---------------- */
  function clinicView() {
    const s = LL().symptomes; if (!s) return noLln();
    const m = s.score_clinique || {}, sig = s.signes || [];
    const orTxt = x => x.rapport_cotes === null || x.rapport_cotes === undefined ? "—" : `${nf(x.rapport_cotes, 2)} [${nf(x.ic95?.[0], 2)}–${nf(x.ic95?.[1], 2)}]`;
    return `
    <div class="grid g4">
      ${kpi("Alertes testées (confirmés + non-cas)", nf(s.n_testes), `${nf(s.n_confirmes)} ${T("confirmés")} · ${nf(s.n_non_cas)} ${T("non-cas")}`)}
      ${kpi("Score clinique : aire sous la courbe ROC", nf(m.auc_validation_croisee, 2), T("Régression logistique, validation croisée à 5 plis"))}
      ${kpi("Au seuil de sensibilité 90 %", `${T("Spécificité")} ${pc(m.seuil_sens90?.specificite, 0)}`, `${pc(m.seuil_sens90?.pct_alertes_au_dessus, 0)} ${T("des alertes au-dessus du seuil")}`)}
      ${kpi("Signes hémorragiques (confirmés)", pc(s.hemorragiques_pct_confirmes, 1), T("Fiche d’investigation"))}
    </div>
    <div class="notice"><b>${T("Lecture")} :</b> ${T("aucun symptôme isolé ne distingue bien un cas d’Ebola d’un non-cas : la définition de cas doit rester large (sensibilité), et le test de laboratoire reste indispensable. Les signes les plus discriminants (rapport de cotes élevé) peuvent servir à prioriser le prélèvement et l’isolement.")}</div>
    ${panel("Fréquence des symptômes : confirmés et non-cas", T("% des alertes testées présentant le signe"), `<div id="c-cl-sym"></div>`, { png: "symptomes_confirmes_noncas" })}
    ${panel("Valeur diagnostique de chaque symptôme", T("Sensibilité, spécificité, valeurs prédictives et rapport de cotes (IC 95 %, Woolf)"), table("cl-sig", sig, [{ k: "signe", t: "Symptôme" }, { k: "source", t: "Fiche" }, { k: "pct_confirmes", t: "% confirmés", v: x => pc(x.pct_confirmes, 0) }, { k: "pct_non_cas", t: "% non-cas", v: x => pc(x.pct_non_cas, 0) }, { k: "sensibilite", t: "Sensibilité", v: x => pc(x.sensibilite, 0) }, { k: "specificite", t: "Spécificité", v: x => pc(x.specificite, 0) }, { k: "vpp", t: "VPP", v: x => pc(x.vpp, 0) }, { k: "vpn", t: "VPN", v: x => pc(x.vpn, 0) }, { k: "rapport_cotes", t: "Rapport de cotes [IC 95 %]", v: orTxt }, { k: "renseigne", t: "Renseigné", num: true }], { sort: "rapport_cotes", dir: -1 }))}
    <div class="grid g2">
      ${panel("Nombre de symptômes et positivité", T("Fiche de notification"), `<div id="c-cl-n"></div>`, { png: "nombre_symptomes" })}
      ${panel("Température à l’investigation", T("Confirmés et non-cas"), `<div id="c-cl-t"></div>`, { png: "temperature" })}
    </div>
    <div class="grid g2">
      ${panel("Signes associés au décès (confirmés)", T("Létalité selon la présence du signe"), table("cl-dc", s.signes_deces || [], [{ k: "signe", t: "Signe" }, { k: "letalite_si_present", t: "Létalité si présent", v: x => pc(x.letalite_si_present, 0) }, { k: "letalite_si_absent", t: "si absent", v: x => pc(x.letalite_si_absent, 0) }, { k: "rapport_cotes", t: "Rapport de cotes [IC 95 %]", v: orTxt }, { k: "n", t: "n", num: true }], { search: false, sort: "rapport_cotes", dir: -1 }))}
      ${panel("Score clinique : coefficients", T("Rapports de cotes ajustés (régression logistique pénalisée L2, classes équilibrées)"), table("cl-lr", m.coefficients || [], [{ k: "variable", t: "Variable" }, { k: "rapport_cotes_ajuste", t: "RC ajusté", num: true, d: 2 }, { k: "coefficient", t: "Coefficient", num: true, d: 3 }], { search: false, sort: null, maxh: 420 }))}
    </div>`;
  }
  function clinicCharts() {
    const s = LL().symptomes; if (!s) return;
    const rows = (s.signes || []).filter(x => x.source === "Fiche de notification").sort((a, b) => (b.pct_confirmes || 0) - (a.pct_confirmes || 0)).slice(0, 16).map(x => ({ s: x.signe, c: x.pct_confirmes, n: x.pct_non_cas }));
    Ch.xy($("#c-cl-sym"), { data: rows, x: "s", height: 300, percent: true, xTitle: T("Symptôme"), xLabel: (v, r, tip) => tip ? v : (v.length > 12 ? v.slice(0, 11) + "…" : v), series: [{ key: "c", label: T("Confirmés"), color: "--critical" }, { key: "n", label: T("Non-cas"), color: "--st-done" }] });
    Ch.xy($("#c-cl-n"), { data: (s.nombre_symptomes || []).map(x => ({ k: x.n_symptomes, c: x.confirmes, n: x.non_cas, p: x.positivite_pct })), x: "k", height: 240, xTitle: T("Nombre de symptômes"), series: [{ key: "c", label: T("Confirmés"), color: "--critical" }, { key: "n", label: T("Non-cas"), color: "--st-done" }] });
    Ch.xy($("#c-cl-t"), { data: (s.temperature || []).map(x => ({ t: x.temperature + " °C", c: x.confirmes, n: x.non_cas })), x: "t", height: 240, xTitle: T("Température"), series: [{ key: "c", label: T("Confirmés"), color: "--critical" }, { key: "n", label: T("Non-cas"), color: "--st-done" }] });
  }

  /* ---------------- Laboratoire avancé ---------------- */
  function lab2View() {
    const l = LL().laboratoire; if (!l) return noLln();
    const ct = l.ct || {}, tr = l.tests_repetes || {};
    return `
    <div class="grid g4">
      ${kpi("Valeur Ct médiane (confirmés)", nf(ct.mediane, 1), `${nf(ct.n)} ${T("valeurs")} · IQR ${nf(ct.q1, 1)}–${nf(ct.q3, 1)}`)}
      ${kpi("Ct : décédés vs vivants", `${nf(ct.deces?.mediane, 1)} / ${nf(ct.vivants?.mediane, 1)}`, `Mann–Whitney p ${ct.p_mann_whitney !== null && ct.p_mann_whitney < .001 ? "< 0,001" : "= " + nf(ct.p_mann_whitney, 3)}`, { color: "--critical" })}
      ${kpi("Prélèvement → résultat (médiane)", nf((l.delais || [])[2]?.mediane, 1) + " j", `P90 ${nf((l.delais || [])[2]?.p90, 1)} j`)}
      ${kpi("Incidents majeurs de laboratoire", pc(l.incidents?.pct, 1), `${nf(l.incidents?.majeurs)} / ${nf(l.incidents?.renseignes)}`)}
    </div>
    <div class="notice"><b>${T("Lecture")} :</b> ${T("une valeur Ct basse signifie une charge virale élevée. La létalité est nettement plus forte quand le Ct est bas : le Ct au diagnostic est un signal de gravité utile pour la prise en charge.")}</div>
    <div class="grid g2">
      ${panel("Distribution des valeurs Ct (EBOV)", T("Cas confirmés ; 1 barre = 1 cycle"), `<div id="c-l2-ct"></div>`, { png: "ct_distribution" })}
      ${panel("Létalité selon la valeur Ct", T("IC de Wilson à 95 %"), `<div id="c-l2-cfr"></div>`, { png: "ct_letalite" })}
    </div>
    <div class="grid g2">
      ${panel("Ct selon le délai début des symptômes → prélèvement", T("Médiane et quartiles"), table("l2-dl", ct.selon_delai || [], [{ k: "delai", t: "Délai" }, { k: "n", t: "n", num: true }, { k: "mediane", t: "Ct médian", num: true, d: 1 }, { k: "q1", t: "Q1", num: true, d: 1 }, { k: "q3", t: "Q3", num: true, d: 1 }], { search: false, sort: null }))}
      ${panel("Délais du circuit de laboratoire", T("Jours (médiane, quartiles, P90)"), table("l2-del", l.delais || [], [{ k: "etape", t: "Étape" }, { k: "n", t: "n", num: true }, { k: "mediane", t: "Médiane", num: true, d: 1 }, { k: "q3", t: "Q3", num: true, d: 1 }, { k: "p90", t: "P90", num: true, d: 1 }, { k: "moyenne", t: "Moyenne", num: true, d: 2 }], { search: false, sort: null }))}
    </div>
    ${panel("Délai prélèvement → résultat par semaine", T("Médiane et 90e percentile"), `<div id="c-l2-w"></div>`, { png: "delai_labo_hebdo" })}
    <div class="grid g2">
      ${panel("Machines de diagnostic", T("Tests, positivité et taux d’invalides"), table("l2-m", l.machines || [], [{ k: "machine", t: "Machine" }, { k: "tests", t: "Tests", num: true }, { k: "positifs", t: "Positifs", num: true }, { k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct, 1) }, { k: "pct_invalides", t: "% invalides", v: x => pc(x.pct_invalides, 2) }], { search: false }))}
      ${panel("Types d’échantillons", T("Positivité ; prélèvements post-mortem"), table("l2-t", l.types || [], [{ k: "type", t: "Type" }, { k: "tests", t: "Tests", num: true }, { k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct, 1) }, { k: "dont_decedes_au_prelevement", t: "Décédés au prélèvement", num: true }], { search: false }))}
    </div>
    <div class="grid g2">
      ${panel("Rang du prélèvement", "", table("l2-r", l.rang_prelevement || [], [{ k: "rang", t: "Rang" }, { k: "n", t: "Prélèvements", num: true }], { search: false }))}
      ${panel("Tests répétés chez les confirmés", "", `<div class="table-wrap"><table><tbody>
        <tr><td>${T("Confirmés testés plusieurs fois")}</td><td class="num">${nf(tr.confirmes_plusieurs_tests)}</td></tr>
        <tr><td>${T("Positif puis négatif (négativation)")}</td><td class="num">${nf(tr.positif_puis_negatif)}</td></tr>
        <tr><td>${T("Délai confirmation → dernier test (médiane)")}</td><td class="num">${nf(tr.delai_confirmation_dernier_test?.mediane, 1)} j (IQR ${nf(tr.delai_confirmation_dernier_test?.q1, 0)}–${nf(tr.delai_confirmation_dernier_test?.q3, 0)})</td></tr></tbody></table></div>`)}
    </div>`;
  }
  function lab2Charts() {
    const l = LL().laboratoire; if (!l) return;
    const h = l.ct?.histogramme || [], s0 = l.ct?.histogramme_debut || 10;
    Ch.xy($("#c-l2-ct"), { data: h.map((v, i) => ({ ct: String(s0 + i), n: v })), x: "ct", height: 240, xTitle: "Ct", series: [{ key: "n", label: T("Confirmés"), color: "--s1" }] });
    Ch.xy($("#c-l2-cfr"), { data: (l.ct?.par_classe || []).map(x => ({ c: x.classe_ct, v: x.letalite_pct, lo: x.ic95?.[0], hi: x.ic95?.[1] })), x: "c", height: 240, percent: true, xTitle: T("Classe de Ct"), series: [{ key: "v", label: T("Létalité"), color: "--critical" }],
      bands: [{ lo: "lo", hi: "hi", color: "--critical", label: T("IC 95 %"), opacity: .15 }] });
    Ch.xy($("#c-l2-w"), { data: (l.delais_hebdo || []).map(x => ({ week: x.semaine, m: x.mediane_j, p: x.p90_j })), x: "week", height: 230, xLabel: wkLab, xTitle: T("Semaine"), series: [{ key: "m", label: T("Médiane (j)"), color: "--s1", type: "line" }, { key: "p", label: T("P90 (j)"), color: "--s4", type: "line", dash: "5 4" }] });
  }

  /* ---------------- Prise en charge, vaccination, expositions, agents de santé ---------------- */
  function pecView() {
    const p = LL().pec, v = LL().vaccination, e = LL().expositions, pr = LL().professions; if (!p) return noLln();
    const hc = pr?.agents_sante || {};
    return `
    <div class="grid g4">
      ${kpi("Confirmés admis en CTE", pc(p.pct_admis, 1), `${nf(p.admis)} / ${nf(p.confirmes)} · ${T("délai médian")} ${nf(p.delai_dds_admission?.mediane, 1)} j`)}
      ${kpi("Létalité au CTE (issues closes)", pc(p.letalite_cte_pct, 1), `${T("hors CTE")} : ${pc(p.letalite_hors_cte_pct, 1)}`, { color: "--critical" })}
      ${kpi("Évasions du CTE", nf(p.evades), pc(p.pct_evades, 1) + " " + T("des admis"))}
      ${kpi("Agents de santé confirmés", nf(hc.confirmes), `${pc(hc.pct_confirmes, 1)} ${T("des confirmés")} · ${T("létalité")} ${pc(hc.letalite_pct, 0)}`, { color: "--critical" })}
    </div>
    <div class="grid g2">
      ${panel("Modalités de sortie du CTE", T("Durée de séjour médiane par modalité"), table("pec-s", p.modalites_sortie || [], [{ k: "modalite", t: "Modalité" }, { k: "n", t: "Patients", num: true }, { k: "pct", t: "%", v: x => pc(x.pct, 1) }, { k: "los", t: "Séjour médian (j)", v: x => nf(x.duree_sejour?.mediane, 1) }], { search: false }))}
      ${panel("Provenance des patients admis", "", table("pec-p", p.provenance || [], [{ k: "provenance", t: "Provenance" }, { k: "n", t: "Patients", num: true }, { k: "pct", t: "%", v: x => pc(x.pct, 1) }], { search: false }))}
    </div>
    ${panel("Établissements de prise en charge", T("Admis, guéris, décès et évasions (20 premiers)"), table("pec-e", p.par_etablissement || [], [{ k: "etablissement", t: "Établissement" }, { k: "admis", t: "Admis", num: true }, { k: "gueris", t: "Guéris", num: true }, { k: "deces", t: "Décès", num: true }, { k: "evades", t: "Évadés", num: true }]))}
    <div class="grid g2">
      ${panel("Statut vaccinal (alertes testées)", esc(T(v?.note || "")), table("pec-v", v?.tableau || [], [{ k: "statut", t: "Statut vaccinal" }, { k: "testes", t: "Testés", num: true }, { k: "confirmes", t: "Confirmés", num: true }, { k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct, 1) }, { k: "letalite_pct", t: "Létalité (confirmés)", v: x => `${pc(x.letalite_pct, 1)} [${nf(x.letalite_ic95?.[0], 0)}–${nf(x.letalite_ic95?.[1], 0)}]` }], { search: false }) + `<p class="small">${T("Rapport de cotes de décès, vaccinés vs non vaccinés")} : ${nf(v?.rc_deces_vaccines_vs_non, 2)} [${nf(v?.ic95?.[0], 2)}–${nf(v?.ic95?.[1], 2)}]</p>`)}
      ${panel("Agents de santé confirmés par semaine", T("Profession « personnel de santé » ou position renseignée"), `<div id="c-pec-hcw"></div>`, { png: "agents_sante" })}
    </div>
    <div class="grid g2">
      ${panel("Expositions déclarées et positivité", T("Alertes testées : confirmés vs non-cas"), table("pec-x", e?.tableau || [], [{ k: "variable", t: "Exposition", wrap: true }, { k: "modalite", t: "Réponse" }, { k: "confirmes", t: "Confirmés", num: true }, { k: "non_cas", t: "Non-cas", num: true }, { k: "positivite_pct", t: "Positivité", v: x => pc(x.positivite_pct, 1) }], { search: false, limit: 40 }))}
      ${panel("Types de contact déclarés (confirmés)", `${T("Confirmés connus comme contacts")} : ${pc(e?.confirmes_contacts_connus_pct, 1)} · ${T("suivis")} : ${pc(e?.confirmes_contacts_suivis_pct, 1)}`, table("pec-tc", e?.types_contact || [], [{ k: "type", t: "Type de contact" }, { k: "n", t: "Confirmés", num: true }], { search: false }) + table("pec-lp", e?.lien_parente || [], [{ k: "lien", t: "Lien de parenté avec le cas source" }, { k: "n", t: "Confirmés", num: true }], { search: false }))}
    </div>
    ${panel("Cas confirmés par profession", T("Codes du lln ; les codes non documentés sont affichés tels quels"), table("pec-pr", pr?.tableau || [], [{ k: "profession", t: "Profession" }, { k: "confirmes", t: "Confirmés", num: true }, { k: "pct", t: "%", v: x => pc(x.pct, 1) }, { k: "deces", t: "Décès", num: true }, { k: "letalite_pct", t: "Létalité", v: x => pc(x.letalite_pct, 1) }, { k: "age_median", t: "Âge médian", num: true, d: 0 }], { search: false, limit: 30 }))}`;
  }
  function pecCharts() {
    const h = LL().professions?.agents_sante?.hebdo; if (!h) return;
    Ch.xy($("#c-pec-hcw"), { data: wkRows(h, ["n"]), x: "week", height: 240, xLabel: wkLab, xTitle: T("Semaine"), series: [{ key: "n", label: T("Agents de santé confirmés"), color: "--critical" }] });
  }

  /* ---------------- Linelist fusionnée ---------------- */
  function fusionView() {
    const F = D.fusion; if (!F) return `<div class="empty">${T("Un seul format de Linelist a été fourni : pas de fusion. Ajoutez l’export DHIS2 (format 1) et l’export lln (format 2).")}</div>`;
    const st = F.stats || {}, f = F.fichiers || {};
    const passes = Object.entries(st.passes || {}).map(([k, v]) => ({ passe: k, n: v, pct: st.format1 ? 100 * v / st.format1 : null }));
    const links = !isPublic && f.xlsx ? `<a class="btn" href="../outputs/confidentiel/${encodeURIComponent(f.xlsx)}" download>⤓ ${T("Linelist fusionnée (Excel)")}</a> <a class="btn" href="../outputs/confidentiel/${encodeURIComponent(f.csv)}" download>⤓ CSV</a>` : "";
    return `
    <div class="grid g4">
      ${kpi("Format 1 (Linelist DHIS2)", nf(st.format1), T("lignes après dédoublonnage"))}
      ${kpi("Format 2 (lln)", nf(st.lln), T("alertes après dédoublonnage par EPID"))}
      ${kpi("Lignes appariées", nf(st.apparies), pc(st.format1 ? 100 * st.apparies / st.format1 : null, 1) + " " + T("du format 1"), { color: "--s2" })}
      ${kpi("Ajoutées depuis le lln", nf(st.lln_seul), `${nf(st.format1_seul)} ${T("seulement dans le format 1")}`)}
    </div>
    <div class="notice"><b>${T("Principe")} :</b> ${T("les identifiants du format 1 sont conservés ; une case vide du format 1 est complétée par le lln apparié (jamais l’inverse) ; les alertes présentes seulement dans le lln sont ajoutées. Le fichier fusionné garde les valeurs d’origine (dates en vraies dates, nombres en nombres) ; les colonnes calculées par l’outil sont préfixées « calc_ ». Il contient des noms : il est enregistré dans outputs/confidentiel.")} ${links}</div>
    <div class="grid g2">
      ${panel("Passes d’appariement", T("Chaque passe ne travaille que sur les lignes encore libres, avec des clés uniques des deux côtés"), table("fu-p", passes, [{ k: "passe", t: "Passe" }, { k: "n", t: "Lignes appariées", num: true }, { k: "pct", t: "% du format 1", v: x => pc(x.pct, 1) }], { search: false, sort: null }))}
      ${panel("Origine des lignes de la Linelist fusionnée", "", table("fu-o", F.origine || [], [{ k: "origine", t: "Origine" }, { k: "count", t: "Lignes", num: true }], { search: false }))}
    </div>
    ${panel("Dictionnaire des variables", T("Colonnes du fichier fusionné, source et taux de remplissage"), table("fu-d", F.dictionnaire || [], [{ k: "colonne", t: "Colonne" }, { k: "source", t: "Source" }, { k: "renseignee_pct", t: "Renseignée", v: x => pc(x.renseignee_pct, 1), sortv: x => x.renseignee_pct }], { limit: 250, maxh: 520 }))}`;
  }

  /* ---------------- Conversion contacts -> cas par génération (suivi des contacts) ---------------- */
  function genPanel() {
    const g = D.generations; if (!g || !(g.tableau || []).length) return "";
    return panel("Contacts devenus cas par génération", `${T("G1 = contacts des cas index ; G2 = contacts de contacts devenus cas ; etc.")} ${esc(T(g.methode || ""))}`,
      `<div class="grid g12"><div id="c-gen"></div><div>${table("gen", g.tableau, [{ k: "generation", t: "Génération", v: x => "G" + x.generation }, { k: "libelle", t: "Description", wrap: true }, { k: "listes", t: "Listes de contacts", num: true }, { k: "contacts", t: "Contacts", num: true }, { k: "devenus_cas", t: "Devenus cas", num: true }, { k: "pct", t: "% devenus cas [IC 95 %]", v: x => `${pc(x.pct, 2)} [${nf(x.ic95?.[0], 2)}–${nf(x.ic95?.[1], 2)}]` }, { k: "pct_devenus_cas_avec_liste", t: "Devenus cas ayant leurs propres contacts listés", v: x => `${nf(x.devenus_cas_avec_liste)} (${pc(x.pct_devenus_cas_avec_liste, 0)})` }], { search: false, sort: null })}</div></div>
      <div class="notice small">${T("Un contact devenu cas dont les propres contacts ne sont pas listés interrompt la chaîne de suivi : la part « ayant leurs propres contacts listés » doit tendre vers 100 %.")}</div>`, { png: "conversion_generations" });
  }
  function genChart() {
    const g = D.generations; const el = $("#c-gen"); if (!g || !el) return;
    Ch.xy(el, { data: g.tableau.map(x => ({ g: "G" + x.generation, p: x.pct, lo: x.ic95?.[0], hi: x.ic95?.[1] })), x: "g", height: 220, xTitle: T("Génération"), yFmt: v => nf(v, 1) + " %", series: [{ key: "p", label: T("% devenus cas (IC 95 % dans le tableau)"), color: "--critical" }] });
  }

  /* ---------------- Outils génériques de chaque panneau : Tableau, CSV, PNG ---------------- */
  function enhancePanels() {
    $$("#content .panel").forEach((p, i) => {
      if (p.dataset.enh) return; p.dataset.enh = "1";
      const tools = p.querySelector(".panel-tools"); if (!tools) return;
      const charts = [...p.querySelectorAll(".chart")].filter(c => c.__tbl);
      const hasTable = !!p.querySelector("table"), hasSvg = !!p.querySelector("svg");
      let html = "";
      if (charts.length) html += `<button class="btn sm" data-tbl-toggle title="${T("Afficher les données du graphique")}">▦ ${T("Tableau")}</button>`;
      if (!tools.querySelector("[data-csv]") && (charts.length || hasTable)) html += `<button class="btn sm" data-csv-any title="${T("Exporter CSV")}">⤓ CSV</button>`;
      if (!tools.querySelector("[data-png]") && (hasSvg || hasTable)) html += `<button class="btn sm" data-png-any title="${T("Télécharger PNG")}">⤓ PNG</button>`;
      tools.insertAdjacentHTML("beforeend", html);
    });
  }
  function panelTables(p) {
    const out = [];
    [...p.querySelectorAll(".chart")].filter(c => c.__tbl).forEach((c, i) => { const cap = c.closest(".panel")?.querySelector(".panel-head h2")?.textContent || ""; out.push({ title: cap + (i ? ` (${i + 1})` : ""), cols: c.__tbl.cols, rows: c.__tbl.rows }); });
    if (!out.length) p.querySelectorAll("table").forEach((tb, i) => { const rows = [...tb.querySelectorAll("tr")].map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, " ").trim())); if (rows.length) out.push({ title: (p.querySelector(".panel-head h2")?.textContent || "") + (i ? ` (${i + 1})` : ""), cols: rows[0], rows: rows.slice(1) }); });
    return out;
  }
  function panelCSV(p) {
    const tabs = panelTables(p); if (!tabs.length) return;
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = tabs.flatMap((t, i) => [...(tabs.length > 1 ? [q(t.title)] : []), t.cols.map(q).join(";"), ...t.rows.map(r => r.map(v => typeof v === "number" ? String(v).replace(".", ",") : q(v)).join(";")), ""]);
    const name = (p.querySelector(".panel-head h2")?.textContent || "tableau").replace(/[^\w\-]+/g, "_");
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + "_" + (D.meta.cutoff || "") + ".csv"; a.click();
  }
  function toggleDataView(p) {
    const ex = p.querySelector(".data-view"); if (ex) { ex.remove(); return; }
    const tabs = panelTables(p);
    const h = tabs.map(t => `<div class="table-wrap" style="max-height:360px"><table><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(v => `<td class="${typeof v === "number" ? "num" : ""}">${typeof v === "number" ? nf(v, 3) : esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("");
    p.querySelector(".panel-head").insertAdjacentHTML("afterend", `<div class="data-view">${h}</div>`);
  }

  /* ---------------- Cartes pour rapport (PNG A4, commentaire scientifique) ---------------- */
  let MAPSET = null;
  const capHtml = t => esc(t || "").replace(/&lt;(\/?)b&gt;/g, "<$1b>");
  function mapsView() {
    const set = PER ? MAPSET : (D.cartes || null);
    const L = D.livrables || {}, lb = L.base || "../reports/";
    const dl = (L.rapport || L.presentation) ? panel("Rapport national et présentation", T("Produits automatiquement à chaque exécution, pour la situation complète"), `<div class="flex" style="gap:10px;flex-wrap:wrap">
      ${L.rapport ? `<a class="btn primary" href="${lb}${encodeURIComponent(L.rapport)}" download="${esc(L.rapport)}">⤓ ${T("Rapport épidémiologique national (PDF)")}</a>` : ""}
      ${L.presentation ? `<a class="btn" href="${lb}${encodeURIComponent(L.presentation)}" download="${esc(L.presentation)}">⤓ ${T("Présentation de la riposte (PowerPoint)")}</a>` : ""}</div>
      <p class="small muted" style="margin-top:8px">${T("Question opérationnelle de la présentation")} : ${esc(T(L.question || ""))}</p>`) : "";
    const intro = dl + `<div class="notice">${T("Cartes thématiques prêtes pour les rapports et présentations : titre, cadre, flèche du nord, échelle en km, légende avec bornes et effectifs par classe, limites de province, source, projection (Mercator, WGS 84) et date ; chacune est accompagnée d’un commentaire (méthode, résultats, limites) à reprendre dans le rapport.")} ${T("Fichiers PNG haute définition (A4 paysage) dans le dossier reports du projet.")}</div>`;
    if (PER && !set && isPublic) return `${intro}<div class="notice">${T("Sur le site public, les cartes sont publiées pour la situation complète : revenez à « Tout » dans la période d’analyse.")}</div>`;
    if (PER && !set) return `${intro}${panel("Cartes de la période", `${dfmt(PER.debut)} → ${dfmt(PER.fin)}`, `<div class="flex"><button class="btn primary" type="button" data-maps-run ${SERVED_P ? "" : "disabled"}>${T("Produire les cartes de cette période")}</button><span class="muted small" id="maps-state">${T("Environ 15 secondes.")}</span></div>`)}`;
    if (!set || !(set.cartes || []).length) return `${intro}<div class="empty">${T("Aucune carte produite : relancez l’analyse complète.")}</div>`;
    const base = set.base || `../reports/${encodeURIComponent(set.dossier)}/`;
    return `${intro}<div class="maps-grid">${set.cartes.map((c, i) => `
      <section class="panel map-card"><div class="panel-head"><div><div class="eyebrow">${T("Carte")} ${i + 1}</div><h2>${esc(T(c.titre))}</h2></div>
        <div class="panel-tools"><button class="btn sm" type="button" data-map-png="${i}" data-map-file="${esc(c.fichier)}" title="${T("Carte et commentaire dans une seule image")}">⤓ PNG</button><a class="btn sm" href="${base}${encodeURIComponent(c.fichier)}" target="_blank" rel="noopener">${T("Ouvrir")}</a><button class="btn sm" type="button" data-copy-cap="${i}">${T("Copier le commentaire")}</button></div></div>
        <a href="${base}${encodeURIComponent(c.fichier)}" target="_blank" rel="noopener"><img class="map-img" src="${base}${encodeURIComponent(c.fichier)}" alt="${esc(c.titre)}" loading="lazy"></a>
        <p class="map-cap" id="map-cap-${i}">${capHtml(c.commentaire)}</p></section>`).join("")}</div>`;
  }
  async function mapsRun() {
    const st = $("#maps-state"); if (st) st.textContent = T("Production des cartes…");
    try {
      const r = await fetch("/api/cartes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debut: PER.debut, fin: PER.fin }) });
      const j = await r.json();
      if (!j.ok) { if (st) st.textContent = j.error || T("Erreur"); return; }
      MAPSET = { dossier: j.dossier, cartes: j.cartes }; render();
    } catch (e) { if (st) st.textContent = T("Serveur local injoignable : lancez 00_INTERFACE."); }
  }
  document.addEventListener("click", e => {
    if (e.target.closest("[data-maps-run]")) { mapsRun(); return; }
    const mp = e.target.closest("[data-map-png]");
    if (mp) { const card = mp.closest(".map-card"); const img = card && card.querySelector("img.map-img"); if (img) { img.loading = "eager"; Ch.mapCaptionPNG(img, $("#map-cap-" + mp.dataset.mapPng), mp.dataset.mapFile).catch(() => {}); } return; }
    const cp = e.target.closest("[data-copy-cap]");
    if (cp) { const el = $("#map-cap-" + cp.dataset.copyCap); if (el && navigator.clipboard) navigator.clipboard.writeText(el.innerText).then(() => { cp.textContent = "✓ " + T("Copié"); }); }
  });

  const VIEWS = { overview: [overview, overviewCharts], territories: [territories, territoriesCharts], followup: [followup, followupCharts], index: [indexView, indexCharts], journey: [journey, journeyCharts], chains: [chainsView, chainsCharts], recon: [reconView, reconCharts], dynamics: [dynamicsView, dynamicsCharts], children: [kidsView, kidsCharts], superspreading: [superView, superCharts], resurgence: [resurgenceView, resurgenceCharts], labs: [labsView, labsCharts], nowcast: [nowcastView, nowcastCharts], forecast: [forecastView, forecastCharts], priority: [priorityView], rtm: [rtmView, rtmCharts], riskzones: [riskZonesView, riskZonesCharts], alerts: [alertsView, alertsCharts], eds: [edsView, edsCharts], clinic: [clinicView, clinicCharts], lab2: [lab2View, lab2Charts], pec: [pecView, pecCharts], fusion: [fusionView], maps: [mapsView], ops: [opsView, opsCharts], ppl: [pplView, pplCharts], situation: [sitView], upload: [O.uploadView, O.uploadWire], presentation: [O.presView, O.presWire], indicateurs: [() => O.indView(D), O.indWire], comptes: [O.comptesView, O.comptesWire], publication: [O.pubView, O.pubWire], quality: [qualityView], method: [methodView], terms: [termsView] };
  function buildNav() {
    let g = "";
    $("#navigation").innerHTML = TABS.map(t => { const h = t.g !== g ? `<div class="nav-group">${T(t.g)}</div>` : ""; g = t.g; return `${h}<button data-tab="${t.id}" class="${S.tab === t.id ? "active" : ""}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${t.i}"/></svg>${T(t.t)}</button>`; }).join("");
  }
  window.__hubRender = () => render();
  function render() {
    if (!VIEWS[S.tab]) S.tab = "overview";
    window.HubLang = lang;
    document.documentElement.lang = lang;
    const tab = TABS.find(t => t.id === S.tab);
    $("#page-title").textContent = T(tab.t);
    $("#page-sub").textContent = PER ? `${T("Période du")} ${dfmt(PER.debut)} ${T("au")} ${dfmt(PER.fin)} · ${T("données extraites le")} ${dfmt(D.meta.donnees_jusqu_au || D.meta.extraction)}`
      : `${T("Situation au")} ${dfmt(D.meta.cutoff)} · ${T("données extraites le")} ${dfmt(D.meta.extraction)}`;
    buildNav();
    { const pb = $("#periodbar"); if (pb) pb.style.display = (S.tab === "ops" && !PER) ? "none" : ""; }   // le menu Opérations a son propre filtre de dates (instantané)
    Ch.clearRegistry(); Ch.hideTip();
    const [html, charts] = VIEWS[S.tab];
    $("#content").innerHTML = html();
    if (charts) charts();
    enhancePanels();
    $("#sidebar").classList.remove("open");
  }
  function rerenderTable(id) { render(); const el = document.querySelector(`[data-tsearch="${id}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }

  /* ================= Événements (délégation) ================= */
  document.addEventListener("click", e => {
    const t = e.target;
    const nav = t.closest("#navigation button[data-tab]"); if (nav) { go(nav.dataset.tab, nav.dataset.tab === "journey" ? S.caseKey : undefined); return; }
    const kg = t.closest(".kpi[data-go]"); if (kg) { go(kg.dataset.go); return; }
    const oq = t.closest("[data-opq]");
    if (oq) { const G = D.operations?.lignes; const last = G?.sources?.derniere_notification || D.meta.cutoff; S.opD2 = last;
      S.opD1 = oq.dataset.opq === "all" ? (D.meta.plage_donnees?.[0] || addDays(last, -365)) : addDays(last, -(Number(oq.dataset.opq) - 1)); render(); return; }
    const sg = t.closest(".seg[data-seg] button"); if (sg) { S[sg.parentElement.dataset.seg] = sg.dataset.v; render(); return; }
    const th = t.closest("th[data-sort]"); if (th) { const [id, k] = th.dataset.sort.split("|"); const st = S.tables[id]; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = -1; } rerenderTable(id); return; }
    const mr = t.closest("[data-more]"); if (mr) { S.tables[mr.dataset.more].limit += 100; render(); return; }
    const cv = t.closest("[data-csv]"); if (cv) { toCSV(cv.dataset.csv); return; }
    const xl = t.closest("[data-xlsx]"); if (xl) { downloadList(xl.dataset.xlsx); return; }
    const tg = t.closest("[data-tbl-toggle]"); if (tg) { toggleDataView(tg.closest(".panel")); return; }
    const ca = t.closest("[data-csv-any]"); if (ca) { panelCSV(ca.closest(".panel")); return; }
    const pa = t.closest("[data-png-any]"); if (pa) { const p = pa.closest(".panel"); Ch.downloadPanelPNG(p, (p.querySelector(".panel-head h2")?.textContent || "panneau").replace(/[^\w\-]+/g, "_")); return; }
    const zc = t.closest("[data-zrcat]"); if (zc) { S.zrCat = S.zrCat === zc.dataset.zrcat ? "Toutes" : zc.dataset.zrcat; render(); return; }
    if (t.closest("[data-zr-report]")) { zrReportPNG(); return; }
    const pn = t.closest("[data-png]"); if (pn) { Ch.downloadPNG(pn.closest(".panel"), pn.dataset.png); return; }
    if (t.closest("[data-print]")) { print(); return; }
    if (t.closest("[data-reset-idx]")) { Object.assign(S, { idxZone: "Toutes", idxConf: "Toutes", idxActive: false, gen: "0", idxPeriod: "0" }); render(); return; }
    const gp = t.closest("[data-gen-pick]"); if (gp) { S.gen = gp.dataset.genPick; render(); return; }
    const oc = t.closest("[data-open-case]"); if (oc && !t.closest(".net-tools")) { go("journey", oc.dataset.openCase); return; }
    const nv = t.closest("[data-nav]"); if (nv) { const list = journeyList().map(x => x.index_key); if (!list.length) return; let i = list.indexOf(S.caseKey); i = nv.dataset.nav === "next" ? (i + 1) % list.length : (i - 1 + list.length) % list.length; go("journey", list[i]); return; }
    if (t.closest("a")) return;
    const tr = t.closest("tr[data-row]"); if (tr) {
      const [id, key] = tr.dataset.row.split(/\|(.+)/);
      if (id === "ov-zones") { S.zoneSel = key; go("territories"); }
      else if (id === "ter-zones") { S.zoneSel = key; render(); }
      else if (id === "idx") go("journey", key);
      else if (id === "ch") { S.chain = key; go("chains", key); }
      else if (id === "res") { S.resZone = key; render(); }
      else if (id === "rtm-geo") { S.rtmG = key; render(); }
      else if (id === "zr-rank" || id === "zr") { S.zrSel = key; render(); scrollTo({ top: 0, behavior: "smooth" }); }
      else if (id === "rtz-geo") { S.rtzG = key; render(); scrollTo({ top: 0, behavior: "smooth" }); }
      else if (id === "jr-ct") { S.nodeSel = key; $("#node-detail").innerHTML = nodeDetail(); $$("tr[data-row^='jr-ct|']").forEach(r => r.classList.toggle("selected", r === tr)); journeyCharts(); }
      return;
    }
    if (!t.closest(".search-box")) $("#case-results")?.classList.add("hide");
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.state === "caseKey") { if (t.value) go("journey", t.value); return; }
    if (t.dataset.state) { const v = t.value; S[t.dataset.state] = /^\d+$/.test(v) && ["netDepth", "nowH", "fH"].includes(t.dataset.state) ? Number(v) : v; if (t.dataset.state === "fLevel") { S.fTerr = ""; } if (t.dataset.state === "opProv") { S.opZone = "Toutes"; } if (t.dataset.state === "rtzProv") { S.rtzG = v === "Toutes" ? "National" : `P:${v}`; } render(); }
    if (t.dataset.check) { S[t.dataset.check] = t.checked; render(); }
  });
  let st; document.addEventListener("input", e => { const t = e.target; if (t.dataset.tsearch) { clearTimeout(st); st = setTimeout(() => { S.tables[t.dataset.tsearch].q = t.value; S.tables[t.dataset.tsearch].limit = 60; rerenderTable(t.dataset.tsearch); }, 250); } });

  /* ================= Initialisation ================= */
  const provSel = $("#province-filter");
  function fillProv() { provSel.innerHTML = ["Toutes", ...(D.provinces || []).map(x => x.province).filter(Boolean)].map(x => `<option value="${esc(x)}" ${x === S.province ? "selected" : ""}>${esc(T(x))}</option>`).join(""); }
  provSel.addEventListener("change", e => { S.province = e.target.value; S.zoneSel = ""; S.follZone = "Toutes"; S.idxZone = "Toutes"; render(); });
  function applyTheme(th) { document.documentElement.dataset.theme = th; $("#theme-toggle").textContent = th === "dark" ? "☀" : "☾"; localSet("hub-theme", th); }
  $("#theme-toggle").addEventListener("click", () => { applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); render(); });
  $("#lang-toggle").addEventListener("click", () => { lang = lang === "fr" ? "en" : "fr"; localSet("hub-lang", lang); $("#lang-toggle").textContent = lang === "fr" ? "EN" : "FR"; fillProv(); translateStatic(); render(); });
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  function translateStatic() { $$("[data-i18n]").forEach(el => { el.dataset.fr ??= el.textContent; el.textContent = T(el.dataset.fr); }); $("#privacy").textContent = T(D.meta.privacy || ""); $("#generated").textContent = `${T("Généré le")} ${D.meta.generated_at}`; $("#side-date").textContent = `${T("Situation au")} ${dfmt(D.meta.cutoff)}`; }
  applyTheme(localGet("hub-theme") || "light");
  $("#lang-toggle").textContent = lang === "fr" ? "EN" : "FR";

  /* ================= Période d’analyse (calendrier) ================= */
  const SERVED_P = location.protocol.startsWith("http") && !isPublic && !window.HUB_STATIC;
  const STATIC_P = (window.HUB_STATIC && window.HUB_STATIC.periodes) || [];
  const RANGE = D.meta.plage_donnees || [D.preprocessing?.fenetre_dates?.[0], D.meta.cutoff];
  const DMAX = RANGE[1] || D.meta.cutoff, DMIN = RANGE[0] || DMAX;
  const PRESETS = [["7", "7 j"], ["14", "14 j"], ["21", "21 j"], ["28", "28 j"], ["42", "42 j"], ["90", "90 j"], ["all", "Tout"]];
  function periodBar() {
    const el = $("#periodbar"); if (!el) return;
    if (isPublic && !STATIC_P.length) { el.remove(); return; }
    if (isPublic) {   // site public : périodes prédéfinies précalculées
      const cur = PER ? `${PER.debut}_${PER.fin}` : "";
      el.innerHTML = `<div class="pb-main"><span class="pb-title"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm12 8H5v9h14zM5 8h14V6H5z"/></svg>${T("Période d’analyse")}</span>
        <div class="seg pb-presets">${STATIC_P.map(x => `<button type="button" data-ps="${x.cle}" class="${cur === x.cle ? "on" : ""}">${x.jours} ${T("j")}</button>`).join("")}<button type="button" data-ps="" class="${PER ? "" : "on"}">${T("Tout")}</button></div>
        <span class="pb-state small">${T("Derniers jours jusqu’au")} ${dfmt(DMAX)}, ${T(pubParcours ? "version publique pseudonymisée" : "version publique agrégée")}</span></div>
        ${PER ? `<div class="pb-active"><b>${T("Résultats du")} ${dfmt(PER.debut)} ${T("au")} ${dfmt(PER.fin)}</b>, ${T("cas notifiés et contacts suivis pendant la période ; statuts de suivi et zones à risque à la date de fin ; Rt et prévisions estimés sur tout l’historique jusqu’à la date de fin, affichés sur la période.")}</div>` : ""}`;
      return;
    }
    const d0 = PER ? PER.debut : DMIN, d1 = PER ? PER.fin : DMAX;
    const presetOn = k => k === "all" ? !PER : (PER && PER.fin === DMAX && days(PER.debut, PER.fin) + 1 === Number(k));
    el.innerHTML = `
      <div class="pb-main">
        <span class="pb-title"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm12 8H5v9h14zM5 8h14V6H5z"/></svg>${T("Période d’analyse")}</span>
        <label class="pb-date">${T("Du")}<input type="date" id="pb-d0" value="${d0}" min="${DMIN}" max="${DMAX}" ${SERVED_P ? "" : "disabled"}></label>
        <label class="pb-date">${T("au")}<input type="date" id="pb-d1" value="${d1}" min="${DMIN}" max="${DMAX}" ${SERVED_P ? "" : "disabled"}></label>
        <div class="seg pb-presets">${PRESETS.map(([k, t]) => `<button type="button" data-pp="${k}" class="${presetOn(k) ? "on" : ""}" ${SERVED_P ? "" : "disabled"}>${T(t)}</button>`).join("")}</div>
        <span class="pb-state small" id="pb-state">${SERVED_P ? T("Choisissez les dates : tous les menus se recalculent automatiquement.") : T("Pour recalculer par période, ouvrez l’outil avec 00_INTERFACE.")}</span>
      </div>
      ${PER ? `<div class="pb-active"><b>${T("Résultats du")} ${dfmt(PER.debut)} ${T("au")} ${dfmt(PER.fin)}</b>, ${T("cas notifiés et contacts suivis pendant la période ; statuts de suivi et zones à risque à la date de fin ; Rt et prévisions estimés sur tout l’historique jusqu’à la date de fin, affichés sur la période.")} <button class="btn sm" type="button" data-pp="all">✕ ${T("Revenir à toute la période")}</button></div>` : ""}`;
  }
  function gotoPeriod(d0, d1) {
    const base = location.pathname + (d0 ? `?p=${d0}_${d1}` : "") + location.hash;
    location.href = base;
  }
  let pbTimer = null, pbPoll = null;
  function overlay(show, title, sub) {
    const o = $("#pb-overlay"); if (!o) return;
    o.classList.toggle("hide", !show);
    if (title !== undefined) $("#pb-ov-title").textContent = title;
    if (sub !== undefined) $("#pb-ov-sub").textContent = sub;
  }
  async function applyPeriod(d0, d1) {
    if (!SERVED_P) return;
    if (!d0 || !d1) return;
    if (d0 > d1) [d0, d1] = [d1, d0];
    if (d0 < DMIN) d0 = DMIN; if (d1 > DMAX) d1 = DMAX;
    if (d0 <= DMIN && d1 >= DMAX) { if (PER) gotoPeriod(); return; }
    if (PER && PER.debut === d0 && PER.fin === d1) return;
    overlay(true, `${T("Recalcul de toutes les analyses")} : ${dfmt(d0)} → ${dfmt(d1)}`, T("Données arrêtées à la date de fin, puis indicateurs, graphiques, zones à risque et modèles recalculés."));
    $("#pb-ov-log").textContent = "";
    try {
      const r = await fetch("/api/periode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debut: d0, fin: d1 }) });
      const j = await r.json();
      if (!j.ok) { overlay(true, T("Recalcul impossible"), j.error || ""); return; }
      const poll = async () => {
        const st = await (await fetch("/api/periode/status")).json();
        $("#pb-ov-log").textContent = st.log || ""; $("#pb-ov-sub").textContent = `${T("Temps écoulé")} : ${nf(st.elapsed || 0, 0)} s`;
        if (st.running) { pbPoll = setTimeout(poll, 600); return; }
        if (st.ok) { overlay(true, T("Période prête : affichage…")); gotoPeriod(d0, d1); }
        else overlay(true, T("Le recalcul a échoué"), st.error || "");
      };
      poll();
    } catch (e) { overlay(true, T("Serveur local injoignable"), T("Relancez 00_INTERFACE puis réessayez.")); }
  }
  document.addEventListener("change", e => {
    if (e.target.id === "pb-d0" || e.target.id === "pb-d1") {
      clearTimeout(pbTimer);
      const d0 = $("#pb-d0").value, d1 = $("#pb-d1").value;
      if (!d0 || !d1) return;
      $("#pb-state").textContent = `${T("Recalcul dans un instant")} : ${dfmt(d0 < d1 ? d0 : d1)} → ${dfmt(d0 < d1 ? d1 : d0)}…`;
      pbTimer = setTimeout(() => applyPeriod(d0, d1), 900);
    }
  });
  document.addEventListener("click", e => {
    const ps = e.target.closest("[data-ps]");
    if (ps) { const k = ps.dataset.ps; location.href = location.pathname + (k ? `?p=${k}` : "") + location.hash; return; }
    const b = e.target.closest("[data-pp]"); if (!b) return;
    e.preventDefault();
    const k = b.dataset.pp;
    if (k === "all") { if (PER) gotoPeriod(); return; }
    applyPeriod(addDays(DMAX, -(Number(k) - 1)), DMAX);
  });
  $("#pb-ov-close")?.addEventListener("click", () => { clearTimeout(pbPoll); overlay(false); });

  if (isPublic || !TABS.some(t => t.id === "upload")) $("#up-btn")?.remove(); else $("#up-btn")?.addEventListener("click", () => go("upload"));
  O.userChip();
  fillProv(); translateStatic(); readHash(); periodBar(); render();
})();
