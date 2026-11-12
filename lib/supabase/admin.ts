import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

// Accès serveur sans session, au-dessus des règles d'accès : seulement pour ce qui ne part d'aucun
// utilisateur connecté (le rappel du matin des jours de séance). Sans clé secrète, il n'existe pas.
export function createAdminClient() {
  const cle = process.env.SUPABASE_SECRET_KEY
  if (!cle || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
