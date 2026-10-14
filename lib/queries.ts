"use client"

import { useQuery } from "@tanstack/react-query"

import { depuisDureeDeVie } from "@/lib/chat/types"
import { createClient } from "@/lib/supabase/client"

// Toutes les lectures de l'application. Les écrans ne parlent jamais à Supabase directement.

const db = () => createClient()

type Reponse<T> = PromiseLike<{ data: T | null; error: Error | null }>

async function liste<T>(requete: Reponse<T[]>): Promise<T[]> {
  const { data, error } = await requete
  if (error) throw error
  return data ?? []
}

async function lireProfil() {
  const { data, error } = await db().from("profiles").select("*").maybeSingle()
  if (error) throw error
  return data
}

function lireSeances() {
  return liste(
    db()
      .from("workouts")
      .select("*, workout_exercises(*, exercise:exercises(*))")
      .not("archived", "is", true)
      // Les exercices retirés d'une séance restent en base pour l'historique, mais ne s'affichent plus.
      .not("workout_exercises.archived", "is", true)
      .order("ordre")
      .order("ordre", { referencedTable: "workout_exercises" })
  )
}

function lireJournalSeances() {
  return liste(db().from("workout_logs").select("*").order("date", { ascending: false }).limit(200))
}

// Les dernières séances faites avec leurs séries : sert au pré-remplissage et à l'historique.
function lireHistoriqueSeries() {
  return liste(
    db()
      .from("workout_logs")
      .select("id, date, workout_id, set_logs(*, workout_exercise:workout_exercises(exercise_id))")
      .order("date", { ascending: false })
      .order("serie_num", { referencedTable: "set_logs" })
      .limit(40)
  )
}

// Les exceptions à la semaine type, date par date (repos, séance changée).
function lirePlanning() {
  return liste(db().from("planning").select("id, date, workout_id, raison").order("date"))
}

// Ajustements proposés après une séance, en attente d'une réponse.
function lireAjustements() {
  return liste(
    db()
      .from("ajustements")
      .select("id, workout_id, created_at, resume, explication, diff")
      .eq("statut", "en_attente")
      .order("created_at", { ascending: false })
  )
}

// Les séries d'une séance faite, avec le nom de leur exercice : détail d'une date du calendrier.
function lireSeriesSeance(logId: string) {
  return liste(
    db()
      .from("set_logs")
      .select("id, serie_num, charge_kg, reps, duree_sec, exercise_id, exercise:exercises(nom)")
      .eq("workout_log_id", logId)
      .order("serie_num")
  )
}

function lireExercices() {
  return liste(db().from("exercises").select("*").not("archived", "is", true).order("nom"))
}

function lireModifications() {
  return liste(
    db()
      .from("change_log")
      .select("id, groupe_id, resume, source, applied_at, undone_at")
      .order("applied_at", { ascending: false })
      .limit(300)
  )
}

// Adresse du compte connecté, lue dans la session gardée sur le téléphone (aucun appel réseau).
async function lireEmail() {
  const { data } = await db().auth.getSession()
  return data.session?.user.email ?? null
}

// Les messages du chat encore en vie, du plus ancien au plus récent.
async function lireMessagesChat() {
  const recents = await liste(
    db()
      .from("chat_messages")
      .select("id, role, content, tool_calls, created_at")
      .gte("created_at", depuisDureeDeVie())
      .order("created_at", { ascending: false })
      .limit(100)
  )
  return recents.reverse()
}

// Demandes IA du mois pour le compte connecté. `limite` vide = illimité.
async function lireQuotaIa() {
  const { data, error } = await db().rpc("etat_demandes_ia")
  if (error) throw error
  return data?.[0] ?? { utilisees: 0, limite: null }
}

async function lirePied() {
  const [items, paliers, mesures] = await Promise.all([
    liste(db().from("foot_protocol_items").select("*").not("actif", "is", false).order("ordre")),
    liste(db().from("foot_progression").select("*").order("semaine_debut")),
    liste(db().from("foot_logs").select("*").order("date", { ascending: false }).limit(60)),
  ])
  return { items, paliers, mesures }
}

async function lireCourse() {
  const [plan, sorties] = await Promise.all([
    liste(db().from("running_plan").select("*").order("semaine")),
    liste(db().from("running_logs").select("*").order("date", { ascending: false }).limit(100)),
  ])
  return { plan, sorties }
}

function lireMesures() {
  return liste(db().from("body_metrics").select("*").order("date", { ascending: false }).limit(200))
}

function lireRepas() {
  return liste(db().from("meals").select("*").not("archived", "is", true).order("nom"))
}

function lirePlanRepas() {
  return liste(db().from("meal_plan").select("*, meal:meals(*)"))
}

function lireJournalRepas() {
  return liste(db().from("meal_logs").select("*").order("date", { ascending: false }).limit(400))
}

async function lireCourses() {
  const [produits, listeSemaine] = await Promise.all([
    liste(db().from("grocery_items").select("*").order("nom")),
    liste(db().from("grocery_list_items").select("*").order("semaine_du", { ascending: false })),
  ])
  return { produits, listeSemaine }
}

