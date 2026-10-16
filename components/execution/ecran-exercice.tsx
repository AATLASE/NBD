"use client"

import { cn } from "cn"
import { Check, History, Pencil, TrendingUp } from "lucide-react"
import { useState } from "react"

import { Carte } from "@/components/blocs"
import { Stepper } from "@/components/execution/stepper"
import { Button } from "@/components/ui/button"
import {
  PAS_DUREE_SEC,
  PAS_REPS,
  champsDe,
  chargeSuggeree,
  derniereFois,
  pasDeCharge,
  texteSerie,
  valeursInitiales,
} from "@/lib/execution"
import { duree, nombre, prescription } from "@/lib/format"
import type { ExerciceDeSeance, SeanceFaite } from "@/lib/queries"
import { modifierBrouillon, type SerieFaite } from "@/lib/seance-en-cours"
import { preparerSignal } from "@/lib/signal"

const RIR = [0, 1, 2, 3, 4] as const
const RIR_MAX = RIR.at(-1)!

export function EcranExercice({
  ligne,
  historique,
  faites,
  derniereEtape,
  onSuivant,
  onHistorique,
  onModifier,
}: {
  ligne: ExerciceDeSeance
  historique: SeanceFaite[]
  faites: SerieFaite[]
  derniereEtape: boolean
  onSuivant: () => void
  onHistorique: () => void
  onModifier: () => void
}) {
  // Série rouverte pour correction, série ajoutée au-delà du nombre prévu, charge proposée acceptée.
  const [edition, setEdition] = useState<number | null>(null)
  const [serieEnPlus, setSerieEnPlus] = useState(false)
  const [chargeProposee, setChargeProposee] = useState<number | null>(null)

  const derniere = derniereFois(historique, ligne.id)
  const suggestion = faites.length === 0 && chargeProposee === null ? chargeSuggeree(historique, ligne) : null
  const toutFait = faites.length >= ligne.series && !serieEnPlus
  const active = edition ?? (toutFait ? null : faites.length)
  const lignesAffichees = Math.max(ligne.series, faites.length + (serieEnPlus ? 1 : 0))

  function valider(index: number, serie: SerieFaite) {
    const nouvelle = index === faites.length
    // Pas de repos après la toute dernière série de la séance : il n'y a plus rien à attendre.
    const lancerRepos = nouvelle && !(derniereEtape && index + 1 >= ligne.series)
    preparerSignal()
    modifierBrouillon((b) => {
      const series = [...(b.series[ligne.id] ?? [])]
      // Corriger une série garde son heure d'origine : c'est elle qui sert au temps détaillé.
      series[index] = { ...serie, fin: series[index]?.fin ?? Date.now() }
      return {
        ...b,
        series: { ...b.series, [ligne.id]: series },
        repos: lancerRepos
          ? { fin: Date.now() + ligne.repos_sec * 1000, total: ligne.repos_sec * 1000 }
          : b.repos,
      }
    })
    setEdition(null)
    setSerieEnPlus(false)
  }

  function supprimerDerniere() {
    modifierBrouillon((b) => ({
      ...b,
      series: { ...b.series, [ligne.id]: (b.series[ligne.id] ?? []).slice(0, -1) },
    }))
    setEdition(null)
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 pt-5 pb-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">{ligne.exercise.nom}</h2>
          <p className="text-muted-foreground tabular-nums">
            {prescription(ligne)} · {duree(ligne.repos_sec)} de repos
          </p>
        </div>
        {ligne.note && <p className="text-sm leading-snug text-muted-foreground">{ligne.note}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11 gap-2 px-4 text-base" onClick={onHistorique}>
            <History className="size-5" aria-hidden="true" />
            Historique
          </Button>
          <Button variant="outline" className="h-11 gap-2 px-4 text-base" onClick={onModifier}>
            <Pencil className="size-4" aria-hidden="true" />
            Modifier
          </Button>
        </div>
      </header>

      {suggestion && (
        <div className="space-y-3 rounded-2xl bg-brand-soft p-4">
          <p className="flex gap-2 leading-snug font-medium">
            <TrendingUp className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
            Tes 3 dernières séries avaient au moins 3 reps en réserve. Tu peux monter la charge.
          </p>
          <Button
            className="h-12 w-full text-base font-semibold"
            onClick={() => setChargeProposee(suggestion.a)}
          >
            Passer de {nombre(suggestion.de)} à {nombre(suggestion.a)} kg
          </Button>
        </div>
      )}

      <ol className="space-y-3">
        {Array.from({ length: lignesAffichees }, (_, index) => {
          const faite = faites[index]

          if (index === active) {
            return (
              <li key={index}>
                <SerieActive
                  // La clé remet les steppers aux valeurs proposées à chaque changement de série.
                  key={`${index}-${chargeProposee ?? ""}`}
                  ligne={ligne}
                  numero={index + 1}
                  total={lignesAffichees}
                  initiales={
                    faite
                      ? { charge: faite.charge ?? 0, reps: faite.reps ?? 0, duree: faite.duree ?? 0 }
                      : valeursInitiales(ligne, derniere, faites, index, chargeProposee)
                  }
                  rirInitial={faite?.rir ?? null}
                  correction={faite !== undefined}
                  onValider={(serie) => valider(index, serie)}
                  onSupprimer={faite && index === faites.length - 1 ? supprimerDerniere : undefined}
                  onAnnuler={faite ? () => setEdition(null) : undefined}
                />
              </li>
            )
          }

          if (faite) {
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => setEdition(index)}
                  aria-label={`Série ${index + 1}, ${texteSerie(faite)}. Modifier`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-lg font-semibold tabular-nums">{texteSerie(faite)}</span>
                  {faite.rir !== null && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      RIR {faite.rir === RIR_MAX ? `${RIR_MAX}+` : faite.rir}
                    </span>
                  )}
                </button>
              </li>
            )
          }

          return (
            <li
              key={index}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed px-4 text-muted-foreground"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                {index + 1}
              </span>
              Série {index + 1}
            </li>
          )
        })}
      </ol>

      {toutFait && edition === null && (
        <div className="space-y-3">
          <Button className="h-16 w-full text-lg font-semibold" onClick={onSuivant}>
            {derniereEtape ? "Voir le résumé" : "Exercice suivant"}
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full text-base text-muted-foreground"
            onClick={() => setSerieEnPlus(true)}
          >
            Ajouter une série
          </Button>
        </div>
      )}
    </div>
  )
}

