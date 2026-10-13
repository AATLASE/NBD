// Transforme un tableau de tableur en séances prêtes à être ajoutées au programme.
//
// Deux sortes de fichiers sont comprises :
// - un programme, une ligne par exercice (le modèle proposé par l'application) ;
// - un journal d'entraînement, une ligne par série faite, tel que l'exportent Strong et Hevy.
//   La dernière fois que chaque séance a été faite sert alors de modèle, avec ses charges.
// Fonctions pures : rien n'est écrit ici.

import {
  cellule,
  lireDate,
  lireDureeMin,
  lireDureeSec,
  lireEntier,
  lireJour,
  lireLieu,
  lireNombre,
  lireRepetitions,
  normaliser,
  trouverEntetes,
  type Tableau,
} from "@/lib/import/colonnes"
import { EQUIPEMENTS, GROUPES, type Jour } from "@/lib/libelles"
import type { ExercicePropose } from "@/lib/proposition/schemas"

export const SEANCES_MAX = 20
export const EXERCICES_MAX = 20

export type SeanceImportee = {
  nom: string
  lieu: "salle" | "maison" | "exterieur"
  duree_min: number
  jour: Jour | null
  note: string | null
  exercices: ExercicePropose[]
}

export type LectureSeances =
  | { ok: true; seances: SeanceImportee[]; remarques: string[]; journal: boolean }
  | { ok: false; message: string }

const ALIAS = {
  seance: ["seance", "nom de la seance", "nom seance", "session", "workout name", "workout", "title", "routine", "routine name", "routine title", "entrainement", "programme"],
  date: ["date", "start time", "date de debut", "debut"],
  fin: ["end time", "date de fin", "fin"],
  jour: ["jour", "day", "jour suggere", "jour de la semaine", "weekday"],
  lieu: ["lieu", "location", "endroit"],
  dureeSeance: ["duree seance", "duree de la seance", "duree min", "workout duration", "duration", "duree"],
  noteSeance: ["note seance", "note de la seance", "workout notes", "description"],
  exercice: ["exercice", "exercise", "exercise name", "exercise title", "nom de l exercice", "nom exercice", "mouvement", "nom"],
  groupe: ["groupe", "groupe musculaire", "muscle", "muscles", "muscle group", "body part", "partie du corps"],
  equipement: ["equipement", "materiel", "equipment"],
  series: ["series", "sets", "nb series", "nombre de series", "nb de series", "tours", "serie"],
  rang: ["set order", "set index", "set number", "set", "numero de serie", "n serie", "no serie"],
  typeSerie: ["set type", "type de serie"],
  reps: ["repetitions", "reps", "rep", "repetition", "nb reps", "nombre de repetitions"],
  repsMin: ["reps min", "repetitions min", "min reps"],
  repsMax: ["reps max", "repetitions max", "max reps"],
  duree: ["seconds", "duration seconds", "duree s", "duree sec", "duree exercice", "temps", "temps sec"],
  charge: ["charge", "poids", "weight", "charge depart", "charge de depart", "weight kg", "weight lbs", "weight lb", "kg"],
  uniteCharge: ["weight unit", "unite", "unite de charge", "unite poids"],
  chargeCible: ["charge cible", "charge objectif", "objectif", "cible"],
  repos: ["repos", "rest", "recuperation", "recup", "rest seconds", "rest time", "temps de repos"],
  note: ["note", "notes", "exercise notes", "commentaire", "commentaires", "consigne", "consignes"],
} as const

type Champ = keyof typeof ALIAS

// --- Groupe musculaire et matériel, devinés d'après le nom ---------------------------

type Groupe = (typeof GROUPES)[number]
type Equipement = (typeof EQUIPEMENTS)[number]

// Chaque règle se lit en début de mot (« velo » ne doit pas se reconnaître dans « développé »),
// et, du plus précis au plus général, la première qui reconnaît le nom l'emporte.
const debutDeMot = (mots: string) => new RegExp(`\\b(?:${mots})`)

