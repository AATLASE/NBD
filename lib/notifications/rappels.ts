import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { estUnCoach } from "@/lib/coachs"
import type { Database } from "@/lib/database.types"
import { envoyerAuCompte, notificationsConfigurees } from "@/lib/notifications/envoi"
import { rappelSeance } from "@/lib/notifications/messages"
import { seancePrevue } from "@/lib/planning"
import { createAdminClient } from "@/lib/supabase/admin"

// Le rappel des jours de séance, passé en revue toutes les quelques minutes par le serveur
// (instrumentation.ts). Il part à l'heure choisie dans les paramètres, à l'heure du téléphone.

// Serveur arrêté à l'heure prévue : le rappel part encore dans les deux heures qui suivent, jamais après.
const FENETRE_H = 2

// La date et l'heure qu'il est sur le téléphone, d'après son fuseau.
export function heureLocale(maintenant: Date, fuseau: string) {
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
  }
  const partie = Object.fromEntries(format.formatToParts(maintenant).map((p) => [p.type, p.value]))
  return { date: `${partie.year}-${partie.month}-${partie.day}`, heure: Number(partie.hour) }
}

export async function envoyerLesRappels(maintenant = new Date()) {
  const admin = createAdminClient()
  if (!admin || !notificationsConfigurees()) return

  const { data: appareils, error } = await admin.from("push_abonnements").select("user_id, fuseau").order("created_at", { ascending: false })
  if (error) {
    console.error("[rappels]", error.message)
    return
  }
  // Un compte, un fuseau : celui de son appareil le plus récent.
  const fuseaux = new Map<string, string>()
  for (const a of appareils ?? []) if (!fuseaux.has(a.user_id)) fuseaux.set(a.user_id, a.fuseau)

  for (const [userId, fuseau] of fuseaux) {
    try {
      await rappelDuCompte(admin, userId, heureLocale(maintenant, fuseau))
    } catch (erreur) {
      console.error("[rappels]", userId, erreur)
    }
  }
}

async function rappelDuCompte(admin: SupabaseClient<Database>, userId: string, { date, heure }: { date: string; heure: number }) {
  const { data: profil } = await admin.from("profiles").select("coach, notif_seance, notif_heure").eq("id", userId).maybeSingle()
  if (!profil?.notif_seance || heure < profil.notif_heure || heure >= profil.notif_heure + FENETRE_H) return

  const [{ data: seances }, { data: planning }, { data: faites }] = await Promise.all([
    admin.from("workouts").select("id, code, nom, duree_min, jour_suggere").eq("user_id", userId).not("archived", "is", true),
    admin.from("planning").select("id, date, workout_id, activite, raison").eq("user_id", userId).eq("date", date),
    admin.from("workout_logs").select("id").eq("user_id", userId).eq("date", date).limit(1),
  ])
  // Déjà faite (tôt le matin) : rien à rappeler.
  if (faites && faites.length > 0) return
  const { seance, exception } = seancePrevue(date, seances ?? [], planning ?? [])
  const programme = seance ?? (exception?.activite ? { activite: exception.activite } : null)
  if (!programme) return

  // Le rappel est réservé avant d'être envoyé : un second passage trouve la ligne et s'arrête.
  const { error } = await admin.from("notifications_envoyees").insert({ user_id: userId, date, type: "seance" })
  if (error) {
    if (error.code !== "23505") console.error("[rappels]", error.message)
    return
  }
  await envoyerAuCompte(admin, userId, rappelSeance(estUnCoach(profil.coach) ? profil.coach : null, date, programme))
}
