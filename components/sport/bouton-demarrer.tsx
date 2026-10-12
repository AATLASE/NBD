"use client"

import { Play } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import { demarrerSeance, useBrouillon } from "@/lib/seance-en-cours"

// Un seul appui pour entrer en mode exécution. S'il y a déjà une séance en cours,
// on ne l'écrase pas ici : l'écran d'exécution propose de la reprendre ou de l'abandonner.
export function BoutonDemarrer({ seanceId }: { seanceId: string }) {
  const router = useRouter()
  const aujourdhui = useAujourdhui()
  const brouillon = useBrouillon()
  const enCours = brouillon?.workoutId === seanceId

  return (
    <Button
      className="h-14 w-full gap-2 text-lg font-semibold"
      disabled={!aujourdhui || brouillon === undefined}
      onClick={() => {
        if (!brouillon && aujourdhui) demarrerSeance(seanceId, aujourdhui)
        router.push(`/seance/${seanceId}`)
      }}
    >
      <Play className="size-5" aria-hidden="true" />
      {enCours ? "Reprendre la séance" : "Démarrer la séance"}
    </Button>
  )
}
