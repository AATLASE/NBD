"use client"

import { useState } from "react"

import { Stepper } from "@/components/execution/stepper"
import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { JOURS, LIBELLE_LIEU, LIEUX, majuscule } from "@/lib/libelles"
import { modifierSeance, type ChampsSeance } from "@/lib/mutations"
import type { Seance } from "@/lib/queries"

const AUCUN_JOUR = "aucun"
const REPOS_TOURS_DEFAUT = 120

export function EditeurSeance({
  seance,
  ouvert,
  onFermer,
}: {
  seance: Seance
  ouvert: boolean
  onFermer: () => void
}) {
  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl text-base"
      >
        {ouvert && <Formulaire seance={seance} onFermer={onFermer} />}
      </SheetContent>
    </Sheet>
  )
}

function Formulaire({ seance, onFermer }: { seance: Seance; onFermer: () => void }) {
  const { executer, enCours } = useEdition()
  const aUnCircuit = seance.workout_exercises.some((l) => l.bloc === "circuit")

  const [nom, setNom] = useState(seance.nom)
  const [code, setCode] = useState(seance.code)
  const [jour, setJour] = useState<string>(seance.jour_suggere ?? AUCUN_JOUR)
  const [lieu, setLieu] = useState<string>(seance.lieu)
  const [dureeMin, setDureeMin] = useState(seance.duree_min)
  const [reposTours, setReposTours] = useState(seance.circuit_repos_tours_sec ?? REPOS_TOURS_DEFAUT)
  const [note, setNote] = useState(seance.note ?? "")

  const valide = nom.trim().length > 0 && code.trim().length > 0

  async function enregistrer() {
    const voulu: Required<ChampsSeance> = {
      nom: nom.trim(),
      code: code.trim(),
      jour_suggere: jour === AUCUN_JOUR ? null : jour,
      lieu,
      duree_min: dureeMin,
      circuit_repos_tours_sec: aUnCircuit ? reposTours : seance.circuit_repos_tours_sec,
      note: note.trim() || null,
    }
    const champs = Object.fromEntries(
      Object.entries(voulu).filter(([cle, valeur]) => seance[cle as keyof ChampsSeance] !== valeur)
    ) as ChampsSeance

    onFermer()
    if (Object.keys(champs).length === 0) return
    await executer(() => modifierSeance(seance.id, champs), {
      cle: ["seances"],
      maj: (seances: Seance[]) => seances.map((s) => (s.id === seance.id ? { ...s, ...champs } : s)),
    })
  }

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">Réglages de la séance</SheetTitle>
        <SheetDescription className="text-base">Nom, jour, lieu et durée</SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-4">
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <div className="space-y-2">
            <Label htmlFor="seance-nom">Nom</Label>
            <Input
              id="seance-nom"
              value={nom}
              maxLength={60}
              required
              onChange={(e) => setNom(e.target.value)}
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seance-code">Code</Label>
            <Input
              id="seance-code"
              value={code}
              maxLength={8}
              required
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value)}
              className="h-12 text-center font-semibold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Jour de la semaine</p>
          <Filtres
            libelle="Jour de la semaine"
            valeur={jour}
            onChange={setJour}
            options={[
              { valeur: AUCUN_JOUR, libelle: "Aucun" },
              ...JOURS.map((j) => ({ valeur: j as string, libelle: majuscule(j) })),
            ]}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Lieu</p>
          <Filtres
            libelle="Lieu"
            valeur={lieu}
            onChange={setLieu}
            options={LIEUX.map((l) => ({ valeur: l as string, libelle: LIBELLE_LIEU[l]! }))}
          />
        </div>

        <Stepper compact libelle="Durée prévue" valeur={dureeMin} unite="min" pas={5} min={5} max={300} onChange={setDureeMin} />
        {aUnCircuit && (
          <Stepper
            compact
            libelle="Repos entre les tours du circuit"
            valeur={reposTours}
            unite="s"
            pas={15}
            min={0}
            max={900}
            onChange={setReposTours}
          />
        )}

        <div className="space-y-2">
          <Label htmlFor="seance-note">Note</Label>
          <textarea
            id="seance-note"
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
      </div>

      <div className="sticky bottom-0 border-t bg-popover px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          className="h-14 w-full text-lg font-semibold"
          disabled={enCours || !valide}
          onClick={enregistrer}
        >
          Enregistrer
        </Button>
      </div>
    </>
  )
}
