"use client"

import { cn } from "cn"
import { Check } from "lucide-react"

import { AvatarCoach } from "@/components/coach/avatar"
import { COACH, COACHS, type IdCoach } from "@/lib/coachs"

// Le choix du coach : quatre cartes, une seule cochée. Sert au questionnaire d'accueil et aux
// paramètres.
export function ChoixCoach({
  valeur,
  onChange,
}: {
  valeur: IdCoach | null
  onChange: (coach: IdCoach) => void
}) {
  return (
    <div role="radiogroup" aria-label="Ton coach" className="space-y-3">
      {COACHS.map((id) => {
        const coach = COACH[id]
        const coche = valeur === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={coche}
            onClick={() => onChange(id)}
            className={cn(
              "flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
              coche ? "border-primary bg-brand-soft" : "border-border bg-card active:bg-muted"
            )}
          >
            <AvatarCoach coach={id} className="size-16 rounded-2xl" />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-2">
                <span className="text-lg leading-tight font-bold">{coach.nom}</span>
                <span className="text-sm font-semibold text-brand">{coach.titre}</span>
              </span>
              <span className="block text-sm leading-snug text-muted-foreground">{coach.description}</span>
              <span className="block leading-snug">« {coach.accroche} »</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                coche ? "border-primary bg-primary text-primary-foreground" : "border-input"
              )}
            >
              {coche && <Check className="size-4" strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
