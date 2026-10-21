/* Ebola Outbreak Analytics Hub — menus de l'outil : chargement des données (tout fichier, reconnu par son contenu),
   présentations pour les réunions, comptes, publication en ligne, et menu de l'utilisateur connecté.
   Utilisé par app.js ; fonctionne aussi seul (première utilisation, avant toute analyse). */
window.HubOutil = (function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = s => (window.HubT ? window.HubT(s) : s);
  const LV = { lecteur: 0, analyste: 1, admin: 2 };
  const ROLES = { admin: "Administrateur", analyste: "Analyste", lecteur: "Lecteur" };
  const user = () => window.HUB_USER || null;
  const can = r => !!user() && (LV[user().role] ?? -1) >= LV[r];
  const ONLINE = !!window.HUB_EN_LIGNE;                       // version en ligne (statique, chiffrée)
  const SERVED = location.protocol.startsWith("http") && !ONLINE && !window.HUB_STATIC;
  const PRES_BASE = SERVED ? "../reports/presentation/" : "presentation/";
  const taille = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " Ko" : (n / 1048576).toFixed(1).replace(".", ",") + " Mo";
  const post = async (url, body) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }); return r.json(); };
  function panel(title, sub, body, opts = {}) {
    return `<section class="panel ${opts.cls || ""}" ${opts.id ? `id="${opts.id}"` : ""}><div class="panel-head"><div><h2>${T(title)}</h2>${sub ? `<p>${sub}</p>` : ""}</div><div class="panel-tools">${opts.tools || ""}</div></div>${body}</section>`;
  }

  /* ---------------------------------------------------------------- suivi d'une tâche (analyse, présentation, publication) */
  let pollT = null;
  function suivre(onDone) {
    clearTimeout(pollT);
    const tick = async () => {
      let s; try { s = await (await fetch("/api/status", { cache: "no-store" })).json(); } catch (e) { pollT = setTimeout(tick, 3000); return; }
      const log = $("#job-log"), st = $("#job-state");
      if (log) { log.textContent = s.log || ""; log.scrollTop = log.scrollHeight; }
      const what = { analyse: "Analyse", presentation: "Production des présentations", publication: "Publication" }[s.type] || "Tâche";
      if (st) st.textContent = s.running ? `${T(what)} ${T("en cours…")} ${s.elapsed || 0} s` : s.ok === true ? T(what + " terminée.") : s.ok === false ? T("Échec : lisez le journal ci-dessous.") : "";
      $$("[data-job-btn]").forEach(b => { b.disabled = !!s.running; });
      if (s.running) pollT = setTimeout(tick, 1500); else if (onDone && s.ok !== null) onDone(s);
    };
    tick();
  }

  /* ================================================================ Charger les données */
  let UP = [];          // fichiers déposés dans cette session : { rec, type, etat, pct, nom, taille, err }
  let INFO = null;      // /api/depots
  const groupe = t => t && INFO ? (INFO.utilises.includes(t) ? 0 : 1) : 1;
  function typeSelect(i, t) {
    if (!INFO) return "";
    const opts = (keys) => keys.map(k => `<option value="${k}" ${k === t ? "selected" : ""}>${esc(T(INFO.types[k]))}</option>`).join("");
    const used = INFO.utilises, other = Object.keys(INFO.types).filter(k => !used.includes(k));
    return `<select data-up-type="${i}" aria-label="${T("Type du fichier")}"><optgroup label="${T("Utilisés par l'analyse nationale")}">${opts(used)}</optgroup>
      <optgroup label="${T("Gardés sans être analysés")}">${opts(other)}</optgroup><option value="ignorer" ${t === "ignorer" ? "selected" : ""}>${T("Ne pas utiliser ce fichier")}</option></select>`;
  }
  function drawUp() {
    const el = $("#up-list"); if (!el) return;
    if (!UP.length) { el.innerHTML = `<p class="muted small">${T("Aucun fichier déposé pour l'instant. Les noms des fichiers n'ont aucune importance : chaque fichier est reconnu d'après son contenu.")}</p>`; }
    else el.innerHTML = UP.map((u, i) => {
      if (u.etat !== "ok") return `<div class="up-item"><span class="up-ico">${u.etat === "err" ? "⚠" : "⤒"}</span><div class="up-meta"><b>${esc(u.nom)}</b>
        <span class="muted small">${u.etat === "err" ? esc(u.err) : `${T("Envoi")} ${u.pct || 0} % · ${taille(u.taille)}`}</span>${u.etat === "envoi" ? `<span class="up-bar"><i style="width:${u.pct || 0}%"></i></span>` : ""}</div></div>`;
      const r = u.rec, used = u.type !== "ignorer" && INFO && INFO.utilises.includes(u.type);
      return `<div class="up-item ${u.type === "inconnu" ? "unknown" : ""}"><span class="up-ico">${used ? "✓" : "📄"}</span>
        <div class="up-meta"><b>${esc(r.nom)}</b><span class="muted small">${taille(r.taille)}${r.origine ? ` · ${T("extrait de")} ${esc(r.origine)}` : ""}${r.feuille ? ` · ${T("feuille")} « ${esc(r.feuille)} »` : ""}${r.province ? ` · ${esc(r.province)}` : ""}</span>
        <span class="small up-det ${used ? "ok" : ""}">${esc(T(r.libelle))}${r.detail ? " — " + esc(r.detail) : ""}</span></div>
        ${typeSelect(i, u.type)}<button class="btn sm" type="button" data-up-del="${i}" title="${T("Retirer de la liste")}">✕</button></div>`;
    }).join("");
    const pret = UP.some(u => u.etat === "ok" && u.type !== "ignorer") && !UP.some(u => u.etat === "envoi");
    const b = $("[data-up-run]"); if (b) b.disabled = !pret;
  }
  function envoyer(f) {
    const u = { nom: f.name, taille: f.size, etat: "envoi", pct: 0 }; UP.push(u); drawUp();
    return new Promise(res => {
      const x = new XMLHttpRequest();
      x.open("POST", "/api/televerser?nom=" + encodeURIComponent(f.name));
      x.upload.onprogress = e => { if (e.lengthComputable) { u.pct = Math.round(100 * e.loaded / e.total); const i = UP.indexOf(u); const bar = $$("#up-list .up-item")[i]?.querySelector(".up-bar i"); if (bar) bar.style.width = u.pct + "%"; } };
      x.onload = () => {
        let j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* réponse illisible */ }
        const i = UP.indexOf(u);
        if (!j.ok) { u.etat = "err"; u.err = j.error || T("Envoi impossible."); }
        else UP.splice(i, 1, ...j.fichiers.map(r => ({ rec: r, type: r.type === "inconnu" ? "ignorer" : r.type, etat: "ok" })));
        drawUp(); res();
      };
      x.onerror = () => { u.etat = "err"; u.err = T("Outil injoignable : relancez 00_INTERFACE."); drawUp(); res(); };
      x.send(f);
    });
  }
  async function deposer(files) {
    for (const f of files) await envoyer(f);
    loadInfo();
    if (UP.some(u => u.etat === "ok")) planifierAnalyse(T("Fichiers rangés : l'analyse se lance automatiquement…"));
  }
  /* mise à jour automatique : analyse lancée après chaque dépôt ou correction de type (une seule fois, après 3 s de calme) */
  let planT = null;
  function planifierAnalyse(msg, delai = 3000) {
    clearTimeout(planT);
    const st = $("#job-state"); if (st && msg) st.textContent = msg;
    planT = setTimeout(async () => {
      const j = await post("/api/run", {}).catch(() => ({ error: T("Outil injoignable : relancez 00_INTERFACE.") }));
      if (!j.ok) {
        if (/en cours/.test(j.error || "")) { const s2 = $("#job-state"); if (s2) s2.textContent = T("Une tâche est en cours : l'analyse démarrera juste après."); planifierAnalyse(null, 10000); return; }
        const s2 = $("#job-state"); if (s2) s2.textContent = j.error || T("Erreur"); return;
      }
      suivre(fin);
    }, delai);
  }
  async function loadInfo() {
    try { INFO = await (await fetch("/api/depots", { cache: "no-store" })).json(); } catch (e) { return; }
    if (!INFO.ok) return;
    drawUp();
    const d = INFO.donnees || {}, cur = $("#up-cur");
    if (cur) cur.innerHTML = `<div class="table-wrap"><table><tbody>
      <tr><td>${T("Linelist DHIS2 (format 1)")}</td><td>${esc(d.linelist || "—")}</td></tr>
      <tr><td>${T("Linelist lln")}</td><td>${esc(d.lln || "—")}</td></tr>
      <tr><td>${T("Suivi des contacts")}</td><td>${esc(d.contact || "—")}</td></tr>
      <tr><td>${T("SitRep (PDF le plus récent)")}</td><td>${esc(d.sitrep || "—")}</td></tr>
      ${Object.keys(d.provinces || {}).length ? `<tr><td>${T("Fichiers des provinces")}</td><td>${Object.entries(d.provinces).map(([p, n]) => `${esc(p.replace(/_/g, " "))} (${n})`).join(", ")}</td></tr>` : ""}
      </tbody></table></div>${d.erreur ? `<div class="notice warn small">${esc(d.erreur)}</div>` : ""}`;
    const h = $("#up-hist");
    if (h) h.innerHTML = INFO.depots.length ? `<div class="table-wrap" style="max-height:420px"><table><thead><tr><th>${T("Déposé le")}</th><th>${T("Fichier")}</th><th>${T("Reconnu comme")}</th><th>${T("Par")}</th><th>${T("Utilisé")}</th></tr></thead><tbody>
      ${INFO.depots.map(r => `<tr><td>${esc(r.depose_le)}</td><td>${esc(r.nom)}${r.origine ? `<br><span class="muted small">${T("extrait de")} ${esc(r.origine)}</span>` : ""}</td><td>${esc(T(r.libelle))}${r.province ? ` <span class="muted small">(${esc(r.province)})</span>` : ""}</td><td>${esc(r.par || "")}</td><td>${r.installe ? `<span class="small">${esc(r.installe)}</span>` : "—"}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted small">${T("Aucun dépôt pour l'instant.")}</p>`;
  }
  function uploadView() {
    if (!SERVED) return panel("Charger les données", "", `<div class="notice"><b>${T("Le chargement des données se fait dans l'outil installé sur l'ordinateur.")}</b> ${T("Ouvrez 00_INTERFACE puis connectez-vous.")}</div>`);
    if (!can("analyste")) return panel("Charger les données", "", `<div class="notice">${T("Votre compte (lecteur) permet de consulter les résultats, pas de charger des données.")}</div>`);
    return `${panel("Charger les données", T("Déposez tous vos fichiers, quels que soient leurs noms : Linelist DHIS2, export lln, suivi des contacts, SitRep (PDF ou image), sites miniers, zones frontalières, fichiers des provinces (labo, bases de suivi des contacts et de gestion des alertes, line lists des zones de santé…), ou une archive .zip. Chaque fichier est reconnu d'après son contenu et rangé aussitôt ; l'analyse se lance alors automatiquement et met à jour tous les menus (tableau de bord, cartes, rapports, présentations, indicateurs). Corrigez le type si besoin : l'analyse se relance."), `
      <label class="dropzone" id="up-drop"><input type="file" id="up-input" multiple>
        <span class="dz-ico">⤒</span><b>${T("Déposez les fichiers ici")}</b><span class="muted small">${T("ou cliquez pour parcourir l'ordinateur")} — Excel (.xlsx, .xls, .xlsb), CSV, PDF, images, .zip</span></label>
      <div id="up-list" class="up-list"></div>
      <div class="flex" style="margin-top:12px"><button class="btn primary" type="button" data-up-only data-job-btn>↻ ${T("Relancer l'analyse")}</button><span class="muted small" id="job-state"></span></div>
      <pre id="job-log" class="logbox"></pre>
      <p class="muted small">${T("Une copie datée de chaque fichier déposé est gardée sur cet ordinateur (data/_depots/AAAA-MM-JJ/). Les fichiers d'origine ne sont jamais modifiés. Les fichiers des provinces sont rangés par province (data/provinces/) ; ils ne sont pas utilisés par l'analyse nationale.")}</p>`)}
      ${panel("Données utilisées par l'analyse", T("Fichier le plus récent de chaque type dans le dossier data/."), `<div id="up-cur"><p class="muted small">${T("Chargement…")}</p></div>`)}
      ${panel("Copies datées des fichiers déposés", T("Historique des dépôts : date, fichier, type reconnu, compte, nom donné dans data/."), `<div id="up-hist"></div>`)}`;
  }
  function uploadWire() {
    if (!SERVED || !can("analyste")) return;
    drawUp(); loadInfo();
    const dz = $("#up-drop"), inp = $("#up-input");
    inp.addEventListener("change", () => { deposer([...inp.files]); inp.value = ""; });
    ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
    dz.addEventListener("drop", e => deposer([...(e.dataTransfer?.files || [])]));
    fetch("/api/status").then(r => r.json()).then(s => { if (s.running || s.log) suivre(fin); }).catch(() => {});
  }
  const fin = s => { if (s.ok && s.type === "analyse") { $("#job-state").textContent = T("Analyse terminée : rechargement du tableau de bord…"); setTimeout(() => { location.href = location.pathname + "#/overview"; location.reload(); }, 1500); } };
  async function lancerAnalyse(avec) {
    const st = $("#job-state");
    const fichiers = avec ? UP.filter(u => u.etat === "ok" && u.type !== "ignorer").map(u => ({ id: u.rec.id, type: u.type })) : [];
    st.textContent = T("Lancement…");
    const j = await post("/api/run", { fichiers }).catch(() => ({ error: T("Outil injoignable : relancez 00_INTERFACE.") }));
    if (!j.ok) { st.textContent = j.error || T("Erreur"); return; }
    UP = []; drawUp(); suivre(fin);
  }

  /* ================================================================ Présentation */
  let PIDX = null, PSEL = null;
  const WIDE = /indicateurs|tableau|carte/;
  function presView() {
    return `<div id="pres-root"><p class="muted">${T("Chargement des présentations…")}</p></div>`;
  }
  async function presWire() {
    try { const r = await fetch(PRES_BASE + "index.json", { cache: "no-store" }); PIDX = r.ok ? await r.json() : null; } catch (e) { PIDX = null; }
    drawPres();
  }
  function drawPres() {
    const root = $("#pres-root"); if (!root) return;
    const maj = SERVED && can("analyste") ? `<div class="flex" style="margin-top:10px"><button class="btn" type="button" data-pres-maj data-job-btn>↻ ${T("Mettre à jour les présentations")}</button><span class="muted small" id="job-state"></span></div><pre id="job-log" class="logbox"></pre>` : "";
    if (!PIDX || !(PIDX.niveaux || []).length) { root.innerHTML = panel("Présentation", "", `<div class="notice">${T("Aucune présentation n'a encore été produite : elles sont produites à la fin de chaque analyse.")}</div>${maj}`); return; }
    const N = PIDX.niveaux; if (!PSEL || !N.some(n => n.code === PSEL)) PSEL = N[0].code;
    const m = N.find(n => n.code === PSEL), base = PRES_BASE + m.code + "/", v = encodeURIComponent(PIDX.genere_le || "");
    const titre = m.code === "national" ? "Niveau national" : "Province : " + m.court;
    const nomPng = lab => (m.court + " " + lab).replace(/[^\wÀ-ÿ -]+/g, "").replace(/\s+/g, "_") + ".png";
    root.innerHTML = `<section class="panel pres-head"><div class="pres-dl">
        <div><h2>${T("Présentation PowerPoint")} — ${esc(T(titre))}</h2>
        <p>${T("Diapositives prêtes pour les réunions de coordination, situation au")} ${esc(m.date)} : ${T("indicateurs, courbes, cartes et tableaux, avec des graphiques modifiables dans PowerPoint (clic droit sur un graphique › Modifier les données). Seuls les piliers dont l'outil reçoit les données sont produits.")}</p></div>
        ${m.pptx ? `<a class="btn primary pres-btn" href="${base}${encodeURIComponent(m.pptx)}" download="${esc(m.pptx)}">⤓ ${T("Télécharger le PowerPoint")} (${m.diapositives} ${T("diapositives")})</a>` : ""}</div>
        <div class="seg pres-niv" role="tablist">${N.map(n => `<button type="button" data-pres-niv="${n.code}" class="${n.code === PSEL ? "on" : ""}">${esc(n.code === "national" ? T("National") : n.court)}</button>`).join("")}</div>
        <p class="note small muted">${T("Chaque graphique se télécharge aussi en image (PNG haute définition) pour être collé dans une diapositive existante. Tout est mis à jour à chaque analyse.")}</p>${maj}</section>
      ${m.slides.map(s => `<section class="panel"><div class="panel-head"><div><h2>${esc(T(s.titre))}</h2>${s.date ? `<p>${T("Données au")} ${esc(s.date)}</p>` : ""}</div></div>
        <div class="pres-grid">${s.images.filter(k => m.images.includes(k)).map(k => `<figure class="pres-card${WIDE.test(k) ? " wide" : ""}">
          <a href="${base}${k}.png" target="_blank" rel="noopener" title="${T("Agrandir")}"><img loading="lazy" src="${base}${k}.png?v=${v}" alt="${esc(k)}"></a>
          <figcaption><span>${esc(k.replace(/^\d+_/, "").replace(/_/g, " "))}</span><a class="btn sm" href="${base}${k}.png" download="${esc(nomPng(k.replace(/^\d+_/, "")))}">⤓ PNG</a></figcaption></figure>`).join("")}</div></section>`).join("")}`;
  }


  /* ================================================================ Indicateurs du pilier surveillance (canevas PID-MIO) */
  let INIV = "national";
  function indView(D) {
    const I = D && D.indicateurs_surveillance;
    if (!I || !I.niveaux) return panel("Indicateurs du pilier surveillance", "", `<div class="notice">${T("Les indicateurs seront calculés à la prochaine analyse.")}</div>`);
    if (!I.niveaux[INIV]) INIV = "national";
    const N = I.niveaux[INIV], base = SERVED ? "../reports/indicateurs/" : "indicateurs/";
    const fic = N.fichiers || (N.province && I.niveaux["p:" + (N.province || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")]?.fichiers) || {};
    const opts = Object.entries(I.niveaux).map(([k, n]) => `<option value="${esc(k)}" ${k === INIV ? "selected" : ""}>${n.niveau === "zone" ? "  · " : n.niveau === "province" ? "· " : ""}${esc(n.titre)}</option>`).join("");
    const cls = v => v.ok === true ? "ok" : v.ok === false ? "bad" : "";
    const tbl = `<div class="table-wrap ind-wrap"><table class="ind-tab"><colgroup><col class="c-lib"><col class="c-seuil">${I.mois.map(() => "<col>").join("")}<col class="c-obs"></colgroup>
      <thead><tr><th rowspan="2">${T("Indicateurs")}</th><th rowspan="2">${T("Seuil")}</th><th colspan="${I.mois.length}">${T("Résultats mensuels")} ${esc(I.date.slice(0, 4))}</th><th rowspan="2">${T("Observations")}</th></tr>
      <tr>${I.mois.map(m => `<th>${esc(T(m.lib))}</th>`).join("")}</tr></thead><tbody>
      ${N.lignes.map(r => `<tr><td class="ind-lib">${esc(T(r.lib))}</td><td class="ind-seuil">${esc(r.seuil)}</td>${r.valeurs.map(v => `<td class="ind-v ${cls(v)}">${esc(v.t)}</td>`).join("")}<td class="ind-obs"><b>${esc(r.etat || "")}</b> ${esc(r.def || "")}</td></tr>`).join("")}
      </tbody></table></div>`;
    const prm = I.parametres || {}, pp = I.parametres_provinces || {};
    const provs = Object.values(I.niveaux).filter(n => n.niveau === "province").map(n => n.province);
    const reglages = SERVED && can("analyste") ? panel("Paramètres des alertes attendues", T("Alertes MVE attendues par jour = population × taux d'alertes MVE attendues (pour 10 000 habitants par semaine, norme du SGI MVE) ÷ 70 000 + décès communautaires attendus (population × taux brut de mortalité ÷ 1000 ÷ 365 ; tout décès communautaire est une alerte MVE). Population des zones : fichier dont le nom contient POPULATION (colonnes zone de santé et population) dans config/ ou data/") + (I.population_fichier ? ` — ${T("utilisé")} : ${esc(I.population_fichier)}` : ` — ${T("aucun fichier trouvé")}`) + T(" ; ou population par province ci-dessous."),
      `<form id="f-ind" class="cpt-form">
        <label class="field">${T("Alertes MVE attendues (pour 10 000 habitants par semaine)")}<input type="number" step="any" min="0" name="alertes_ebola_pour_10000_par_semaine" value="${esc(prm.alertes_ebola_pour_10000_par_semaine ?? "")}"></label>
        <label class="field">${T("Taux brut de mortalité (pour 1000 par an)")}<input type="number" step="any" min="0" name="mortalite_brute_pour_1000" value="${esc(prm.mortalite_brute_pour_1000 ?? "")}"></label>
        <details style="grid-column:1/-1"><summary><b>${T("Population par province (facultatif)")}</b></summary><div class="table-wrap" style="max-height:340px"><table><thead><tr><th>${T("Province")}</th><th>${T("Population")}</th><th>${T("Alertes MVE /10 000/sem.")}</th><th>${T("Mortalité ‰")}</th></tr></thead><tbody>
          ${provs.map(p => { const o = pp[p] || {}; return `<tr data-indp="${esc(p)}"><td>${esc(p)}</td><td><input type="number" min="0" data-k="population" value="${o.population ?? ""}"></td><td><input type="number" step="any" min="0" data-k="alertes_ebola_pour_10000_par_semaine" value="${o.alertes_ebola_pour_10000_par_semaine ?? ""}"></td><td><input type="number" step="any" min="0" data-k="mortalite_brute_pour_1000" value="${o.mortalite_brute_pour_1000 ?? ""}"></td></tr>`; }).join("")}
        </tbody></table></div></details>
        <button class="btn primary" type="submit" data-job-btn>${T("Enregistrer et recalculer")}</button></form><span class="muted small" id="job-state"></span><pre id="job-log" class="logbox"></pre>`) : "";
    return `<div class="flex" style="margin-bottom:12px;gap:10px;flex-wrap:wrap;align-items:end"><label class="field">${T("Niveau")}<select data-ind-niv>${opts}</select></label>
        ${fic.xlsx ? `<a class="btn" href="${base}${encodeURIComponent(fic.xlsx)}" download="${esc(fic.xlsx)}">⤓ Excel</a>` : ""}${fic.docx ? `<a class="btn primary" href="${base}${encodeURIComponent(fic.docx)}" download="${esc(fic.docx)}">⤓ Word (${T("canevas")})</a>` : ""}
        <span class="muted small">${T("Fichiers : niveau national et provinces ; le fichier d'une province contient aussi ses zones de santé.")} ${T("Calculés le")} ${esc(I.genere_le)}.</span></div>
      ${panel("Collecte des indicateurs du pilier surveillance — " + N.titre, T("Vert : seuil atteint · rouge : seuil non atteint. Mode de calcul dans la colonne Observations."), tbl)}${reglages}`;
  }
  function indWire() {}
  document.addEventListener("change", e => { const s = e.target.closest?.("[data-ind-niv]"); if (s) { INIV = s.value; const c = $("#content"); if (c && window.__hubRender) window.__hubRender(); } });
  document.addEventListener("submit", async e => {
    if (e.target.id !== "f-ind") return;
    e.preventDefault();
    const f = e.target, provinces = {};
    f.querySelectorAll("tr[data-indp]").forEach(tr => { const o = {}; tr.querySelectorAll("input[data-k]").forEach(i => { if (i.value !== "") o[i.dataset.k] = Number(i.value); }); if (Object.keys(o).length) provinces[tr.dataset.indp] = o; });
    const j = await post("/api/indicateurs", { alertes_ebola_pour_10000_par_semaine: f.alertes_ebola_pour_10000_par_semaine.value, mortalite_brute_pour_1000: f.mortalite_brute_pour_1000.value, provinces });
    if (!j.ok) { $("#job-state").textContent = j.error || ""; return; }
    suivre(s => { if (s.ok) location.reload(); });
  });

  /* ================================================================ Comptes (administrateurs) */
  let CPTS = null;
  function comptesView() {
    if (!SERVED || !can("admin")) return panel("Comptes", "", `<div class="notice">${T("Réservé aux administrateurs, dans l'outil installé sur l'ordinateur.")}</div>`);
    return `${panel("Comptes de l'outil", T("Administrateur : tout (données, analyse, publication, comptes). Analyste : charger les données, lancer l'analyse, produire les présentations. Lecteur : consulter. Les mêmes identifiants ouvrent la version en ligne."), `<div id="cpt-list"><p class="muted small">${T("Chargement…")}</p></div><div class="msg small" id="cpt-msg" role="status"></div>`)}
      ${panel("Créer un compte", "", `<form id="cpt-new" class="cpt-form">
        <label class="field">${T("Nom affiché")}<input type="text" name="nom" placeholder="ex. Équipe surveillance Ituri"></label>
        <label class="field">${T("Identifiant")}<input type="text" name="identifiant" required pattern="[a-z0-9._\\-]{3,32}" placeholder="ex. analyste.ituri" autocapitalize="none"></label>
        <label class="field">${T("Rôle")}<select name="role">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${k === "lecteur" ? "selected" : ""}>${T(t)}</option>`).join("")}</select></label>
        <label class="field">${T("Mot de passe (8 caractères au moins)")}<input type="password" name="mot_de_passe" required minlength="8" autocomplete="new-password"></label>
        <button class="btn primary" type="submit">${T("Créer le compte")}</button></form>
        <p class="muted small">${T("Transmettez l'identifiant et le mot de passe à la personne de vive voix ou par un canal sûr, jamais dans un groupe de discussion.")}</p>`)}`;
  }
  async function loadComptes() {
    const j = await (await fetch("/api/comptes", { cache: "no-store" })).json().catch(() => ({}));
    const el = $("#cpt-list"); if (!el || !j.ok) return;
    CPTS = j.comptes; const me = user().identifiant;
    el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>${T("Nom")}</th><th>${T("Identifiant")}</th><th>${T("Rôle")}</th><th>${T("État")}</th><th>${T("Accès en ligne")}</th><th>${T("Dernière connexion")}</th><th></th></tr></thead><tbody>
      ${CPTS.map(c => `<tr><td>${esc(c.nom)}</td><td><b>${esc(c.identifiant)}</b>${c.identifiant === me ? ` <span class="muted small">(${T("vous")})</span>` : ""}</td>
        <td><select data-cpt-role="${esc(c.identifiant)}" ${c.identifiant === me ? "disabled" : ""}>${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${k === c.role ? "selected" : ""}>${T(t)}</option>`).join("")}</select></td>
        <td>${c.actif ? `<span class="badge b-good">${T("actif")}</span>` : `<span class="badge b-crit">${T("désactivé")}</span>`}</td>
        <td class="small">${c.en_ligne ? T("prêt") : `<span class="muted">${T("après sa première connexion ici")}</span>`}</td>
        <td class="small">${esc(c.derniere_connexion || "—")}</td>
        <td><div class="cpt-acts"><button class="btn sm" type="button" data-cpt-mdp="${esc(c.identifiant)}">${T("Nouveau mot de passe")}</button>
          ${c.identifiant === me ? "" : `<button class="btn sm" type="button" data-cpt-actif="${esc(c.identifiant)}" data-v="${c.actif ? 0 : 1}">${T(c.actif ? "Désactiver" : "Réactiver")}</button>
          <button class="btn sm" type="button" data-cpt-del="${esc(c.identifiant)}">${T("Supprimer")}</button>`}</div></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  const cptMsg = (t, err) => { const m = $("#cpt-msg"); if (m) { m.textContent = t; m.className = "msg small" + (err ? " err" : ""); } };
  async function cptAct(body, ok) { const j = await post("/api/comptes", body); if (!j.ok) { cptMsg(j.error || T("Erreur"), true); return false; } cptMsg(ok); loadComptes(); return true; }
  function comptesWire() {
    if (!SERVED || !can("admin")) return;
    loadComptes();
    $("#cpt-new").addEventListener("submit", async e => {
      e.preventDefault(); const f = new FormData(e.target);
      if (await cptAct({ action: "creer", ...Object.fromEntries(f) }, T("Compte créé."))) e.target.reset();
    });
  }

  /* ================================================================ Publication en ligne (administrateurs) */
  function pubView() {
    if (!SERVED || !can("admin")) return panel("Publication en ligne", "", `<div class="notice">${T("Réservé aux administrateurs, dans l'outil installé sur l'ordinateur.")}</div>`);
    return panel("Publication en ligne", T("Met à jour la version en ligne (GitHub Pages) avec la dernière analyse. Les données publiées sont pseudonymisées puis chiffrées : seuls les comptes de l'outil peuvent les ouvrir, avec les mêmes identifiant et mot de passe. Les tableaux de bord des provinces et des zones de santé déjà en ligne (nord-kivu, zs-…) sont conservés."), `
      <div id="pub-info" class="small muted">${T("Chargement…")}</div>
      <div class="flex" style="margin-top:12px"><button class="btn primary" type="button" data-pub-run data-job-btn>⤴ ${T("Publier maintenant")}</button><span class="muted small" id="job-state"></span></div>
      <pre id="job-log" class="logbox"></pre>
      <div class="notice small">${T("Avant la publication, un contrôle bloque l'envoi si un nom, un numéro de téléphone ou une adresse est trouvé. Un compte n'obtient l'accès en ligne qu'après s'être connecté une fois à cet outil (ou après avoir reçu un nouveau mot de passe) : publiez à nouveau après avoir créé des comptes. La première fois, l'ordinateur doit être connecté à GitHub : lancez 04_PUBLIER_GITHUB dans un Terminal et suivez les instructions.")}</div>`);
  }
  async function pubWire() {
    if (!SERVED || !can("admin")) return;
    const [p, c] = await Promise.all([fetch("/api/publication").then(r => r.json()).catch(() => ({})), fetch("/api/comptes").then(r => r.json()).catch(() => ({}))]);
    const sans = (c.comptes || []).filter(x => x.actif && !x.en_ligne).map(x => x.identifiant);
    const el = $("#pub-info"); if (el) el.innerHTML = `${p.url ? `${T("Adresse")} : <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>` : T("Adresse non configurée (config/publication.json).")}
      ${p.derniere ? `<br>${T("Dernière publication")} : ${esc(p.derniere.le)} ${T("par")} ${esc(p.derniere.par || "")} — ${T("situation au")} ${esc(p.derniere.situation || "")}` : ""}
      ${sans.length ? `<br><span class="warn-txt">${T("Sans accès en ligne pour l'instant")} : ${sans.map(esc).join(", ")}</span>` : ""}`;
    fetch("/api/status").then(r => r.json()).then(s => { if (s.running || (s.type === "publication" && s.log)) suivre(() => pubWire()); }).catch(() => {});
  }

  /* ================================================================ menu de l'utilisateur */
  function userChip() {
    const u = user(), ctl = $(".topbar .controls"); if (!u || !ctl || $("#user-chip")) return;
    ctl.insertAdjacentHTML("beforeend", `<div class="user-chip" id="user-chip"><button class="btn" type="button" data-user-menu aria-haspopup="true">👤 ${esc(u.nom || u.identifiant)}</button>
      <div class="user-menu" hidden><div class="small"><b>${esc(u.identifiant)}</b><br><span class="muted">${T(ROLES[u.role] || u.role)}${ONLINE ? " · " + T("version en ligne") : ""}</span></div>
      ${SERVED ? `<button class="btn sm" type="button" data-user-mdp>${T("Changer mon mot de passe")}</button>` : ""}
      <button class="btn sm" type="button" data-user-out>${T("Se déconnecter")}</button></div></div>`);
  }
  async function deconnexion() {
    if (ONLINE && window.HUB_DECONNEXION) return window.HUB_DECONNEXION();
    try { await post("/api/deconnexion"); } catch (e) { /* hors ligne */ }
    location.href = "connexion.html";
  }
  function dialogMdp(titre, onOk, avecAncien) {
    const d = document.createElement("dialog"); d.className = "mdp-dlg";
    d.innerHTML = `<form method="dialog"><h3>${esc(titre)}</h3>${avecAncien ? `<label class="field">${T("Mot de passe actuel")}<input type="password" name="ancien" required autocomplete="current-password"></label>` : ""}
      <label class="field">${T("Nouveau mot de passe (8 caractères au moins)")}<input type="password" name="nouveau" required minlength="8" autocomplete="new-password"></label>
      <label class="field">${T("Confirmer")}<input type="password" name="nouveau2" required minlength="8" autocomplete="new-password"></label>
      <div class="msg small" role="status"></div><div class="flex"><button class="btn primary" value="ok">${T("Enregistrer")}</button><button class="btn" value="annuler" formnovalidate>${T("Annuler")}</button></div></form>`;
    document.body.appendChild(d); d.showModal();
    const f = d.querySelector("form"), m = d.querySelector(".msg");
    f.addEventListener("submit", async e => {
      if (e.submitter && e.submitter.value === "annuler") { d.remove(); return; }
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      if (v.nouveau !== v.nouveau2) { m.className = "msg small err"; m.textContent = T("Les deux saisies diffèrent."); return; }
      const err = await onOk(v);
      if (err) { m.className = "msg small err"; m.textContent = err; } else d.remove();
    });
    d.addEventListener("close", () => d.remove());
  }

  /* ---------------------------------------------------------------- événements */
  document.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("[data-up-run]")) { e.preventDefault(); lancerAnalyse(true); return; }
    if (t.closest("[data-up-only]")) { e.preventDefault(); lancerAnalyse(false); return; }
    const del = t.closest("[data-up-del]"); if (del) { UP.splice(Number(del.dataset.upDel), 1); drawUp(); return; }
    const pn = t.closest("[data-pres-niv]"); if (pn) { PSEL = pn.dataset.presNiv; drawPres(); return; }
    if (t.closest("[data-pres-maj]")) { const j = await post("/api/presentation"); if (!j.ok) { $("#job-state").textContent = j.error || ""; return; } suivre(s => { if (s.ok) presWire(); }); return; }
    if (t.closest("[data-pub-run]")) { const j = await post("/api/publier"); if (!j.ok) { $("#job-state").textContent = j.error || ""; return; } suivre(() => pubWire()); return; }
    const cr = t.closest("[data-cpt-mdp]"); if (cr) { const id = cr.dataset.cptMdp; dialogMdp(`${T("Nouveau mot de passe pour")} ${id}`, async v => { const j = await post("/api/comptes", { action: "modifier", identifiant: id, mot_de_passe: v.nouveau }); if (!j.ok) return j.error; cptMsg(T("Mot de passe modifié : transmettez-le à la personne par un canal sûr.")); loadComptes(); return null; }); return; }
    const ca = t.closest("[data-cpt-actif]"); if (ca) { cptAct({ action: "modifier", identifiant: ca.dataset.cptActif, actif: ca.dataset.v === "1" }, T("Compte modifié.")); return; }
    const cd = t.closest("[data-cpt-del]"); if (cd) { if (confirm(`${T("Supprimer définitivement le compte")} ${cd.dataset.cptDel} ?`)) cptAct({ action: "supprimer", identifiant: cd.dataset.cptDel }, T("Compte supprimé.")); return; }
    const um = t.closest("[data-user-menu]"); if (um) { const m = um.parentElement.querySelector(".user-menu"); m.hidden = !m.hidden; return; }
    if (t.closest("[data-user-out]")) { deconnexion(); return; }
    if (t.closest("[data-user-mdp]")) { dialogMdp(T("Changer mon mot de passe"), async v => { const j = await post("/api/mot-de-passe", { ancien: v.ancien, nouveau: v.nouveau }); return j.ok ? null : (j.error || T("Erreur")); }, true); return; }
    if (!t.closest("#user-chip")) $$(".user-menu").forEach(m => { m.hidden = true; });
  });
  document.addEventListener("change", e => {
    const s = e.target.closest?.("[data-up-type]"); if (s) {
      const u = UP[Number(s.dataset.upType)]; u.type = s.value; drawUp();
      post("/api/retyper", { id: u.rec.id, type: s.value }).then(j => { if (j.ok) { u.rec = j.fichier; loadInfo(); planifierAnalyse(T("Type corrigé : l'analyse se relance automatiquement…")); } else { const st = $("#job-state"); if (st) st.textContent = j.error || ""; } });
      return;
    }
    const r = e.target.closest?.("[data-cpt-role]"); if (r) cptAct({ action: "modifier", identifiant: r.dataset.cptRole, role: r.value }, T("Rôle modifié."));
  });

  /* Première utilisation (aucune analyse encore) : page de chargement seule */
  function standalone() {
    userChip();
    const c = $("#content"); if (!c) return;
    ["#province-filter", "#up-btn", "#lang-toggle", "#periodbar"].forEach(s => { const el = $(s); if (el) (el.closest(".field") || el).remove(); });
    $("#page-title").textContent = T("Charger les données");
    $("#page-sub").textContent = T("Aucune analyse pour l'instant : déposez les fichiers pour lancer la première analyse.");
    $("#navigation").innerHTML = "";
    c.innerHTML = uploadView(); uploadWire();
  }

  return { can, user, SERVED, ONLINE, userChip, indView, indWire, uploadView, uploadWire, presView, presWire, comptesView, comptesWire, pubView, pubWire, standalone };
})();
