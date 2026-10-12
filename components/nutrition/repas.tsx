import { cn } from "cn"

import { Etiquette, type Ton } from "@/components/blocs"
import { nombre } from "@/lib/format"
import { LIBELLE_TAG } from "@/lib/libelles"
import type { Repas } from "@/lib/queries"

export function macros(repas: Pick<Repas, "kcal" | "proteines_g">) {
  return `${nombre(repas.kcal)} kcal · ${repas.proteines_g} g de protéines`
}

const TON_TAG: Record<string, Ton> = {
  batch: "neutre",
  plaisir: "brand",
  secours: "warning",
}

// Le tag « standard » est le cas général : on ne l'affiche pas.
export function EtiquetteTag({ tag }: { tag: string | null }) {
  if (!tag || tag === "standard") return null
  return <Etiquette ton={TON_TAG[tag] ?? "neutre"}>{LIBELLE_TAG[tag] ?? tag}</Etiquette>
}

// Rangée de filtres à choix unique, défilable horizontalement.
export function Filtres<T extends string>({
  libelle,
  options,
  valeur,
  onChange,
}: {
  libelle: string
  options: { valeur: T; libelle: string }[]
  valeur: T
  onChange: (valeur: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={libelle}
      className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4"
    >
      {options.map((option) => {
        const actif = option.valeur === valeur
        return (
          <button
            key={option.valeur}
            type="button"
            aria-pressed={actif}
            onClick={() => onChange(option.valeur)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-4 text-[0.9375rem] font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              actif
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "bg-card active:bg-muted"
            )}
          >
            {option.libelle}
          </button>
        )
      })}
    </div>
  )
}
