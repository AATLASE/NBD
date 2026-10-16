"use client"

import { cn } from "cn"
import { useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { MotDuCoach } from "@/components/coach/mot"
import { RapportSeance, usePoidsLe } from "@/components/sport/rapport-seance"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Tables } from "@/lib/database.types"
import { annoncer } from "@/lib/edition"
import { etapeTerminee, type Etape } from "@/lib/execution"
import { mettreEnAttente } from "@/lib/file-attente"
import { enregistrerSeance, type SerieAEnregistrer } from "@/lib/mutations"
import { useHistoriqueExercices, type Seance } from "@/lib/queries"
import { dureeSeanceMin, type SerieRapport } from "@/lib/rapport"
import { ecrireBrouillon, nombreDeSeries, type Brouillon } from "@/lib/seance-en-cours"

const RESSENTIS = [1, 2, 3, 4, 5] as const
const COMMENTAIRE_MAX = 1000

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
  const [commentaire, setCommentaire] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()
  // L'heure de l'écran, figée à son ouverture : la durée ne bouge pas pendant qu'on le lit.
  const [ouvertA] = useState(() => Date.now())

  const lignes = seance.workout_exercises
  const faites = nombreDeSeries(brouillon)
  const prevues = lignes.reduce((total, ligne) => total + ligne.series, 0)
  const etapesFaites = etapes.filter((etape) => etapeTerminee(etape, brouillon)).length

  const seriesRapport: SerieRapport[] = lignes.flatMap((ligne) =>
    (brouillon.series[ligne.id] ?? []).map((serie) => ({
      exerciseId: ligne.exercise.id,
      nom: ligne.exercise.nom,
      groupe: ligne.exercise.groupe,
      charge: serie.charge,
      reps: serie.reps,
      duree: serie.duree,
      fin: serie.fin ?? null,
      reposPrevuSec: ligne.repos_sec,
      bloc: ligne.bloc === "circuit" ? "circuit" : "series",
    }))
  )
  const dureeMin = dureeSeanceMin(brouillon.debut, seriesRapport, ouvertA)
  const poids = usePoidsLe(brouillon.date)
  // La séance n'est pas encore enregistrée : tout l'historique de ces exercices est « avant ».
  const historique = useHistoriqueExercices(seriesRapport.map((s) => s.exerciseId))

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
        terminee_a: serie.fin ? new Date(serie.fin).toISOString() : null,
      }))
    )
    const note = commentaire.trim() || null

    const seanceFaite = {
      id: brouillon.id,
      workoutId: brouillon.workoutId,
      date: brouillon.date,
      dureeMin,
      ressenti,
      series,
      note,
      debut: new Date(brouillon.debut).toISOString(),
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
          ["journal-seances", "historique-series", "historique-exercices", "debut-programme", "ajustements"].map((cle) =>
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
              note,
              note_coach: null,
              debut_a: seanceFaite.debut,
              kcal: null,
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
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 pt-5 pb-8">
      <header className="space-y-1">
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">Rapport de séance</h2>
        <p className="text-muted-foreground tabular-nums">
          {faites} série{faites > 1 ? "s" : ""} sur {prevues} · {etapesFaites} exercice{etapesFaites > 1 ? "s" : ""} terminé
          {etapesFaites > 1 ? "s" : ""} sur {etapes.length}
        </p>
      </header>

      {faites > 0 && <MotDuCoach moment="fin" date={brouillon.date} />}

      {faites > 0 && (
        <RapportSeance
          series={seriesRapport}
          debut={brouillon.debut}
          dureeMin={dureeMin}
          kcalMontre={null}
          poidsKg={poids}
          historique={historique.data?.map((s) => ({
            exerciseId: s.exercise_id,
            charge: s.charge_kg,
            reps: s.reps,
            duree: s.duree_sec,
          }))}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="commentaire" className="text-base font-semibold">
          Commentaire
        </Label>
        <textarea
          id="commentaire"
          value={commentaire}
          maxLength={COMMENTAIRE_MAX}
          rows={3}
          onChange={(evenement) => setCommentaire(evenement.target.value)}
          placeholder="Sensations, fatigue, douleur, technique…"
          aria-describedby="commentaire-aide"
          className="min-h-24 w-full resize-y rounded-2xl border bg-card px-4 py-3 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p id="commentaire-aide" className="text-sm text-muted-foreground">
          Facultatif. Tu le retrouves dans le calendrier, et ton coach en tient compte pour ajuster tes prochaines séances.
        </p>
      </div>

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
