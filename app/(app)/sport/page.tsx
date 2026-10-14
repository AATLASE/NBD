"use client"

import { Check, ChevronRight, Play } from "lucide-react"
import Link from "next/link"

import { Carte, EnTete, Etiquette, Lettre, Section } from "@/components/blocs"
import { MotDuCoach } from "@/components/coach/mot"
import { Attente } from "@/components/etats"
import { Reperes } from "@/components/reperes"
import { AjustementsProposes } from "@/components/sport/ajustements"
import { BoutonDemarrer } from "@/components/sport/bouton-demarrer"
import { ExceptionPlanning } from "@/components/sport/exception-planning"
import { ProtocolePied, itemsDuJour } from "@/components/sport/protocole-pied"
import { SaisieDouleur } from "@/components/sport/saisie-douleur"
import { resumeSeance } from "@/components/sport/seance"
import { buttonVariants } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { dateLongue, jourDe, prescription } from "@/lib/format"
import { majuscule } from "@/lib/libelles"
import { ecrireProtocoleDuJour, useProtocoleDuJour } from "@/lib/protocole-du-jour"
import { seanceDeLaSemaineType, seancePrevue } from "@/lib/planning"
import { useDebutProgramme, useJournalSeances, usePied, usePlanning, useSeances, type Seance } from "@/lib/queries"
import { estJourSurDeux, semaineProgramme } from "@/lib/regles"
import { nombreDeSeries, useBrouillon } from "@/lib/seance-en-cours"

const APERCU_EXERCICES = 4

