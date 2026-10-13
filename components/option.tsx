"use client"

import { cn } from "cn"
import { Check } from "lucide-react"

// Carte à cocher : case (plusieurs choix) ou bouton radio (un seul).
export function Option({
  role,
  coche,
  bloque = false,
  titre,
  description,
  onClick,
}: {
  role: "checkbox" | "radio"
  coche: boolean
  bloque?: boolean
  titre: string
  description?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={coche}
      // Reste atteignable au clavier, pour qu'on comprenne pourquoi il ne répond plus.
      aria-disabled={bloque}
      onClick={() => !bloque && onClick()}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
        coche ? "border-primary bg-brand-soft" : "border-border bg-card active:bg-muted",
        bloque && "opacity-50"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center border-2",
          role === "radio" ? "rounded-full" : "rounded-md",
          coche ? "border-primary bg-primary text-primary-foreground" : "border-input"
        )}
      >
        {coche && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{titre}</span>
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </span>
    </button>
  )
}
