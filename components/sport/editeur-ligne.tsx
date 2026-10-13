"use client"

import { useState } from "react"

import { Stepper } from "@/components/execution/stepper"
import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { pasPourIncrement } from "@/lib/execution"
import { modifierLigne, retirerExercice, type ChampsLigne } from "@/lib/mutations"
import type { ExerciceDeSeance, Seance } from "@/lib/queries"

type Mesure = "reps" | "duree" | "libre"

// Valeurs proposées quand on active un réglage qui n'existait pas encore sur l'exercice.
const DEFAUTS = { repsMin: 8, repsMax: 12, duree: 30, charge: 20, increment: 2.5 }

export function EditeurLigne({
  ligne,
  onFermer,
  onRemplacer,
}: {
  ligne: ExerciceDeSeance | null
  onFermer: () => void
  // Fourni par l'écran qui sait ouvrir le choix d'un exercice de remplacement.
  onRemplacer?: (ligne: ExerciceDeSeance) => void
}) {
  return (
    <Sheet open={ligne !== null} onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl text-base"
      >
        {/* La clé repart d'un formulaire neuf à chaque exercice ouvert. */}
        {ligne && <Formulaire key={ligne.id} ligne={ligne} onFermer={onFermer} onRemplacer={onRemplacer} />}
      </SheetContent>
    </Sheet>
  )
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t px-4 py-4">
      <legend className="float-left mb-3 w-full text-sm font-semibold text-brand">{titre}</legend>
      <div className="clear-both space-y-3">{children}</div>
    </fieldset>
  )
}

