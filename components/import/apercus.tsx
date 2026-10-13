"use client"

import { cn } from "cn"
import { Check, TriangleAlert } from "lucide-react"

import { Carte, Etiquette, Lettre, Section } from "@/components/blocs"
import { macros } from "@/components/nutrition/repas"
import { charge, prescription } from "@/lib/format"
import type { CaseImportee, PlatImporte } from "@/lib/import/nutrition"
import type { SeanceImportee } from "@/lib/import/seances"
import { JOURS, LIBELLE_LIEU, LIBELLE_SLOT, SLOTS, majuscule } from "@/lib/libelles"

// Ce que l'application a compris du fichier, avant la moindre écriture.

export function Remarques({ remarques }: { remarques: string[] }) {
  if (remarques.length === 0) return null
  return (
    <ul className="space-y-2 rounded-2xl bg-warning-soft px-4 py-3">
      {remarques.map((remarque, index) => (
        <li key={index} className="flex gap-2 text-sm leading-snug">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{remarque}</span>
        </li>
      ))}
    </ul>
  )
}

const CODES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export function ApercuSeances({
  seances,
  gardees,
  onBasculer,
}: {
  seances: SeanceImportee[]
  // Pour chaque séance, si elle fait partie de l'import.
  gardees: boolean[]
  onBasculer: (index: number) => void
}) {
  return (
    <ol className="space-y-3">
      {seances.map((seance, index) => {
        const gardee = gardees[index] ?? false
        return (
          <li key={index}>
            <Carte className={cn("overflow-hidden", !gardee && "border-dashed")}>
              <button
                type="button"
                role="checkbox"
                aria-checked={gardee}
                aria-label={`Importer la séance ${seance.nom}`}
                onClick={() => onBasculer(index)}
                className="flex min-h-18 w-full items-center gap-3 p-4 text-left outline-none focus-visible:bg-muted active:bg-muted"
              >
                <Lettre code={CODES[index] ?? "S"} className={cn(!gardee && "bg-muted text-muted-foreground")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block leading-snug font-semibold", !gardee && "text-muted-foreground")}>
                    {seance.nom}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {seance.jour ? majuscule(seance.jour) : "Sans jour fixe"} · {seance.duree_min} min ·{" "}
                    {LIBELLE_LIEU[seance.lieu]} · {seance.exercices.length} exercice
                    {seance.exercices.length > 1 ? "s" : ""}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md border-2",
                    gardee ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  )}
                >
                  {gardee && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
              {gardee && (
                <>
                  {seance.note && (
                    <p className="border-t px-4 py-3 text-sm leading-snug text-muted-foreground">{seance.note}</p>
                  )}
                  <ul className="divide-y border-t">
                    {seance.exercices.map((exercice, rang) => (
                      <li key={rang} className="space-y-0.5 px-4 py-2.5">
                        <p className="flex items-baseline justify-between gap-3">
                          <span className="leading-snug font-medium">{exercice.nom}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{prescription(exercice)}</span>
                        </p>
                        {(charge(exercice) || exercice.note) && (
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {[charge(exercice), exercice.note].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Carte>
          </li>
        )
      })}
    </ol>
  )
}

export function ApercuNutrition({
  plats,
  cases,
  connus,
}: {
  plats: PlatImporte[]
  cases: CaseImportee[]
  // Indices des plats déjà présents dans les recettes : ils sont réutilisés, pas recréés.
  connus: Set<number>
}) {
  return (
    <>
      <Section titre="Plats" aside={`${plats.length} au total`}>
        {SLOTS.map((slot) => {
          const duRepas = plats.map((plat, index) => ({ plat, index })).filter(({ plat }) => plat.slot === slot)
          return (
            duRepas.length > 0 && (
              <Carte key={slot}>
                <h3 className="px-4 pt-4 pb-1 text-sm font-semibold text-brand">{LIBELLE_SLOT[slot]}</h3>
                <ul className="divide-y">
                  {duRepas.map(({ plat, index }) => (
                    <li key={index} className="space-y-1 px-4 py-2.5">
                      <p className="leading-snug font-medium">{plat.nom}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
                        {plat.kcal > 0 ? macros(plat) : "Calories à compléter"}
                        {connus.has(index) && <Etiquette>Déjà dans tes recettes</Etiquette>}
                      </p>
                    </li>
                  ))}
                </ul>
              </Carte>
            )
          )
        })}
      </Section>

      {cases.length > 0 && (
        <Section titre="Menus" aside={`${cases.length} repas placé${cases.length > 1 ? "s" : ""}`}>
          {([1, 2] as const).map((semaine) => {
            const deLaSemaine = cases.filter((c) => c.semaine === semaine)
            return (
              deLaSemaine.length > 0 && (
                <Carte key={semaine}>
                  <h3 className="px-4 pt-4 pb-1 text-sm font-semibold text-brand">Semaine {semaine}</h3>
                  <ul className="divide-y">
                    {JOURS.map((jour) => {
                      const duJour = deLaSemaine.filter((c) => c.jour === jour)
                      return (
                        duJour.length > 0 && (
                          <li key={jour} className="px-4 py-3">
                            <p className="font-semibold">{majuscule(jour)}</p>
                            <dl className="mt-1 space-y-1">
                              {SLOTS.flatMap((slot) => duJour.filter((c) => c.slot === slot)).map((c) => (
                                <div key={c.slot} className="flex gap-3 text-sm leading-snug">
                                  <dt className="w-28 shrink-0 text-muted-foreground">{LIBELLE_SLOT[c.slot]}</dt>
                                  <dd className="min-w-0">{plats[c.plat]?.nom}</dd>
                                </div>
                              ))}
                            </dl>
                          </li>
                        )
                      )
                    })}
                  </ul>
                </Carte>
              )
            )
          })}
        </Section>
      )}
    </>
  )
}
