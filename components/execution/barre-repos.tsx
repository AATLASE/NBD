"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { chrono } from "@/lib/execution"
import { modifierBrouillon, type Repos } from "@/lib/seance-en-cours"
import { signaler, useMaintenant } from "@/lib/signal"

const RALLONGE_MS = 30_000

// Minuteur de repos, lancé par « Série validée ». Il reste visible quel que soit l'exercice
// affiché : on peut préparer le suivant pendant que le temps tourne.
export function BarreRepos({ repos }: { repos: Repos }) {
  const maintenant = useMaintenant(true)
  const restant = Math.min(repos.total, Math.max(0, repos.fin - maintenant))

  useEffect(() => {
    const fin = setTimeout(
      () => {
        signaler()
        // Ne ferme que ce repos-ci : une rallonge entre-temps a changé l'heure de fin.
        modifierBrouillon((b) => (b.repos?.fin === repos.fin ? { ...b, repos: null } : b))
      },
      Math.max(0, repos.fin - Date.now())
    )
    return () => clearTimeout(fin)
  }, [repos.fin])

  return (
    <div
      role="timer"
      aria-label="Repos"
      className="border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div aria-hidden="true" className="h-1.5 bg-muted">
        <div
          className="h-full origin-left bg-primary"
          style={{ transform: `scaleX(${repos.total > 0 ? restant / repos.total : 0})` }}
        />
      </div>
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">Repos</p>
          <p className="text-4xl leading-none font-bold tracking-tight tabular-nums">{chrono(restant)}</p>
        </div>
        <Button
          variant="outline"
          className="h-12 px-4 text-base"
          onClick={() =>
            modifierBrouillon((b) =>
              b.repos
                ? { ...b, repos: { fin: b.repos.fin + RALLONGE_MS, total: b.repos.total + RALLONGE_MS } }
                : b
            )
          }
        >
          +30 s
        </Button>
        <Button
          variant="secondary"
          className="h-12 px-4 text-base"
          onClick={() => modifierBrouillon((b) => ({ ...b, repos: null }))}
        >
          Passer
        </Button>
      </div>
    </div>
  )
}
