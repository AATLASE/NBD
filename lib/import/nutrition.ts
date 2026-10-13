// Transforme un tableau de tableur en plats et en menus prêts à être ajoutés.
//
// Une ligne = un plat à un repas d'un jour. Plusieurs lignes pour le même repas du même jour
// (un journal alimentaire, une ligne par aliment) sont réunies en un seul plat, dont elles
// deviennent les ingrédients. Sans colonne « Jour », les plats rejoignent seulement les recettes.
// Fonctions pures : rien n'est écrit ici.

import {
  cellule,
  lireDate,
  lireEntier,
  lireJour,
  lireNombre,
  lireSemaine,
  lireSlot,
  normaliser,
  trouverEntetes,
  type Tableau,
} from "@/lib/import/colonnes"
import { JOURS, type Jour, type Slot } from "@/lib/libelles"
import { estimerPlat } from "@/lib/nutriments"

export const PLATS_MAX = 120

export type IngredientImporte = { nom: string; quantite: number | null; unite: string | null }

export type PlatImporte = {
  nom: string
  slot: Slot
  kcal: number
  proteines_g: number
  lipides_g: number | null
  glucides_g: number | null
  temps_min: number | null
  recette_md: string | null
  ingredients: IngredientImporte[]
}

// `plat` : indice dans la liste des plats.
export type CaseImportee = { semaine: 1 | 2; jour: Jour; slot: Slot; plat: number }

export type LectureNutrition =
  | { ok: true; plats: PlatImporte[]; cases: CaseImportee[]; remarques: string[] }
  | { ok: false; message: string }

const ALIAS = {
  semaine: ["semaine", "week", "sem"],
  jour: ["jour", "day", "date", "jour de la semaine", "weekday"],
  repas: ["repas", "moment", "meal", "type de repas", "meal type", "creneau", "slot", "group", "categorie", "type"],
  plat: ["plat", "nom du plat", "nom", "meal name", "food name", "food", "dish", "aliment", "intitule", "menu", "recette", "recipe"],
  quantite: ["quantite", "amount", "portion", "qte"],
  kcal: ["calories", "kcal", "energie", "energy", "calorie", "cal"],
  proteines: ["proteines", "proteine", "protein", "proteins", "prot"],
  lipides: ["lipides", "lipide", "fat", "fats", "graisses", "matieres grasses"],
  glucides: ["glucides", "glucide", "carbs", "carbohydrates", "carbohydrate", "net carbs"],
  temps: ["temps", "temps de preparation", "prep time", "duree"],
  ingredients: ["ingredients", "ingredient", "composition"],
  recette: ["preparation", "instructions", "etapes", "recette", "recipe", "methode"],
} as const

type Champ = keyof typeof ALIAS

// --- Ingrédients -------------------------------------------------------------------

const UNITE =
  "kg|g|gr|grammes?|ml|cl|l|litres?|c\\.? ?à ?s(?:oupe)?|c\\.? ?à ?c(?:afé)?|cuill?ères? à soupe|cuill?ères? à café|cs|cc|tranches?|pots?|verres?|tasses?|bols?|poignées?|pincées?|gousses?|boules?|doses?|pièces?"
