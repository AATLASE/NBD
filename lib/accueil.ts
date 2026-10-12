// Réponses au questionnaire d'accueil : leur forme et leur validation.
// Le même contrôle sert dans le navigateur (messages sous les champs) et sur le serveur.

import {
  LIEUX_ENTRAINEMENT,
  NIVEAUX,
  OBJECTIFS,
  OBJECTIFS_MAX,
  REGIMES,
  SEXES,
  type LieuEntrainement,
  type Niveau,
  type Objectif,
  type Regime,
  type SexeDeclare,
} from "@/lib/libelles"

export type ReponsesAccueil = {
  poidsKg: number
  tailleCm: number
  age: number
  sexe: SexeDeclare
  objectifs: Objectif[]
  // Renseignée seulement si l'objectif « blessure » est choisi.
  zoneBlessure: string | null
  lieux: LieuEntrainement[]
  seancesParSemaine: number
  niveau: Niveau
  regime: Regime
  alimentsExclus: string[]
}

export const BORNES = {
  poids: [30, 300],
  taille: [100, 250],
  age: [15, 99],
  seances: [2, 6],
} as const
export const ALIMENTS_EXCLUS_MAX = 20

const dans = (valeur: number, [min, max]: readonly [number, number]) => valeur >= min && valeur <= max
const sansDoublon = <T>(liste: T[]) => new Set(liste).size === liste.length
const parmi = <T extends string>(valeurs: readonly T[], valeur: unknown): valeur is T =>
  typeof valeur === "string" && (valeurs as readonly string[]).includes(valeur)

// Renvoie les réponses nettoyées, ou null si l'une d'elles est absente ou hors bornes.
export function validerReponses(brut: unknown): ReponsesAccueil | null {
  if (typeof brut !== "object" || brut === null) return null
  const r = brut as Record<string, unknown>

  const nombresValides =
    typeof r.poidsKg === "number" &&
    dans(r.poidsKg, BORNES.poids) &&
    Number.isInteger(r.tailleCm) &&
    dans(r.tailleCm as number, BORNES.taille) &&
    Number.isInteger(r.age) &&
    dans(r.age as number, BORNES.age) &&
    Number.isInteger(r.seancesParSemaine) &&
    dans(r.seancesParSemaine as number, BORNES.seances)
  if (!nombresValides) return null

  if (!parmi(SEXES, r.sexe) || !parmi(NIVEAUX, r.niveau) || !parmi(REGIMES, r.regime)) return null

  const objectifs = r.objectifs
  if (
    !Array.isArray(objectifs) ||
    objectifs.length < 1 ||
    objectifs.length > OBJECTIFS_MAX ||
    !sansDoublon(objectifs) ||
    !objectifs.every((o): o is Objectif => parmi(OBJECTIFS, o))
  ) {
    return null
  }

  const lieux = r.lieux
  if (
    !Array.isArray(lieux) ||
    lieux.length < 1 ||
    !sansDoublon(lieux) ||
    !lieux.every((l): l is LieuEntrainement => parmi(LIEUX_ENTRAINEMENT, l))
  ) {
    return null
  }

  const exclus = r.alimentsExclus
  if (!Array.isArray(exclus) || exclus.length > ALIMENTS_EXCLUS_MAX || !exclus.every((a) => typeof a === "string")) {
    return null
  }
  const alimentsExclus = [...new Set(exclus.map((a: string) => a.trim().toLowerCase()))].filter(
    (a) => a.length >= 2 && a.length <= 40
  )

  const zone = typeof r.zoneBlessure === "string" ? r.zoneBlessure.trim().slice(0, 100) : ""

  return {
    poidsKg: r.poidsKg as number,
    tailleCm: r.tailleCm as number,
    age: r.age as number,
    sexe: r.sexe,
    objectifs,
    zoneBlessure: objectifs.includes("blessure") && zone ? zone : null,
    lieux,
    seancesParSemaine: r.seancesParSemaine as number,
    niveau: r.niveau,
    regime: r.regime,
    alimentsExclus,
  }
}
