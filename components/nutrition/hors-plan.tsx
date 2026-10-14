"use client"

import { ChevronRight } from "lucide-react"
import { useState } from "react"

import { Stepper } from "@/components/execution/stepper"
import { Filtres, macros } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { LIBELLE_SLOT, type Slot } from "@/lib/libelles"
import type { Repas } from "@/lib/queries"

// À partir de cette heure, un repas hors plan du jour déclenche la proposition des plats de secours.
const HEURE_TARDIVE = 21
const HORS_PLAN_DEFAUT = { kcal: 700, proteines: 30 }

// Un repas pris en dehors du plan, pour n'importe quelle date jusqu'à aujourd'hui.
export function FeuilleHorsPlan({
  ouvert,
  onFermer,
  date,
  duJour,
  slotsLibres,
  secours,
}: {
  ouvert: boolean
  onFermer: () => void
  date: string
  // Les plats de secours ne sont proposés que le soir même : après coup, ils n'ont plus de sens.
  duJour: boolean
  slotsLibres: Slot[]
  secours: Repas[]
}) {
  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
      >
        {ouvert && slotsLibres.length > 0 && (
          <FormulaireHorsPlan
            date={date}
            slotsLibres={slotsLibres}
            secours={duJour ? secours : []}
            onFermer={onFermer}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function FormulaireHorsPlan({
  date,
  slotsLibres,
  secours,
  onFermer,
}: {
  date: string
  slotsLibres: Slot[]
  secours: Repas[]
  onFermer: () => void
}) {
  const { executer, enCours } = useEdition()
  // Le dernier repas encore libre est le plus probable : on déclare en général le repas en cours.
  const [slot, setSlot] = useState<Slot>(slotsLibres.at(-1)!)
  const [kcal, setKcal] = useState(HORS_PLAN_DEFAUT.kcal)
  const [proteines, setProteines] = useState(HORS_PLAN_DEFAUT.proteines)
  // Passé 21 h, on montre les plats de secours avant de valider.
  const [alternatives, setAlternatives] = useState(false)

  const enregistrer = () => {
    onFermer()
    void executer(differable("enregistrerHorsPlan", date, slot, kcal, proteines))
  }

  if (alternatives) {
    return (
      <>
        <SheetHeader className="pr-14">
          <SheetTitle className="text-xl font-bold">Avant de valider</SheetTitle>
          <SheetDescription className="text-base">
            Il est tard, mais ces plats sont prêts en quelques minutes et restent dans le plan.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <ul className="divide-y rounded-2xl border bg-card">
            {secours.map((plat) => (
              <li key={plat.id}>
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => {
                    onFermer()
                    void executer(differable("cocherRepas", date, slot, plat.id))
                  }}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none first:rounded-t-2xl last:rounded-b-2xl focus-visible:bg-muted active:bg-muted"
                >
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block leading-snug font-medium">{plat.nom}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums">
                      {plat.temps_min !== null && `${plat.temps_min} min · `}
                      {macros(plat)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="h-12 w-full text-base" disabled={enCours} onClick={enregistrer}>
            Enregistrer quand même le repas hors plan
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">Repas hors plan</SheetTitle>
        <SheetDescription className="text-base">Commandé ou improvisé : une estimation suffit.</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <Filtres
          libelle="Repas concerné"
          valeur={slot}
          onChange={setSlot}
          options={slotsLibres.map((s) => ({ valeur: s, libelle: LIBELLE_SLOT[s]! }))}
        />
        <Stepper libelle="Calories estimées" valeur={kcal} unite="kcal" pas={50} max={5000} onChange={setKcal} />
        <Stepper
          libelle="Protéines estimées"
          valeur={proteines}
          unite="g"
          pas={5}
          max={400}
          onChange={setProteines}
        />
        <Button
          className="h-14 w-full text-lg font-semibold"
          disabled={enCours}
          onClick={() =>
            new Date().getHours() >= HEURE_TARDIVE && secours.length > 0 ? setAlternatives(true) : enregistrer()
          }
        >
          Enregistrer
        </Button>
      </div>
    </>
  )
}
