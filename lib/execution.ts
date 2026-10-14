// Logique du mode exécution : découpage de la séance en écrans, pré-remplissage,
// suggestion de progression (SPEC section 6). Fonctions pures.

import { duree as formatDuree, nombre } from "@/lib/format"
import type { ExerciceDeSeance, Seance, SeanceFaite } from "@/lib/queries"
import type { Brouillon, SerieFaite } from "@/lib/seance-en-cours"

export type SerieHistorique = SeanceFaite["set_logs"][number]

export type Etape =
  | { type: "exercice"; cle: string; ligne: ExerciceDeSeance }
  | { type: "circuit"; cle: string; lignes: ExerciceDeSeance[] }

// Un écran par exercice ; un bloc circuit tient sur un seul écran.
export function etapesDe(seance: Seance): Etape[] {
  const etapes: Etape[] = []
  for (const ligne of seance.workout_exercises) {
    const derniere = etapes.at(-1)
    if (ligne.bloc === "circuit") {
      if (derniere?.type === "circuit") derniere.lignes.push(ligne)
      else etapes.push({ type: "circuit", cle: ligne.id, lignes: [ligne] })
    } else {
      etapes.push({ type: "exercice", cle: ligne.id, ligne })
    }
  }
  return etapes
}

export function etapeTerminee(etape: Etape, brouillon: Brouillon) {
  return etape.type === "circuit"
    ? brouillon.circuits[etape.cle]?.phase === "fini"
    : (brouillon.series[etape.ligne.id]?.length ?? 0) >= etape.ligne.series
}

// Ce qu'on saisit pour une série dépend de l'exercice :
//   durée   si l'exercice est chronométré
//   charge  si une charge de départ est définie
//   reps    si des répétitions sont prescrites, ou pour un exercice au poids du corps sans
//           prescription (« 5 x max ») : le nombre de reps est alors la seule chose à noter
export function champsDe(ligne: ExerciceDeSeance) {
  const duree = ligne.duree_sec !== null
  const charge = ligne.charge_depart_kg !== null
  const reps =
    !duree &&
    (ligne.reps_min !== null || (!charge && ligne.exercise.equipement === "poids_du_corps"))
  return { charge, reps, duree }
}

export const PAS_REPS = 1
export const PAS_DUREE_SEC = 5
const PAS_CHARGE_KG = 2.5
const REPS_SANS_PRESCRIPTION = 10

// 2,5 kg par défaut (spec). Si l'incrément propre à l'exercice est plus fin, ou n'est pas un
// multiple de 2,5 (haltères qui montent de 2 kg, élévations de 1 kg), c'est lui qui sert de pas :
// sinon la charge visée serait inatteignable au stepper.
export function pasPourIncrement(increment: number | null) {
  if (increment === null || increment <= 0) return PAS_CHARGE_KG
  return increment < PAS_CHARGE_KG || increment % PAS_CHARGE_KG !== 0 ? increment : PAS_CHARGE_KG
}

export function pasDeCharge(ligne: ExerciceDeSeance) {
  return pasPourIncrement(ligne.increment_kg)
}

// Les séries de cette ligne de séance lors de sa dernière exécution.
export function derniereFois(historique: SeanceFaite[], ligneId: string): SerieHistorique[] {
  for (const seance of historique) {
    const series = seance.set_logs.filter((s) => s.workout_exercise_id === ligneId)
    if (series.length > 0) return series
  }
  return []
}

// Les dernières séances où cet exercice a été fait, toutes séances confondues.
export function seancesDeLExercice(historique: SeanceFaite[], exerciseId: string, combien: number) {
  return historique
    .map((seance) => ({
      id: seance.id,
      date: seance.date,
      series: seance.set_logs.filter((s) => s.exercise_id === exerciseId),
    }))
    .filter((seance) => seance.series.length > 0)
    .slice(0, combien)
}

// Valeurs proposées pour la série `index` (0 = première).
//   Charge : celle de la série précédente du jour (une charge se garde d'une série à l'autre),
//            sinon celle de la dernière fois, sinon la charge de départ.
//   Reps et durée : celles de la même série la dernière fois, sinon celles de la série précédente.
export function valeursInitiales(
  ligne: ExerciceDeSeance,
  derniere: SerieHistorique[],
  faites: SerieFaite[],
  index: number,
  chargeProposee: number | null
) {
  const precedente = index > 0 ? faites[index - 1] : undefined
  const memeSerie = derniere.find((s) => s.serie_num === index + 1)
  const finDerniere = derniere.at(-1)

  return {
    charge:
      precedente?.charge ??
      chargeProposee ??
      memeSerie?.charge_kg ??
      derniere[0]?.charge_kg ??
      ligne.charge_depart_kg ??
      0,
    reps:
      memeSerie?.reps ??
      precedente?.reps ??
      finDerniere?.reps ??
      ligne.reps_min ??
      REPS_SANS_PRESCRIPTION,
    duree: memeSerie?.duree_sec ?? precedente?.duree ?? finDerniere?.duree_sec ?? ligne.duree_sec ?? 0,
  }
}

const RIR_FACILE = 3
const SERIES_FACILES_REQUISES = 3

// Si les 3 dernières séries loggées ont un RIR de 3 ou plus, proposer d'ajouter l'incrément.
// Renvoie la charge proposée, ou null. Jamais appliquée sans un appui de l'utilisateur.
export function chargeSuggeree(historique: SeanceFaite[], ligne: ExerciceDeSeance) {
  if (ligne.increment_kg === null) return null

  const recentes = historique
    .flatMap((seance) => seance.set_logs.filter((s) => s.workout_exercise_id === ligne.id).reverse())
    .slice(0, SERIES_FACILES_REQUISES)
  if (recentes.length < SERIES_FACILES_REQUISES) return null
  if (!recentes.every((s) => s.rir !== null && s.rir >= RIR_FACILE)) return null

  const actuelle = recentes[0]!.charge_kg
  return actuelle === null ? null : { de: actuelle, a: actuelle + ligne.increment_kg }
}

type SerieAffichable = { charge: number | null; reps: number | null; duree: number | null }

// « 80 kg × 8 », « 40 s », « 24 kg · 40 s », « 12 reps », ou « Faite » s'il n'y a rien à mesurer.
export function texteSerie({ charge, reps, duree }: SerieAffichable) {
  const morceaux: string[] = []
  if (charge !== null && reps !== null) morceaux.push(`${nombre(charge)} kg × ${reps}`)
  else if (charge !== null) morceaux.push(`${nombre(charge)} kg`)
  else if (reps !== null) morceaux.push(`${reps} reps`)
  if (duree !== null) morceaux.push(formatDuree(duree))
  return morceaux.join(" · ") || "Faite"
}

export function volumeKg(series: SerieFaite[]) {
  return series.reduce((total, s) => total + (s.charge ?? 0) * (s.reps ?? 0), 0)
}

export function chrono(millisecondes: number) {
  const secondes = Math.max(0, Math.ceil(millisecondes / 1000))
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`
}
