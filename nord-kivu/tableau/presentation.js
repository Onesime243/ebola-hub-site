/* Ebola Outbreak — page « Présentation » : graphiques et diapositives prêts pour les réunions (province et zones de santé)
   Les fichiers sont produits à chaque analyse par scripts/presentation.py (sortie/…/presentation/). Noms fixes : une image
   absente (données non disponibles) est simplement masquée. */
(function () {
  "use strict";
  const PRES = [
    ["1. Surveillance — situation cumulée", [["01_indicateurs_cumul", "Indicateurs cumulés"], ["02_courbe_hebdomadaire", "Évolution hebdomadaire : vivants, décès et létalité"]]],
    ["1. Surveillance — situation du jour", [["03_indicateurs_jour", "Indicateurs du jour"], ["04_cas_du_jour", "Répartition des nouveaux cas"]]],
    ["1. Surveillance — jours sans nouveau cas", [["05_jours_sans_cas", "Jours sans nouveau cas confirmé"]]],
    ["1. Surveillance — carte", [["06_carte", "Carte de catégorisation"]]],
    ["2. Alertes", [["07_indicateurs_alertes", "Indicateurs des alertes"], ["07b_alertes_comparatif_3j", "Tableau comparatif sur 3 jours"], ["08_alertes_sources", "Sources des alertes du jour (nombre et %)"],
      ["08b_alertes_sources_3j", "Sources des alertes sur 3 jours"], ["09_alertes_unites", "Alertes et validées"], ["09b_alertes_sources_zs", "Sources des alertes du jour par zone de santé"]]],
    ["3. Suivi des contacts", [["10_indicateurs_contacts", "Indicateurs du suivi"], ["11_contacts_non_vus", "Raisons de non-suivi"], ["12_contacts_tendance", "Taux de suivi sur 21 jours"],
      ["12_contacts_taux", "Taux de suivi par zone de santé"], ["13_contacts_suivre_vus", "Contacts à suivre et vus par zone"], ["14_tableau_contacts", "Tableau détaillé par zone de santé"]]],
    ["5. Laboratoire", [["15_indicateurs_labo", "Indicateurs du laboratoire"], ["16_labo_resultats", "Résultats positifs et négatifs"], ["17_labo_positivite", "Positivité hebdomadaire"]]],
    ["9. Enterrements dignes et sécurisés", [["18_eds", "Alertes de décès, EDS et swabs"]]]
  ];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* base : dossier « …/presentation/ » ; pptx : nom du fichier PowerPoint ; titre : « Province du Nord-Kivu » ou « Zone de santé de Beni » */
  function html(base, pptx, titre, dateTxt) {
    const v = Date.now();
    return `<section class="panel pres-head"><div class="pres-dl">
        <div><h2>Présentation PowerPoint — ${esc(titre)}</h2>
          <p>Diapositives au format des présentations de la DPS, ${esc(dateTxt)} : indicateurs, courbes et tableaux, avec des graphiques <b>modifiables</b> dans PowerPoint (clic droit sur un graphique › Modifier les données). Seuls les piliers dont l'outil reçoit les données sont produits.</p></div>
        <a class="btn primary pres-btn" href="${base}${encodeURIComponent(pptx)}" download="${esc(pptx)}">⤓ Télécharger le PowerPoint</a></div>
        <p class="note">Chaque graphique ci-dessous se télécharge aussi en image (PNG haute définition) pour être collé dans une diapositive existante. Tout est mis à jour à chaque analyse.</p></section>
      ${PRES.map(([sec, items], si) => `<section class="panel pres-sec" data-sec="${si}"><div class="panel-head"><div><h2>${esc(sec)}</h2></div></div>
        <div class="pres-grid">${items.map(([k, lab]) => `<figure class="pres-card${/indicateurs|tableau|carte|comparatif|sources_zs/.test(k) ? " wide" : ""}" data-k="${k}">
          <a href="${base}${k}.png" target="_blank" rel="noopener" title="Agrandir"><img loading="lazy" src="${base}${k}.png?v=${v}" alt="${esc(lab)}" data-pres></a>
          <figcaption><span>${esc(lab)}</span><a class="btn sm" href="${base}${k}.png" download="${esc((titre + " " + lab).replace(/[^\wÀ-ÿ -]+/g, "").replace(/\s+/g, "_"))}.png">⤓ PNG</a></figcaption></figure>`).join("")}</div></section>`).join("")}
      <p class="note pres-empty" hidden>Aucune présentation n'a encore été produite : lancez l'analyse (la présentation est produite à la fin de l'analyse provinciale).</p>`;
  }
  /* masque les images absentes, puis les sections vides */
  function wire(root) {
    const check = () => {
      root.querySelectorAll(".pres-sec").forEach(s => { s.hidden = !s.querySelector(".pres-card:not([hidden])"); });
      const any = root.querySelector(".pres-sec:not([hidden])");
      const e = root.querySelector(".pres-empty"); if (e) e.hidden = !!any;
      const h = root.querySelector(".pres-head"); if (h) h.hidden = !any;
    };
    root.querySelectorAll("img[data-pres]").forEach(img => {
      img.addEventListener("error", () => { img.closest(".pres-card").hidden = true; check(); });
      img.addEventListener("load", check);
    });
    setTimeout(check, 4000);
  }
  window.NKPres = { html, wire };
})();