const QUANTITE_DEVANT = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNITE})?\\.?\\s+(?:de\\s+|d['’]\\s*)?(.+)$`, "i")
const QUANTITE_DERRIERE = new RegExp(`^(.+?)(?:\\s*[:(]\\s*|\\s+-\\s+|\\s+)(\\d+(?:[.,]\\d+)?)\\s*(${UNITE})?\\.?\\)?$`, "i")

const enNombre = (texte: string) => Number(texte.replace(",", "."))

// « 150 g de riz », « 2 œufs », « riz 150 g », « sel ».
export function lireIngredient(texte: string): IngredientImporte | null {
  const t = texte.trim().replace(/^[-•*]\s*/, "")
  if (!t) return null
  const devant = t.match(QUANTITE_DEVANT)
  if (devant) return { nom: devant[3]!.trim(), quantite: enNombre(devant[1]!), unite: devant[2]?.toLowerCase() ?? null }
  const derriere = t.match(QUANTITE_DERRIERE)
  if (derriere) {
    return { nom: derriere[1]!.trim(), quantite: enNombre(derriere[2]!), unite: derriere[3]?.toLowerCase() ?? null }
  }
  return { nom: t, quantite: null, unite: null }
}

// Une cellule « Ingrédients » : un par ligne, ou séparés par des virgules ou des points-virgules.
// La virgule d'un nombre (« 1,5 kg ») ne sépare rien.
export function lireIngredients(texte: string): IngredientImporte[] {
  return texte
    .split(/\s*(?:;|\n|\r|,(?!\d))\s*/)
    .map(lireIngredient)
    .filter((ingredient): ingredient is IngredientImporte => ingredient !== null && ingredient.nom.length >= 2)
    .slice(0, 30)
}

// --- Lecture ---------------------------------------------------------------------

type LigneLue = {
  nom: string
  slot: Slot
  semaine: number | null
  jour: Jour | null
  date: string | null
  quantite: string
  kcal: number | null
  proteines: number | null
  lipides: number | null
  glucides: number | null
  temps: number | null
  ingredients: IngredientImporte[]
  recette: string
}

const somme = (valeurs: (number | null)[]) => {
  const connues = valeurs.filter((v): v is number => v !== null)
  return connues.length > 0 ? Math.round(connues.reduce((a, b) => a + b, 0)) : null
}

// Réunit les lignes d'un même repas en un seul plat.
function composerPlat(lignes: LigneLue[]): Omit<PlatImporte, "kcal" | "proteines_g"> & { kcal: number | null; proteines_g: number | null } {
  const premiere = lignes[0]!
  const enIngredient = (l: LigneLue): IngredientImporte =>
    (l.quantite ? lireIngredient(`${l.quantite} ${l.nom}`) : null) ?? { nom: l.nom, quantite: null, unite: null }
  if (lignes.length === 1) {
    return {
      nom: premiere.nom,
      slot: premiere.slot,
      kcal: premiere.kcal,
      proteines_g: premiere.proteines,
      lipides_g: premiere.lipides,
      glucides_g: premiere.glucides,
      temps_min: premiere.temps,
      recette_md: premiere.recette || null,
      // Un aliment seul, donné avec sa quantité, est son propre ingrédient.
      ingredients:
        premiere.ingredients.length > 0 || !premiere.quantite ? premiere.ingredients : [enIngredient(premiere)],
    }
  }
  const noms = lignes.map((l) => l.nom)
  const nom = noms.join(" + ")
  return {
    nom: nom.length > 90 ? `${noms.slice(0, 2).join(" + ")} et ${noms.length - 2} de plus` : nom,
    slot: premiere.slot,
    kcal: somme(lignes.map((l) => l.kcal)),
    proteines_g: somme(lignes.map((l) => l.proteines)),
    lipides_g: somme(lignes.map((l) => l.lipides)),
    glucides_g: somme(lignes.map((l) => l.glucides)),
    temps_min: Math.max(0, ...lignes.map((l) => l.temps ?? 0)) || null,
    recette_md: lignes.map((l) => l.recette).filter(Boolean).join("\n\n") || null,
    // Chaque ligne devient un ingrédient, avec sa quantité si le fichier la donne.
    ingredients: lignes.map(enIngredient).slice(0, 30),
  }
}

export function lireNutrition(tableau: Tableau): LectureNutrition {
  const entetes = trouverEntetes<Champ>(tableau, ALIAS, ["plat", "repas"])
  if (!entetes) {
    const sansRepas = trouverEntetes<Champ>(tableau, ALIAS, ["plat"]) !== null
    return {
      ok: false,
      message: sansRepas
        ? "Colonne « Repas » introuvable. Chaque ligne doit dire à quel repas va le plat : petit déjeuner, déjeuner, dîner ou collation."
        : "Colonnes « Plat » et « Repas » introuvables. Il faut une ligne de titres ; télécharge le modèle pour voir les colonnes attendues.",
    }
  }
  const { colonnes: col } = entetes
  const lire = (ligne: string[], champ: Champ) => cellule(ligne, col[champ])
  const remarques: string[] = []

  const lignes: LigneLue[] = []
  const repasInconnus = new Set<string>()
  let derniereSemaine: number | null = null
  let dernierJour = ""

  for (const ligne of tableau.slice(entetes.ligne + 1)) {
    const nom = lire(ligne, "plat")
    if (!nom) continue
    // Semaine et jour ne sont souvent écrits qu'une fois, en tête de leur bloc de lignes.
    derniereSemaine = lireSemaine(lire(ligne, "semaine")) ?? derniereSemaine
    dernierJour = lire(ligne, "jour") || dernierJour

    const repas = lire(ligne, "repas")
    const slot = lireSlot(repas)
    if (!slot) {
      if (repas) repasInconnus.add(repas)
      continue
    }
    lignes.push({
      nom,
      slot,
      semaine: derniereSemaine,
      jour: lireJour(dernierJour),
      date: /\d{4}|\d[/.]\d/.test(dernierJour) ? lireDate(dernierJour) : null,
      quantite: lire(ligne, "quantite"),
      kcal: lireNombre(lire(ligne, "kcal")),
      proteines: lireNombre(lire(ligne, "proteines")),
      lipides: lireNombre(lire(ligne, "lipides")),
      glucides: lireNombre(lire(ligne, "glucides")),
      temps: lireEntier(lire(ligne, "temps")),
      ingredients: lireIngredients(lire(ligne, "ingredients")),
      recette: lire(ligne, "recette"),
    })
  }

  if (repasInconnus.size > 0) {
    remarques.push(
      `Repas non reconnu, lignes laissées de côté : ${[...repasInconnus].slice(0, 4).join(", ")}. Écris petit déjeuner, collation matin, déjeuner, collation ou dîner.`
    )
  }
  if (lignes.length === 0) {
    return {
      ok: false,
      message:
        repasInconnus.size > 0
          ? `Aucun repas reconnu dans la colonne « Repas » (lu : ${[...repasInconnus].slice(0, 3).join(", ")}). Écris petit déjeuner, déjeuner, dîner ou collation.`
          : "Aucun plat trouvé sous la ligne de titres. Vérifie que la colonne « Plat » est remplie.",
    }
  }

  // Un journal daté couvre plus de deux semaines : les jours les plus récents remplissent le plan,
  // la semaine 1 d'abord, puis la semaine 2.
  const date = lignes.some((l) => l.date !== null)
  const semaineDeLaDate = new Map<string, number>()
  if (date) {
    const prises = new Set<string>()
    const dates = [...new Set(lignes.map((l) => l.date).filter((d): d is string => d !== null))].sort().reverse()
    for (const iso of dates) {
      const jour = lireJour(iso)!
      const semaine = [1, 2].find((s) => !prises.has(`${s}-${jour}`))
      if (!semaine) continue
      prises.add(`${semaine}-${jour}`)
      semaineDeLaDate.set(iso, semaine)
    }
    if (dates.length > semaineDeLaDate.size) {
      remarques.push("Journal daté : seuls les 14 jours les plus récents servent de menus, sur deux semaines.")
    }
  }

  const sansSemaine = !date && col.semaine === undefined
  const horsPlan = lignes.some((l) => !date && l.semaine !== null && l.semaine > 2)
  if (horsPlan) remarques.push("Le plan de l'application tourne sur 2 semaines : les semaines 3 et suivantes sont laissées de côté.")

  // Lignes regroupées par case du plan. Celles sans jour ne vont que dans les recettes.
  const parCase = new Map<string, { semaines: (1 | 2)[]; jour: Jour; slot: Slot; lignes: LigneLue[] }>()
  const libres: LigneLue[] = []
  for (const ligne of lignes) {
    if (ligne.jour === null) {
      libres.push(ligne)
      continue
    }
    let semaines: (1 | 2)[]
    if (date) {
      const semaine = ligne.date ? semaineDeLaDate.get(ligne.date) : undefined
      if (!semaine) continue
      semaines = [semaine as 1 | 2]
    } else if (ligne.semaine === null) semaines = [1, 2]
    else if (ligne.semaine > 2) continue
    else semaines = [ligne.semaine as 1 | 2]

    const cle = `${semaines.join("")}-${ligne.jour}-${ligne.slot}`
    const groupe = parCase.get(cle)
    if (groupe) groupe.lignes.push(ligne)
    else parCase.set(cle, { semaines, jour: ligne.jour, slot: ligne.slot, lignes: [ligne] })
  }

  // Un même plat (même nom, même repas) n'est créé qu'une fois, même s'il revient plusieurs jours.
  const plats: PlatImporte[] = []
  const indices = new Map<string, number>()
  const estimes: string[] = []
  const sansCalories: string[] = []

  const ranger = (brut: ReturnType<typeof composerPlat>) => {
    const cle = `${normaliser(brut.nom)}|${brut.slot}`
    const connu = indices.get(cle)
    if (connu !== undefined) {
      // Le plat a pu être nommé une première fois sans ses valeurs : on complète.
      const plat = plats[connu]!
      if (plat.kcal === 0 && brut.kcal) plat.kcal = Math.round(brut.kcal)
      if (plat.proteines_g === 0 && brut.proteines_g) plat.proteines_g = Math.round(brut.proteines_g)
      if (plat.ingredients.length === 0) plat.ingredients = brut.ingredients
      plat.recette_md ??= brut.recette_md
      return connu
    }
    if (plats.length >= PLATS_MAX) return null
    // Le même plat servi à un autre repas (un dîner repris au déjeuner) : dans l'application,
    // un plat appartient à un repas, donc il est créé une seconde fois, avec les mêmes valeurs.
    const jumeau = brut.kcal === null ? plats.find((plat) => normaliser(plat.nom) === normaliser(brut.nom)) : undefined
    if (jumeau) brut = { ...jumeau, slot: brut.slot }
    plats.push({
      ...brut,
      nom: brut.nom.slice(0, 90),
      kcal: brut.kcal === null ? 0 : Math.round(brut.kcal),
      proteines_g: brut.proteines_g === null ? 0 : Math.round(brut.proteines_g),
    })
    indices.set(cle, plats.length - 1)
    return plats.length - 1
  }

  const cases: CaseImportee[] = []
  let tropDePlats = false
  for (const groupe of parCase.values()) {
    const plat = ranger(composerPlat(groupe.lignes))
    if (plat === null) {
      tropDePlats = true
      continue
    }
    for (const semaine of groupe.semaines) cases.push({ semaine, jour: groupe.jour, slot: groupe.slot, plat })
  }
  for (const ligne of libres) if (ranger(composerPlat([ligne])) === null) tropDePlats = true

  // Calories absentes : estimées d'après les ingrédients quand la table d'aliments les connaît.
  for (const plat of plats) {
    if (plat.kcal > 0) continue
    const estimation = plat.ingredients.length > 0 ? estimerPlat(plat.ingredients) : null
    if (estimation && estimation.kcal > 0) {
      plat.kcal = estimation.kcal
      if (plat.proteines_g === 0) plat.proteines_g = estimation.proteines
      estimes.push(plat.nom)
    } else sansCalories.push(plat.nom)
  }

  const citer = (noms: string[]) =>
    noms.length > 4 ? `${noms.slice(0, 4).join(", ")} et ${noms.length - 4} de plus` : noms.join(", ")
  if (estimes.length > 0) remarques.push(`Calories estimées d'après les ingrédients : ${citer(estimes)}.`)
  if (sansCalories.length > 0) {
    remarques.push(`Sans calories dans le fichier, à compléter ensuite dans Recettes : ${citer(sansCalories)}.`)
  }
  if (tropDePlats) remarques.push(`Plus de ${PLATS_MAX} plats différents : les suivants sont laissés de côté.`)
  if (cases.length === 0) {
    remarques.push(
      col.jour === undefined
        ? "Pas de colonne « Jour » : les plats rejoignent tes recettes, sans toucher aux menus."
        : "Aucun jour reconnu : les plats rejoignent tes recettes, sans toucher aux menus."
    )
  } else if (sansSemaine) {
    remarques.push("Pas de colonne « Semaine » : le menu est appliqué aux deux semaines du plan.")
  }

  // Dans l'ordre du plan : semaine, puis jour.
  cases.sort((a, b) => a.semaine - b.semaine || JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour))
  return { ok: true, plats, cases, remarques }
}
