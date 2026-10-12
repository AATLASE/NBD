// Règles de calcul de la SPEC, section 6 et 8.7. Fonctions pures, sans accès aux données.

import { decalerJours, joursEntre } from "@/lib/format"

export const SEMAINES_PROGRAMME = 9
export const SEMAINE_REPRISE_COURSE = 5

// semaine = floor((aujourd'hui - date_debut) / 7) + 1, plafonnée à 9.
// `brute` n'est pas plafonnée : elle sert à faire tourner le plan de repas sur 2 semaines.
export function semaineProgramme(debut: string | null, aujourdhui: string) {
  const brute = debut ? Math.max(0, Math.floor(joursEntre(debut, aujourdhui) / 7)) + 1 : 1
  return { semaine: Math.min(brute, SEMAINES_PROGRAMME), brute }
}

export function semaineMenu(semaineBrute: number): 1 | 2 {
  return semaineBrute % 2 === 1 ? 1 : 2
}

// Les exercices « un jour sur deux » tombent les jours pairs depuis le début du programme.
export function estJourSurDeux(debut: string | null, aujourdhui: string) {
  return debut ? joursEntre(debut, aujourdhui) % 2 === 0 : true
}

type MesureDouleur = { date: string; douleur_matin: number }

export type EtatFeu = "vert" | "orange" | "rouge"

// Feu tricolore du pied : moyenne de la douleur matinale sur les 7 derniers jours.
//   Rouge   si moyenne > 5 ou un jour ≥ 7
//   Vert    si moyenne ≤ 3 et aucun jour > 4
//   Orange  sinon (dont le cas non couvert par la spec : moyenne ≤ 3 avec un jour à 5 ou 6)
export function feuTricolore(mesures: MesureDouleur[], aujourdhui: string) {
  const debut = decalerJours(aujourdhui, -6)
  const recentes = mesures.filter((m) => m.date >= debut && m.date <= aujourdhui)
  if (recentes.length === 0) return null

  const valeurs = recentes.map((m) => m.douleur_matin)
  const moyenne = valeurs.reduce((somme, v) => somme + v, 0) / valeurs.length
  const max = Math.max(...valeurs)

  let etat: EtatFeu = "orange"
  if (moyenne > 5 || max >= 7) etat = "rouge"
  else if (moyenne <= 3 && max <= 4) etat = "vert"

  return { etat, moyenne, max, jours: recentes.length }
}

export const SEUIL_DOULEUR_REPRISE = 3
export const JOURS_SANS_DOULEUR_REQUIS = 7

// Condition 1 d'entrée en semaine 5 : douleur au réveil ≤ 3 pendant 7 jours consécutifs.
// On compte la série en cours, en remontant depuis la dernière mesure (aujourd'hui ou hier).
export function serieSansDouleur(mesures: MesureDouleur[], aujourdhui: string) {
  const parDate = new Map(mesures.map((m) => [m.date, m.douleur_matin]))
  let jour = parDate.has(aujourdhui) ? aujourdhui : decalerJours(aujourdhui, -1)
  let serie = 0
  while (serie < JOURS_SANS_DOULEUR_REQUIS) {
    const douleur = parDate.get(jour)
    if (douleur === undefined || douleur > SEUIL_DOULEUR_REPRISE) break
    serie += 1
    jour = decalerJours(jour, -1)
  }
  return { serie, remplie: serie >= JOURS_SANS_DOULEUR_REQUIS }
}

export const MINUTES_MARCHE_REQUISES = 45

type Sortie = { duree_min: number | null; douleur_apres: number | null; douleur_lendemain: number | null }

// Condition 2 : 45 min de marche rapide sans douleur pendant ni le lendemain.
export function marcheSansDouleur(sorties: Sortie[]) {
  return sorties.some(
    (s) =>
      (s.duree_min ?? 0) >= MINUTES_MARCHE_REQUISES &&
      s.douleur_apres === 0 &&
      s.douleur_lendemain === 0
  )
}