function Formulaire({
  ligne,
  onFermer,
  onRemplacer,
}: {
  ligne: ExerciceDeSeance
  onFermer: () => void
  onRemplacer?: (ligne: ExerciceDeSeance) => void
}) {
  const { executer, enCours } = useEdition()

  const [series, setSeries] = useState(ligne.series)
  const [mesure, setMesure] = useState<Mesure>(
    ligne.duree_sec !== null ? "duree" : ligne.reps_min !== null ? "reps" : "libre"
  )
  const [repsMin, setRepsMin] = useState(ligne.reps_min ?? DEFAUTS.repsMin)
  const [repsMax, setRepsMax] = useState(ligne.reps_max ?? ligne.reps_min ?? DEFAUTS.repsMax)
  const [dureeSec, setDureeSec] = useState(ligne.duree_sec ?? DEFAUTS.duree)
  const [repos, setRepos] = useState(ligne.repos_sec)
  const [avecCharge, setAvecCharge] = useState(ligne.charge_depart_kg !== null)
  const [depart, setDepart] = useState(ligne.charge_depart_kg ?? DEFAUTS.charge)
  const [cible, setCible] = useState(ligne.charge_cible_kg ?? ligne.charge_depart_kg ?? DEFAUTS.charge)
  const [increment, setIncrement] = useState(ligne.increment_kg ?? DEFAUTS.increment)
  const [bloc, setBloc] = useState<"series" | "circuit">(ligne.bloc === "circuit" ? "circuit" : "series")
  const [note, setNote] = useState(ligne.note ?? "")

  const pas = pasPourIncrement(increment)

  // Mise à jour immédiate de l'écran, avant la réponse du serveur.
  const dansLeCache = (maj: (l: ExerciceDeSeance) => ExerciceDeSeance | null) => ({
    cle: ["seances"],
    maj: (seances: Seance[]) =>
      seances.map((seance) => ({
        ...seance,
        workout_exercises: seance.workout_exercises.flatMap((l) => {
          if (l.id !== ligne.id) return [l]
          const suivant = maj(l)
          return suivant ? [suivant] : []
        }),
      })),
  })

  async function enregistrer() {
    const voulu: Required<ChampsLigne> = {
      series,
      reps_min: mesure === "reps" ? Math.min(repsMin, repsMax) : null,
      reps_max: mesure === "reps" ? Math.max(repsMin, repsMax) : null,
      duree_sec: mesure === "duree" ? dureeSec : null,
      repos_sec: repos,
      charge_depart_kg: avecCharge ? depart : null,
      charge_cible_kg: avecCharge ? Math.max(depart, cible) : null,
      increment_kg: avecCharge ? increment : null,
      bloc,
      note: note.trim() || null,
    }
    // On n'envoie que ce qui a changé : l'historique dit alors exactement ce qui a bougé.
    const champs = Object.fromEntries(
      Object.entries(voulu).filter(([cle, valeur]) => ligne[cle as keyof ChampsLigne] !== valeur)
    ) as ChampsLigne

    onFermer()
    if (Object.keys(champs).length === 0) return
    await executer(
      () => modifierLigne(ligne.id, champs),
      dansLeCache((l) => ({ ...l, ...champs }))
    )
  }

  async function retirer() {
    onFermer()
    await executer(
      () => retirerExercice(ligne.id),
      dansLeCache(() => null)
    )
  }

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">{ligne.exercise.nom}</SheetTitle>
        <SheetDescription className="text-base">Réglages de cet exercice dans la séance</SheetDescription>
      </SheetHeader>

      <Groupe titre="Charge">
        <Filtres
          libelle="Exercice avec ou sans charge"
          valeur={avecCharge ? "oui" : "non"}
          onChange={(v) => setAvecCharge(v === "oui")}
          options={[
            { valeur: "oui", libelle: "Avec charge" },
            { valeur: "non", libelle: "Sans charge" },
          ]}
        />
        {avecCharge && (
          <>
            <Stepper
              compact
              libelle="Charge de départ"
              valeur={depart}
              unite="kg"
              pas={pas}
              onChange={(v) => {
                setDepart(v)
                // La cible ne peut pas rester sous le départ.
                if (v > cible) setCible(v)
              }}
            />
            <Stepper compact libelle="Charge cible" valeur={cible} unite="kg" pas={pas} min={depart} onChange={setCible} />
            <Stepper
              compact
              libelle="Incrément de progression"
              valeur={increment}
              unite="kg"
              pas={0.5}
              min={0.5}
              max={50}
              onChange={setIncrement}
            />
          </>
        )}
      </Groupe>

      <Groupe titre="Séries">
        <Stepper compact libelle="Nombre de séries" valeur={series} unite="" pas={1} min={1} max={20} onChange={setSeries} />
        <Filtres
          libelle="Ce qui est compté dans une série"
          valeur={mesure}
          onChange={setMesure}
          options={[
            { valeur: "reps", libelle: "Répétitions" },
            { valeur: "duree", libelle: "Durée" },
            { valeur: "libre", libelle: "Libre" },
          ]}
        />
        {mesure === "reps" && (
          <>
            <Stepper
              compact
              libelle="Reps minimum"
              valeur={repsMin}
              unite="reps"
              pas={1}
              min={1}
              max={200}
              onChange={(v) => {
                setRepsMin(v)
                if (v > repsMax) setRepsMax(v)
              }}
            />
            <Stepper compact libelle="Reps maximum" valeur={repsMax} unite="reps" pas={1} min={repsMin} max={200} onChange={setRepsMax} />
          </>
        )}
        {mesure === "duree" && (
          <Stepper compact libelle="Durée d'une série" valeur={dureeSec} unite="s" pas={5} min={5} max={3600} onChange={setDureeSec} />
        )}
        <Stepper compact libelle="Repos entre les séries" valeur={repos} unite="s" pas={15} min={0} max={900} onChange={setRepos} />
      </Groupe>

      <Groupe titre="Organisation">
        <Filtres
          libelle="Type de bloc"
          valeur={bloc}
          onChange={setBloc}
          options={[
            { valeur: "series", libelle: "Séries classiques" },
            { valeur: "circuit", libelle: "Dans un circuit" },
          ]}
        />
        <div className="space-y-2">
          <Label htmlFor="note-ligne">Note</Label>
          <Input
            id="note-ligne"
            value={note}
            maxLength={300}
            onChange={(evenement) => setNote(evenement.target.value)}
            className="h-12"
          />
        </div>
      </Groupe>

      <div className="sticky bottom-0 space-y-2 border-t bg-popover px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button className="h-14 w-full text-lg font-semibold" disabled={enCours} onClick={enregistrer}>
          Enregistrer
        </Button>
        {onRemplacer && (
          <Button
            variant="outline"
            className="h-11 w-full text-base"
            disabled={enCours}
            onClick={() => {
              onFermer()
              onRemplacer(ligne)
            }}
          >
            Remplacer par un autre exercice
          </Button>
        )}
        <Button variant="destructive" className="h-11 w-full text-base" disabled={enCours} onClick={retirer}>
          Retirer de la séance
        </Button>
      </div>
    </>
  )
}
