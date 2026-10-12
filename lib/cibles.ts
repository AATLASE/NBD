// Cibles nutritionnelles d'un nouveau compte, calculées depuis le questionnaire d'accueil.
// Calcul déterministe, fait par l'application : ce n'est pas le modèle qui choisit les calories.
//
// Méthode :
//   1. Métabolisme de base par la formule de Mifflin-St Jeor (poids, taille, âge, sexe).
//   2. Dépense quotidienne = métabolisme x facteur d'activité, selon le nombre de séances.
//   3. Ajustement selon l'objectif : déficit modéré pour perdre du poids, léger surplus pour
//      gagner en force, maintien sinon.
//   4. Garde-fous : jamais sous le métabolisme de base, et aucun déficit avant 18 ans.

import type { Objectif } from "@/lib/libelles"

export type Sexe = "homme" | "femme" | "non_precise"

export type Mesures = {
  poidsKg: number
  tailleCm: number
  age: number
  sexe: Sexe
  seancesParSemaine: number
  objectifs: readonly Objectif[]
}

export type Cibles = { kcal: number; proteinesG: number; lipidesG: number; glucidesG: number }

// Terme propre au sexe dans Mifflin-St Jeor. Sans réponse : la moyenne des deux.
const TERME_SEXE: Record<Sexe, number> = { homme: 5, femme: -161, non_precise: -78 }

const DEFICIT_PERTE_DE_POIDS = 0.8
const SURPLUS_GAIN_DE_FORCE = 1.05
const AGE_ADULTE = 18

const PROTEINES_G_PAR_KG = { soutenu: 1.8, entretien: 1.4 }
const LIPIDES_G_PAR_KG = 0.9
const KCAL_PAR_G = { proteines: 4, glucides: 4, lipides: 9 }

const arrondi = (valeur: number, pas: number) => Math.round(valeur / pas) * pas

export function metabolismeDeBase({ poidsKg, tailleCm, age, sexe }: Mesures) {
  return 10 * poidsKg + 6.25 * tailleCm - 5 * age + TERME_SEXE[sexe]
}

function facteurActivite(seancesParSemaine: number) {
  if (seancesParSemaine >= 6) return 1.725
  if (seancesParSemaine >= 4) return 1.55
  if (seancesParSemaine >= 2) return 1.375
  return 1.2
}

export function calculerCibles(mesures: Mesures): Cibles {
  const base = metabolismeDeBase(mesures)
  const depense = base * facteurActivite(mesures.seancesParSemaine)

  const veutPerdre = mesures.objectifs.includes("perte_de_poids") && mesures.age >= AGE_ADULTE
  const veutForcir = mesures.objectifs.includes("gain_de_force")
  const ajustement = veutPerdre ? DEFICIT_PERTE_DE_POIDS : veutForcir ? SURPLUS_GAIN_DE_FORCE : 1

  const kcal = arrondi(Math.max(depense * ajustement, base), 50)
  const proteinesG = arrondi(
    mesures.poidsKg * (veutPerdre || veutForcir ? PROTEINES_G_PAR_KG.soutenu : PROTEINES_G_PAR_KG.entretien),
    5
  )
  const lipidesG = arrondi(mesures.poidsKg * LIPIDES_G_PAR_KG, 5)
  // Les glucides prennent ce qui reste, sans jamais devenir négatifs.
  const reste = kcal - proteinesG * KCAL_PAR_G.proteines - lipidesG * KCAL_PAR_G.lipides
  const glucidesG = arrondi(Math.max(reste, 0) / KCAL_PAR_G.glucides, 5)

  return { kcal, proteinesG, lipidesG, glucidesG }
}
