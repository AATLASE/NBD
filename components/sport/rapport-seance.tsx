"use client"

import { Trophy } from "lucide-react"

import { Carte, Stat } from "@/components/blocs"
import { texteSerie } from "@/lib/execution"
import { duree, nombre } from "@/lib/format"
import { LIBELLE_GROUPE } from "@/lib/libelles"
import { useMesures, useProfil } from "@/lib/queries"
import {
  caloriesEstimees,
  records,
  tempsParExercice,
  volumeParGroupe,
  type SerieHistorique,
  type SerieRapport,
} from "@/lib/rapport"

// Le rapport d'une séance : durée, dépense, séries et volume, records personnels, volume par
// muscle et détail par exercice. Le même à la fin de la séance et depuis le calendrier.

// Le poids du jour de la séance, ou le plus récent avant ; à défaut, celui du profil.
export function usePoidsLe(date: string) {
  const mesures = useMesures()
  const profil = useProfil()
  const pesee = mesures.data?.find((m) => m.date <= date && m.poids_kg !== null)
  return pesee?.poids_kg ?? profil.data?.poids_initial_kg ?? null
}

export function RapportSeance({
  series,
  debut,
  dureeMin,
  kcalMontre,
  poidsKg,
  historique,
}: {
  series: SerieRapport[]
  debut: number | null
  dureeMin: number | null
  kcalMontre: number | null
  poidsKg: number | null
  // Toutes les séries précédentes des mêmes exercices ; `undefined` pendant le chargement.
  historique: SerieHistorique[] | undefined
}) {
  const volume = series.reduce((total, s) => total + (s.charge ?? 0) * (s.reps ?? 0), 0)
  const kcal = kcalMontre ?? (dureeMin !== null && poidsKg !== null ? caloriesEstimees(dureeMin, poidsKg, series) : null)
  const temps = tempsParExercice(series, debut)
  const groupes = volumeParGroupe(series)
  const maxSeries = Math.max(1, ...groupes.map((g) => g.series))
  const exercices = [...new Map(series.map((s) => [s.exerciseId, s])).values()]
  const trouves = historique ? records(series, historique) : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat libelle="Durée" valeur={dureeMin ?? "–"} unite={dureeMin !== null ? "min" : undefined} />
        <div>
          <Stat
            libelle={kcalMontre !== null ? "Dépense (montre)" : "Dépense estimée"}
            valeur={kcal !== null ? `${kcalMontre !== null ? "" : "≈ "}${nombre(kcal)}` : "–"}
            unite={kcal !== null ? "kcal" : undefined}
          />
          {kcal === null && (
            <p className="mt-1 px-1 text-xs text-muted-foreground">Ajoute une pesée pour l&apos;estimer.</p>
          )}
        </div>
        <Stat libelle="Séries" valeur={series.length} />
        <Stat libelle="Volume soulevé" valeur={nombre(Math.round(volume))} unite="kg" />
      </div>

      <section className="space-y-3" aria-labelledby="rapport-records">
        <h3 id="rapport-records" className="text-lg font-semibold tracking-tight">
          Records personnels
        </h3>
        {trouves === null ? (
          <p className="text-muted-foreground">Recherche de tes records…</p>
        ) : trouves.length === 0 ? (
          <p className="text-muted-foreground">
            Pas de record cette fois. Chaque exercice est comparé à toutes tes séances précédentes.
          </p>
        ) : (
          <ul className="space-y-2">
            {trouves.map((record) => (
              <li key={record.exerciseId}>
                <Carte className="flex items-center gap-3 border-brand/40 p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Trophy className="size-5" aria-hidden="true" />
                  </span>
                  <p className="min-w-0 leading-snug">
                    <span className="block text-sm font-semibold text-brand">{record.titre}</span>
                    <span className="block font-semibold">{record.nom}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums">{record.detail}</span>
                  </p>
                </Carte>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groupes.length > 0 && (
        <section className="space-y-3" aria-labelledby="rapport-muscles">
          <h3 id="rapport-muscles" className="text-lg font-semibold tracking-tight">
            Volume par muscle
          </h3>
          <Carte className="p-4">
            <ul className="space-y-3">
              {groupes.map((g) => (
                <li key={g.groupe} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{LIBELLE_GROUPE[g.groupe] ?? "Autre"}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {g.series} série{g.series > 1 ? "s" : ""}
                      {g.volumeKg > 0 && ` · ${nombre(Math.round(g.volumeKg))} kg`}
                    </span>
                  </div>
                  {/* La longueur suit le nombre de séries : c'est la seule mesure commune au poids du corps et aux charges. */}
                  <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(g.series / maxSeries) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Carte>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="rapport-exercices">
        <h3 id="rapport-exercices" className="text-lg font-semibold tracking-tight">
          Détail par exercice
        </h3>
        <Carte>
          <ul className="divide-y">
            {exercices.map((exercice) => {
              const siennes = series.filter((s) => s.exerciseId === exercice.exerciseId)
              const t = temps?.find((x) => x.exerciseId === exercice.exerciseId)
              return (
                <li key={exercice.exerciseId} className="space-y-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="leading-snug font-medium">{exercice.nom}</span>
                    {t && <span className="shrink-0 text-sm font-semibold tabular-nums">{duree(t.dureeSec)}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {siennes.map((s) => texteSerie({ charge: s.charge, reps: s.reps, duree: s.duree })).join(" · ")}
                  </p>
                  {t?.entreSeriesSec != null && (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {duree(t.entreSeriesSec)} entre deux séries
                      {exercice.reposPrevuSec !== null && ` (repos prévu ${duree(exercice.reposPrevuSec)})`}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Carte>
        {temps === null && (
          <p className="text-sm text-muted-foreground">
            Le temps par exercice n&apos;est mesuré que pour les séances faites avec le mode séance.
          </p>
        )}
      </section>
    </div>
  )
}
