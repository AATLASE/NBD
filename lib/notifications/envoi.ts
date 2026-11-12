import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import webpush from "web-push"

import type { Database } from "@/lib/database.types"
import type { Notification } from "@/lib/notifications/messages"

// Envoi des notifications (Web Push). Les trois variables VAPID identifient l'application auprès
// des services de notification (Google, Apple, Mozilla) ; sans elles, rien n'est envoyé et
// l'onglet Paramètres dit que les notifications ne sont pas disponibles.

export const notificationsConfigurees = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)

let configure = false

// Le temps pendant lequel le service de notification garde un message pour un téléphone éteint.
const GARDE_SEC = 12 * 3600

// Envoie à tous les appareils du compte. Renvoie le nombre d'appareils qui l'ont accepté.
export async function envoyerAuCompte(supabase: SupabaseClient<Database>, userId: string, notification: Notification) {
  if (!notificationsConfigurees()) return 0
  if (!configure) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
    configure = true
  }

  const { data: appareils } = await supabase
    .from("push_abonnements")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
  const envois = await Promise.all(
    (appareils ?? []).map(async (appareil) => {
      try {
        await webpush.sendNotification(
          { endpoint: appareil.endpoint, keys: { p256dh: appareil.p256dh, auth: appareil.auth } },
          JSON.stringify(notification),
          { TTL: GARDE_SEC }
        )
        return true
      } catch (erreur) {
        const statut = (erreur as { statusCode?: number }).statusCode
        // L'appareil ne veut plus rien recevoir (autorisation retirée, application désinstallée) : on l'oublie.
        if (statut === 404 || statut === 410) await supabase.from("push_abonnements").delete().eq("id", appareil.id)
        else console.error("[notifications]", statut, erreur instanceof Error ? erreur.message : erreur)
        return false
      }
    })
  )
  return envois.filter(Boolean).length
}
