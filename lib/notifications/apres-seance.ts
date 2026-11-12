import "server-only"

import { estUnCoach, type IdCoach } from "@/lib/coachs"
import { envoyerAuCompte } from "@/lib/notifications/envoi"
import { ajustementPropose, compteRendu, type BilanSeance } from "@/lib/notifications/messages"
import { records, type SerieRapport } from "@/lib/rapport"
import { recalculerApresSeance } from "@/lib/recalcul"
import type { createClient } from "@/lib/supabase/server"

type Client = Awaited<ReturnType<typeof createClient>>

// Ce qui suit l'enregistrement d'une séance, en tâche de fond : le compte rendu du coach, le
// recalcul du programme, puis la notification des ajustements qu'il propose.
// `force` : une note vient d'arriver sur une séance déjà enregistrée. Le recalcul est relancé,
// mais le compte rendu a déjà été envoyé.
export async function apresSeance(supabase: Client, logId: string, { force = false } = {}) {
  const { data: profil } = await supabase.from("profiles").select("id, coach, notif_rapport, notif_ajustement").maybeSingle()
  const coach = estUnCoach(profil?.coach) ? profil.coach : null

  if (profil?.notif_rapport && !force) await envoyerCompteRendu(supabase, profil.id, coach, logId)

  const crees = await recalculerApresSeance(supabase, logId, { force })
  if (!profil?.notif_ajustement) return
  for (const ajustement of crees) {
    await envoyerAuCompte(supabase, profil.id, ajustementPropose(coach, ajustement)).catch((erreur) =>
      console.error("[notifications]", erreur)
    )
  }
}

async function envoyerCompteRendu(supabase: Client, userId: string, coach: IdCoach | null, logId: string) {
  try {
    const bilan = await lireBilan(supabase, logId)
    if (bilan) await envoyerAuCompte(supabase, userId, compteRendu(coach, bilan))
  } catch (erreur) {
    // Tâche de fond : le compte rendu manqué ne doit pas empêcher le recalcul.
    console.error("[notifications]", erreur)
  }
}

async function lireBilan(supabase: Client, logId: string): Promise<BilanSeance | null> {
  const { data: log } = await supabase
    .from("workout_logs")
    .select("id, date, duree_min, workout:workouts(code), set_logs(exercise_id, charge_kg, reps, duree_sec, exercise:exercises(nom))")
    .eq("id", logId)
    .maybeSingle()
  if (!log || log.set_logs.length === 0) return null

  const series: SerieRapport[] = log.set_logs.map((s) => ({
    exerciseId: s.exercise_id,
    nom: s.exercise.nom,
    groupe: null,
    charge: s.charge_kg,
    reps: s.reps,
    duree: s.duree_sec,
    fin: null,
    reposPrevuSec: null,
    bloc: "series",
  }))
  // Les records se comparent aux séances d'avant, comme dans le rapport de l'application.
  const { data: passees } = await supabase
    .from("set_logs")
    .select("exercise_id, charge_kg, reps, duree_sec, workout_log_id, workout_log:workout_logs(date)")
    .in("exercise_id", [...new Set(series.map((s) => s.exerciseId))])
    .neq("workout_log_id", logId)
    .limit(5000)
  const historique = (passees ?? [])
    .filter((s) => s.workout_log && s.workout_log.date <= log.date)
    .map((s) => ({ exerciseId: s.exercise_id, charge: s.charge_kg, reps: s.reps, duree: s.duree_sec }))

  return {
    logId,
    date: log.date,
    code: log.workout?.code ?? null,
    dureeMin: log.duree_min,
    series: series.length,
    volumeKg: series.reduce((total, s) => total + (s.charge ?? 0) * (s.reps ?? 0), 0),
    records: records(series, historique),
  }
}
