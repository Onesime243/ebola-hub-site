/* Ebola Outbreak Analytics Hub — version en ligne protégée par connexion
   Les données publiées sont chiffrées (AES-256-GCM). Après connexion (mêmes identifiant et mot de passe que l'outil installé),
   la clé du site est déchiffrée dans le navigateur avec le mot de passe et gardée pour cet onglet uniquement (sessionStorage).
   page « connexion » : formulaire ; page « hub » : déchiffrement des données puis chargement de l'application. */
(function () {
  "use strict";
  const me = document.currentScript, PAGE = me.dataset.page, SK = "hub-en-ligne";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
  const toHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  const open = async (buf, key) => { const b = new Uint8Array(buf); return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12)); };
  const session = () => { try { return JSON.parse(sessionStorage.getItem(SK)); } catch (e) { return null; } };
  const toLogin = msg => {
    try { sessionStorage.removeItem(SK); if (msg) sessionStorage.setItem(SK + "-msg", msg); } catch (e) { /* stockage indisponible */ }
    location.replace("connexion.html?suite=" + encodeURIComponent((location.pathname.split("/").pop() || "index.html") + location.search + location.hash));
  };
  if (!window.crypto || !crypto.subtle) { document.body.innerHTML = "<p style='padding:24px'>Ce navigateur ne permet pas d'ouvrir la version protégée : utilisez un navigateur récent (Chrome, Edge, Firefox, Safari).</p>"; return; }

  /* ------------------------------------------------------------ connexion */
  if (PAGE === "connexion") {
    const f = document.getElementById("f-login"), msg = document.getElementById("l-msg");
    f.hidden = false;
    const sub = document.getElementById("l-sub"); if (sub) sub.textContent = "Mêmes identifiant et mot de passe que dans l'outil installé.";
    try { const m = sessionStorage.getItem(SK + "-msg"); if (m) { msg.textContent = m; sessionStorage.removeItem(SK + "-msg"); } } catch (e) { /* rien */ }
    document.getElementById("l-id").focus();
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = f.querySelector("button[type=submit]"), id = document.getElementById("l-id").value.trim().toLowerCase(), pw = document.getElementById("l-mdp").value;
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Vérification…";
      try {
        const A = await (await fetch("acces.json", { cache: "no-store" })).json();
        const slot = A.comptes[toHex(await crypto.subtle.digest("SHA-256", enc.encode("hub-acces:" + id)))];
        if (!slot) throw new Error("x");
        const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
        const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: hex(slot.sel), iterations: slot.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        const s = JSON.parse(dec.decode(await open(hex(slot.env), kek)));
        sessionStorage.setItem(SK, JSON.stringify(s));
        const suite = new URLSearchParams(location.search).get("suite");
        location.replace(suite && /^index\.html/.test(suite) ? suite : "index.html");
      } catch (err) {
        msg.className = "msg err"; msg.textContent = "Identifiant ou mot de passe incorrect.";
        btn.disabled = false;
      }
    });
    return;
  }

  /* ------------------------------------------------------------ application */
  const S = session();
  if (!S) { toLogin(); return; }
  window.HUB_EN_LIGNE = true;
  window.HUB_USER = { identifiant: S.identifiant, nom: S.nom, role: S.role };
  window.HUB_DECONNEXION = () => { try { sessionStorage.removeItem(SK); } catch (e) { /* rien */ } location.href = "connexion.html"; };
  let KEY = null;
  const key = async () => KEY || (KEY = await crypto.subtle.importKey("raw", hex(S.cle), "AES-GCM", false, ["decrypt"]));
  const PROT = /\/(?:dashboard-data\.js|(?:periodes|cartes|rapports|assets|indicateurs|situation)\/.+|presentation\/.+\.(?:png|pptx))$/;
  const isProt = u => PROT.test(decodeURIComponent(new URL(u, location.href).pathname));
  async function fetchPlain(url) {
    const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error("Fichier introuvable (" + r.status + ")");
    let buf;
    try { buf = await open(await r.arrayBuffer(), await key()); } catch (e) { throw Object.assign(new Error("clé"), { cle: 1 }); }
    const b = new Uint8Array(buf);
    if (b[0] === 0x1f && b[1] === 0x8b) {   // données compressées (gzip) avant chiffrement
      if (!window.DecompressionStream) throw new Error("Ce navigateur est trop ancien pour ouvrir la version en ligne : mettez-le à jour.");
      return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
    return buf;
  }
  const parseData = buf => { const t = dec.decode(buf); return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); };
  const loadScripts = list => list.forEach(src => { const s = document.createElement("script"); s.src = src; s.async = false; document.body.appendChild(s); });

  /* fichiers téléchargeables et images (rapports, cartes, présentations) : déchiffrés à la demande */
  const MIME = { pdf: "application/pdf", png: "image/png", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", jpeg: "image/jpeg" };
  const BLOBS = {};
  function blobURL(url) {
    const abs = new URL(url, location.href); abs.search = "";
    const k = abs.href;
    if (!BLOBS[k]) BLOBS[k] = fetchPlain(k).then(b => URL.createObjectURL(new Blob([b], { type: MIME[k.split(".").pop().toLowerCase()] || "application/octet-stream" })));
    return BLOBS[k];
  }
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]"); if (!a || !isProt(a.getAttribute("href"))) return;
    e.preventDefault(); e.stopPropagation();
    const name = a.getAttribute("download") || decodeURIComponent(a.getAttribute("href").split("?")[0].split("/").pop());
    const w = a.hasAttribute("download") ? null : window.open("", "_blank");
    blobURL(a.getAttribute("href")).then(u => {
      if (w) { w.location = u; return; }
      const d = document.createElement("a"); d.href = u; d.download = name; document.body.appendChild(d); d.click(); d.remove();
    }).catch(() => { if (w) w.close(); alert("Fichier indisponible."); });
  }, true);
  const fixImg = img => { const s = img.getAttribute("src"); if (!s || img.dataset.enc || s.startsWith("blob:") || !isProt(s)) return; img.dataset.enc = s; img.removeAttribute("src"); blobURL(s).then(u => { img.src = u; }).catch(() => img.dispatchEvent(new Event("error"))); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === "IMG") fixImg(n); else if (n.querySelectorAll) n.querySelectorAll("img[src]").forEach(fixImg); })))
    .observe(document.documentElement, { childList: true, subtree: true });

  (async () => {
    try {
      const m = /[?&]p=(\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2})/.exec(location.search), st = window.HUB_STATIC;
      const per = m && st && (st.periodes || []).some(x => x.cle === m[1]) ? "periodes/" + m[1] + ".js" : null;
      window.DASHBOARD_DATA = parseData(await fetchPlain(per || "dashboard-data.js"));
      loadScripts(["i18n.js", "charts.js", "xlsx.js", "outil.js", "app.js"]);
    } catch (e) {
      if (e && e.cle) { toLogin("La version en ligne a été mise à jour : reconnectez-vous."); return; }
      const c = document.getElementById("content"); if (c) c.innerHTML = `<div class="empty">${(e && e.message) || "Chargement impossible."}</div>`;
    }
  })();
})();
