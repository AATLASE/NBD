"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ArrowUp, MessageCircle } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { EnTete, Vide } from "@/components/blocs"
import { Bulle, Message, type ActionsChat } from "@/components/chat/message"
import { AvatarCoach } from "@/components/coach/avatar"
import { Attente } from "@/components/etats"
import { Button, buttonVariants } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import { DUREE_DE_VIE_MESSAGE_MS } from "@/lib/chat/types"
import { COACH, estUnCoach } from "@/lib/coachs"
import { annoncer, useEdition } from "@/lib/edition"
import { abandonnerProposition, appliquerProposition } from "@/lib/mutations"
import { useMessagesChat, useModifications, useProfil, useQuotaIa } from "@/lib/queries"

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
  const profil = useProfil()
  // Le coach choisi donne son nom et son portrait au chat. Sans coach : un assistant neutre.
  const idCoach = estUnCoach(profil.data?.coach) ? profil.data.coach : null
  const coach = idCoach ? COACH[idCoach] : null
  const queryClient = useQueryClient()
  const { executer, defaire, rafraichir, enCours } = useEdition()

  const [brouillon, setBrouillon] = useState("")
  // Le message parti et pas encore répondu : affiché tout de suite, avant que le serveur l'enregistre.
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const saisie = useRef<HTMLTextAreaElement>(null)
  const fin = useRef<HTMLDivElement>(null)

  // Un message disparaît dix minutes après son envoi, même si l'écran reste ouvert : un minuteur
  // relance l'affichage à chaque échéance.
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const visibles = useMemo(
    () =>
      messages.data?.filter(
        (m) => m.created_at !== null && Date.parse(m.created_at) + DUREE_DE_VIE_MESSAGE_MS > maintenant
      ),
    [messages.data, maintenant]
  )
  useEffect(() => {
    const echeances = (visibles ?? []).map((m) => Date.parse(m.created_at!) + DUREE_DE_VIE_MESSAGE_MS)
    if (echeances.length === 0) return
    const minuteur = setTimeout(() => setMaintenant(Date.now()), Math.max(0, Math.min(...echeances) - Date.now()) + 50)
    return () => clearTimeout(minuteur)
  }, [visibles])

  const nombre = visibles?.length ?? 0
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
  const vide = visibles?.length === 0 && envoi === null

  return (
    <>
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(10.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          {idCoach && <AvatarCoach coach={idCoach} className="size-14 rounded-2xl" />}
          <EnTete
            titre={coach ? coach.nom : "Chat"}
            sousTitre={
              limite === null
                ? coach
                  ? `${coach.titre} · ton coach`
                  : "Pose une question ou demande un changement"
                : `Questions illimitées. Modifications ce mois-ci : ${quota.data?.utilisees ?? 0} sur ${limite}.`
            }
          />
        </div>

        {!visibles ? (
          <Attente requetes={[messages]} />
        ) : vide ? (
          <div className="space-y-4">
            {coach ? (
              <div className="rounded-2xl border border-dashed px-5 py-6 text-center">
                <p className="font-medium">« {coach.accroche} »</p>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                  {coach.nom} connaît tes séances, tes menus et tes mesures. Pose une question ou demande un
                  changement : tu peux toujours annuler.
                </p>
              </div>
            ) : (
              <>
                <Vide Icone={MessageCircle} titre="Ton assistant sport et nutrition">
                  Il connaît tes séances, tes menus et tes mesures. Il répond à tes questions et peut modifier ton
                  programme : tu peux toujours annuler.
                </Vide>
                <Link
                  href="/parametres"
                  className={buttonVariants({ variant: "outline", className: "h-12 w-full text-base" })}
                >
                  Choisir mon coach
                </Link>
              </>
            )}
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
            {visibles.map((message) => (
              <Message key={message.id} message={message} actions={actions} coach={idCoach} />
            ))}
            {envoi !== null && (
              <>
                <Bulle deMoi>{envoi}</Bulle>
                <p role="status" className="animate-pulse px-1 text-muted-foreground motion-reduce:animate-none">
                  {coach ? `${coach.nom} réfléchit…` : "L'assistant réfléchit…"}
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
              Ton message au coach
            </label>
            <textarea
              id="message"
              ref={saisie}
              rows={1}
              value={brouillon}
              maxLength={LONGUEUR_MAX}
              enterKeyHint="send"
              placeholder={coach ? `Écris à ${coach.nom}` : "Écris à ton assistant"}
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
