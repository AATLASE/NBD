"use client"

import { ChevronLeft, History } from "lucide-react"
import { useRouter } from "next/navigation"

import { Carte, EnTete, Etiquette, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Button } from "@/components/ui/button"
import { useEdition } from "@/lib/edition"
import { useModifications } from "@/lib/queries"

const HORODATAGE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

export default function Historique() {
  const router = useRouter()
  const modifications = useModifications()
  const { defaire, enCours } = useEdition()

  const contenu = () => {
    if (!modifications.data) return <Attente requetes={[modifications]} />

    // Une action peut avoir touché plusieurs lignes : on les regroupe pour n'en montrer qu'une.
    const actions = new Map<
      string,
      { groupeId: string; resume: string; source: string; date: string; lignes: number; annulee: boolean }
    >()
    for (const ligne of modifications.data) {
      const action = actions.get(ligne.groupe_id)
      if (action) {
        action.lignes += 1
        action.annulee &&= ligne.undone_at !== null
      } else {
        actions.set(ligne.groupe_id, {
          groupeId: ligne.groupe_id,
          resume: ligne.resume,
          source: ligne.source,
          date: ligne.applied_at ?? "",
          lignes: 1,
          annulee: ligne.undone_at !== null,
        })
      }
    }

    if (actions.size === 0) {
      return (
        <Vide Icone={History} titre="Aucune modification">
          Chaque changement apporté au programme s&apos;affichera ici, avec de quoi l&apos;annuler.
        </Vide>
      )
    }

    return (
      <Carte>
        <ol className="divide-y">
          {[...actions.values()].map((action) => (
            <li key={action.groupeId} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className={action.annulee ? "leading-snug text-muted-foreground line-through" : "leading-snug font-medium"}>
                  {action.resume}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span className="first-letter:uppercase">
                    {action.date && HORODATAGE.format(new Date(action.date))}
                  </span>
                  {action.source === "chatbot" && <Etiquette ton="brand">Assistant</Etiquette>}
                </p>
              </div>
              {action.annulee ? (
                <Etiquette>Annulée</Etiquette>
              ) : (
                <Button
                  variant="outline"
                  className="h-11 shrink-0 px-4 text-base font-semibold"
                  disabled={enCours}
                  aria-label={`Annuler : ${action.resume}`}
                  onClick={() => void defaire(action.groupeId)}
                >
                  Annuler
                </Button>
              )}
            </li>
          ))}
        </ol>
      </Carte>
    )
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 font-medium text-brand outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          Retour
        </button>
        <EnTete titre="Historique" sousTitre="Toutes les modifications, de la plus récente à la plus ancienne" />
      </div>
      {contenu()}
    </main>
  )
}
