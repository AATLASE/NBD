"use client"

import { cn } from "cn"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { Lettre } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { BarreRepos } from "@/components/execution/barre-repos"
import { EcranCircuit } from "@/components/execution/ecran-circuit"
import { EcranExercice } from "@/components/execution/ecran-exercice"
import { Historique } from "@/components/execution/historique"
import { Resume } from "@/components/execution/resume"
import { resumeSeance } from "@/components/sport/seance"
import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAujourdhui } from "@/lib/aujourdhui"
import { chrono, etapeTerminee, etapesDe } from "@/lib/execution"
import { useHistoriqueSeries, useSeances, type Seance, type SeanceFaite } from "@/lib/queries"
import {
  demarrerSeance,
  ecrireBrouillon,
  nombreDeSeries,
  useBrouillon,
  type Brouillon,
} from "@/lib/seance-en-cours"
import { useEcranAllume, useMaintenant } from "@/lib/signal"

export default function PageExecution() {
  const { id } = useParams<{ id: string }>()
  const aujourdhui = useAujourdhui()
  const seances = useSeances()
  const historique = useHistoriqueSeries()
  const brouillon = useBrouillon()

  if (!aujourdhui || !seances.data || !historique.data || brouillon === undefined) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <Attente requetes={[seances, historique]} />
      </main>
    )
  }

  const seance = seances.data.find((s) => s.id === id)
  if (!seance) {
    return (
      <Message titre="Séance introuvable" texte="Elle a peut-être été supprimée ou archivée.">
        <Link href="/sport/seances" className={buttonVariants({ className: "h-14 w-full text-base font-semibold" })}>
          Retour aux séances
        </Link>
      </Message>
    )
  }

  // Une séance déjà en cours pour une autre séance : on ne l'écrase pas sans le demander.
  if (brouillon && brouillon.workoutId !== seance.id) {
    const autre = seances.data.find((s) => s.id === brouillon.workoutId)
    return (
      <Message
        titre={`Séance ${autre?.code ?? ""} déjà en cours`}
        texte={`${nombreDeSeries(brouillon)} série(s) validée(s) ne sont pas encore enregistrées.`}
      >
        <Link
          href={`/seance/${brouillon.workoutId}`}
          className={buttonVariants({ className: "h-14 w-full text-base font-semibold" })}
        >
          Reprendre la séance {autre?.code}
        </Link>
        <Button
          variant="destructive"
          className="h-12 w-full text-base"
          onClick={() => demarrerSeance(seance.id, aujourdhui)}
        >
          L&apos;abandonner et démarrer la séance {seance.code}
        </Button>
      </Message>
    )
  }

  if (!brouillon) {
    return (
      <Message titre={seance.nom} texte={resumeSeance(seance)} lettre={seance.code}>
        <Button
          className="h-16 w-full text-lg font-semibold"
          onClick={() => demarrerSeance(seance.id, aujourdhui)}
        >
          Démarrer la séance
        </Button>
        <Link
          href={`/sport/seances/${seance.id}`}
          className={buttonVariants({ variant: "ghost", className: "h-11 w-full text-base" })}
        >
          Revoir le détail
        </Link>
      </Message>
    )
  }

  return <Execution seance={seance} brouillon={brouillon} historique={historique.data} />
}

function Message({
  titre,
  texte,
  lettre,
  children,
}: {
  titre: string
  texte: string
  lettre?: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-6 py-10">
      <div className="space-y-3">
        {lettre && <Lettre code={lettre} className="size-16 text-3xl" />}
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{titre}</h1>
        <p className="text-muted-foreground">{texte}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </main>
  )
}

// Isolé pour que la seconde qui passe ne redessine pas tout l'écran.
function TempsEcoule({ debut }: { debut: number }) {
  const maintenant = useMaintenant(true, 1000)
  return (
    <span role="timer" aria-label="Durée de la séance" className="text-sm font-medium text-muted-foreground tabular-nums">
      {chrono(Math.max(0, maintenant - debut))}
    </span>
  )
}

