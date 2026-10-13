"use client"

import { Check, Pencil, Repeat, Timer } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { useState } from "react"

import { Carte, Etiquette, Lettre, Retour, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { LienHistorique } from "@/components/lien-historique"
import { AjoutExercice } from "@/components/sport/ajout-exercice"
import { BoutonDemarrer } from "@/components/sport/bouton-demarrer"
import { EditeurLigne } from "@/components/sport/editeur-ligne"
import { EditeurSeance } from "@/components/sport/editeur-seance"
import { ModeEdition } from "@/components/sport/mode-edition"
import { resumeSeance } from "@/components/sport/seance"
import { Button } from "@/components/ui/button"
import { charge, duree, nombre, prescription } from "@/lib/format"
import { majuscule } from "@/lib/libelles"
import { useSeances, type ExerciceDeSeance, type Seance } from "@/lib/queries"

// Regroupe les lignes consécutives du même bloc : un circuit s'affiche d'un seul tenant.
// `premier` est le numéro d'ordre du premier exercice du bloc dans la séance.
function enBlocs(lignes: ExerciceDeSeance[]) {
  const blocs: { bloc: string; premier: number; lignes: ExerciceDeSeance[] }[] = []
  lignes.forEach((ligne, index) => {
    const dernier = blocs.at(-1)
    if (dernier && dernier.bloc === ligne.bloc) dernier.lignes.push(ligne)
    else blocs.push({ bloc: ligne.bloc, premier: index + 1, lignes: [ligne] })
  })
  return blocs
}

export default function DetailSeance() {
  const { id } = useParams<{ id: string }>()
  const seances = useSeances()
  // Une séance tout juste créée ou dupliquée s'ouvre directement en édition.
  const [edition, setEdition] = useState(useSearchParams().get("edition") === "1")
  const [ligneEditee, setLigneEditee] = useState<string | null>(null)
  const [reglages, setReglages] = useState(false)
  const [ajout, setAjout] = useState(false)
  const [aRemplacer, setARemplacer] = useState<ExerciceDeSeance | null>(null)

  if (!seances.data) return <Attente requetes={[seances]} />

  const seance = seances.data.find((s) => s.id === id)
  if (!seance) {
    return (
      <>
        <Retour href="/sport/seances">Séances</Retour>
        <Vide titre="Séance introuvable">Elle a peut-être été supprimée ou archivée.</Vide>
      </>
    )
  }

  const lignes = seance.workout_exercises

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Retour href="/sport/seances">Séances</Retour>
          <LienHistorique />
        </div>
        <header className="flex items-center gap-4">
          <Lettre code={seance.code} className="size-16 text-3xl" />
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold tracking-tight">
              <span className="sr-only">Séance {seance.code} : </span>
              {seance.nom}
            </h1>
            <p className="text-muted-foreground">
              {seance.jour_suggere && `${majuscule(seance.jour_suggere)} · `}
              {resumeSeance(seance)}
            </p>
          </div>
        </header>
      </div>

      {edition ? (
        <>
          <Button className="h-14 w-full gap-2 text-lg font-semibold" onClick={() => setEdition(false)}>
            <Check className="size-5" aria-hidden="true" />
            Terminer les modifications
          </Button>
          <ModeEdition
            seance={seance}
            onReglages={() => setReglages(true)}
            onAjouter={() => setAjout(true)}
            onEditerLigne={setLigneEditee}
          />
        </>
      ) : (
        <>
          <div className="space-y-2">
            {lignes.length > 0 && <BoutonDemarrer seanceId={seance.id} />}
            <Button
              variant="outline"
              className="h-12 w-full gap-2 text-base font-semibold"
              onClick={() => setEdition(true)}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Modifier la séance
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Ajouter, retirer, remplacer ou réordonner des exercices, changer le jour.
            </p>
          </div>

          {seance.note && (
            <p className="rounded-2xl bg-brand-soft px-4 py-3 leading-snug text-foreground">{seance.note}</p>
          )}

          {lignes.length === 0 && (
            <Vide titre="Séance vide">Passe en modification pour ajouter des exercices.</Vide>
          )}

          {lignes.length > 0 && (
            <p className="mb-3 text-sm text-muted-foreground">
              Appuie sur un exercice pour changer ses charges, ses séries ou son repos.
            </p>
          )}

          {enBlocs(lignes).map(({ bloc, premier, lignes: duBloc }) =>
            bloc === "circuit" ? (
              <BlocCircuit
                key={premier}
                seance={seance}
                lignes={duBloc}
                premier={premier}
                onEditer={setLigneEditee}
              />
            ) : (
              <Carte key={premier}>
                <ol className="divide-y">
                  {duBloc.map((ligne, index) => (
                    <LigneExercice
                      key={ligne.id}
                      ligne={ligne}
                      numero={premier + index}
                      onEditer={() => setLigneEditee(ligne.id)}
                    />
                  ))}
                </ol>
              </Carte>
            )
          )}
        </>
      )}

      <EditeurLigne
        ligne={lignes.find((l) => l.id === ligneEditee) ?? null}
        onFermer={() => setLigneEditee(null)}
        onRemplacer={setARemplacer}
      />
      <EditeurSeance seance={seance} ouvert={reglages} onFermer={() => setReglages(false)} />
      <AjoutExercice
        seanceId={seance.id}
        remplace={aRemplacer ?? undefined}
        ouvert={ajout || aRemplacer !== null}
        onFermer={() => {
          setAjout(false)
          setARemplacer(null)
        }}
        onAjoute={setLigneEditee}
      />
    </>
  )
}

