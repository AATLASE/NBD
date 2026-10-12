"use client"

import { cn } from "cn"
import { Minus, Plus } from "lucide-react"

import { nombre } from "@/lib/format"

const BOUTON =
  "flex shrink-0 items-center justify-center rounded-2xl border bg-card outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-primary active:text-primary-foreground disabled:pointer-events-none disabled:opacity-40"

// Saisie sans clavier : deux gros boutons autour d'une valeur lisible à bout de bras.
export function Stepper({
  libelle,
  valeur,
  unite,
  pas,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  compact = false,
  onChange,
}: {
  libelle: string
  valeur: number
  unite: string
  pas: number
  min?: number
  max?: number
  compact?: boolean
  onChange: (valeur: number) => void
}) {
  // Les pas décimaux (2,5 kg) accumulent des erreurs d'arrondi : on recale à deux décimales.
  const deplacer = (sens: 1 | -1) =>
    onChange(Math.min(max, Math.max(min, Math.round((valeur + sens * pas) * 100) / 100)))
  const bouton = cn(BOUTON, compact ? "size-12 rounded-xl" : "size-16")
  const icone = compact ? "size-5" : "size-7"

  return (
    <div role="group" aria-label={libelle} className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Diminuer : ${libelle}`}
        disabled={valeur <= min}
        onClick={() => deplacer(-1)}
        className={bouton}
      >
        <Minus className={icone} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="text-sm font-medium text-muted-foreground">{libelle}</p>
        <p
          className={cn(
            "leading-tight font-bold tracking-tight tabular-nums",
            compact ? "text-2xl" : "text-4xl"
          )}
          aria-live="polite"
        >
          {nombre(valeur)}
          <span
            className={cn("font-semibold text-muted-foreground", compact ? "ml-1 text-sm" : "ml-1.5 text-lg")}
          >
            {unite}
          </span>
        </p>
      </div>
      <button
        type="button"
        aria-label={`Augmenter : ${libelle}`}
        disabled={valeur >= max}
        onClick={() => deplacer(1)}
        className={bouton}
      >
        <Plus className={icone} aria-hidden="true" />
      </button>
    </div>
  )
}
