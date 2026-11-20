/* Ebola Outbreak, outil provincial de l'Ituri : blocs repris de l'outil national (Ebola Outbreak Analytics Hub)
   · suivi des contacts : statuts nationaux, contacts à rechercher, fins de suivi, suspects, cas index ;
   · situation du jour (cas de la journée) ;
   · prise en charge (export DHIS2).
   Les données viennent des blocs « ct », « jour » et « pec » produits par scripts/contact_tracing.py (province : province.js ; zone : zs/<zone>.js).
   X : utilitaires de la page appelante { esc, nf, pc, dfr, dshort, kpi, panel, table, notice, pill, after, G, col, unite(cle) -> nom, excel } */
(function () {
  "use strict";
  const toObj = b => (b && b.rows ? b.rows.map(r => Object.fromEntries(b.cols.map((c, i) => [c, r[i]]))) : []);
  const STC = { "Vu ≤24 h": "--st-v24", "Vu 1–3 j": "--s1", "Non vu >3 j": "--st-nv", "Jamais vu": "--s7", "Devenu suspect": "--st-susp", "Devenu confirmé": "--critical",
    "Suivi terminé (21 j)": "--st-done", "Suivi clôturé incomplet": "--s4", "Décédé": "--s2", "Doublon": "--s5", "Recyclé": "--s3", "Transféré": "--s6", "Pas encore suivi": "--st-inc" };
  const stPill = (X, s) => X.pill(s, /Non vu|Jamais|Devenu/.test(s) ? "bad" : /Vu ≤24/.test(s) ? "ok" : /Vu 1|incomplet/.test(s) ? "warn" : "");
  const tri = (X, v) => v === null || v === undefined ? `<span class="muted">—</span>` : X.pill(v ? "Oui" : "Non", v ? "ok" : "warn");

  function contacts(ct, X) {
    if (!ct || !ct.kpi) return "";
    const k = ct.kpi, u = ct.unite === "zone" ? "Zone de santé" : "Aire de santé", esc = X.esc, nf = X.nf, pc = X.pc, zc = ct.unite === "zone";
    const un = c => esc(X.unite ? X.unite(c) : c);
    const ids = { st: "nat-ct-statuts" };
    X.after(() => { X.G.hbars(document.getElementById(ids.st), { items: ct.statuts.map(s => ({ label: s.statut, value: s.n, color: X.col(STC[s.statut] || "--s1"), sub: pc(100 * s.n / Math.max(1, k.contacts), 0) })) }); });
    const cols = (extra) => [{ k: "nom", t: u }, { k: "contacts", t: "Contacts listés", num: 1 }, { k: "actifs", t: "En suivi actif", num: 1 }, { k: "vus_24h", t: "Vus ≤24 h", num: 1 },
      { k: "pct_vus_24h", t: "% vus ≤24 h", num: 1, v: r => r.pct_vus_24h === null || r.pct_vus_24h === undefined ? "—" : X.pill(pc(r.pct_vus_24h, 0), r.pct_vus_24h >= 90 ? "ok" : r.pct_vus_24h >= 75 ? "warn" : "bad") },
      { k: "non_vus_3j", t: "Non vus >3 j", num: 1, v: r => nf((r.non_vus_3j || 0) + (r.jamais_vus || 0)) }, { k: "fin_suivi_3j", t: "Fin de suivi ≤3 j", num: 1 },
      { k: "devenus_suspects", t: "Devenus suspects", num: 1 }, { k: "devenus_cas", t: "Devenus cas", num: 1 }, { k: "termines", t: "Suivi terminé (21 j)", num: 1 },
      { k: "pct_suivi_complet_21j", t: "% suivi complet", num: 1, v: r => pc(r.pct_suivi_complet_21j, 0) }, { k: "cas_index", t: "Cas index", num: 1 }]
      .concat(zc ? [{ k: "date", t: "Référence du suivi", v: r => X.dfr(r.date, false) }] : []).concat(extra || []);
    const rech = toObj(ct.a_rechercher), fin = toObj(ct.fin_suivi), sus = toObj(ct.suspects);
    const colsL = [{ k: "zone", t: "Zone de santé", v: r => un(r.zone) }, { k: "unite", t: "Aire de santé", v: r => esc(zc ? r.unite : (X.unite ? X.unite(r.unite) : r.unite)) }, { k: "id", t: "Contact" }, { k: "ini", t: "Initiales" },
      { k: "cas", t: "Cas source" }, { k: "sexe", t: "Sexe" }, { k: "age", t: "Âge", num: 1 }, { k: "dlc", t: "Dernier contact", v: r => X.dfr(r.dlc, false) }, { k: "jour", t: "Jour", v: r => "J" + (r.jour ?? "—") },
      { k: "jours_depuis_vu", t: "Jours depuis le dernier vu", num: 1, v: r => r.jours_depuis_vu === null ? "jamais vu" : nf(r.jours_depuis_vu) }, { k: "statut", t: "Statut", v: r => stPill(X, r.statut) },
      { k: "sup", t: "Superviseur / équipe" }, { k: "reco", t: "ReCo / ESS" }, { k: "fin", t: "Fin de suivi", v: r => X.dfr(r.fin, false) }].filter(c => zc || c.k !== "zone");
    const colsF = [{ k: "zone", t: "Zone de santé", v: r => un(r.zone) }, { k: "unite", t: "Aire de santé", v: r => esc(zc ? r.unite : (X.unite ? X.unite(r.unite) : r.unite)) }, { k: "id", t: "Contact" }, { k: "ini", t: "Initiales" }, { k: "cas", t: "Cas source" },
      { k: "dlc", t: "Dernier contact", v: r => X.dfr(r.dlc, false) }, { k: "fin", t: "Fin de suivi", v: r => X.dfr(r.fin, false) }, { k: "jours_restants", t: "Jours restants", num: 1 }, { k: "statut", t: "Statut", v: r => stPill(X, r.statut) },
      { k: "compl", t: "Complétude", num: 1, v: r => pc(r.compl, 0) }, { k: "sup", t: "Superviseur / équipe" }].filter(c => zc || c.k !== "zone");
    const colsS = [{ k: "zone", t: "Zone de santé", v: r => un(r.zone) }, { k: "unite", t: "Aire de santé", v: r => esc(zc ? r.unite : (X.unite ? X.unite(r.unite) : r.unite)) }, { k: "id", t: "Contact" }, { k: "ini", t: "Initiales" }, { k: "cas", t: "Cas source" },
      { k: "sexe", t: "Sexe" }, { k: "age", t: "Âge", num: 1 }, { k: "dlc", t: "Dernier contact", v: r => X.dfr(r.dlc, false) }, { k: "date_suspect", t: "Devenu suspect le", v: r => X.dfr(r.date_suspect, false) }, { k: "issue", t: "Issue du suivi" }, { k: "statut", t: "Statut", v: r => stPill(X, r.statut) }].filter(c => zc || c.k !== "zone");
    const colsI = [{ k: "zone", t: "Zone de santé", v: r => un(r.zone) }, { k: "cas", t: "Cas index" }, { k: "dans_liste", t: "Dans la liste des cas", v: r => tri(X, r.dans_liste) }, { k: "contacts", t: "Contacts", num: 1 }, { k: "actifs", t: "Actifs", num: 1 },
      { k: "vus_24h", t: "Vus ≤24 h", num: 1 }, { k: "pct_vus_24h", t: "% vus ≤24 h", num: 1, v: r => pc(r.pct_vus_24h, 0) }, { k: "non_vus_3j", t: "Non vus >3 j", num: 1 }, { k: "suspects", t: "Suspects", num: 1 }, { k: "devenus_cas", t: "Devenus cas", num: 1 },
      { k: "taux_attaque_sec", t: "Taux d'attaque secondaire", num: 1, v: r => pc(r.taux_attaque_sec, 1) }, { k: "termines", t: "Suivis terminés", num: 1 }, { k: "dernier_listage", t: "Dernier listage", v: r => X.dfr(r.dernier_listage, false) }].filter(c => zc || c.k !== "zone");
    const nv = (k.non_vus_3j || 0) + (k.jamais_vus || 0);
    const retard = ct.retard_j ? X.notice(`<b>Date de référence du suivi : ${X.dfr(ct.date)}</b> (${nf(ct.retard_j)} jour${ct.retard_j > 1 ? "s" : ""} avant la date de situation du ${X.dfr(ct.date_situation)}) : les visites saisies dans DHIS2 après cette date sont encore incomplètes ; les statuts sont calculés à cette date, comme dans l'outil national.`, "warn") : "";
    const fixe = X.dateChoisie && X.dateChoisie !== ct.date_situation ? X.notice(`Ces indicateurs sont calculés à la date de l'analyse (${X.dfr(ct.date)}) ; la période choisie en haut de page s'applique aux séries journalières plus bas.`, "") : "";
    return `${retard}${fixe}<p class="lead">Suivi des contacts au <b>${X.dfr(ct.date)}</b>, indicateurs de l'outil national calculés sur la grille J1–J21 des exports DHIS2 : <b>${nf(k.actifs)}</b> contacts en suivi actif, <b>${nf(k.vus_24h)}</b> vus dans les 24 h (${pc(k.pct_vus_24h, 0)}), <b>${nf(nv)}</b> à rechercher (non vus depuis plus de 3 jours ou jamais vus).
        ${X.excel ? ` <a class="btn sm" href="${X.excel}" download>⤓ Classeur Excel (listes)</a>` : ""}</p>
      <div class="grid g5">
        ${X.kpi("Contacts en suivi actif", nf(k.actifs), `${nf(k.contacts)} contacts listés · ${nf(k.cas_index)} cas index`, { color: "--s1" })}
        ${X.kpi("Vus ≤24 h", nf(k.vus_24h), `${pc(k.pct_vus_24h, 0)} des contacts actifs · cible 90 %`, { color: "--st-v24", cls: k.pct_vus_24h !== null && k.pct_vus_24h < 90 ? "alert" : "good", meter: k.pct_vus_24h, meterColor: k.pct_vus_24h < 90 ? "--critical" : "--good" })}
        ${X.kpi("Non vus >3 j", nf(nv), `${nf(k.jamais_vus)} jamais vus · ${pc(k.pct_non_vus_3j, 0)} des actifs`, { color: "--st-nv", cls: nv ? "alert" : "" })}
        ${X.kpi("Fin de suivi ≤3 jours", nf(k.fin_suivi_3j), "contacts dont le 21e jour tombe dans les 3 prochains jours", { color: "--s4" })}
        ${X.kpi("Suivi complet sur 21 jours", pc(k.pct_suivi_complet_21j, 0), `${nf(k.termines)} terminés · ${nf(k.incomplets)} clôturés incomplets · complétude moyenne ${pc(k.completude_moy, 0)}`, { color: "--st-done", meter: k.pct_suivi_complet_21j })}
      </div>
      <div class="grid g5">
        ${X.kpi("Devenus suspects", nf(k.devenus_suspects), `${pc(k.contacts ? 100 * k.devenus_suspects / k.contacts : null, 1)} des contacts listés`, { color: "--st-susp" })}
        ${X.kpi("Devenus cas confirmés", nf(k.devenus_cas), `taux d'attaque secondaire ${pc(k.taux_attaque_sec, 2)}`, { color: "--critical" })}
        ${X.kpi("Contacts par cas index", nf(k.contacts_par_cas_index_median, 0), `médiane · ${nf(k.cas_index_hors_liste ?? 0)} cas index absents de la liste des cas`, { color: "--s3" })}
        ${X.kpi("Contacts reliés à un cas de la liste", pc(k.pct_contacts_relies, 0), "numéro EPID du cas source retrouvé dans la liste des cas", { color: "--s6", meter: k.pct_contacts_relies })}
        ${X.kpi("Nouveaux cas connus comme contacts", pc(k.pct_nouveaux_cas_connus_contacts, 0), `${nf(k.nouveaux_cas_connus_contacts ?? 0)} des ${nf(k.nouveaux_cas_14j ?? 0)} cas confirmés des 14 derniers jours · cible 80 %`, { color: "--s2", meter: k.pct_nouveaux_cas_connus_contacts })}
      </div>
      <div class="grid g2">
        ${X.panel("Statut des contacts", `Au ${X.dfr(ct.date)} ; un contact = un statut`, `<div id="${ids.st}"></div>`, { png: "statuts_contacts" })}
        ${X.panel(`Charge de suivi par ${u.toLowerCase()}`, "Contacts actifs, vus ≤24 h, à rechercher, fins de suivi", X.table("nat-ct-unite", ct.par_unite, cols(), { sort: "actifs", maxh: 420, total: { nom: "Total", contacts: k.contacts, actifs: k.actifs, vus_24h: k.vus_24h, pct_vus_24h: k.pct_vus_24h, non_vus_3j: nv, jamais_vus: 0, fin_suivi_3j: k.fin_suivi_3j, devenus_suspects: k.devenus_suspects, devenus_cas: k.devenus_cas, termines: k.termines, pct_suivi_complet_21j: k.pct_suivi_complet_21j, cas_index: k.cas_index } }), { csv: "nat-ct-unite" })}
      </div>
      ${X.panel(`Contacts à rechercher (non vus >3 jours, jamais vus) : ${nf(rech.length)}`, "Liste de travail pseudonymisée (identifiants, initiales) ; la liste nominative est dans sortie/…/confidentiel", X.table("nat-ct-rech", rech, colsL, { sort: "jours_depuis_vu", maxh: 460 }), { csv: "nat-ct-rech" })}
      <div class="grid g2">
        ${X.panel(`Fin de suivi dans les 3 prochains jours : ${nf(fin.length)}`, "Contacts dont le 21e jour de suivi est atteint dans ≤ 3 jours", X.table("nat-ct-fin", fin, colsF, { sort: "jours_restants", dir: 1, maxh: 400 }), { csv: "nat-ct-fin" })}
        ${X.panel(`Contacts devenus suspects : ${nf(sus.length)}`, "Date du premier jour « devenu suspect » dans la grille de suivi", X.table("nat-ct-sus", sus, colsS, { sort: "date_suspect", maxh: 400 }), { csv: "nat-ct-sus" })}
      </div>
      ${X.panel(`Cas index : ${nf(ct.cas_index.length)}`, "Contacts de chaque cas source, statut du jour, taux d'attaque secondaire", X.table("nat-ct-index", ct.cas_index, colsI, { sort: "actifs", maxh: 460 }), { csv: "nat-ct-index" })}`;
  }

  function jour(j, X) {
    if (!j || !j.synthese) return "";
    const s = j.synthese, nf = X.nf, pc = X.pc, esc = X.esc, u = j.unite === "zone" ? "Zone de santé" : "Aire de santé", up = n => j.unite === "zone" ? (n > 1 ? "zones de santé" : "zone de santé") : (n > 1 ? "aires de santé" : "aire de santé");
    const un = c => esc(X.unite ? X.unite(c) : c);
    const ids = { s: "nat-jour-serie", a: "nat-jour-alertes" };
    X.after(() => {
      const el = document.getElementById(ids.s);
      if (el) X.G.bars(el, { labels: j.serie.map(x => x.date), series: [{ label: "Cas confirmés", color: X.col("--critical"), values: j.serie.map(x => x.cas) }, { label: "Décès", color: X.col("--ink"), values: j.serie.map(x => x.deces) }], fmtX: (d, l) => l ? X.dfr(d) : X.dshort(d) });
      const ea = document.getElementById(ids.a);
      if (ea && j.serie.some(x => x.alertes !== null || x.a_suivre !== null)) X.G.lines(ea, { labels: j.serie.map(x => x.date), series: [{ label: "Alertes notifiées", color: X.col("--s4"), values: j.serie.map(x => x.alertes) }, { label: "Contacts à suivre", color: X.col("--s1"), values: j.serie.map(x => x.a_suivre) }, { label: "Contacts vus", color: X.col("--st-v24"), values: j.serie.map(x => x.vus) }], fmtX: (d, l) => l ? X.dfr(d) : X.dshort(d) });
    });
    const d7 = s.j7 - s.j7p, trend = d7 > 0 ? `▲ +${nf(d7)} par rapport aux 7 jours précédents` : d7 < 0 ? `▼ ${nf(d7)} par rapport aux 7 jours précédents` : "= 7 jours précédents";
    const sv = s.suivi_j0;
    const cols = [{ k: "nom", t: u }, { k: "j0", t: "Jour J", num: 1, v: r => r.j0 ? `<b>${nf(r.j0)}</b>` : "0" }, { k: "j1", t: "J−1", num: 1 }, { k: "j2", t: "J−2", num: 1 }, { k: "j7", t: "7 jours", num: 1 }, { k: "j7p", t: "7 j précédents", num: 1 },
      { k: "j21", t: "21 jours", num: 1 }, { k: "cumul", t: "Cumul", num: 1 }, { k: "deces_j0", t: "Décès du jour", num: 1 }, { k: "deces_cumul", t: "Décès cumul", num: 1 },
      { k: "dernier", t: "Dernier cas", v: r => X.dfr(r.dernier, false) }, { k: "jours_sans_cas", t: "Jours sans cas", num: 1, v: r => r.jours_sans_cas === null ? "—" : X.pill(nf(r.jours_sans_cas), r.jours_sans_cas <= 7 ? "bad" : r.jours_sans_cas <= 21 ? "warn" : "ok") },
      { k: "alertes_j0", t: "Alertes du jour", num: 1 }, { k: "alertes_7j", t: "Alertes 7 j", num: 1 }, { k: "a_suivre", t: "Contacts à suivre", num: 1 }, { k: "vus", t: "Contacts vus", num: 1 },
      { k: "taux_suivi", t: "Taux de suivi", num: 1, v: r => r.taux_suivi === null || r.taux_suivi === undefined ? "—" : X.pill(pc(r.taux_suivi, 0), r.taux_suivi >= 90 ? "ok" : r.taux_suivi >= 75 ? "warn" : "bad") }];
    const cas = toObj(j.cas);
    const colsC = [{ k: "date", t: "Date", v: r => X.dfr(r.date, false) }, { k: "unite_nom", t: u }, { k: "id", t: "Identifiant" }, { k: "ini", t: "Initiales" }, { k: "classe", t: "Classe" }, { k: "sexe", t: "Sexe" }, { k: "age", t: "Âge", num: 1 },
      { k: "debut", t: "Début des signes", v: r => X.dfr(r.debut, false) }, { k: "deces", t: "Décès", v: r => r.deces ? X.pill("Décédé", "bad") : "—" }, { k: "issue", t: "Issue" }, { k: "connu", t: "Contact connu", v: r => tri(X, r.connu) }, { k: "ppl", t: "Personnel de santé", v: r => esc(r.ppl || "—") }];
    const fixe = X.dateChoisie && X.dateChoisie !== j.date ? X.notice(`La situation du jour est calculée au dernier jour des exports (${X.dfr(j.date)}) ; choisissez la date de fin de période égale à cette date pour la comparer aux autres pages.`, "") : "";
    return `${fixe}<p class="lead">Situation du <b>${X.dfr(j.date)}</b> (cas de la journée, comme la « situation du jour » de l'outil national) : <b>${nf(s.j0)}</b> nouveau(x) cas confirmé(s) dans ${nf(s.unites_j0)} ${up(s.unites_j0)}, ${nf(s.deces_j0)} décès ; ${nf(s.j7)} cas en 7 jours (${trend}) ; ${nf(s.j21)} en 21 jours dans ${nf(s.unites_21j)} ${up(s.unites_21j)}.</p>
      <div class="grid g5">
        ${X.kpi("Cas confirmés du jour", nf(s.j0), `veille ${nf(s.j1)} · avant-veille ${nf(s.j2)}`, { color: "--critical", cls: s.j0 ? "alert" : "good" })}
        ${X.kpi("Cas en 7 jours", nf(s.j7), trend, { color: "--s2" })}
        ${X.kpi("Cas en 21 jours", nf(s.j21), `${nf(s.unites_21j)} ${up(s.unites_21j)} · cumul ${nf(s.cumul)}`, { color: "--s1" })}
        ${X.kpi("Décès du jour", nf(s.deces_j0), `${nf(s.deces_7j)} en 7 jours · ${nf(s.deces_cumul)} au total`, { color: "--ink" })}
        ${X.kpi("Jours sans cas confirmé", s.jours_sans_cas === null ? "—" : nf(s.jours_sans_cas), `dernier cas le ${X.dfr(s.dernier)}`, { color: "--st-done", cls: s.jours_sans_cas !== null && s.jours_sans_cas >= 21 ? "good" : "" })}
      </div>
      <div class="grid g5">
        ${X.kpi("Alertes notifiées le jour J", s.alertes_j0 === null || s.alertes_j0 === undefined ? "—" : nf(s.alertes_j0), `dont ${nf(s.alertes_deces_j0 ?? 0)} décès · ${nf(s.alertes_7j ?? 0)} en 7 jours`, { color: "--s4" })}
        ${X.kpi("Suspects notifiés le jour J", s.suspects_j0 === undefined ? "—" : nf(s.suspects_j0), `${nf(s.notif_j0 ?? 0)} notifications · ${nf(s.preleves_j0 ?? 0)} prélevés`, { color: "--st-susp" })}
        ${X.kpi("Contacts à suivre" + (s.suivi_date && s.suivi_date !== j.date ? ` (au ${X.dfr(s.suivi_date, false)})` : " le jour J"), sv ? nf(sv.a_suivre) : "—", sv ? `${nf(sv.vus)} vus · ${nf(sv.nouveaux)} nouveaux contacts${s.suivi_date && s.suivi_date !== j.date ? " · dernier jour saisi" : ""}` : "pas de suivi saisi pour ce jour", { color: "--s1" })}
        ${X.kpi("Taux de suivi du jour", sv ? pc(sv.taux, 0) : "—", "contacts vus / contacts à suivre · cible 90 %", { color: "--st-v24", meter: sv ? sv.taux : undefined, meterColor: sv && sv.taux < 90 ? "--critical" : "--good" })}
        ${X.kpi("Nouveaux cas connus comme contacts", pc(s.pct_connus_contacts_14j, 0), `${nf(s.connus_contacts_14j ?? 0)} des ${nf(s.nouveaux_14j)} cas des 14 derniers jours · cible 80 %`, { color: "--s3", meter: s.pct_connus_contacts_14j })}
      </div>
      <div class="grid g2">
        ${X.panel("Cas confirmés et décès par jour", `${nf(j.serie.length)} derniers jours`, `<div id="${ids.s}"></div>`, { png: "cas_par_jour" })}
        ${X.panel("Alertes et suivi des contacts par jour", "Alertes notifiées, contacts à suivre et contacts vus", `<div id="${ids.a}"></div>`, { png: "alertes_suivi_par_jour" })}
      </div>
      ${X.panel(`Situation du jour par ${u.toLowerCase()}`, `Cas confirmés par date de confirmation (ou de prélèvement / notification) ; ${up(2)} ayant eu au moins un cas ou un suivi`, X.table("nat-jour-unites", j.unites, cols, { sort: "j0", maxh: 520, total: { nom: "Total", j0: s.j0, j1: s.j1, j2: s.j2, j7: s.j7, j7p: s.j7p, j21: s.j21, cumul: s.cumul, deces_j0: s.deces_j0, deces_cumul: s.deces_cumul, alertes_j0: s.alertes_j0, alertes_7j: s.alertes_7j, a_suivre: sv ? sv.a_suivre : null, vus: sv ? sv.vus : null, taux_suivi: sv ? sv.taux : null } }), { csv: "nat-jour-unites" })}
      ${X.panel(`Cas confirmés des 3 derniers jours : ${nf(cas.length)}`, "Liste pseudonymisée (identifiant, initiales)", X.table("nat-jour-cas", cas, colsC, { sort: "date", maxh: 420 }), { csv: "nat-jour-cas" })}`;
  }

  function pec(p, X) {
    if (!p || !p.confirmes) return "";
    const c = p.confirmes, n = p.non_cas, nf = X.nf, pc = X.pc, esc = X.esc;
    const ids = { s: "nat-pec-serie", st: "nat-pec-statuts" };
    X.after(() => {
      const el = document.getElementById(ids.s);
      if (el) X.G.bars(el, { labels: p.serie.map(x => x.date), series: [{ label: "Admissions (confirmés)", color: X.col("--s1"), values: p.serie.map(x => x.admis) }, { label: "Sorties", color: X.col("--st-done"), values: p.serie.map(x => x.sortis) }, { label: "Décès", color: X.col("--ink"), values: p.serie.map(x => x.deces) }], fmtX: (d, l) => l ? X.dfr(d) : X.dshort(d) });
      const es = document.getElementById(ids.st);
      if (es) X.G.hbars(es, { items: c.statuts.map(s => ({ label: s.statut, value: s.n, color: X.col(s.statut === "Décédé" ? "--critical" : s.statut === "Guéri" ? "--good" : s.statut.startsWith("En cours") ? "--s1" : "--s4"), sub: pc(100 * s.n / Math.max(1, c.admis), 0) })) });
    });
    const colsS = [{ k: "cte", t: "Structure (unité d'organisation DHIS2)" }, { k: "admis", t: "Admis", num: 1 }, { k: "admis_7j", t: "Admis 7 j", num: 1 }, { k: "en_cours", t: "En cours", num: 1 }, { k: "sortis", t: "Sortis", num: 1 }, { k: "gueris", t: "Guéris", num: 1 }, { k: "deces", t: "Décès", num: 1 },
      { k: "letalite_cte", t: "Létalité en CTE", num: 1, v: r => pc(r.letalite_cte, 0) }, { k: "sejour_median", t: "Séjour médian (j)", num: 1 }];
    const colsU = [{ k: "cle", t: "Unité", v: r => esc(X.unite ? X.unite(r.cle) : (r.cle || "Non renseignée")) }, { k: "admis", t: "Admis", num: 1 }, { k: "admis_7j", t: "Admis 7 j", num: 1 }, { k: "en_cours", t: "En cours", num: 1 }, { k: "sortis", t: "Sortis", num: 1 }, { k: "gueris", t: "Guéris", num: 1 }, { k: "deces", t: "Décès", num: 1 },
      { k: "letalite_cte", t: "Létalité en CTE", num: 1, v: r => pc(r.letalite_cte, 0) }];
    return `<p class="lead">Prise en charge (export DHIS2 « Prise en charge », rapproché des notifications par numéro EPID) au <b>${X.dfr(p.date)}</b> : <b>${nf(c.admis)}</b> cas confirmés admis, ${nf(c.en_cours)} en cours de prise en charge, ${nf(c.gueris)} guéris et ${nf(c.deces)} décédés (létalité en structure ${pc(c.letalite_cte, 0)}) ; ${nf(n.admis)} non-cas admis.</p>
      <div class="grid g5">
        ${X.kpi("Confirmés admis", nf(c.admis), `${nf(c.admis_7j)} admissions en 7 jours · ${nf(c.admis_j0)} le jour J`, { color: "--s1" })}
        ${X.kpi("En cours de prise en charge", nf(c.en_cours), "admis sans date ni statut de sortie (60 derniers jours)", { color: "--s4" })}
        ${X.kpi("Guéris", nf(c.gueris), `${nf(c.sortis)} sorties · ${nf(c.sortis_7j)} en 7 jours`, { color: "--good" })}
        ${X.kpi("Décès en structure", nf(c.deces), `létalité ${pc(c.letalite_cte, 0)} (décès / décès + guéris) · ${nf(c.evades)} évadés · ${nf(c.transferes)} transférés`, { color: "--critical" })}
        ${X.kpi("Délai notification → admission", c.delai_adm_median === null ? "—" : nf(c.delai_adm_median, 1) + " j", `médiane · ${pc(c.delai_adm_pct_24h, 0)} admis en ≤ 24 h · séjour médian ${nf(c.sejour_median, 0)} j`, { color: "--s3" })}
      </div>
      <div class="grid g2">
        ${X.panel("Admissions, sorties et décès par jour (confirmés)", `${nf(p.serie.length)} derniers jours`, `<div id="${ids.s}"></div>`, { png: "pec_par_jour" })}
        ${X.panel("Statut à la sortie (confirmés)", "GR = guéri, DCD = décédé, EVD = évadé, TRF = transféré", `<div id="${ids.st}"></div>`, { png: "pec_statuts" })}
      </div>
      <div class="grid g2">
        ${X.panel("Par structure de prise en charge", "Dernier niveau de l'unité d'organisation DHIS2 de l'export « prise en charge »", X.table("nat-pec-cte", p.structures, colsS, { sort: "admis", maxh: 400 }), { csv: "nat-pec-cte" })}
        ${X.panel("Par zone ou aire de santé", "Cas confirmés admis", X.table("nat-pec-unite", p.par_unite, colsU, { sort: "admis", maxh: 400 }), { csv: "nat-pec-unite" })}
      </div>`;
  }

  window.NKNat = { contacts, jour, pec, toObj };
})();
