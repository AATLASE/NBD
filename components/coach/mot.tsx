"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { AvatarCoach } from "@/components/coach/avatar"
import { COACH, estUnCoach, phraseDuCoach, type Moment } from "@/lib/coachs"
import { useProfil } from "@/lib/queries"

// Un mot du coach, écrit à l'avance dans son style : sur l'accueil et à la fin d'une séance.
// Il dépend du jour et de la situation, pas de l'assistant : il s'affiche aussi hors ligne.
// Tant qu'aucun coach n'est choisi, l'accueil propose d'en choisir un.
export function MotDuCoach({
  moment,
  date,
  inviter = false,
}: {
  moment: Moment
  date: string
  // Sur l'accueil : sans coach, on invite à en choisir un. Ailleurs, on n'affiche rien.
  inviter?: boolean
}) {
  const profil = useProfil()
  if (!profil.data) return null
  const id = profil.data.coach

  if (!estUnCoach(id)) {
    if (!inviter) return null
    return (
      <Link
        href="/parametres"
        className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-semibold">Choisis ton coach</span>
          <span className="block text-sm text-muted-foreground">
            Quatre caractères, quatre façons de te motiver. C&apos;est dans Paramètres.
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    )
  }

  const coach = COACH[id]
  return (
    <figure className="flex items-start gap-3 rounded-2xl border bg-card p-4">
      <AvatarCoach coach={id} />
      <div className="min-w-0 flex-1">
        <figcaption className="text-sm font-semibold text-brand">{coach.nom}</figcaption>
        <blockquote className="leading-snug">{phraseDuCoach(id, moment, date)}</blockquote>
      </div>
    </figure>
  )
}
