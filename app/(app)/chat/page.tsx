"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ArrowUp, MessageCircle } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { EnTete, Vide } from "@/components/blocs"
import { Bulle, Message, type ActionsChat } from "@/components/chat/message"
import { Attente } from "@/components/etats"
import { Button } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import { annoncer, useEdition } from "@/lib/edition"
import { abandonnerProposition, appliquerProposition } from "@/lib/mutations"
import { useMessagesChat, useModifications, useQuotaIa } from "@/lib/queries"

const LONGUEUR_MAX = 2000

const EXEMPLES = [
  "Qu'est-ce que je mange ce soir ?",
  "Quelle séance je fais aujourd'hui ?",
  "Je suis fatigué, allège ma prochaine séance",
]

export default function Chat() {
  const aujourdhui = useAujourdhui()
  const messages = useMessagesChat()
  const modifications = useModifications()
  const quota = useQuotaIa()
  const queryClient = useQueryClient()
  const { executer, defaire, rafraichir, enCours } = useEdition()

  const [brouillon, setBrouillon] = useState("")
  // Le message parti et pas encore répondu : affiché tout de suite, avant que le serveur l'enregistre.
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const saisie = useRef<HTMLTextAreaElement>(null)
  const fin = useRef<HTMLDivElement>(null)

  const nombre = messages.data?.length ?? 0
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" })
  }, [nombre, envoi])

  // La zone de saisie grandit avec le texte, jusqu'à quelques lignes.
  useEffect(() => {
    const zone = saisie.current
    if (!zone) return
    zone.style.height = "auto"
    zone.style.height = `${zone.scrollHeight}px`
  }, [brouillon])

  const annulees = useMemo(() => {
    const etats = new Map<string, boolean>()
    for (const m of modifications.data ?? []) etats.set(m.groupe_id, etats.get(m.groupe_id) || m.undone_at !== null)
    return etats
  }, [modifications.data])

  const actions: ActionsChat = {
    etatDe: (groupeId) => (annulees.has(groupeId) ? (annulees.get(groupeId) ? "annulee" : "active") : "inconnue"),
    annuler: (groupeId) => void defaire(groupeId),
    // Pas de bandeau en cas de succès : dans le chat, la confirmation et le bouton « Annuler »
    // sont dans le message lui-même, et y restent. Un bandeau flottant les masquerait.
    appliquer: (messageId, effetId) =>
      void executer(() => appliquerProposition(messageId, effetId), undefined, { silencieux: true }),
    abandonner: async (messageId, effetId) => {
      const resultat = await abandonnerProposition(messageId, effetId).catch(() => ({
        ok: false as const,
        message: "Pas de réseau. Réessaie.",
      }))
      if (!resultat.ok) annoncer(resultat.message, { erreur: true })
      await queryClient.invalidateQueries({ queryKey: ["chat"] })
    },
    occupe: enCours || envoi !== null,
  }

  async function envoyer(texte: string) {
    const propre = texte.trim()
    if (!propre || envoi !== null || !aujourdhui) return
    setEnvoi(propre)
    setErreur(null)
    setBrouillon("")

    let message: string | null = null
    try {
      const reponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texte: propre, aujourdhui }),
      })
      const corps = (await reponse.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!reponse.ok || !corps?.ok) message = corps?.message ?? "L'assistant ne répond pas. Réessaie."
    } catch {
      message = "Pas de réseau. Ton message n'est pas parti."
    }

    // L'assistant a pu modifier le programme : tout ce qui en dépend est relu.
    await rafraichir()
    if (message) {
      // Rien n'a été enregistré : le texte revient dans la zone de saisie, prêt à repartir.
      setErreur(message)
      setBrouillon(propre)
    }
    setEnvoi(null)
  }

  const limite = quota.data?.limite ?? null
  const vide = messages.data?.length === 0 && envoi === null

  return (
    <>
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(10.5rem+env(safe-area-inset-bottom))]">
        <EnTete
          titre="Chat"
          sousTitre={
            limite === null
              ? "Pose une question ou demande un changement"
              : `Questions illimitées. Modifications par l'assistant ce mois-ci : ${quota.data?.utilisees ?? 0} sur ${limite}.`
          }
        />

        {!messages.data ? (
          <Attente requetes={[messages]} />
        ) : vide ? (
          <div className="space-y-4">
            <Vide Icone={MessageCircle} titre="Ton assistant sport et nutrition">
              Il connaît tes séances, tes menus et tes mesures. Il répond à tes questions et peut modifier ton programme
              : tu peux toujours annuler.
            </Vide>
            <ul className="space-y-2">
              {EXEMPLES.map((exemple) => (
                <li key={exemple}>
                  <Button
                    variant="outline"
                    className="h-auto min-h-12 w-full justify-start rounded-xl px-4 py-2.5 text-left text-base font-normal whitespace-normal"
                    disabled={!aujourdhui}
                    onClick={() => void envoyer(exemple)}
                  >
                    {exemple}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.data.map((message) => (
              <Message key={message.id} message={message} actions={actions} />
            ))}
            {envoi !== null && (
              <>
                <Bulle deMoi>{envoi}</Bulle>
                <p role="status" className="animate-pulse px-1 text-muted-foreground motion-reduce:animate-none">
                  L&apos;assistant réfléchit…
                </p>
              </>
            )}
          </div>
        )}
        <div ref={fin} aria-hidden="true" className="scroll-mb-44" />
      </main>

      <form
        data-saisie-chat
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background px-4 py-2"
        onSubmit={(evenement) => {
          evenement.preventDefault()
          void envoyer(brouillon)
        }}
      >
        <div className="mx-auto max-w-lg space-y-2">
          {erreur && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              {erreur}
            </p>
          )}
          <div className="flex items-end gap-2">
            <label htmlFor="message" className="sr-only">
              Ton message à l&apos;assistant
            </label>
            <textarea
              id="message"
              ref={saisie}
              rows={1}
              value={brouillon}
              maxLength={LONGUEUR_MAX}
              enterKeyHint="send"
              placeholder="Écris à ton assistant"
              className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border bg-card px-4 py-[0.6875rem] text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(evenement) => setBrouillon(evenement.target.value)}
              onKeyDown={(evenement) => {
                if (evenement.key !== "Enter" || evenement.shiftKey || evenement.nativeEvent.isComposing) return
                evenement.preventDefault()
                void envoyer(brouillon)
              }}
            />
            <Button
              type="submit"
              aria-label="Envoyer"
              className="size-12 shrink-0 rounded-full"
              disabled={envoi !== null || !brouillon.trim() || !aujourdhui}
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}
