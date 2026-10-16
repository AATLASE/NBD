// Rapport de séance : calories, temps détaillé, records personnels, volume par muscle.
// Fonctions pures, partagées par l'écran de fin de séance et le calendrier.

export type SerieRapport = {
  exerciseId: string
  nom: string
  groupe: string | null
  charge: number | null
  reps: number | null
  duree: number | null
  // Heure de validation (ms), absente sur les séances plus anciennes que le rapport.
  fin: number | null
  // Repos prévu après chaque série de cet exercice, quand il vient du programme.
  reposPrevuSec: number | null
  bloc: "series" | "circuit"
}

export type SerieHistorique = { exerciseId: string; charge: number | null; reps: number | null; duree: number | null }

// --- Calories ------------------------------------------------------------------------------

// Dépense d'une séance, en équivalents métaboliques (MET) du Compendium des activités physiques :
// musculation soutenue, ou circuit enchaîné sans vraie pause. C'est une estimation : la montre,
// quand elle a mesuré la séance, la remplace.
const MET_MUSCULATION = 5
const MET_CIRCUIT = 8

export function caloriesEstimees(dureeMin: number, poidsKg: number, series: Pick<SerieRapport, "bloc">[]) {
  const partCircuit = series.length ? series.filter((s) => s.bloc === "circuit").length / series.length : 0
  const met = MET_MUSCULATION + (MET_CIRCUIT - MET_MUSCULATION) * partCircuit
  return Math.round(met * poidsKg * (dureeMin / 60))
}

// --- Temps ---------------------------------------------------------------------------------

export type TempsExercice = { exerciseId: string; dureeSec: number; entreSeriesSec: number | null }

// Durée de la séance : jusqu'à la dernière série validée quand on la connaît, sinon jusqu'à maintenant.
export function dureeSeanceMin(debut: number, series: Pick<SerieRapport, "fin">[], maintenant: number) {
  const fins = series.flatMap((s) => (s.fin ? [s.fin] : []))
  const fin = fins.length ? Math.max(...fins) : maintenant
  return Math.min(600, Math.max(1, Math.round((fin - debut) / 60_000)))
}

// Temps par exercice, dans l'ordre où ils ont été faits : de la fin de l'exercice précédent (ou du
// début de la séance) à sa dernière série. « Entre deux séries » : l'écart moyen entre deux séries
// validées du même exercice, c'est-à-dire le repos plus le temps de la série elle-même.
// Rien n'est calculé si une seule série n'a pas d'heure : un temps à moitié faux n'aide pas.
export function tempsParExercice(series: SerieRapport[], debut: number | null): TempsExercice[] | null {
  if (debut === null || series.length === 0 || series.some((s) => s.fin === null)) return null
  const parExercice = new Map<string, number[]>()
  for (const s of series) parExercice.set(s.exerciseId, [...(parExercice.get(s.exerciseId) ?? []), s.fin!])
  const ordre = [...parExercice.entries()]
    .map(([exerciseId, fins]) => ({ exerciseId, fins: fins.sort((a, b) => a - b) }))
    .sort((a, b) => a.fins.at(-1)! - b.fins.at(-1)!)

  let precedente = debut
  return ordre.map(({ exerciseId, fins }) => {
    const derniere = fins.at(-1)!
    const ecarts = fins.slice(1).map((fin, i) => fin - fins[i]!)
    const temps = {
      exerciseId,
      dureeSec: Math.max(0, Math.round((derniere - precedente) / 1000)),
      entreSeriesSec: ecarts.length ? Math.round(ecarts.reduce((a, b) => a + b, 0) / ecarts.length / 1000) : null,
    }
    precedente = derniere
    return temps
  })
}

// --- Records -------------------------------------------------------------------------------

export type Record = { exerciseId: string; nom: string; titre: string; detail: string }

// Force maximale estimée (formule d'Epley), fiable jusqu'à une douzaine de répétitions.
const unRm = (charge: number, reps: number) => (reps >= 1 && reps <= 12 ? charge * (1 + reps / 30) : null)
const kg = (v: number) => `${Math.round(v * 10) / 10}`.replace(".", ",")

