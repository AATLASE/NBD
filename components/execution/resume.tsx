"use client"

import { cn } from "cn"
import { useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Carte, Stat } from "@/components/blocs"
import { MotDuCoach } from "@/components/coach/mot"
import { Button } from "@/components/ui/button"
import type { Tables } from "@/lib/database.types"
import { annoncer } from "@/lib/edition"
import { etapeTerminee, texteSerie, volumeKg, type Etape } from "@/lib/execution"
import { mettreEnAttente } from "@/lib/file-attente"
import { nombre } from "@/lib/format"
import { enregistrerSeance, type SerieAEnregistrer } from "@/lib/mutations"
import type { Seance } from "@/lib/queries"
import { ecrireBrouillon, nombreDeSeries, type Brouillon } from "@/lib/seance-en-cours"

const RESSENTIS = [1, 2, 3, 4, 5] as const

export function Resume({
  seance,
  etapes,
  brouillon,
}: {
  seance: Seance
  etapes: Etape[]
  brouillon: Brouillon
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [ressenti, setRessenti] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  const lignes = seance.workout_exercises
  const faites = nombreDeSeries(brouillon)
  const prevues = lignes.reduce((total, ligne) => total + ligne.series, 0)
  const volume = volumeKg(Object.values(brouillon.series).flat())
  const etapesFaites = etapes.filter((etape) => etapeTerminee(etape, brouillon)).length

  function enregistrer() {
    setErreur(null)
    const series: SerieAEnregistrer[] = lignes.flatMap((ligne) =>
      (brouillon.series[ligne.id] ?? []).map((serie, index) => ({
        workout_exercise_id: ligne.id,
        serie_num: index + 1,
        charge_kg: serie.charge,
        reps: serie.reps,
        duree_sec: serie.duree,
        rir: serie.rir,
      }))
    )

    const seanceFaite = {
      id: brouillon.id,
      workoutId: brouillon.workoutId,
      date: brouillon.date,
      dureeMin: Math.min(600, Math.max(1, Math.round((Date.now() - brouillon.debut) / 60_000))),
      ressenti,
      series,
    }

    demarrer(async () => {
      // Sans réseau, l'appel n'est même pas tenté. `null` : la séance n'est pas partie.
      const resultat = navigator.onLine ? await enregistrerSeance(seanceFaite).catch(() => null) : null

      if (resultat && !resultat.ok) {
        setErreur(resultat.message)
        return
      }
      if (resultat) {
        await Promise.all(
          ["journal-seances", "historique-series", "debut-programme"].map((cle) =>
            queryClient.invalidateQueries({ queryKey: [cle] })
          )
        )
      } else {
        // Pas de réseau en salle : la séance attend dans la file et partira toute seule.
        // L'envoi est sans risque de doublon, la séance porte son identifiant.
        const compte = queryClient.getQueryData<{ id: string } | null>(["profil"])?.id ?? null
        mettreEnAttente("enregistrerSeance", [seanceFaite], compte)
        queryClient.setQueryData<Tables<"workout_logs">[]>(["journal-seances"], (journal) =>
          journal && [
            {
              id: brouillon.id,
              user_id: compte ?? "",
              workout_id: brouillon.workoutId,
              date: brouillon.date,
              duree_min: seanceFaite.dureeMin,
              ressenti,
              note: null,
            },
            ...journal,
          ]
        )
        annoncer("Séance gardée sur ce téléphone. Envoi au retour du réseau.")
      }
      // On quitte l'écran avant d'effacer la séance locale, pour ne pas le voir se vider.
      router.replace("/sport")
      ecrireBrouillon(null)
    })
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 pt-5 pb-8">
      <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">Résumé</h2>

      {faites > 0 && <MotDuCoach moment="fin" date={brouillon.date} />}

      <div className="grid grid-cols-2 gap-3">
        <Stat libelle="Séries faites" valeur={`${faites} / ${prevues}`} />
        <Stat libelle="Exercices terminés" valeur={`${etapesFaites} / ${etapes.length}`} />
        {volume > 0 && (
          <div className="col-span-2">
            <Stat libelle="Volume soulevé" valeur={nombre(volume)} unite="kg" />
          </div>
        )}
      </div>

      <Carte>
        <ul className="divide-y">
          {lignes.map((ligne) => {
            const series = brouillon.series[ligne.id] ?? []
            return (
              <li key={ligne.id} className="space-y-1 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="leading-snug font-medium">{ligne.exercise.nom}</span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      series.length >= ligne.series ? "text-success" : "text-muted-foreground"
                    )}
                  >
                    {series.length} / {ligne.series}
                  </span>
                </div>
                {series.length > 0 && (
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {series.map(texteSerie).join(" · ")}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </Carte>

      <div role="group" aria-label="Ressenti de la séance, facultatif" className="space-y-2">
        <p className="font-semibold">Ressenti</p>
        <div className="grid grid-cols-5 gap-2">
          {RESSENTIS.map((valeur) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={ressenti === valeur}
              onClick={() => setRessenti(ressenti === valeur ? null : valeur)}
              className={cn(
                "h-14 rounded-xl border text-xl font-bold tabular-nums outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring/50",
                ressenti === valeur
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card active:bg-muted"
              )}
            >
              {valeur}
            </button>
          ))}
        </div>
        <p className="flex justify-between text-sm text-muted-foreground">
          <span>Très dure</span>
          <span>Très bonne</span>
        </p>
      </div>

      {erreur && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 leading-snug font-medium text-danger">
          {erreur}
        </p>
      )}

      <Button
        className="h-16 w-full gap-2 text-lg font-semibold"
        disabled={faites === 0 || enCours}
        onClick={enregistrer}
      >
        <Check className="size-5" aria-hidden="true" />
        {enCours ? "Enregistrement…" : erreur ? "Réessayer" : "Enregistrer la séance"}
      </Button>
      {faites === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Valide au moins une série pour pouvoir enregistrer.
        </p>
      )}
    </div>
  )
}
