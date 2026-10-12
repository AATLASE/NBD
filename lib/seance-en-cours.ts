"use client"

import { useSyncExternalStore } from "react"

// La séance en cours vit sur le téléphone tant qu'elle n'est pas terminée.
// Un rechargement, un verrouillage d'écran ou une perte de réseau en salle ne font rien perdre :
// la base n'est écrite qu'une fois, à la fin, en une seule transaction.

export type SerieFaite = {
  charge: number | null
  reps: number | null
  duree: number | null
  rir: number | null
}

export type Repos = { fin: number; total: number }

export type EtatCircuit = {
  tour: number
  station: number
  phase: "effort" | "repos" | "entre_tours" | "fini"
  // Horodatage de fin de la phase, ou null si le circuit est en pause.
  fin: number | null
  // Millisecondes restantes au moment de la pause.
  restant: number | null
}

export type Brouillon = {
  // Identifiant du futur workout_log.
  id: string
  workoutId: string
  date: string
  debut: number
  // Séries validées, par workout_exercise_id. L'index + 1 est le numéro de série.
  series: Record<string, SerieFaite[]>
  repos: Repos | null
  // État des blocs circuit, par identifiant de leur premier exercice.
  circuits: Record<string, EtatCircuit>
}

const CLE = "nbd:seance-en-cours"
const abonnes = new Set<() => void>()
let cache: Brouillon | null | undefined

function charger(): Brouillon | null {
  try {
    const brut = window.localStorage.getItem(CLE)
    return brut ? (JSON.parse(brut) as Brouillon) : null
  } catch {
    return null
  }
}

function instantane() {
  if (cache === undefined) cache = charger()
  return cache
}

function abonner(rappel: () => void) {
  // Un autre onglet a modifié la séance : on relit.
  const surStockage = (evenement: StorageEvent) => {
    if (evenement.key === CLE) {
      cache = charger()
      rappel()
    }
  }
  abonnes.add(rappel)
  window.addEventListener("storage", surStockage)
  return () => {
    abonnes.delete(rappel)
    window.removeEventListener("storage", surStockage)
  }
}

export function ecrireBrouillon(brouillon: Brouillon | null) {
  cache = brouillon
  try {
    if (brouillon) window.localStorage.setItem(CLE, JSON.stringify(brouillon))
    else window.localStorage.removeItem(CLE)
  } catch {
    // Stockage indisponible (navigation privée) : la séance reste en mémoire le temps de l'onglet.
  }
  abonnes.forEach((rappel) => rappel())
}

export function modifierBrouillon(transformer: (brouillon: Brouillon) => Brouillon) {
  const actuel = instantane()
  if (actuel) ecrireBrouillon(transformer(actuel))
}

// crypto.randomUUID n'existe qu'en contexte sécurisé ; getRandomValues fonctionne partout,
// y compris quand le téléphone ouvre l'application par l'adresse IP du PC.
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const o = crypto.getRandomValues(new Uint8Array(16))
  o[6] = (o[6]! & 0x0f) | 0x40
  o[8] = (o[8]! & 0x3f) | 0x80
  const hex = [...o].map((octet) => octet.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function demarrerSeance(workoutId: string, date: string) {
  ecrireBrouillon({
    id: uuid(),
    workoutId,
    date,
    debut: Date.now(),
    series: {},
    repos: null,
    circuits: {},
  })
}

// `undefined` pendant le rendu serveur et l'hydratation, `null` s'il n'y a pas de séance en cours.
export function useBrouillon(): Brouillon | null | undefined {
  return useSyncExternalStore(abonner, instantane, () => undefined)
}

export function nombreDeSeries(brouillon: Brouillon) {
  return Object.values(brouillon.series).reduce((total, series) => total + series.length, 0)
}
