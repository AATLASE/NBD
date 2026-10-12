"use client"

import { cn } from "cn"
import { Check, ChevronRight, Plus, UtensilsCrossed } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Carte, EnTete, Etiquette, Jauge, Section, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Stepper } from "@/components/execution/stepper"
import { Filtres, macros } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAujourdhui } from "@/lib/aujourdhui"
import type { Tables } from "@/lib/database.types"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { dateLongue, jourDe, nombre } from "@/lib/format"
import { LIBELLE_SLOT, SLOTS, majuscule, type Slot } from "@/lib/libelles"
import { retirerRepas } from "@/lib/mutations"
import {
  useDebutProgramme,
  useJournalRepas,
  usePlanRepas,
  useProfil,
  useRepas,
  type Repas,
} from "@/lib/queries"
import { semaineMenu, semaineProgramme } from "@/lib/regles"

type Log = Tables<"meal_logs">

// À partir de cette heure, un repas hors plan déclenche la proposition des plats de secours.
const HEURE_TARDIVE = 21
const HORS_PLAN_DEFAUT = { kcal: 700, proteines: 30 }

export default function NutritionAujourdhui() {
  const aujourdhui = useAujourdhui()
  const profil = useProfil()
  const plan = usePlanRepas()
  const repas = useRepas()
  const journal = useJournalRepas()
  const debut = useDebutProgramme()
  const { executer } = useEdition()
  const [horsPlan, setHorsPlan] = useState(false)

  if (
    !aujourdhui ||
    profil.data === undefined ||
    !plan.data ||
    !repas.data ||
    !journal.data ||
    debut.data === undefined
  ) {
    return <Attente requetes={[profil, plan, repas, journal, debut]} />
  }

  const semaine = semaineMenu(semaineProgramme(debut.data, aujourdhui).brute)
  const jour = jourDe(aujourdhui)
  const logsDuJour = journal.data.filter((log) => log.date === aujourdhui)
  const repasParId = new Map(repas.data.map((r) => [r.id, r]))
  const cases = SLOTS.map((slot) => ({
    slot,
    prevu: plan.data.find((c) => c.semaine === semaine && c.jour === jour && c.slot === slot)?.meal,
    log: logsDuJour.find((log) => log.slot === slot),
  }))

  // Consommé : le réel saisi s'il existe, sinon les valeurs du repas coché.
  const consomme = logsDuJour.reduce(
    (total, log) => {
      const pris = log.meal_id ? repasParId.get(log.meal_id) : undefined
      return {
        kcal: total.kcal + (log.kcal_reel ?? pris?.kcal ?? 0),
        proteines: total.proteines + (log.proteines_reel ?? pris?.proteines_g ?? 0),
      }
    },
    { kcal: 0, proteines: 0 }
  )
  const prevu = cases.reduce(
    (total, { prevu }) => ({
      kcal: total.kcal + (prevu?.kcal ?? 0),
      proteines: total.proteines + (prevu?.proteines_g ?? 0),
    }),
    { kcal: 0, proteines: 0 }
  )
  const slotsLibres = cases.filter((c) => !c.log).map((c) => c.slot)

  // Mise à jour immédiate du journal, avant la réponse du serveur.
  const dansLeJournal = (maj: (logs: Log[]) => Log[]) => ({ cle: ["journal-repas"], maj })

  function cocher(slot: Slot, plat: Repas) {
    const provisoire: Log = {
      id: `provisoire-${slot}`,
      user_id: "",
      date: aujourdhui!,
      slot,
      meal_id: plat.id,
      kcal_reel: null,
      proteines_reel: null,
      hors_plan: false,
      note: null,
    }
    void executer(
      differable("cocherRepas", aujourdhui!, slot, plat.id),
      dansLeJournal((logs) => [provisoire, ...logs])
    )
  }

  function decocher(log: Log) {
    void executer(
      () => retirerRepas(log.id),
      dansLeJournal((logs) => logs.filter((l) => l.id !== log.id))
    )
  }

  return (
    <>
      <EnTete titre={majuscule(dateLongue(aujourdhui))} sousTitre={`Menus de la semaine ${semaine}`} />

      {profil.data?.objectif_kcal != null && profil.data.objectif_proteines_g != null && (
        <Carte className="space-y-5 p-4">
          <Jauge libelle="Calories" valeur={consomme.kcal} max={profil.data.objectif_kcal} unite="kcal" />
          <Jauge
            libelle="Protéines"
            valeur={consomme.proteines}
            max={profil.data.objectif_proteines_g}
            unite="g"
          />
          <p className="border-t pt-4 text-sm text-muted-foreground tabular-nums">
            Au menu aujourd&apos;hui : {nombre(prevu.kcal)} kcal et {prevu.proteines} g de protéines.
          </p>
        </Carte>
      )}

      <Section titre="Repas du jour">
        {cases.every(({ prevu, log }) => !prevu && !log) ? (
          <Vide Icone={UtensilsCrossed} titre="Rien de prévu aujourd'hui">
            Aucun repas n&apos;est placé sur ce jour dans les menus.
          </Vide>
        ) : (
          <ul className="space-y-3">
            {cases.map(({ slot, prevu, log }) => {
              const pris = log?.meal_id ? repasParId.get(log.meal_id) : undefined
              const affiche = pris ?? (log ? undefined : prevu)
              const provisoire = log?.id.startsWith("provisoire-") ?? false
              return (
                <li key={slot}>
                  <Carte className={cn("flex items-stretch", log && "border-success/50")}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(log)}
                      aria-label={`${LIBELLE_SLOT[slot]} pris`}
                      // Rien à cocher sans repas prévu ; pas de double appui pendant l'enregistrement.
                      disabled={provisoire || (!log && !prevu)}
                      onClick={() => (log ? decocher(log) : prevu && cocher(slot, prevu))}
                      className="flex w-16 shrink-0 items-center justify-center rounded-l-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:opacity-50"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg border-2 transition-colors duration-150",
                          log ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        )}
                      >
                        {log && <Check className="size-5" strokeWidth={3} />}
                      </span>
                    </button>

                    {affiche ? (
                      <Link
                        href={`/nutrition/recettes/${affiche.id}`}
                        className="flex min-h-20 min-w-0 flex-1 items-center gap-2 rounded-r-2xl py-3 pr-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                      >
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="block text-sm font-semibold text-brand">{LIBELLE_SLOT[slot]}</span>
                          <span className="block leading-snug font-medium">{affiche.nom}</span>
                          <span className="block text-sm text-muted-foreground tabular-nums">
                            {macros(affiche)}
                          </span>
                        </span>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    ) : (
                      <div className="min-h-20 min-w-0 flex-1 space-y-0.5 py-3 pr-3">
                        <p className="text-sm font-semibold text-brand">{LIBELLE_SLOT[slot]}</p>
                        {log?.hors_plan ? (
                          <>
                            <p className="flex items-center gap-2 leading-snug font-medium">
                              Repas hors plan <Etiquette ton="warning">Hors plan</Etiquette>
                            </p>
                            <p className="text-sm text-muted-foreground tabular-nums">
                              {nombre(log.kcal_reel ?? 0)} kcal · {log.proteines_reel ?? 0} g de protéines
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">Rien de prévu</p>
                        )}
                      </div>
                    )}
                  </Carte>
                </li>
              )
            })}
          </ul>
        )}

        <Button
          variant="outline"
          className="h-14 w-full gap-2 text-base font-semibold"
          disabled={slotsLibres.length === 0}
          onClick={() => setHorsPlan(true)}
        >
          <Plus className="size-5" aria-hidden="true" />
          Repas hors plan
        </Button>
      </Section>

      <Sheet open={horsPlan} onOpenChange={setHorsPlan}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          {horsPlan && slotsLibres.length > 0 && (
            <FormulaireHorsPlan
              date={aujourdhui}
              slotsLibres={slotsLibres}
              secours={repas.data.filter((r) => r.tag === "secours")}
              onFermer={() => setHorsPlan(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
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
        <SheetDescription className="text-base">
          Commandé ou improvisé : une estimation suffit.
        </SheetDescription>
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
