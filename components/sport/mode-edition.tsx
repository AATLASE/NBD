"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import { ChevronRight, Copy, GripVertical, Plus, Settings2, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Etiquette } from "@/components/blocs"
import { Button } from "@/components/ui/button"
import { useEdition } from "@/lib/edition"
import { charge, prescription } from "@/lib/format"
import { majuscule } from "@/lib/libelles"
import { dupliquerSeance, reordonnerSeance, retirerExercice, supprimerSeance } from "@/lib/mutations"
import type { ExerciceDeSeance, Seance } from "@/lib/queries"

// Mode édition d'une séance : réordonner par glisser-déposer, retirer, ajouter, régler,
// dupliquer, supprimer. Chaque action est appliquée tout de suite et reste annulable.
export function ModeEdition({
  seance,
  onReglages,
  onAjouter,
  onEditerLigne,
}: {
  seance: Seance
  onReglages: () => void
  onAjouter: () => void
  onEditerLigne: (ligneId: string) => void
}) {
  const router = useRouter()
  const { executer, enCours } = useEdition()
  const lignes = seance.workout_exercises

  const capteurs = useSensors(
    // Quelques pixels de marge avant de saisir : un appui ou un défilement ne déplace rien.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Au clavier : Espace pour saisir, flèches pour déplacer, Espace pour poser.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const dansLeCache = (maj: (lignes: ExerciceDeSeance[]) => ExerciceDeSeance[]) => ({
    cle: ["seances"],
    maj: (seances: Seance[]) =>
      seances.map((s) => (s.id === seance.id ? { ...s, workout_exercises: maj(s.workout_exercises) } : s)),
  })

  function surDepot({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const depuis = lignes.findIndex((l) => l.id === active.id)
    const vers = lignes.findIndex((l) => l.id === over.id)
    if (depuis === -1 || vers === -1) return

    const ordre = arrayMove(lignes, depuis, vers)
    // Comme le serveur : on redistribue les rangs existants dans le nouvel ordre.
    const rangs = lignes.map((l) => l.ordre)
    void executer(
      () =>
        reordonnerSeance(
          seance.id,
          ordre.map((l) => l.id)
        ),
      dansLeCache(() => ordre.map((l, index) => ({ ...l, ordre: rangs[index]! })))
    )
  }

  function retirer(ligne: ExerciceDeSeance) {
    void executer(
      () => retirerExercice(ligne.id),
      dansLeCache((actuelles) => actuelles.filter((l) => l.id !== ligne.id))
    )
  }

  async function dupliquer() {
    const resultat = await executer(() => dupliquerSeance(seance.id))
    if (resultat.ok && resultat.id) router.push(`/sport/seances/${resultat.id}?edition=1`)
  }

  async function supprimer() {
    const resultat = await executer(() => supprimerSeance(seance.id), {
      cle: ["seances"],
      maj: (seances: Seance[]) => seances.filter((s) => s.id !== seance.id),
    })
    if (resultat.ok) router.push("/sport/seances")
  }

  return (
    <>
      <button
        type="button"
        onClick={onReglages}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Settings2 className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-semibold">Réglages de la séance</span>
          <span className="block text-sm text-muted-foreground">
            Nom, lieu, durée · {seance.jour_suggere ? majuscule(seance.jour_suggere) : "sans jour fixe"}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Exercices</h2>
        {lignes.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-muted-foreground">
            Aucun exercice pour l&apos;instant.
          </p>
        ) : (
          <DndContext id="tri-seance" sensors={capteurs} collisionDetection={closestCenter} onDragEnd={surDepot}>
            <SortableContext items={lignes.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {lignes.map((ligne) => (
                  <LigneTriable
                    key={ligne.id}
                    ligne={ligne}
                    onEditer={() => onEditerLigne(ligne.id)}
                    onRetirer={() => retirer(ligne)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        <Button variant="outline" className="h-14 w-full gap-2 text-base font-semibold" onClick={onAjouter}>
          <Plus className="size-5" aria-hidden="true" />
          Ajouter un exercice
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Séance</h2>
        <Button
          variant="outline"
          className="h-12 w-full gap-2 text-base"
          disabled={enCours}
          onClick={dupliquer}
        >
          <Copy className="size-5" aria-hidden="true" />
          Dupliquer la séance
        </Button>
        <Button
          variant="destructive"
          className="h-12 w-full gap-2 text-base"
          disabled={enCours}
          onClick={supprimer}
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Supprimer la séance
        </Button>
      </section>
    </>
  )
}

function LigneTriable({
  ligne,
  onEditer,
  onRetirer,
}: {
  ligne: ExerciceDeSeance
  onEditer: () => void
  onRetirer: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ligne.id,
  })
  const charges = charge(ligne)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-stretch rounded-2xl border bg-card",
        isDragging && "relative z-10 border-primary shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Déplacer ${ligne.exercise.nom}`}
        // touch-none : sur la poignée, le doigt déplace l'exercice au lieu de faire défiler la page.
        className="flex w-12 shrink-0 touch-none items-center justify-center rounded-l-2xl text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onEditer}
        aria-label={`Régler ${ligne.exercise.nom}`}
        className="min-h-16 min-w-0 flex-1 py-2.5 pr-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate leading-snug font-semibold">{ligne.exercise.nom}</span>
          {ligne.bloc === "circuit" && <Etiquette ton="brand">Circuit</Etiquette>}
        </span>
        <span className="block text-sm text-muted-foreground tabular-nums">
          {[prescription(ligne), charges].filter(Boolean).join(" · ")}
        </span>
      </button>
      <button
        type="button"
        onClick={onRetirer}
        aria-label={`Retirer ${ligne.exercise.nom} de la séance`}
        className="flex w-12 shrink-0 items-center justify-center rounded-r-2xl text-danger outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-danger-soft"
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </button>
    </li>
  )
}
