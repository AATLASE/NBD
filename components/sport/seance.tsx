import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { Carte, Lettre } from "@/components/blocs"
import { LIBELLE_LIEU, majuscule } from "@/lib/libelles"
import type { Seance } from "@/lib/queries"

export function resumeSeance(seance: Seance) {
  const nb = seance.workout_exercises.length
  return [
    `${seance.duree_min} min`,
    LIBELLE_LIEU[seance.lieu] ?? seance.lieu,
    `${nb} exercice${nb > 1 ? "s" : ""}`,
  ].join(" · ")
}

export function CarteSeance({ seance }: { seance: Seance }) {
  return (
    <Carte className="transition-colors duration-150 active:bg-muted">
      <Link
        href={`/sport/seances/${seance.id}`}
        className="flex min-h-20 items-center gap-4 rounded-2xl p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Lettre code={seance.code} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            <span className="sr-only">Séance {seance.code} : </span>
            {seance.nom}
          </span>
          <span className="block text-sm text-muted-foreground">
            {seance.jour_suggere && `${majuscule(seance.jour_suggere)} · `}
            {resumeSeance(seance)}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </Carte>
  )
}
