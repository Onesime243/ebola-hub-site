/* Ebola Outbreak, outil de la zone de santé : analyses de la riposte
   Surveillance des alertes, décès et EDS, symptômes et clinique, laboratoire, prise en charge / vaccination / expositions.
   Chaque vue n'utilise que les données présentes dans les bases de la zone de santé ; ce qui manque est signalé. */
window.ZS_RIPOSTE = function (H) {
  "use strict";
  const { D, S, CAS, CT, AIRES, AN, nf, pc, esc, col, dfr, dshort, day, iso, inPer, perTxt, panel, kpi, legend, segBtns, table, Ch, $ } = H;
  const rowsToObj = blk => blk ? blk.rows.map(r => Object.fromEntries(blk.cols.map((c, i) => [c, r[i]]))) : [];
  const SBC = rowsToObj(D.sbc), RA = rowsToObj(D.ra);
  /* sans base SBC : décès communautaires, swabs et EDS repris de la base des alertes (zone ou base chiffrée provinciale) */
  const AJR = rowsToObj(D.alertes_j);
  const SBC_AJ = !SBC.length && AJR.length > 0;
  if (SBC_AJ) AJR.forEach(r => SBC.push({ date: r.date, aire: r.aire, alertes_malades: r.total_v, alertes_deces: r.total_d, investiguees: (r.inv_v || 0) + (r.inv_d || 0), validees: (r.val_v || 0) + (r.val_d || 0),
    deces_comm_swabes: r.swab, deces_comm_eds: r.eds, orientes_cte: r.cte }));
  const SBC_LIB = SBC_AJ ? "base des alertes" : "base SBC (CAC)";
  /* résultats de laboratoire individuels (liste linéaire, export DHIS2 ou liste labo provinciale) */
  const NT = rowsToObj(D.notif).filter(r => !r.hors_zs);
  const NTR = NT.filter(r => r.resultat === "Positif" || r.resultat === "Négatif");
  const C = D.cibles || {};
  const sum = (rows, k) => rows.reduce((s, r) => s + (+r[k] || 0), 0);
  const med = a => { const s = a.filter(v => v !== null && v !== undefined && isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const ratio = (a, b) => b ? 100 * a / b : null;
  const wil = (k, n) => { if (!n) return [null, null]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [100 * (c - m) / d, 100 * (c + m) / d]; };
  const ci = (a, b, d = 1) => a === null ? "" : `<span class="muted small">[${nf(a, d)}, ${nf(b, d)}]</span>`;
  const interp = (title, items, q) => `<div class="interp"><b>${title}</b><ul>${items.filter(Boolean).map(x => `<li>${x}</li>`).join("")}</ul>${q ? `<span class="q">${q}</span>` : ""}</div>`;
  const notice = (t, cls = "") => `<div class="notice ${cls}">${t}</div>`;
  const wk = d => { const n = typeof d === "number" ? d : day(d); return n - ((new Date(n * 864e5).getUTCDay() + 6) % 7); };
  const weeks = () => { const out = []; for (let w = wk(S.from); w <= wk(S.date); w += 7) out.push(w); return out; };
  const wlab = { xLabel: (v, r, tip) => tip ? `Semaine du ${dfr(v)}` : dshort(v) };
  function hbars(items, o = {}) {
    const a = items.filter(x => x.v > 0 || o.keep);
    if (!a.length) return `<div class="empty">Aucune donnée</div>`;
    const m = o.max || Math.max(...a.map(x => x.v), 1);
    return `<div class="hbars">${a.map(x => `<div class="hbar" style="grid-template-columns:minmax(120px,${o.lw || 220}px) 1fr ${o.vw || 90}px"><span title="${esc(x.t)}">${esc(x.t)}</span><div class="track"><i style="width:${Math.max(1, 100 * x.v / m)}%;background:${col(x.c || "--s1")}"></i></div><b>${x.txt !== undefined ? x.txt : nf(x.v)}</b></div>`).join("")}</div>`;
  }
  const sbcRows = () => SBC.filter(r => inPer(r.date) && (!S.aire || r.aire === S.aire));
  const raRows = () => RA.filter(r => inPer(r.date) && (!S.aire || r.aire === S.aire));
  const casRows = () => CAS.filter(c => !c.hors_zs && inPer(c.date) && (!S.aire || c.aire === S.aire));
  const strongLk = x => x.lk && (x.lkc === "Certain" || x.lkc === "Probable");
  const tFrom = () => day(S.from), tTo = () => day(S.date);
  /* premier jour où un contact est codé « 1 » (suspect) dans sa grille */
  const suspDay = x => { const j = x.codes.indexOf("1"); return j < 0 || x._dlc === null ? null : x._dlc + j + 1; };
  const ctSusp = () => CT.filter(x => (!S.aire || x.aire === S.aire)).map(x => ({ x, d: suspDay(x) })).filter(o => o.d !== null && o.d >= tFrom() && o.d <= tTo());
  const ctReg = () => CT.filter(x => (!S.aire || x.aire === S.aire) && inPer(x.ent));
  const byAire = (rows, key) => { const o = {}; rows.forEach(r => { const k = r[key] || "—"; (o[k] = o[k] || []).push(r); }); return o; };

  /* ================================================================== SURVEILLANCE DES ALERTES */
  function alertesView() {
    const sb = sbcRows(), ra = raRows(), cs = casRows(), su = ctSusp();
    const al = sum(sb, "alertes_total") || (sum(sb, "alertes_malades") + sum(sb, "alertes_deces"));
    const inv = sum(sb, "investiguees"), val = sum(sb, "validees");
    const rep = sum(ra, "repondant"), rinv = sum(ra, "investigues"), rval = sum(ra, "valides");
    const suIso = su.filter(o => o.x.iso === "Oui").length, suIsoKnown = su.filter(o => o.x.iso).length;
    const suConf = su.filter(o => strongLk(o.x) || o.x.codes.includes("3")).length;
    const known = cs.filter(c => c.connu === true || c.src).length;
    const ws = weeks();
    H.after(() => {
      const data = ws.map(w => { const s7 = SBC.filter(r => (!S.aire || r.aire === S.aire) && r.date && wk(r.date) === w), r7 = RA.filter(r => (!S.aire || r.aire === S.aire) && r.date && wk(r.date) === w);
        return { week: iso(w), malades: sum(s7, "alertes_malades"), deces: sum(s7, "alertes_deces"), ra: sum(r7, "repondant"), susp: su.filter(o => wk(o.d) === w).length,
          cas: CAS.filter(c => !c.hors_zs && (!S.aire || c.aire === S.aire) && c.date && wk(c.date) === w).length }; });
      Ch.xy($("#c-al-wk"), { data, x: "week", stacked: true, height: 260, ...wlab, series: [{ key: "malades", label: "Alertes communautaires, malades (SBC)", color: "--s1" }, { key: "deces", label: "Alertes communautaires, décès (SBC)", color: "--ink-2" },
        { key: "ra", label: "Recherche active, répondant à la définition", color: "--s7" }, { key: "susp", label: "Contacts devenus suspects", color: "--st-susp" }] });
      Ch.xy($("#c-al-ratio"), { data: data.map(r => ({ week: r.week, cas: r.cas, ratio: r.cas ? (r.malades + r.deces + r.ra + r.susp) / r.cas : null })), x: "week", height: 200, digits: 1, ...wlab,
        series: [{ key: "cas", label: "Cas confirmés + probables", color: "--st-conf" }, { key: "ratio", label: "Alertes par cas (axe des valeurs)", color: "--s3", type: "line" }] });
    });
    const rows = AIRES.map(a => { const s_ = sb.filter(r => r.aire === a.cle), r_ = ra.filter(r => r.aire === a.cle); const al_ = sum(s_, "alertes_total") || (sum(s_, "alertes_malades") + sum(s_, "alertes_deces"));
      const c_ = cs.filter(c => c.aire === a.cle).length, sp = su.filter(o => o.x.aire === a.cle).length;
      return { aire: a.nom, alertes: al_, inv: ratio(sum(s_, "investiguees"), al_), val: sum(s_, "validees"), rep: sum(r_, "repondant"), rinv: ratio(sum(r_, "investigues"), sum(r_, "repondant")), susp: sp, cas: c_, apc: c_ ? (al_ + sum(r_, "repondant") + sp) / c_ : null }; });
    return `${notice(`<b>Surveillance des alertes</b>, trois sources : alertes communautaires des CAC (base SBC), cas répondant à la définition trouvés par la recherche active dans les formations sanitaires, contacts devenus suspects pendant le suivi (code « 1 » de la grille). ${perTxt()}${S.aire ? " · " + esc(AN[S.aire]) : ""}.`)}
    <div class="grid g5">
      ${kpi("Alertes communautaires (SBC)", nf(al), `${nf(sum(sb, "alertes_malades"))} malades · ${nf(sum(sb, "alertes_deces"))} décès`, { color: "--s1" })}
      ${kpi("Alertes SBC investiguées", pc(ratio(inv, al), 0), `${nf(inv)} investiguées · ${nf(val)} validées (suspects)`, { cls: al && ratio(inv, al) < 95 ? "alert" : "good", meter: ratio(inv, al), color: "--brand-2" })}
      ${kpi("Recherche active : répondant à la définition", nf(rep), `${pc(ratio(rinv, rep), 0)} investigués · ${nf(rval)} validés`, { color: "--s7" })}
      ${kpi("Contacts devenus suspects", nf(su.length), `${suIsoKnown ? `${nf(suIso)} / ${nf(suIsoKnown)} isolés (renseigné)` : "isolement non renseigné"} · ${nf(suConf)} devenus confirmés`, { color: "--st-susp" })}
      ${kpi("Cas de la période connus comme contacts", pc(ratio(known, cs.length), 0), `${nf(known)} / ${nf(cs.length)} cas · cible ${C.cas_connus_contacts_pct} %`, { cls: cs.length && ratio(known, cs.length) < C.cas_connus_contacts_pct ? "alert" : "", meter: ratio(known, cs.length), color: "--st-conf" })}
    </div>
    <div class="grid g2">
      ${panel("Entonnoir des alertes communautaires (SBC)", "De l'alerte à l'orientation vers le centre de traitement", hbars([{ t: "Alertes notifiées", v: al, c: "--s1" }, { t: "Alertes investiguées", v: inv, c: "--brand-2", txt: `${nf(inv)} (${pc(ratio(inv, al), 0)})` }, { t: "Alertes validées (suspects)", v: val, c: "--st-susp", txt: `${nf(val)} (${pc(ratio(val, al), 0)})` },
        { t: "Orientés vers une FOSA", v: sum(sb, "orientes_fosa"), c: "--s4" }, { t: "Orientés vers CT / CTE", v: sum(sb, "orientes_cte"), c: "--st-conf" }], { keep: true }))}
      ${panel("Entonnoir de la recherche active", "Consultations revues dans les formations sanitaires", hbars([{ t: "Consultations revues", v: sum(ra, "consultations"), c: "--s7" }, { t: "Répondant à la définition", v: rep, c: "--s1" }, { t: "Investigués", v: rinv, c: "--brand-2", txt: `${nf(rinv)} (${pc(ratio(rinv, rep), 0)})` },
        { t: "Validés (suspects)", v: rval, c: "--st-susp" }, { t: "Orientés CT / CTE", v: sum(ra, "ct_cte"), c: "--st-conf" }, { t: "Prélevés sur place", v: sum(ra, "preleves"), c: "--s4" }, { t: "Refus, évadés, non retrouvés", v: sum(ra, "refus") + sum(ra, "evades") + sum(ra, "non_retrouves"), c: "--critical" }], { keep: true }))}
    </div>
    ${panel("Alertes par semaine et par source", `Semaines (lundi) de la période · ${perTxt()}`, `<div id="c-al-wk"></div>`, { png: "alertes_semaine" })}
    ${panel("Alertes par cas confirmé ou probable", "Un système de surveillance sensible produit plusieurs alertes pour chaque cas ; un rapport qui baisse alors que les cas persistent signale une surveillance qui s'essouffle", `<div id="c-al-ratio"></div>`, { png: "alertes_par_cas" })}
    ${panel("Surveillance des alertes par aire de santé", perTxt(), table("al-as", rows, [{ k: "aire", t: "Aire de santé" }, { k: "alertes", t: "Alertes SBC", num: true }, { k: "inv", t: "% investiguées", num: true, v: x => pc(x.inv, 0) }, { k: "val", t: "Validées", num: true },
      { k: "rep", t: "RA : répondant", num: true }, { k: "rinv", t: "RA : % investigués", num: true, v: x => pc(x.rinv, 0) }, { k: "susp", t: "Contacts devenus suspects", num: true }, { k: "cas", t: "Cas", num: true }, { k: "apc", t: "Alertes par cas", num: true, d: 1 }], { sort: "cas", search: false, limit: 40 }), { csv: "al-as" })}
    ${interp("Lecture", [`${nf(al + rep + su.length)} signaux (alertes communautaires, recherche active, contacts devenus suspects) pour ${nf(cs.length)} cas : <b>${nf(cs.length ? (al + rep + su.length) / cs.length : null, 1)} signaux par cas</b>.`,
      al ? `${pc(ratio(inv, al), 0)} des alertes communautaires ont été investiguées (objectif ≥ 95 %).` : "Aucune alerte communautaire saisie sur la période.",
      cs.length ? `${pc(ratio(known, cs.length), 0)} des cas étaient connus comme contacts : les autres cas ont échappé au suivi et doivent être investigués pour retrouver leur source.` : ""], "Les alertes SBC et de recherche active sont des agrégats journaliers par aire de santé ; il n'existe pas de liste individuelle des alertes dans les bases de la zone de santé.")}`;
  }

  /* ================================================================== DÉCÈS ET EDS */
  function decesView() {
    const sb = sbcRows(), cs = casRows();
    const dc = cs.filter(c => c.deces).length;
    const adc = sum(sb, "alertes_deces"), sw = sum(sb, "deces_comm_swabes"), eds = sum(sb, "deces_comm_eds");
    const ctD = CT.filter(x => (!S.aire || x.aire === S.aire) && x._dlc !== null).filter(x => { const j = x.codes.indexOf("2"); return j >= 0 && x._dlc + j + 1 >= tFrom() && x._dlc + j + 1 <= tTo(); }).length;
    const L = wil(dc, cs.length);
    const ws = weeks();
    H.after(() => {
      const data = ws.map(w => { const s7 = SBC.filter(r => (!S.aire || r.aire === S.aire) && r.date && wk(r.date) === w), c7 = CAS.filter(c => !c.hors_zs && (!S.aire || c.aire === S.aire) && c.date && wk(c.date) === w);
        return { week: iso(w), dcas: c7.filter(c => c.deces).length, vcas: c7.filter(c => !c.deces).length, adc: sum(s7, "alertes_deces"), sw: sum(s7, "deces_comm_swabes"), eds: sum(s7, "deces_comm_eds"), let: c7.length ? 100 * c7.filter(c => c.deces).length / c7.length : null }; });
      Ch.xy($("#c-dc-wk"), { data, x: "week", stacked: true, height: 240, ...wlab, series: [{ key: "dcas", label: "Cas décédés", color: "--rc-rt" }, { key: "vcas", label: "Cas vivants", color: "--s2" }] });
      Ch.xy($("#c-dc-let"), { data, x: "week", height: 200, percent: true, digits: 1, ...wlab, series: [{ key: "let", label: "Létalité des cas de la semaine (%)", color: "--rc-rt", type: "line" }] });
      Ch.xy($("#c-dc-com"), { data, x: "week", height: 240, ...wlab, series: [{ key: "adc", label: "Décès communautaires signalés (alertes SBC)", color: "--ink-2" }, { key: "sw", label: "Décès communautaires swabés", color: "--s7" }, { key: "eds", label: "Enterrements dignes et sécurisés (EDS)", color: "--s3" }] });
    });
    const ages = [["0–4", 0, 4], ["5–14", 5, 14], ["15–24", 15, 24], ["25–44", 25, 44], ["45–59", 45, 59], ["60+", 60, 200]];
    const ageRows = ages.map(([l, a, b]) => { const g = cs.filter(c => c.age !== null && c.age !== undefined && Math.floor(c.age) >= a && Math.floor(c.age) <= b), k = g.filter(c => c.deces).length, w = wil(k, g.length); return { l, n: g.length, k, p: ratio(k, g.length), lo: w[0], hi: w[1] }; });
    const rows = AIRES.map(a => { const c_ = cs.filter(c => c.aire === a.cle), s_ = sb.filter(r => r.aire === a.cle); const k = c_.filter(c => c.deces).length;
      return { aire: a.nom, cas: c_.length, deces: k, let: ratio(k, c_.length), adc: sum(s_, "alertes_deces"), sw: sum(s_, "deces_comm_swabes"), eds: sum(s_, "deces_comm_eds"), psw: ratio(sum(s_, "deces_comm_swabes"), sum(s_, "alertes_deces")) }; });
    const pm = NTR.filter(r => r.nature === "Décès" && inPer(r.prel || r.notif) && (!S.aire || r.aire === S.aire)), pmPos = pm.filter(r => r.resultat === "Positif").length;
    const pmRows = AIRES.map(a => { const x = pm.filter(r => r.aire === a.cle); return { aire: a.nom, n: x.length, pos: x.filter(r => r.resultat === "Positif").length, p: ratio(x.filter(r => r.resultat === "Positif").length, x.length) }; }).filter(r => r.n);
    return `${notice(`<b>Décès et enterrements dignes et sécurisés (EDS)</b>, décès parmi les cas, décès communautaires signalés, swabés et EDS (${SBC_LIB})${NTR.length ? ", prélèvements post-mortem analysés au laboratoire" : ""}${CT.length ? ", contacts décédés pendant le suivi (code « 2 »)" : ""}. ${perTxt()}${S.aire ? " · " + esc(AN[S.aire]) : ""}.`)}
    <div class="grid g5">
      ${kpi("Décès parmi les cas", nf(dc), `${nf(cs.length)} cas sur la période`, { color: "--rc-rt" })}
      ${kpi("Létalité", pc(ratio(dc, cs.length), 1), L[0] !== null ? `IC 95 % ${nf(L[0], 1)}, ${nf(L[1], 1)} % (Wilson)` : "", { cls: "alert", color: "--critical" })}
      ${kpi("Décès communautaires signalés", nf(adc), SBC_AJ ? "Alertes « décès » (base des alertes)" : "Alertes « décès » des CAC (SBC)", { color: "--ink-2" })}
      ${kpi("Décès communautaires swabés", pc(ratio(sw, adc), 0), `${nf(sw)} swabés · ${nf(eds)} EDS`, { cls: adc && ratio(sw, adc) < 90 ? "alert" : "good", meter: ratio(sw, adc), color: "--s7" })}
      ${pm.length ? kpi("Prélèvements post-mortem positifs", pc(ratio(pmPos, pm.length), 1), `${nf(pmPos)} positifs sur ${nf(pm.length)} échantillons de personnes décédées (laboratoire)`, { color: "--rc-rt", cls: pmPos ? "alert" : "" })
        : kpi("Contacts décédés pendant le suivi", nf(ctD), "Code « 2 » de la grille J1–J21", { color: "--ink-2" })}
    </div>
    <div class="grid g2">
      ${panel("Cas décédés et vivants par semaine", "Semaine de confirmation (ou d'isolement)", `<div id="c-dc-wk"></div><div id="c-dc-let" style="margin-top:6px"></div>`, { png: "deces_cas_semaine" })}
      ${panel("Décès communautaires, prélèvements et EDS par semaine", SBC_AJ ? "Base des alertes" : "Base SBC (CAC)", `<div id="c-dc-com"></div>`, { png: "deces_communautaires" })}
    </div>
    <div class="grid g2">
      ${panel("Létalité par classe d'âge", "Cas de la période ; intervalle de Wilson à 95 %", `<table class="rsum"><thead><tr><th>Âge (ans)</th><th>Cas</th><th>Décès</th><th>Létalité</th><th>IC 95 %</th></tr></thead><tbody>${ageRows.map(r => `<tr><td>${r.l}</td><td>${nf(r.n)}</td><td>${nf(r.k)}</td><td>${pc(r.p, 1)}</td><td>${r.lo !== null ? `${nf(r.lo, 1)}, ${nf(r.hi, 1)} %` : "—"}</td></tr>`).join("")}</tbody></table>`)}
      ${panel("Décès et EDS par aire de santé", perTxt(), table("dc-as", rows, [{ k: "aire", t: "Aire de santé" }, { k: "cas", t: "Cas", num: true }, { k: "deces", t: "Décès", num: true }, { k: "let", t: "Létalité", num: true, v: x => pc(x.let, 0) },
        { k: "adc", t: "Décès comm.", num: true }, { k: "sw", t: "Swabés", num: true }, { k: "psw", t: "% swabés", num: true, v: x => pc(x.psw, 0) }, { k: "eds", t: "EDS", num: true }], { sort: "deces", search: false, limit: 40 }), { csv: "dc-as" })}
    </div>
    ${pmRows.length ? panel("Prélèvements post-mortem analysés au laboratoire", `Personnes décédées au moment du prélèvement (écouvillon) · ${perTxt()} ; un résultat positif est un décès communautaire Ebola : investiguer, lister les contacts des funérailles et vérifier l'EDS`,
      table("dc-pm", pmRows, [{ k: "aire", t: "Unité" }, { k: "n", t: "Échantillons post-mortem", num: true }, { k: "pos", t: "Positifs", num: true }, { k: "p", t: "Positivité", num: true, v: x => pc(x.p, 1) }], { sort: "n", search: false, limit: 40 }), { csv: "dc-pm" }) : ""}
    ${interp("Lecture", [`Létalité de <b>${pc(ratio(dc, cs.length), 1)}</b> sur la période ${L[0] !== null ? `(IC 95 % ${nf(L[0], 1)}, ${nf(L[1], 1)} %)` : ""}.`,
      adc ? `${pc(ratio(sw, adc), 0)} des décès communautaires signalés ont été prélevés (swab) et ${pc(ratio(eds, adc), 0)} ont bénéficié d'un EDS : chaque décès communautaire non prélevé est un cas potentiellement manqué et une source de transmission lors des funérailles.` : `Aucun décès communautaire saisi dans la ${SBC_LIB} sur la période.`,
      pm.length ? `${nf(pmPos)} des ${nf(pm.length)} prélèvements post-mortem analysés sont positifs (${pc(ratio(pmPos, pm.length), 1)}).` : "Les décès communautaires confirmés positifs ne sont pas identifiables sans les résultats de laboratoire : rapprocher avec la liste des cas si nécessaire."])}`;
  }

  /* ================================================================== SYMPTÔMES ET CLINIQUE */
  function cliniqueView() {
    const cs = casRows();
    const wd = cs.filter(c => c.d_isol !== null && c.d_isol !== undefined);
    const tg = C.delai_isolement_j;
    const bins = [["0–1 j", 0, 1], ["2–3 j", 2, 3], ["4–5 j", 4, 5], ["6–7 j", 6, 7], ["8 j et plus", 8, 999]];
    const bRows = bins.map(([l, a, b]) => { const g = wd.filter(c => c.d_isol >= a && c.d_isol <= b), k = g.filter(c => c.deces).length, w = wil(k, g.length); return { l, n: g.length, k, p: ratio(k, g.length), lo: w[0], hi: w[1] }; });
    const early = wd.filter(c => c.d_isol <= tg), late = wd.filter(c => c.d_isol > tg);
    const le = ratio(early.filter(c => c.deces).length, early.length), ll = ratio(late.filter(c => c.deces).length, late.length);
    const ageD = med(cs.filter(c => c.deces).map(c => c.age)), ageV = med(cs.filter(c => !c.deces).map(c => c.age));
    const su = ctSusp();
    const out = { conf: 0, dec: 0, fin: 0, encours: 0 };
    su.forEach(o => { const x = o.x; if (strongLk(x) || x.codes.includes("3")) out.conf++; else if (x.codes.includes("2")) out.dec++; else if (x._dlc + 21 < tTo()) out.fin++; else out.encours++; });
    H.after(() => {
      Ch.xy($("#c-cl-del"), { data: Array.from({ length: 15 }, (_, i) => ({ j: i === 14 ? "14+" : String(i), n: wd.filter(c => (i === 14 ? c.d_isol >= 14 : c.d_isol === i)).length })), x: "j", height: 220, barWidth: .85,
        xLabel: (v, r, tip) => tip ? `${v} jours` : v, series: [{ key: "n", label: "Cas", color: "--s1" }], legend: false });
      Ch.xy($("#c-cl-let"), { data: bRows.map(r => ({ l: r.l, p: r.p })), x: "l", height: 220, percent: true, digits: 1, xLabel: (v, r, tip) => tip ? `${v} entre début des signes et isolement` : v, series: [{ key: "p", label: "Létalité (%)", color: "--rc-rt" }], legend: false });
    });
    return `${notice(`<b>Symptômes et clinique</b>, les bases de la zone de santé (suivi des contacts, liste des cas) <b>ne contiennent ni les symptômes, ni les signes cliniques, ni l'évolution en centre de traitement</b>. Les analyses ci-dessous utilisent ce qui est disponible : début des signes, isolement, issue (décès / vivant), âge, et les contacts devenus suspects. Pour une analyse des symptômes, joindre la liste linéaire clinique (fiche d'investigation) ; l'outil national la traite déjà.`, "warn")}
    <div class="grid g5">
      ${kpi("Cas avec date de début des signes", nf(wd.length), `sur ${nf(cs.length)} cas de la période`, { color: "--s1" })}
      ${kpi("Délai médian début des signes → isolement", wd.length ? nf(med(wd.map(c => c.d_isol)), 1) + " j" : "—", `cible ≤ ${tg} j · ${pc(ratio(early.length, wd.length), 0)} des cas dans le délai`, { cls: med(wd.map(c => c.d_isol)) > tg ? "alert" : "good", color: "--s2" })}
      ${kpi(`Létalité si isolés en ≤ ${tg} j`, pc(le, 1), `${nf(early.length)} cas ${ci(...wil(early.filter(c => c.deces).length, early.length))}`, { color: "--good" })}
      ${kpi(`Létalité si isolés après ${tg} j`, pc(ll, 1), `${nf(late.length)} cas ${ci(...wil(late.filter(c => c.deces).length, late.length))}`, { cls: ll > le ? "alert" : "", color: "--critical" })}
      ${kpi("Âge médian des cas", `${nf(ageD, 0)} / ${nf(ageV, 0)} ans`, "décédés / vivants", { color: "--ink-2" })}
    </div>
    <div class="grid g2">
      ${panel("Délai entre le début des signes et l'isolement", `Cas de la période ; dernière barre : 14 jours et plus · cible ≤ ${tg} j`, `<div id="c-cl-del"></div>`, { png: "delai_isolement" })}
      ${panel("Létalité selon le délai d'isolement", "Un isolement tardif est associé à une létalité plus élevée (prise en charge plus tardive)", `<div id="c-cl-let"></div><table class="rsum"><thead><tr><th>Délai</th><th>Cas</th><th>Décès</th><th>Létalité</th><th>IC 95 %</th></tr></thead><tbody>${bRows.map(r => `<tr><td>${r.l}</td><td>${nf(r.n)}</td><td>${nf(r.k)}</td><td>${pc(r.p, 1)}</td><td>${r.lo !== null ? `${nf(r.lo, 1)}, ${nf(r.hi, 1)} %` : "—"}</td></tr>`).join("")}</tbody></table>`, { png: "letalite_delai_isolement" })}
    </div>
    ${panel("Contacts devenus suspects pendant le suivi", `Premier code « 1 » de la grille pendant la période · ${perTxt()}`, `<div class="grid g5">${[["Devenus suspects", su.length, "--st-susp"], ["… devenus confirmés", out.conf, "--st-conf"], ["… décédés", out.dec, "--ink-2"], ["… sortis du suivi sans confirmation", out.fin, "--good"], ["… encore en suivi", out.encours, "--s1"]].map(([l, v, c]) => kpi(l, nf(v), "", { color: c })).join("")}</div>
      ${interp("Lecture", [su.length ? `${pc(ratio(out.conf, su.length), 0)} des contacts devenus suspects ont été confirmés : ${out.conf / Math.max(su.length, 1) > .3 ? "la définition de suspect chez les contacts est très spécifique, isoler et prélever sans délai." : "la plupart des suspects chez les contacts sont écartés : maintenir le prélèvement systématique."}` : "Aucun contact devenu suspect sur la période.",
        "Les signes présentés par ces suspects ne figurent pas dans la base de suivi."])}`)}`;
  }

  /* ================================================================== LABORATOIRE */
  function laboView() {
    if (NTR.length) return laboPosView();
    const cs = casRows();
    const conf = cs.filter(c => c.classe === "Confirmé"), prob = cs.filter(c => c.classe === "Probable");
    const dConf = cs.map(c => c.d_conf).filter(v => v !== null && v !== undefined);
    const iConf = cs.filter(c => c.isolement && c.confirmation).map(c => days_(c.isolement, c.confirmation)).filter(v => v >= 0 && v <= 30);
    const sb = sbcRows(), ra = raRows();
    const ws = weeks();
    H.after(() => {
      const data = ws.map(w => { const c7 = CAS.filter(c => !c.hors_zs && (!S.aire || c.aire === S.aire) && c.confirmation && wk(c.confirmation) === w);
        return { week: iso(w), n: c7.length, dds: med(c7.map(c => c.d_conf)), iso_: med(c7.filter(c => c.isolement).map(c => days_(c.isolement, c.confirmation)).filter(v => v >= 0 && v <= 30)) }; });
      Ch.xy($("#c-lab-wk"), { data, x: "week", height: 230, ...wlab, series: [{ key: "n", label: "Cas confirmés (semaine de confirmation)", color: "--s3" }] });
      Ch.xy($("#c-lab-del"), { data, x: "week", height: 230, digits: 1, ...wlab, series: [{ key: "dds", label: "Délai médian début des signes → confirmation (j)", color: "--s2", type: "line" }, { key: "iso_", label: "Délai médian isolement → confirmation (j)", color: "--s7", type: "line" }] });
    });
    const rows = AIRES.map(a => { const c_ = cs.filter(c => c.aire === a.cle), s_ = sb.filter(r => r.aire === a.cle), r_ = ra.filter(r => r.aire === a.cle);
      return { aire: a.nom, conf: c_.filter(c => c.classe === "Confirmé").length, prob: c_.filter(c => c.classe === "Probable").length, dds: med(c_.map(c => c.d_conf)),
        iso_: med(c_.filter(c => c.isolement && c.confirmation).map(c => days_(c.isolement, c.confirmation)).filter(v => v >= 0 && v <= 30)), sw: sum(s_, "deces_comm_swabes"), pre: sum(r_, "preleves") }; });
    return `${notice(`<b>Laboratoire</b>, les bases de la zone de santé ne contiennent pas les résultats de laboratoire (dates de prélèvement, résultats négatifs, valeurs Ct) : la positivité et le rendu des résultats ne peuvent pas être calculés. Analyses disponibles : confirmations par semaine, délais jusqu'à la confirmation, prélèvements signalés par la SBC (décès communautaires swabés) et la recherche active (prélèvements sur place).`, "warn")}
    <div class="grid g5">
      ${kpi("Cas confirmés", nf(conf.length), `${nf(prob.length)} probables (sans confirmation biologique)`, { color: "--s3" })}
      ${kpi("Délai médian début des signes → confirmation", dConf.length ? nf(med(dConf), 1) + " j" : "—", `${nf(dConf.length)} cas avec les deux dates`, { color: "--s2" })}
      ${kpi("Délai médian isolement → confirmation", iConf.length ? nf(med(iConf), 1) + " j" : "—", `${pc(ratio(iConf.filter(v => v <= 2).length, iConf.length), 0)} confirmés en 2 jours ou moins`, { color: "--s7" })}
      ${kpi("Décès communautaires swabés", nf(sum(sb, "deces_comm_swabes")), "Échantillons post-mortem (SBC)", { color: "--ink-2" })}
      ${kpi("Prélèvements de la recherche active", nf(sum(ra, "preleves")), `${nf(sum(ra, "en_cours_prelevement"))} en cours de prélèvement`, { color: "--s4" })}
    </div>
    <div class="grid g2">
      ${panel("Confirmations par semaine", perTxt(), `<div id="c-lab-wk"></div>`, { png: "confirmations_semaine" })}
      ${panel("Délais jusqu'à la confirmation", "Médiane hebdomadaire ; un délai qui s'allonge retarde l'isolement des contacts et le listage", `<div id="c-lab-del"></div>`, { png: "delais_confirmation" })}
    </div>
    ${panel("Laboratoire par aire de santé", perTxt(), table("lab-as", rows, [{ k: "aire", t: "Aire de santé" }, { k: "conf", t: "Confirmés", num: true }, { k: "prob", t: "Probables", num: true }, { k: "dds", t: "Début → confirmation (médiane, j)", num: true, d: 1 },
      { k: "iso_", t: "Isolement → confirmation (médiane, j)", num: true, d: 1 }, { k: "sw", t: "Décès comm. swabés", num: true }, { k: "pre", t: "Prélevés (RA)", num: true }], { sort: "conf", search: false, limit: 40 }), { csv: "lab-as" })}`;
  }
  const days_ = (a, b) => Math.round(day(b) - day(a));
  /* laboratoire avec résultats individuels : positivité, re-prélèvements, délais de rendu, post-mortem */
  function laboPosView() {
    const L = NT.filter(r => inPer(r.prel || r.notif) && (!S.aire || r.aire === S.aire)), res = L.filter(r => r.resultat === "Positif" || r.resultat === "Négatif");
    const pos = res.filter(r => r.resultat === "Positif"), rep = L.filter(r => /re-pr/i.test(r.source || "")), pm = res.filter(r => r.nature === "Décès");
    const dRes = med(res.map(r => r.prel && r.result ? days_(r.prel, r.result) : null).filter(v => v !== null && v >= 0 && v <= 30));
    const dNot = med(res.map(r => r.debut && r.prel ? days_(r.debut, r.prel) : null).filter(v => v !== null && v >= 0 && v <= 60));
    const att = L.filter(r => r.preleve && (!r.resultat || r.resultat === "En attente")).length;
    const ws = weeks();
    H.after(() => {
      const data = ws.map(w => { const x = NT.filter(r => (!S.aire || r.aire === S.aire) && (r.prel || r.notif) && wk(r.prel || r.notif) === w), rr = x.filter(r => r.resultat === "Positif" || r.resultat === "Négatif");
        return { week: iso(w), pos: rr.filter(r => r.resultat === "Positif").length, neg: rr.filter(r => r.resultat === "Négatif").length, p: rr.length ? 100 * rr.filter(r => r.resultat === "Positif").length / rr.length : null,
          ppm: rr.filter(r => r.nature === "Décès").length ? 100 * rr.filter(r => r.nature === "Décès" && r.resultat === "Positif").length / rr.filter(r => r.nature === "Décès").length : null }; });
      Ch.xy($("#c-pos-wk"), { data, x: "week", stacked: true, height: 240, ...wlab, series: [{ key: "pos", label: "Positifs", color: "--st-conf" }, { key: "neg", label: "Négatifs", color: "--s3" }] });
      Ch.xy($("#c-pos-p"), { data, x: "week", height: 220, percent: true, digits: 1, ...wlab, series: [{ key: "p", label: "Positivité de tous les échantillons (%)", color: "--st-conf", type: "line" }, { key: "ppm", label: "Positivité des prélèvements post-mortem (%)", color: "--ink-2", type: "line" }] });
    });
    const rows = AIRES.map(a => { const x = res.filter(r => r.aire === a.cle), p_ = x.filter(r => r.resultat === "Positif").length, m_ = x.filter(r => r.nature === "Décès");
      return { aire: a.nom, n: x.length, pos: p_, p: ratio(p_, x.length), pm: m_.length, ppm: ratio(m_.filter(r => r.resultat === "Positif").length, m_.length), rep: L.filter(r => r.aire === a.cle && /re-pr/i.test(r.source || "")).length,
        d: med(x.map(r => r.prel && r.result ? days_(r.prel, r.result) : null).filter(v => v !== null && v >= 0 && v <= 30)) }; }).filter(r => r.n);
    const lastRes = NTR.map(r => r.prel || r.notif).filter(Boolean).sort().pop();
    return `${notice(`<b>Laboratoire et positivité</b>, échantillons analysés (${esc([...new Set(NT.map(r => r.source).filter(Boolean))].slice(0, 3).join(", "))}) : positivité, échantillons post-mortem, re-prélèvements et délais de rendu des résultats. ${perTxt()}${S.aire ? " · " + esc(AN[S.aire]) : ""}.${lastRes && lastRes < S.date ? ` <b>Résultats saisis jusqu'au ${dfr(lastRes)}</b> : choisissez une période plus longue (« 90 j » ou « Tout ») pour l'analyse complète.` : ""}`, lastRes && day(S.date) - day(lastRes) > 7 ? "warn" : "")}
    <div class="grid g5">
      ${kpi("Échantillons avec résultat", nf(res.length), `${nf(att)} en attente · ${nf(rep.length)} re-prélèvements`, { color: "--s3" })}
      ${kpi("Positivité", pc(ratio(pos.length, res.length), 1), `${nf(pos.length)} positifs`, { color: "--st-conf", cls: ratio(pos.length, res.length) > 10 ? "alert" : "" })}
      ${kpi("Positivité post-mortem", pc(ratio(pm.filter(r => r.resultat === "Positif").length, pm.length), 1), `${nf(pm.length)} échantillons de personnes décédées`, { color: "--ink-2" })}
      ${kpi("Prélèvement → résultat", dRes !== null ? nf(dRes, 0) + " j" : "—", "délai médian de rendu", { color: "--s7", cls: dRes > 2 ? "alert" : "" })}
      ${kpi("Début des signes → prélèvement", dNot !== null ? nf(dNot, 0) + " j" : "—", "délai médian (détection)", { color: "--s2", cls: dNot > 3 ? "alert" : "" })}
    </div>
    <div class="grid g2">
      ${panel("Échantillons positifs et négatifs par semaine", "Semaine de prélèvement", `<div id="c-pos-wk"></div>`, { png: "positivite_semaine" })}
      ${panel("Positivité par semaine", "Une positivité qui augmente signale une transmission active ou une surveillance trop peu sensible (trop peu de suspects testés)", `<div id="c-pos-p"></div>`, { png: "positivite_taux" })}
    </div>
    ${panel("Laboratoire par unité", perTxt(), table("lab-pos", rows, [{ k: "aire", t: "Unité" }, { k: "n", t: "Échantillons", num: true }, { k: "pos", t: "Positifs", num: true }, { k: "p", t: "Positivité", num: true, v: x => pc(x.p, 1) },
      { k: "pm", t: "Post-mortem", num: true }, { k: "ppm", t: "Positivité post-mortem", num: true, v: x => pc(x.ppm, 1) }, { k: "rep", t: "Re-prélèvements", num: true }, { k: "d", t: "Prélèvement → résultat (j)", num: true }], { sort: "n", search: false, limit: 60 }), { csv: "lab-pos" })}`;
  }

  /* ================================================================== PRISE EN CHARGE, VACCINATION ET EXPOSITIONS */
  const CADC = { "Structure de santé (soins, hospitalisation)": "--st-conf", "Visite au malade": "--s5", "Ménage et famille": "--s2", "Voisinage et amis": "--s4", "Lieu de culte": "--s7",
    "Funérailles": "--ink-2", "Travail, école, transport, commerce": "--s1", "Tradipraticien": "--s8", "Autre": "--st-done", "Non renseigné": "--st-inc" };
  function pecView() {
    const cs = casRows(), tg = C.delai_isolement_j;
    const wd = cs.filter(c => c.d_isol !== null && c.d_isol !== undefined);
    const reg = ctReg();
    const vac = { "Vacciné": 0, "Non vacciné": 0, "Inconnu": 0 }; reg.forEach(x => { vac[x.vacc in vac ? x.vacc : "Inconnu"]++; });
    const hr = reg.filter(x => x.hr), hrV = hr.filter(x => x.vacc === "Vacciné").length;
    const su = ctSusp(), suIso = su.filter(o => o.x.iso === "Oui").length, suIsoK = su.filter(o => o.x.iso).length;
    // expositions : cadre (lieu potentiel) et type de contact
    const allC = CT.filter(x => (!S.aire || x.aire === S.aire) && (S.preset === "tout" || inPer(x.ent)));
    const cad = {}; allC.forEach(x => { const k = x.cadre || "Non renseigné"; const o = cad[k] = cad[k] || { t: k, n: 0, cas: 0, susp: 0 }; o.n++; if (strongLk(x)) o.cas++; if (x.codes.includes("1")) o.susp++; });
    const cadRows = Object.values(cad).map(o => { const w = wil(o.cas, o.n); return { ...o, taux: ratio(o.cas, o.n), lo: w[0], hi: w[1] }; }).sort((a, b) => b.n - a.n);
    const sec = allC.filter(strongLk);
    const typ = {}; allC.forEach(x => { const ds = String(x.type || "").match(/[1-9]/g); (ds ? [...new Set(ds)] : ["non renseigné"]).forEach(d => typ[d] = (typ[d] || 0) + 1); });
    const q = {}; allC.forEach(x => { if (!x.qrt) return; const o = q[x.qrt] = q[x.qrt] || { t: x.qrt, n: 0, cas: 0, idx: new Set() }; o.n++; if (strongLk(x)) o.cas++; o.idx.add(x.cas); });
    const qRows = Object.values(q).map(o => ({ t: o.t, n: o.n, cas: o.cas, idx: o.idx.size })).sort((a, b) => b.cas - a.cas || b.n - a.n).slice(0, 25);
    const ws = weeks();
    H.after(() => {
      const data = ws.map(w => { const c7 = CAS.filter(c => !c.hors_zs && (!S.aire || c.aire === S.aire) && c.date && wk(c.date) === w && c.d_isol !== null && c.d_isol !== undefined);
        return { week: iso(w), med: med(c7.map(c => c.d_isol)), pct: c7.length ? 100 * c7.filter(c => c.d_isol <= tg).length / c7.length : null }; });
      Ch.xy($("#c-pec-del"), { data, x: "week", height: 220, digits: 1, ...wlab, hlines: [{ y: tg, color: "--ink-2", dash: "6 4", label: `cible ${tg} j` }], series: [{ key: "med", label: "Délai médian début des signes → isolement (j)", color: "--s2", type: "line" }] });
      const vw = ws.map(w => { const r7 = CT.filter(x => (!S.aire || x.aire === S.aire) && x.ent && wk(x.ent) === w); return { week: iso(w), v: r7.filter(x => x.vacc === "Vacciné").length, nv: r7.filter(x => x.vacc === "Non vacciné").length, i: r7.filter(x => x.vacc !== "Vacciné" && x.vacc !== "Non vacciné").length }; });
      Ch.xy($("#c-vac-wk"), { data: vw, x: "week", stacked: true, height: 230, ...wlab, series: [{ key: "v", label: "Vaccinés", color: "--good" }, { key: "nv", label: "Non vaccinés", color: "--critical" }, { key: "i", label: "Statut inconnu", color: "--st-inc" }] });
    });
    const asRows = AIRES.map(a => { const r_ = reg.filter(x => x.aire === a.cle), h_ = r_.filter(x => x.hr), c_ = cs.filter(c => c.aire === a.cle && c.d_isol !== null && c.d_isol !== undefined);
      const dom = {}; r_.forEach(x => dom[x.cadre] = (dom[x.cadre] || 0) + 1); const top = Object.entries(dom).sort((a_, b) => b[1] - a_[1])[0];
      return { aire: a.nom, ct: r_.length, vac: ratio(r_.filter(x => x.vacc === "Vacciné").length, r_.length), inc: ratio(r_.filter(x => x.vacc !== "Vacciné" && x.vacc !== "Non vacciné").length, r_.length), hr: h_.length, hrv: ratio(h_.filter(x => x.vacc === "Vacciné").length, h_.length),
        dis: med(c_.map(c => c.d_isol)), cadre: top ? `${top[0]} (${pc(100 * top[1] / r_.length, 0)})` : "—" }; });
    const nReg = reg.length;
    return `${notice(`<b>Prise en charge, vaccination et expositions</b>, isolement des cas (liste des cas), suspects isolés et statut vaccinal des contacts (base de suivi), type de contact et lien avec le cas source. Le <b>lieu potentiel de contamination</b> est déduit du lien déclaré avec le cas source (co-patient, personnel de santé → structure de santé ; famille → ménage ; voisin, ami → voisinage ; église → lieu de culte…). ${perTxt()}${S.aire ? " · " + esc(AN[S.aire]) : ""}.`)}
    <div class="grid g5">
      ${kpi("Délai médian début des signes → isolement", wd.length ? nf(med(wd.map(c => c.d_isol)), 1) + " j" : "—", `${pc(ratio(wd.filter(c => c.d_isol <= tg).length, wd.length), 0)} des cas isolés en ≤ ${tg} j`, { cls: med(wd.map(c => c.d_isol)) > tg ? "alert" : "good", color: "--s2" })}
      ${kpi("Suspects (contacts) isolés", suIsoK ? pc(ratio(suIso, suIsoK), 0) : "—", `${nf(suIso)} / ${nf(suIsoK)} renseignés · ${nf(su.length)} devenus suspects`, { color: "--st-susp" })}
      ${kpi("Contacts vaccinés", pc(ratio(vac["Vacciné"], nReg), 0), `${nf(vac["Vacciné"])} / ${nf(nReg)} contacts listés sur la période · ${pc(ratio(vac["Inconnu"], nReg), 0)} statut inconnu`, { cls: ratio(vac["Vacciné"], nReg) < 50 ? "alert" : "good", meter: ratio(vac["Vacciné"], nReg), color: "--good" })}
      ${kpi("Contacts à haut risque vaccinés", pc(ratio(hrV, hr.length), 0), `${nf(hrV)} / ${nf(hr.length)} contacts à haut risque`, { cls: hr.length && ratio(hrV, hr.length) < 80 ? "alert" : "", meter: ratio(hrV, hr.length), color: "--brand-2" })}
      ${kpi("Exposition en structure de santé", pc(ratio((cad["Structure de santé (soins, hospitalisation)"] || {}).n || 0, allC.length), 0), `des contacts listés · ${nf((cad["Structure de santé (soins, hospitalisation)"] || {}).cas || 0)} devenus cas`, { cls: "alert", color: "--st-conf" })}
    </div>
    <div class="grid g2">
      ${panel("Délai d'isolement par semaine", `Médiane hebdomadaire · cible ≤ ${tg} j`, `<div id="c-pec-del"></div>`, { png: "delai_isolement_semaine" })}
      ${panel("Statut vaccinal des contacts listés par semaine", "Semaine d'enregistrement du contact", `<div id="c-vac-wk"></div>`, { png: "vaccination_contacts" })}
    </div>
    <div class="grid g2">
      ${panel("Lieux potentiels de contamination", "Contacts listés selon le cadre de l'exposition (déduit du lien avec le cas source) ; nombre de contacts devenus cas", hbars(cadRows.map(o => ({ t: o.t, v: o.n, c: CADC[o.t] || "--s1", txt: `${nf(o.n)} · ${nf(o.cas)} cas` })), { lw: 260, vw: 110 }) + legend([{ t: "contacts listés · dont devenus cas (lien certain ou probable)", c: "--s1" }]))}
      ${panel("Où les cas secondaires documentés ont-ils été contaminés ?", `${nf(sec.length)} contacts devenus cas : cadre de leur exposition au cas source`, sec.length ? hbars(Object.entries(sec.reduce((o, x) => (o[x.cadre] = (o[x.cadre] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ t, v, c: CADC[t] || "--s1", txt: `${nf(v)} (${pc(100 * v / sec.length, 0)})` })), { lw: 260, vw: 110 }) : `<div class="empty">Aucun contact devenu cas documenté sur la période.</div>`)}
    </div>
    ${panel("Risque par cadre d'exposition", "Taux d'attaque secondaire = contacts devenus cas / contacts listés (IC 95 % de Wilson) ; les contacts devenus suspects sont aussi indiqués", `<table class="rsum"><thead><tr><th>Cadre d'exposition</th><th>Contacts</th><th>Devenus suspects</th><th>Devenus cas</th><th>Taux d'attaque</th><th>IC 95 %</th></tr></thead><tbody>${cadRows.map(o => `<tr><td><i class="dot" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:${col(CADC[o.t] || "--s1")}"></i>${esc(o.t)}</td><td>${nf(o.n)}</td><td>${nf(o.susp)}</td><td>${nf(o.cas)}</td><td>${pc(o.taux, 2)}</td><td>${o.lo !== null ? `${nf(o.lo, 2)}, ${nf(o.hi, 2)} %` : "—"}</td></tr>`).join("")}</tbody></table>`)}
    <div class="grid g2">
      ${panel("Type de contact (code de la fiche)", "Codes du champ « TYPE DE CONTACT » (dictionnaire de la base : 1 à 4) ; un contact peut cumuler plusieurs types", hbars(Object.entries(typ).sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t: t === "non renseigné" ? "Non renseigné" : `Type ${t}`, v, c: "--s1", txt: `${nf(v)} (${pc(100 * v / Math.max(allC.length, 1), 0)})` })), { lw: 140, vw: 110 }))}
      ${panel("Quartiers et lieux les plus cités", "Quartier déclaré des contacts (25 premiers, contacts devenus cas d'abord), les noms de structures (HGR, CS…) indiquent une exposition en structure de santé", table("qrt", qRows, [{ k: "t", t: "Quartier / lieu" }, { k: "n", t: "Contacts", num: true }, { k: "idx", t: "Cas sources", num: true }, { k: "cas", t: "Devenus cas", num: true }], { sort: "cas", search: false, maxh: 360, limit: 25 }), { csv: "qrt" })}
    </div>
    ${panel("Prise en charge, vaccination et expositions par aire de santé", `Contacts enregistrés pendant la période · ${perTxt()}`, table("pec-as", asRows, [{ k: "aire", t: "Aire de santé" }, { k: "ct", t: "Contacts listés", num: true }, { k: "vac", t: "% vaccinés", num: true, v: x => pc(x.vac, 0) }, { k: "inc", t: "% statut inconnu", num: true, v: x => pc(x.inc, 0) },
      { k: "hr", t: "Haut risque", num: true }, { k: "hrv", t: "% haut risque vaccinés", num: true, v: x => pc(x.hrv, 0) }, { k: "dis", t: "Délai d'isolement (médiane, j)", num: true, d: 1 }, { k: "cadre", t: "Cadre d'exposition principal", wrap: true }], { sort: "ct", search: false, limit: 40 }), { csv: "pec-as" })}
    ${interp("Lecture", [cadRows[0] ? `Le premier cadre d'exposition est <b>${esc(cadRows[0].t.toLowerCase())}</b> (${pc(100 * cadRows[0].n / Math.max(allC.length, 1), 0)} des contacts listés).` : "",
      cad["Structure de santé (soins, hospitalisation)"] ? `${nf(cad["Structure de santé (soins, hospitalisation)"].n)} contacts ont été exposés dans une structure de santé (co-patients, personnel, gardes-malades) : renforcer la prévention et le contrôle de l'infection (PCI), le triage et l'isolement dans les formations sanitaires.` : "",
      `${pc(ratio(vac["Inconnu"], nReg), 0)} des contacts n'ont pas de statut vaccinal renseigné : compléter la variable « VACCINATION » pour suivre la vaccination en anneau.`],
      "Le cadre est déduit du lien déclaré avec le cas source ; la date de vaccination n'est pas renseignée dans la base, la couverture est donc rapportée à la semaine d'enregistrement du contact.")}`;
  }

  return { alertes: { view: alertesView }, deces: { view: decesView }, clinique: { view: cliniqueView }, labo: { view: laboView }, pec: { view: pecView } };
};
