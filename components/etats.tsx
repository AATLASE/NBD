"use client"

import type { UseQueryResult } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

// État d'attente commun à tous les écrans : squelette pendant le premier chargement,
// message avec bouton « Réessayer » si une lecture échoue. Jamais de spinner plein écran.
export function Attente({ requetes }: { requetes: UseQueryResult[] }) {
  const enErreur = requetes.filter((requete) => requete.isError)

  if (enErreur.length > 0) {
    return (
      <div role="alert" className="space-y-4 rounded-2xl border border-dashed px-5 py-8 text-center">
        <div className="space-y-1">
          <p className="font-medium">Chargement impossible</p>
          <p className="text-sm text-muted-foreground">
            Vérifie ta connexion, puis réessaie.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 px-5 text-base"
          onClick={() => enErreur.forEach((requete) => requete.refetch())}
        >
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="space-y-2">
        <Skeleton className="h-9 w-3/5" />
        <Skeleton className="h-5 w-2/5" />
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  )
}
