"use client"

import { cn } from "cn"
import { Check, ChevronDown } from "lucide-react"
import { useState } from "react"

import { Stepper } from "@/components/execution/stepper"
import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { champsDe, derniereFois, pasDeCharge, texteSerie, valeursInitiales } from "@/lib/execution"
import { dateLongue } from "@/lib/format"
import { enregistrerSeanceApresCoup } from "@/lib/mutations"
import { useHistoriqueSeries, type ExerciceDeSeance, type Seance, type SeanceFaite } from "@/lib/queries"

// Une séance faite sans l'application, saisie après coup pour la date choisie dans le calendrier.
// Tout est pré-rempli comme en salle (dernières charges, sinon le programme) : si elle s'est
// passée comme prévu, un seul appui suffit.

type Saisie = { fait: boolean; series: number; charge: number | null; reps: number | null; duree: number | null }

function saisieInitiale(ligne: ExerciceDeSeance, historique: SeanceFaite[]): Saisie {
  const champs = champsDe(ligne)
  const valeurs = valeursInitiales(ligne, derniereFois(historique, ligne.id), [], 0, null)
  return {
    fait: true,
    series: ligne.series,
    charge: champs.charge ? valeurs.charge : null,
    reps: champs.reps ? valeurs.reps : null,
    duree: champs.duree ? valeurs.duree : null,
  }
}

