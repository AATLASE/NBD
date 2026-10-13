"use client"

import { ArrowLeftRight, BookOpen, Pencil } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EditeurPlat } from "@/components/nutrition/editeur-plat"
import { EtiquetteTag, macros } from "@/components/nutrition/repas"
import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { LIBELLE_SLOT, majuscule } from "@/lib/libelles"
import { useRepas, type CasePlan, type Repas } from "@/lib/queries"

const LIGNE =
  "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-none first:rounded-t-2xl last:rounded-b-2xl focus-visible:bg-muted active:bg-muted"

// Une case du plan de repas : voir la recette, l'échanger avec un autre jour,
// la remplacer par un autre plat du même moment de la journée, ou la vider.
export function EditeurCase({
  casePlan,
  autresJours,
  onFermer,
  onRemplacer,
  onEchanger,
}: {
  casePlan: CasePlan | null
  // Les cases du même repas, les autres jours de la semaine affichée.
  autresJours: CasePlan[]
  onFermer: () => void
  onRemplacer: (casePlan: CasePlan, mealId: string | null) => void
  onEchanger: (a: CasePlan, b: CasePlan) => void
}) {
  const repas = useRepas()
  // Le plat en cours de modification : sa fiche s'ouvre une fois celle de la case refermée.
  const [platEdite, setPlatEdite] = useState<Repas | null>(null)
  const candidats = casePlan
    ? (repas.data ?? []).filter((r) => r.slot === casePlan.slot && r.id !== casePlan.meal_id)
    : []

  return (
    <>
    <EditeurPlat plat={platEdite} ouvert={platEdite !== null} onFermer={() => setPlatEdite(null)} />
    <Sheet open={casePlan !== null} onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
      >
        {casePlan && (
          <>
            <SheetHeader className="pr-14">
              <SheetDescription className="text-sm font-semibold text-brand">
                {LIBELLE_SLOT[casePlan.slot] ?? casePlan.slot} · {majuscule(casePlan.jour)}
              </SheetDescription>
              <SheetTitle className="text-xl leading-snug font-bold">
                {casePlan.meal?.nom ?? "Rien de prévu"}
              </SheetTitle>
              {casePlan.meal && (
                <p className="text-muted-foreground tabular-nums">{macros(casePlan.meal)}</p>
              )}
            </SheetHeader>

            <div className="space-y-5 px-4">
              {casePlan.meal && (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/nutrition/recettes/${casePlan.meal.id}`}
                    className={buttonVariants({ variant: "outline", className: "h-12 gap-2 text-base" })}
                  >
                    <BookOpen className="size-5" aria-hidden="true" />
                    Voir le plat
                  </Link>
                  <Button
                    variant="outline"
                    className="h-12 gap-2 text-base"
                    onClick={() => {
                      const plat = casePlan.meal
                      onFermer()
                      setPlatEdite(plat)
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Modifier le plat
                  </Button>
                  <Button
                    variant="outline"
                    className="col-span-2 h-12 text-base"
                    onClick={() => {
                      onFermer()
                      onRemplacer(casePlan, null)
                    }}
                  >
                    Vider la case
                  </Button>
                </div>
              )}

              {autresJours.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <ArrowLeftRight className="size-5 text-brand" aria-hidden="true" />
                    Échanger avec un autre jour
                  </h3>
                  <ul className="divide-y rounded-2xl border bg-card">
                    {autresJours.map((autre) => (
                      <li key={autre.id}>
                        <button
                          type="button"
                          className={LIGNE}
                          onClick={() => {
                            onFermer()
                            onEchanger(casePlan, autre)
                          }}
                        >
                          <span className="w-20 shrink-0 text-sm font-semibold">{majuscule(autre.jour)}</span>
                          <span className="min-w-0 flex-1 leading-snug">
                            {autre.meal?.nom ?? <span className="text-muted-foreground">Rien de prévu</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="font-semibold">Remplacer par un autre plat</h3>
                {candidats.length === 0 ? (
                  <p className="text-muted-foreground">
                    {repas.isPending ? "Chargement…" : "Aucun autre plat pour ce repas."}
                  </p>
                ) : (
                  <ul className="divide-y rounded-2xl border bg-card">
                    {candidats.map((plat) => (
                      <li key={plat.id}>
                        <button
                          type="button"
                          className={LIGNE}
                          onClick={() => {
                            onFermer()
                            onRemplacer(casePlan, plat.id)
                          }}
                        >
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="block leading-snug font-medium">{plat.nom}</span>
                            <span className="block text-sm text-muted-foreground tabular-nums">
                              {macros(plat)}
                            </span>
                          </span>
                          <EtiquetteTag tag={plat.tag} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