function SerieActive({
  ligne,
  numero,
  total,
  initiales,
  rirInitial,
  correction,
  onValider,
  onSupprimer,
  onAnnuler,
}: {
  ligne: ExerciceDeSeance
  numero: number
  total: number
  initiales: { charge: number; reps: number; duree: number }
  rirInitial: number | null
  correction: boolean
  onValider: (serie: SerieFaite) => void
  onSupprimer?: () => void
  onAnnuler?: () => void
}) {
  const champs = champsDe(ligne)
  const [charge, setCharge] = useState(initiales.charge)
  const [reps, setReps] = useState(initiales.reps)
  const [dureeSec, setDureeSec] = useState(initiales.duree)
  const [rir, setRir] = useState(rirInitial)

  return (
    <Carte className="space-y-5 border-2 border-primary p-4">
      <p className="font-semibold">
        Série {numero} <span className="font-normal text-muted-foreground">sur {total}</span>
      </p>

      {champs.charge && (
        <Stepper libelle="Charge" valeur={charge} unite="kg" pas={pasDeCharge(ligne)} onChange={setCharge} />
      )}
      {champs.reps && (
        <Stepper libelle="Répétitions" valeur={reps} unite="reps" pas={PAS_REPS} onChange={setReps} />
      )}
      {champs.duree && (
        <Stepper
          libelle="Durée"
          valeur={dureeSec}
          unite="s"
          pas={PAS_DUREE_SEC}
          min={PAS_DUREE_SEC}
          onChange={setDureeSec}
        />
      )}

      {(champs.reps || champs.duree) && (
        <div role="group" aria-label="Répétitions en réserve, facultatif" className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Reps en réserve (facultatif)</p>
          <div className="grid grid-cols-5 gap-2">
            {RIR.map((valeur) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={rir === valeur}
                onClick={() => setRir(rir === valeur ? null : valeur)}
                className={cn(
                  "h-12 rounded-xl border text-lg font-semibold tabular-nums outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring/50",
                  rir === valeur ? "border-primary bg-primary text-primary-foreground" : "bg-card active:bg-muted"
                )}
              >
                {valeur === RIR_MAX ? `${valeur}+` : valeur}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        className="h-16 w-full text-lg font-semibold"
        onClick={() =>
          onValider({
            charge: champs.charge ? charge : null,
            reps: champs.reps ? reps : null,
            duree: champs.duree ? dureeSec : null,
            rir,
          })
        }
      >
        {correction ? "Enregistrer la correction" : "Série validée"}
      </Button>

      {(onAnnuler || onSupprimer) && (
        <div className="flex gap-2">
          {onAnnuler && (
            <Button variant="outline" className="h-11 flex-1 text-base" onClick={onAnnuler}>
              Annuler
            </Button>
          )}
          {onSupprimer && (
            <Button variant="destructive" className="h-11 flex-1 text-base" onClick={onSupprimer}>
              Supprimer la série
            </Button>
          )}
        </div>
      )}
    </Carte>
  )
}
