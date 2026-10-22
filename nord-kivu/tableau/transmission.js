/* Ebola Outbreak, outil de la zone de santé : analyses de transmission
   Cas index, parcours du cas, chaînes de transmission, reconstruction, dynamique de transmission, enfants (0–18 ans).
   Mêmes vues et mêmes modèles que l'outil national (practicals RECON), appliqués aux aires de santé de la zone. */
window.ZS_TRANSMISSION = function (H) {
  "use strict";
  const { D, S, CAS, CT, AN, nf, pc, esc, col, dfr, dshort, day, addDays, days, inPer, perTxt, status, panel, kpi, badge, legend, segBtns, table, Ch, $, $$ } = H;
  const TR = D.trans || null;
  const T = s => s;
  const dfmt = s => s ? dfr(s) : "—";
  Object.entries({ gen: "0", idxActive: false, nodeSel: "", netLayout: "radial", netDepth: "2", netIcons: false, chain: "", chainLayout: "time",
    dynG: "National", growBase: "dds", growWin: "12s", dyBase: "o", rtDays: "120", rlWin: "28j", projH: "30", distK: "dds_notification",
    recZone: "", recSup: "0.3", recColor: "issue", recX: "onset", recDoc: false, epiMin: "3" }).forEach(([k, v]) => { if (S[k] === undefined) S[k] = v; });
  const noTR = () => { const w = (D.meta.avertissements || []).find(x => /transmission/i.test(x));
    return `<div class="empty">Analyses de transmission indisponibles : ${w ? esc(w) + ", " : "la base de suivi des contacts et la liste des cas sont nécessaires. "}Relancez l'analyse depuis « Charger les données ».</div>`; };
  const tRef = () => day(S.date);
  const tFrom = () => day(S.from);

  /* ------------------------------------------------------------------ cas et contacts */
  const caseBy = new Map(CAS.map(c => [c.id, { k: c.id, id: c.id, ini: c.ini, cls: c.classe, dc: c.deces, age: c.age, sexe: c.sexe, zs: c.aire_nom, as: c.aire, date: c.date,
    on: c.on, oi: c.oi, ch: c.ch, gen: c.gen, ri: c.ri || 0, nc: c.contacts, src: c.src, srcc: c.srcc, debut: c.debut, isolement: c.isolement, confirmation: c.confirmation,
    liste_le: c.liste_le, connu: c.connu, hors: c.hors_zs }]));
  const byIndex = new Map();
  CT.forEach(x => { if (!x.cas) return; if (!byIndex.has(x.cas)) byIndex.set(x.cas, []); byIndex.get(x.cas).push(x); });
  const contactBy = new Map(CT.map(x => [x.id, x]));
  const strongLk = x => x.lk && (x.lkc === "Certain" || x.lkc === "Probable");
  const STATUS = [
    { k: "Devenu confirmé", c: "--st-conf" }, { k: "Suspect", c: "--st-susp" }, { k: "PDV", c: "--s2" }, { k: "JMV", c: "--s7" }, { k: "Absence", c: "--st-nv" },
    { k: "ReCo non passé", c: "--s4" }, { k: "Vu", c: "--st-v24" }, { k: "Déplacé", c: "--s1" }, { k: "Refus", c: "--s5" }, { k: "En attente", c: "--st-inc" },
    { k: "Suivi terminé", c: "--st-done" }, { k: "Décédé", c: "--ink-2" }, { k: "Recyclé", c: "--st-done" }, { k: "Transféré", c: "--st-done" }, { k: "Doublon", c: "--st-dup" }];
  const ACTIVE = new Set(["Suspect", "PDV", "JMV", "Absence", "ReCo non passé", "Vu", "Déplacé", "Refus", "En attente"]);
  const stColor = s => (STATUS.find(x => x.k === s) || { c: "--st-done" }).c;
  const statusBadge = s => badge(s || "—", "", stColor(s));
  const CLS = { "Confirmé": "--st-conf", "Probable": "--s5" };
  const clsColor = c => CLS[c] || "--st-inc";
  const LINKC = { "Certain": "b-crit", "Probable": "b-high", "À vérifier": "b-mod" };
  /* statut d'un contact à une date (t en jours), mêmes règles que le rapport de suivi */
  function cst(x, t) {
    if (strongLk(x)) { const tc = caseBy.get(x.lk); if (!tc || !tc.date || day(tc.date) <= t) return "Devenu confirmé"; }
    const s = status(x, t);
    if (s) return s.sortie ? (s.sortie === "Confirmé" ? "Devenu confirmé" : s.sortie) : s.st;
    if (x._dlc !== null && t - x._dlc > 21 && (x._ent === null || x._ent <= t)) { const f = status(x, x._dlc + 21); if (f && f.sortie) return f.sortie === "Confirmé" ? "Devenu confirmé" : f.sortie; return "Suivi terminé"; }
    return null;
  }
  const allPeriod = () => S.preset === "tout";
  const contactInPer = x => x._dlc !== null && (x._ent === null || x._ent <= tRef()) && (allPeriod() || (x._dlc + 1 <= tRef() && x._dlc + 21 >= tFrom()));
  const daysSeen = (x, t) => { const k = Math.min(21, Math.max(0, t - x._dlc)); let v = 0, a = 0; for (let j = 0; j < k; j++) { const ch = x.codes[j]; if (ch === "-") continue; a++; if (ch === "X" || ch === "1") v++; } return { v, a }; };
  const lastSeen = x => { let j = -1; for (let i = 0; i < 21; i++) if (x.codes[i] === "X" || x.codes[i] === "1") j = i; return j < 0 ? null : H.iso(x._dlc + j + 1); };
  const aireOk = c => !S.aire || (c && c.as === S.aire);
  /* ---- réseau de contact tracing : 1 génération = cas index et ses contacts ; 2 = un contact devenu cas a lui-même des contacts listés … */
  const NET = (() => {
    const memo = new Map();
    const info = (k, stack = new Set()) => {
      if (memo.has(k)) return memo.get(k);
      if (stack.has(k)) return { depth: 1, size: 0, cases: 0 };
      stack.add(k);
      let depth = 1, size = 0, cs = 0;
      (byIndex.get(k) || []).forEach(x => { size++; if (strongLk(x)) { cs++; if (x.lk !== k && byIndex.has(x.lk)) { const sub = info(x.lk, stack); depth = Math.max(depth, 1 + sub.depth); size += sub.size; cs += sub.cases; } } });
      stack.delete(k);
      const r = { depth, size, cases: cs }; memo.set(k, r); return r;
    };
    return { info: k => info(k), depth: k => info(k).depth };
  })();
  const GENS = [["0", "Toutes"], ["1", "1 génération"], ["2", "2 générations"], ["3", "3 générations"], ["4", "4 générations"]];
  const genOk = (k, g) => !Number(g) || NET.depth(k) === Number(g);
  const interp = (title, items, q) => `<div class="interp"><b>${title}</b><ul>${items.filter(Boolean).map(x => `<li>${x}</li>`).join("")}</ul>${q ? `<span class="q">${q}</span>` : ""}</div>`;
  const stat = (label, value, sub) => `<div class="stat"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  function stackbar(counts) {
    const total = STATUS.reduce((s, x) => s + (counts[x.k] || 0), 0);
    if (!total) return `<div class="stackbar"></div>`;
    return `<div class="stackbar" title="${STATUS.filter(x => counts[x.k]).map(x => `${x.k} : ${counts[x.k]}`).join(" · ")}">${STATUS.filter(x => counts[x.k]).map(x => `<i style="width:${100 * counts[x.k] / total}%;background:${col(x.c)}"></i>`).join("")}</div>`;
  }

  /* ================================================================== CAS INDEX */
  function idxAll() {
    const t = tRef(), rows = [];
    byIndex.forEach((L, k) => {
      const c = caseBy.get(k);
      const aire = c ? c.as : (L[0] || {}).aire;
      if (S.aire && aire !== S.aire) return;
      const per = L.filter(contactInPer);
      const cnt = {}; let act = 0, vus = 0;
      L.forEach(x => { const s = cst(x, t); if (!s) return; cnt[s] = (cnt[s] || 0) + 1; if (ACTIVE.has(s)) { act++; if (s === "Vu" || s === "Suspect") vus++; } });
      const ni = NET.info(k);
      const fin = L.map(x => x._dlc).filter(v => v !== null);
      rows.push({ index_key: k, id_cas: k, initiales: c ? c.ini : "", aire: c ? c.zs : (AN[aire] || aire || ""), cls: c ? c.cls : "Hors liste des cas", dc: c ? c.dc : false,
        contacts: L.length, per: per.length, actifs: act, vus, taux: act ? 100 * vus / act : null, pdv: cnt["PDV"] || 0, jmv: cnt["JMV"] || 0, devenus_cas: L.filter(strongLk).length,
        reseau: ni.size, reseau_cas: ni.cases, gen: ni.depth, fin_suivi: fin.length ? H.iso(Math.max(...fin) + 21) : null, chaine: c ? c.ch : null, cnt, date: c ? c.date : null });
    });
    return rows;
  }
  function idxRows() { return idxAll().filter(x => genOk(x.index_key, S.gen) && (allPeriod() || x.per > 0) && (!S.idxActive || x.actifs > 0)); }
  function indexView() {
    if (!TR) return noTR();
    const rows = idxRows(), all = idxAll();
    const sum = k => rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    const nAct = sum("actifs"), v = sum("vus"), nc = sum("contacts"), dc = sum("devenus_cas");
    const med = (() => { const a = rows.map(x => x.contacts).sort((a, b) => a - b); return a.length ? a[Math.floor(a.length / 2)] : null; })();
    const genCount = [1, 2, 3, 4].map(g => ({ g, n: all.filter(x => x.gen === g && (allPeriod() || x.per > 0)).length }));
    const mx = Math.max(1, ...genCount.map(y => y.n));
    const filtTxt = [S.aire ? AN[S.aire] : "", Number(S.gen) ? `${S.gen} génération(s)` : "", allPeriod() ? "" : `contacts suivis ${perTxt()}`, S.idxActive ? "suivi en cours" : ""].filter(Boolean).join(" · ");
    return `
    <section class="panel" style="padding-bottom:10px;margin-bottom:14px">
      <div class="flex">
        <div><div class="small muted" style="margin-bottom:3px">Générations du réseau</div>${segBtns("gen", GENS)}</div>
        <label class="flex small" style="margin-top:14px"><input type="checkbox" data-check="idxActive" ${S.idxActive ? "checked" : ""}> Suivi en cours uniquement</label>
      </div>
      <div class="small muted" style="margin-top:8px">Filtres actifs : <b>${filtTxt || "aucun"}</b>, ${nf(rows.length)} cas index sur ${nf(all.length)} · la période et l'aire de santé se choisissent en haut de l'écran</div>
    </section>
    <div class="grid g5">
      ${kpi("Cas index (filtrés)", nf(rows.length), `Médiane ${nf(med)} contacts par cas index`)}
      ${kpi("Contacts listés", nf(nc), `${nf(nAct)} en suivi · ${nAct ? pc(100 * v / nAct, 0) : "—"} vus le ${dfr(S.date)}`, { color: "--s1" })}
      ${kpi("Perdus de vue (≥ 72 h)", nf(sum("pdv")), `${nf(sum("jmv"))} jamais vus · à rechercher en priorité`, { cls: sum("pdv") ? "alert" : "good", color: "--s2" })}
      ${kpi("Contacts devenus cas", nf(dc), `Taux d'attaque secondaire ${nc ? pc(100 * dc / nc, 2) : "—"}`, { color: "--st-conf" })}
      ${kpi("Rapprochements à vérifier", nf(TR.liens.a_verifier), `${nf(TR.liens.certains)} certains · ${nf(TR.liens.probables)} probables (utilisés)`, { cls: TR.liens.a_verifier ? "alert" : "" })}
    </div>
    <div class="grid g2">
      ${panel("Cas index par nombre de générations", "Profondeur du réseau de contact tracing ; cliquer pour filtrer", `<div class="hbars">${genCount.map(x => `<div class="hbar clickable" data-gen-pick="${x.g}" style="grid-template-columns:60px 1fr 70px"><span>G${x.g}</span><div class="track"><i style="width:${Math.max(1, 100 * x.n / mx)}%;background:${col(["--s1", "--s3", "--s4", "--critical"][x.g - 1])}"></i></div><b>${nf(x.n)}</b></div>`).join("")}</div><div class="small muted" style="margin-top:6px">G1 = cas index et ses contacts ; G2 = au moins un contact devenu cas a lui-même des contacts listés ; G3, G4 = chaînes de contacts plus longues.</div>`)}
      ${panel("Nombre de contacts par cas index", "Cas index filtrés", `<div id="c-idx-hist"></div>`, { png: "contacts_par_cas_index" })}
    </div>
    ${panel(Number(S.gen) ? `Graphes des réseaux à ${S.gen} génération(s)` : "Graphes des plus grands réseaux", "Les 12 premiers cas index filtrés (contacts devenus cas d'abord, puis taille du réseau) ; cliquer pour ouvrir le parcours",
      `<div class="grid g3" id="idx-gallery">${rows.slice().sort((a, b) => b.reseau_cas - a.reseau_cas || b.reseau - a.reseau).slice(0, 12).map(x => `<div class="mini-net clickable" data-open-case="${esc(x.index_key)}"><div class="flex between small"><b>${esc(x.id_cas)}</b><span class="badge">G${x.gen}</span></div><div class="small muted">${esc(x.aire || "")} · ${nf(x.reseau)} contacts · ${nf(x.reseau_cas)} devenus cas</div><div class="mini-net-box" data-mini="${esc(x.index_key)}"></div></div>`).join("") || `<div class="empty">Aucun cas index ne correspond aux filtres.</div>`}</div>
      ${legend([...STATUS.filter(x => ACTIVE.has(x.k) || x.k === "Devenu confirmé" || x.k === "Suivi terminé").map(x => ({ t: x.k, c: x.c, round: true })), { t: "Cas (carré)", c: "--st-conf" }])}`)}
    ${panel("Cas index et leurs contacts", `Chaque ligne = un cas index de la base de suivi ; statuts au ${dfr(S.date)} ; cliquer pour ouvrir le parcours et le graphe de contacts`, table("idx", rows, [
        { k: "id_cas", t: "Cas index", v: x => `<b>${esc(x.id_cas)}</b> <span class="muted">${esc(x.initiales || "")}</span>`, csv: x => x.id_cas },
        { k: "cls", t: "Classification", v: x => badge(x.cls || "—", "", clsColor(x.cls)) + (x.dc ? " " + badge("Décédé", "b-crit") : ""), csv: x => x.cls },
        { k: "aire", t: "Aire de santé" }, { k: "gen", t: "Générations", num: true, v: x => `<span class="badge">G${x.gen}</span>`, csv: x => x.gen }, { k: "contacts", t: "Contacts", num: true }, { k: "reseau", t: "Taille du réseau", num: true },
        { k: "statuts", t: "Statuts des contacts", v: x => stackbar(x.cnt), csv: x => STATUS.filter(s => x.cnt[s.k]).map(s => `${s.k}:${x.cnt[s.k]}`).join(" "), sortv: x => x.actifs },
        { k: "actifs", t: "En suivi", num: true }, { k: "pdv", t: "PDV", num: true }, { k: "jmv", t: "Jamais vus", num: true }, { k: "taux", t: "% vus", num: true, v: x => x.actifs ? pc(x.taux, 0) : "—" },
        { k: "devenus_cas", t: "Devenus cas", num: true }, { k: "fin_suivi", t: "Fin du suivi", v: x => x.fin_suivi ? dshort(x.fin_suivi) : "—" },
        { k: "chaine", t: "Chaîne", v: x => x.chaine ? `<a href="#" data-gochain="${esc(x.chaine)}">${esc(x.chaine)}</a>` : "—" }],
        { sort: Number(S.gen) > 1 ? "reseau" : "actifs", rowClick: true, rowKey: x => x.index_key, limit: 80, searchText: x => `${x.id_cas} ${x.initiales} ${x.aire}` }), { csv: "idx" })}`;
  }
  function indexCharts() {
    if (!TR) return;
    const rows = idxRows();
    const bins = [[1, 5], [6, 10], [11, 20], [21, 30], [31, 50], [51, 100], [101, 1e9]];
    if ($("#c-idx-hist")) Ch.xy($("#c-idx-hist"), { data: bins.map(([a, b]) => ({ b: b > 1e8 ? `> ${a - 1}` : `${a}–${b}`, n: rows.filter(x => x.contacts >= a && x.contacts <= b).length })), x: "b", height: 200, barWidth: .8,
      series: [{ key: "n", label: "Cas index", color: "--s1" }], legend: false, xLabel: (v, r, tip) => tip ? `${v} contacts` : v });
    $$("[data-mini]").forEach(box => {
      const c = caseBy.get(box.dataset.mini) || { k: box.dataset.mini, id: box.dataset.mini, ini: "?", cls: "" };
      const net = buildNetwork(c, Number(S.gen) || 4);
      Ch.network(box, { nodes: net.nodes.map(n => ({ ...n, sub: n.level === 0 ? n.sub : "" })), links: net.links, rootId: "C:" + c.k, layout: "radial", height: 260, sexIcons: false, ringLabel: () => "", info: `${nf(net.nodes.length - 1)} nœuds`, onSelect: () => H.go("journey", c.k) });
    });
    $$("[data-gen-pick]").forEach(b => b.addEventListener("click", () => { S.gen = b.dataset.genPick; H.render(); }));
    $$("[data-open-case]").forEach(b => b.addEventListener("click", e => { if (!e.target.closest("svg")) H.go("journey", b.dataset.openCase); }));
  }

  /* ================================================================== PARCOURS DU CAS */
  function journeyList() {
    return idxAll().filter(x => genOk(x.index_key, S.gen) && (allPeriod() || x.per > 0))
      .sort((a, b) => b.reseau_cas - a.reseau_cas || b.actifs - a.actifs || b.contacts - a.contacts);
  }
  function defaultCase() {
    const l = journeyList(); if (l.length) return l.slice().sort((a, b) => b.actifs - a.actifs || b.contacts - a.contacts)[0].index_key;
    const c = CAS.filter(x => aireOk(caseBy.get(x.id)))[0]; return c ? c.id : "";
  }
  function journeyView() {
    if (!TR) return noTR();
    if (!S.cas || (!caseBy.has(S.cas) && !byIndex.has(S.cas))) S.cas = defaultCase();
    const k = S.cas, c = caseBy.get(k) || { k, id: k, ini: "?", cls: "Hors liste des cas", zs: "" };
    if (!k) return `<div class="empty">Aucun cas disponible.</div>`;
    const t = tRef(), ctAll = byIndex.get(k) || [], ct = ctAll.filter(contactInPer);
    const counts = {}; ct.forEach(x => { const s = cst(x, t); if (s) counts[s] = (counts[s] || 0) + 1; });
    const list = journeyList();
    const conv = ctAll.filter(strongLk).length;
    const ni = NET.info(k);
    const act = ct.filter(x => ACTIVE.has(cst(x, t))).length;
    const fin = ctAll.map(x => x._dlc).filter(v => v !== null);
    const srcC = c.src ? caseBy.get(c.src) : null;
    const asContact = CT.filter(x => strongLk(x) && x.lk === k);
    const i = list.findIndex(x => x.index_key === k);
    return `
    <div class="flex between" style="margin-bottom:12px">
      <div class="search-box"><input type="search" id="case-search" placeholder="Rechercher un cas : identifiant, initiales, aire de santé…" autocomplete="off"><div id="case-results" class="search-results hide"></div></div>
      <div class="flex small"><span class="muted">Générations</span>${segBtns("gen", GENS)}
        <select data-state="cas" title="Cas index de la période et de l'aire choisies" style="max-width:300px"><option value="">Cas index, période et aire choisies (${nf(list.length)})</option>${list.slice(0, 500).map(x => `<option value="${esc(x.index_key)}" ${x.index_key === k ? "selected" : ""}>${esc(x.id_cas)} · ${esc(x.aire || "")} · G${x.gen} · ${nf(x.reseau)} contacts</option>`).join("")}</select></div>
      <div class="flex small muted">Navigation :
        <button class="btn sm" data-nav="${esc((list[i - 1] || {}).index_key || "")}" ${i > 0 ? "" : "disabled"}>← Cas précédent</button><button class="btn sm" data-nav="${esc((list[i + 1] || {}).index_key || "")}" ${i >= 0 && i < list.length - 1 ? "" : "disabled"}>Cas suivant →</button></div>
    </div>
    <section class="panel">
      <div class="case-head">
        <div class="avatar" style="background:${col(clsColor(c.cls))}">${esc(c.ini || "?")}</div>
        <div><h2>${esc(c.id)}</h2><div class="meta">${badge(c.cls || "—", "", clsColor(c.cls))} ${c.dc ? badge("Décédé", "b-crit") : ""} ${c.src || c.connu ? badge("Était un contact suivi", "b-good") : ""} ${!caseBy.has(k) ? badge("Cas index hors liste des cas", "b-high") : ""}
          <span style="margin-left:6px">${c.age !== null && c.age !== undefined ? nf(c.age, c.age < 1 ? 1 : 0) + " ans" : ""} ${esc(c.sexe === "M" ? "Masculin" : c.sexe === "F" ? "Féminin" : "")} · ZS ${esc(D.meta.zone_de_sante)} / ${esc(c.zs || "")}</span></div></div>
        <div class="flex">${c.ch ? `<a class="btn sm" href="#" data-gochain="${esc(c.ch)}">⛓ Chaîne ${esc(c.ch)}${c.gen ? " · G" + c.gen : ""}</a>` : ""}<button class="btn sm" onclick="window.print()">🖨 Imprimer</button></div>
      </div>
      <div class="facts">
        <div class="fact"><span>Début des signes</span><b>${dfmt(c.debut)}</b></div>
        <div class="fact"><span>Isolement</span><b>${dfmt(c.isolement)}</b></div>
        <div class="fact"><span>Confirmation</span><b>${dfmt(c.confirmation)}</b></div>
        <div class="fact"><span>Réseau de contact tracing</span><b>G${ni.depth} · ${nf(ni.size)} contacts · ${nf(ni.cases)} devenus cas</b></div>
        <div class="fact"><span>Contacts listés</span><b>${nf(ctAll.length)}${!allPeriod() ? ` <span class="muted small">(${nf(ct.length)} sur la période)</span>` : ""}</b></div>
        <div class="fact"><span>Contacts en suivi le ${dshort(S.date)}</span><b>${nf(act)}</b></div>
        <div class="fact"><span>Contacts devenus cas</span><b>${nf(conv)} ${ctAll.length ? `(${pc(100 * conv / ctAll.length)})` : ""}</b></div>
        <div class="fact"><span>Devenus suspects (cumul)</span><b>${nf(ctAll.filter(x => x.codes.includes("1")).length)}</b></div>
        <div class="fact"><span>Fin du suivi des contacts</span><b>${fin.length ? dfmt(H.iso(Math.max(...fin) + 21)) : "—"}</b></div>
        <div class="fact"><span>Cas secondaires (reconstruction)</span><b>${nf(c.ri || 0)}</b></div>
      </div>
    </section>
    <div class="grid g21" style="margin-top:14px">
      ${panel("Trajectoire du cas", `Événements datés ; l'écart entre étapes est indiqué en jours · <b>${perTxt()}</b>`, timelineHTML(c, ctAll))}
      ${panel("Origine du cas (amont)", "Cas source identifié par la liste de contacts (rapprochement des noms)", srcC || asContact.length ? `<div class="detail-card">${asContact.map(x => `<div class="detail-row"><span>Listé comme contact de</span><b><a href="#" data-gocas="${esc(x.cas)}">${esc(x.cas)}</a> ${badge(x.lkc, LINKC[x.lkc])}</b></div><div class="detail-row"><span>Dernier contact avec le cas source</span><b>${dfmt(x.dlc)}</b></div><div class="detail-row"><span>Lien avec le cas source</span><b>${esc(x.lien || "—")}</b></div>`).join("")}</div>` : `<div class="empty">Aucune source identifiée pour ce cas.${c.connu === true ? " La liste des cas indique pourtant « contact connu » : rechercher la fiche du contact." : ""}</div>`)}
    </div>
    ${ctAll.length ? panel("Trajectoire du suivi des contacts", `Contacts à suivre, vus et non vus chaque jour · ${perTxt()}`, `<div id="c-jrtraj"></div>`, { png: "trajectoire_suivi_" + k }) : ""}
    <div class="grid g21">
      ${panel("Graphe de contact tracing", "Cas index au centre ; contacts colorés selon leur statut ; un contact devenu cas ouvre ses propres contacts (niveau suivant)", `<div id="c-net"></div>
        ${legend([...STATUS.filter(x => ACTIVE.has(x.k) || ["Devenu confirmé", "Suivi terminé", "Décédé"].includes(x.k)).map(x => ({ t: x.k, c: x.c, round: true })), { t: "Cas (carré)", c: "--st-conf" }, { t: "Cas source (amont)", c: "--s7" }])}`,
        { png: "graphe_contacts_" + k, tools: `${Number(S.gen) ? `<span class="badge">Générations affichées : ${S.gen}</span>` : `<label class="small muted">Profondeur</label><select data-state="netDepth">${[1, 2, 3, 4].map(n => `<option value="${n}" ${String(S.netDepth) === String(n) ? "selected" : ""}>Niveau ${n}</option>`).join("")}</select>`}${segBtns("netLayout", [["radial", "Radial"], ["tree", "Arbre"]])}<label class="small flex" style="gap:4px"><input type="checkbox" data-check="netIcons" ${S.netIcons ? "checked" : ""}>Homme / femme</label>` })}
      ${panel("Nœud sélectionné", "Cliquer un nœud du graphe", `<div id="node-detail">${nodeDetail()}</div><h3 class="small" style="margin:16px 0 6px">Statut des contacts directs (${dfr(S.date)})</h3>${stackbar(counts)}${legend(STATUS.filter(x => counts[x.k]).map(x => ({ t: x.k, c: x.c, n: counts[x.k] })))}`)}
    </div>
    ${ct.length ? panel("Grille de suivi des contacts (J1 à J21)", "Une ligne par contact, comme la fiche de suivi ; le jour du rapport est encadré ; les cases hachurées précèdent l'enregistrement du contact (pas une absence).", `${H.jLegend()}<div class="tbl-wrap" style="max-height:560px">${gridHTML(ct)}</div>`) : ""}
    ${panel("Contacts du cas index", `Suivi individuel sur 21 jours, pseudonymisé · ${perTxt()}`, table("jr-ct", ct.map(x => { const ds = daysSeen(x, t); return { ...x, st: cst(x, t), jv: ds.v, ja: ds.a, vl: lastSeen(x), fin: x._dlc !== null ? H.iso(x._dlc + 21) : null, aire_n: AN[x.aire] || x.aire }; }), [
      { k: "id", t: "ID contact", v: x => `<b>${esc(x.id)}</b> <span class="muted">${esc(x.ini)}</span>`, csv: x => x.id }, { k: "age", t: "Âge", num: true }, { k: "sexe", t: "Sexe" },
      { k: "lien", t: "Relation" }, { k: "type", t: "Exposition", v: x => esc(x.type || "—") + (x.hr ? " " + badge("Haut risque", "b-high") : ""), csv: x => x.type },
      { k: "aire_n", t: "Aire" }, { k: "dlc", t: "Dernière exposition", v: x => dshort(x.dlc) }, { k: "fin", t: "Fin de suivi", v: x => dshort(x.fin) },
      { k: "comp", t: "Jours vus / attendus", v: x => `<div class="flex" style="gap:6px;flex-wrap:nowrap"><div class="progress" style="width:80px"><i style="width:${x.ja ? Math.min(100, 100 * x.jv / x.ja) : 0}%;background:${col(stColor(x.st))}"></i></div><span class="small">${x.jv}/${x.ja}</span></div>`, sortv: x => x.ja ? x.jv / x.ja : 0, csv: x => `${x.jv}/${x.ja}` },
      { k: "vl", t: "Dernier vu", v: x => x.vl ? dshort(x.vl) : "jamais" }, { k: "st", t: "Statut", v: x => statusBadge(x.st), csv: x => x.st },
      { k: "lk", t: "Devenu cas", v: x => x.lk ? `<a href="#" data-gocas="${esc(x.lk)}">${esc(x.lk)}</a> ${badge(x.lkc, LINKC[x.lkc])}` : "—", csv: x => x.lk ? `${x.lk} (${x.lkc})` : "" }],
      { sort: "st", rowClick: true, rowKey: x => x.id, selected: x => x.id === S.nodeSel, maxh: 460 }), { csv: "jr-ct" })}`;
  }
  function gridHTML(ct) {
    const t = tRef();
    const sorted = ct.slice().sort((a, b) => (a.aire || "").localeCompare(b.aire || "") || (a.dlc || "").localeCompare(b.dlc || ""));
    const hdr = `<tr><th></th><th></th><th></th>${Array.from({ length: 21 }, (_, j) => `<th>J${j + 1}</th>`).join("")}<th>Statut au ${dfr(S.date, false)}</th></tr>`;
    const body = sorted.map(x => { const s = status(x, t); const k = s ? s.k : (t - x._dlc); const st = cst(x, t); return `<tr><td>${esc(x.ini || "—")}</td><td>${esc(x.sexe || "")} ${x.age !== null && x.age !== undefined ? nf(x.age) + " a" : ""}</td><td>${esc(AN[x.aire] || x.aire || "")} · ${esc(x.lien || "")}</td>
      ${[...x.codes].map((ch, j) => `<td class="c ${j >= k ? "c-fut" : H.ccls(ch)} ${j === k - 1 ? "today" : ""}" title="J${j + 1} (${dfr(H.iso(x._dlc + j + 1), false)}) : ${H.CODE_LAB[ch] || ch}">${j < k && /[1-6RDT]/.test(ch) ? ch : ""}</td>`).join("")}
      <td>${st ? statusBadge(st) : badge("Pas encore listé")}</td></tr>`; }).join("");
    return `<table class="jgrid">${hdr}${body}</table>`;
  }
  function timelineHTML(c, ct) {
    const ev = [];
    if (c.debut) ev.push([c.debut, "Début des signes", "--s2"]);
    if (c.isolement) ev.push([c.isolement, "Isolement", "--s5"]);
    if (c.confirmation) ev.push([c.confirmation, "Confirmation (laboratoire)", "--s3"]);
    const src = CT.find(x => strongLk(x) && x.lk === c.k);
    if (src && src.dlc) ev.push([src.dlc, `Dernier contact avec le cas source ${src.cas}`, "--s7"]);
    const first = ct.map(x => x.ent).filter(Boolean).sort()[0];
    if (first) ev.push([first, "Premiers contacts listés", "--s1"]);
    const fin = ct.map(x => x._dlc).filter(v => v !== null);
    if (fin.length) ev.push([H.iso(Math.max(...fin) + 21), "Fin prévue du suivi des contacts", "--good"]);
    ct.filter(strongLk).forEach(x => { const tc = caseBy.get(x.lk); if (tc && tc.date) ev.push([tc.date, `Contact devenu cas (${tc.id})`, "--st-conf"]); });
    let E = ev.filter(e => e[0]);
    if (!allPeriod()) E = E.filter(e => inPer(e[0]) || ["Début des signes", "Isolement", "Confirmation (laboratoire)"].includes(e[1]));
    if (!E.length) return `<div class="empty">Aucun événement daté.</div>`;
    E.sort((a, b) => a[0].localeCompare(b[0]));
    const items = E.map((e, i) => { const gap = i ? days(E[i - 1][0], e[0]) : null; return `${i ? `<div class="tl-gap"><span>${gap ? "+" + gap + " j" : "même jour"}</span></div>` : ""}<div class="tl-ev"><i style="background:${col(e[2])}"></i><b>${esc(e[1])}</b><time>${dfmt(e[0])}</time></div>`; }).join("");
    const del = c.debut && c.isolement ? days(c.debut, c.isolement) : null;
    return `<div class="tl">${items}</div><div class="small muted" style="margin-top:8px">Durée totale : ${nf(days(E[0][0], E[E.length - 1][0]))} jours${del !== null ? ` · délai début des signes → isolement : <b>${nf(del)} j</b>` : ""}</div>`;
  }
  function buildNetwork(c, depthMax) {
    depthMax = depthMax || (Number(S.gen) || Number(S.netDepth));
    const t = tRef(), nodes = [], links = [], seenCase = new Set([c.k]), maxNodes = 900;
    const ctitle = x => { const s = cst(x, t); const ds = daysSeen(x, t); return `<b>${esc(x.id)}</b> · ${esc(x.ini)}<div class="row"><span>Statut</span><b>${esc(s || "—")}</b></div><div class="row"><span>Relation</span><b>${esc(x.lien || "—")}</b></div><div class="row"><span>Aire</span><b>${esc(AN[x.aire] || x.aire || "")}</b></div><div class="row"><span>Jours vus</span><b>${ds.v}/${ds.a}</b></div>${x.lk ? `<div class="row"><span>Devenu cas</span><b>${esc(x.lk)} (${esc(x.lkc)})</b></div>` : ""}`; };
    nodes.push({ id: "C:" + c.k, level: 0, shape: "case", label: c.ini || "?", sub: c.id, color: clsColor(c.cls), sex: c.sexe, selected: S.nodeSel === "C:" + c.k, title: `<b>${esc(c.id)}</b><div>${esc(c.cls || "")}</div><div>${esc(c.zs || "")}</div>`, ref: { type: "case", k: c.k } });
    const up = CT.find(x => strongLk(x) && x.lk === c.k);
    if (up) { const sc = caseBy.get(up.cas); const id = "S:" + up.cas; nodes.push({ id, level: -1, shape: "source", label: sc ? sc.ini : "?", sub: up.cas, color: "--s7", sex: sc ? sc.sexe : null, title: `<b>Cas source</b> · ${esc(up.cas)}<div>Listé comme contact (${esc(up.lkc)})</div>`, ref: { type: "case", k: up.cas } }); links.push({ source: id, target: "C:" + c.k, up: true }); }
    const expand = (caseKey, parentId, level) => {
      (byIndex.get(caseKey) || []).filter(contactInPer).forEach(x => {
        if (nodes.length > maxNodes) return;
        const id = "K:" + x.id + "@" + level;
        const linked = strongLk(x) ? caseBy.get(x.lk) : null;
        nodes.push({ id, parent: parentId, level, shape: linked ? "case" : "contact", label: x.ini, sub: String(x.id).slice(-6), color: stColor(cst(x, t)), ring: linked ? "--ink" : null, selected: S.nodeSel === x.id, title: ctitle(x), ref: { type: "contact", k: x.id }, sex: x.sexe });
        links.push({ source: parentId, target: id, strong: !!linked });
        if (linked && level < depthMax && !seenCase.has(linked.k) && byIndex.has(linked.k)) { seenCase.add(linked.k); expand(linked.k, id, level + 1); }
      });
    };
    expand(c.k, "C:" + c.k, 1);
    nodes.forEach(n => { if (n.parent === undefined && n.level > 0) n.parent = "C:" + c.k; if (n.level === -1) n.parent = null; });
    return { nodes, links };
  }
  function nodeDetail() {
    const k = S.nodeSel; if (!k) return `<div class="muted small">Aucun nœud sélectionné.</div>`;
    const x = contactBy.get(k), t = tRef();
    if (x) {
      const ds = daysSeen(x, t), st = cst(x, t);
      const rows = [["ID contact", x.id], ["Initiales", x.ini], ["Âge / sexe", `${x.age ?? "—"} ans · ${x.sexe || "—"}`], ["Relation", x.lien || "—"], ["Type de contact", x.type || "—"],
        ["Aire de santé", AN[x.aire] || x.aire || "—"], ["Dernière exposition", dfmt(x.dlc)], ["Enregistré le", dfmt(x.ent)], ["Fin de suivi", x._dlc !== null ? dfmt(H.iso(x._dlc + 21)) : "—"],
        ["Jours vus / attendus", `${ds.v} / ${ds.a}`], ["Dernière visite (vu)", lastSeen(x) ? dfmt(lastSeen(x)) : "jamais"], ["Superviseur / ReCo", `${x.sup || "—"} / ${x.reco || "—"}`], ["Vaccination", x.vacc || "—"]];
      return `<div class="detail-card"><div>${statusBadge(st)}</div>${rows.map(([a, b]) => `<div class="detail-row"><span>${a}</span><b>${esc(b)}</b></div>`).join("")}
        <div style="margin-top:6px">${H.miniGrid(x.codes, Math.min(21, Math.max(0, t - x._dlc)))}</div>
        ${x.lk ? `<div class="notice ${x.lkc === "À vérifier" ? "warn" : ""}"><b>Devenu cas : ${esc(x.lkc)}</b>, <a href="#" data-gocas="${esc(x.lk)}">${esc(x.lk)}</a> (rapprochement du nom du contact avec la liste des cas)</div>` : ""}</div>`;
    }
    const c = caseBy.get(String(k).replace(/^C:/, ""));
    if (c) return `<div class="detail-card"><div class="detail-row"><span>Cas</span><b><a href="#" data-gocas="${esc(c.k)}">${esc(c.id)}</a></b></div><div class="detail-row"><span>Classification</span><b>${esc(c.cls)}</b></div><div class="detail-row"><span>Aire</span><b>${esc(c.zs || "—")}</b></div><div class="detail-row"><span>Contacts listés</span><b>${nf(c.nc)}</b></div></div>`;
    return "";
  }
  function journeyCharts() {
    if (!TR) return;
    const k = S.cas, c = caseBy.get(k) || { k, id: k, ini: "?", cls: "" };
    const ctAll = byIndex.get(k) || [];
    if ($("#c-jrtraj") && ctAll.length) {
      const first = Math.min(...ctAll.map(x => x._dlc).filter(v => v !== null)) + 1;
      let d0 = allPeriod() ? first : Math.max(tFrom(), first);
      const d1 = tRef(); if (d1 - d0 > 120) d0 = d1 - 119;
      const rows = [];
      for (let d = d0; d <= d1; d++) {
        let a = 0, v = 0, n = 0, s = 0;
        ctAll.forEach(x => { const st = status(x, d); if (!st || st.sortie) return; a++; if (st.st === "Vu" || st.st === "Suspect") v++; else if (["Absence", "PDV", "JMV", "ReCo non passé"].includes(st.st)) n++; if (x.codes[d - x._dlc - 1] === "1") s++; });
        rows.push({ date: H.iso(d), a_suivre: a, vus: v, non_vus: n, suspects: s });
      }
      Ch.xy($("#c-jrtraj"), { data: rows, x: "date", height: 230, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), xLabelWidth: 48, noClip: true,
        series: [{ key: "vus", label: "Contacts vus", color: "--st-v24" }, { key: "non_vus", label: "Contacts non vus (absents, PDV, jamais vus)", color: "--st-nv" },
          { key: "suspects", label: "Devenus suspects", color: "--st-susp" }, { key: "a_suivre", label: "Contacts à suivre", color: "--s1", type: "line" }] });
    }
    const net = buildNetwork(c);
    if ($("#c-net")) Ch.network($("#c-net"), { nodes: net.nodes, links: net.links, rootId: "C:" + c.k, layout: S.netLayout, ringLabel: i => `Niveau ${i}`, sexIcons: S.netIcons,
      info: `${nf(net.nodes.length - 1)} nœuds · molette = zoom · glisser = déplacer`,
      onSelect: n => { if (n.ref.type === "contact") { S.nodeSel = n.ref.k; $("#node-detail").innerHTML = nodeDetail(); $$("tr[data-trow^='jr-ct|']").forEach(tr => tr.classList.toggle("selected", tr.dataset.trow === "jr-ct|" + n.ref.k)); } else if (n.ref.k !== c.k) H.go("journey", n.ref.k); else { S.nodeSel = "C:" + c.k; $("#node-detail").innerHTML = nodeDetail(); } } });
    $$("[data-nav]").forEach(b => b.addEventListener("click", () => { if (b.dataset.nav) H.go("journey", b.dataset.nav); }));
    const inp = $("#case-search"), res = $("#case-results"); if (!inp) return;
    const pool = [...new Set([...byIndex.keys(), ...caseBy.keys()])].map(k_ => caseBy.get(k_) || { k: k_, id: k_, ini: "", zs: AN[(byIndex.get(k_) || [{}])[0].aire] || "", cls: "Hors liste des cas", nc: (byIndex.get(k_) || []).length })
      .filter(x => !S.aire || x.as === S.aire || (!x.as && (byIndex.get(x.k) || [{}])[0].aire === S.aire)).sort((a, b) => (b.nc || 0) - (a.nc || 0));
    const nrm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let hl = 0, lst = [];
    const show = () => {
      const q = nrm(inp.value); if (!q) { res.classList.add("hide"); return; }
      lst = pool.filter(x => nrm(`${x.id} ${x.ini} ${x.zs}`).includes(q)).slice(0, 25);
      res.innerHTML = lst.map((x, i) => `<button data-k="${esc(x.k)}" class="${i === hl ? "hl" : ""}"><span><b>${esc(x.id)}</b> · ${esc(x.ini)} <span class="muted">${esc(x.zs || "")}</span></span><span>${badge(x.cls, "", clsColor(x.cls))} <span class="muted small">${nf(x.nc)} contacts</span></span></button>`).join("") || `<div class="muted small" style="padding:10px">Aucun résultat</div>`;
      res.classList.remove("hide");
    };
    inp.addEventListener("input", () => { hl = 0; show(); });
    inp.addEventListener("keydown", e => { if (e.key === "ArrowDown") { hl = Math.min(hl + 1, lst.length - 1); show(); e.preventDefault(); } if (e.key === "ArrowUp") { hl = Math.max(hl - 1, 0); show(); e.preventDefault(); } if (e.key === "Enter" && lst[hl]) H.go("journey", lst[hl].k); if (e.key === "Escape") res.classList.add("hide"); });
    res.addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) H.go("journey", b.dataset.k); });
  }

  /* ================================================================== CHAÎNES DE TRANSMISSION */
  function chainRows() {
    const ch = TR.chains || {}, mem = {};
    CAS.forEach(c => { if (c.ch) (mem[c.ch] = mem[c.ch] || []).push(c); });
    return (ch.resume || []).filter(x => (!Number(S.gen) || x.generations === Number(S.gen)) && (!S.aire || (mem[x.chaine] || []).some(c => c.aire === S.aire)) && (allPeriod() || (mem[x.chaine] || []).some(c => inPer(c.date))));
  }
  function chainsView() {
    if (!TR) return noTR();
    const ch = TR.chains || {}, st = ch.stats || {}, si = ch.intervalle_seriel || {};
    const rows = chainRows();
    if (!S.chain || !rows.some(x => x.chaine === S.chain)) S.chain = (rows[0] || {}).chaine || "";
    const cur = rows.find(x => x.chaine === S.chain) || {};
    const per = CAS.filter(c => !c.hors_zs && inPer(c.date) && (!S.aire || c.aire === S.aire));
    const known = per.filter(c => c.src).length;
    return `
    <div class="grid g5">
      ${kpi("Chaînes reconstituées", nf(rows.length), `${nf(rows.reduce((s, x) => s + x.cas, 0))} cas reliés (filtres appliqués) · ${nf(st.chaines)} au total`)}
      ${kpi("Chaînes de 3 cas ou plus", nf(rows.filter(x => x.cas >= 3).length), `jusqu'à ${nf(Math.max(0, ...rows.map(x => x.generations)))} générations`)}
      ${kpi("Chaînes actives (21 j)", nf(rows.filter(x => x.active_21j).length), "Dernier cas depuis moins de 21 jours", { cls: rows.some(x => x.active_21j) ? "alert" : "" })}
      ${kpi("Intervalle sériel médian", si.mediane !== undefined ? nf(si.mediane, 1) + " j" : "—", si.n ? `IQR ${nf(si.q1)}–${nf(si.q3)} j · n = ${nf(si.n)} paires` : "")}
      ${kpi("Cas de la période avec source connue", pc(per.length ? 100 * known / per.length : null, 0), `${nf(known)} / ${nf(per.length)} cas : contact suivi retrouvé dans la liste des cas`, { cls: per.length && 100 * known / per.length < 50 ? "alert" : "", meter: per.length ? 100 * known / per.length : null })}
    </div>
    <div class="flex" style="margin-bottom:10px"><span class="small muted">Générations de la chaîne</span>${segBtns("gen", GENS)}<span class="small muted">${nf(rows.length)} chaînes · ${perTxt()}</span></div>
    <div class="grid g12">
      ${panel("Liste des chaînes", "Cliquer pour afficher la chaîne", table("ch", rows, [{ k: "chaine", t: "Chaîne" }, { k: "cas", t: "Cas", num: true }, { k: "deces", t: "Décès", num: true }, { k: "generations", t: "Gén.", num: true }, { k: "dernier_cas", t: "Dernier cas", v: x => dshort(x.dernier_cas) }, { k: "active_21j", t: "Active", v: x => x.active_21j ? badge("Active", "b-crit") : badge("Éteinte", ""), csv: x => x.active_21j ? "Active" : "Éteinte" }, { k: "zones", t: "Aires de santé", wrap: true }],
        { sort: "cas", rowClick: true, rowKey: x => x.chaine, selected: x => x.chaine === S.chain, maxh: 640 }), { csv: "ch" })}
      ${panel(`Chaîne ${esc(S.chain)}`, `${nf(cur.cas)} cas · ${nf(cur.generations)} générations · ${esc(cur.zones || "")}`, `<div id="c-chain"></div>${legend([{ t: "Confirmé", c: "--st-conf" }, { t: "Probable", c: "--s5" }, { t: "Décédé (anneau)", c: "--ink" }, { t: "Lien contact suivi → cas", c: "--st-conf" }])}`,
        { png: "chaine_" + S.chain, tools: segBtns("chainLayout", [["time", "Chronologique"], ["tree", "Générations"]]) })}
    </div>
    ${panel("Intervalle sériel", "Jours entre le début des signes du cas source et du cas secondaire (dernière barre : 40 j et plus)", `<div id="c-si"></div><div class="notice">Un lien représente une relation épidémiologique documentée (contact suivi retrouvé dans la liste des cas par rapprochement des noms), pas une preuve génomique de transmission. Les rapprochements « à vérifier » ne sont pas utilisés.</div>`, { png: "intervalle_seriel" })}`;
  }
  function chainsCharts() {
    if (!TR) return;
    const ch = TR.chains || {};
    const hm = new Map((ch.intervalle_seriel?.histogramme || []).map(x => [x.jours, x.paires]));
    if ($("#c-si")) Ch.histogram($("#c-si"), { data: Array.from({ length: 41 }, (_, i) => ({ jours: i === 40 ? "40+" : i, paires: hm.get(i) || 0 })), x: "jours", y: "paires", label: "Paires de cas", height: 220, xLabel: v => v, xLabelWidth: 26 });
    if (!S.chain || !$("#c-chain")) return;
    const members = [...caseBy.values()].filter(c => c.ch === S.chain), set = new Set(members.map(c => c.k));
    const L = (ch.liens || []).filter(l => set.has(l.source) && set.has(l.target));
    const parentOf = {}; L.forEach(l => { if (!parentOf[l.target]) parentOf[l.target] = l.source; });
    const nodes = members.map(c => ({ id: c.k, parent: parentOf[c.k] || null, level: (c.gen || 1) - 1, shape: "case", label: c.ini, sex: c.sexe, sub: (c.id || "").slice(-9), color: clsColor(c.cls), ring: c.dc ? "--ink" : null,
      t: (c.on || c.date) ? new Date((c.on || c.date) + "T00:00:00Z").getTime() : null, title: `<b>${esc(c.id)}</b><div>${esc(c.cls)}${c.dc ? " · décédé" : ""}</div><div>Début : ${dfmt(c.on)}${c.oi ? " (imputé)" : ""}</div><div>${esc(c.zs || "")}</div><div>Génération ${c.gen || "?"}</div>`, ref: { type: "case", k: c.k } }));
    const links = L.map(l => ({ source: l.source, target: l.target, strong: true }));
    if (!nodes.length) { $("#c-chain").innerHTML = `<div class="empty">Aucune chaîne pour ces filtres.</div>`; return; }
    Ch.network($("#c-chain"), { nodes, links, rootId: (nodes.find(n => !n.parent) || {}).id, layout: S.chainLayout === "time" ? "time" : "tree", height: 520, sexIcons: false,
      info: `${nodes.length} cas · cliquer un cas pour ouvrir son parcours`, onSelect: n => H.go("journey", n.ref.k) });
  }

  /* ================================================================== DYNAMIQUE DE TRANSMISSION */
  const DY = (TR && TR.dynamique) || {}, RC = (TR && TR.reconstruction) || {};
  const AGEC = ["#3288BD", "#9ED1A3", "#FDAE61", "#E8684F", "#B0213A", "--sex-i"];
  const fmtR = v => v === null || v === undefined ? "—" : nf(v, 2);
  const ci = (a, b, d = 2) => (a === null || a === undefined) ? "" : `[${nf(a, d)}, ${nf(b, d)}]`;
  const pctS = v => (v >= 0 ? "+" : "") + nf(v, 1) + " %";
  const firstIdx = (rows, f) => { const i = rows.findIndex(f); return i < 0 ? null : i; };
  function dyGroups() { return DY.groupes || []; }
  function dyGroup() {
    const gs = dyGroups();
    if (S.aire && S._lastAire !== S.aire) { S._lastAire = S.aire; const id = "Z:" + AN[S.aire]; if (gs.some(g => g.id === id)) S.dynG = id; }
    if (!S.aire && S._lastAire) { S._lastAire = null; S.dynG = "National"; }
    if (!gs.some(g => g.id === S.dynG)) S.dynG = "National";
    return gs.find(g => g.id === S.dynG) || { id: "National", nom: `ZS ${D.meta.zone_de_sante}`, niveau: "Zone de santé" };
  }
  function groupSelect() {
    const gs = dyGroups();
    return `<label class="field">Territoire<select data-state="dynG">${["Zone de santé", "Aire de santé"].map(l => { const o = gs.filter(g => g.niveau === l); return o.length ? `<optgroup label="${esc(l)}">${o.map(g => `<option value="${esc(g.id)}" ${S.dynG === g.id ? "selected" : ""}>${esc(g.nom)} (${nf(g.cas)})</option>`).join("")}</optgroup>` : ""; }).join("")}</select></label>`;
  }
  function seriesRows(gid) {
    const s = (DY.series || {})[gid]; if (!s) return [];
    return s.observes.map((v, i) => ({ date: addDays(s.debut, i), obs: v, corr: s.corriges[i], comp: s.completude[i], imp: s.imputes[i], notif: s.notification[i] }));
  }
  function growthFit() {
    const g = ((DY.croissance || {})[S.dynG] || {})[S.growBase];
    if (!g) return {};
    const fits = g.fits || {}; let w = S.growWin;
    if (!fits[w]) w = fits["12s"] ? "12s" : "tout";
    return { g, fit: fits[w], win: w };
  }
  function growthText(f) {
    if (!f || f.r === undefined) return [];
    const up = f.sens === "croissance", down = f.sens === "decroissance";
    const dbl = f.sens === "incertain" ? "" : f.temps_doublement ? `temps de doublement ${nf(f.temps_doublement, 1)} j${f.temps_doublement_ic95 ? ` (IC 95 % ${nf(f.temps_doublement_ic95[0], 1)}, ${f.temps_doublement_ic95[1] ? nf(f.temps_doublement_ic95[1], 1) : "∞"} j)` : ""}` : "";
    const half = f.sens === "incertain" ? "" : f.temps_demi ? `temps de division par deux ${nf(f.temps_demi, 1)} j${f.temps_demi_ic95 ? ` (IC 95 % ${nf(f.temps_demi_ic95[0], 1)}, ${f.temps_demi_ic95[1] ? nf(f.temps_demi_ic95[1], 1) : "∞"} j)` : ""}` : "";
    return [
      `Taux de croissance journalier r = <b>${nf(f.r, 4)}</b> ${ci(f.r_ic95[0], f.r_ic95[1], 4)}, soit une variation hebdomadaire de <b>${pctS(f.variation_hebdo_pct)}</b> ${ci(f.variation_hebdo_ic95[0], f.variation_hebdo_ic95[1], 1)} ; ${dbl || half || "aucune tendance nette"}.`,
      up ? `<b>Croissance exponentielle significative</b> : l'intervalle de confiance de r est entièrement positif.` : down ? `<b>Décroissance significative</b> : l'intervalle de confiance de r est entièrement négatif.` : `<b>Tendance non significative</b> : l'intervalle de confiance de r contient 0 (plateau ou données insuffisantes) ; le temps de doublement n'est pas interprétable.`,
      f.R_implicite ? `R implicite (Wallinga & Lipsitch, intervalle sériel retenu) : <b>${fmtR(f.R_implicite)}</b> ${f.R_implicite_ic95 && f.R_implicite_ic95[0] ? ci(f.R_implicite_ic95[0], f.R_implicite_ic95[1]) : ""}.` : "",
      `Ajustement sur ${nf(f.semaines)} semaines (${dshort(f.debut)} → ${dshort(f.fin)}), R² = ${nf(f.r2, 2)}${f.zeros_ignores ? ` ; ${f.zeros_ignores} semaine(s) à 0 cas ignorée(s)` : ""}.`];
  }
  function dynamicsView() {
    if (!TR || !DY.groupes) return noTR();
    const grp = dyGroup(), gid = grp.id;
    const rt = (DY.rt || {})[gid] || {}, cons = rt.dernier_consolide || {}, last = rt.dernier || {};
    const lik = (DY.R_vraisemblance || {})[gid] || {}, l28 = lik["28j"] || {};
    const pj = (DY.projections || {})[gid] || {}, p14 = (pj.totaux || {})["14j"] || {};
    const { fit } = growthFit();
    const siu = DY.intervalle_seriel_utilise || {}, imp = DY.imputation || {};
    const winOpts = [["6s", "6 sem."], ["12s", "12 sem."], ["pic", "Depuis le pic"], ["split", "2 phases"], ["tout", "Tout"]];
    const rtTrend = cons.mediane === undefined ? "" : cons.q975 < 1 ? "transmission en recul (R < 1 avec ≥ 97,5 % de probabilité)" : cons.q025 > 1 ? "transmission en expansion (R > 1 avec ≥ 97,5 % de probabilité)" : "transmission proche du seuil (R ≈ 1)";
    return `
    <div class="flex between" style="margin-bottom:12px">
      <div class="flex">${groupSelect()}</div>
      <div class="small muted">Cas confirmés et probables par date de début des signes · ${nf(imp.dds_imputee)} dates imputées (${pc(imp.pct_imputee, 0)}) · dernier jour consolidé : ${dshort(cons.date)} · modèles estimés sur tout l'historique, affichage ${perTxt()}</div>
    </div>
    <div class="grid g5">
      ${kpi("Rt consolidé", cons.mediane !== undefined ? fmtR(cons.mediane) : "—", cons.mediane !== undefined ? `IC 95 % ${fmtR(cons.q025)}, ${fmtR(cons.q975)} · ${dshort(cons.date)} · P(R>1) = ${pc(100 * cons.p_sup_1, 0)}` : "Effectif insuffisant", { cls: cons.q025 > 1 ? "alert" : cons.q975 < 1 ? "good" : "", color: "--rc-rt" })}
      ${kpi("Rt provisoire (derniers jours)", last.mediane !== undefined ? fmtR(last.mediane) : "—", last.mediane !== undefined ? `IC 95 % ${fmtR(last.q025)}, ${fmtR(last.q975)} · ${dshort(last.date)} · à confirmer` : "", { color: "--muted" })}
      ${kpi("Variation hebdomadaire", fit && fit.r !== undefined ? pctS(fit.variation_hebdo_pct) : fit && fit.apres ? pctS(fit.apres.variation_hebdo_pct) : "—", fit && fit.r !== undefined ? (fit.sens === "croissance" ? `Doublement ${nf(fit.temps_doublement, 0)} j · ` : fit.sens === "decroissance" ? `Division par deux ${nf(fit.temps_demi, 0)} j · ` : "") + (fit.sens === "croissance" ? "croissance significative" : fit.sens === "decroissance" ? "décroissance significative" : "tendance non significative (plateau)") : "Modèle à 2 phases", { color: "--s2" })}
      ${kpi("R (vraisemblance, 28 j)", l28.R_ml !== undefined ? fmtR(l28.R_ml) : "—", l28.R_ml !== undefined ? `IC 95 % ${fmtR(l28.ic95[0])}, ${fmtR(l28.ic95[1])} · ${nf(l28.cas, 0)} cas` : "", { color: "--rc-r1" })}
      ${kpi("Cas projetés sur 14 jours", p14.mediane !== undefined ? nf(p14.mediane) : "—", p14.mediane !== undefined ? `Intervalle 80 % ${nf(p14.q10)}, ${nf(p14.q90)} · P(0 cas) ${pc(100 * p14.p_aucun_cas, 0)}` : "", { color: "--s7" })}
    </div>
    ${rt.dernier_consolide ? `<div class="notice ${cons.q025 > 1 ? "crit" : ""}"><b>Synthèse, ${esc(grp.nom)}</b> : ${rtTrend}. Intervalle sériel utilisé : ${nf(siu.moyenne, 1)} ± ${nf(siu.ecart_type, 1)} j (${esc(siu.source || "")}). Les derniers jours restent incomplets malgré la correction du retard de notification : privilégier le Rt consolidé pour la décision.</div>` : ""}
    ${panel("Courbe épidémique hebdomadaire et ajustement log-linéaire", "Régression du logarithme de l'incidence hebdomadaire ; la courbe et sa bande donnent la tendance exponentielle et son IC 95 %",
      `<div id="c-grow"></div><div class="statgrid" id="grow-stats"></div><div id="grow-interp"></div>`,
      { png: "croissance_loglineaire", tools: `${segBtns("growBase", [["dds", "Début des signes (corrigé)"], ["notification", "Notification"]])}${segBtns("growWin", winOpts)}` })}
    ${panel("Courbe épidémique quotidienne par classe d'âge", "Un carré = un cas lorsque les effectifs sont faibles ; zone grisée = jours encore incomplets",
      `<div id="c-dsex"></div><div id="dsex-interp"></div>`, { png: "courbe_quotidienne_age", tools: segBtns("dyBase", [["o", "Début des signes"], ["n", "Notification"]]) })}
    ${panel("Nombre de reproduction effectif Rt (EpiEstim)", "Fenêtres glissantes de 7 jours, intervalle sériel paramétrique avec incertitude ; en haut l'incidence, en bas Rt (médiane, IC 50 % et 95 %), ligne pointillée : seuil R = 1",
      `<div class="chart-stack"><div id="c-rt-inc"></div><div id="c-rt"></div></div><div id="rt-interp"></div>`, { png: "rt_epiestim", tools: segBtns("rtDays", [["60", "60 j"], ["120", "120 j"], ["200", "Tout"]]) })}
    <div class="grid g2">
      ${panel("Vraisemblance de R (earlyR)", "R supposé constant sur la fenêtre ; ligne verticale : seuil R = 1", `<div id="c-rlik"></div><div id="rlik-interp"></div>`, { png: "vraisemblance_R", tools: segBtns("rlWin", [["14j", "14 j"], ["28j", "28 j"], ["tout", "Tout"]]) })}
      ${panel("Force d'infection λ", "λt = Σ I(t−s)·w(s) : cas attendus si R = 1 (barres) ; cas observés (tiges)", `<div id="c-lambda"></div><div id="lambda-interp"></div>`, { png: "force_infection" })}
    </div>
    ${panel("Projections à court terme (processus de branchement)", `1 000 simulations, R tiré du posterior du dernier Rt consolidé et supposé constant · départ ${dshort(pj.depart)}`,
      `<div id="c-proj"></div><div id="proj-table"></div><div id="proj-interp"></div>`, { png: "projections", tools: segBtns("projH", [["14", "14 j"], ["30", "30 j"]]) })}
    <div class="grid g2">
      ${panel("Intervalle sériel", "Histogramme (saumon) et loi gamma discrétisée ajustée (points violets) · paires cas source → cas secondaire de la zone de santé", `<div id="c-si-fit"></div><div id="si-sum"></div>`, { png: "intervalle_seriel_ajuste" })}
      ${panel("Période d'incubation", "Dernier contact déclaré → début des signes (contacts devenus cas, lien certain ou probable)", `<div id="c-inc-fit"></div><div id="inc-sum"></div>`, { png: "incubation_ajustee" })}
    </div>
    ${panel("Autres délais épidémiologiques", "Distribution observée et loi gamma discrétisée ajustée (cas débutés il y a plus de 30 jours pour limiter la troncature)", `<div id="c-dl-fit"></div><div id="dl-sum"></div>`,
      { png: "delais_ajustes", tools: `<select data-state="distK">${[["dds_notification", "Début des signes → notification (confirmation)"], ["dds_admission", "Début des signes → isolement"], ["prelevement_resultat", "Isolement → confirmation"]].map(([k, t]) => `<option value="${k}" ${S.distK === k ? "selected" : ""}>${t}</option>`).join("")}</select>` })}
    ${panel("Létalité par classe d'âge", "Cas confirmés et probables ; létalité avec intervalle de Wilson à 95 %", `<div id="c-cfr-age"></div><div id="cfr-tbl"></div>`, { png: "letalite_age" })}`;
  }
  function distChart(id, d, opt = {}) {
    const box = $(id); if (!box) return;
    if (!d || !d.histogramme) { box.innerHTML = `<div class="empty">Données insuffisantes</div>`; return; }
    const n = d.n || 1, fitp = d.ajustement && d.ajustement.pmf;
    const maxK = Math.min(60, Math.max(15, ...d.histogramme.map((v, i) => v ? i : 0)) + 3);
    const rows = Array.from({ length: maxK + 1 }, (_, k) => ({ k, freq: d.histogramme[k] / n, fit: fitp ? fitp[k] : null, ref: opt.ref ? opt.ref[k] : null }));
    Ch.xy(box, { data: rows, x: "k", height: 240, barWidth: .98, barStroke: "--surface", xLabel: (v, r, tip) => tip ? `${v} jours` : v, xLabelWidth: 26, digits: 3, yFmt: v => nf(v, 2),
      series: [{ key: "freq", label: "Distribution observée (proportion)", color: "--rc-salmon" }, ...(fitp ? [{ key: "fit", label: "Gamma discrétisée ajustée", color: "--rc-purple", type: "line", dash: "5 4", markers: true, r: 2.6 }] : []),
        ...(opt.ref ? [{ key: "ref", label: opt.refLabel, color: "--ink-2", type: "line", dash: "2 3", markers: false, width: 1.5 }] : [])] });
  }
  function discGammaJS(mean, sd, nmax = 60) {
    const sh = (mean / sd) ** 2, sc = sd * sd / mean, lg = lgamma(sh), pdf = x => x <= 0 ? 0 : Math.exp((sh - 1) * Math.log(x) - x / sc - lg - sh * Math.log(sc));
    const out = []; for (let k = 0; k <= nmax; k++) { let s = 0; for (let j = 0; j < 20; j++) s += pdf(k + (j + .5) / 20) / 20; out.push(s); } return out;
  }
  function lgamma(z) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < .5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + .5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x); }
  function distSummary(d, ref) {
    if (!d || !d.resume) return `<div class="muted small">Données insuffisantes (n = ${nf(d ? d.n : 0)})</div>`;
    const r = d.resume, f = d.ajustement || {};
    return `<table class="rsum"><thead><tr><th>Résumé</th><th>Min.</th><th>1er quartile</th><th>Médiane</th><th>Moyenne</th><th>3e quartile</th><th>Max.</th><th>n</th></tr></thead>
      <tbody><tr><td>Observé</td><td>${nf(r.min)}</td><td>${nf(r.q1, 1)}</td><td>${nf(r.mediane, 1)}</td><td>${nf(r.moyenne, 2)}</td><td>${nf(r.q3, 1)}</td><td>${nf(r.max)}</td><td>${nf(d.n)}</td></tr></tbody></table>
      ${f.moyenne ? `<div class="statgrid">${stat("Moyenne μ (gamma)", `${nf(f.moyenne, 2)} j`, `IC 95 % ${nf(f.moyenne_ic95[0], 2)}, ${nf(f.moyenne_ic95[1], 2)}`)}${stat("Écart-type σ", `${nf(f.ecart_type, 2)} j`, `CV = ${nf(f.cv, 3)}`)}${stat("Forme / échelle", `${nf(f.shape, 3)} / ${nf(f.scale, 3)}`, `log-vraisemblance ${nf(f.loglik, 1)}`)}${stat("Médiane / 95e percentile", `${nf(f.mediane, 1)} / ${nf(f.p95, 1)} j`, "")}</div>` : ""}
      ${(d.exclus_negatifs || d.exclus_sup_60 || d.exclus_inf_1) ? `<div class="small muted" style="margin-top:6px">Exclus : ${nf(d.exclus_negatifs || 0)} valeurs négatives · ${nf(d.exclus_sup_60 || 0)} > 60 j${d.exclus_inf_1 ? ` · ${nf(d.exclus_inf_1)} < 1 j (exposition déclarée après le début des signes)` : ""}</div>` : ""}
      ${ref ? `<div class="interp"><b>Comparaison</b> : ${ref}</div>` : ""}`;
  }
  function dynamicsCharts() {
    if (!TR || !DY.groupes) return;
    const grp = dyGroup(), gid = grp.id;
    const rows = seriesRows(gid);
    /* --- croissance log-linéaire --- */
    const { g, fit, win } = growthFit();
    if (g && $("#c-grow")) {
      const wk = g.semaines.map(r => ({ week: r.week, n: r.n }));
      const put = (f, k) => (f?.ajuste || []).forEach(a => { const r = wk.find(x => x.week === a.week); if (r) { r["fit" + k] = a.fit; r["lo" + k] = a.lo; r["hi" + k] = a.hi; } });
      const split = win === "split" && fit && fit.avant;
      if (split) { put(fit.avant, 1); put(fit.apres, 2); } else if (fit) put(fit, 1);
      Ch.xy($("#c-grow"), { data: wk, x: "week", height: 290, xLabel: (v, r, tip) => tip ? `Semaine du ${dfmt(v)}` : dshort(v), tipSkipNull: true,
        bands: [{ lo: "lo1", hi: "hi1", color: "--s2", label: "IC 95 % de l'ajustement", opacity: .18 }, ...(split ? [{ lo: "lo2", hi: "hi2", color: "--s7", label: "IC 95 %, phase 2", opacity: .18 }] : [])],
        vlines: split ? [{ x: fit.separation, color: "--ink-2", label: "Changement de phase" }] : [],
        series: [{ key: "n", label: S.growBase === "dds" ? "Cas / semaine (début des signes, corrigé)" : "Cas / semaine (notification)", color: "--rc-bar" },
          { key: "fit1", label: split ? "Phase 1" : "Ajustement log-linéaire", color: "--s2", type: "line", markers: false, width: 2.5 },
          ...(split ? [{ key: "fit2", label: "Phase 2", color: "--s7", type: "line", markers: false, width: 2.5 }] : [])] });
      const fs = split ? [["Phase 1", fit.avant], ["Phase 2", fit.apres]] : [["", fit]];
      $("#grow-stats").innerHTML = fs.filter(x => x[1]).map(([lab, f]) => [
        stat(`${lab ? lab + " · " : ""}r par jour`, nf(f.r, 4), ci(f.r_ic95[0], f.r_ic95[1], 4)),
        stat(`${lab ? lab + " · " : ""}Variation hebdomadaire`, pctS(f.variation_hebdo_pct), ci(f.variation_hebdo_ic95[0], f.variation_hebdo_ic95[1], 1)),
        stat(`${lab ? lab + " · " : ""}${f.r >= 0 ? "Temps de doublement" : "Temps de division par deux"}`, f.sens === "incertain" ? "non interprétable" : f.r >= 0 ? (f.temps_doublement ? nf(f.temps_doublement, 1) + " j" : "—") : (f.temps_demi ? nf(f.temps_demi, 1) + " j" : "—"), ""),
        stat(`${lab ? lab + " · " : ""}R implicite`, fmtR(f.R_implicite), f.R_implicite_ic95 && f.R_implicite_ic95[0] ? ci(f.R_implicite_ic95[0], f.R_implicite_ic95[1]) : ""),
        stat(`${lab ? lab + " · " : ""}R²`, nf(f.r2, 3), `${nf(f.semaines)} semaines`)].join("")).join("");
      const items = split ? [`Meilleure séparation en deux phases le <b>${dfmt(fit.separation)}</b>.`, ...growthText(fit.avant).slice(0, 2).map(x => `Phase 1, ${x}`), ...growthText(fit.apres).slice(0, 3).map(x => `Phase 2, ${x}`)] : growthText(fit);
      $("#grow-interp").innerHTML = interp("Interprétation", [...items, S.growBase === "dds" ? "Base « début des signes » : les semaines dont la complétude moyenne est < 80 % sont exclues ; l'incidence est corrigée du retard de notification." : "Base « notification » : reflète aussi l'effort de détection et les retards de saisie ; la semaine en cours est exclue."],
        "Limites : modèle exponentiel simple (pas de saturation), sensible aux changements de détection ; le temps de doublement n'a de sens que si r est significativement différent de 0.");
    }
    /* --- courbe quotidienne par classe d'âge --- */
    if ($("#c-dsex")) {
      const E = DY.epicourbes || {}, base = S.dyBase;
      const end = S.date, start = S.preset === "tout" ? (rows[0] || {}).date || addDays(end, -119) : S.from;
      const match = r => gid === "National" || r[3] === gid.slice(2);
      const map = new Map(); for (let d = start; d <= end; d = addDays(d, 1)) map.set(d, { date: d, a0: 0, a1: 0, a2: 0, a3: 0, a4: 0, a5: 0 });
      (E.quotidien || []).forEach(r => { if (r[0] !== base || !map.has(r[1]) || !match(r)) return; const o = map.get(r[1]); o["a" + r[5]] += r[7]; });
      const data = [...map.values()];
      const compOf = d => { const x = rows.find(y => y.date === d); return x ? x.comp : 1; };
      const prov = base === "o" ? firstIdx(data, r => compOf(r.date) < .9) : Math.max(0, data.length - 3);
      Ch.xy($("#c-dsex"), { data, x: "date", stacked: true, showCases: true, height: 260, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), xLabelWidth: 52, noClip: true,
        series: (DY.classes_age || []).map((a, i) => ({ key: "a" + i, label: a === "Inconnu" ? "Âge inconnu" : a + " ans", color: AGEC[i] })), shade: prov !== null ? { from: prov, label: "incomplet" } : null });
      const tot = data.reduce((s, r) => s + r.a0 + r.a1 + r.a2 + r.a3 + r.a4 + r.a5, 0), kids = data.reduce((s, r) => s + r.a0 + r.a1, 0);
      $("#dsex-interp").innerHTML = interp("Lecture", [`${perTxt()} (${esc(grp.nom)}) : <b>${nf(tot)}</b> cas, dont ${nf(kids)} âgés de 20 ans ou moins (${pc(100 * kids / Math.max(tot, 1), 0)}).`,
        base === "o" ? "Par date de début des signes, les derniers jours sont sous-estimés tant que les cas n'ont pas été notifiés (zone grisée)." : "Par date de notification, les 3 derniers jours peuvent être incomplets (saisie en cours)."]);
    }
    /* --- Rt --- */
    const rt = (DY.rt || {})[gid];
    if (rt && $("#c-rt")) {
      const nd = Number(S.rtDays);
      const R = rt.lignes.map(a => Object.fromEntries(rt.cols.map((c, i) => [c, a[i]]))).filter(r => r.date <= S.date).slice(-nd);
      const prov = firstIdx(R, r => r.provisoire);
      const inc = R.map(r => { const x = rows.find(y => y.date === r.date) || {}; return { date: r.date, obs: x.obs, corr: x.corr }; });
      Ch.xy($("#c-rt-inc"), { data: inc, x: "date", height: 150, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), shade: prov !== null ? { from: prov, label: "provisoire" } : null,
        series: [{ key: "obs", label: "Cas observés (début des signes)", color: "--rc-bar" }, { key: "corr", label: "Corrigés du retard de notification", color: "--s2", type: "line", markers: false }] });
      Ch.xy($("#c-rt"), { data: R, x: "date", height: 250, digits: 2, xLabel: (v, r, tip) => tip ? `Fenêtre se terminant le ${dfmt(v)}` : dshort(v),
        shade: prov !== null ? { from: prov, label: "provisoire" } : null,
        bands: [{ lo: "q025", hi: "q975", color: "--rc-rt", label: "IC crédible 95 %", opacity: .22 }, { lo: "q25", hi: "q75", color: "--rc-rt", label: "IC 50 %", opacity: .3 }],
        hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }],
        tipExtra: r => `<div class="row"><span>P(R > 1)</span><b>${pc(100 * r.p_sup_1, 0)}</b></div><div class="row"><span>Cas dans la fenêtre</span><b>${nf(r.cas_fenetre, 0)}</b></div>`,
        series: [{ key: "mediane", label: "Rt médian", color: "--rc-rt", type: "line", markers: false, width: 2.4 }] });
      const c = rt.dernier_consolide || {}, l = rt.dernier || {};
      const R7 = R.filter(r => !r.provisoire); const prev = R7.length > 14 ? R7[R7.length - 15] : null;
      $("#rt-interp").innerHTML = interp("Interprétation", [
        c.mediane !== undefined ? `Dernier Rt consolidé (${dfmt(c.date)}) : <b>${fmtR(c.mediane)}</b> ${ci(c.q025, c.q975)} ; P(R > 1) = <b>${pc(100 * c.p_sup_1, 0)}</b>.` : "",
        prev ? `Il y a deux semaines : ${fmtR(prev.mediane)} ${ci(prev.q025, prev.q975)} → ${c.mediane < prev.mediane ? "baisse" : "hausse"} de la transmission.` : "",
        l.mediane !== undefined && l.provisoire ? `Les fenêtres les plus récentes (zone grisée) donnent ${fmtR(l.mediane)} ${ci(l.q025, l.q975)} : valeur provisoire, généralement sous-estimée tant que les notifications tardives ne sont pas saisies.` : "",
        c.mediane !== undefined ? (c.q975 < 1 ? "Chaque cas génère en moyenne moins d'un cas secondaire : l'épidémie décroît si les mesures sont maintenues." : c.q025 > 1 ? "Chaque cas génère en moyenne plus d'un cas secondaire : l'épidémie croît ; renforcer isolement, suivi des contacts et vaccination en anneau." : "R est proche de 1 : situation d'équilibre fragile, un relâchement peut relancer la croissance.") : ""],
        "Limites (EpiEstim) : suppose une détection constante et des cas tous locaux (les cas importés d'autres zones gonflent Rt) ; sensibilité au choix de l'intervalle sériel ; une aire de santé a peu de cas : intervalles larges.");
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
          series: [{ key: "v", label: "Vraisemblance relative", color: "--rc-purple", type: "area", markers: false }],
          vlines: [{ i: idxOf(1), color: "--rc-r1", label: "R = 1", dash: "0" }, { i: idxOf(L0.R_ml), color: "--ink-2", label: `MV ${nf(L0.R_ml, 3)}`, dy: 14 }, { i: idxOf(L0.ic95[0]), color: "--muted", dash: "2 3" }, { i: idxOf(L0.ic95[1]), color: "--muted", dash: "2 3" }] });
        $("#rlik-interp").innerHTML = interp("Interprétation", [`Estimation du maximum de vraisemblance : <b>R = ${nf(L0.R_ml, 3)}</b> ${ci(L0.ic95[0], L0.ic95[1], 3)} sur ${L0.fenetre_jours} jours (${nf(L0.cas, 0)} cas) ; P(R > 1) = ${pc(100 * L0.p_sup_1, 1)}.`,
          (L0.ic95[1] < 1) ? "R = 1 est en dehors de l'intervalle : la décroissance est nette sur cette fenêtre." : (L0.ic95[0] > 1) ? "R = 1 est en dehors de l'intervalle : la croissance est nette sur cette fenêtre." : "R = 1 est compatible avec les données de cette fenêtre."],
          "Hypothèse clé : R constant et intervalle sériel connu.");
      }
      const lam = (lk.lambda || []).map(a => ({ date: a[0], lam: a[1], obs: a[2] })).filter(r => r.date <= S.date).slice(-60);
      Ch.xy($("#c-lambda"), { data: lam, x: "date", height: 250, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), digits: 1,
        series: [{ key: "lam", label: "Force d'infection λ (cas attendus si R = 1)", color: "--rc-grey" }, { key: "obs", label: "Cas observés (corrigés)", color: "--rc-rt", type: "stem" }] });
      const l14 = lam.slice(-14), sl = l14.reduce((s, r) => s + r.lam, 0), so = l14.reduce((s, r) => s + (r.obs || 0), 0);
      $("#lambda-interp").innerHTML = interp("Lecture", [`Sur les 14 derniers jours disponibles : ${nf(so, 0)} cas observés pour ${nf(sl, 0)} attendus si R = 1 → rapport <b>${nf(so / Math.max(sl, 1e-9), 2)}</b> (estimation grossière de R).`, "Quand les tiges restent sous les barres, chaque génération est plus petite que la précédente."]);
    }
    /* --- projections --- */
    const pj = (DY.projections || {})[gid];
    if (pj && $("#c-proj")) {
      const Hh = Number(S.projH), P = pj.lignes.map(a => Object.fromEntries(pj.cols.map((c, i) => [c, a[i]])));
      const end = D.meta.date_rapport, stop = addDays(end, Hh);
      const hist = rows.filter(r => r.date >= addDays(pj.depart, -45) && r.date < pj.depart).map(r => ({ date: r.date, obs: r.obs, corr: r.corr }));
      const fut = P.filter(r => r.date <= stop).map(r => { const x = rows.find(y => y.date === r.date) || {}; return { date: r.date, obs: x.obs, corr: x.corr, med: r.mediane, q10: r.q10, q90: r.q90, q025: r.q025, q975: r.q975, p1: r.p_au_moins_1 }; });
      const data = hist.concat(fut), iEnd = data.findIndex(r => r.date === end);
      Ch.xy($("#c-proj"), { data, x: "date", height: 300, digits: 1, noClip: true, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), tipSkipNull: true,
        bands: [{ lo: "q025", hi: "q975", color: "--s7", label: "Intervalle 95 %", opacity: .12 }, { lo: "q10", hi: "q90", color: "--s7", label: "Intervalle 80 % (q10–q90)", opacity: .22 }],
        vlines: [{ x: pj.depart, edge: true, color: "--muted", label: "début de projection" }, ...(iEnd >= 0 ? [{ i: iEnd, color: "--ink-2", label: "aujourd'hui", dy: 14 }] : [])],
        tipExtra: r => r.p1 !== undefined ? `<div class="row"><span>P(≥ 1 cas)</span><b>${pc(100 * r.p1, 0)}</b></div>` : "",
        series: [{ key: "obs", label: "Observés (début des signes)", color: "--rc-bar" }, { key: "corr", label: "Corrigés du retard", color: "--s2", type: "line", markers: false }, { key: "med", label: "Projection médiane", color: "--s7", type: "line", markers: false, width: 2.4 }] });
      const pick = P.filter(r => r.date > end && r.date <= stop).filter((r, i, a) => i % 7 === 6 || i === 0 || i === a.length - 1);
      const tt = pj.totaux || {};
      $("#proj-table").innerHTML = `<table class="rsum"><thead><tr><th>Date</th><th>Min.</th><th>1er quartile</th><th>Médiane</th><th>Moyenne</th><th>3e quartile</th><th>Max.</th><th>P(≥ 1 cas)</th></tr></thead><tbody>${pick.map(r => `<tr><td>${dfmt(r.date)}</td><td>${nf(r.min)}</td><td>${nf(r.q25)}</td><td>${nf(r.mediane)}</td><td>${nf(r.moyenne, 2)}</td><td>${nf(r.q75)}</td><td>${nf(r.max)}</td><td>${pc(100 * r.p_au_moins_1, 1)}</td></tr>`).join("")}</tbody></table>
        <div class="statgrid">${["7j", "14j", "30j"].filter(k => tt[k]).map(k => stat(`Total sur ${k.replace("j", " jours")}`, nf(tt[k].mediane), `80 % : ${nf(tt[k].q10)}, ${nf(tt[k].q90)} · 95 % : ${nf(tt[k].q025)}, ${nf(tt[k].q975)}`)).join("")}${stat("R utilisé", `${fmtR(pj.R_utilise?.mediane)}`, ci(pj.R_utilise?.q025, pj.R_utilise?.q975))}</div>`;
      const t14 = tt["14j"] || {};
      $("#proj-interp").innerHTML = interp("Interprétation", [
        `Si la transmission reste au niveau du dernier Rt consolidé (${fmtR(pj.R_utilise?.mediane)}), on attend environ <b>${nf(t14.mediane)}</b> nouveaux cas (date de début) sur les 14 prochains jours (80 % : ${nf(t14.q10)}, ${nf(t14.q90)}).`,
        t14.p_aucun_cas !== undefined ? `Probabilité qu'aucun cas n'apparaisse sur 14 jours : <b>${pc(100 * t14.p_aucun_cas, 1)}</b>, ${t14.p_aucun_cas < .05 ? "la fin de l'épidémie n'est pas en vue à court terme ; ne pas réduire la riposte." : "la probabilité d'extinction devient non négligeable, mais la surveillance doit être maintenue 42 jours."}` : ""],
        "Limites : R constant (pas d'effet des interventions futures), pas d'importations ; au-delà de 2–3 semaines, ce sont des scénarios.");
    }
    /* --- distributions --- */
    const ds = DY.distributions || {};
    const si = ds.si, inc = ds.incubation;
    distChart("#c-si-fit", si, { ref: discGammaJS(15.3, 9.3), refLabel: "Référence OMS 2014 (15,3 ± 9,3 j)" });
    if ($("#si-sum")) $("#si-sum").innerHTML = distSummary(si, `intervalle utilisé pour Rt : ${nf((DY.intervalle_seriel_utilise || {}).moyenne, 1)} ± ${nf((DY.intervalle_seriel_utilise || {}).ecart_type, 1)} j (${esc((DY.intervalle_seriel_utilise || {}).source || "")}). Les paires de la zone de santé viennent d'un rapprochement des noms : l'ajustement local n'est retenu qu'à partir de 60 paires.`);
    distChart("#c-inc-fit", inc);
    if ($("#inc-sum")) $("#inc-sum").innerHTML = distSummary(inc, inc && inc.ajustement ? `moyenne locale ${nf(inc.ajustement.moyenne, 1)} j (95e percentile ${nf(inc.ajustement.p95, 1)} j) contre 11,4 j (95e percentile 21 j) pour l'OMS (2014). ${inc.n < 50 ? "Effectif limité : interpréter avec prudence ; la durée de suivi de 21 jours reste la norme." : ""}` : "");
    distChart("#c-dl-fit", ds[S.distK]);
    if ($("#dl-sum")) $("#dl-sum").innerHTML = distSummary(ds[S.distK]);
    /* --- létalité par âge (cas de la zone de santé) --- */
    if ($("#c-cfr-age")) {
      const cls = [["0–10", 0, 10], ["11–20", 11, 20], ["21–30", 21, 30], ["31–40", 31, 40], ["41+", 41, 200]];
      const sel = [...caseBy.values()].filter(c => !c.hors && (gid === "National" || c.zs === gid.slice(2)) && c.age !== null && c.age !== undefined);
      const wil = (k, n) => { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [100 * (c - m) / d, 100 * (c + m) / d]; };
      const data = cls.map(([l, a, b]) => { const g = sel.filter(c => Math.floor(c.age) >= a && Math.floor(c.age) <= b), k = g.filter(c => c.dc).length; const w = wil(k, g.length); return { classe: l, cas: g.length, deces: k, let: g.length ? 100 * k / g.length : null, lo: w[0], hi: w[1] }; });
      Ch.xy($("#c-cfr-age"), { data, x: "classe", height: 230, percent: true, digits: 1, xLabel: (v, r, tip) => tip ? `${v} ans, ${nf(r.cas)} cas, ${nf(r.deces)} décès` : v, series: [{ key: "let", label: "Létalité", color: "--rc-rt" }] });
      $("#cfr-tbl").innerHTML = `<table class="rsum"><thead><tr><th>Âge (ans)</th><th>Cas</th><th>Décès</th><th>Létalité</th><th>IC 95 % (Wilson)</th></tr></thead><tbody>${data.map(r => `<tr><td>${r.classe}</td><td>${nf(r.cas)}</td><td>${nf(r.deces)}</td><td>${pc(r.let, 1)}</td><td>${r.lo !== null ? `${nf(r.lo, 1)}, ${nf(r.hi, 1)} %` : "—"}</td></tr>`).join("")}</tbody></table>`;
    }
  }

  /* ================================================================== RECONSTRUCTION */
  function reconView() {
    if (!TR || !RC.resume) return noTR();
    const s = RC.resume || {}, A = s.A || {}, B = s.B || {}, off = s.offspring || {}, nb = off.ajustement || {};
    const zones = [...new Set([...caseBy.values()].filter(c => c.on && !c.hors).map(c => c.zs).filter(Boolean))].sort();
    if (S.aire) S.recZone = AN[S.aire];
    if (S.recZone && !zones.includes(S.recZone)) S.recZone = "";
    if (!S.recZone) { const cnt = {}; (RC.liens || []).forEach(l => { if (l[2] >= Number(S.recSup)) { const c = caseBy.get(l[1]); if (c && c.zs) cnt[c.zs] = (cnt[c.zs] || 0) + 1; } }); S.recZone = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || zones[0] || ""; }
    const n05 = (RC.liens || []).filter(l => l[2] >= .5).length;
    const top = [...caseBy.values()].filter(c => c.ri > 0 && aireOk(c)).sort((a, b) => b.ri - a.ri).slice(0, 60);
    return `
    <div class="notice"><b>Reconstruction probabiliste de la transmission</b>, inspirée d'outbreaker2 (practicals RECON), sans données génomiques : pour chaque cas, les infecteurs candidats sont les cas de la même aire de santé débutés 1 à 60 jours avant (modèle A, temporel seul), auxquels s'ajoutent les liens documentés par le suivi des contacts, fortement favorisés (modèle B, temporel + contacts, ε = 0,05). Le support d'un lien est la probabilité a posteriori que ce cas soit l'infecteur.</div>
    <div class="grid g5">
      ${kpi("Cas analysés", nf(s.cas), "Confirmés et probables avec date de début")}
      ${kpi("Infecteur probable identifié", pc(100 * n05 / Math.max(s.cas, 1), 1), `${nf(n05)} cas avec un lien de support ≥ 0,5 (modèle B)`, { color: "--rc-purple" })}
      ${kpi("Support médian", `${nf(A.support_median, 2)} → ${nf(B.support_median, 2)}`, "Modèle A (temporel) → modèle B (temporel + contacts)")}
      ${kpi("Liens documentés retenus", nf(B.liens_documentes), "Contact suivi retrouvé dans la liste des cas", { color: "--st-conf" })}
      ${kpi("Dispersion k", nb.k !== undefined ? nf(nb.k, 2) : "—", nb.k !== undefined ? `IC 95 % ${nf(nb.k_ic95?.[0], 2)}, ${nf(nb.k_ic95?.[1], 2)} · ${pc(100 * nb.part_cas_80pct, 1)} des cas → 80 % des transmissions identifiées` : "", { color: "--s2" })}
    </div>
    <div class="grid g2">
      ${panel("Support des liens, modèle A (temporel seul)", "Consensus : infecteur de support maximal pour chaque cas", `<div id="c-supA"></div>`, { png: "support_modele_A" })}
      ${panel("Support des liens, modèle B (temporel + contacts)", "L'ajout des données de contact déplace les supports vers 1 pour les liens documentés", `<div id="c-supB"></div>`, { png: "support_modele_B" })}
    </div>
    ${interp("Interprétation", [
      `Modèle A : support médian <b>${nf(A.support_median, 2)}</b>, ${pc(A.pct_sup_05, 1)} des liens ≥ 0,5, la seule chronologie ne permet pas de savoir « qui a infecté qui » quand beaucoup de cas surviennent au même endroit au même moment.`,
      `Modèle B : support médian <b>${nf(B.support_median, 2)}</b>, ${pc(B.pct_sup_05, 1)} des liens ≥ 0,5 ; ${nf(B.liens_documentes)} liens documentés retenus. Les données de contact rendent les liens beaucoup plus certains, mais elles ne couvrent qu'une partie des cas.`,
      "Conséquence pour la riposte : la plupart des cas n'ont pas de source identifiée ; améliorer l'investigation, le listage des contacts et l'enregistrement du nom complet des contacts (pour les retrouver dans la liste des cas)."],
      "Les liens viennent d'un rapprochement des noms (contact → cas) ; une erreur d'orthographe peut créer ou masquer un lien : c'est pourquoi le modèle garde une probabilité ε de transmission hors contacts.")}
    ${panel("Arbre de transmission daté", "x = date, lignes ordonnées par taille de sous-arbre ; arêtes colorées selon le support (gris clair → violet foncé), taille des nœuds = nombre de cas secondaires R_i",
      `<div class="flex" style="margin-bottom:8px">
        <label class="field">Aire de santé<select data-state="recZone">${zones.map(z => `<option ${S.recZone === z ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label>
        <label class="field">Support minimal<select data-state="recSup">${[["0.05", "≥ 0,05"], ["0.3", "≥ 0,3 (RECON)"], ["0.5", "≥ 0,5"], ["0.8", "≥ 0,8"]].map(([v, t]) => `<option value="${v}" ${S.recSup === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field">Couleur des nœuds<select data-state="recColor">${[["issue", "Issue (décès / vivant)"], ["age", "Classe d'âge"], ["cls", "Classification"]].map(([v, t]) => `<option value="${v}" ${S.recColor === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field">Axe des dates<select data-state="recX"><option value="onset" ${S.recX === "onset" ? "selected" : ""}>Début des signes</option><option value="inf" ${S.recX === "inf" ? "selected" : ""}>Infection estimée</option></select></label>
        <label class="small flex" style="gap:4px"><input type="checkbox" data-check="recDoc" ${S.recDoc ? "checked" : ""}>Liens documentés uniquement</label>
      </div><div id="c-ttree"></div><div id="ttree-legend"></div>`, { png: "arbre_transmission_" + S.recZone })}
    <div class="grid g21">
      ${panel("Distribution du nombre de cas secondaires (R_i)", "Liens consensus de support ≥ 0,5 ; cas débutés il y a plus de 30 jours ; points : binomiale négative ajustée", `<div id="c-off"></div>${nb.k !== undefined ? interp("Interprétation", [`Moyenne ${nf(nb.R_moyen, 3)} cas secondaires identifiés par cas ; dispersion <b>k = ${nf(nb.k, 2)}</b> ${ci(nb.k_ic95?.[0], nb.k_ic95?.[1])} ; ${pc(100 * nb.part_zero, 1)} des cas sans cas secondaire identifié.`, nb.k < 1 ? "k < 1 : transmission très hétérogène (« super-propagation »), une minorité de cas (soins à domicile, funérailles, structures de santé) produit la majorité des cas secondaires ; cibler ces contextes." : "k ≥ 1 : transmission relativement homogène.", "La moyenne est très inférieure à Rt car la majorité des transmissions ne sont pas documentées : k décrit l'hétérogénéité des transmissions identifiées, pas la totalité."]) : ""}`, { png: "cas_secondaires" })}
      ${panel("Principaux propagateurs identifiés", `Cas ayant le plus de cas secondaires (support ≥ 0,5), pseudonymisé${S.aire ? " · " + esc(AN[S.aire]) : ""}`, table("rec-top", top, [{ k: "id", t: "Cas", v: x => `<a href="#" data-gocas="${esc(x.k)}">${esc(x.id)}</a> <span class="muted">${esc(x.ini || "")}</span>`, csv: x => x.id }, { k: "age", t: "Âge", num: true }, { k: "zs", t: "Aire" }, { k: "on", t: "Début", v: x => dshort(x.on) }, { k: "ri", t: "Cas secondaires", num: true }, { k: "dc", t: "Décédé", v: x => x.dc ? badge("Oui", "b-crit") : "", csv: x => x.dc ? "Oui" : "" }], { sort: "ri", maxh: 420, search: false }), { csv: "rec-top" })}
    </div>
    ${panel("Réseau des cas reliés (epicontacts)", "Tous les liens documentés entre cas (contact suivi devenu cas) ; couleur = classification, anneau = décédé ; chaque grappe est une chaîne",
      `<div class="flex" style="margin-bottom:8px"><span class="small muted">Taille minimale des chaînes</span>${segBtns("epiMin", [["2", "≥ 2 cas"], ["3", "≥ 3 cas"], ["5", "≥ 5 cas"]])}</div><div id="c-epinet"></div>${legend([{ t: "Confirmé", c: "--st-conf" }, { t: "Probable", c: "--s5" }, { t: "Lien contact suivi → cas", c: "--st-conf" }])}`, { png: "reseau_cas" })}`;
  }
  function supHist(id, h) {
    if (!$(id)) return;
    const data = (h || []).map((v, i) => ({ b: (i * .05).toFixed(2) + "–" + ((i + 1) * .05).toFixed(2), v }));
    Ch.xy($(id), { data, x: "b", height: 220, barWidth: .98, barStroke: "--surface", xLabel: (v, r, tip) => tip ? `Support ${v}` : v.split("–")[0], xLabelWidth: 34, series: [{ key: "v", label: "Nombre de liens", color: "--rc-grey" }], legend: false });
  }
  function reconCharts() {
    if (!TR || !RC.resume) return;
    const s = RC.resume || {};
    supHist("#c-supA", s.A?.histogramme); supHist("#c-supB", s.B?.histogramme);
    const off = s.offspring || {}, nb = off.ajustement;
    if ($("#c-off") && off.histogramme) {
      const n = off.n_cas || 1;
      const data = off.histogramme.map((v, i) => ({ k: i, p: v / n, nb: nb ? nb.pmf[i] : null }));
      Ch.xy($("#c-off"), { data, x: "k", height: 230, digits: 4, barWidth: .9, barStroke: "--surface", yFmt: v => nf(v, 2), xLabel: (v, r, tip) => tip ? `${v} cas secondaires, ${nf(off.histogramme[v])} cas` : v,
        series: [{ key: "p", label: "Proportion observée", color: "--rc-salmon" }, ...(nb ? [{ key: "nb", label: "Binomiale négative ajustée", color: "--rc-purple", type: "line", dash: "5 4", markers: true, r: 2.6 }] : [])] });
    }
    if ($("#c-ttree")) {
      const minS = Number(S.recSup);
      const zc = [...caseBy.values()].filter(c => c.zs === S.recZone && c.on);
      const set = new Set(zc.map(c => c.k));
      const par = new Map();
      (RC.liens || []).forEach(l => { if (set.has(l[1]) && set.has(l[0]) && l[2] >= minS && (!S.recDoc || l[3])) par.set(l[1], l); });
      const inTree = new Set(); par.forEach((l, t) => { inTree.add(t); inTree.add(l[0]); });
      const incMed = DY.distributions?.incubation?.ajustement?.mediane || 9;
      const ageIdx = a => a === null || a === undefined ? 5 : a <= 10 ? 0 : a <= 20 ? 1 : a <= 30 ? 2 : a <= 40 ? 3 : 4;
      const colorOf = c => S.recColor === "age" ? AGEC[ageIdx(c.age)] : S.recColor === "cls" ? clsColor(c.cls) : (c.dc ? "#3288BD" : "#ABDDA4");
      const nodes = zc.filter(c => inTree.has(c.k) && (S.preset === "tout" || c.on <= S.date)).map(c => { const l = par.get(c.k); const t = new Date(c.on + "T00:00:00Z").getTime() - (S.recX === "inf" ? incMed * 864e5 : 0);
        return { id: c.k, parent: l && inTree.has(l[0]) ? l[0] : null, support: l ? l[2] : 1, t, r: c.ri || 0, sex: c.sexe, color: colorOf(c),
          title: `<b>${esc(c.id)}</b> · ${esc(c.ini || "")}<div class="row"><span>Début des signes</span><b>${dfmt(c.on)}${c.oi ? " (imputé)" : ""}</b></div><div class="row"><span>Âge</span><b>${c.age ?? "—"} ans</b></div><div class="row"><span>Aire de santé</span><b>${esc(c.zs || "—")}</b></div><div class="row"><span>Cas secondaires (R_i)</span><b>${nf(c.ri || 0)}</b></div>${l ? `<div class="row"><span>Infecteur probable</span><b>${esc(l[0])}</b></div><div class="row"><span>Support</span><b>${nf(l[2], 2)}${l[3] ? " · documenté" : ""}</b></div><div class="row"><span>Intervalle sériel</span><b>${l[4]} j</b></div>` : `<div class="muted">Racine (aucun infecteur retenu)</div>`}${c.dc ? `<div><b>Décédé</b></div>` : ""}`, ref: c.k }; });
      Ch.ttree($("#c-ttree"), { nodes, sexIcons: false, height: 480, maxHeight: 1600, rowH: 15, empty: "Aucun lien au-dessus du seuil de support dans cette aire de santé.", info: `${nf(nodes.length)} cas · ${nf(par.size)} liens · molette = zoom · glisser = déplacer`, onSelect: n => { if (n && n.ref) H.go("journey", n.ref); } });
      const legC = S.recColor === "age" ? (DY.classes_age || []).map((a, i) => ({ t: a === "Inconnu" ? "Âge inconnu" : a + " ans", c: AGEC[i] })) : S.recColor === "cls" ? [{ t: "Confirmé", c: "--st-conf" }, { t: "Probable", c: "--s5" }] : [{ t: "Décédé", c: "#3288BD" }, { t: "Vivant / inconnu", c: "#ABDDA4" }];
      const sp = Ch.PAL[document.documentElement.dataset.theme === "dark" ? "supportDark" : "support"];
      $("#ttree-legend").innerHTML = `${legend(legC)}<div class="gradient-legend"><span>Support du lien</span><span>0</span><div class="bar" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(sp).join(",")})"></div><span>1</span><span class="muted">Taille du nœud ∝ √R_i</span></div>`;
    }
    if ($("#c-epinet")) {
      let L = ((TR.chains || {}).liens || []).filter(l => { const a = caseBy.get(l.source), b = caseBy.get(l.target); return a && b && (aireOk(a) || aireOk(b)) && (S.preset === "tout" || inPer(b.date) || inPer(a.date)); });
      const chainSize = {}; caseBy.forEach(x => { if (x.ch) chainSize[x.ch] = (chainSize[x.ch] || 0) + 1; });
      const minC = Number(S.epiMin);
      L = L.filter(l => { const c = (caseBy.get(l.source) || {}).ch; return !c || (chainSize[c] || 2) >= minC; });
      const ids = new Set(); L.forEach(l => { ids.add(l.source); ids.add(l.target); });
      const nodes = [...ids].map(k => { const c = caseBy.get(k); return { id: k, sex: c.sexe, color: clsColor(c.cls), ring: c.dc ? "--ink" : null, big: (c.ri || 0) >= 3,
        title: `<b>${esc(c.id)}</b> · ${esc(c.ini || "")}<div>${esc(c.cls)}${c.dc ? " · décédé" : ""}</div><div>${c.age ?? "—"} ans</div><div>${esc(c.zs || "")}</div>${c.ch ? `<div>Chaîne ${esc(c.ch)}</div>` : ""}` }; });
      Ch.forceNet($("#c-epinet"), { nodes, links: L.map(l => ({ source: l.source, target: l.target, strong: true })), height: 560, uid: "epi",
        info: `${nf(nodes.length)} cas · ${nf(L.length)} liens · cliquer un cas pour ouvrir son parcours`, onSelect: n => H.go("journey", n.id), empty: "Aucune donnée" });
    }
  }

  /* ================================================================== ENFANTS (0–18 ANS) */
  const KC = { c0_5: "#E8684F", c5_10: "#FDAE61", c10_18: "#3288BD", adulte: "#8a94a0" };
  function kidsView() {
    const E = (TR && TR.enfants) || {}, Gs = E.groupes || [];
    if (!Gs.length) return noTR();
    const kids = Gs.filter(g => g.cle !== "adulte"), ad = Gs.find(g => g.cle === "adulte") || {};
    const nk = kids.reduce((s, g) => s + g.cas, 0), tot = Gs.reduce((s, g) => s + g.cas, 0);
    const card = g => { const r = (g.rt || {}).dernier_consolide, si = (g.intervalle_seriel || {}).ajustement, tr = g.cas_14j_prec ? 100 * (g.cas_14j - g.cas_14j_prec) / g.cas_14j_prec : null;
      return `<div class="kpi"><div class="label"><i class="dot" style="background:${KC[g.cle]}"></i>${esc(g.groupe)}</div><div class="value">${nf(g.cas)}</div>
        <div class="note">${pc(g.pct_cas, 1)} des cas · ${nf(g.deces)} décès · létalité <b>${pc(g.letalite_pct, 1)}</b> ${ci(g.letalite_ic95[0], g.letalite_ic95[1], 1)}</div>
        <div class="statgrid" style="grid-template-columns:1fr 1fr">${stat("Rt consolidé", r ? fmtR(r.mediane) : "—", r ? `${ci(r.q025, r.q975)} · P(R>1) ${pc(100 * r.p_sup_1, 0)}` : "effectif insuffisant")}${stat("Intervalle sériel", si ? `${nf(si.moyenne, 1)} ± ${nf(si.ecart_type, 1)} j` : "—", `n = ${nf((g.intervalle_seriel || {}).n || 0)} paires`)}${stat("Cas 14 j", nf(g.cas_14j), tr === null ? "" : `${pctS(tr)} vs 14 j précédents`)}${stat("Connus comme contacts", pc(g.pct_connus_contacts, 1), `source connue ${pc(g.pct_source_connue, 1)}`)}</div></div>`; };
    const rows = [
      ["Cas confirmés + probables", g => nf(g.cas)], ["Part de l'ensemble des cas", g => pc(g.pct_cas, 1)], ["dont confirmés", g => nf(g.confirmes)],
      ["Âge médian (ans)", g => nf(g.age_median, 1)], ["Moins d'un an", g => nf(g.moins_1_an)], ["Décès", g => nf(g.deces)],
      ["Létalité (IC 95 %)", g => `${pc(g.letalite_pct, 1)} <span class="muted small">${ci(g.letalite_ic95[0], g.letalite_ic95[1], 1)}</span>`],
      ["Délai début des signes → confirmation (médiane, j)", g => nf(g.delai_dds_notification, 1)], ["Délai début des signes → isolement (médiane, j)", g => nf(g.delai_dds_admission, 1)],
      ["Connus comme contacts", g => pc(g.pct_connus_contacts, 1)], ["Source connue", g => pc(g.pct_source_connue, 1)],
      ["Cas sur 14 jours", g => nf(g.cas_14j)], ["Cas 14 jours précédents", g => nf(g.cas_14j_prec)],
      ["Aires de santé les plus touchées", g => (g.zones || []).slice(0, 3).map(z => `${esc(z.zone_sante)} (${nf(z.cas)})`).join(", ")]];
    const M = E.matrice || [];
    const mxM = Math.max(1, ...M.flat());
    const matrix = M.length && M.flat().some(v => v) ? `<div class="table-wrap"><table class="rsum"><thead><tr><th>Cas source ↓ / cas secondaire →</th>${Gs.map(g => `<th>${esc(g.groupe)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${M.map((row, i) => { const t = row.reduce((a, b) => a + b, 0); return `<tr><td><b>${esc(Gs[i].groupe)}</b></td>${row.map(v => `<td style="background:rgba(198,83,83,${(.08 + .6 * v / mxM).toFixed(2)})">${nf(v)} <span class="muted small">${t ? pc(100 * v / t, 0) : ""}</span></td>`).join("")}<td>${nf(t)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">Aucune paire documentée</div>`;
    const kidsAsTarget = M.length ? [0, 1, 2].reduce((s, j) => s + M.reduce((a, row) => a + row[j], 0), 0) : 0;
    const fromAdults = M.length ? [0, 1, 2].reduce((s, j) => s + M[3][j], 0) : 0;
    const ctRows = Gs.map(g => ({ ...g.contacts, groupe: g.groupe, cle: g.cle }));
    return `
    <div class="notice"><b>Analyses pédiatriques</b>, classes d'âge ${esc(E.bornes || "")}. ${E.age_douteux ? `<b>${nf(E.age_douteux)}</b> cas enregistrés « 0 an » (âge très probablement non saisi) sont exclus des classes d'âge ; ${nf(E.age_inconnu)} cas au total sans âge exploitable.` : ""} Cas confirmés et probables de la zone de santé ; Rt calculé sur l'incidence de chaque classe avec l'intervalle sériel global. La base des cas ne contient pas le sexe : pas de ventilation garçons / filles.</div>
    <div class="grid g4">${Gs.map(card).join("")}</div>
    ${interp("Synthèse", [
      `Les enfants de moins de 18 ans représentent <b>${pc(100 * nk / Math.max(tot, 1), 1)}</b> des cas (${nf(nk)}).`,
      kids[0] ? `Létalité chez les 0–5 ans : <b>${pc(kids[0].letalite_pct, 1)}</b> ${ci(kids[0].letalite_ic95[0], kids[0].letalite_ic95[1], 1)} contre ${pc(ad.letalite_pct, 1)} chez les adultes, ${kids[0].letalite_ic95[0] > (ad.letalite_ic95 || [0, 0])[1] ? "surmortalité significative des jeunes enfants : prise en charge pédiatrique précoce et nutrition prioritaires." : "différence non significative."}` : "",
      kidsAsTarget ? `Parmi les ${nf(kidsAsTarget)} enfants dont la source est documentée, ${nf(fromAdults)} (${pc(100 * fromAdults / Math.max(kidsAsTarget, 1), 0)}) ont été infectés par un adulte.` : "",
      "Rt et intervalle sériel par classe d'âge reposent sur des effectifs faibles dans une zone de santé : lire les intervalles de crédibilité avant de conclure."])}
    <div class="grid g21">
      ${panel("Courbe épidémique hebdomadaire par classe d'âge", `Cas confirmés et probables par semaine de notification · ${perTxt()}`, `<div id="c-kids-epi"></div><div id="c-kids-pct" style="margin-top:8px"></div>`, { png: "enfants_courbe" })}
      ${panel("Âge des enfants", "Année d'âge révolue (cas de 0 à 17 ans)", `<div id="kids-pyr">${kidsAges()}</div>`)}
    </div>
    ${panel("Nombre de reproduction Rt par classe d'âge", "EpiEstim, fenêtres de 7 jours ; bande = IC crédible 95 % ; ligne pointillée = R = 1 ; zone grisée = provisoire", `<div class="grid g2" id="kids-rt">${Gs.map(g => `<div><h3 class="small" style="margin:0 0 4px"><i class="dot" style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${KC[g.cle]}"></i> ${esc(g.groupe)}</h3><div id="c-krt-${g.cle}"></div></div>`).join("")}</div>`, { png: "enfants_rt" })}
    ${panel("Profil descriptif comparé", "Cas confirmés et probables", `<div class="table-wrap"><table class="rsum"><thead><tr><th>Indicateur</th>${Gs.map(g => `<th>${esc(g.groupe)}</th>`).join("")}</tr></thead><tbody>${rows.map(([lab, f]) => `<tr><td>${lab}</td>${Gs.map(g => `<td>${f(g)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`)}
    <div>
      ${panel("Qui infecte qui ? Matrice par classe d'âge", "Paires documentées (contact suivi devenu cas) ; % = répartition des cas secondaires d'une même source", matrix)}
      ${panel("Contacts suivis par classe d'âge", "Contacts listés (hors doublons)", `<div class="table-wrap"><table class="rsum"><thead><tr><th>Classe d'âge</th><th>Contacts</th><th>Devenus cas</th><th>Taux (IC 95 %)</th><th>Devenus suspects</th><th>En suivi</th><th>Perdus de vue</th><th>Relations les plus fréquentes</th></tr></thead><tbody>${ctRows.map(r => `<tr><td><b>${esc(r.groupe)}</b></td><td>${nf(r.n)}</td><td>${nf(r.devenus_cas)}</td><td>${pc(r.taux_pct, 2)} <span class="muted small">${ci(r.taux_ic95?.[0], r.taux_ic95?.[1], 2)}</span></td><td>${nf(r.devenus_suspects)}</td><td>${nf(r.actifs)}</td><td>${nf(r.perdus_de_vue)}</td><td class="small" style="text-align:left">${(r.relations || []).slice(0, 3).map(x => `${esc(String(x.relation))} (${nf(x.n)})`).join(", ")}</td></tr>`).join("")}</tbody></table></div>`)}
    </div>`;
  }
  function kidsAges() {
    const per = [...caseBy.values()].filter(c => !c.hors && c.age !== null && c.age !== undefined && c.age < 18 && c.age > 0 && (S.preset === "tout" || inPer(c.date)) && aireOk(c));
    const cnt = Array.from({ length: 18 }, (_, a) => per.filter(c => Math.floor(c.age) === a).length);
    const mx = Math.max(1, ...cnt);
    if (!per.length) return `<div class="empty">Aucun cas de moins de 18 ans sur la période.</div>`;
    return `<div class="hbars">${cnt.map((n, a) => `<div class="hbar" style="grid-template-columns:52px 1fr 40px"><span>${a} an${a > 1 ? "s" : ""}</span><div class="track"><i style="width:${100 * n / mx}%;background:${a < 5 ? KC.c0_5 : a < 10 ? KC.c5_10 : KC.c10_18}"></i></div><b>${nf(n)}</b></div>`).join("")}</div><div class="small muted" style="margin-top:6px">${nf(per.length)} cas de 0 à 17 ans · ${perTxt()}${S.aire ? " · " + esc(AN[S.aire]) : ""} (âges « 0 » exclus : souvent non saisis)</div>`;
  }
  function kidsCharts() {
    const E = (TR && TR.enfants) || {}, Gs = E.groupes || [];
    const wk = E.hebdo || [];
    if ($("#c-kids-epi")) {
      Ch.xy($("#c-kids-epi"), { data: wk, x: "week", stacked: true, height: 250, xLabel: (v, r, tip) => tip ? `Semaine du ${dfmt(v)}` : dshort(v), series: (E.cles || []).map((k, i) => ({ key: k, label: E.labels[i], color: KC[k] })) });
      Ch.xy($("#c-kids-pct"), { data: wk, x: "week", height: 150, percent: true, xLabel: (v, r, tip) => tip ? `Semaine du ${dfmt(v)}` : dshort(v), series: [{ key: "pct_enfants", label: "Part des enfants (< 18 ans) parmi les cas", color: "#E8684F", type: "area" }] });
    }
    Gs.forEach(g => {
      const box = $("#c-krt-" + g.cle); if (!box) return;
      if (!g.rt) { box.innerHTML = `<div class="empty">Effectif insuffisant</div>`; return; }
      const R = g.rt.lignes.map(a => Object.fromEntries(g.rt.cols.map((c, i) => [c, a[i]]))).filter(r => r.date <= S.date).slice(-120);
      const prov = firstIdx(R, r => r.provisoire);
      Ch.xy(box, { data: R, x: "date", height: 190, digits: 2, xLabel: (v, r, tip) => tip ? dfmt(v) : dshort(v), shade: prov !== null ? { from: prov } : null, legend: false,
        bands: [{ lo: "q025", hi: "q975", color: KC[g.cle], opacity: .25, label: "IC crédible 95 %" }], hlines: [{ y: 1, color: "--ink-2", dash: "6 4", label: "R = 1" }],
        tipExtra: r => `<div class="row"><span>P(R > 1)</span><b>${pc(100 * r.p_sup_1, 0)}</b></div><div class="row"><span>Cas dans la fenêtre</span><b>${nf(r.cas_fenetre, 0)}</b></div>`,
        series: [{ key: "mediane", label: "Rt médian", color: KC[g.cle], type: "line", markers: false, width: 2.2 }] });
    });
  }

  return {
    index: { view: indexView, charts: indexCharts },
    journey: { view: journeyView, charts: journeyCharts, onRow: (id, k) => { if (id === "jr-ct") { S.nodeSel = k; H.render(); } else H.go("journey", k); } },
    chains: { view: chainsView, charts: chainsCharts, onRow: (id, k) => { S.chain = k; H.render(); } },
    recon: { view: reconView, charts: reconCharts },
    dynamics: { view: dynamicsView, charts: dynamicsCharts },
    children: { view: kidsView, charts: kidsCharts }
  };
};
