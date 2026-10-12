"use server"

import { validerReponses } from "@/lib/accueil"
import { calculerCibles } from "@/lib/cibles"
import { LIGNES_MAX_DU_CHAT, TABLES_DU_CHAT, type DonneesMessage } from "@/lib/chat/types"
import { cleDe, composerListe, type IngredientDePlat } from "@/lib/courses"
import type { Json } from "@/lib/database.types"
import { dateCourte, duree, nombre } from "@/lib/format"
import { EQUIPEMENTS, GROUPES, JOURS, LIBELLE_SLOT, LIEUX } from "@/lib/libelles"
import { lireContexte } from "@/lib/proposition/contexte"
import { nettoyerNutrition, nettoyerSport, repartirSurDeuxSemaines } from "@/lib/proposition/garde-fous"
import { PropositionNutritionSchema, PropositionSportSchema } from "@/lib/proposition/schemas"
import { createClient } from "@/lib/supabase/server"

// Couche d'écriture unique (SPEC section 4). Aucun composant n'écrit en base directement :
// tout passe par ici, et chaque écriture laisse une trace dans change_log, annulable.

type Client = Awaited<ReturnType<typeof createClient>>

export type ResultatMutation = { ok: true; changeLogId: string } | { ok: false; message: string }

// `groupeId` identifie l'action dans l'historique : c'est lui qu'on passe à `annuler`.
// `id` est la ligne créée, quand l'action en crée une.
// `enAttente` : pas de réseau, la saisie est gardée sur le téléphone et partira plus tard.
export type ResultatEdition =
  | { ok: true; groupeId: string; resume: string; id?: string }
  | { ok: false; message: string; enAttente?: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

const INVALIDE: ResultatEdition = { ok: false, message: "Modification invalide : rien n'a été changé." }
const INTROUVABLE: ResultatEdition = { ok: false, message: "Élément introuvable. Recharge la page." }
const SANS_EFFET: ResultatEdition = { ok: false, message: "Rien à modifier." }

function echec(erreur: { code?: string }): ResultatEdition {
  return {
    ok: false,
    message:
      erreur.code === "28000"
        ? "Session expirée. Reconnecte-toi."
        : "Modification impossible. Rien n'a été changé, réessaie.",
  }
}

// --- Validation ------------------------------------------------------------

type Regle = (valeur: unknown) => boolean

const entier =
  (min: number, max: number): Regle =>
  (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
const decimal =
  (min: number, max: number): Regle =>
  (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
const texte =
  (min: number, max: number): Regle =>
  (v) =>
    typeof v === "string" && v.trim().length >= min && v.length <= max
const parmi =
  (valeurs: readonly string[]): Regle =>
  (v) =>
    typeof v === "string" && valeurs.includes(v)
const ouNul =
  (regle: Regle): Regle =>
  (v) =>
    v === null || regle(v)

// Ne garde que les champs connus et valides. Un champ inconnu ou hors bornes invalide tout.
function nettoyer(champs: unknown, regles: Record<string, Regle>) {
  if (typeof champs !== "object" || champs === null) return null
  const propres: Record<string, unknown> = {}
  for (const [cle, valeur] of Object.entries(champs)) {
    const regle = regles[cle]
    if (!regle || !regle(valeur)) return null
    propres[cle] = typeof valeur === "string" ? valeur.trim() : valeur
  }
  return propres
}

// --- Application -------------------------------------------------------------

type Changement = {
  table:
    | "workouts"
    | "workout_exercises"
    | "exercises"
    | "meals"
    | "meal_plan"
    | "foot_logs"
    | "running_logs"
    | "running_plan"
    | "body_metrics"
    | "meal_logs"
    | "profiles"
    | "grocery_items"
    | "grocery_list_items"
  operation: "insert" | "update" | "delete"
  id: string
  data?: Record<string, unknown>
}

async function appliquer(
  supabase: Client,
  changements: Changement[],
  resume: string,
  id?: string
): Promise<ResultatEdition> {
  const { data, error } = await supabase.rpc("appliquer_changements", {
    p_changements: changements as unknown as Json,
    p_resume: resume,
    p_source: "user",
  })
  if (error) return echec(error)
  return { ok: true, groupeId: data, resume, id }
}

export async function annuler(groupeId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!UUID.test(groupeId)) return { ok: false, message: "Annulation invalide." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("annuler_changement", { p_groupe: groupeId })
  if (!error) return { ok: true }
  return {
    ok: false,
    message:
      error.code === "23503"
        ? "Annulation impossible : cet élément est utilisé ailleurs depuis."
        : error.code === "P0002"
          ? "Annulation impossible : l'élément n'existe plus ou a déjà été rétabli."
          : "Annulation impossible. Réessaie.",
  }
}

// --- Séances : exercices -------------------------------------------------------

const REGLES_LIGNE: Record<string, Regle> = {
  series: entier(1, 20),
  reps_min: ouNul(entier(1, 200)),
  reps_max: ouNul(entier(1, 200)),
  duree_sec: ouNul(entier(5, 3600)),
  repos_sec: entier(0, 900),
  charge_depart_kg: ouNul(decimal(0, 1000)),
  charge_cible_kg: ouNul(decimal(0, 1000)),
  increment_kg: ouNul(decimal(0.25, 100)),
  note: ouNul(texte(0, 300)),
  bloc: parmi(["series", "circuit"]),
}

export type ChampsLigne = Partial<{
  series: number
  reps_min: number | null
  reps_max: number | null
  duree_sec: number | null
  repos_sec: number
  charge_depart_kg: number | null
  charge_cible_kg: number | null
  increment_kg: number | null
  note: string | null
  bloc: "series" | "circuit"
}>

const kg = (v: unknown) => (v === null ? "aucune" : `${nombre(v as number)} kg`)
const secondes = (v: unknown) => (v === null ? "aucune" : duree(v as number))
const brut = (v: unknown) => (v === null ? "aucun" : String(v))

const DESCRIPTION_LIGNE: Record<string, { nom: string; valeur?: (v: unknown) => string }> = {
  series: { nom: "séries", valeur: brut },
  reps_min: { nom: "reps mini", valeur: brut },
  reps_max: { nom: "reps maxi", valeur: brut },
  duree_sec: { nom: "durée", valeur: secondes },
  repos_sec: { nom: "repos", valeur: secondes },
  charge_depart_kg: { nom: "charge de départ", valeur: kg },
  charge_cible_kg: { nom: "charge cible", valeur: kg },
  increment_kg: { nom: "incrément", valeur: kg },
  note: { nom: "note" },
  bloc: { nom: "type de bloc" },
}

// « charge de départ 80 kg → 85 kg » pour un seul champ, sinon la liste des champs touchés.
function decrire(
  modifies: [string, unknown][],
  avant: Record<string, unknown>,
  descriptions: Record<string, { nom: string; valeur?: (v: unknown) => string }>
) {
  if (modifies.length === 1) {
    const [cle, apres] = modifies[0]!
    const description = descriptions[cle]!
    return description.valeur
      ? `${description.nom} ${description.valeur(avant[cle])} → ${description.valeur(apres)}`
      : `${description.nom} modifié${description.nom.endsWith("e") ? "e" : ""}`
  }
  return `${modifies.map(([cle]) => descriptions[cle]!.nom).join(", ")} modifiés`
}

export async function modifierLigne(id: string, champs: ChampsLigne): Promise<ResultatEdition> {
  const propres = nettoyer(champs, REGLES_LIGNE)
  if (!UUID.test(id) || !propres) return INVALIDE
  // Une note vidée redevient une absence de note.
  if (propres.note === "") propres.note = null

  const supabase = await createClient()
  const { data: ligne } = await supabase
    .from("workout_exercises")
    .select("*, exercise:exercises(nom), workout:workouts(code)")
    .eq("id", id)
    .maybeSingle()
  if (!ligne) return INTROUVABLE

  const actuel = ligne as unknown as Record<string, unknown>
  const modifies = Object.entries(propres).filter(([cle, valeur]) => actuel[cle] !== valeur)
  if (modifies.length === 0) return SANS_EFFET

  const fusion = { ...actuel, ...propres }
  if (
    typeof fusion.reps_min === "number" &&
    typeof fusion.reps_max === "number" &&
    fusion.reps_min > fusion.reps_max
  ) {
    return { ok: false, message: "Le minimum de reps dépasse le maximum." }
  }

  return appliquer(
    supabase,
    [{ table: "workout_exercises", operation: "update", id, data: Object.fromEntries(modifies) }],
    `${ligne.exercise.nom} (séance ${ligne.workout.code}) : ${decrire(modifies, actuel, DESCRIPTION_LIGNE)}`
  )
}

export async function retirerExercice(id: string): Promise<ResultatEdition> {
  if (!UUID.test(id)) return INVALIDE
  const supabase = await createClient()
  const { data: ligne } = await supabase
    .from("workout_exercises")
    .select("archived, exercise:exercises(nom), workout:workouts(code)")
    .eq("id", id)
    .maybeSingle()
  if (!ligne || ligne.archived) return INTROUVABLE

  return appliquer(
    supabase,
    [{ table: "workout_exercises", operation: "update", id, data: { archived: true } }],
    `${ligne.exercise.nom} retiré de la séance ${ligne.workout.code}`
  )
}

// Paramètres d'un exercice tout juste ajouté. Il s'ouvre aussitôt en édition pour être réglé.
const NOUVELLE_LIGNE = { series: 3, reps_min: 8, reps_max: 12 }

const REGLES_EXERCICE: Record<string, Regle> = {
  nom: texte(2, 60),
  groupe: parmi(GROUPES),
  equipement: parmi(EQUIPEMENTS),
}

export type NouvelExercice = { nom: string; groupe: string; equipement: string }

export async function ajouterExercice(
  workoutId: string,
  source: { exerciseId: string } | NouvelExercice
): Promise<ResultatEdition> {
  if (!UUID.test(workoutId)) return INVALIDE
  const supabase = await createClient()

  const { data: seance } = await supabase
    .from("workouts")
    .select("code, workout_exercises(ordre)")
    .eq("id", workoutId)
    .maybeSingle()
  if (!seance) return INTROUVABLE

  const changements: Changement[] = []
  let exerciseId: string
  let nom: string

  if ("exerciseId" in source) {
    if (!UUID.test(source.exerciseId)) return INVALIDE
    const { data: exercice } = await supabase
      .from("exercises")
      .select("nom")
      .eq("id", source.exerciseId)
      .maybeSingle()
    if (!exercice) return INTROUVABLE
    exerciseId = source.exerciseId
    nom = exercice.nom
  } else {
    const propre = nettoyer(source, REGLES_EXERCICE)
    if (!propre || Object.keys(propre).length !== 3) return INVALIDE
    exerciseId = crypto.randomUUID()
    nom = propre.nom as string
    changements.push({ table: "exercises", operation: "insert", id: exerciseId, data: propre })
  }

  // Après le dernier, lignes retirées comprises : un exercice rétabli garde ainsi sa place.
  const ordre = Math.max(0, ...seance.workout_exercises.map((l) => l.ordre)) + 1
  const ligneId = crypto.randomUUID()
  changements.push({
    table: "workout_exercises",
    operation: "insert",
    id: ligneId,
    data: { workout_id: workoutId, exercise_id: exerciseId, ordre, ...NOUVELLE_LIGNE },
  })

  return appliquer(supabase, changements, `${nom} ajouté à la séance ${seance.code}`, ligneId)
}

export async function reordonnerSeance(workoutId: string, ordreIds: string[]): Promise<ResultatEdition> {
  if (!UUID.test(workoutId) || !Array.isArray(ordreIds) || !ordreIds.every((id) => UUID.test(id))) {
    return INVALIDE
  }
  const supabase = await createClient()
  const { data: seance } = await supabase
    .from("workouts")
    .select("code, workout_exercises(id, ordre, archived)")
    .eq("id", workoutId)
    .order("ordre", { referencedTable: "workout_exercises" })
    .maybeSingle()
  if (!seance) return INTROUVABLE

  const actives = seance.workout_exercises.filter((l) => !l.archived)
  const memeEnsemble =
    actives.length === ordreIds.length &&
    new Set(ordreIds).size === ordreIds.length &&
    actives.every((l) => ordreIds.includes(l.id))
  if (!memeEnsemble) return INVALIDE

  // On redistribue les rangs existants au lieu de renuméroter : les lignes retirées gardent
  // un rang qui leur est propre, et reviennent à leur place si on les rétablit.
  const rangs = actives.map((l) => l.ordre)
  const changements: Changement[] = ordreIds.flatMap((id, index) => {
    const ligne = actives.find((l) => l.id === id)!
    return ligne.ordre === rangs[index]
      ? []
      : [{ table: "workout_exercises", operation: "update", id, data: { ordre: rangs[index] } }]
  })
  if (changements.length === 0) return SANS_EFFET

  return appliquer(supabase, changements, `Séance ${seance.code} : ordre des exercices modifié`)
}

// --- Séances ---------------------------------------------------------------------

const REGLES_SEANCE: Record<string, Regle> = {
  nom: texte(1, 60),
  code: texte(1, 8),
  lieu: parmi(LIEUX),
  duree_min: entier(5, 300),
  jour_suggere: ouNul(parmi(JOURS)),
  note: ouNul(texte(0, 500)),
  circuit_repos_tours_sec: ouNul(entier(0, 900)),
}

export type ChampsSeance = Partial<{
  nom: string
  code: string
  lieu: string
  duree_min: number
  jour_suggere: string | null
  note: string | null
  circuit_repos_tours_sec: number | null
}>

const DESCRIPTION_SEANCE: Record<string, { nom: string; valeur?: (v: unknown) => string }> = {
  nom: { nom: "nom" },
  code: { nom: "code", valeur: brut },
  lieu: { nom: "lieu", valeur: brut },
  duree_min: { nom: "durée", valeur: (v) => `${v} min` },
  jour_suggere: { nom: "jour", valeur: brut },
  note: { nom: "note" },
  circuit_repos_tours_sec: { nom: "repos entre les tours", valeur: secondes },
}

export async function modifierSeance(id: string, champs: ChampsSeance): Promise<ResultatEdition> {
  const propres = nettoyer(champs, REGLES_SEANCE)
  if (!UUID.test(id) || !propres) return INVALIDE
  // Une note vidée redevient une absence de note.
  if (propres.note === "") propres.note = null

  const supabase = await createClient()
  const { data: seance } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle()
  if (!seance) return INTROUVABLE

  const actuel = seance as unknown as Record<string, unknown>
  const modifies = Object.entries(propres).filter(([cle, valeur]) => actuel[cle] !== valeur)
  if (modifies.length === 0) return SANS_EFFET

  return appliquer(
    supabase,
    [{ table: "workouts", operation: "update", id, data: Object.fromEntries(modifies) }],
    `Séance ${seance.code} : ${decrire(modifies, actuel, DESCRIPTION_SEANCE)}`
  )
}

// Première lettre libre parmi les séances visibles, pour nommer une séance créée ou dupliquée.
function codeLibre(codes: string[]) {
  const pris = new Set(codes.map((c) => c.toUpperCase()))
  for (let i = 0; i < 26; i++) {
    const lettre = String.fromCharCode(65 + i)
    if (!pris.has(lettre)) return lettre
  }
  return `S${codes.length + 1}`
}

async function lireSeances(supabase: Client) {
  const { data } = await supabase.from("workouts").select("id, code, ordre, archived")
  const toutes = data ?? []
  return {
    code: codeLibre(toutes.filter((s) => !s.archived).map((s) => s.code)),
    ordre: Math.max(0, ...toutes.map((s) => s.ordre)) + 1,
  }
}

const NOUVELLE_SEANCE = { nom: "Nouvelle séance", lieu: "salle", duree_min: 45 }

export async function creerSeance(): Promise<ResultatEdition> {
  const supabase = await createClient()
  const { code, ordre } = await lireSeances(supabase)
  const id = crypto.randomUUID()
  return appliquer(
    supabase,
    [{ table: "workouts", operation: "insert", id, data: { ...NOUVELLE_SEANCE, code, ordre } }],
    `Séance ${code} créée`,
    id
  )
}

export async function dupliquerSeance(workoutId: string): Promise<ResultatEdition> {
  if (!UUID.test(workoutId)) return INVALIDE
  const supabase = await createClient()
  const { data: source } = await supabase
    .from("workouts")
    .select("*, workout_exercises(*)")
    .eq("id", workoutId)
    .maybeSingle()
  if (!source) return INTROUVABLE

  const { code, ordre } = await lireSeances(supabase)
  const id = crypto.randomUUID()
  const changements: Changement[] = [
    {
      table: "workouts",
      operation: "insert",
      id,
      data: {
        code,
        ordre,
        nom: `${source.nom} (copie)`.slice(0, 60),
        lieu: source.lieu,
        duree_min: source.duree_min,
        note: source.note,
        circuit_repos_tours_sec: source.circuit_repos_tours_sec,
      },
    },
    ...source.workout_exercises
      .filter((ligne) => !ligne.archived)
      .map(
        (ligne): Changement => ({
          table: "workout_exercises",
          operation: "insert",
          id: crypto.randomUUID(),
          data: {
            workout_id: id,
            exercise_id: ligne.exercise_id,
            ordre: ligne.ordre,
            bloc: ligne.bloc,
            series: ligne.series,
            reps_min: ligne.reps_min,
            reps_max: ligne.reps_max,
            duree_sec: ligne.duree_sec,
            repos_sec: ligne.repos_sec,
            charge_depart_kg: ligne.charge_depart_kg,
            charge_cible_kg: ligne.charge_cible_kg,
            increment_kg: ligne.increment_kg,
            note: ligne.note,
          },
        })
      ),
  ]

  return appliquer(supabase, changements, `Séance ${source.code} dupliquée en séance ${code}`, id)
}

export async function supprimerSeance(id: string): Promise<ResultatEdition> {
  if (!UUID.test(id)) return INVALIDE
  const supabase = await createClient()
  const { data: seance } = await supabase.from("workouts").select("code, archived").eq("id", id).maybeSingle()
  if (!seance || seance.archived) return INTROUVABLE

  return appliquer(
    supabase,
    [{ table: "workouts", operation: "update", id, data: { archived: true } }],
    `Séance ${seance.code} supprimée`
  )
}

// --- Plan de repas ----------------------------------------------------------------

export async function remplacerRepas(caseId: string, mealId: string | null): Promise<ResultatEdition> {
  if (!UUID.test(caseId) || (mealId !== null && !UUID.test(mealId))) return INVALIDE
  const supabase = await createClient()
  const { data: casePlan } = await supabase.from("meal_plan").select("*").eq("id", caseId).maybeSingle()
  if (!casePlan) return INTROUVABLE
  if (casePlan.meal_id === mealId) return SANS_EFFET

  let nom = "aucun repas"
  if (mealId) {
    const { data: repas } = await supabase.from("meals").select("nom, slot").eq("id", mealId).maybeSingle()
    if (!repas) return INTROUVABLE
    if (repas.slot !== casePlan.slot) {
      return { ok: false, message: "Ce plat n'est pas prévu pour ce moment de la journée." }
    }
    nom = repas.nom
  }

  return appliquer(
    supabase,
    [{ table: "meal_plan", operation: "update", id: caseId, data: { meal_id: mealId } }],
    `${LIBELLE_SLOT[casePlan.slot] ?? casePlan.slot} de ${casePlan.jour} (semaine ${casePlan.semaine}) : ${nom}`
  )
}

export async function echangerRepas(caseIdA: string, caseIdB: string): Promise<ResultatEdition> {
  if (!UUID.test(caseIdA) || !UUID.test(caseIdB) || caseIdA === caseIdB) return INVALIDE
  const supabase = await createClient()
  const { data } = await supabase.from("meal_plan").select("*").in("id", [caseIdA, caseIdB])
  const a = data?.find((c) => c.id === caseIdA)
  const b = data?.find((c) => c.id === caseIdB)
  if (!a || !b) return INTROUVABLE
  if (a.slot !== b.slot) {
    return { ok: false, message: "On ne peut échanger que deux repas du même moment de la journée." }
  }
  if (a.meal_id === b.meal_id) return SANS_EFFET

  const semaines = a.semaine === b.semaine ? `semaine ${a.semaine}` : `semaines ${a.semaine} et ${b.semaine}`
  return appliquer(
    supabase,
    [
      { table: "meal_plan", operation: "update", id: a.id, data: { meal_id: b.meal_id } },
      { table: "meal_plan", operation: "update", id: b.id, data: { meal_id: a.meal_id } },
    ],
    `${LIBELLE_SLOT[a.slot] ?? a.slot} : ${a.jour} et ${b.jour} échangés (${semaines})`
  )
}

// --- Questionnaire d'accueil ---------------------------------------------------------

// Enregistre les réponses et les cibles nutritionnelles qui en découlent.
export async function terminerAccueil(brut: unknown): Promise<ResultatEdition> {
  const reponses = validerReponses(brut)
  if (!reponses) return INVALIDE

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Session expirée. Reconnecte-toi." }

  const cibles = calculerCibles({
    poidsKg: reponses.poidsKg,
    tailleCm: reponses.tailleCm,
    age: reponses.age,
    sexe: reponses.sexe,
    seancesParSemaine: reponses.seancesParSemaine,
    objectifs: reponses.objectifs,
  })

  return appliquer(
    supabase,
    [
      {
        table: "profiles",
        operation: "update",
        id: user.id,
        data: {
          poids_initial_kg: reponses.poidsKg,
          taille_cm: reponses.tailleCm,
          age: reponses.age,
          sexe: reponses.sexe,
          objectifs: reponses.objectifs,
          zone_blessure: reponses.zoneBlessure,
          lieux_entrainement: reponses.lieux,
          seances_par_semaine: reponses.seancesParSemaine,
          niveau: reponses.niveau,
          regime: reponses.regime,
          aliments_exclus: reponses.alimentsExclus,
          objectif_kcal: cibles.kcal,
          objectif_proteines_g: cibles.proteinesG,
          objectif_lipides_g: cibles.lipidesG,
          objectif_glucides_g: cibles.glucidesG,
          accueil_fait_le: new Date().toISOString(),
        },
      },
    ],
    `Profil renseigné : ${nombre(reponses.poidsKg)} kg, ${reponses.tailleCm} cm, cible ${nombre(cibles.kcal)} kcal`
  )
}

// --- Adoption d'une proposition ------------------------------------------------------
// La proposition revient du téléphone : elle est revalidée de bout en bout, schéma puis
// garde-fous, contre le profil enregistré. Rien de ce qu'envoie le navigateur n'est cru sur parole.

const PROFIL_INCOMPLET: ResultatEdition = {
  ok: false,
  message: "Réponds d'abord au questionnaire d'accueil.",
}

export async function adopterProgrammeSport(brut: unknown): Promise<ResultatEdition> {
  const lue = PropositionSportSchema.safeParse(brut)
  if (!lue.success) return INVALIDE

  const supabase = await createClient()
  const contexte = await lireContexte(supabase)
  if (!contexte) return PROFIL_INCOMPLET

  const { proposition } = nettoyerSport(lue.data, contexte.garde)
  if (proposition.seances.length === 0) return INVALIDE

  const [{ data: exercices }, { data: seances }] = await Promise.all([
    supabase.from("exercises").select("id, nom"),
    supabase.from("workouts").select("code, ordre, archived"),
  ])

  // Un exercice déjà connu sous le même nom est réutilisé, pas dupliqué.
  const cle = (nom: string) => nom.trim().toLowerCase()
  const exerciceParNom = new Map((exercices ?? []).map((e) => [cle(e.nom), e.id]))
  const codes = (seances ?? []).filter((s) => !s.archived).map((s) => s.code)
  let ordre = Math.max(0, ...(seances ?? []).map((s) => s.ordre))
  const changements: Changement[] = []

  for (const seance of proposition.seances) {
    const seanceId = crypto.randomUUID()
    const code = codeLibre(codes)
    codes.push(code)
    ordre += 1
    changements.push({
      table: "workouts",
      operation: "insert",
      id: seanceId,
      data: {
        code,
        ordre,
        nom: seance.nom,
        lieu: seance.lieu,
        duree_min: seance.duree_min,
        jour_suggere: seance.jour,
        note: seance.note,
      },
    })

    seance.exercices.forEach((exercice, index) => {
      let exerciceId = exerciceParNom.get(cle(exercice.nom))
      if (!exerciceId) {
        exerciceId = crypto.randomUUID()
        exerciceParNom.set(cle(exercice.nom), exerciceId)
        changements.push({
          table: "exercises",
          operation: "insert",
          id: exerciceId,
          data: { nom: exercice.nom, groupe: exercice.groupe, equipement: exercice.equipement },
        })
      }
      changements.push({
        table: "workout_exercises",
        operation: "insert",
        id: crypto.randomUUID(),
        data: {
          workout_id: seanceId,
          exercise_id: exerciceId,
          ordre: index + 1,
          series: exercice.series,
          reps_min: exercice.reps_min,
          reps_max: exercice.reps_max,
          duree_sec: exercice.duree_sec,
          repos_sec: exercice.repos_sec,
          charge_depart_kg: exercice.charge_depart_kg,
          charge_cible_kg: exercice.charge_cible_kg,
          increment_kg: exercice.increment_kg,
          note: exercice.note,
        },
      })
    })
  }

  const n = proposition.seances.length
  return appliquer(supabase, changements, `Programme proposé adopté : ${n} séance${n > 1 ? "s" : ""}`)
}

export async function adopterPlanNutrition(brut: unknown): Promise<ResultatEdition> {
  const lue = PropositionNutritionSchema.safeParse(brut)
  if (!lue.success) return INVALIDE

  const supabase = await createClient()
  const contexte = await lireContexte(supabase)
  if (!contexte) return PROFIL_INCOMPLET

  const { proposition } = nettoyerNutrition(lue.data, contexte.garde)
  if (proposition.plats.length === 0) return INVALIDE

  const ids = proposition.plats.map(() => crypto.randomUUID())
  const changements: Changement[] = proposition.plats.map((plat, index) => ({
    table: "meals",
    operation: "insert",
    id: ids[index]!,
    data: {
      nom: plat.nom,
      slot: plat.slot,
      kcal: plat.kcal,
      proteines_g: plat.proteines_g,
      lipides_g: plat.lipides_g,
      glucides_g: plat.glucides_g,
      temps_min: plat.temps_min,
      recette_md: plat.recette_md,
      ingredients: plat.ingredients,
      tag: "standard",
    },
  }))

  // Les menus : seules les cases encore vides sont remplies. Un menu déjà composé n'est pas écrasé.
  const { data: cases } = await supabase.from("meal_plan").select("id, semaine, jour, slot, meal_id")
  for (const cible of repartirSurDeuxSemaines(proposition.plats)) {
    if (cible.plat === null) continue
    const existante = (cases ?? []).find(
      (c) => c.semaine === cible.semaine && c.jour === cible.jour && c.slot === cible.slot
    )
    if (existante?.meal_id) continue
    changements.push(
      existante
        ? { table: "meal_plan", operation: "update", id: existante.id, data: { meal_id: ids[cible.plat] } }
        : {
            table: "meal_plan",
            operation: "insert",
            id: crypto.randomUUID(),
            data: { semaine: cible.semaine, jour: cible.jour, slot: cible.slot, meal_id: ids[cible.plat] },
          }
    )
  }

  const n = proposition.plats.length
  return appliquer(supabase, changements, `Plan nutritif proposé adopté : ${n} plat${n > 1 ? "s" : ""}`)
}

// --- Suivi : pied ------------------------------------------------------------------

const douleurValide = entier(0, 10)

// Une seule mesure par jour : la saisir à nouveau corrige celle du jour.
export async function enregistrerDouleur(
  date: string,
  douleur: number,
  protocoleFait: boolean
): Promise<ResultatEdition> {
  if (!DATE.test(date) || !douleurValide(douleur) || typeof protocoleFait !== "boolean") return INVALIDE
  const supabase = await createClient()
  const { data: existant } = await supabase.from("foot_logs").select("*").eq("date", date).maybeSingle()
  const resume = `Douleur du matin : ${douleur} sur 10`

  if (existant) {
    if (existant.douleur_matin === douleur) return SANS_EFFET
    return appliquer(
      supabase,
      [{ table: "foot_logs", operation: "update", id: existant.id, data: { douleur_matin: douleur } }],
      `${resume} (au lieu de ${existant.douleur_matin})`
    )
  }
  return appliquer(
    supabase,
    [
      {
        table: "foot_logs",
        operation: "insert",
        id: crypto.randomUUID(),
        data: { date, douleur_matin: douleur, protocole_fait: protocoleFait },
      },
    ],
    resume
  )
}

// La ligne du jour n'existe qu'une fois la douleur renseignée : la colonne est obligatoire.
export async function marquerProtocole(date: string, fait: boolean): Promise<ResultatEdition> {
  if (!DATE.test(date) || typeof fait !== "boolean") return INVALIDE
  const supabase = await createClient()
  const { data: existant } = await supabase.from("foot_logs").select("*").eq("date", date).maybeSingle()
  if (!existant) return { ok: false, message: "Renseigne d'abord ta douleur du matin." }
  if (Boolean(existant.protocole_fait) === fait) return SANS_EFFET

  return appliquer(
    supabase,
    [{ table: "foot_logs", operation: "update", id: existant.id, data: { protocole_fait: fait } }],
    fait ? "Protocole pied fait aujourd'hui" : "Protocole pied marqué non fait"
  )
}

// --- Suivi : course ----------------------------------------------------------------

export type SortieAEnregistrer = { date: string; km: number; dureeMin: number; douleurApres: number }

export async function enregistrerSortie(sortie: SortieAEnregistrer): Promise<ResultatEdition> {
  const valide =
    DATE.test(sortie.date) &&
    decimal(0, 100)(sortie.km) &&
    entier(1, 600)(sortie.dureeMin) &&
    douleurValide(sortie.douleurApres)
  if (!valide) return INVALIDE

  const supabase = await createClient()
  return appliquer(
    supabase,
    [
      {
        table: "running_logs",
        operation: "insert",
        id: crypto.randomUUID(),
        data: {
          date: sortie.date,
          km: sortie.km,
          duree_min: sortie.dureeMin,
          douleur_apres: sortie.douleurApres,
        },
      },
    ],
    `Sortie de ${nombre(sortie.km)} km en ${sortie.dureeMin} min, douleur ${sortie.douleurApres} sur 10`
  )
}

export async function enregistrerDouleurLendemain(id: string, douleur: number): Promise<ResultatEdition> {
  if (!UUID.test(id) || !douleurValide(douleur)) return INVALIDE
  const supabase = await createClient()
  const { data: sortie } = await supabase.from("running_logs").select("*").eq("id", id).maybeSingle()
  if (!sortie) return INTROUVABLE
  if (sortie.douleur_lendemain === douleur) return SANS_EFFET

  return appliquer(
    supabase,
    [{ table: "running_logs", operation: "update", id, data: { douleur_lendemain: douleur } }],
    `Lendemain de la sortie du ${dateCourte(sortie.date)} : douleur ${douleur} sur 10`
  )
}

const LIBELLE_STATUT: Record<string, string> = {
  valide: "validée",
  repete: "à refaire",
  a_venir: "remise à venir",
  en_cours: "en cours",
}

export async function changerStatutSemaine(id: string, statut: string): Promise<ResultatEdition> {
  if (!UUID.test(id) || !(statut in LIBELLE_STATUT)) return INVALIDE
  const supabase = await createClient()
  const { data: ligne } = await supabase.from("running_plan").select("*").eq("id", id).maybeSingle()
  if (!ligne) return INTROUVABLE
  if (ligne.statut === statut) return SANS_EFFET

  return appliquer(
    supabase,
    [{ table: "running_plan", operation: "update", id, data: { statut } }],
    `Course, semaine ${ligne.semaine} : ${LIBELLE_STATUT[statut]}`
  )
}

// --- Suivi : poids -----------------------------------------------------------------

// Une seule pesée par jour : la saisir à nouveau corrige celle du jour.
export async function enregistrerPesee(
  date: string,
  poidsKg: number,
  tourTailleCm: number | null
): Promise<ResultatEdition> {
  if (!DATE.test(date) || !decimal(30, 300)(poidsKg) || !ouNul(decimal(40, 250))(tourTailleCm)) {
    return INVALIDE
  }
  const supabase = await createClient()
  const { data: existant } = await supabase.from("body_metrics").select("*").eq("date", date).maybeSingle()
  // Sans tour de taille, on ne touche pas à celui qui serait déjà enregistré ce jour-là.
  const data = tourTailleCm === null ? { poids_kg: poidsKg } : { poids_kg: poidsKg, tour_taille_cm: tourTailleCm }
  const resume =
    `Pesée : ${nombre(poidsKg)} kg` + (tourTailleCm !== null ? `, tour de taille ${nombre(tourTailleCm)} cm` : "")

  if (existant) {
    const identique =
      existant.poids_kg === poidsKg && (tourTailleCm === null || existant.tour_taille_cm === tourTailleCm)
    if (identique) return SANS_EFFET
    return appliquer(supabase, [{ table: "body_metrics", operation: "update", id: existant.id, data }], resume)
  }
  return appliquer(
    supabase,
    [{ table: "body_metrics", operation: "insert", id: crypto.randomUUID(), data: { date, ...data } }],
    resume
  )
}

// --- Suivi : repas -----------------------------------------------------------------

const slotValide = parmi(Object.keys(LIBELLE_SLOT))

// Coche un repas du plan (ou un plat de secours pris à sa place).
export async function cocherRepas(date: string, slot: string, mealId: string): Promise<ResultatEdition> {
  if (!DATE.test(date) || !slotValide(slot) || !UUID.test(mealId)) return INVALIDE
  const supabase = await createClient()
  const [{ data: repas }, { data: dejaPris }] = await Promise.all([
    supabase.from("meals").select("nom").eq("id", mealId).maybeSingle(),
    supabase.from("meal_logs").select("id").eq("date", date).eq("slot", slot).limit(1),
  ])
  if (!repas) return INTROUVABLE
  if (dejaPris && dejaPris.length > 0) return { ok: false, message: "Ce repas est déjà enregistré." }

  return appliquer(
    supabase,
    [
      {
        table: "meal_logs",
        operation: "insert",
        id: crypto.randomUUID(),
        data: { date, slot, meal_id: mealId, hors_plan: false },
      },
    ],
    `${LIBELLE_SLOT[slot]} pris : ${repas.nom}`
  )
}

export async function enregistrerHorsPlan(
  date: string,
  slot: string,
  kcal: number,
  proteines: number
): Promise<ResultatEdition> {
  if (!DATE.test(date) || !slotValide(slot) || !entier(0, 5000)(kcal) || !entier(0, 400)(proteines)) {
    return INVALIDE
  }
  const supabase = await createClient()
  const { data: dejaPris } = await supabase.from("meal_logs").select("id").eq("date", date).eq("slot", slot).limit(1)
  if (dejaPris && dejaPris.length > 0) return { ok: false, message: "Ce repas est déjà enregistré." }

  return appliquer(
    supabase,
    [
      {
        table: "meal_logs",
        operation: "insert",
        id: crypto.randomUUID(),
        data: { date, slot, hors_plan: true, kcal_reel: kcal, proteines_reel: proteines },
      },
    ],
    `${LIBELLE_SLOT[slot]} hors plan : ${nombre(kcal)} kcal, ${proteines} g de protéines`
  )
}

export async function retirerRepas(logId: string): Promise<ResultatEdition> {
  if (!UUID.test(logId)) return INVALIDE
  const supabase = await createClient()
  const { data: log } = await supabase.from("meal_logs").select("slot").eq("id", logId).maybeSingle()
  if (!log) return INTROUVABLE

  return appliquer(
    supabase,
    [{ table: "meal_logs", operation: "delete", id: logId }],
    `${LIBELLE_SLOT[log.slot] ?? log.slot} retiré du journal`
  )
}

// --- Courses (phase 6) -----------------------------------------------------------------

const ARTICLES_MAX = 200

function lireIngredients(brut: unknown): IngredientDePlat[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((entree) => {
    if (typeof entree !== "object" || entree === null) return []
    const { nom, quantite, unite } = entree as Record<string, unknown>
    if (typeof nom !== "string") return []
    return [
      {
        nom,
        quantite: typeof quantite === "number" ? quantite : null,
        unite: typeof unite === "string" ? unite : null,
      },
    ]
  })
}

// Génère la liste de la semaine qui commence le lundi `semaineDu`, à partir des menus de la
// semaine `semaineMenu` du plan. Une liste déjà générée pour ce lundi est remplacée.
export async function genererListeCourses(semaineDu: string, semaineMenu: number): Promise<ResultatEdition> {
  if (!DATE.test(semaineDu) || (semaineMenu !== 1 && semaineMenu !== 2)) return INVALIDE

  const supabase = await createClient()
  const [{ data: cases }, { data: catalogue }, { data: ancienne }] = await Promise.all([
    supabase.from("meal_plan").select("meal:meals(ingredients)").eq("semaine", semaineMenu),
    supabase.from("grocery_items").select("nom, categorie, quantite, prix_eur, recurrent"),
    supabase.from("grocery_list_items").select("id").eq("semaine_du", semaineDu),
  ])

  const ingredients = (cases ?? []).flatMap((c) => lireIngredients(c.meal?.ingredients))
  const articles = composerListe(ingredients, catalogue ?? []).slice(0, ARTICLES_MAX)
  if (articles.length === 0) {
    return {
      ok: false,
      message: "Rien à mettre dans la liste : les plats de cette semaine n'ont pas d'ingrédients renseignés.",
    }
  }

  const changements: Changement[] = [
    ...(ancienne ?? []).map((article): Changement => ({
      table: "grocery_list_items",
      operation: "delete",
      id: article.id,
    })),
    ...articles.map((article): Changement => ({
      table: "grocery_list_items",
      operation: "insert",
      id: crypto.randomUUID(),
      data: { semaine_du: semaineDu, ...article },
    })),
  ]

  const n = articles.length
  return appliquer(
    supabase,
    changements,
    `Liste de courses du ${dateCourte(semaineDu)} générée : ${n} article${n > 1 ? "s" : ""}`
  )
}

export async function cocherArticle(id: string, coche: boolean): Promise<ResultatEdition> {
  if (!UUID.test(id) || typeof coche !== "boolean") return INVALIDE
  const supabase = await createClient()
  const { data: article } = await supabase.from("grocery_list_items").select("nom, coche").eq("id", id).maybeSingle()
  if (!article) return INTROUVABLE
  if (Boolean(article.coche) === coche) return SANS_EFFET

  return appliquer(
    supabase,
    [{ table: "grocery_list_items", operation: "update", id, data: { coche } }],
    `${article.nom} ${coche ? "coché" : "décoché"}`
  )
}

// Fixe le prix d'un article et le retient dans le catalogue : la prochaine liste le reprendra.
export async function fixerPrixArticle(id: string, prix: number): Promise<ResultatEdition> {
  if (!UUID.test(id) || !decimal(0, 500)(prix)) return INVALIDE
  const supabase = await createClient()
  const [{ data: article }, { data: catalogue }] = await Promise.all([
    supabase.from("grocery_list_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("grocery_items").select("id, nom, prix_eur"),
  ])
  if (!article) return INTROUVABLE
  if (article.prix_eur === prix) return SANS_EFFET

  const connu = (catalogue ?? []).find((produit) => cleDe(produit.nom) === cleDe(article.nom))
  return appliquer(
    supabase,
    [
      { table: "grocery_list_items", operation: "update", id, data: { prix_eur: prix } },
      connu
        ? { table: "grocery_items", operation: "update", id: connu.id, data: { prix_eur: prix } }
        : {
            table: "grocery_items",
            operation: "insert",
            id: crypto.randomUUID(),
            data: { nom: article.nom, categorie: article.categorie, prix_eur: prix, recurrent: false },
          },
    ],
    `${article.nom} : ${nombre(prix)} €`
  )
}

export async function modifierBudget(montant: number): Promise<ResultatEdition> {
  if (!decimal(0, 2000)(montant)) return INVALIDE
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Session expirée. Reconnecte-toi." }
  const { data: profil } = await supabase.from("profiles").select("budget_courses_eur").maybeSingle()
  if (profil?.budget_courses_eur === montant) return SANS_EFFET

  return appliquer(
    supabase,
    [{ table: "profiles", operation: "update", id: user.id, data: { budget_courses_eur: montant } }],
    `Budget courses : ${nombre(montant)} € par semaine`
  )
}

// --- Séance exécutée (phase 3) ------------------------------------------------------

export type SerieAEnregistrer = {
  workout_exercise_id: string
  serie_num: number
  charge_kg: number | null
  reps: number | null
  duree_sec: number | null
  rir: number | null
}

export type SeanceAEnregistrer = {
  // Généré par le téléphone : renvoyer la même séance ne crée pas de doublon.
  id: string
  workoutId: string
  date: string
  dureeMin: number
  ressenti: number | null
  series: SerieAEnregistrer[]
}

const MAX_SERIES = 200

function serieValide(s: SerieAEnregistrer) {
  return (
    UUID.test(s.workout_exercise_id) &&
    entier(1, 99)(s.serie_num) &&
    ouNul(decimal(0, 1000))(s.charge_kg) &&
    ouNul(entier(0, 999))(s.reps) &&
    ouNul(entier(1, 7200))(s.duree_sec) &&
    ouNul(entier(0, 5))(s.rir)
  )
}

export async function enregistrerSeance(seance: SeanceAEnregistrer): Promise<ResultatMutation> {
  const valide =
    UUID.test(seance.id) &&
    UUID.test(seance.workoutId) &&
    DATE.test(seance.date) &&
    entier(1, 600)(seance.dureeMin) &&
    ouNul(entier(1, 5))(seance.ressenti) &&
    Array.isArray(seance.series) &&
    seance.series.length > 0 &&
    seance.series.length <= MAX_SERIES &&
    seance.series.every(serieValide)
  if (!valide) {
    return { ok: false, message: "Séance invalide : rien n'a été enregistré." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("enregistrer_seance", {
    p_id: seance.id,
    p_workout_id: seance.workoutId,
    p_date: seance.date,
    p_duree_min: seance.dureeMin,
    // La colonne accepte null ; le type généré ne le reflète pas pour les arguments de fonction.
    p_ressenti: seance.ressenti as number,
    p_series: seance.series,
    p_source: "user",
  })

  if (error) {
    return {
      ok: false,
      message:
        error.code === "28000"
          ? "Session expirée. Reconnecte-toi, ta séance est gardée sur ce téléphone."
          : "Enregistrement impossible. Ta séance est gardée sur ce téléphone, réessaie.",
    }
  }
  return { ok: true, changeLogId: data }
}

// --- Chat : réponse à une proposition de l'assistant ----------------------------------------

const DEJA_REPONDU: ResultatEdition = { ok: false, message: "Cette proposition a déjà reçu une réponse." }

// Les écritures d'une proposition sont relues dans le message enregistré : le navigateur
// n'envoie que deux identifiants, jamais le contenu à écrire.
async function lireProposition(supabase: Client, messageId: string, effetId: string) {
  if (!UUID.test(messageId) || !UUID.test(effetId)) return null
  const { data: message } = await supabase
    .from("chat_messages")
    .select("id, tool_calls")
    .eq("id", messageId)
    .eq("role", "assistant")
    .maybeSingle()
  const donnees = message?.tool_calls as unknown as DonneesMessage | null
  const effet = donnees?.effets?.find((e) => e.id === effetId)
  if (!message || !donnees || !effet || effet.type !== "propose") return null
  return { donnees, effet }
}

function noterReponse(supabase: Client, messageId: string, donnees: DonneesMessage) {
  return supabase.from("chat_messages").update({ tool_calls: donnees as unknown as Json }).eq("id", messageId)
}

export async function appliquerProposition(messageId: string, effetId: string): Promise<ResultatEdition> {
  const supabase = await createClient()
  const proposition = await lireProposition(supabase, messageId, effetId)
  if (!proposition) return INTROUVABLE
  const { donnees, effet } = proposition
  if (effet.statut !== "en_attente") return DEJA_REPONDU
  // Mêmes limites qu'au moment de la proposition : le message enregistré ne fait pas foi à lui seul.
  if (!Array.isArray(effet.changements) || effet.changements.length === 0) return INVALIDE
  if (effet.changements.some((c) => !TABLES_DU_CHAT.includes(c.table))) return INVALIDE
  // La liste de courses est un document dérivé : elle seule peut dépasser la limite de lignes.
  if (effet.changements.filter((c) => c.table !== "grocery_list_items").length > LIGNES_MAX_DU_CHAT) return INVALIDE

  // Une modification du programme par l'assistant compte dans le quota du mois, une fois par message.
  let reservee: string | null = null
  if (effet.quota && !donnees.demandeIa) {
    const { data, error } = await supabase.rpc("reserver_demande_ia", { p_type: "chat" })
    if (error) return echec(error)
    if (!data) {
      return {
        ok: false,
        message: "Tu as utilisé tes modifications par l'assistant de ce mois. Tu peux faire ce changement à la main dans l'application.",
      }
    }
    reservee = data
  }

  const { data: groupeId, error } = await supabase.rpc("appliquer_changements", {
    p_changements: effet.changements as unknown as Json,
    p_resume: effet.resume,
    p_source: "chatbot",
  })
  if (error || !groupeId) {
    if (reservee) await supabase.rpc("rendre_demande_ia", { p_id: reservee })
    return {
      ok: false,
      message: "Cette proposition ne peut plus être appliquée : le programme a changé depuis. Redemande-la à l'assistant.",
    }
  }

  effet.statut = "appliquee"
  effet.groupeId = groupeId
  if (reservee) donnees.demandeIa = reservee
  await noterReponse(supabase, messageId, donnees)
  return { ok: true, groupeId, resume: effet.resume }
}

export async function abandonnerProposition(
  messageId: string,
  effetId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient()
  const proposition = await lireProposition(supabase, messageId, effetId)
  if (!proposition) return { ok: false, message: "Proposition introuvable. Recharge la page." }
  if (proposition.effet.statut !== "en_attente") return { ok: false, message: "Cette proposition a déjà reçu une réponse." }
  proposition.effet.statut = "abandonnee"
  const { error } = await noterReponse(supabase, messageId, proposition.donnees)
  return error ? { ok: false, message: "Réponse non enregistrée. Réessaie." } : { ok: true }
}
