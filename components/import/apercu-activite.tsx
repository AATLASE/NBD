"use client"

import { useState } from "react"

import { Carte, Section } from "@/components/blocs"
import { Remarques } from "@/components/import/apercus"
import { Option } from "@/components/option"
import { SaisieDouleur } from "@/components/sport/saisie-douleur"
import { Button } from "@/components/ui/button"
import { dateLongue, jourDe, nombre } from "@/lib/format"
import type { Activite } from "@/lib/import/activite"
import { majuscule } from "@/lib/libelles"
import type { ActiviteAImporter } from "@/lib/mutations"
import { useCourse, useJournalSeances, useSeances } from "@/lib/queries"

// Ce que la montre a enregistré, et où le ranger : une sortie dans le suivi de course, ou une
// séance faite dans le journal de sport. Rien n'est écrit avant le bouton du bas.
export function ApercuActivite({
  activite,
  remarques,
  enCours,
  onImporter,
}: {
  activite: Activite
  remarques: string[]
  enCours: boolean
  onImporter: (activite: ActiviteAImporter) => void
}) {
  const seances = useSeances()
  const journal = useJournalSeances()
  const course = useCourse()
  // La musculation va dans Sport ; tout ce qui se mesure en distance, dans le suivi de course.
  const [vers, setVers] = useState<"course" | "seance">(
    activite.discipline === "musculation" || (activite.discipline === "autre" && activite.km === null)
      ? "seance"
      : "course"
  )
  // Séance proposée d'office : celle prévue ce jour-là de la semaine, s'il y en a une.
  const prevue = seances.data?.find((seance) => seance.jour_suggere === jourDe(activite.date))
  const [choisie, setChoisie] = useState<string | null>(null)
  const workoutId = choisie ?? prevue?.id ?? null

  const chiffres = [
    { libelle: "Durée", valeur: `${activite.dureeMin} min` },
    activite.km !== null && { libelle: "Distance", valeur: `${nombre(activite.km)} km` },
    activite.series !== null && { libelle: "Séries", valeur: String(activite.series) },
    activite.fcMoyenne !== null && { libelle: "Cardio moyen", valeur: `${activite.fcMoyenne} bpm` },
    activite.kcal !== null && { libelle: "Dépense", valeur: `${nombre(activite.kcal)} kcal` },
  ].filter((chiffre): chiffre is { libelle: string; valeur: string } => Boolean(chiffre))

  // Le même fichier choisi deux fois ne doit pas passer inaperçu.
  const dejaLa =
    vers === "course"
      ? (course.data?.sorties.some((sortie) => sortie.date === activite.date) ?? false)
      : (journal.data?.some((log) => log.date === activite.date && log.workout_id === workoutId) ?? false)

  const note = [
    "Importée de la montre",
    activite.series !== null && `${activite.series} séries`,
    activite.fcMoyenne !== null && `cardio moyen ${activite.fcMoyenne} bpm`,
    activite.kcal !== null && `${activite.kcal} kcal`,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <Carte className="overflow-hidden">
        <div className="space-y-0.5 p-4">
          <p className="text-sm font-semibold text-brand">{activite.libelle}</p>
          <p className="text-lg leading-snug font-bold first-letter:uppercase">{dateLongue(activite.date)}</p>
        </div>
        <dl className="grid grid-cols-2 border-t">
          {chiffres.map((chiffre, index) => (
            <div
              key={chiffre.libelle}
              className={`p-4 ${index % 2 === 0 ? "border-r" : ""} ${index >= 2 ? "border-t" : ""}`}
            >
              <dt className="text-sm text-muted-foreground">{chiffre.libelle}</dt>
              <dd className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">{chiffre.valeur}</dd>
            </div>
          ))}
        </dl>
      </Carte>

      <Remarques
        remarques={[
          ...remarques,
          ...(dejaLa
            ? [
                vers === "course"
                  ? "Une sortie est déjà enregistrée ce jour-là. Vérifie que ce n'est pas la même avant de l'ajouter."
                  : "Cette séance est déjà dans ton journal ce jour-là : la montre la complétera (calories, durée) au lieu d'en créer une seconde.",
              ]
            : []),
        ]}
      />

      <Section titre="Où la ranger">
        <div role="radiogroup" aria-label="Où ranger cette activité" className="space-y-2">
          <Option
            role="radio"
            coche={vers === "course"}
            titre="Suivi de course"
            description="Une sortie : course, marche ou vélo"
            onClick={() => setVers("course")}
          />
          <Option
            role="radio"
            coche={vers === "seance"}
            titre="Séance de sport"
            description="Une séance de ton programme, faite ce jour-là"
            onClick={() => setVers("seance")}
          />
        </div>
      </Section>

      {vers === "course" ? (
        <Carte className="p-4">
          <SaisieDouleur
            libelle="Douleur juste après"
            action="Ajouter la sortie"
            enCours={enCours}
            onEnregistrer={(douleurApres) =>
              onImporter({
                vers: "course",
                date: activite.date,
                km: activite.km ?? 0,
                dureeMin: activite.dureeMin,
                douleurApres,
              })
            }
          />
        </Carte>
      ) : (
        <Section titre="Quelle séance">
          {seances.data && seances.data.length === 0 ? (
            <p className="leading-snug text-muted-foreground">
              Tu n&apos;as pas encore de séance. Crées-en une dans Sport, puis reviens importer cette activité.
            </p>
          ) : (
            <>
              <p className="-mt-1 text-sm leading-snug text-muted-foreground">
                La séance est notée comme faite, avec sa durée. Les séries ne sont pas reprises : la montre ne sait
                pas à quel exercice de ton programme chacune correspond.
              </p>
              <div role="radiogroup" aria-label="Séance faite" className="space-y-2">
                {(seances.data ?? []).map((seance) => (
                  <Option
                    key={seance.id}
                    role="radio"
                    coche={workoutId === seance.id}
                    titre={`${seance.code} · ${seance.nom}`}
                    description={seance.jour_suggere ? majuscule(seance.jour_suggere) : "Sans jour fixe"}
                    onClick={() => setChoisie(seance.id)}
                  />
                ))}
              </div>
              <Button
                className="h-14 w-full text-lg font-semibold"
                disabled={enCours || workoutId === null}
                onClick={() =>
                  workoutId &&
                  onImporter({ vers: "seance", workoutId, date: activite.date, dureeMin: activite.dureeMin, note, kcal: activite.kcal })
                }
              >
                {workoutId === null ? "Choisis une séance" : "Ajouter au journal"}
              </Button>
            </>
          )}
        </Section>
      )}
    </>
  )
}
