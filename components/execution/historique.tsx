"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { seancesDeLExercice, texteSerie } from "@/lib/execution"
import { dateCourte } from "@/lib/format"
import type { SeanceFaite } from "@/lib/queries"

const SEANCES_AFFICHEES = 3

// Les 3 dernières séances du même exercice, toutes séances confondues.
export function Historique({
  exercice,
  historique,
  onFermer,
}: {
  exercice: { id: string; nom: string } | null
  historique: SeanceFaite[]
  onFermer: () => void
}) {
  const seances = exercice ? seancesDeLExercice(historique, exercice.id, SEANCES_AFFICHEES) : []

  return (
    <Sheet open={exercice !== null} onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
      >
        <SheetHeader className="pr-14">
          <SheetTitle className="text-xl font-bold">{exercice?.nom}</SheetTitle>
          <SheetDescription className="text-base">
            {seances.length === 0
              ? "Jamais fait pour l'instant. Les séries d'aujourd'hui seront les premières."
              : `${seances.length} dernière${seances.length > 1 ? "s" : ""} séance${seances.length > 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        <ul className="space-y-3 px-4">
          {seances.map((seance) => (
            <li key={seance.id} className="rounded-2xl border bg-card">
              <p className="border-b px-4 py-2.5 text-sm font-semibold text-brand first-letter:uppercase">
                {dateCourte(seance.date)}
              </p>
              <ol className="divide-y">
                {seance.series.map((serie) => (
                  <li key={serie.id} className="flex items-baseline gap-3 px-4 py-2.5 tabular-nums">
                    <span className="w-5 text-sm text-muted-foreground">{serie.serie_num}</span>
                    <span className="flex-1 font-semibold">
                      {texteSerie({ charge: serie.charge_kg, reps: serie.reps, duree: serie.duree_sec })}
                    </span>
                    {serie.rir !== null && (
                      <span className="text-sm text-muted-foreground">RIR {serie.rir}</span>
                    )}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
