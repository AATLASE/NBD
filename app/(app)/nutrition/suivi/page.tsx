"use client"

import { ChartNoAxesColumn, Flame, Receipt } from "lucide-react"

import { Carte, EnTete, Etiquette, Section, Stat, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Barres } from "@/components/graphiques"
import { useAujourdhui } from "@/lib/aujourdhui"
import { decalerJours, euros, nombre } from "@/lib/format"
import { LIBELLE_REGIME, type Regime } from "@/lib/libelles"
import { useCourses, useJournalRepas, useProfil, useRepas } from "@/lib/queries"
import { jourCourt, parSemaine } from "@/lib/suivi"

const SEMAINES_AFFICHEES = 8
const JOURS_AFFICHES = 14

export default function Suivi() {
  const aujourdhui = useAujourdhui()
  const profil = useProfil()
  const journal = useJournalRepas()
  const repas = useRepas()
  const courses = useCourses()

  if (!aujourdhui || profil.data === undefined || !journal.data || !repas.data || !courses.data) {
    return <Attente requetes={[profil, journal, repas, courses]} />
  }

  // Total par jour : le réel saisi s'il existe, sinon les valeurs du repas coché.
  const repasParId = new Map(repas.data.map((r) => [r.id, r]))
  const parJour = new Map<string, { kcal: number; proteines: number }>()
  for (const log of journal.data) {
    const prevu = log.meal_id ? repasParId.get(log.meal_id) : undefined
    const jour = parJour.get(log.date) ?? { kcal: 0, proteines: 0 }
    jour.kcal += log.kcal_reel ?? prevu?.kcal ?? 0
    jour.proteines += log.proteines_reel ?? prevu?.proteines_g ?? 0
    parJour.set(log.date, jour)
  }

  // Moyenne sur les jours où au moins un repas a été enregistré.
  const moyenne = (jours: number) => {
    const debut = decalerJours(aujourdhui, -(jours - 1))
    const totaux = [...parJour].filter(([date]) => date >= debut && date <= aujourdhui).map(([, t]) => t)
    if (totaux.length === 0) return null
    return {
      kcal: Math.round(totaux.reduce((s, t) => s + t.kcal, 0) / totaux.length),
      proteines: Math.round(totaux.reduce((s, t) => s + t.proteines, 0) / totaux.length),
    }
  }
  const sur7 = moyenne(7)
  const sur30 = moyenne(30)

  // Calories de chacun des 14 derniers jours, jours sans saisie compris, face à la cible du compte.
  const cibleKcal = profil.data?.objectif_kcal ?? null
  const caloriesParJour = Array.from({ length: JOURS_AFFICHES }, (_, index) => {
    const date = decalerJours(aujourdhui, index - (JOURS_AFFICHES - 1))
    return { libelle: jourCourt(date), valeur: parJour.get(date)?.kcal ?? 0 }
  })
  const regime = profil.data?.regime as Regime | null | undefined

  // Coût de chaque liste de courses générée, de la plus ancienne à la plus récente.
  const budget = profil.data?.budget_courses_eur ?? null
  const coutParSemaine = new Map<string, number>()
  for (const article of courses.data.listeSemaine) {
    coutParSemaine.set(article.semaine_du, (coutParSemaine.get(article.semaine_du) ?? 0) + (article.prix_eur ?? 0))
  }
  const couts = [...coutParSemaine]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-SEMAINES_AFFICHEES)
    .map(([lundi, cout]) => ({ libelle: jourCourt(lundi), valeur: Math.round(cout * 100) / 100 }))

  const debutSemaine = decalerJours(aujourdhui, -6)
  const horsPlan7 = journal.data.filter((log) => log.hors_plan && log.date >= debutSemaine).length
  const horsPlanTotal = journal.data.filter((log) => log.hors_plan).length
  const horsPlanParSemaine = parSemaine(
    journal.data.filter((log) => log.hors_plan).map((log) => log.date),
    aujourdhui,
    SEMAINES_AFFICHEES
  )

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EnTete titre="Suivi" />
        {regime && (
          <Etiquette ton="brand" className="mt-2 h-7 px-3 text-sm">
            {LIBELLE_REGIME[regime]}
          </Etiquette>
        )}
      </div>

      <Section titre="Repas hors plan" aside="L'indicateur à faire baisser">
        {journal.data.length === 0 ? (
          <Vide Icone={ChartNoAxesColumn} titre="Aucun repas enregistré">
            Chaque repas commandé ou improvisé sera compté ici, semaine par semaine.
          </Vide>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat libelle="7 derniers jours" valeur={horsPlan7} />
              <Stat libelle="Depuis le début" valeur={horsPlanTotal} />
            </div>
            <Carte className="px-2 pt-4 pb-2">
              <Barres
                resume={`Repas hors plan par semaine sur ${SEMAINES_AFFICHEES} semaines : ${horsPlanParSemaine.at(-1)!.valeur} cette semaine.`}
                donnees={horsPlanParSemaine}
                nom="Repas hors plan"
                unite=""
              />
            </Carte>
          </>
        )}
      </Section>

      <Section
        titre="Moyennes par jour"
        aside={
          profil.data?.objectif_kcal != null && profil.data.objectif_proteines_g != null
            ? `Objectif ${nombre(profil.data.objectif_kcal)} kcal, ${profil.data.objectif_proteines_g} g`
            : undefined
        }
      >
        {sur30 === null ? (
          <Vide Icone={Flame} titre="Pas encore de moyenne">
            Les moyennes de calories et de protéines se calculeront dès les premiers repas cochés.
          </Vide>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat libelle="Calories, 7 jours" valeur={sur7 ? nombre(sur7.kcal) : "–"} unite="kcal" />
            <Stat libelle="Protéines, 7 jours" valeur={sur7 ? sur7.proteines : "–"} unite="g" />
            <Stat libelle="Calories, 30 jours" valeur={nombre(sur30.kcal)} unite="kcal" />
            <Stat libelle="Protéines, 30 jours" valeur={sur30.proteines} unite="g" />
          </div>
        )}
      </Section>

      {sur30 !== null && (
        <Section titre="Calories par jour" aside={`${JOURS_AFFICHES} derniers jours`}>
          <Carte className="px-2 pt-4 pb-2">
            <Barres
              resume={`Calories des ${JOURS_AFFICHES} derniers jours${cibleKcal !== null ? `, pour une cible de ${nombre(cibleKcal)} kcal` : ""} : ${nombre(caloriesParJour.at(-1)!.valeur)} kcal aujourd'hui.`}
              donnees={caloriesParJour}
              nom="Calories"
              unite="kcal"
              seuil={cibleKcal !== null ? { valeur: cibleKcal, libelle: `Cible : ${nombre(cibleKcal)} kcal` } : undefined}
            />
          </Carte>
        </Section>
      )}

      <Section titre="Coût des courses" aside="Par semaine">
        {couts.length === 0 ? (
          <Vide Icone={Receipt} titre="Aucune liste générée">
            {budget !== null
              ? `Budget visé : ${euros(budget)} par semaine.`
              : "Le coût s'affichera après la première liste de courses."}
          </Vide>
        ) : (
          <Carte className="px-2 pt-4 pb-2">
            <Barres
              resume={`Coût des courses par semaine : ${euros(couts.at(-1)!.valeur)} pour la dernière liste${budget !== null ? `, pour un budget de ${euros(budget)}` : ""}.`}
              donnees={couts}
              nom="Courses"
              unite="€"
              seuil={budget !== null ? { valeur: budget, libelle: `Budget : ${euros(budget)}` } : undefined}
            />
          </Carte>
        )}
      </Section>
    </>
  )
}
