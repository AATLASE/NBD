import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import type { z } from "zod"

import type { ReponsesAccueil } from "@/lib/accueil"
import type { Cibles } from "@/lib/cibles"
import {
  PropositionNutritionSchema,
  PropositionSportSchema,
  type PropositionNutrition,
  type PropositionSport,
} from "@/lib/proposition/schemas"

// Appels à Claude pour proposer un programme de sport et un plan nutritif.
// La clé API ne quitte jamais le serveur : ce fichier ne peut pas être importé côté navigateur.

const MODELE = "claude-opus-5-5"

export type Generation<T> = { ok: true; proposition: T } | { ok: false; message: string }

const CONSIGNE_SPORT = `Tu es préparateur physique. Tu composes le programme de départ d'une personne qui vient de créer son compte dans une application de suivi sportif. Elle pourra tout modifier ensuite : ta proposition est un point de départ réaliste, pas un programme idéal.

Ses réponses au questionnaire d'accueil te sont données en JSON. Sers-t'en ainsi :

- Nombre de séances : exactement \`seances_par_semaine\`, chacune un jour différent, avec au moins un jour de repos entre deux séances qui sollicitent les mêmes muscles quand c'est possible.
- Lieux : n'utilise que le matériel disponible là où elle s'entraîne. « salle » donne accès à tout (barres, poulies, machines). « street_workout » veut dire barres de traction, barres parallèles et poids du corps, en extérieur. « maison » veut dire poids du corps, sans matériel de salle ; ne suppose ni haltères ni kettlebell. Si elle a plusieurs lieux, répartis les séances entre eux et indique le lieu de chacune (un parc de street workout est un lieu « exterieur »).
- Niveau : règle le volume et la difficulté technique. Pour un débutant, des mouvements simples, peu d'exercices par séance, des séries loin de l'échec.
- Objectifs : ils orientent le choix des exercices, les fourchettes de répétitions et les temps de repos. Plusieurs objectifs se combinent, le premier compte le plus.
- Blessure : si l'objectif « blessure » est présent, n'inclus aucun exercice qui charge la zone indiquée, et dis-le dans \`conseils\`. Tu ne proposes pas de rééducation et tu ne poses aucun diagnostic : rappelle simplement de faire valider la reprise par un kinésithérapeute ou un médecin.
- Charges : tu ne connais pas ses charges réelles. Pour un exercice chargé, donne une charge de départ prudente au regard de son niveau et de son poids, une cible atteignable en quelques mois et un incrément. Pour un exercice au poids du corps, laisse les trois champs de charge à null.
- Répétitions ou durée : un exercice se compte soit en répétitions (reps_min et reps_max), soit en durée (duree_sec, pour le gainage ou le cardio). Laisse l'autre à null.

Écris tout en français, avec les noms d'exercices courants en salle. \`conseils\` tient en deux ou trois phrases adressées à la personne, en la tutoyant, qui expliquent la logique du programme.`

const CONSIGNE_NUTRITION = `Tu es diététicien du sport. Tu composes la base de plats d'une personne qui vient de créer son compte dans une application de suivi nutritionnel. L'application répartira ensuite tes plats sur deux semaines de menus ; la personne pourra tout modifier.

Ses réponses au questionnaire d'accueil et ses cibles quotidiennes te sont données en JSON. Les cibles ont été calculées par l'application : tu ne les changes pas, tu composes des plats qui permettent de les atteindre.

- Propose 2 petits déjeuners (slot \`petit_dej\`), 2 collations du matin (\`collation_matin\`), 5 déjeuners (\`dejeuner\`), 2 collations de l'après-midi (\`collation_aprem\`) et 5 dîners (\`diner\`).
- Une journée faite d'un plat de chaque repas doit approcher les cibles de calories et de protéines. À titre indicatif : environ 22 % des calories au petit déjeuner, 8 % par collation, 31 % au déjeuner, 31 % au dîner.
- Régime : respecte-le strictement. « pescetarien » exclut la viande mais pas le poisson ; « vegetarien » exclut viande et poisson ; « vegan » exclut tout produit d'origine animale, miel compris.
- Aliments exclus : ce sont des allergies ou des aliments que la personne ne peut pas manger. N'en utilise aucun, ni aucun de leurs dérivés ou synonymes, dans aucun plat. En cas de doute sur un ingrédient, choisis-en un autre.
- Des plats simples, bon marché, faisables en moins de 30 minutes avec des produits de supermarché.
- Pour chaque plat : les macros d'une portion, la liste des ingrédients chiffrés pour une portion (quantité et unité), et une recette courte en Markdown.

Écris tout en français. \`conseils\` tient en deux ou trois phrases adressées à la personne, en la tutoyant.`

