// Calculs de suivi pour les graphiques et l'alerte de perte de poids (SPEC section 6). Fonctions pures.

import { decalerJours, depuisIso, versIso } from "@/lib/format"

const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })

export function jourCourt(iso: string) {
  return JOUR_COURT.format(depuisIso(iso))
}

// Lundi de la semaine qui contient la date.
export function lundiDe(iso: string) {
  const date = depuisIso(iso)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return versIso(date)
}

// Compte des éléments par semaine, sur les `semaines` dernières semaines, semaines vides comprises.
export function parSemaine(dates: string[], aujourdhui: string, semaines: number) {
  const dernier = lundiDe(aujourdhui)
  const compte = new Map<string, number>()
  for (const date of dates) {
    const lundi = lundiDe(date)
    compte.set(lundi, (compte.get(lundi) ?? 0) + 1)
  }
  return Array.from({ length: semaines }, (_, index) => {
    const lundi = decalerJours(dernier, -7 * (semaines - 1 - index))
    return { lundi, libelle: jourCourt(lundi), valeur: compte.get(lundi) ?? 0 }
  })
}

type Pesee = { date: string; poids_kg: number | null }

// Moyenne des pesées des 7 jours qui se terminent à `date`. null s'il n'y en a aucune.
export function moyenne7Jours(pesees: Pesee[], date: string) {
  const debut = decalerJours(date, -6)
  const valeurs = pesees
    .filter((p) => p.poids_kg !== null && p.date >= debut && p.date <= date)
    .map((p) => p.poids_kg!)
  return valeurs.length === 0 ? null : valeurs.reduce((somme, v) => somme + v, 0) / valeurs.length
}

export const PERTE_MAX_KG_PAR_SEMAINE = 1.2
export const KCAL_CONSEILLEES_SI_PERTE_RAPIDE = 2200
const SEMAINES_OBSERVEES = 3

// Alerte si la moyenne mobile 7 jours a baissé de plus de 1,2 kg par semaine en moyenne
// sur les 3 dernières semaines. Il faut une moyenne aux deux bouts de la période.
export function perteTropRapide(pesees: Pesee[], aujourdhui: string) {
  const maintenant = moyenne7Jours(pesees, aujourdhui)
  const avant = moyenne7Jours(pesees, decalerJours(aujourdhui, -7 * SEMAINES_OBSERVEES))
  if (maintenant === null || avant === null) return null
  const parSemaine = (avant - maintenant) / SEMAINES_OBSERVEES
  return parSemaine > PERTE_MAX_KG_PAR_SEMAINE ? { parSemaine } : null
}
