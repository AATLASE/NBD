"use server"

import { estUnCoach } from "@/lib/coachs"
import { envoyerAuCompte, notificationsConfigurees } from "@/lib/notifications/envoi"
import { essai } from "@/lib/notifications/messages"
import { createClient } from "@/lib/supabase/server"

// Les appareils qui reçoivent les notifications. Ce n'est pas le programme : rien ne passe par
// l'historique des modifications. Les réglages (quoi recevoir, à quelle heure) sont dans le
// profil et passent, eux, par modifierProfil.

export type AppareilAAbonner = { endpoint: string; keys: { p256dh: string; auth: string } }

// La clé publique VAPID est lue au démarrage du serveur, pas à la construction de l'application.
export async function configurationNotifications() {
  return { disponibles: notificationsConfigurees(), clePublique: process.env.VAPID_PUBLIC_KEY ?? null }
}

const fuseauValide = (fuseau: unknown) => {
  if (typeof fuseau !== "string" || fuseau.length > 64) return false
  try {
    new Intl.DateTimeFormat("fr", { timeZone: fuseau })
    return true
  } catch {
    return false
  }
}

export async function abonnerAppareil(appareil: AppareilAAbonner, fuseau: string): Promise<{ ok: boolean; message?: string }> {
  const valide =
    typeof appareil?.endpoint === "string" &&
    appareil.endpoint.startsWith("https://") &&
    appareil.endpoint.length <= 1000 &&
    typeof appareil.keys?.p256dh === "string" &&
    appareil.keys.p256dh.length <= 200 &&
    typeof appareil.keys?.auth === "string" &&
    appareil.keys.auth.length <= 100
  if (!valide) return { ok: false, message: "Ce navigateur a renvoyé un abonnement incomplet. Réessaie." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("abonner_appareil", {
    p_endpoint: appareil.endpoint,
    p_p256dh: appareil.keys.p256dh,
    p_auth: appareil.keys.auth,
    p_fuseau: fuseauValide(fuseau) ? fuseau : "Europe/Paris",
  })
  if (error) {
    return { ok: false, message: error.code === "28000" ? "Session expirée. Reconnecte-toi." : "Activation impossible. Réessaie." }
  }
  return { ok: true }
}

export async function desabonnerAppareil(endpoint: string) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return
  const supabase = await createClient()
  await supabase.from("push_abonnements").delete().eq("endpoint", endpoint)
}

// Le coach écrit tout de suite à tous les appareils du compte.
export async function envoyerEssai(): Promise<{ ok: boolean; message: string }> {
  if (!notificationsConfigurees()) return { ok: false, message: "Les notifications ne sont pas configurées sur le serveur." }
  const supabase = await createClient()
  const { data: profil } = await supabase.from("profiles").select("id, coach").maybeSingle()
  if (!profil) return { ok: false, message: "Session expirée. Reconnecte-toi." }
  const recues = await envoyerAuCompte(
    supabase,
    profil.id,
    essai(estUnCoach(profil.coach) ? profil.coach : null, new Date().toISOString().slice(0, 10))
  )
  return recues > 0
    ? { ok: true, message: recues > 1 ? `Envoyée sur tes ${recues} appareils.` : "Envoyée. Elle arrive dans quelques secondes." }
    : { ok: false, message: "Aucun appareil n'a pu la recevoir. Désactive puis réactive les notifications." }
}
