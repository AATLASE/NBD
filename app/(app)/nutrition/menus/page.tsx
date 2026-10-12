"use client"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { cn } from "cn"
import { GripVertical } from "lucide-react"
import { useState } from "react"

import { Carte, EnTete, Etiquette } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { LienHistorique } from "@/components/lien-historique"
import { EditeurCase } from "@/components/nutrition/editeur-case"
import { Filtres } from "@/components/nutrition/repas"
import { useAujourdhui } from "@/lib/aujourdhui"
import { useEdition } from "@/lib/edition"
import { jourDe } from "@/lib/format"
import { JOURS, LIBELLE_SLOT, SLOTS, majuscule } from "@/lib/libelles"
import { echangerRepas, remplacerRepas } from "@/lib/mutations"
import { useDebutProgramme, usePlanRepas, useRepas, type CasePlan } from "@/lib/queries"
import { semaineMenu, semaineProgramme } from "@/lib/regles"

type Semaine = "1" | "2"

export default function Menus() {
  const aujourdhui = useAujourdhui()
  const plan = usePlanRepas()
  const repas = useRepas()
  const debut = useDebutProgramme()
  const { executer } = useEdition()
  const [choix, setChoix] = useState<Semaine | null>(null)
  const [caseOuverte, setCaseOuverte] = useState<string | null>(null)
  const [caseGlissee, setCaseGlissee] = useState<CasePlan | null>(null)

  const capteurs = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!aujourdhui || !plan.data || debut.data === undefined) {
    return <Attente requetes={[plan, debut]} />
  }

  const semaineEnCours = String(semaineMenu(semaineProgramme(debut.data, aujourdhui).brute)) as Semaine
  const semaine = choix ?? semaineEnCours
  const jourActuel = jourDe(aujourdhui)
  const cases = plan.data.filter((c) => String(c.semaine) === semaine)
  const ouverte = cases.find((c) => c.id === caseOuverte) ?? null

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

  function surDepot({ active, over }: DragEndEvent) {
    setCaseGlissee(null)
    const source = cases.find((c) => c.id === active.id)
    const cible = cases.find((c) => c.id === over?.id)
    if (source && cible && source.id !== cible.id && source.slot === cible.slot) echanger(source, cible)
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EnTete titre="Menus" sousTitre="Le plan tourne sur deux semaines" />
        <LienHistorique />
      </div>

      <Filtres
        libelle="Semaine affichée"
        valeur={semaine}
        onChange={setChoix}
        options={(["1", "2"] as const).map((valeur) => ({
          valeur,
          libelle: `Semaine ${valeur}${valeur === semaineEnCours ? " · en cours" : ""}`,
        }))}
      />

      <p className="-mt-3 text-sm text-muted-foreground">
        Appuie sur un repas pour le changer. Fais glisser sa poignée sur un autre jour pour les échanger.
      </p>

      <DndContext
        id="echange-repas"
        sensors={capteurs}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setCaseGlissee(cases.find((c) => c.id === active.id) ?? null)}
        onDragCancel={() => setCaseGlissee(null)}
        onDragEnd={surDepot}
      >
        <ol className="space-y-3">
          {JOURS.map((jour) => {
            const aujourdhuiIci = jour === jourActuel && semaine === semaineEnCours
            return (
              <li key={jour} aria-current={aujourdhuiIci ? "date" : undefined}>
                <Carte className={cn("overflow-hidden", aujourdhuiIci && "border-2 border-primary")}>
                  <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
                    <h2 className="text-lg font-semibold">{majuscule(jour)}</h2>
                    {aujourdhuiIci && <Etiquette ton="brand">Aujourd&apos;hui</Etiquette>}
                  </div>
                  <ul className="divide-y">
                    {SLOTS.map((slot) => {
                      const casePlan = cases.find((c) => c.jour === jour && c.slot === slot)
                      return casePlan ? (
                        <CaseMenu
                          key={slot}
                          casePlan={casePlan}
                          slotGlisse={caseGlissee?.slot ?? null}
                          onOuvrir={() => setCaseOuverte(casePlan.id)}
                        />
                      ) : (
                        <li key={slot} className="px-4 py-3">
                          <span className="block text-sm text-muted-foreground">{LIBELLE_SLOT[slot]}</span>
                          <span className="block text-muted-foreground">Rien de prévu</span>
                        </li>
                      )
                    })}
                  </ul>
                </Carte>
              </li>
            )
          })}
        </ol>

        <DragOverlay>
          {caseGlissee && (
            // L'aperçu hérite de la largeur de la poignée : on lui donne la sienne, calée à droite sur elle.
            <div className="w-64 -translate-x-52 rounded-xl border-2 border-primary bg-card px-4 py-3 shadow-lg">
              <span className="block text-sm text-muted-foreground">{LIBELLE_SLOT[caseGlissee.slot]}</span>
              <span className="block leading-snug font-medium">
                {caseGlissee.meal?.nom ?? "Rien de prévu"}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <EditeurCase
        casePlan={ouverte}
        autresJours={
          ouverte
            ? JOURS.flatMap((jour) => cases.filter((c) => c.jour === jour && c.slot === ouverte.slot)).filter(
                (c) => c.id !== ouverte.id
              )
            : []
        }
        onFermer={() => setCaseOuverte(null)}
        onRemplacer={remplacer}
        onEchanger={echanger}
      />
    </>
  )
}

// Une case du plan : un appui l'ouvre, sa poignée la fait glisser vers la même case d'un autre jour.
function CaseMenu({
  casePlan,
  slotGlisse,
  onOuvrir,
}: {
  casePlan: CasePlan
  // Le repas en cours de glissement, s'il y en a un : seules les cases du même repas l'acceptent.
  slotGlisse: string | null
  onOuvrir: () => void
}) {
  const glissable = useDraggable({ id: casePlan.id })
  const cible = useDroppable({ id: casePlan.id, disabled: slotGlisse !== casePlan.slot })
  const accepte = slotGlisse === casePlan.slot && !glissable.isDragging
  const libelle = LIBELLE_SLOT[casePlan.slot] ?? casePlan.slot

  return (
    <li
      ref={cible.setNodeRef}
      className={cn(
        "flex items-stretch transition-colors duration-150",
        glissable.isDragging && "opacity-40",
        slotGlisse !== null && !accepte && !glissable.isDragging && "opacity-40",
        accepte && "bg-brand-soft",
        cible.isOver && accepte && "bg-primary/30"
      )}
    >
      <button
        type="button"
        onClick={onOuvrir}
        aria-label={`${libelle} : ${casePlan.meal?.nom ?? "rien de prévu"}. Modifier`}
        className="min-h-14 min-w-0 flex-1 py-3 pl-4 text-left outline-none focus-visible:bg-muted active:bg-muted"
      >
        <span className="block text-sm text-muted-foreground">{libelle}</span>
        <span className={cn("block leading-snug", casePlan.meal ? "font-medium" : "text-muted-foreground")}>
          {casePlan.meal?.nom ?? "Rien de prévu"}
        </span>
      </button>
      <button
        ref={glissable.setNodeRef}
        type="button"
        aria-label={`Faire glisser pour échanger : ${libelle}`}
        // touch-none : sur la poignée, le doigt déplace le repas au lieu de faire défiler la page.
        className="flex w-12 shrink-0 touch-none items-center justify-center text-muted-foreground outline-none focus-visible:bg-muted active:bg-muted"
        {...glissable.attributes}
        {...glissable.listeners}
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
    </li>
  )
}
