import { lireContexte } from "@/lib/proposition/contexte"
import { nettoyerNutrition } from "@/lib/proposition/garde-fous"
import { genererNutrition } from "@/lib/proposition/generation"
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

  const demande = await reserverDemande(supabase, "nutrition")
  if (!demande) return Response.json({ ok: false, message: QUOTA_ATTEINT, quota: true }, { status: 429 })

  const resultat = await genererNutrition(contexte.reponses, contexte.cibles)
  if (!resultat.ok) {
    await rendreDemande(supabase, demande)
    return Response.json(resultat, { status: 502 })
  }

  const { proposition, retires } = nettoyerNutrition(resultat.proposition, contexte.garde)
  if (proposition.plats.length === 0) {
    await rendreDemande(supabase, demande)
    return Response.json(
      { ok: false, message: "Aucun plat proposé ne respectait ton régime. Réessaie." },
      { status: 502 }
    )
  }
  return Response.json({ ok: true, proposition, retires, cibles: contexte.cibles })
}
