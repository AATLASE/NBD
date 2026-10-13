import { estimerPlatParIA, type PlatAEstimer } from "@/lib/estimation-plat"
import { createClient } from "@/lib/supabase/server"

// Estimation par l'assistant des calories et des macros d'un plat. Rien n'est écrit en base :
// la réponse revient dans la fiche du plat, que la personne enregistre ou non. C'est une question
// posée à l'assistant, elle ne compte donc pas dans le quota mensuel de modifications.
export const maxDuration = 120

const INGREDIENTS_MAX = 30

const echec = (message: string, status: number) => Response.json({ ok: false, message }, { status })

// Ne garde que ce qui a la forme attendue ; `null` si la demande est inutilisable.
function lirePlat(brut: unknown): PlatAEstimer | null {
  if (typeof brut !== "object" || brut === null) return null
  const { nom, ingredients, recette } = brut as Record<string, unknown>
  if (!Array.isArray(ingredients) || ingredients.length > INGREDIENTS_MAX) return null

  const lignes = ingredients.flatMap((ligne) => {
    if (typeof ligne !== "object" || ligne === null) return []
    const i = ligne as Record<string, unknown>
    if (typeof i.nom !== "string" || !i.nom.trim()) return []
    return [
      {
        nom: i.nom.trim().slice(0, 80),
        quantite: typeof i.quantite === "number" && Number.isFinite(i.quantite) && i.quantite >= 0 ? i.quantite : null,
        unite: typeof i.unite === "string" && i.unite.trim() ? i.unite.trim().slice(0, 20) : null,
      },
    ]
  })
  if (lignes.length === 0) return null
  return {
    nom: typeof nom === "string" ? nom.trim().slice(0, 90) : "",
    ingredients: lignes,
    recette: typeof recette === "string" && recette.trim() ? recette.trim().slice(0, 4000) : null,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return echec("Session expirée. Reconnecte-toi.", 401)

  const plat = lirePlat(await request.json().catch(() => null))
  if (!plat) return echec("Ajoute d'abord au moins un ingrédient.", 400)

  const resultat = await estimerPlatParIA(plat)
  if (!resultat.ok) return Response.json(resultat, { status: 502 })
  return Response.json({ ok: true, estimation: resultat.proposition })
}