const GROUPE_PAR_MOT: [RegExp, Groupe][] = [
  [debutDeMot("cheville|ankle|tibial|orteil|plantaire|voute plantaire"), "pied"],
  [debutDeMot("gainage|planche|plank|crunch|abdo|abs?\\b|sit up|releve de jambes|leg raise|russian twist|hollow|dead bug|pallof|ab wheel|roue abdominale|bird dog|mountain climber|oblique|farmer"), "gainage"],
  [debutDeMot("echelle|ladder|agilite|pliometrie|saut|jump|skipping|bondissement"), "agilite"],
  [debutDeMot("course|run|tapis|treadmill|velo|bike|cycling|rameur|rowing machine|elliptique|corde a sauter|burpee|cardio|marche|walking|hiit|stair"), "cardio"],
  [debutDeMot("squat|fente|lunge|presse a cuisses|leg press|leg extension|leg curl|ischio|hamstring|quadriceps|souleve de terre|deadlift|hip thrust|fessier|glute|good morning|step up|adducteur|abducteur|jambe|cuisse|bulgare|pistol|mollet|calf|calves"), "jambes"],
  [debutDeMot("developpe couche|developpe incline|developpe decline|bench press|incline press|chest|pectora|pompe|push up|pushup|ecarte|fly\\b|flyes|pec deck|dips?\\b"), "pectoraux"],
  [debutDeMot("developpe militaire|developpe epaule|overhead press|shoulder|epaule|elevation|lateral raise|front raise|face pull|oiseau|arnold|military press|ohp\\b|upright row|rowing menton|handstand"), "epaules"],
  [debutDeMot("traction|pull up|pullup|chin up|tirage|pulldown|pull down|rowing|row\\b|dos\\b|lats?\\b|shrug|trapeze|lombaire|back extension|hyperextension|pull over|pullover"), "dos"],
  [debutDeMot("curl|biceps?|triceps?|extension nuque|barre au front|skull|kickback|avant bras|forearm|poignet|wrist|marteau|hammer"), "bras"],
]

const EQUIPEMENT_PAR_MOT: [RegExp, Equipement][] = [
  [debutDeMot("kettlebell|kb\\b"), "kettlebell"],
  [debutDeMot("haltere|dumbbell|db\\b"), "halteres"],
  [debutDeMot("poulie|cable|tirage|pulldown|pull down|face pull"), "poulie"],
  [debutDeMot("machine|presse|leg press|leg extension|leg curl|smith|pec deck|guidee"), "machine"],
  [debutDeMot("barre|barbell|bb\\b|developpe couche|bench press|souleve de terre|deadlift|squat"), "barre"],
  [debutDeMot("traction|pull up|pullup|chin up|pompe|push up|pushup|dips?\\b|gainage|planche|plank|poids du corps|bodyweight|crunch|burpee"), "poids_du_corps"],
]

// La base exige un groupe : faute de mieux, celui-ci, et l'aperçu le signale.
const GROUPE_PAR_DEFAUT: Groupe = "gainage"

function deviner<T>(nom: string, regles: [RegExp, T][]): T | null {
  const cle = normaliser(nom)
  return regles.find(([motif]) => motif.test(cle))?.[1] ?? null
}

const dansLaListe = <T extends string>(liste: readonly T[], texte: string): T | null => {
  const cle = normaliser(texte).replace(/ /g, "_")
  return liste.find((valeur) => valeur === cle || valeur === `${cle}s`) ?? null
}

// --- Lecture ---------------------------------------------------------------------

type LigneLue = {
  exercice: string
  groupe: string
  equipement: string
  series: number | null
  echauffement: boolean
  repsMin: number | null
  repsMax: number | null
  dureeSec: number | null
  chargeKg: number | null
  cibleKg: number | null
  reposSec: number | null
  note: string
}

