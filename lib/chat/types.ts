// Ce qu'un message de l'assistant emporte en plus de son texte : les effets de ses outils.
// Stocké dans chat_messages.tool_calls et relu par l'écran de chat.

// Ce que le chatbot a le droit d'écrire. Le protocole pied, le plan de course et le profil
// (objectifs de calories et de protéines) n'y figurent pas : il ne peut pas y toucher (SPEC 7.4).
export const TABLES_DU_CHAT: readonly string[] = [
  "workouts", "workout_exercises", "exercises", "meals", "meal_plan",
  "body_metrics", "foot_logs", "grocery_list_items",
]
// Au-delà, l'opération se fait à la main dans l'application (SPEC 7.4, règle 4).
export const LIGNES_MAX_DU_CHAT = 5

export type LigneDiff ={ titre: string; avant: string | null; apres: string | null }

export type ChangementChat = {
  table: string
  operation: "insert" | "update" | "delete"
  id: string
  data?: Record<string, unknown>
}

// Les trois issues possibles d'un outil d'écriture (SPEC 7.3) :
//   applique  écrit tout de suite, annulable
//   propose   carte avant/après ; rien n'est écrit avant l'appui sur « Appliquer »
export type Effet =
  | { type: "applique"; id: string; groupeId: string; resume: string }
  | {
      type: "propose"
      id: string
      resume: string
      diff: LigneDiff[]
      statut: "en_attente" | "appliquee" | "abandonnee"
      // Les écritures à faire si la proposition est acceptée. Relues côté serveur, jamais reçues du navigateur.
      changements: ChangementChat[]
      // Compte dans le quota mensuel de modifications par l'IA.
      quota: boolean
      groupeId?: string
    }

export type DonneesMessage = {
  effets: Effet[]
  // Réservation de quota déjà faite pour ce message : plusieurs écritures d'une même demande n'en consomment qu'une.
  demandeIa: string | null
}