// Un seul record par exercice, le plus parlant : charge, puis répétitions à charge égale, puis
// force estimée, puis durée. Un exercice fait pour la première fois n'a pas de record : rien à battre.
export function records(seance: SerieRapport[], historique: SerieHistorique[]): Record[] {
  const exercices = [...new Set(seance.map((s) => s.exerciseId))]
  return exercices.flatMap((exerciseId): Record[] => {
    const aujourdhui = seance.filter((s) => s.exerciseId === exerciseId)
    const avant = historique.filter((s) => s.exerciseId === exerciseId)
    const nom = aujourdhui[0]!.nom
    if (avant.length === 0) return []

    const chargesAvant = avant.flatMap((s) => (s.charge !== null && (s.reps ?? 1) > 0 ? [s.charge] : []))
    const chargesJour = aujourdhui.flatMap((s) => (s.charge !== null && (s.reps ?? 1) > 0 ? [s.charge] : []))
    if (chargesJour.length && chargesAvant.length && Math.max(...chargesJour) > Math.max(...chargesAvant)) {
      return [{ exerciseId, nom, titre: "Charge record", detail: `${kg(Math.max(...chargesJour))} kg, contre ${kg(Math.max(...chargesAvant))} kg avant` }]
    }

    // Plus de répétitions qu'avant à une charge au moins égale (ou au poids du corps).
    for (const serie of [...aujourdhui].sort((a, b) => (b.charge ?? 0) - (a.charge ?? 0))) {
      if (serie.reps === null) continue
      const comparables = avant.filter((s) =>
        serie.charge === null ? s.charge === null : s.charge !== null && s.charge >= serie.charge
      )
      const meilleur = Math.max(0, ...comparables.map((s) => s.reps ?? 0))
      if (comparables.length && serie.reps > meilleur) {
        return [{
          exerciseId, nom, titre: "Répétitions record",
          detail: serie.charge === null ? `${serie.reps} reps d'affilée` : `${serie.reps} reps à ${kg(serie.charge)} kg`,
        }]
      }
    }

    const rmAvant = avant.flatMap((s) => (s.charge !== null && s.reps !== null ? [unRm(s.charge, s.reps)] : [])).filter((v): v is number => v !== null)
    const rmJour = aujourdhui.flatMap((s) => (s.charge !== null && s.reps !== null ? [unRm(s.charge, s.reps)] : [])).filter((v): v is number => v !== null)
    if (rmJour.length && rmAvant.length && Math.max(...rmJour) > Math.max(...rmAvant) + 0.5) {
      return [{ exerciseId, nom, titre: "Force record", detail: `force maximale estimée à ${kg(Math.max(...rmJour))} kg` }]
    }

    const dureesAvant = avant.flatMap((s) => (s.duree !== null ? [s.duree] : []))
    const dureesJour = aujourdhui.flatMap((s) => (s.duree !== null ? [s.duree] : []))
    if (dureesJour.length && dureesAvant.length && Math.max(...dureesJour) > Math.max(...dureesAvant)) {
      return [{ exerciseId, nom, titre: "Durée record", detail: `${Math.max(...dureesJour)} s tenues` }]
    }
    return []
  })
}

// --- Volume par muscle ---------------------------------------------------------------------

export type VolumeGroupe = { groupe: string; series: number; volumeKg: number }

// Par groupe musculaire : le nombre de séries (compte aussi le poids du corps) et le volume
// soulevé (charge × répétitions). Trié du plus travaillé au moins travaillé.
export function volumeParGroupe(series: SerieRapport[]): VolumeGroupe[] {
  const groupes = new Map<string, VolumeGroupe>()
  for (const s of series) {
    const groupe = s.groupe ?? "autre"
    const actuel = groupes.get(groupe) ?? { groupe, series: 0, volumeKg: 0 }
    actuel.series += 1
    actuel.volumeKg += (s.charge ?? 0) * (s.reps ?? 0)
    groupes.set(groupe, actuel)
  }
  return [...groupes.values()].sort((a, b) => b.series - a.series || b.volumeKg - a.volumeKg)
}
