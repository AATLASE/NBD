"use client"

import { ArrowLeftRight, Plus, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"

import { AjoutExercice } from "@/components/sport/ajout-exercice"
import { EditeurLigne } from "@/components/sport/editeur-ligne"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { retirerExercice } from "@/lib/mutations"
import type { ExerciceDeSeance, Seance } from "@/lib/queries"
import { modifierBrouillon, type Brouillon } from "@/lib/seance-en-cours"

// Modifier la séance sans la quitter : régler, remplacer ou retirer l'exercice affiché, ou en
// ajouter un. Ce sont les mêmes écritures que sur la fiche de la séance : elles valent pour les
// prochaines fois et restent annulables depuis l'historique.
export function ModificationEnCours({
  seance,
  lignes,
  brouillon,
  ouvert,
  onFermer,
}: {
  seance: Seance
  // Les exercices de l'étape affichée : un seul, ou tous ceux du circuit.
  lignes: ExerciceDeSeance[]
  brouillon: Brouillon
  ouvert: boolean
  onFermer: () => void
}) {
  const { executer, enCours } = useEdition()
  const [ligneReglee, setLigneReglee] = useState<string | null>(null)
  const [choix, setChoix] = useState<{ remplace?: ExerciceDeSeance } | null>(null)

  // Les séries déjà validées d'un exercice retiré ou remplacé ne partent pas à l'enregistrement.
  const oublierSeries = (ligneId: string) =>
    modifierBrouillon((b) => {
      const series = { ...b.series }
      delete series[ligneId]
      return { ...b, series }
    })

  async function retirer(ligne: ExerciceDeSeance) {
    onFermer()
    const resultat = await executer(() => retirerExercice(ligne.id), {
      cle: ["seances"],
      maj: (seances: Seance[]) =>
        seances.map((s) =>
          s.id === seance.id ? { ...s, workout_exercises: s.workout_exercises.filter((l) => l.id !== ligne.id) } : s
        ),
    })
    if (resultat.ok) oublierSeries(ligne.id)
  }

  return (
    <>
      <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          <SheetHeader className="pr-14">
            <SheetTitle className="text-xl font-bold">Modifier la séance</SheetTitle>
            <SheetDescription className="text-base">
              Le changement vaut aussi pour les prochaines fois. Tu peux l&apos;annuler depuis l&apos;historique.
            </SheetDescription>
          </SheetHeader>

          {lignes.map((ligne) => {
            const validees = brouillon.series[ligne.id]?.length ?? 0
            return (
              <div key={ligne.id} className="space-y-2 border-t px-4 py-4">
                <p className="font-semibold">{ligne.exercise.nom}</p>
                <Button
                  variant="outline"
                  className="h-12 w-full justify-start gap-3 px-4 text-base"
                  onClick={() => {
                    onFermer()
                    setLigneReglee(ligne.id)
                  }}
                >
                  <Settings2 className="size-5" aria-hidden="true" />
                  Régler les séries, les charges, le repos
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full justify-start gap-3 px-4 text-base"
                  onClick={() => {
                    onFermer()
                    setChoix({ remplace: ligne })
                  }}
                >
                  <ArrowLeftRight className="size-5" aria-hidden="true" />
                  Remplacer par un autre exercice
                </Button>
                <Button
                  variant="destructive"
                  className="h-12 w-full justify-start gap-3 px-4 text-base"
                  disabled={enCours}
                  onClick={() => void retirer(ligne)}
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                  Retirer de la séance
                </Button>
                {validees > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Si tu le remplaces ou le retires, {validees === 1 ? "sa série validée" : `ses ${validees} séries validées`}{" "}
                    aujourd&apos;hui ne {validees === 1 ? "sera" : "seront"} pas enregistrée{validees === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            )
          })}

          <div className="space-y-2 border-t px-4 pt-4">
            <Button
              className="h-14 w-full gap-2 text-base font-semibold"
              onClick={() => {
                onFermer()
                setChoix({})
              }}
            >
              <Plus className="size-5" aria-hidden="true" />
              Ajouter un exercice
            </Button>
            <p className="text-sm text-muted-foreground">Il se place à la fin de la séance.</p>
          </div>
        </SheetContent>
      </Sheet>

      <AjoutExercice
        seanceId={seance.id}
        remplace={choix?.remplace}
        ouvert={choix !== null}
        onFermer={() => setChoix(null)}
        onAjoute={(ligneId) => {
          if (choix?.remplace) oublierSeries(choix.remplace.id)
          // Le nouvel exercice s'ouvre aussitôt en réglage : c'est là qu'on fixe sa charge.
          setLigneReglee(ligneId)
        }}
      />
      <EditeurLigne
        ligne={seance.workout_exercises.find((l) => l.id === ligneReglee) ?? null}
        onFermer={() => setLigneReglee(null)}
      />
    </>
  )
}
