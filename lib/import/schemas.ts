import { z } from "zod"

import { EQUIPEMENTS, GROUPES, JOURS, LIEUX, SLOTS } from "@/lib/libelles"

// Forme de ce que le téléphone envoie après avoir lu un fichier. Le serveur ne fait confiance à
// rien de ce qui arrive : ces schémas revalident tout avant la moindre écriture.

const ExerciceSchema = z.object({
  nom: z.string(),
  groupe: z.enum(GROUPES),
  equipement: z.enum(EQUIPEMENTS),
  series: z.number().int(),
  reps_min: z.number().int().nullable(),
  reps_max: z.number().int().nullable(),
  duree_sec: z.number().int().nullable(),
  repos_sec: z.number().int(),
  charge_depart_kg: z.number().nullable(),
  charge_cible_kg: z.number().nullable(),
  increment_kg: z.number().nullable(),
  note: z.string().nullable(),
})

export const ImportSeancesSchema = z.object({
  seances: z
    .array(
      z.object({
        nom: z.string(),
        lieu: z.enum(LIEUX),
        duree_min: z.number().int(),
        jour: z.enum(JOURS).nullable(),
        note: z.string().nullable(),
        exercices: z.array(ExerciceSchema).min(1).max(20),
      })
    )
    .min(1)
    .max(20),
})

export const ImportNutritionSchema = z.object({
  plats: z
    .array(
      z.object({
        nom: z.string(),
        slot: z.enum(SLOTS),
        kcal: z.number(),
        proteines_g: z.number(),
        lipides_g: z.number().nullable(),
        glucides_g: z.number().nullable(),
        temps_min: z.number().nullable(),
        recette_md: z.string().nullable(),
        ingredients: z
          .array(z.object({ nom: z.string(), quantite: z.number().nullable(), unite: z.string().nullable() }))
          .max(30),
      })
    )
    .min(1)
    .max(120),
  cases: z
    .array(
      z.object({
        semaine: z.union([z.literal(1), z.literal(2)]),
        jour: z.enum(JOURS),
        slot: z.enum(SLOTS),
        // Indice du plat dans `plats`.
        plat: z.number().int().min(0),
      })
    )
    .max(70),
})

export type ImportSeances = z.infer<typeof ImportSeancesSchema>
export type ImportNutrition = z.infer<typeof ImportNutritionSchema>