// Date du tout premier log, toutes tables confondues : c'est le jour 1 du programme (section 6).
async function lireDebutProgramme() {
  const premiere = async (requete: Reponse<{ date: string }[]>) => (await liste(requete))[0]?.date
  const dates = await Promise.all([
    premiere(db().from("workout_logs").select("date").order("date").limit(1)),
    premiere(db().from("foot_logs").select("date").order("date").limit(1)),
    premiere(db().from("running_logs").select("date").order("date").limit(1)),
    premiere(db().from("body_metrics").select("date").order("date").limit(1)),
    premiere(db().from("meal_logs").select("date").order("date").limit(1)),
  ])
  return dates.filter((d): d is string => d !== undefined).sort()[0] ?? null
}

export type Seance = Awaited<ReturnType<typeof lireSeances>>[number]
export type ExerciceDeSeance = Seance["workout_exercises"][number]
export type SeanceFaite = Awaited<ReturnType<typeof lireHistoriqueSeries>>[number]
export type Exercice = Awaited<ReturnType<typeof lireExercices>>[number]
export type Repas = Awaited<ReturnType<typeof lireRepas>>[number]
export type MessageChat = Awaited<ReturnType<typeof lireMessagesChat>>[number]
export type Ajustement = Awaited<ReturnType<typeof lireAjustements>>[number]
export type CasePlan = Awaited<ReturnType<typeof lirePlanRepas>>[number]

// Tout ce que les écrans lisent. Préchargé une fois en ligne, pour que chaque écran
// s'ouvre hors ligne même s'il n'a jamais été visité.
export const LECTURES: { queryKey: string[]; queryFn: () => Promise<unknown> }[] = [
  { queryKey: ["profil"], queryFn: lireProfil },
  { queryKey: ["seances"], queryFn: lireSeances },
  { queryKey: ["journal-seances"], queryFn: lireJournalSeances },
  { queryKey: ["historique-series"], queryFn: lireHistoriqueSeries },
  { queryKey: ["exercices"], queryFn: lireExercices },
  { queryKey: ["modifications"], queryFn: lireModifications },
  { queryKey: ["quota-ia"], queryFn: lireQuotaIa },
  { queryKey: ["chat"], queryFn: lireMessagesChat },
  { queryKey: ["pied"], queryFn: lirePied },
  { queryKey: ["course"], queryFn: lireCourse },
  { queryKey: ["mesures"], queryFn: lireMesures },
  { queryKey: ["repas"], queryFn: lireRepas },
  { queryKey: ["plan-repas"], queryFn: lirePlanRepas },
  { queryKey: ["journal-repas"], queryFn: lireJournalRepas },
  { queryKey: ["courses"], queryFn: lireCourses },
  { queryKey: ["debut-programme"], queryFn: lireDebutProgramme },
  { queryKey: ["planning"], queryFn: lirePlanning },
  { queryKey: ["ajustements"], queryFn: lireAjustements },
]

export const useProfil = () => useQuery({ queryKey: ["profil"], queryFn: lireProfil })
// Identifiant du compte connecté, s'il est déjà connu : écoute le profil sans jamais le demander.
export const useCompte = () =>
  useQuery({ queryKey: ["profil"], queryFn: lireProfil, enabled: false }).data?.id ?? null
export const useSeances = () => useQuery({ queryKey: ["seances"], queryFn: lireSeances })
export const useJournalSeances = () =>
  useQuery({ queryKey: ["journal-seances"], queryFn: lireJournalSeances })
export const useHistoriqueSeries = () =>
  useQuery({ queryKey: ["historique-series"], queryFn: lireHistoriqueSeries })
export const useSeriesSeance = (logId: string) =>
  useQuery({ queryKey: ["series-seance", logId], queryFn: () => lireSeriesSeance(logId) })
export const useExercices = () => useQuery({ queryKey: ["exercices"], queryFn: lireExercices })
export const useModifications = () =>
  useQuery({ queryKey: ["modifications"], queryFn: lireModifications })
export const useQuotaIa = () => useQuery({ queryKey: ["quota-ia"], queryFn: lireQuotaIa })
export const useEmail = () => useQuery({ queryKey: ["email"], queryFn: lireEmail })
export const useMessagesChat = () => useQuery({ queryKey: ["chat"], queryFn: lireMessagesChat })
export const usePied = () => useQuery({ queryKey: ["pied"], queryFn: lirePied })
export const useCourse = () => useQuery({ queryKey: ["course"], queryFn: lireCourse })
export const useMesures = () => useQuery({ queryKey: ["mesures"], queryFn: lireMesures })
export const useRepas = () => useQuery({ queryKey: ["repas"], queryFn: lireRepas })
export const usePlanRepas = () => useQuery({ queryKey: ["plan-repas"], queryFn: lirePlanRepas })
export const useJournalRepas = () =>
  useQuery({ queryKey: ["journal-repas"], queryFn: lireJournalRepas })
export const useCourses = () => useQuery({ queryKey: ["courses"], queryFn: lireCourses })
export const usePlanning = () => useQuery({ queryKey: ["planning"], queryFn: lirePlanning })
export const useAjustements = () => useQuery({ queryKey: ["ajustements"], queryFn: lireAjustements })
export const useDebutProgramme = () =>
  useQuery({ queryKey: ["debut-programme"], queryFn: lireDebutProgramme })
