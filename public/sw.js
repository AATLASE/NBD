// Service worker (SPEC, phase 8) : rend l'application consultable sans réseau.
//
//   Pages               réseau d'abord ; sans réseau, la dernière version gardée sur le téléphone.
//   Fichiers de l'appli  (/_next/static, icônes) gardés une fois pour toutes : leur nom change à chaque version.
//   Tout le reste        (données, écritures, connexion, assistant) passe par le réseau, sans cache ici.
//
// Les données elles-mêmes ne sont pas gardées ici mais par l'application (lib/persistance.ts),
// et les saisies faites sans réseau attendent dans sa file (lib/file-attente.ts).

const VERSION = new URL(self.location.href).searchParams.get("v") || "0"
const PAGES = `nbd-pages-${VERSION}`
const FICHIERS = `nbd-fichiers-${VERSION}`
// Au-delà, un réseau très lent est traité comme une absence de réseau si la page est déjà gardée.
const PATIENCE_MS = 4000
// Jamais gardées : elles dépendent de la session ou n'ont de sens qu'en ligne.
const SANS_CACHE = /^\/(api|auth|login|bienvenue)(\/|$)/

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    (async () => {
      // Une nouvelle version de l'application repart d'un cache neuf.
      for (const nom of await caches.keys()) {
        if (nom.startsWith("nbd-") && nom !== PAGES && nom !== FICHIERS) await caches.delete(nom)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request
  if (requete.method !== "GET") return
  const url = new URL(requete.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    evenement.respondWith(fichier(requete))
    return
  }
  if (requete.mode === "navigate" && !SANS_CACHE.test(url.pathname)) {
    evenement.respondWith(page(evenement, url))
  }
})

self.addEventListener("message", (evenement) => {
  if (evenement.data?.type === "PRECHARGER" && Array.isArray(evenement.data.urls)) {
    evenement.waitUntil(precharger(evenement.data.urls))
  }
})

async function fichier(requete) {
  const cache = await caches.open(FICHIERS)
  const garde = await cache.match(requete, { ignoreVary: true })
  if (garde) return garde
  const reponse = await fetch(requete)
  if (reponse.ok) cache.put(requete, reponse.clone())
  return reponse
}

async function page(evenement, url) {
  const cache = await caches.open(PAGES)
  const gardee = await cache.match(url.pathname, { ignoreVary: true })
  const reseau = fetch(evenement.request).then((reponse) => {
    const garde = garder(cache, url.pathname, reponse.clone()).catch(() => undefined)
    try {
      evenement.waitUntil(garde)
    } catch {
      // La page gardée a déjà été servie : la mise à jour se termine quand même en arrière-plan.
    }
    return reponse
  })

  try {
    if (!gardee) return await reseau
    // Une page gardée existe : on ne fait pas attendre l'utilisateur sur un réseau qui traîne.
    reseau.catch(() => undefined)
    return await Promise.race([reseau, new Promise((_, rejet) => setTimeout(() => rejet(new Error("lent")), PATIENCE_MS))])
  } catch {
    if (gardee) return gardee
    // « / » ne fait que rediriger vers l'accueil de l'application.
    if (url.pathname === "/") return Response.redirect("/sport", 302)
    return pageIndisponible()
  }
}

// Garde une page et les fichiers qu'elle référence, pour qu'elle s'ouvre ensuite sans réseau.
// Une redirection (vers la connexion, par exemple) n'est jamais gardée à la place de la page.
async function garder(cache, chemin, reponse) {
  if (!reponse.ok || reponse.redirected || reponse.type !== "basic") return
  const html = await reponse.clone().text()
  await cache.put(chemin, reponse)

  // Dans le HTML de Next.js, les fichiers apparaissent avec ou sans le préfixe /_next/.
  const chemins = new Set()
  for (const trouve of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9._~%@\[\]\/-]+/g)) {
    chemins.add(trouve[0].startsWith("/_next/") ? trouve[0] : `/_next/${trouve[0]}`)
  }
  const fichiers = await caches.open(FICHIERS)
  await Promise.all(
    [...chemins].map(async (fichierAGarder) => {
      if (await fichiers.match(fichierAGarder, { ignoreVary: true })) return
      try {
        const recu = await fetch(fichierAGarder)
        if (recu.ok) await fichiers.put(fichierAGarder, recu)
      } catch {
        // Fichier absent ou réseau coupé : il sera gardé à la prochaine visite en ligne.
      }
    })
  )
}

// L'application envoie la liste de ses écrans (séances, recettes…) dès qu'elle est en ligne.
async function precharger(urls) {
  const cache = await caches.open(PAGES)
  for (const chemin of urls) {
    if (typeof chemin !== "string" || !chemin.startsWith("/") || SANS_CACHE.test(chemin)) continue
    if (await cache.match(chemin, { ignoreVary: true })) continue
    try {
      await garder(cache, chemin, await fetch(chemin, { credentials: "same-origin" }))
    } catch {
      // Réseau coupé en cours de route : le reste sera fait à la prochaine occasion.
      return
    }
  }
}

function pageIndisponible() {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Hors ligne</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafafa; color: #171717; }
  main { max-width: 22rem; text-align: center; }
  h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 8px; }
  p { margin: 0 0 24px; color: #525252; }
  a { display: flex; align-items: center; justify-content: center; height: 48px; border-radius: 10px;
    background: #ff6900; color: #1c1917; font-weight: 600; text-decoration: none; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #fafafa; } p { color: #a3a3a3; } }
</style>
</head>
<body>
<main>
<h1>Pas de réseau</h1>
<p>Cet écran n'a pas encore été gardé sur ce téléphone. Il s'ouvrira dès que le réseau reviendra.</p>
<a href="/sport">Revenir à l'accueil</a>
</main>
</body>
</html>`
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })
}
