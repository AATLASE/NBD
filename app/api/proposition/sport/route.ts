import { lireContexte } from "@/lib/proposition/contexte"
import { nettoyerSport } from "@/lib/proposition/garde-fous"
import { genererSport } from "@/lib/proposition/generation"
import { QUOTA_ATTEINT, rendreDemande, reserverDemande } from "@/lib/proposition/quota"
import { createClient } from "@/lib/supabase/server"

// Une génération peut durer plus d'une minute.
export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const contexte = await lireContexte(supabase)
  if (!contexte) {
    return Response.json(
      { ok: false, message: "Réponds d'abord au questionnaire d'accueil." },
      { status: 400 }
    )
  }

  const demande = await reserverDemande(supabase, "sport")
  if (!demande) return Response.json({ ok: false, message: QUOTA_ATTEINT, quota: true }, { status: 429 })

  const resultat = await genererSport(contexte.reponses)
  if (!resultat.ok) {
    await rendreDemande(supabase, demande)
    return Response.json(resultat, { status: 502 })
  }

  const { proposition, retires } = nettoyerSport(resultat.proposition, contexte.garde)
  if (proposition.seances.length === 0) {
    await rendreDemande(supabase, demande)
    return Response.json(
      { ok: false, message: "La proposition ne convenait pas à ton matériel. Réessaie." },
      { status: 502 }
    )
  }
  return Response.json({ ok: true, proposition, retires })
}
