// Lancé une fois au démarrage du serveur. Il passe en revue les rappels des jours de séance toutes
// les cinq minutes (lib/notifications/rappels.ts) : pas de tâche planifiée à régler chez l'hébergeur.

const PERIODE_MS = 5 * 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.info("[rappels] désactivés : SUPABASE_SECRET_KEY ou les clés VAPID manquent")
    return
  }
  // En développement, le serveur peut se recharger : un seul minuteur à la fois.
  const global = globalThis as { rappelsNbd?: ReturnType<typeof setInterval> }
  if (global.rappelsNbd) clearInterval(global.rappelsNbd)

  const { envoyerLesRappels } = await import("@/lib/notifications/rappels")
  const passer = () => void envoyerLesRappels().catch((erreur) => console.error("[rappels]", erreur))
  global.rappelsNbd = setInterval(passer, PERIODE_MS)
  passer()
}
