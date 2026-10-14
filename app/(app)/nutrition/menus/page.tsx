"use client"

import { cn } from "cn"
import { Check, ChevronRight, Plus } from "lucide-react"
import { useState } from "react"

import { Carte, EnTete, Etiquette, Section } from "@/components/blocs"
import { Calendrier, premierDuMois, type Marque } from "@/components/calendrier"
import { Attente } from "@/components/etats"
import { LienHistorique } from "@/components/lien-historique"
import { EditeurCase } from "@/components/nutrition/editeur-case"
import { FeuilleHorsPlan } from "@/components/nutrition/hors-plan"
import { macros } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import type { Tables } from "@/lib/database.types"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { dateLongue, jourDe } from "@/lib/format"
import { JOURS, LIBELLE_SLOT, SLOTS, majuscule, type Slot } from "@/lib/libelles"
import { echangerRepas, remplacerRepas, retirerRepas } from "@/lib/mutations"
import { useDebutProgramme, useJournalRepas, usePlanRepas, useRepas, type CasePlan, type Repas } from "@/lib/queries"
import { semaineMenu, semaineProgramme } from "@/lib/regles"

type Log = Tables<"meal_logs">

export default function Menus() {
  const aujourdhui = useAujourdhui()
  const plan = usePlanRepas()
  const repas = useRepas()
  const journal = useJournalRepas()
  const debut = useDebutProgramme()
  const { executer } = useEdition()
  const [dateChoisie, setDateChoisie] = useState<string | null>(null)
  const [mois, setMois] = useState<string | null>(null)
  const [caseOuverte, setCaseOuverte] = useState<string | null>(null)
  const [horsPlan, setHorsPlan] = useState(false)

  if (!aujourdhui || !plan.data || !journal.data || debut.data === undefined) {
    return <Attente requetes={[plan, journal, debut]} />
  }

  // Le plan tourne sur deux semaines : une date tombe dans la semaine 1 ou 2 des menus.
  const semaineDe = (date: string) => semaineMenu(semaineProgramme(debut.data, date).brute)
  const casesDu = (date: string) =>
    plan.data.filter((c) => c.semaine === semaineDe(date) && c.jour === jourDe(date))
  const notes = new Set(journal.data.map((log) => log.date))

  const date = dateChoisie ?? aujourdhui
  const semaine = semaineDe(date)
  const jour = jourDe(date)
  const cases = casesDu(date)
  const logs = journal.data.filter((log) => log.date === date)
  const ouverte = plan.data.find((c) => c.id === caseOuverte) ?? null
  // On note ce qu'on a mangé jusqu'à aujourd'hui, jamais à l'avance.
  const notable = date <= aujourdhui
  const slotsLibres = SLOTS.filter((slot) => !logs.some((l) => l.slot === slot))

  const dansLeJournal = (maj: (logs: Log[]) => Log[]) => ({ cle: ["journal-repas"], maj })

  function cocher(slot: Slot, plat: Repas) {
    const provisoire: Log = {
      id: `provisoire-${slot}`,
      user_id: "",
      date,
      slot,
      meal_id: plat.id,
      kcal_reel: null,
      proteines_reel: null,
      hors_plan: false,
      note: null,
    }
    void executer(differable("cocherRepas", date, slot, plat.id), dansLeJournal((l) => [provisoire, ...l]))
  }

  function decocher(log: Log) {
    void executer(() => retirerRepas(log.id), dansLeJournal((l) => l.filter((x) => x.id !== log.id)))
  }

  function marque(jourCal: string): Marque | null {
    if (notes.has(jourCal)) return { etat: "fait", description: "repas notés" }
    if (!casesDu(jourCal).some((c) => c.meal)) return null
    return jourCal < aujourdhui!
      ? { etat: "passe", description: "menu prévu, rien de noté" }
      : { etat: "prevu", description: "menu prévu" }
  }

  function remplacer(casePlan: CasePlan, mealId: string | null) {
    const plat = mealId ? (repas.data?.find((r) => r.id === mealId) ?? null) : null
    void executer(() => remplacerRepas(casePlan.id, mealId), {
      cle: ["plan-repas"],
      maj: (actuel: CasePlan[]) =>
        actuel.map((c) => (c.id === casePlan.id ? { ...c, meal_id: mealId, meal: plat } : c)),
    })
  }

  function echanger(a: CasePlan, b: CasePlan) {
    void executer(() => echangerRepas(a.id, b.id), {
      cle: ["plan-repas"],
      maj: (actuel: CasePlan[]) =>
        actuel.map((c) =>
          c.id === a.id
            ? { ...c, meal_id: b.meal_id, meal: b.meal }
            : c.id === b.id
              ? { ...c, meal_id: a.meal_id, meal: a.meal }
              : c
        ),
    })
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EnTete titre="Menus" sousTitre="Touche une date pour voir son menu et le modifier" />
        <LienHistorique />
      </div>

      <Calendrier
        mois={mois ?? premierDuMois(date)}
        onMois={setMois}
        selection={date}
        onChoisir={setDateChoisie}
        aujourdhui={aujourdhui}
        marque={marque}
      />

      <Section titre={majuscule(dateLongue(date))} aside={`Semaine ${semaine} des menus`}>
        <Carte className="overflow-hidden">
          <ul className="divide-y">
            {SLOTS.map((slot) => {
              const casePlan = cases.find((c) => c.slot === slot)
              const log = logs.find((l) => l.slot === slot)
              const libelle = LIBELLE_SLOT[slot] ?? slot
              const etat = log?.hors_plan ? (
                <Etiquette ton="warning">Hors plan</Etiquette>
              ) : log ? (
                <Etiquette ton="success">Pris</Etiquette>
              ) : null

              const caseACocher = notable && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={Boolean(log)}
                  aria-label={`${libelle} pris le ${dateLongue(date)}`}
                  disabled={(log?.id.startsWith("provisoire-") ?? false) || (!log && !casePlan?.meal)}
                  onClick={() => (log ? decocher(log) : casePlan?.meal && cocher(slot, casePlan.meal))}
                  className="flex w-14 shrink-0 items-center justify-center outline-none focus-visible:bg-muted active:bg-muted disabled:opacity-40"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg border-2 transition-colors duration-150",
                      log ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {log && <Check className="size-4" strokeWidth={3} />}
                  </span>
                </button>
              )

              if (!casePlan) {
                return (
                  <li key={slot} className="flex min-h-16 items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-brand">{libelle}</span>
                      <span className="block text-muted-foreground">Rien de prévu</span>
                    </span>
                    {etat}
                  </li>
                )
              }
              return (
                <li key={slot} className="flex items-stretch">
                  {caseACocher}
                  <button
                    type="button"
                    onClick={() => setCaseOuverte(casePlan.id)}
                    aria-label={`${libelle} : ${casePlan.meal?.nom ?? "rien de prévu"}. Modifier`}
                    className={cn(
                      "flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left outline-none transition-colors duration-150 focus-visible:bg-muted active:bg-muted",
                      !caseACocher && "pl-4"
                    )}
                  >
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-sm font-semibold text-brand">{libelle}</span>
                      <span
                        className={
                          casePlan.meal ? "block leading-snug font-medium" : "block text-muted-foreground"
                        }
                      >
                        {casePlan.meal?.nom ?? "Rien de prévu"}
                      </span>
                      {casePlan.meal && (
                        <span className="block text-sm text-muted-foreground tabular-nums">
                          {macros(casePlan.meal)}
                        </span>
                      )}
                    </span>
                    {etat}
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </Carte>
        {notable && (
          <Button
            variant="outline"
            className="h-12 w-full gap-2 text-base font-semibold"
            disabled={slotsLibres.length === 0}
            onClick={() => setHorsPlan(true)}
          >
            <Plus className="size-5" aria-hidden="true" />
            Repas hors plan
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          Le menu revient toutes les deux semaines : modifier un repas le change pour tous les {jour}s de la
          semaine {semaine}.
        </p>
      </Section>

      <FeuilleHorsPlan
        ouvert={horsPlan}
        onFermer={() => setHorsPlan(false)}
        date={date}
        duJour={date === aujourdhui}
        slotsLibres={slotsLibres}
        secours={(repas.data ?? []).filter((r) => r.tag === "secours")}
      />

      <EditeurCase
        casePlan={ouverte}
        autresJours={
          ouverte
            ? JOURS.flatMap((j) =>
                plan.data.filter((c) => c.semaine === ouverte.semaine && c.jour === j && c.slot === ouverte.slot)
              ).filter((c) => c.id !== ouverte.id)
            : []
        }
        onFermer={() => setCaseOuverte(null)}
        onRemplacer={remplacer}
        onEchanger={echanger}
      />
    </>
  )
}
