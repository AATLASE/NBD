"use client"

import { cn } from "cn"
import { Check, Pause, Play, SkipForward } from "lucide-react"
import { useEffect } from "react"

import { Carte, Etiquette } from "@/components/blocs"
import { Button } from "@/components/ui/button"
import { chrono } from "@/lib/execution"
import { duree, nombre } from "@/lib/format"
import type { ExerciceDeSeance } from "@/lib/queries"
import { modifierBrouillon, type Brouillon, type EtatCircuit } from "@/lib/seance-en-cours"
import { preparerSignal, signaler, useMaintenant } from "@/lib/signal"

// Durée d'effort d'une station. Un circuit sans durée prescrite retombe sur son temps de repos.
const effortMs = (ligne: ExerciceDeSeance) => (ligne.duree_sec ?? ligne.repos_sec) * 1000

// Passe à la phase suivante : effort, repos, station suivante, puis repos long entre deux tours.
// `effortTenu` : l'effort est allé au bout du temps, la station est donc enregistrée comme faite.
function avancer(
  brouillon: Brouillon,
  cle: string,
  lignes: ExerciceDeSeance[],
  reposToursSec: number | null,
  effortTenu: boolean
): Brouillon {
  const etat = brouillon.circuits[cle]
  if (!etat || etat.phase === "fini") return brouillon

  const maintenant = Date.now()
  const ligne = lignes[etat.station]!
  const tours = lignes[0]!.series
  let suivant: EtatCircuit
  let series = brouillon.series

  if (etat.phase === "effort") {
    if (effortTenu) {
      series = {
        ...series,
        [ligne.id]: [
          ...(series[ligne.id] ?? []),
          { charge: ligne.charge_depart_kg, reps: null, duree: ligne.duree_sec, rir: null },
        ],
      }
    }
    const derniereStation = etat.station === lignes.length - 1
    if (derniereStation && etat.tour === tours - 1) {
      suivant = { ...etat, phase: "fini", fin: null, restant: null }
    } else if (derniereStation) {
      const repos = (reposToursSec ?? ligne.repos_sec) * 1000
      suivant = { ...etat, phase: "entre_tours", fin: maintenant + repos, restant: null }
    } else {
      suivant = { ...etat, phase: "repos", fin: maintenant + ligne.repos_sec * 1000, restant: null }
    }
  } else {
    const nouveauTour = etat.phase === "entre_tours"
    const station = nouveauTour ? 0 : etat.station + 1
    suivant = {
      tour: nouveauTour ? etat.tour + 1 : etat.tour,
      station,
      phase: "effort",
      fin: maintenant + effortMs(lignes[station]!),
      restant: null,
    }
  }

  return { ...brouillon, series, circuits: { ...brouillon.circuits, [cle]: suivant } }
}

const LIBELLE_PHASE = {
  effort: "Effort",
  repos: "Repos",
  entre_tours: "Repos entre les tours",
} as const

