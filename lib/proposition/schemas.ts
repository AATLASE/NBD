import { z } from "zod"

import { EQUIPEMENTS, GROUPES, JOURS, LIEUX, SLOTS } from "@/lib/libelles"

// Forme de ce que Claude doit renvoyer. Ces schémas servent trois fois : ils contraignent la
// réponse du modèle, ils la valident à l'arrivée, et ils revalident la proposition quand le
// téléphone la renvoie pour l'adopter.

const ExerciceSchema = z.object({
  nom: z.string(),
  groupe: z.enum(GROUPES),
  equipement: z.enum(EQUIPEMENTS),
  series: z.number().int(),
  // Répétitions OU durée : l'autre reste à null.
  reps_min: z.number().int().nullable(),
  reps_max: z.number().int().nullable(),
  duree_sec: z.number().int().nullable(),
  repos_sec: z.number().int(),
  charge_depart_kg: z.number().nullable(),
  charge_cible_kg: z.number().nullable(),
  increment_kg: z.number().nullable(),
  note: z.string().nullable(),
})

const SeanceSchema = z.object({
  nom: z.string(),
  lieu: z.enum(LIEUX),
  duree_min: z.number().int(),
  jour: z.enum(JOURS),
  note: z.string().nullable(),
  exercices: z.array(ExerciceSchema),
})

export const PropositionSportSchema = z.object({
  seances: z.array(SeanceSchema),
  // Deux ou trois phrases qui expliquent la logique du programme à la personne.
  conseils: z.string(),
})

const IngredientSchema = z.object({
  nom: z.string(),
  quantite: z.number().nullable(),
  unite: z.string().nullable(),
})

const PlatSchema = z.object({
  nom: z.string(),
  slot: z.enum(SLOTS),
  kcal: z.number().int(),
  proteines_g: z.number().int(),
  lipides_g: z.number().int(),
  glucides_g: z.number().int(),
  temps_min: z.number().int(),
  recette_md: z.string(),
  ingredients: z.array(IngredientSchema),
})

export const PropositionNutritionSchema = z.object({
  plats: z.array(PlatSchema),
  conseils: z.string(),
})

export type ExercicePropose = z.infer<typeof ExerciceSchema>
export type SeanceProposee = z.infer<typeof SeanceSchema>
export type PropositionSport = z.infer<typeof PropositionSportSchema>
export type PlatPropose = z.infer<typeof PlatSchema>
export type PropositionNutrition = z.infer<typeof PropositionNutritionSchema>
