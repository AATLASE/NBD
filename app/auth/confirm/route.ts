import type { EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

// Arrivée du lien magique. Deux formes possibles selon le gabarit d'email :
//   ?token_hash=…&type=email   gabarit du projet, fonctionne depuis n'importe quel appareil
//   ?code=…                    gabarit Supabase par défaut (PKCE), même navigateur uniquement
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")

  const supabase = await createClient()
  let connecte = false

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    connecte = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    connecte = !error
  }

  redirect(connecte ? "/" : "/login?erreur=lien")
}
