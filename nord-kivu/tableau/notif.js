/* Ebola Outbreak — tableau de bord d'une zone de santé : alertes et cas suspects
   Sources : liste linéaire des suspects et confirmés de la zone, export DHIS2 des alertes (une ligne par notification),
   base des alertes de la zone (agrégats journaliers par aire de santé). */
window.ZS_NOTIF = function (H) {
  "use strict";
  const { D, S, AN, nf, pc, esc, col, dfr, dshort, day, iso, inPer, perTxt, panel, kpi, table, $ } = H;
  const rowsToObj = blk => blk ? blk.rows.map(r => Object.fromEntries(blk.cols.map((c, i) => [c, r[i]]))) : [];
  const N = rowsToObj(D.notif).filter(r => !r.hors_zs);
  const AJ = rowsToObj(D.alertes_j);
  if (!N.length && !AJ.length) return {};
  N.forEach(r => { r._d = day(r.notif); });
  const ratio = (a, b) => b ? 100 * a / b : null;
  const med = a => { const s = a.filter(v => v !== null && v !== undefined && isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const dd = (a, b) => a && b ? Math.round(day(b) - day(a)) : null;
  const wk = n => n - ((new Date(n * 864e5).getUTCDay() + 6) % 7);
  const sum = (rows, k) => rows.reduce((s, r) => s + (+r[k] || 0), 0);
  const fx = { xLabel: (v, r, tip) => tip ? `Semaine du ${dfr(v)}` : dshort(v) };
  function hbars(items) {
    const a = items, m = Math.max(...a.map(x => x.v), 1);
    return `<div class="hbars">${a.map(x => `<div class="hbar" style="grid-template-columns:minmax(120px,240px) 1fr 110px"><span>${esc(x.t)}</span><div class="track"><i style="width:${Math.max(1, 100 * x.v / m)}%;background:${col(x.c || "--s1")}"></i></div><b>${x.txt !== undefined ? x.txt : nf(x.v)}</b></div>`).join("")}</div>`;
  }
  function view() {
    const L = N.filter(r => inPer(r.notif) && (!S.aire || r.aire === S.aire));
    const A = AJ.filter(r => inPer(r.date) && (!S.aire || r.aire === S.aire));
    const pre = L.filter(r => r.preleve), res = pre.filter(r => r.resultat === "Positif" || r.resultat === "Négatif"), pos = res.filter(r => r.resultat === "Positif");
    const att = N.filter(r => r.preleve && (!r.resultat || r.resultat === "En attente") && (!S.aire || r.aire === S.aire) && r.notif && r.notif <= S.date);
    const val = L.filter(r => r.validee === true).length, inval = L.filter(r => r.validee === false).length;
    const dprel = med(pre.map(r => dd(r.notif, r.prel)).filter(v => v !== null && v >= 0 && v <= 30));
    const ddeb = med(L.map(r => dd(r.debut, r.notif)).filter(v => v !== null && v >= 0 && v <= 60));
    const dres = med(pre.map(r => dd(r.prel, r.result)).filter(v => v !== null && v >= 0 && v <= 30));
    const dec = L.filter(r => r.nature === "Décès").length;
    const aj = { tot: sum(A, "total_v") + sum(A, "total_d"), inv: sum(A, "inv_v") + sum(A, "inv_d"), val: sum(A, "val_v") + sum(A, "val_d"), prel: sum(A, "prelev"), swab: sum(A, "swab"), eds: sum(A, "eds"), dec: sum(A, "total_d") };
    const useAJ = AJ.length && (!N.length || aj.tot > L.length);
    const ws = []; for (let w = wk(day(S.from)); w <= wk(day(S.date)); w += 7) ws.push(w);
    H.after(() => {
      if (N.length) Ch_xy("#c-n-wk", ws.map(w => { const x = N.filter(r => r._d !== null && r._d >= w && r._d < w + 7 && (!S.aire || r.aire === S.aire));
        return { week: iso(w), conf: x.filter(r => r.classe === "Confirmé" || r.classe === "Probable").length, nc: x.filter(r => r.classe === "Non cas").length, att: x.filter(r => r.preleve && (!r.resultat || r.resultat === "En attente")).length, np: x.filter(r => !r.preleve && r.classe !== "Non cas" && r.classe !== "Confirmé").length }; }),
        [{ key: "conf", label: "Confirmés", color: "--st-conf" }, { key: "nc", label: "Non cas (négatifs)", color: "--s3" }, { key: "att", label: "Résultat en attente", color: "--st-nv" }, { key: "np", label: "Non prélevés", color: "--st-inc" }]);
      if (AJ.length) Ch_xy("#c-aj-wk", ws.map(w => { const x = AJ.filter(r => r.date && day(r.date) >= w && day(r.date) < w + 7 && (!S.aire || r.aire === S.aire));
        return { week: iso(w), fosa: sum(x, "src_fosa"), ra: sum(x, "src_ra"), comm: sum(x, "src_comm"), poc: sum(x, "src_poc"), autre: Math.max(0, sum(x, "total_v") + sum(x, "total_d") - sum(x, "src_fosa") - sum(x, "src_ra") - sum(x, "src_comm") - sum(x, "src_poc")) }; }),
        [{ key: "fosa", label: "Formations sanitaires", color: "--s1" }, { key: "ra", label: "Recherche active", color: "--s7" }, { key: "comm", label: "Communauté", color: "--s3" }, { key: "poc", label: "Points de contrôle", color: "--s4" }, { key: "autre", label: "Source non précisée", color: "--st-inc" }]);
    });
    function Ch_xy(sel, data, series) { const el = $(sel); if (el) H.Ch.xy(el, { data, x: "week", stacked: true, height: 250, ...fx, series }); }
    const aires = [...new Set([...L.map(r => r.aire), ...A.map(r => r.aire)].filter(Boolean))];
    const rows = aires.map(a => { const x = L.filter(r => r.aire === a), p = x.filter(r => r.preleve), rs = p.filter(r => r.resultat === "Positif" || r.resultat === "Négatif"), y = A.filter(r => r.aire === a);
      return { aire: AN[a] || a, n: x.length, pre: p.length, pos: rs.filter(r => r.resultat === "Positif").length, posr: ratio(rs.filter(r => r.resultat === "Positif").length, rs.length), att: p.filter(r => !r.resultat || r.resultat === "En attente").length,
        dp: med(p.map(r => dd(r.notif, r.prel)).filter(v => v !== null && v >= 0 && v <= 30)), al: sum(y, "total_v") + sum(y, "total_d"), inv: ratio(sum(y, "inv_v") + sum(y, "inv_d"), sum(y, "total_v") + sum(y, "total_d")), alv: sum(y, "val_v") + sum(y, "val_d") }; });
    const attRows = att.map(r => ({ id: r.id || "—", ini: r.ini || "", aire: AN[r.aire] || r.aire || "—", notif: r.notif, prel: r.prel, j: dd(r.prel || r.notif, S.date) })).sort((a, b) => (b.j ?? 0) - (a.j ?? 0));
    const src = N.length ? [...new Set(N.map(r => r.source).filter(Boolean))].join(", ") : "";
    return `<div class="notice"><b>Alertes et cas suspects</b> — ${N.length ? `liste individuelle des notifications de la zone (${esc(src)})` : ""}${N.length && AJ.length ? " et " : ""}${AJ.length ? "base des alertes (agrégats journaliers par aire de santé)" : ""}. ${perTxt()}${S.aire ? " · " + esc(AN[S.aire] || S.aire) : ""}.</div>
      <div class="grid g5">
        ${kpi(useAJ ? "Alertes notifiées (base des alertes)" : "Alertes et suspects notifiés", nf(useAJ ? aj.tot : L.length), useAJ ? `${nf(aj.dec)} décès · ${pc(ratio(aj.inv, aj.tot), 0)} investiguées` : `${nf(dec)} décès${val + inval ? ` · ${nf(val)} validées / ${nf(inval)} invalidées` : ""}`, { color: "--s1" })}
        ${kpi("Prélevés", nf(useAJ && !N.length ? aj.prel : pre.length), N.length ? `${pc(ratio(pre.length, L.length), 0)} des notifications · délai médian ${dprel !== null ? nf(dprel, 0) + " j" : "—"} après la notification` : `${nf(aj.swab)} écouvillons post-mortem`, { color: "--s3" })}
        ${kpi("Positivité", pc(ratio(pos.length, res.length), 1), `${nf(pos.length)} positifs / ${nf(res.length)} résultats`, { color: "--st-conf" })}
        ${kpi("Résultats en attente", nf(att.length), att.length ? `le plus ancien : ${nf(attRows[0].j)} jours` : "aucun prélèvement sans résultat", { color: "--st-nv", cls: attRows.some(r => r.j > 3) ? "alert" : "" })}
        ${kpi("Début des signes → notification", ddeb !== null ? nf(ddeb, 0) + " j" : "—", `médiane · résultat ${dres !== null ? nf(dres, 0) + " j" : "—"} après le prélèvement`, { color: "--s2", cls: ddeb !== null && ddeb > 3 ? "alert" : "" })}
      </div>
      <div class="grid g2">
        ${N.length ? panel("Notifications par semaine et par résultat", "Semaine de notification", `<div id="c-n-wk"></div>`, { png: "notifications_semaine" }) : ""}
        ${AJ.length ? panel("Alertes par semaine et par source", "Base des alertes de la zone", `<div id="c-aj-wk"></div>`, { png: "alertes_sources" }) : ""}
      </div>
      <div class="grid g2">
        ${panel("De la notification au résultat", perTxt(), hbars(N.length ? [{ t: "Notifications", v: L.length, c: "--s1" }, { t: "Prélevés", v: pre.length, c: "--s3", txt: `${nf(pre.length)} (${pc(ratio(pre.length, L.length), 0)})` }, { t: "Résultat rendu", v: res.length, c: "--brand-2", txt: `${nf(res.length)} (${pc(ratio(res.length, pre.length), 0)})` }, { t: "Positifs", v: pos.length, c: "--st-conf", txt: `${nf(pos.length)} (${pc(ratio(pos.length, res.length), 1)})` }]
          : [{ t: "Alertes notifiées", v: aj.tot, c: "--s1" }, { t: "Investiguées", v: aj.inv, c: "--brand-2", txt: `${nf(aj.inv)} (${pc(ratio(aj.inv, aj.tot), 0)})` }, { t: "Validées (suspects)", v: aj.val, c: "--st-susp", txt: `${nf(aj.val)} (${pc(ratio(aj.val, aj.tot), 0)})` }, { t: "Prélevées", v: aj.prel, c: "--s3" }]))}
        ${panel("Prélèvements sans résultat", "Suspects prélevés dont le résultat n'est pas encore saisi (toutes dates)", attRows.length ? table("n-att", attRows, [{ k: "id", t: "Notification" }, { k: "ini", t: "Init." }, { k: "aire", t: "Aire de santé" }, { k: "notif", t: "Notifié le", v: x => dfr(x.notif, false) }, { k: "prel", t: "Prélevé le", v: x => dfr(x.prel, false) }, { k: "j", t: "Jours d'attente", num: true }], { sort: "j", search: false, limit: 15 }) : `<div class="empty">Aucun prélèvement en attente de résultat.</div>`, { csv: attRows.length ? "n-att" : null })}
      </div>
      ${panel("Alertes et suspects par aire de santé", perTxt(), table("n-as", rows, [{ k: "aire", t: "Aire de santé" }, ...(N.length ? [{ k: "n", t: "Notifications", num: true }, { k: "pre", t: "Prélevés", num: true }, { k: "pos", t: "Positifs", num: true }, { k: "posr", t: "Positivité", num: true, v: x => pc(x.posr, 1) }, { k: "att", t: "En attente", num: true }, { k: "dp", t: "Notification → prélèvement (j)", num: true }] : []),
        ...(AJ.length ? [{ k: "al", t: "Alertes (base)", num: true }, { k: "inv", t: "% investiguées", num: true, v: x => pc(x.inv, 0) }, { k: "alv", t: "Validées", num: true }] : [])], { sort: N.length ? "n" : "al", search: false, limit: 60 }), { csv: "n-as" })}`;
  }
  return { notif: { view } };
};
