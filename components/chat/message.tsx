"use client"

import { cn } from "cn"
import { Check, Undo2, X } from "lucide-react"
import Markdown from "react-markdown"

import { AvatarCoach } from "@/components/coach/avatar"
import { Button } from "@/components/ui/button"
import type { DonneesMessage, Effet } from "@/lib/chat/types"
import type { IdCoach } from "@/lib/coachs"
import type { MessageChat } from "@/lib/queries"

// Un message du chat et, pour l'assistant, ce que ses outils proposent. Toute modification
// arrive sur une carte avec deux boutons, « Accepter » et « Refuser » : rien n'est écrit sans
// accord. Les anciens messages peuvent encore porter une modification appliquée d'office.

// État d'une modification dans l'historique. `inconnue` : trop ancienne pour être relue ici.
export type EtatModification = "active" | "annulee" | "inconnue"

export type ActionsChat = {
  etatDe: (groupeId: string) => EtatModification
  annuler: (groupeId: string) => void
  appliquer: (messageId: string, effetId: string) => void
  abandonner: (messageId: string, effetId: string) => void
  occupe: boolean
}

function lireEffets(brut: unknown): Effet[] {
  const effets = (brut as DonneesMessage | null)?.effets
  return Array.isArray(effets) ? effets : []
}

export function Bulle({
  deMoi,
  coach,
  children,
}: {
  deMoi: boolean
  // Le coach qui parle, pour afficher son portrait à côté de la bulle.
  coach?: IdCoach | null
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex items-start gap-2", deMoi ? "justify-end" : "justify-start")}>
      {!deMoi && coach && <AvatarCoach coach={coach} className="mt-0.5 size-9 rounded-lg" />}
      <div
        className={cn(
          "max-w-[88%] space-y-2 rounded-2xl px-4 py-2.5 leading-relaxed wrap-break-word",
          deMoi ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"
        )}
      >
        {children}
      </div>
    </div>
  )
}

function Texte({ children }: { children: string }) {
  return (
    <Markdown
      components={{
        h1: ({ children }) => <p className="font-semibold">{children}</p>,
        h2: ({ children }) => <p className="font-semibold">{children}</p>,
        h3: ({ children }) => <p className="font-semibold">{children}</p>,
        ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </Markdown>
  )
}

function BoutonAnnuler({ groupeId, actions }: { groupeId: string; actions: ActionsChat }) {
  return (
    <Button
      variant="outline"
      className="h-11 shrink-0 px-4 text-base font-semibold"
      disabled={actions.occupe}
      onClick={() => actions.annuler(groupeId)}
    >
      Annuler
    </Button>
  )
}

function Applique({ effet, actions }: { effet: Extract<Effet, { type: "applique" }>; actions: ActionsChat }) {
  const etat = actions.etatDe(effet.groupeId)
  const annulee = etat === "annulee"
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-card py-2 pr-2 pl-3",
        !annulee && "border-success/40"
      )}
    >
      <span
        aria-hidden="true"
        className={cn("w-1 shrink-0 self-stretch rounded-full", annulee ? "bg-border" : "bg-success")}
      />
      <div className="min-w-0 flex-1 py-1">
        {annulee ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Undo2 className="size-4" aria-hidden="true" />
            Annulé
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <Check className="size-4" aria-hidden="true" />
            Appliqué
          </p>
        )}
        <p className={cn("leading-snug", annulee && "text-muted-foreground line-through")}>{effet.resume}</p>
      </div>
      {etat === "active" && <BoutonAnnuler groupeId={effet.groupeId} actions={actions} />}
    </div>
  )
}

function Proposition({
  messageId,
  effet,
  actions,
}: {
  messageId: string
  effet: Extract<Effet, { type: "propose" }>
  actions: ActionsChat
}) {
  const etat = effet.groupeId ? actions.etatDe(effet.groupeId) : "inconnue"
  const enAttente = effet.statut === "en_attente"
  return (
    <div className={cn("overflow-hidden rounded-2xl border-2 bg-card", enAttente ? "border-brand/50" : "border-border")}>
      <div className="space-y-0.5 px-4 pt-3">
        <p className={cn("text-sm font-semibold", enAttente ? "text-brand" : "text-muted-foreground")}>
          {enAttente ? "À valider" : "Proposition"}
        </p>
        <p className="leading-snug font-medium">{effet.resume}</p>
      </div>

      {effet.diff.length > 0 && (
        <ul className="space-y-3 px-4 pt-3">
          {effet.diff.map((ligne, index) => (
            <li key={index} className="space-y-1">
              <p className="text-sm text-muted-foreground">{ligne.titre}</p>
              <dl className="overflow-hidden rounded-xl border">
                <div className="flex gap-3 bg-danger-soft px-3 py-2">
                  <dt className="w-12 shrink-0 text-sm leading-6 font-semibold text-danger">Avant</dt>
                  <dd className="min-w-0 leading-6">{ligne.avant ?? "Rien"}</dd>
                </div>
                <div className="flex gap-3 border-t bg-success-soft px-3 py-2">
                  <dt className="w-12 shrink-0 text-sm leading-6 font-semibold text-success">Après</dt>
                  <dd className="min-w-0 leading-6">{ligne.apres ?? "Retiré"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {enAttente ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t p-3">
          <Button
            variant="outline"
            className="h-12 gap-2 text-base font-semibold"
            disabled={actions.occupe}
            onClick={() => actions.abandonner(messageId, effet.id)}
          >
            <X className="size-5" aria-hidden="true" />
            Refuser
          </Button>
          <Button
            className="h-12 gap-2 text-base font-semibold"
            disabled={actions.occupe}
            onClick={() => actions.appliquer(messageId, effet.id)}
          >
            <Check className="size-5" aria-hidden="true" />
            Accepter
          </Button>
        </div>
      ) : effet.statut === "abandonnee" ? (
        <p className="mt-3 flex items-center gap-1.5 border-t px-4 py-3 text-sm font-semibold text-muted-foreground">
          <X className="size-4" aria-hidden="true" />
          Refusée : rien n&apos;a été changé
        </p>
      ) : (
        <div className="mt-3 flex min-h-14 items-center gap-3 border-t py-1.5 pr-2 pl-4">
          {etat === "annulee" ? (
            <p className="flex flex-1 items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Undo2 className="size-4" aria-hidden="true" />
              Acceptée, puis annulée
            </p>
          ) : (
            <p className="flex flex-1 items-center gap-1.5 text-sm font-semibold text-success">
              <Check className="size-4" aria-hidden="true" />
              Acceptée
            </p>
          )}
          {etat === "active" && effet.groupeId && <BoutonAnnuler groupeId={effet.groupeId} actions={actions} />}
        </div>
      )}
    </div>
  )
}

export function Message({
  message,
  actions,
  coach,
}: {
  message: MessageChat
  actions: ActionsChat
  coach: IdCoach | null
}) {
  if (message.role !== "assistant") return <Bulle deMoi>{message.content}</Bulle>

  const effets = lireEffets(message.tool_calls)
  return (
    <div className="space-y-2">
      <Bulle deMoi={false} coach={coach}>
        <Texte>{message.content}</Texte>
      </Bulle>
      {effets.map((effet) =>
        effet.type === "applique" ? (
          <Applique key={effet.id} effet={effet} actions={actions} />
        ) : (
          <Proposition key={effet.id} messageId={message.id} effet={effet} actions={actions} />
        )
      )}
    </div>
  )
}