function Numero({ numero }: { numero: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums"
    >
      {numero}
    </span>
  )
}

const LIGNE_CLIQUABLE =
  "flex w-full gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"

function LigneExercice({
  ligne,
  numero,
  onEditer,
}: {
  ligne: ExerciceDeSeance
  numero: number
  onEditer: () => void
}) {
  const charges = charge(ligne)

  return (
    <li className="first:*:rounded-t-2xl last:*:rounded-b-2xl">
      <button
        type="button"
        onClick={onEditer}
        aria-label={`${ligne.exercise.nom}, ${prescription(ligne)}${charges ? `, ${charges}` : ""}. Modifier`}
        className={`${LIGNE_CLIQUABLE} p-4`}
      >
        <Numero numero={numero} />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="leading-snug font-semibold">{ligne.exercise.nom}</span>
            <span className="shrink-0 text-lg font-bold tabular-nums">{prescription(ligne)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
            <span className="flex items-center gap-1.5">
              <Timer className="size-4" aria-hidden="true" />
              {duree(ligne.repos_sec)} de repos
            </span>
            {charges && <span className="font-medium text-foreground">{charges}</span>}
            {ligne.increment_kg !== null && <span>par paliers de {nombre(ligne.increment_kg)} kg</span>}
          </span>
          {ligne.note && (
            <span className="block text-sm leading-snug text-muted-foreground">{ligne.note}</span>
          )}
        </span>
        <Pencil className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  )
}

// Un circuit partage ses réglages : tours, effort et repos sont affichés une fois, en tête.
function BlocCircuit({
  seance,
  lignes,
  premier,
  onEditer,
}: {
  seance: Seance
  lignes: ExerciceDeSeance[]
  premier: number
  onEditer: (ligneId: string) => void
}) {
  const reference = lignes[0]!

  return (
    <Carte className="overflow-hidden border-primary/50">
      <div className="space-y-2 bg-brand-soft p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Repeat className="size-5 text-brand" aria-hidden="true" />
          Circuit
        </h2>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Etiquette className="bg-card">
              {reference.series} tour{reference.series > 1 ? "s" : ""}
            </Etiquette>
          </li>
          {reference.duree_sec !== null && (
            <li>
              <Etiquette className="bg-card">
                {duree(reference.duree_sec)} d&apos;effort, {duree(reference.repos_sec)} de repos
              </Etiquette>
            </li>
          )}
          {seance.circuit_repos_tours_sec !== null && (
            <li>
              <Etiquette className="bg-card">
                {duree(seance.circuit_repos_tours_sec)} entre les tours
              </Etiquette>
            </li>
          )}
        </ul>
      </div>
      <ol className="divide-y border-t">
        {lignes.map((ligne, index) => (
          <li key={ligne.id}>
            <button
              type="button"
              onClick={() => onEditer(ligne.id)}
              aria-label={`${ligne.exercise.nom}. Modifier`}
              className={`${LIGNE_CLIQUABLE} min-h-14 items-center px-4 py-3`}
            >
              <Numero numero={premier + index} />
              <span className="min-w-0 flex-1 leading-snug font-medium">{ligne.exercise.nom}</span>
              {ligne.charge_depart_kg !== null && (
                <span className="shrink-0 font-semibold tabular-nums">
                  {nombre(ligne.charge_depart_kg)} kg
                </span>
              )}
              <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </Carte>
  )
}
