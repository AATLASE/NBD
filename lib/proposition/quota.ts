import "server-only"

import type { createClient } from "@/lib/supabase/server"

type Client = Awaited<ReturnType<typeof createClient>>

export const QUOTA_ATTEINT =
  "Tu as utilisé toutes tes propositions de ce mois. Elles reviennent le mois prochain ; un abonnement permettra bientôt d'en avoir davantage."

// Réserve une demande IA avant d'appeler le modèle. La base vérifie le quota du mois et inscrit
// la demande d'un seul geste : deux demandes simultanées ne peuvent pas passer ensemble.
// Renvoie l'identifiant de la demande, ou null si le quota est atteint.
export async function reserverDemande(supabase: Client, type: "sport" | "nutrition") {
  const { data, error } = await supabase.rpc("reserver_demande_ia", { p_type: type })
  if (error) throw error
  return data as string | null
}

// Une demande qui n'a rien produit (erreur, refus, proposition inutilisable) n'est pas décomptée.
export async function rendreDemande(supabase: Client, id: string) {
  await supabase.rpc("rendre_demande_ia", { p_id: id })
}
