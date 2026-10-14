"use client"

import { CalendarClock } from "lucide-react"

import { Carte } from "@/components/blocs"
import { Button } from "@/components/ui/button"
import { useEdition } from "@/lib/edition"
import { retablirJour } from "@/lib/mutations"
import type { Exception } from "@/lib/planning"

// Ce jour-là ne suit pas la semaine type : on dit pourquoi, et on peut revenir au programme.
export function ExceptionPlanning({
  exception,
  seanceType,
}: {
  exception: Exception
  // Code de la séance que la semaine type prévoit ce jour-là, s'il y en a une.
  seanceType: string | undefined
}) {
  const { executer, enCours } = useEdition()
  return (
    <Carte className="flex items-start gap-3 border-brand/40 bg-brand-soft/40 p-4">
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="leading-snug">
          <span className="font-semibold">{exception.workout_id ? "Séance changée ce jour-là" : "Repos prévu ce jour-là"}</span>
          {exception.raison && <span className="block text-muted-foreground">{exception.raison}</span>}
        </p>
        <Button
          variant="outline"
          className="h-11 bg-card text-base"
          disabled={enCours}
          onClick={() =>
            void executer(() => retablirJour(exception.date), {
              cle: ["planning"],
              maj: (planning: Exception[]) => planning.filter((p) => p.id !== exception.id),
            })
          }
        >
          {seanceType ? `Revenir à la séance ${seanceType}` : "Revenir au programme"}
        </Button>
      </div>
    </Carte>
  )
}