export function EcranCircuit({
  cle,
  lignes,
  reposToursSec,
  etat,
  derniereEtape,
  onSuivant,
}: {
  cle: string
  lignes: ExerciceDeSeance[]
  reposToursSec: number | null
  etat: EtatCircuit | undefined
  derniereEtape: boolean
  onSuivant: () => void
}) {
  const reference = lignes[0]!
  const tours = reference.series
  const enCours = etat !== undefined && etat.phase !== "fini"
  const enPause = enCours && etat.fin === null
  const maintenant = useMaintenant(enCours && !enPause)

  const finPhase = enCours ? etat.fin : null
  useEffect(() => {
    if (finPhase === null) return
    const fin = setTimeout(
      () => {
        signaler()
        modifierBrouillon((b) =>
          // Ne fait avancer que la phase pour laquelle ce minuteur a été armé.
          b.circuits[cle]?.fin === finPhase ? avancer(b, cle, lignes, reposToursSec, true) : b
        )
      },
      Math.max(0, finPhase - Date.now())
    )
    return () => clearTimeout(fin)
  }, [finPhase, cle, lignes, reposToursSec])

  function demarrer() {
    preparerSignal()
    modifierBrouillon((b) => ({
      ...b,
      circuits: {
        ...b.circuits,
        [cle]: { tour: 0, station: 0, phase: "effort", fin: Date.now() + effortMs(reference), restant: null },
      },
    }))
  }

  function basculerPause() {
    modifierBrouillon((b) => {
      const actuel = b.circuits[cle]
      if (!actuel || actuel.phase === "fini") return b
      const suivant: EtatCircuit =
        actuel.fin === null
          ? { ...actuel, fin: Date.now() + (actuel.restant ?? 0), restant: null }
          : { ...actuel, fin: null, restant: Math.max(0, actuel.fin - Date.now()) }
      return { ...b, circuits: { ...b.circuits, [cle]: suivant } }
    })
  }

  const reglages = (
    <ul className="flex flex-wrap gap-2">
      <li>
        <Etiquette>
          {tours} tour{tours > 1 ? "s" : ""}
        </Etiquette>
      </li>
      {reference.duree_sec !== null && (
        <li>
          <Etiquette>
            {duree(reference.duree_sec)} d&apos;effort, {duree(reference.repos_sec)} de repos
          </Etiquette>
        </li>
      )}
      {reposToursSec !== null && (
        <li>
          <Etiquette>{duree(reposToursSec)} entre les tours</Etiquette>
        </li>
      )}
    </ul>
  )

  if (!etat) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 pt-5 pb-8">
        <header className="space-y-3">
          <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">Circuit</h2>
          {reglages}
        </header>
        <Carte>
          <ol className="divide-y">
            {lignes.map((ligne, index) => (
              <li key={ligne.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums"
                >
                  {index + 1}
                </span>
                <span className="flex-1 leading-snug font-medium">{ligne.exercise.nom}</span>
                {ligne.charge_depart_kg !== null && (
                  <span className="font-semibold tabular-nums">{nombre(ligne.charge_depart_kg)} kg</span>
                )}
              </li>
            ))}
          </ol>
        </Carte>
        <Button className="h-16 w-full gap-2 text-lg font-semibold" onClick={demarrer}>
          <Play className="size-5" aria-hidden="true" />
          Démarrer le circuit
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Le minuteur enchaîne tout seul les stations et les tours.
        </p>
      </div>
    )
  }

  if (etat.phase === "fini") {
    return (
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 pt-5 pb-8">
        <header className="space-y-3">
          <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">Circuit</h2>
          {reglages}
        </header>
        <Carte className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-5" aria-hidden="true" />
          </span>
          <p className="text-lg font-semibold">Circuit terminé</p>
        </Carte>
        <Button className="h-16 w-full text-lg font-semibold" onClick={onSuivant}>
          {derniereEtape ? "Voir le résumé" : "Exercice suivant"}
        </Button>
      </div>
    )
  }

  const phase = etat.phase
  const effort = phase === "effort"
  const totalMs = effort
    ? effortMs(lignes[etat.station]!)
    : (phase === "entre_tours" ? (reposToursSec ?? reference.repos_sec) : lignes[etat.station]!.repos_sec) * 1000
  const restant = Math.min(totalMs, etat.fin === null ? (etat.restant ?? 0) : Math.max(0, etat.fin - maintenant))
  const stationSuivante = phase === "entre_tours" ? lignes[0]! : lignes[etat.station + 1]

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 px-4 pt-5 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">
          Tour {etat.tour + 1} <span className="font-normal text-muted-foreground">sur {tours}</span>
        </h2>
        <ol aria-label="Stations du tour" className="flex gap-1.5">
          {lignes.map((ligne, index) => (
            <li
              key={ligne.id}
              aria-current={index === etat.station ? "step" : undefined}
              className={cn(
                "h-2 w-6 rounded-full",
                index < etat.station || (index === etat.station && !effort)
                  ? "bg-primary"
                  : index === etat.station
                    ? "bg-primary/50"
                    : "bg-muted"
              )}
            >
              <span className="sr-only">{ligne.exercise.nom}</span>
            </li>
          ))}
        </ol>
      </div>

      <div
        role="timer"
        aria-label={LIBELLE_PHASE[phase]}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl px-4 py-10 text-center",
          effort ? "bg-primary text-primary-foreground" : "border bg-card"
        )}
      >
        <p className="text-lg font-semibold">
          {LIBELLE_PHASE[phase]}
          {enPause && " · en pause"}
        </p>
        <p className="text-8xl leading-none font-bold tracking-tighter tabular-nums">{chrono(restant)}</p>
        {effort ? (
          <p className="text-2xl leading-tight font-bold">
            {lignes[etat.station]!.exercise.nom}
            {lignes[etat.station]!.charge_depart_kg !== null && (
              <span className="block text-lg font-semibold">
                {nombre(lignes[etat.station]!.charge_depart_kg!)} kg
              </span>
            )}
          </p>
        ) : (
          stationSuivante && (
            <p className="text-lg leading-tight">
              <span className="block text-sm font-medium text-muted-foreground">Ensuite</span>
              <span className="font-bold">{stationSuivante.exercise.nom}</span>
            </p>
          )
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-14 gap-2 text-base font-semibold" onClick={basculerPause}>
          {enPause ? (
            <Play className="size-5" aria-hidden="true" />
          ) : (
            <Pause className="size-5" aria-hidden="true" />
          )}
          {enPause ? "Reprendre" : "Pause"}
        </Button>
        <Button
          variant="outline"
          className="h-14 gap-2 text-base font-semibold"
          onClick={() => modifierBrouillon((b) => avancer(b, cle, lignes, reposToursSec, false))}
        >
          <SkipForward className="size-5" aria-hidden="true" />
          Passer
        </Button>
      </div>
    </div>
  )
}