type Brouillon = {
  nom: string
  date: string | null
  jour: Jour | null
  lieu: SeanceImportee["lieu"] | null
  dureeMin: number | null
  note: string
  lignes: LigneLue[]
}

const LIVRES_EN_KG = 0.45359237
const auDemi = (kg: number) => Math.round(kg * 2) / 2

function composerExercice(lignes: LigneLue[], seriesParDefaut: number) {
  const premiere = lignes[0]!
  // Une colonne « Série » qui compte 1, 2, 3 d'une ligne à l'autre numérote les séries :
  // elle ne dit pas combien il y en a.
  const numerotees = lignes.length > 1 && new Set(lignes.map((ligne) => ligne.series)).size === lignes.length
  const comptee = numerotees ? undefined : lignes.find((ligne) => ligne.series !== null)
  // Une ligne par série : les séries d'échauffement ne font pas partie de la prescription.
  const travail = lignes.filter((ligne) => !ligne.echauffement)
  const utiles = comptee ? [comptee] : travail.length > 0 ? travail : lignes

  const reps = utiles.flatMap((l) => [l.repsMin, l.repsMax]).filter((n): n is number => n !== null && n > 0)
  const durees = utiles.map((l) => l.dureeSec).filter((n): n is number => n !== null && n > 0)
  const charges = utiles.map((l) => l.chargeKg).filter((n): n is number => n !== null && n > 0)
  const cibles = utiles.map((l) => l.cibleKg).filter((n): n is number => n !== null && n > 0)
  const depart = charges.length > 0 ? Math.max(...charges) : null
  const aDuree = reps.length === 0 && durees.length > 0

  const groupeDit = lignes.find((l) => l.groupe)?.groupe ?? ""
  const equipementDit = lignes.find((l) => l.equipement)?.equipement ?? ""
  const groupe =
    dansLaListe(GROUPES, groupeDit) ?? deviner(groupeDit, GROUPE_PAR_MOT) ?? deviner(premiere.exercice, GROUPE_PAR_MOT)

  const exercice: ExercicePropose = {
    nom: premiere.exercice,
    groupe: groupe ?? GROUPE_PAR_DEFAUT,
    equipement:
      dansLaListe(EQUIPEMENTS, equipementDit) ??
      deviner(equipementDit, EQUIPEMENT_PAR_MOT) ??
      deviner(premiere.exercice, EQUIPEMENT_PAR_MOT) ??
      "aucun",
    series: comptee?.series ?? (lignes.length > 1 ? utiles.length : seriesParDefaut),
    reps_min: aDuree || reps.length === 0 ? null : Math.min(...reps),
    reps_max: aDuree || reps.length === 0 ? null : Math.max(...reps),
    duree_sec: aDuree ? Math.max(...durees) : null,
    repos_sec: lignes.find((l) => l.reposSec !== null)?.reposSec ?? 90,
    charge_depart_kg: depart,
    charge_cible_kg: depart !== null && cibles.length > 0 ? Math.max(depart, ...cibles) : null,
    increment_kg: null,
    note: lignes.find((l) => l.note)?.note || null,
  }
  return { exercice, groupeReconnu: groupe !== null }
}

// Hevy donne l'heure de début et l'heure de fin de chaque séance.
function minutesEntre(debut: string, fin: string) {
  const [a, b] = [debut, fin].map((texte) => new Date(texte.replace(",", "")).getTime())
  const minutes = Math.round((b! - a!) / 60_000)
  return Number.isFinite(minutes) && minutes >= 5 && minutes <= 300 ? minutes : null
}

// Durée probable d'une séance dont le fichier ne dit rien : le travail, les repos, et la mise en place.
function estimerDuree(exercices: ExercicePropose[]) {
  const secondes = exercices.reduce((total, e) => total + e.series * ((e.duree_sec ?? 40) + e.repos_sec), 0)
  return Math.min(180, Math.max(10, Math.round((secondes / 60 + 5) / 5) * 5))
}

