"use client"

import { Plus } from "lucide-react"
import { useState } from "react"

import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { EQUIPEMENTS, GROUPES, LIBELLE_EQUIPEMENT, LIBELLE_GROUPE } from "@/lib/libelles"
import { ajouterExercice, remplacerExercice, type SourceExercice } from "@/lib/mutations"
import { useExercices, type ExerciceDeSeance } from "@/lib/queries"

const sansAccent = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

// Ajoute un exercice à la séance : un exercice déjà connu, ou un nouveau créé sur place.
// Avec `remplace`, l'exercice choisi prend la place de cette ligne au lieu de s'ajouter à la fin.
// `onAjoute` reçoit l'identifiant de la ligne créée, pour l'ouvrir aussitôt en réglage.
export function AjoutExercice({
  seanceId,
  remplace,
  ouvert,
  onFermer,
  onAjoute,
}: {
  seanceId: string
  remplace?: ExerciceDeSeance
  ouvert: boolean
  onFermer: () => void
  onAjoute: (ligneId: string) => void
}) {
  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl text-base"
      >
        {ouvert && <Contenu seanceId={seanceId} remplace={remplace} onFermer={onFermer} onAjoute={onAjoute} />}
      </SheetContent>
    </Sheet>
  )
}

function Contenu({
  seanceId,
  remplace,
  onFermer,
  onAjoute,
}: {
  seanceId: string
  remplace?: ExerciceDeSeance
  onFermer: () => void
  onAjoute: (ligneId: string) => void
}) {
  const exercices = useExercices()
  const { executer, enCours } = useEdition()
  const [recherche, setRecherche] = useState("")
  const [groupe, setGroupe] = useState<string>(GROUPES[0])
  const [equipement, setEquipement] = useState<string>(EQUIPEMENTS[0])

  const terme = sansAccent(recherche.trim())
  // On ne propose pas de remplacer un exercice par lui-même.
  const trouves = (exercices.data ?? []).filter(
    (e) => sansAccent(e.nom).includes(terme) && e.id !== remplace?.exercise_id
  )
  const existeDeja = trouves.some((e) => sansAccent(e.nom) === terme)
  const peutCreer = recherche.trim().length >= 2 && !existeDeja

  async function ajouter(source: SourceExercice) {
    const resultat = await executer(() =>
      remplace ? remplacerExercice(remplace.id, source) : ajouterExercice(seanceId, source)
    )
    if (resultat.ok) {
      onFermer()
      if (resultat.id) onAjoute(resultat.id)
    }
  }

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">
          {remplace ? `Remplacer ${remplace.exercise.nom}` : "Ajouter un exercice"}
        </SheetTitle>
        <SheetDescription className="text-base">
          {remplace
            ? "Le nouvel exercice prend sa place et reprend ses séries et son repos. Choisis dans ta liste, ou tape un nom pour en créer un."
            : "Choisis dans ta liste, ou tape un nom pour en créer un."}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="space-y-2">
          <Label htmlFor="recherche-exercice">Nom de l&apos;exercice</Label>
          <Input
            id="recherche-exercice"
            type="search"
            value={recherche}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setRecherche(e.target.value)}
            className="h-12"
          />
        </div>

        {peutCreer && (
          <div className="space-y-3 rounded-2xl bg-brand-soft p-4">
            <p className="font-semibold">Créer « {recherche.trim()} »</p>
            <div className="space-y-2">
              <p className="text-sm font-medium">Groupe musculaire</p>
              <Filtres
                libelle="Groupe musculaire"
                valeur={groupe}
                onChange={setGroupe}
                options={GROUPES.map((g) => ({ valeur: g as string, libelle: LIBELLE_GROUPE[g]! }))}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Équipement</p>
              <Filtres
                libelle="Équipement"
                valeur={equipement}
                onChange={setEquipement}
                options={EQUIPEMENTS.map((e) => ({ valeur: e as string, libelle: LIBELLE_EQUIPEMENT[e]! }))}
              />
            </div>
            <Button
              className="h-12 w-full gap-2 text-base font-semibold"
              disabled={enCours}
              onClick={() => ajouter({ nom: recherche.trim(), groupe, equipement })}
            >
              <Plus className="size-5" aria-hidden="true" />
              {remplace ? "Créer et remplacer" : "Créer et ajouter"}
            </Button>
          </div>
        )}

        {trouves.length > 0 ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {trouves.map((exercice) => (
              <li key={exercice.id}>
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => ajouter({ exerciseId: exercice.id })}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-none first:rounded-t-2xl last:rounded-b-2xl focus-visible:bg-muted active:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug font-medium">{exercice.nom}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[
                        LIBELLE_GROUPE[exercice.groupe] ?? exercice.groupe,
                        exercice.equipement && (LIBELLE_EQUIPEMENT[exercice.equipement] ?? exercice.equipement),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Plus className="size-5 shrink-0 text-brand" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !peutCreer && (
            <p className="py-6 text-center text-muted-foreground">
              {exercices.isPending
                ? "Chargement…"
                : exercices.data?.length === 0
                  ? "Ta liste est vide. Tape le nom de ton premier exercice pour le créer."
                  : "Aucun exercice à ce nom."}
            </p>
          )
        )}
      </div>
    </>
  )
}
