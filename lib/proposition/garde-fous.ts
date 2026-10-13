// Garde-fous appliqués à ce que le modèle propose, puis de nouveau au moment d'adopter.
// La consigne donnée au modèle ne suffit pas : tout ce qui touche au matériel disponible,
// au régime et aux aliments exclus est revérifié ici, en code.
//
// Limite à connaître : la vérification des aliments exclus est une recherche de mots. Elle attrape
// « arachide » dans « beurre d'arachide », pas un synonyme (« cacahuète ») ni un dérivé caché.
// L'interface le dit à la personne : en cas d'allergie, elle doit relire les ingrédients.

import { JOURS, SLOTS, type Slot } from "@/lib/libelles"
import type {
  ExercicePropose,
  PlatPropose,
  PropositionNutrition,
  PropositionSport,
} from "@/lib/proposition/schemas"

export type ProfilPourProposition = {
  lieux: readonly string[]
  seancesParSemaine: number
  regime: string
  alimentsExclus: readonly string[]
}

const borner = (valeur: number, min: number, max: number) => Math.min(max, Math.max(min, valeur))
const sansAccent = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// --- Sport ---------------------------------------------------------------------

// Ce matériel n'existe qu'en salle : sans accès à une salle, l'exercice est retiré.
const MATERIEL_DE_SALLE = ["barre", "poulie", "machine"]
const EXERCICES_MAX_PAR_SEANCE = 12

export function nettoyerExercice(exercice: ExercicePropose): ExercicePropose {
  const aDuree = exercice.duree_sec !== null
  const repsMin = aDuree || exercice.reps_min === null ? null : borner(exercice.reps_min, 1, 100)
  const repsMax = aDuree || exercice.reps_max === null ? repsMin : borner(exercice.reps_max, 1, 100)
  const depart = exercice.charge_depart_kg === null ? null : borner(exercice.charge_depart_kg, 0, 500)
  const cible = depart === null || exercice.charge_cible_kg === null ? depart : borner(exercice.charge_cible_kg, 0, 500)

  return {
    ...exercice,
    nom: exercice.nom.trim().slice(0, 60),
    series: borner(exercice.series, 1, 10),
    reps_min: repsMin !== null && repsMax !== null ? Math.min(repsMin, repsMax) : repsMin,
    reps_max: repsMin !== null && repsMax !== null ? Math.max(repsMin, repsMax) : repsMax,
    duree_sec: aDuree ? borner(exercice.duree_sec!, 5, 3600) : null,
    repos_sec: borner(exercice.repos_sec, 0, 600),
    charge_depart_kg: depart,
    charge_cible_kg: depart !== null && cible !== null ? Math.max(depart, cible) : cible,
    increment_kg:
      depart === null || exercice.increment_kg === null ? null : borner(exercice.increment_kg, 0.5, 20),
    note: exercice.note?.trim().slice(0, 300) || null,
  }
}

export function nettoyerSport(proposition: PropositionSport, profil: ProfilPourProposition) {
  const retires: string[] = []
  const sansSalle = !profil.lieux.includes("salle")
  const joursPris = new Set<string>()

  const seances = proposition.seances
    .slice(0, borner(profil.seancesParSemaine, 1, 7))
    .map((seance) => {
      const exercices = seance.exercices
        .filter((exercice) => {
          const garde = exercice.nom.trim().length >= 2 && !(sansSalle && MATERIEL_DE_SALLE.includes(exercice.equipement))
          if (!garde) retires.push(`${exercice.nom} (demande du matériel de salle)`)
          return garde
        })
        .slice(0, EXERCICES_MAX_PAR_SEANCE)
        .map(nettoyerExercice)

      // Deux séances le même jour : la seconde glisse au premier jour libre.
      const jour = joursPris.has(seance.jour) ? (JOURS.find((j) => !joursPris.has(j)) ?? seance.jour) : seance.jour
      joursPris.add(jour)

      return {
        ...seance,
        nom: seance.nom.trim().slice(0, 60) || "Séance",
        jour,
        duree_min: borner(seance.duree_min, 10, 180),
        note: seance.note?.trim().slice(0, 500) || null,
        exercices,
      }
    })
    .filter((seance) => seance.exercices.length > 0)

  return {
    proposition: { seances, conseils: proposition.conseils.trim().slice(0, 800) },
    retires,
  }
}

// --- Nutrition --------------------------------------------------------------------

