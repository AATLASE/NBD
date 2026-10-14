// La séance prévue à une date : la semaine type, sauf exception posée dans le planning.
// Un seul calcul, partagé par l'écran Sport, le calendrier et l'assistant : ils ne peuvent
// donc pas se contredire. Fonctions pures.

import { jourDe } from "@/lib/format"

export type Exception = { id: string; date: string; workout_id: string | null; raison: string | null }

type SeanceTypee = { id: string; jour_suggere: string | null }

export function seancePrevue<S extends SeanceTypee>(date: string, seances: S[], planning: Exception[]) {
  const exception = planning.find((p) => p.date === date)
  if (exception) {
    // Une exception qui vise une séance retirée du programme vaut repos.
    const seance = exception.workout_id ? seances.find((s) => s.id === exception.workout_id) : undefined
    return { seance, exception }
  }
  return { seance: seances.find((s) => s.jour_suggere === jourDe(date)), exception: undefined }
}

// La séance de la semaine type ce jour-là, sans tenir compte des exceptions.
export function seanceDeLaSemaineType<S extends SeanceTypee>(date: string, seances: S[]) {
  return seances.find((s) => s.jour_suggere === jourDe(date))
}