export function lireSeances(tableau: Tableau, nomDuFichier: string): LectureSeances {
  const entetes = trouverEntetes<Champ>(tableau, ALIAS, ["exercice"])
  if (!entetes) {
    return {
      ok: false,
      message:
        "Colonne « Exercice » introuvable. Il faut une ligne de titres avec au moins « Exercice » ; télécharge le modèle pour voir les colonnes attendues.",
    }
  }
  const { colonnes: col } = entetes
  const lire = (ligne: string[], champ: Champ) => cellule(ligne, col[champ])
  const remarques: string[] = []

  // Un journal a une date par ligne ; un programme, non.
  const journal = col.date !== undefined
  const enteteCharge = col.charge === undefined ? "" : normaliser(entetes.entetes[col.charge] ?? "")
  const chargeEnLivres = /\blbs?\b/.test(enteteCharge)
  const nomParDefaut = nomDuFichier.replace(/\.[a-z0-9]+$/i, "").trim().slice(0, 60) || "Séance importée"

  const brouillons = new Map<string, Brouillon>()
  let converties = false
  let courant: Brouillon | null = null
  let sansNom = 0

  for (const ligne of tableau.slice(entetes.ligne + 1)) {
    const exercice = lire(ligne, "exercice")
    // Dans un programme, le nom de la séance n'est souvent écrit que sur sa première ligne.
    const nomSeance: string = lire(ligne, "seance") || (journal ? "" : (courant?.nom ?? "")) || nomParDefaut
    const date = journal ? lire(ligne, "date") : ""

    const cle = journal ? `${nomSeance}\u0000${date}` : normaliser(nomSeance)
    let brouillon = brouillons.get(cle)
    if (!brouillon) {
      brouillon = { nom: nomSeance, date: date || null, jour: null, lieu: null, dureeMin: null, note: "", lignes: [] }
      brouillons.set(cle, brouillon)
    }
    courant = brouillon
    brouillon.jour ??= lireJour(lire(ligne, "jour"))
    brouillon.lieu ??= lireLieu(lire(ligne, "lieu"))
    brouillon.dureeMin ??= lireDureeMin(lire(ligne, "dureeSeance")) ?? minutesEntre(date, lire(ligne, "fin"))
    // Les notes d'un journal racontent un jour précis : elles n'ont pas leur place dans un modèle.
    if (!journal) brouillon.note ||= lire(ligne, "noteSeance")

    if (!exercice) {
      sansNom += 1
      continue
    }

    const repetitions = lireRepetitions(lire(ligne, "reps"))
    const enLivres = chargeEnLivres || /^lbs?$/.test(normaliser(lire(ligne, "uniteCharge")))
    const enKg = (texte: string) => {
      const valeur = lireNombre(texte)
      if (valeur === null || !enLivres) return valeur
      converties = true
      return auDemi(valeur * LIVRES_EN_KG)
    }
    brouillon.lignes.push({
      exercice,
      groupe: lire(ligne, "groupe"),
      equipement: lire(ligne, "equipement"),
      series: lireEntier(lire(ligne, "series")) ?? repetitions.series,
      echauffement: /warm|echauff|^w$/.test(normaliser(`${lire(ligne, "typeSerie")} ${lire(ligne, "rang")}`).trim()),
      repsMin: lireEntier(lire(ligne, "repsMin")) ?? repetitions.repsMin,
      repsMax: lireEntier(lire(ligne, "repsMax")) ?? repetitions.repsMax,
      dureeSec: lireDureeSec(lire(ligne, "duree")) ?? repetitions.dureeSec,
      chargeKg: enKg(lire(ligne, "charge")),
      cibleKg: enKg(lire(ligne, "chargeCible")),
      reposSec: lireDureeSec(lire(ligne, "repos")),
      note: lire(ligne, "note"),
    })
  }

  // Journal : pour chaque nom de séance, on ne garde que la fois la plus récente.
  let retenus = [...brouillons.values()].filter((b) => b.lignes.length > 0)
  if (journal) {
    const derniers = new Map<string, Brouillon>()
    for (const brouillon of retenus) {
      const cle = normaliser(brouillon.nom)
      const connu = derniers.get(cle)
      const [a, b] = [lireDate(brouillon.date ?? ""), lireDate(connu?.date ?? "")]
      if (!connu || (a !== null && b !== null ? a >= b : true)) derniers.set(cle, brouillon)
    }
    const occurrences = retenus.length
    retenus = [...derniers.values()]
    remarques.push(
      `Journal d'entraînement reconnu (${occurrences} séance${occurrences > 1 ? "s" : ""} faite${occurrences > 1 ? "s" : ""}) : la dernière fois que chaque séance a été faite sert de modèle, avec les charges de ce jour-là. L'historique lui-même n'est pas importé.`
    )
  }

  if (retenus.length === 0) {
    return { ok: false, message: "Aucun exercice trouvé sous la ligne de titres. Vérifie que la colonne « Exercice » est remplie." }
  }
  if (retenus.length > SEANCES_MAX) {
    remarques.push(`Le fichier contient ${retenus.length} séances : seules les ${SEANCES_MAX} premières sont proposées.`)
    retenus = retenus.slice(0, SEANCES_MAX)
  }

  const sansSeries = new Set<string>()
  const groupeIncertain = new Set<string>()
  const coupees: string[] = []
  // Sans colonne qui compte les séries, une ligne seule vaut une série faite dans un journal,
  // et trois séries dans un programme.
  const parDefaut = journal || col.rang !== undefined ? 1 : 3

  const seances = retenus.map((brouillon): SeanceImportee => {
    const groupes = new Map<string, LigneLue[]>()
    for (const ligne of brouillon.lignes) {
      const cle = normaliser(ligne.exercice)
      groupes.set(cle, [...(groupes.get(cle) ?? []), ligne])
    }
    if (groupes.size > EXERCICES_MAX) coupees.push(brouillon.nom)

    const exercices = [...groupes.values()].slice(0, EXERCICES_MAX).map((lignes) => {
      const { exercice, groupeReconnu } = composerExercice(lignes, parDefaut)
      if (lignes.length === 1 && lignes[0]!.series === null && parDefaut === 3) sansSeries.add(exercice.nom)
      if (!groupeReconnu) groupeIncertain.add(exercice.nom)
      return exercice
    })

    return {
      nom: brouillon.nom.slice(0, 60),
      lieu: brouillon.lieu ?? "salle",
      duree_min: brouillon.dureeMin !== null && brouillon.dureeMin >= 5 ? Math.min(180, Math.max(10, brouillon.dureeMin)) : estimerDuree(exercices),
      jour: brouillon.jour,
      note: brouillon.note.slice(0, 500) || null,
      exercices,
    }
  })

  const citer = (noms: Iterable<string>) => {
    const liste = [...noms]
    return liste.length > 4 ? `${liste.slice(0, 4).join(", ")} et ${liste.length - 4} de plus` : liste.join(", ")
  }
  if (sansSeries.size > 0) remarques.push(`Nombre de séries absent, mis à 3 : ${citer(sansSeries)}.`)
  if (groupeIncertain.size > 0) {
    remarques.push(
      `Groupe musculaire non reconnu, rangé dans « Gainage » : ${citer(groupeIncertain)}. Ajoute une colonne « Groupe » au fichier pour le préciser.`
    )
  }
  if (coupees.length > 0) remarques.push(`Plus de ${EXERCICES_MAX} exercices, liste raccourcie : ${citer(coupees)}.`)
  if (sansNom > 0 && !journal) {
    remarques.push(`${sansNom} ligne${sansNom > 1 ? "s" : ""} sans nom d'exercice, laissée${sansNom > 1 ? "s" : ""} de côté.`)
  }
  if (converties) remarques.push("Charges en livres converties en kilos, arrondies au demi-kilo.")

  return { ok: true, seances, remarques, journal }
}