function Execution({
  seance,
  brouillon,
  historique,
}: {
  seance: Seance
  brouillon: Brouillon
  historique: SeanceFaite[]
}) {
  useEcranAllume()
  const router = useRouter()
  const etapes = useMemo(() => etapesDe(seance), [seance])
  const pages = etapes.length + 1 // les étapes, puis le résumé
  const defilement = useRef<HTMLDivElement>(null)
  const [exerciceHistorique, setExerciceHistorique] = useState<{ id: string; nom: string } | null>(null)
  const [sortie, setSortie] = useState(false)

  // À l'ouverture (ou après un rechargement), on se place sur la première étape non terminée.
  const [page, setPage] = useState(() => {
    const premiere = etapes.findIndex((etape) => !etapeTerminee(etape, brouillon))
    return premiere === -1 ? etapes.length : premiere
  })
  const pageInitiale = useRef(page)
  useEffect(() => {
    const zone = defilement.current
    if (zone) zone.scrollTo({ left: pageInitiale.current * zone.clientWidth, behavior: "instant" })
  }, [])

  function allerA(cible: number) {
    const zone = defilement.current
    if (!zone) return
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    zone.scrollTo({
      left: Math.min(pages - 1, Math.max(0, cible)) * zone.clientWidth,
      behavior: reduit ? "instant" : "smooth",
    })
  }

  function quitter(abandonner: boolean) {
    router.push("/sport")
    if (abandonner) ecrireBrouillon(null)
  }

  const surResume = page === etapes.length
  const seriesFaites = nombreDeSeries(brouillon)

  return (
    <div className="flex h-[calc(100dvh-var(--bandeau-reseau,0px))] flex-col bg-background">
      <header className="border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11"
            aria-label="Quitter la séance"
            onClick={() => (seriesFaites === 0 ? quitter(true) : setSortie(true))}
          >
            <X className="size-6" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate leading-tight font-semibold">
              {seance.code.length <= 2 ? `Séance ${seance.code}` : seance.nom}
            </h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {surResume ? "Résumé" : `Exercice ${page + 1} sur ${etapes.length}`}
            </p>
          </div>
          <TempsEcoule debut={brouillon.debut} />
          <div className="flex">
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label="Exercice précédent"
              disabled={page === 0}
              onClick={() => allerA(page - 1)}
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={page === etapes.length - 1 ? "Aller au résumé" : "Exercice suivant"}
              disabled={surResume}
              onClick={() => allerA(page + 1)}
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <ol aria-label="Avancement de la séance" className="mx-auto flex max-w-lg gap-1 px-4 pb-2">
          {etapes.map((etape, index) => (
            <li
              key={etape.cle}
              aria-current={index === page ? "step" : undefined}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                etapeTerminee(etape, brouillon)
                  ? "bg-primary"
                  : index === page
                    ? "bg-foreground/50"
                    : "bg-muted"
              )}
            >
              <span className="sr-only">
                {etape.type === "circuit" ? "Circuit" : etape.ligne.exercise.nom}
                {etapeTerminee(etape, brouillon) ? ", terminé" : ""}
              </span>
            </li>
          ))}
        </ol>
      </header>

      {/* Un écran par étape, balayage horizontal. Les flèches du haut font la même chose. */}
      <div
        ref={defilement}
        onScroll={(evenement) => {
          const zone = evenement.currentTarget
          const visible = Math.round(zone.scrollLeft / zone.clientWidth)
          if (visible !== page) setPage(visible)
        }}
        className="scrollbar-none flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {etapes.map((etape, index) => (
          <section
            key={etape.cle}
            aria-label={etape.type === "circuit" ? "Circuit" : etape.ligne.exercise.nom}
            // Les écrans hors champ ne doivent pas capter le focus ni être lus.
            inert={index !== page}
            className="h-full w-full shrink-0 snap-center snap-always overflow-y-auto"
          >
            {etape.type === "circuit" ? (
              <EcranCircuit
                cle={etape.cle}
                lignes={etape.lignes}
                reposToursSec={seance.circuit_repos_tours_sec}
                etat={brouillon.circuits[etape.cle]}
                derniereEtape={index === etapes.length - 1}
                onSuivant={() => allerA(index + 1)}
              />
            ) : (
              <EcranExercice
                ligne={etape.ligne}
                historique={historique}
                faites={brouillon.series[etape.ligne.id] ?? []}
                derniereEtape={index === etapes.length - 1}
                onSuivant={() => allerA(index + 1)}
                onHistorique={() =>
                  setExerciceHistorique({ id: etape.ligne.exercise.id, nom: etape.ligne.exercise.nom })
                }
              />
            )}
          </section>
        ))}
        <section
          aria-label="Résumé"
          inert={!surResume}
          className="h-full w-full shrink-0 snap-center snap-always overflow-y-auto"
        >
          <Resume seance={seance} etapes={etapes} brouillon={brouillon} />
        </section>
      </div>

      {brouillon.repos ? (
        <BarreRepos repos={brouillon.repos} />
      ) : (
        <div className="pb-[env(safe-area-inset-bottom)]" />
      )}

      <Historique
        exercice={exerciceHistorique}
        historique={historique}
        onFermer={() => setExerciceHistorique(null)}
      />

      <Sheet open={sortie} onOpenChange={setSortie}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-w-lg gap-0 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          <SheetHeader>
            <SheetTitle className="text-xl font-bold">Quitter la séance ?</SheetTitle>
            <SheetDescription className="text-base">
              {seriesFaites} série{seriesFaites > 1 ? "s" : ""} validée{seriesFaites > 1 ? "s" : ""}, pas
              encore enregistrée{seriesFaites > 1 ? "s" : ""}.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4">
            <Button className="h-14 w-full text-base font-semibold" onClick={() => setSortie(false)}>
              Continuer la séance
            </Button>
            <Button variant="outline" className="h-12 w-full text-base" onClick={() => quitter(false)}>
              Mettre en pause et sortir
            </Button>
            <Button variant="destructive" className="h-12 w-full text-base" onClick={() => quitter(true)}>
              Abandonner la séance
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
