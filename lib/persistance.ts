"use client"

import { dehydrate, hydrate, type DehydratedState, type QueryClient } from "@tanstack/react-query"

// Cache hors ligne en lecture (SPEC, phase 8). Tout ce que l'application a lu est gardé sur le
// téléphone et réaffiché au prochain lancement, avec ou sans réseau. Avec le réseau, les données
// fraîches remplacent aussitôt celles-ci.

const CLE = "nbd:donnees"
const FORMAT = 1
const AGE_MAX_MS = 30 * 24 * 3600 * 1000
const DELAI_ECRITURE_MS = 1000

type Sauvegarde = { format: number; date: number; etat: DehydratedState }

export function restaurer(client: QueryClient) {
  try {
    const brut = window.localStorage.getItem(CLE)
    if (!brut) return
    const sauvegarde = JSON.parse(brut) as Sauvegarde
    if (sauvegarde.format !== FORMAT || Date.now() - sauvegarde.date > AGE_MAX_MS) {
      window.localStorage.removeItem(CLE)
      return
    }
    hydrate(client, sauvegarde.etat)
  } catch {
    // Sauvegarde illisible : on repart du réseau.
  }
}

function sauvegarder(client: QueryClient) {
  try {
    const etat = dehydrate(client, { shouldDehydrateQuery: (requete) => requete.state.status === "success" })
    const sauvegarde: Sauvegarde = { format: FORMAT, date: Date.now(), etat }
    window.localStorage.setItem(CLE, JSON.stringify(sauvegarde))
  } catch {
    // Stockage plein ou indisponible : l'application marche, sans mémoire hors ligne.
  }
}

// Réécrit la sauvegarde après chaque changement du cache, au plus une fois par seconde,
// et une dernière fois quand l'application passe en arrière-plan.
export function suivre(client: QueryClient) {
  let minuteur: ReturnType<typeof setTimeout> | null = null
  const ecrire = () => {
    if (minuteur) clearTimeout(minuteur)
    minuteur = null
    sauvegarder(client)
  }
  const arret = client.getQueryCache().subscribe(() => {
    if (!minuteur) minuteur = setTimeout(ecrire, DELAI_ECRITURE_MS)
  })
  const enArrierePlan = () => {
    if (document.visibilityState === "hidden") ecrire()
  }
  document.addEventListener("visibilitychange", enArrierePlan)
  window.addEventListener("pagehide", ecrire)
  return () => {
    arret()
    if (minuteur) clearTimeout(minuteur)
    document.removeEventListener("visibilitychange", enArrierePlan)
    window.removeEventListener("pagehide", ecrire)
  }
}

// À la déconnexion : rien du compte ne reste sur le téléphone.
export function effacerDonneesLocales(client?: QueryClient) {
  client?.clear()
  try {
    window.localStorage.removeItem(CLE)
  } catch {
    // Rien à effacer.
  }
}
