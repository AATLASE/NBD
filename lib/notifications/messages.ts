// Les notifications, écrites par le coach choisi : son nom en titre, son portrait en icône, une
// phrase dans sa voix puis les faits. Sans coach choisi, l'application parle d'un ton neutre.
// Fonctions pures.

import { COACH, phraseDuCoach, type IdCoach } from "@/lib/coachs"
import { nombre } from "@/lib/format"
import type { Record as RecordPersonnel } from "@/lib/rapport"

export type Notification = {
  titre: string
  corps: string
  // L'écran ouvert quand on touche la notification.
  url: string
  icone: string
  // Une notification du même tag remplace la précédente au lieu de s'empiler.
  tag: string
}

const signe = (coach: IdCoach | null, titreNeutre: string) =>
  coach ? { titre: COACH[coach].nom, icone: `/portraits/${coach}.png` } : { titre: titreNeutre, icone: "/icons/icone-192.png" }

export type Programme = { code: string; nom: string; duree_min: number } | { activite: string }

// Le matin d'un jour de séance. `graine` 1 : pas la même phrase que l'accueil de l'application.
export function rappelSeance(coach: IdCoach | null, date: string, programme: Programme): Notification {
  const quoi =
    "activite" in programme
      ? `Au programme aujourd'hui : ${programme.activite}.`
      : `Séance ${programme.code} · ${programme.nom}, ${programme.duree_min} min.`
  return {
    ...signe(coach, "Séance du jour"),
    corps: `${coach ? phraseDuCoach(coach, "seance", date, 1) : "Une séance est prévue aujourd'hui."}\n${quoi}`,
    url: "/sport",
    tag: `seance-${date}`,
  }
}

export type BilanSeance = {
  logId: string
  date: string
  code: string | null
  dureeMin: number | null
  series: number
  volumeKg: number
  records: RecordPersonnel[]
}

// Juste après l'enregistrement d'une séance.
export function compteRendu(coach: IdCoach | null, bilan: BilanSeance): Notification {
  const chiffres = [
    bilan.dureeMin !== null && `${bilan.dureeMin} min`,
    `${bilan.series} série${bilan.series > 1 ? "s" : ""}`,
    bilan.volumeKg > 0 && `${nombre(Math.round(bilan.volumeKg))} kg soulevés`,
  ]
    .filter(Boolean)
    .join(" · ")
  const [premier] = bilan.records
  const records = !premier
    ? ""
    : bilan.records.length === 1
      ? ` Record sur ${premier.nom} : ${premier.detail}.`
      : ` ${bilan.records.length} records, dont ${premier.nom}.`
  return {
    ...signe(coach, "Séance enregistrée"),
    corps: `${coach ? phraseDuCoach(coach, "faite", bilan.date, 1) : "Ta séance est enregistrée."}\n${bilan.code ? `Séance ${bilan.code}` : "Ta séance"} : ${chiffres}.${records}`,
    url: `/sport/seances?date=${bilan.date}&rapport=${bilan.logId}`,
    tag: `rapport-${bilan.logId}`,
  }
}

// Le recalcul propose de changer la prochaine séance. L'explication est déjà dans la voix du coach.
export function ajustementPropose(
  coach: IdCoach | null,
  ajustement: { workoutId: string; code: string; explication: string; exercices: number }
): Notification {
  const n = ajustement.exercices
  return {
    ...signe(coach, `Séance ${ajustement.code} à ajuster`),
    corps: `${ajustement.explication}\n${n} exercice${n > 1 ? "s" : ""} de la séance ${ajustement.code} à valider dans l'onglet Sport.`,
    url: "/sport",
    tag: `ajustement-${ajustement.workoutId}`,
  }
}

// Envoyée à la demande, depuis les paramètres, pour vérifier qu'un appareil reçoit bien.
export function essai(coach: IdCoach | null, date: string): Notification {
  return {
    ...signe(coach, "Notifications activées"),
    corps: coach ? phraseDuCoach(coach, "essai", date) : "Cet appareil recevra les rappels de séance, les comptes rendus et les ajustements.",
    url: "/parametres",
    tag: "essai",
  }
}