export function SaisieApresCoup({
  ouvert,
  onFermer,
  date,
  seances,
  seanceInitiale,
}: {
  ouvert: boolean
  onFermer: () => void
  date: string
  seances: Seance[]
  seanceInitiale: Seance | undefined
}) {
  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
      >
        {ouvert && seances.length > 0 && (
          <Contenu date={date} seances={seances} seanceInitiale={seanceInitiale ?? seances[0]!} onFermer={onFermer} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Contenu({
  date,
  seances,
  seanceInitiale,
  onFermer,
}: {
  date: string
  seances: Seance[]
  seanceInitiale: Seance
  onFermer: () => void
}) {
  const [seanceId, setSeanceId] = useState(seanceInitiale.id)
  const seance = seances.find((s) => s.id === seanceId) ?? seanceInitiale
  const historique = useHistoriqueSeries()

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetDescription className="text-sm font-semibold text-brand">{dateLongue(date)}</SheetDescription>
        <SheetTitle className="text-xl font-bold">Enregistrer une séance faite</SheetTitle>
        <p className="text-muted-foreground">
          Tout est pré-rempli avec tes dernières charges. Décoche ce que tu n&apos;as pas fait, ajuste le reste.
        </p>
      </SheetHeader>
      <div className="space-y-5 px-4">
        {seances.length > 1 && (
          <Filtres
            libelle="Séance faite"
            valeur={seanceId}
            onChange={setSeanceId}
            options={seances.map((s) => ({ valeur: s.id, libelle: `${s.code} · ${s.nom}` }))}
          />
        )}
        {historique.data ? (
          // Changer de séance repart de ses propres valeurs.
          <Formulaire key={seance.id} date={date} seance={seance} historique={historique.data} onFermer={onFermer} />
        ) : (
          <p className="text-muted-foreground">Chargement de tes dernières séances…</p>
        )}
      </div>
    </>
  )
}

function Formulaire({
  date,
  seance,
  historique,
  onFermer,
}: {
  date: string
  seance: Seance
  historique: SeanceFaite[]
  onFermer: () => void
}) {
  const { executer, enCours } = useEdition()
  const [saisies, setSaisies] = useState<Record<string, Saisie>>(() =>
    Object.fromEntries(seance.workout_exercises.map((l) => [l.id, saisieInitiale(l, historique)]))
  )
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [dureeMin, setDureeMin] = useState(seance.duree_min)
  const [commentaire, setCommentaire] = useState("")

  const modifier = (id: string, maj: Partial<Saisie>) => setSaisies((s) => ({ ...s, [id]: { ...s[id]!, ...maj } }))
  const series = seance.workout_exercises.flatMap((ligne) => {
    const s = saisies[ligne.id]!
    if (!s.fait) return []
    return Array.from({ length: s.series }, (_, i) => ({
      workout_exercise_id: ligne.id,
      serie_num: i + 1,
      charge_kg: s.charge,
      reps: s.reps,
      duree_sec: s.duree && s.duree > 0 ? s.duree : null,
      rir: null,
    }))
  })

  async function enregistrer() {
    const resultat = await executer(() =>
      enregistrerSeanceApresCoup({
        id: crypto.randomUUID(),
        workoutId: seance.id,
        date,
        dureeMin,
        ressenti: null,
        series,
        note: commentaire.trim() || null,
      })
    )
    if (resultat.ok) onFermer()
  }

  return (
    <>
      <ul className="divide-y rounded-2xl border bg-card">
        {seance.workout_exercises.map((ligne) => {
          const s = saisies[ligne.id]!
          const champs = champsDe(ligne)
          const deplie = ouverte === ligne.id
          const detail = texteSerie({ charge: s.charge, reps: s.reps, duree: s.duree })
          const resume = `${s.series} série${s.series > 1 ? "s" : ""}${detail === "Faite" ? "" : ` · ${detail}`}`
          return (
            <li key={ligne.id}>
              <div className="flex items-stretch">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={s.fait}
                  aria-label={`${ligne.exercise.nom} fait`}
                  onClick={() => modifier(ligne.id, { fait: !s.fait })}
                  className="flex w-14 shrink-0 items-center justify-center outline-none focus-visible:bg-muted active:bg-muted"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg border-2 transition-colors duration-150",
                      s.fait ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {s.fait && <Check className="size-4" strokeWidth={3} />}
                  </span>
                </button>
                <button
                  type="button"
                  aria-expanded={deplie}
                  disabled={!s.fait}
                  onClick={() => setOuverte(deplie ? null : ligne.id)}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-2 py-3 pr-4 text-left outline-none focus-visible:bg-muted active:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block leading-snug font-medium", !s.fait && "line-through")}>
                      {ligne.exercise.nom}
                    </span>
                    <span className="block text-sm text-muted-foreground tabular-nums">
                      {s.fait ? resume : "Pas fait"}
                    </span>
                  </span>
                  {s.fait && (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
                      Ajuster
                      <ChevronDown
                        className={cn("size-4 transition-transform duration-200", deplie && "rotate-180")}
                        aria-hidden="true"
                      />
                    </span>
                  )}
                </button>
              </div>
              {deplie && s.fait && (
                <div className="space-y-4 border-t bg-muted/40 px-4 py-4">
                  <Stepper libelle="Séries" valeur={s.series} unite="" pas={1} min={1} max={20} compact onChange={(v) => modifier(ligne.id, { series: v })} />
                  {s.reps !== null && (
                    <Stepper libelle="Répétitions" valeur={s.reps} unite="reps" pas={1} max={999} compact onChange={(v) => modifier(ligne.id, { reps: v })} />
                  )}
                  {champs.duree && s.duree !== null && (
                    <Stepper libelle="Durée" valeur={s.duree} unite="s" pas={5} min={5} max={3600} compact onChange={(v) => modifier(ligne.id, { duree: v })} />
                  )}
                  {s.charge !== null && (
                    <Stepper libelle="Charge" valeur={s.charge} unite="kg" pas={pasDeCharge(ligne)} max={1000} compact onChange={(v) => modifier(ligne.id, { charge: v })} />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Stepper libelle="Durée de la séance" valeur={dureeMin} unite="min" pas={5} min={5} max={600} onChange={setDureeMin} />

      <div className="space-y-2">
        <label htmlFor="commentaire-apres-coup" className="font-semibold">
          Commentaire
        </label>
        <textarea
          id="commentaire-apres-coup"
          value={commentaire}
          maxLength={1000}
          rows={3}
          onChange={(evenement) => setCommentaire(evenement.target.value)}
          placeholder="Sensations, fatigue, douleur, technique…"
          className="min-h-24 w-full resize-y rounded-2xl border bg-card px-4 py-3 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-sm text-muted-foreground">Facultatif. Ton coach en tient compte pour ajuster tes prochaines séances.</p>
      </div>

      <Button className="h-14 w-full text-lg font-semibold" disabled={enCours || series.length === 0} onClick={enregistrer}>
        {series.length === 0
          ? "Coche au moins un exercice"
          : `Enregistrer ${series.length} série${series.length > 1 ? "s" : ""}`}
      </Button>
    </>
  )
}
