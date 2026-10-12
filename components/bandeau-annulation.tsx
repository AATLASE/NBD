"use client"

import { cn } from "cn"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { fermerAvis, useAvis, useEdition } from "@/lib/edition"

const DUREE_ANNULABLE_MS = 15_000
const DUREE_SIMPLE_MS = 4_000

// Confirme chaque modification et laisse 15 secondes pour l'annuler d'un appui.
// Passé ce délai, l'action reste annulable depuis l'historique.
export function BandeauAnnulation() {
  const avis = useAvis()
  const { defaire, enCours } = useEdition()

  useEffect(() => {
    if (!avis) return
    const fin = setTimeout(
      () => fermerAvis(avis.cle),
      avis.groupeId ? DUREE_ANNULABLE_MS : DUREE_SIMPLE_MS
    )
    return () => clearTimeout(fin)
  }, [avis])

  return (
    // La zone est toujours présente : un lecteur d'écran n'annonce que ce qui y apparaît.
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bas-du-bandeau,4.5rem)+env(safe-area-inset-bottom))] z-60 px-4"
    >
      {avis && (
        <div
          role={avis.erreur ? "alert" : "status"}
          className={cn(
            "pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl border py-2 pr-2 pl-4 shadow-lg",
            avis.erreur
              ? "border-danger/40 bg-danger-soft text-danger"
              : "border-success/40 bg-card text-card-foreground"
          )}
        >
          {!avis.erreur && <span aria-hidden="true" className="h-9 w-1 shrink-0 rounded-full bg-success" />}
          <p className="min-w-0 flex-1 py-1.5 leading-snug font-medium">{avis.texte}</p>
          {avis.groupeId ? (
            <Button
              variant="outline"
              className="h-11 shrink-0 px-4 text-base font-semibold"
              disabled={enCours}
              onClick={() => {
                const { groupeId, cle } = avis
                fermerAvis(cle)
                if (groupeId) void defaire(groupeId)
              }}
            >
              Annuler
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="h-11 shrink-0 px-3 text-base"
              onClick={() => fermerAvis(avis.cle)}
            >
              OK
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