const REFUS = { ok: false, message: "La proposition n'a pas pu être générée pour ce profil." } as const
const COUPEE = {
  ok: false,
  message: "La proposition était trop longue et a été coupée. Réessaie.",
} as const

async function generer<Schema extends z.ZodType>(
  schema: Schema,
  consigne: string,
  donnees: unknown
): Promise<Generation<z.infer<Schema>>> {
  const client = new Anthropic()
  // Raison d'arrêt relevée pendant le flux. Sur une réponse coupée ou refusée, le SDK échoue en
  // lisant le JSON incomplet avant de rendre le message : sans ce relevé, la cause serait perdue.
  let arret: string | null = null

  try {
    // En flux : une réponse longue ne se heurte pas aux délais d'attente HTTP.
    const flux = client.beta.messages.stream({
      model: MODELE,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      // Si la requête est refusée par un filtre de sécurité, l'API la rejoue sur le modèle de
      // repli recommandé, dans le même appel.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: consigne,
      messages: [{ role: "user", content: JSON.stringify(donnees) }],
    })
    flux.on("streamEvent", (evenement) => {
      if (evenement.type === "message_delta") arret = evenement.delta.stop_reason
    })
    const message = await flux.finalMessage()

    if (message.stop_reason === "refusal") return REFUS
    if (message.stop_reason === "max_tokens") return COUPEE

    const texte = message.content.find((bloc) => bloc.type === "text")?.text
    const resultat = schema.safeParse(texte ? JSON.parse(texte) : null)
    if (!resultat.success) {
      return { ok: false, message: "La proposition reçue était incomplète. Réessaie." }
    }
    return { ok: true, proposition: resultat.data }
  } catch (erreur) {
    if (arret === "refusal") return REFUS
    if (arret === "max_tokens") return COUPEE
    if (erreur instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: "La clé de l'assistant est refusée. Préviens l'administrateur." }
    }
    if (erreur instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "L'assistant est très sollicité. Réessaie dans une minute." }
    }
    if (erreur instanceof Anthropic.APIConnectionError) {
      return { ok: false, message: "L'assistant est injoignable. Vérifie ta connexion et réessaie." }
    }
    if (erreur instanceof Anthropic.APIError) {
      return { ok: false, message: "L'assistant a rencontré une erreur. Réessaie." }
    }
    if (erreur instanceof SyntaxError) {
      return { ok: false, message: "La proposition reçue était illisible. Réessaie." }
    }
    // Reste une erreur levée avant tout échange avec l'API. Sans identifiants dans
    // l'environnement, c'est qu'il n'y en a pas : la génération n'est pas configurée.
    const identifiants = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
    return {
      ok: false,
      message: identifiants
        ? "L'assistant a rencontré une erreur inattendue. Réessaie."
        : "La proposition automatique n'est pas encore configurée sur ce serveur.",
    }
  }
}

function resumeDuProfil(reponses: ReponsesAccueil) {
  return {
    poids_kg: reponses.poidsKg,
    taille_cm: reponses.tailleCm,
    age: reponses.age,
    sexe: reponses.sexe,
    objectifs: reponses.objectifs,
    zone_blessure: reponses.zoneBlessure,
  }
}

export function genererSport(reponses: ReponsesAccueil): Promise<Generation<PropositionSport>> {
  return generer(PropositionSportSchema, CONSIGNE_SPORT, {
    ...resumeDuProfil(reponses),
    lieux: reponses.lieux,
    seances_par_semaine: reponses.seancesParSemaine,
    niveau: reponses.niveau,
  })
}

export function genererNutrition(
  reponses: ReponsesAccueil,
  cibles: Cibles
): Promise<Generation<PropositionNutrition>> {
  return generer(PropositionNutritionSchema, CONSIGNE_NUTRITION, {
    ...resumeDuProfil(reponses),
    regime: reponses.regime,
    aliments_exclus: reponses.alimentsExclus,
    cibles_quotidiennes: {
      kcal: cibles.kcal,
      proteines_g: cibles.proteinesG,
      lipides_g: cibles.lipidesG,
      glucides_g: cibles.glucidesG,
    },
  })
}