export default function SportAujourdhui() {
  const aujourdhui = useAujourdhui()
  const seances = useSeances()
  const journal = useJournalSeances()
  const pied = usePied()
  const debut = useDebutProgramme()
  const planning = usePlanning()
  const brouillon = useBrouillon()
  const cochesLocales = useProtocoleDuJour(aujourdhui)
  const { executer, enCours } = useEdition()

  if (!aujourdhui || !seances.data || !journal.data || !pied.data || !planning.data || debut.data === undefined) {
    return <Attente requetes={[seances, journal, pied, planning, debut]} />
  }

  const { semaine } = semaineProgramme(debut.data, aujourdhui)
  const jour = jourDe(aujourdhui)
  // La semaine type, sauf si le planning (décidé avec le coach ou à la main) dit autre chose.
  const { seance: seanceDuJour, exception } = seancePrevue(aujourdhui, seances.data, planning.data)
  const faiteAujourdhui = journal.data.find((log) => log.date === aujourdhui)
  const seanceFaite = faiteAujourdhui
    ? seances.data.find((s) => s.id === faiteAujourdhui.workout_id)
    : undefined
  const douleurDuJour = pied.data.mesures.find((m) => m.date === aujourdhui)
  const seanceEnCours = brouillon ? seances.data.find((s) => s.id === brouillon.workoutId) : undefined

  // Protocole du jour. Si la base dit « fait » (coché depuis un autre appareil), tout est coché.
  const protocole = itemsDuJour(pied.data.items, estJourSurDeux(debut.data, aujourdhui))
  const idsDuJour = protocole.map((item) => item.id)
  const coches = douleurDuJour?.protocole_fait ? idsDuJour : cochesLocales.filter((id) => idsDuJour.includes(id))
  const toutCoche = idsDuJour.length > 0 && coches.length === idsDuJour.length
  const veille = pied.data.mesures.find((m) => m.date < aujourdhui)

  function basculer(itemId: string) {
    const suivants = coches.includes(itemId) ? coches.filter((id) => id !== itemId) : [...coches, itemId]
    ecrireProtocoleDuJour(aujourdhui!, suivants)
    // La base ne garde qu'un oui ou non par jour, et seulement une fois la douleur renseignée.
    const tout = suivants.length === idsDuJour.length
    if (douleurDuJour && Boolean(douleurDuJour.protocole_fait) !== tout) {
      void executer(differable("marquerProtocole", aujourdhui!, tout))
    }
  }

  return (
    <>
      <EnTete
        titre={majuscule(dateLongue(aujourdhui))}
        sousTitre={`Semaine ${semaine} du programme`}
      />

      <MotDuCoach
        inviter
        date={aujourdhui}
        moment={faiteAujourdhui ? "faite" : seanceDuJour ? "seance" : "repos"}
      />

      <Reperes aujourdhui={aujourdhui} />

      {brouillon && seanceEnCours && (
        <Link
          href={`/seance/${seanceEnCours.id}`}
          className="flex min-h-20 items-center gap-4 rounded-2xl bg-primary p-4 text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-90"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
            <Play className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg leading-snug font-bold">
              Séance {seanceEnCours.code} en cours
            </span>
            <span className="block text-sm font-medium tabular-nums">
              {nombreDeSeries(brouillon)} série{nombreDeSeries(brouillon) > 1 ? "s" : ""} validée
              {nombreDeSeries(brouillon) > 1 ? "s" : ""} · appuie pour reprendre
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0" aria-hidden="true" />
        </Link>
      )}

      <AjustementsProposes />

      <Section titre="Séance du jour">
        {exception && !faiteAujourdhui && (
          <ExceptionPlanning exception={exception} seanceType={seanceDeLaSemaineType(aujourdhui, seances.data)?.code} />
        )}
        {faiteAujourdhui ? (
          <Carte className="flex items-center gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-5" aria-hidden="true" />
            </span>
            <p className="min-w-0">
              <span className="font-semibold">{seanceFaite ? `Séance ${seanceFaite.code} faite` : "Séance faite"}</span>
              <span className="block text-sm text-muted-foreground">
                {seanceFaite?.nom ?? "Hors programme"}
                {faiteAujourdhui.duree_min !== null && ` · ${faiteAujourdhui.duree_min} min`}
              </span>
            </p>
          </Carte>
        ) : seanceDuJour ? (
          <SeanceDuJour seance={seanceDuJour} />
        ) : seances.data.length === 0 ? (
          <Carte className="space-y-4 p-4">
            <div>
              <p className="font-semibold">Aucune séance pour l&apos;instant</p>
              <p className="text-sm text-muted-foreground">
                Ton programme est vide : commence par créer ta première séance.
              </p>
            </div>
            <Link
              href="/sport/seances"
              className={buttonVariants({ className: "h-12 w-full text-base font-semibold" })}
            >
              Créer une séance
            </Link>
            <Link
              href="/bienvenue/programme"
              className={buttonVariants({ variant: "outline", className: "h-12 w-full text-base" })}
            >
              Me proposer un programme
            </Link>
          </Carte>
        ) : (
          <Carte className="space-y-4 p-4">
            <div>
              <p className="font-semibold">
                {exception ? "Pas de séance aujourd'hui" : `Pas de séance prévue le ${jour}`}
              </p>
              <p className="text-sm text-muted-foreground">
                Jour de repos. Tu peux quand même en choisir une.
              </p>
            </div>
            <ul className="flex flex-wrap gap-3">
              {seances.data.map((seance) => (
                <li key={seance.id}>
                  <Link
                    href={`/sport/seances/${seance.id}`}
                    aria-label={`Séance ${seance.code} : ${seance.nom}`}
                    className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-80"
                  >
                    <Lettre code={seance.code} className="size-14" />
                  </Link>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </Section>

      {/* Le protocole pied ne concerne que les comptes qui en ont un. */}
      {pied.data.items.length > 0 && (
      <Section
        titre="Protocole pied"
        aside={
          <Link
            href="/sport/pied"
            className="inline-flex h-11 items-center gap-0.5 font-medium text-brand outline-none focus-visible:underline"
          >
            Tout voir
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        }
      >
        {douleurDuJour ? (
          <Carte className="flex items-center justify-between gap-3 p-4">
            <span className="font-medium">Douleur ce matin</span>
            <span className="text-xl font-bold tabular-nums">
              {douleurDuJour.douleur_matin}
              <span className="text-base font-medium text-muted-foreground"> / 10</span>
            </span>
          </Carte>
        ) : (
          <Carte className="p-4">
            <SaisieDouleur
              libelle="Douleur ce matin"
              initiale={veille?.douleur_matin ?? 0}
              enCours={enCours}
              onEnregistrer={(douleur) =>
                void executer(differable("enregistrerDouleur", aujourdhui, douleur, toutCoche), {
                  cle: ["pied"],
                  maj: (donnees: NonNullable<typeof pied.data>) => ({
                    ...donnees,
                    mesures: [
                      { id: "provisoire", user_id: "", date: aujourdhui, douleur_matin: douleur, protocole_fait: toutCoche, note: null },
                      ...donnees.mesures.filter((m) => m.date !== aujourdhui),
                    ],
                  }),
                })
              }
            />
          </Carte>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground tabular-nums">
            {coches.length} sur {idsDuJour.length} fait{coches.length > 1 ? "s" : ""} aujourd&apos;hui
          </p>
          {toutCoche && <Etiquette ton="success">Protocole fait</Etiquette>}
        </div>
        <ProtocolePied
          items={protocole}
          paliers={pied.data.paliers}
          semaine={semaine}
          coches={coches}
          onBasculer={basculer}
        />
      </Section>
      )}

    </>
  )
}

function SeanceDuJour({ seance }: { seance: Seance }) {
  const apercu = seance.workout_exercises.slice(0, APERCU_EXERCICES)
  const reste = seance.workout_exercises.length - apercu.length

  return (
    <Carte className="space-y-4 p-4">
      <div className="flex items-center gap-4">
        <Lettre code={seance.code} className="size-14 text-2xl" />
        <div className="min-w-0">
          <p className="text-lg leading-snug font-semibold">
            <span className="sr-only">Séance {seance.code} : </span>
            {seance.nom}
          </p>
          <p className="text-sm text-muted-foreground">{resumeSeance(seance)}</p>
        </div>
      </div>

      <ul className="space-y-2 border-t pt-4">
        {apercu.map((ligne) => (
          <li key={ligne.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{ligne.exercise.nom}</span>
            <span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
              {prescription(ligne)}
            </span>
          </li>
        ))}
        {reste > 0 && (
          <li className="text-sm text-muted-foreground">
            et {reste} autre{reste > 1 ? "s" : ""}
          </li>
        )}
      </ul>

      <div className="space-y-2">
        <BoutonDemarrer seanceId={seance.id} />
        <Link
          href={`/sport/seances/${seance.id}`}
          className={buttonVariants({ variant: "ghost", className: "h-11 w-full text-base" })}
        >
          Voir le détail
        </Link>
      </div>
    </Carte>
  )
}
