import Anthropic from "@anthropic-ai/sdk"

import { CONSIGNE, construireEtat } from "@/lib/chat/consigne"
import { creerOutils, nouveauCumul } from "@/lib/chat/outils"
import type { DonneesMessage, Effet } from "@/lib/chat/types"
import type { Json } from "@/lib/database.types"
import { createClient } from "@/lib/supabase/server"

// Route du chatbot (SPEC 7.1). La clé API ne vit qu'ici, côté serveur.
// Une réponse avec plusieurs appels d'outils peut dépasser la minute.
export const maxDuration = 300

const MODELE = "claude-opus-5-5"
const MESSAGES_D_HISTORIQUE = 20
const TOURS_D_OUTILS_MAX = 8
const LONGUEUR_MAX = 2000

const echec = (message: string, status = 502) => Response.json({ ok: false, message }, { status })

const STATUT = { en_attente: "en attente de sa réponse", appliquee: "acceptée et appliquée", abandonnee: "laissée de côté" }

// Un ancien message de l'assistant est rendu au modèle avec ce que ses outils avaient fait :
// sans cela il ne saurait plus ce qui est appliqué, ni quel identifiant passer à « annuler ».
function pourLeModele(message: { role: string; content: string; tool_calls: Json | null }) {
  const effets = (message.tool_calls as unknown as DonneesMessage | null)?.effets ?? []
  if (message.role !== "assistant" || effets.length === 0) return message.content
  const suivi = effets.map((effet) =>
    effet.type === "applique"
      ? `- appliqué : ${effet.resume} (identifiant d'historique ${effet.groupeId})`
      : `- proposition ${STATUT[effet.statut]} : ${effet.resume}${effet.groupeId ? ` (identifiant d'historique ${effet.groupeId})` : ""}`
  )
  return `${message.content}\n\n<suivi_application>\n${suivi.join("\n")}\n</suivi_application>`
}

export async function POST(request: Request) {
  const corps = (await request.json().catch(() => null)) as { texte?: unknown; aujourdhui?: unknown } | null
  const texte = typeof corps?.texte === "string" ? corps.texte.trim() : ""
  const aujourdhui = typeof corps?.aujourdhui === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corps.aujourdhui) ? corps.aujourdhui : null
  if (!texte || texte.length > LONGUEUR_MAX || !aujourdhui) return echec("Message invalide.", 400)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return echec("Session expirée. Reconnecte-toi.", 401)

  const recu = new Date().toISOString()
  const [{ data: historique }, { etat, alimentsExclus }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("role, content, tool_calls")
      .order("created_at", { ascending: false })
      .limit(MESSAGES_D_HISTORIQUE),
    construireEtat(supabase, aujourdhui),
  ])
  const anciens = (historique ?? []).reverse()
  // La conversation envoyée au modèle doit s'ouvrir sur un message de l'utilisateur.
  while (anciens.length > 0 && anciens[0].role !== "user") anciens.shift()

  const effets: Effet[] = []
  const quota = { demandeIa: null as string | null }
  const outils = creerOutils({ supabase, aujourdhui, alimentsExclus, effets, quota, cumul: nouveauCumul() })
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...anciens.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: pourLeModele(m) })),
    { role: "user", content: texte },
  ]

  let reponse = ""
  try {
    const client = new Anthropic()
    const final = await client.beta.messages.toolRunner({
      model: MODELE,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // Requête refusée par un filtre de sécurité : l'API la rejoue sur le modèle de repli recommandé.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: CONSIGNE, cache_control: { type: "ephemeral" } },
        { type: "text", text: `État actuel du programme de l'utilisateur :\n${JSON.stringify(etat)}` },
      ],
      tools: outils,
      messages,
      max_iterations: TOURS_D_OUTILS_MAX,
    })

    if (final.stop_reason === "refusal") {
      reponse = "Je ne peux pas répondre à cette demande. Reformule-la, ou pose-moi une question sur ton entraînement ou ton alimentation."
    } else {
      reponse = final.content.flatMap((bloc) => (bloc.type === "text" ? [bloc.text] : [])).join("\n")
      if (final.stop_reason === "max_tokens") reponse += "\n\n(Réponse coupée : elle était trop longue.)"
    }
  } catch (erreur) {
    console.error("[chat]", erreur)
    // Une écriture a pu être appliquée avant l'échec : on la montre quand même, pour qu'elle reste annulable.
    if (effets.length === 0) {
      if (erreur instanceof Anthropic.AuthenticationError) return echec("La clé de l'assistant est refusée. Préviens l'administrateur.")
      if (erreur instanceof Anthropic.RateLimitError) return echec("L'assistant est très sollicité. Réessaie dans une minute.", 429)
      if (erreur instanceof Anthropic.APIConnectionError) return echec("L'assistant est injoignable. Vérifie ta connexion et réessaie.")
      if (erreur instanceof Anthropic.APIError) return echec("L'assistant a rencontré une erreur. Réessaie.")
      const identifiants = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
      return echec(identifiants ? "L'assistant a rencontré une erreur inattendue. Réessaie." : "L'assistant n'est pas encore configuré sur ce serveur.")
    }
    reponse = "J'ai été interrompu avant de finir ma réponse. Voici où j'en étais."
  }

  // Le bloc de suivi est ajouté par l'application : le modèle n'a pas à l'écrire lui-même.
  reponse = reponse.replace(/<suivi_application>[\s\S]*?(<\/suivi_application>|$)/g, "").trim()
  if (!reponse) {
    reponse = effets.some((effet) => effet.type === "propose")
      ? "Voici ce que je te propose."
      : effets.length > 0
        ? "C'est fait."
        : "Je n'ai pas réussi à aller au bout de ta demande. Reformule-la, ou découpe-la en étapes."
  }

  // Les deux messages sont écrits ensemble, une fois la réponse obtenue : une demande qui échoue
  // ne laisse pas de question sans réponse dans la conversation.
  const donnees: DonneesMessage = { effets, demandeIa: quota.demandeIa }
  const { error } = await supabase.from("chat_messages").insert([
    { user_id: user.id, role: "user", content: texte, tool_calls: null, created_at: recu },
    { user_id: user.id, role: "assistant", content: reponse, tool_calls: donnees as unknown as Json, created_at: new Date().toISOString() },
  ])
  if (error) return echec("La réponse n'a pas pu être enregistrée. Recharge la page.", 500)

  return Response.json({ ok: true })
}
