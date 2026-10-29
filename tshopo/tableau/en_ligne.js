/* Ebola Outbreak, version en ligne protégée par connexion
   Les données publiées sont chiffrées (AES-256-GCM). Après connexion (mêmes identifiant et mot de passe que l'outil local),
   les clés du compte sont déchiffrées dans le navigateur et gardées pour cet onglet uniquement (sessionStorage) :
   un compte de zone ne reçoit que la clé de sa zone ; le compte provincial reçoit toutes les clés.
   page « connexion » : formulaire ; pages « province » et « zs » : déchiffrement des données puis chargement de l'application. */
(function () {
  "use strict";
  const me = document.currentScript, PAGE = me.dataset.page, SK = "tsh-en-ligne";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
  const toHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  const KEYS = {};
  const aes = async raw => KEYS[raw] || (KEYS[raw] = await crypto.subtle.importKey("raw", hex(raw), "AES-GCM", false, ["decrypt"]));
  const open = async (buf, key) => { const b = new Uint8Array(buf); return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12)); };
  const session = () => { try { return JSON.parse(sessionStorage.getItem(SK)); } catch (e) { return null; } };
  const toLogin = msg => { try { sessionStorage.removeItem(SK); if (msg) sessionStorage.setItem(SK + "-msg", msg); } catch (e) {}
    location.replace("connexion.html?suite=" + encodeURIComponent((location.pathname.split("/").pop() || "index.html") + location.search + location.hash)); };
  if (!window.crypto || !crypto.subtle) { document.body.innerHTML = "<p style='padding:24px'>Ce navigateur ne permet pas d'ouvrir la version protégée : utilisez un navigateur récent (Chrome, Edge, Firefox, Safari).</p>"; return; }

  /* ------------------------------------------------------------ connexion */
  if (PAGE === "connexion") {
    const f = document.getElementById("f-login"), msg = document.getElementById("l-msg");
    f.hidden = false;
    try { const m = sessionStorage.getItem(SK + "-msg"); if (m) { msg.textContent = m; sessionStorage.removeItem(SK + "-msg"); } } catch (e) {}
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = f.querySelector("button[type=submit]"), id = document.getElementById("l-id").value.trim().toLowerCase(), pw = document.getElementById("l-mdp").value;
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Vérification…";
      try {
        const A = await (await fetch("donnees/acces.json", { cache: "no-store" })).json();
        const slot = A.comptes[toHex(await crypto.subtle.digest("SHA-256", enc.encode("nk-acces:" + id)))];
        if (!slot) throw new Error("x");
        const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
        const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: hex(slot.sel), iterations: slot.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        const s = JSON.parse(dec.decode(await open(hex(slot.env), kek)));
        sessionStorage.setItem(SK, JSON.stringify(s));
        const suite = new URLSearchParams(location.search).get("suite");
        location.replace(suite && /^(index|zs)\.html/.test(suite) ? suite : s.role === "province" ? "index.html" : "zs.html?zone=" + encodeURIComponent(s.code));
      } catch (err) {
        msg.className = "msg err"; msg.textContent = "Identifiant ou mot de passe incorrect.";
        btn.disabled = false;
      }
    });
    return;
  }

  /* ------------------------------------------------------------ pages protégées */
  const S = session();
  if (!S) { toLogin(); return; }
  window.NK_EN_LIGNE = { identifiant: S.identifiant, nom: S.nom, role: S.role, zone: S.zone, code: S.code };
  const zoneByName = n => (S.cles.zones || {})[n];
  const zoneByCode = c => Object.entries(S.cles.zones || {}).find(([, v]) => v.code === c);
  /* clé d'un fichier publié d'après son chemin */
  function keyFor(url) {
    const p = decodeURIComponent(new URL(url, location.href).pathname);
    let m;
    if (/\/tableau\/donnees\/province\.js$/.test(p)) return S.cles.province;
    if ((m = p.match(/\/tableau\/donnees\/zs\/([^/]+)\.js$/))) { const z = zoneByCode(m[1]); return z && z[1].k; }
    if (/\/sortie\/province\//.test(p)) return S.cles.province;
    if ((m = p.match(/\/sortie\/zs\/([^/]+)\//))) { const z = zoneByName(m[1]); return z && z.k; }
    return null;
  }
  async function fetchPlain(url) {
    const k = keyFor(url); if (!k) throw Object.assign(new Error("Accès non autorisé pour ce compte."), { refus: 1 });
    const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error("Fichier introuvable (" + r.status + ")");
    let buf;
    try { buf = await open(await r.arrayBuffer(), await aes(k)); } catch (e) { throw Object.assign(new Error("clé"), { cle: 1 }); }
    const b = new Uint8Array(buf);
    if (b[0] === 0x1f && b[1] === 0x8b) {   // données compressées (gzip) avant chiffrement
      if (!window.DecompressionStream) throw new Error("Ce navigateur est trop ancien pour ouvrir la version en ligne : mettez-le à jour (Chrome, Edge, Firefox ou Safari récents).");
      return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
    return buf;
  }
  const parseData = buf => { const t = dec.decode(buf); return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); };
  const loadScripts = list => list.forEach(src => { const s = document.createElement("script"); s.src = src; s.async = false; document.body.appendChild(s); });
  const fail = e => e && e.cle ? toLogin("La version en ligne a été mise à jour : reconnectez-vous.") : (document.getElementById("main").innerHTML = `<div class="empty">${(e && e.message) || "Chargement impossible."}</div>`);

  /* fichiers téléchargeables et cartes (rapports PDF, classeurs, PNG) : déchiffrés à la demande */
  const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", png: "image/png", csv: "text/csv" };
  const BLOBS = {};
  async function blobURL(url) {
    const abs = new URL(url, location.href).href;
    if (!BLOBS[abs]) BLOBS[abs] = fetchPlain(abs).then(b => URL.createObjectURL(new Blob([b], { type: MIME[abs.split(".").pop().toLowerCase()] || "application/octet-stream" })));
    return BLOBS[abs];
  }
  const isOut = u => /\/sortie\//.test(new URL(u, location.href).pathname);
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]"); if (!a || !isOut(a.getAttribute("href"))) return;
    e.preventDefault(); e.stopPropagation();
    const name = a.getAttribute("download") || decodeURIComponent(a.getAttribute("href").split("/").pop());
    const w = a.hasAttribute("download") ? null : window.open("", "_blank");
    blobURL(a.getAttribute("href")).then(u => {
      if (w) { w.location = u; return; }
      const d = document.createElement("a"); d.href = u; d.download = name; document.body.appendChild(d); d.click(); d.remove();
    }).catch(err => { if (w) w.close(); alert(err.refus ? "Ce fichier n'est pas accessible avec votre compte." : "Fichier indisponible."); });
  }, true);
  const fixImg = img => { const s = img.getAttribute("src"); if (!s || img.dataset.enc || !isOut(s)) return; img.dataset.enc = s; img.removeAttribute("src"); blobURL(s).then(u => { img.src = u; }).catch(() => img.dispatchEvent(new Event("error"))); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === "IMG") fixImg(n); else n.querySelectorAll && n.querySelectorAll("img[src]").forEach(fixImg); })))
    .observe(document.body, { childList: true, subtree: true });

  /* bouton de déconnexion (aussi dans le menu de l'utilisateur) */
  window.NK_DECONNEXION = () => { try { sessionStorage.removeItem(SK); } catch (e) {} location.href = "connexion.html"; };

  (async () => {
    try {
      if (PAGE === "province") {
        if (S.role !== "province") { location.replace("zs.html?zone=" + encodeURIComponent(S.code)); return; }
        window.NK_PROVINCE = parseData(await fetchPlain("donnees/province.js"));
        loadScripts(["charts.js", "graph.js", "province.js"]);
      } else {
        const code = (new URLSearchParams(location.search).get("zone") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (!zoneByCode(code)) {
          if (S.role !== "province") { location.replace("zs.html?zone=" + encodeURIComponent(S.code)); return; }
          throw new Error("Aucune analyse publiée pour cette zone de santé.");
        }
        const jobs = [fetchPlain("donnees/zs/" + code + ".js").then(parseData)];
        if (S.cles.province) jobs.push(fetchPlain("donnees/province.js").then(parseData).catch(() => null));
        const [d, p] = await Promise.all(jobs);
        window.ZS_DATA = d; window.NK_PROVINCE = p || null;
        loadScripts(["charts.js", "graph.js", "transmission.js", "riposte.js", "notif.js", "app.js"]);
      }
    } catch (e) { fail(e); }
  })();
})();