const CHAIR = [
  "viande", "poulet", "dinde", "boeuf", "bœuf", "porc", "jambon", "lardon", "bacon", "saucisse", "chorizo",
  "steak", "veau", "agneau", "canard", "lapin", "merguez", "gelatine",
]
const MER = [
  "poisson", "thon", "saumon", "cabillaud", "colin", "sardine", "maquereau", "anchois", "crevette",
  "moule", "fruits de mer", "surimi", "truite",
]
// Produits animaux exclus d'un régime vegan, sauf quand ils désignent un équivalent végétal.
const ANIMAL = ["oeuf", "œuf", "lait", "fromage", "yaourt", "skyr", "beurre", "creme", "miel", "whey", "feta", "mozzarella", "parmesan"]
const VEGETAL = [
  "vegetal", "de soja", "de coco", "d'amande", "d'avoine", "de riz", "de cacahuete", "d'arachide",
  "de cajou", "de noisette", "de sesame", "au soja",
]

const INTERDITS_PAR_REGIME: Record<string, string[]> = {
  omnivore: [],
  pescetarien: CHAIR,
  vegetarien: [...CHAIR, ...MER],
  vegan: [...CHAIR, ...MER],
}

// Le premier terme interdit trouvé dans le nom du plat ou dans un ingrédient, sinon null.
function termeInterdit(plat: PlatPropose, profil: ProfilPourProposition): string | null {
  const textes = [plat.nom, ...plat.ingredients.map((i) => i.nom)].map(sansAccent)
  const contient = (terme: string) => textes.some((texte) => texte.includes(sansAccent(terme)))

  for (const exclu of profil.alimentsExclus) {
    if (exclu.trim().length >= 2 && contient(exclu.trim())) return exclu.trim()
  }
  for (const terme of INTERDITS_PAR_REGIME[profil.regime] ?? []) {
    if (contient(terme)) return terme
  }
  if (profil.regime === "vegan") {
    for (const texte of textes) {
      const animal = ANIMAL.find((terme) => texte.includes(sansAccent(terme)))
      if (animal && !VEGETAL.some((qualificatif) => texte.includes(qualificatif))) return animal
    }
  }
  return null
}

const PLATS_MAX = 40

export function nettoyerNutrition(proposition: PropositionNutrition, profil: ProfilPourProposition) {
  const retires: string[] = []

  const plats = proposition.plats
    .slice(0, PLATS_MAX)
    .filter((plat) => {
      const interdit = plat.nom.trim().length < 2 ? "nom manquant" : termeInterdit(plat, profil)
      if (interdit) retires.push(`${plat.nom} (contient : ${interdit})`)
      return !interdit
    })
    .map((plat) => ({
      ...plat,
      nom: plat.nom.trim().slice(0, 90),
      kcal: borner(plat.kcal, 0, 3000),
      proteines_g: borner(plat.proteines_g, 0, 300),
      lipides_g: borner(plat.lipides_g, 0, 300),
      glucides_g: borner(plat.glucides_g, 0, 500),
      temps_min: borner(plat.temps_min, 0, 600),
      recette_md: plat.recette_md.trim().slice(0, 3000),
      ingredients: plat.ingredients.slice(0, 30).map((ingredient) => ({
        nom: ingredient.nom.trim().slice(0, 80),
        quantite: ingredient.quantite === null ? null : borner(ingredient.quantite, 0, 5000),
        unite: ingredient.unite?.trim().slice(0, 20) || null,
      })),
    }))

  return {
    proposition: { plats, conseils: proposition.conseils.trim().slice(0, 800) },
    retires,
  }
}

// Répartit les plats sur les 2 semaines : pour chaque repas, ses plats tournent jour après jour.
// Renvoie, pour chaque case (semaine, jour, repas), l'indice du plat dans `plats`, ou null.
export function repartirSurDeuxSemaines(plats: readonly PlatPropose[]) {
  const parSlot = new Map<Slot, number[]>()
  plats.forEach((plat, indice) => parSlot.set(plat.slot, [...(parSlot.get(plat.slot) ?? []), indice]))

  return ([1, 2] as const).flatMap((semaine) =>
    JOURS.flatMap((jour, rangJour) =>
      SLOTS.map((slot) => {
        const candidats = parSlot.get(slot) ?? []
        const rang = (semaine - 1) * JOURS.length + rangJour
        return {
          semaine,
          jour,
          slot,
          plat: candidats.length > 0 ? candidats[rang % candidats.length]! : null,
        }
      })
    )
  )
}
