"use client"

import { useId, useState } from "react"

import { Button } from "@/components/ui/button"

// Curseur de douleur de 0 à 10. Sert à la douleur du matin, après une sortie et le lendemain.
export function SaisieDouleur({
  libelle,
  initiale = 0,
  enCours = false,
  action = "Enregistrer",
  onEnregistrer,
}: {
  libelle: string
  initiale?: number
  enCours?: boolean
  action?: string
  onEnregistrer: (douleur: number) => void
}) {
  const id = useId()
  const [douleur, setDouleur] = useState(initiale)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-medium">
          {libelle}
        </label>
        <output htmlFor={id} className="text-3xl leading-none font-bold tabular-nums">
          {douleur}
          <span className="text-base font-medium text-muted-foreground"> / 10</span>
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={douleur}
        onChange={(evenement) => setDouleur(Number(evenement.target.value))}
        className="h-11 w-full cursor-pointer accent-primary"
      />
      <div aria-hidden="true" className="flex justify-between text-sm text-muted-foreground">
        <span>Aucune</span>
        <span>Très forte</span>
      </div>
      <Button
        className="h-12 w-full text-base font-semibold"
        disabled={enCours}
        onClick={() => onEnregistrer(douleur)}
      >
        {action}
      </Button>
    </div>
  )
}
