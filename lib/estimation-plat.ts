import "server-only"

import { z } from "zod"

import { generer, type Generation, type ReglagesGeneration } from "@/lib/proposition/generation"

// Estimation par Claude de ce qu'apporte une portion d'un plat, d'après ses ingrédients.
// Complète le calcul de l'application (lib/nutriments.ts) : l'assistant sait compter un ingrédient
// absent de la table ou sans quantité, en disant ce qu'il a supposé. Il ne modifie rien : les
// valeurs reviennent dans la fiche du plat, et c'est la personne qui enregistre.

export const EstimationPlatSchema = z.object({
  kcal: z.number().int(),
  proteines_g: z.number().int(),
  lipides_g: z.number().int(),
  glucides_g: z.number().int(),
  // Ce que le modèle a dû supposer (quantité absente, ingrédient ambigu). Vide si tout était chiffré.
  hypotheses: z.array(z.string()),
})
export type EstimationPlat = z.infer<typeof EstimationPlatSchema>

export type PlatAEstimer = {
  nom: string
  ingredients: { nom: string; quantite: number | null; unite: string | null }[]
  recette: string | null
}

const CONSIGNE = `Tu es diététicien. On te donne un plat tel qu'une personne l'a saisi dans son application de suivi nutritionnel : son nom, ses ingrédients pour une portion (avec quantité et unité quand elle les a renseignées) et parfois sa recette. Estime ce qu'apporte une portion : calories, protéines, lipides et glucides.

- Les quantités sont celles d'une portion. Le riz, les pâtes, les céréales et les légumineuses sont pesés crus ou secs, sauf si le nom dit « cuit » ou « en boîte ».
- Un ingrédient sans quantité : suppose la quantité habituelle pour une portion de ce plat, et note-la dans \`hypotheses\`.
- Un ingrédient ambigu (« poulet ou jambon ») : prends le premier cité, et note-le.
- La liste d'ingrédients fait foi. La recette sert seulement à comprendre le plat : si elle est écrite pour plusieurs portions, ne multiplie rien.
- Ne compte que ce qui figure dans la liste : pas de matière grasse de cuisson ni d'accompagnement ajoutés de ta propre initiative.
- Arrondis les calories à la dizaine et les protéines, lipides et glucides au gramme.
- \`hypotheses\` : au plus cinq phrases très courtes, en français, une par supposition (« Sauce tomate : 80 g »). Liste vide si tu n'as rien eu à supposer.
- Si la liste ne contient aucun aliment identifiable, renvoie 0 partout et dis pourquoi dans \`hypotheses\`.`

const REGLAGES: ReglagesGeneration = {
  maxTokens: 8000,
  textes: {
    refus: "L'assistant n'a pas pu estimer ce plat.",
    coupee: "L'estimation a été coupée. Réessaie.",
    incomplete: "L'estimation reçue était incomplète. Réessaie.",
    illisible: "L'estimation reçue était illisible. Réessaie.",
    nonConfiguree: "L'assistant n'est pas encore configuré sur ce serveur.",
  },
}

const borner = (valeur: number, max: number) => Math.min(max, Math.max(0, Math.round(valeur)))

export async function estimerPlatParIA(plat: PlatAEstimer): Promise<Generation<EstimationPlat>> {
  const resultat = await generer(EstimationPlatSchema, CONSIGNE, plat, REGLAGES)
  if (!resultat.ok) return resultat
  const e = resultat.proposition
  // Les bornes sont celles de la fiche d'un plat : une réponse hors bornes y est ramenée.
  return {
    ok: true,
    proposition: {
      kcal: borner(e.kcal, 3000),
      proteines_g: borner(e.proteines_g, 300),
      lipides_g: borner(e.lipides_g, 300),
      glucides_g: borner(e.glucides_g, 500),
      hypotheses: e.hypotheses.slice(0, 5).map((h) => h.trim().slice(0, 200)).filter(Boolean),
    },
  }
}
