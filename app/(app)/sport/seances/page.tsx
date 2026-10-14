"use client"

import { BedDouble, Check, ClipboardCheck, Dumbbell, Moon, Pencil, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Carte, EnTete, Section, Vide } from "@/components/blocs"
import { Calendrier, premierDuMois, type Marque } from "@/components/calendrier"
import { Attente } from "@/components/etats"
import { LienHistorique } from "@/components/lien-historique"
import { AjustementsProposes } from "@/components/sport/ajustements"
import { BoutonDemarrer } from "@/components/sport/bouton-demarrer"
import { ExceptionPlanning } from "@/components/sport/exception-planning"
import { SaisieApresCoup } from "@/components/sport/saisie-apres-coup"
import { CarteSeance } from "@/components/sport/seance"
import { Button, buttonVariants } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import type { Tables } from "@/lib/database.types"
import { useEdition } from "@/lib/edition"
import { texteSerie } from "@/lib/execution"
import { dateLongue, jourDe } from "@/lib/format"
import { majuscule } from "@/lib/libelles"
import { creerSeance, planifierJour } from "@/lib/mutations"
import { seanceDeLaSemaineType, seancePrevue, type Exception } from "@/lib/planning"
import { useJournalSeances, usePlanning, useSeances, useSeriesSeance, type Seance } from "@/lib/queries"

// Code court d'une séance pour la marque du calendrier, comme sa pastille.
const codeCourt = (code: string) => (code.length <= 2 ? code : code.charAt(0))

export default function Seances() {
  const aujourdhui = useAujourdhui()
  const seances = useSeances()
  const journal = useJournalSeances()
  const planning = usePlanning()
  const router = useRouter()
  const { executer, enCours } = useEdition()
  const [dateChoisie, setDateChoisie] = useState<string | null>(null)
  const [mois, setMois] = useState<string | null>(null)
  const [saisie, setSaisie] = useState(false)

  async function nouvelle() {
    const resultat = await executer(creerSeance)
    if (resultat.ok && resultat.id) router.push(`/sport/seances/${resultat.id}?edition=1`)
  }

  if (!aujourdhui || !seances.data || !journal.data || !planning.data) {
    return <Attente requetes={[seances, journal, planning]} />
  }

  // Les séances rattachées à un jour forment la semaine type ; les autres sont des solutions de repli.
  const planifiees = seances.data.filter((s) => s.jour_suggere !== null)
  const libres = seances.data.filter((s) => s.jour_suggere === null)
  const parId = new Map(seances.data.map((s) => [s.id, s]))
  // La semaine type, sauf exception du planning : le même calcul que l'onglet Aujourd'hui et le coach.
  const prevuesLe = (date: string) => {
    const { seance } = seancePrevue(date, seances.data, planning.data)
    return seance ? [seance] : []
  }
  const faitesLe = (date: string) => journal.data.filter((log) => log.date === date)

  const date = dateChoisie ?? aujourdhui
  const faites = faitesLe(date)
  // Une séance prévue déjà faite ce jour-là n'est pas répétée : sa carte de séance faite suffit.
  const prevues = prevuesLe(date).filter((s) => !faites.some((log) => log.workout_id === s.id))
  const exception = seancePrevue(date, seances.data, planning.data).exception
  const reposPossible = date >= aujourdhui && faites.length === 0 && prevues.length > 0

  function mettreAuRepos() {
    void executer(() => planifierJour(date, null, "Repos choisi dans l'application"), {
      cle: ["planning"],
      maj: (liste: Exception[]) => [
        ...liste.filter((p) => p.date !== date),
        { id: "provisoire", date, workout_id: null, raison: "Repos choisi dans l'application" },
      ],
    })
  }

  function marque(jour: string): Marque | null {
    const faite = faitesLe(jour)[0]
    if (faite) {
      const seance = faite.workout_id ? parId.get(faite.workout_id) : undefined
      return {
        etat: "fait",
        libelle: seance ? codeCourt(seance.code) : undefined,
        description: seance ? `séance ${seance.code} faite` : "séance faite",
      }
    }
    const prevue = prevuesLe(jour)[0]
    if (!prevue) return null
    return jour < aujourdhui!
      ? { etat: "passe", libelle: codeCourt(prevue.code), description: `séance ${prevue.code} prévue, pas enregistrée` }
      : { etat: "prevu", libelle: codeCourt(prevue.code), description: `séance ${prevue.code} prévue` }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EnTete titre="Séances" sousTitre="Touche une date pour voir sa séance et la modifier" />
        <LienHistorique />
      </div>

      <AjustementsProposes />

      <Calendrier
        mois={mois ?? premierDuMois(date)}
        onMois={setMois}
        selection={date}
        onChoisir={setDateChoisie}
        aujourdhui={aujourdhui}
        marque={marque}
      />

      <Section titre={majuscule(dateLongue(date))}>
        <div className="space-y-3">
          {exception && faites.length === 0 && (
            <ExceptionPlanning exception={exception} seanceType={seanceDeLaSemaineType(date, seances.data)?.code} />
          )}

          {faites.map((log) => (
            <SeanceFaite key={log.id} log={log} seance={log.workout_id ? parId.get(log.workout_id) : undefined} />
          ))}

          {prevues.map((seance) => (
            <SeancePrevue
              key={seance.id}
              seance={seance}
              jour={exception ? null : jourDe(date)}
              demarrable={date === aujourdhui && faites.length === 0}
            />
          ))}

          {reposPossible && (
            <Button variant="ghost" className="h-11 w-full gap-2 text-base" disabled={enCours} onClick={mettreAuRepos}>
              <BedDouble className="size-5" aria-hidden="true" />
              Pas de séance ce jour-là
            </Button>
          )}

          {faites.length === 0 && prevues.length === 0 && !exception && (
            <Vide Icone={Moon} titre="Jour de repos">
              Aucune séance n&apos;est prévue le {jourDe(date)}.
            </Vide>
          )}

          {/* Une séance faite sans l'application s'enregistre après coup, jamais à l'avance. */}
          {date <= aujourdhui && seances.data.length > 0 && (
            <Button
              variant={date < aujourdhui && prevues.length > 0 && faites.length === 0 ? "default" : "outline"}
              className="h-12 w-full gap-2 text-base font-semibold"
              onClick={() => setSaisie(true)}
            >
              <ClipboardCheck className="size-5" aria-hidden="true" />
              {date === aujourdhui ? "Enregistrer une séance déjà faite" : "Enregistrer une séance faite ce jour-là"}
            </Button>
          )}
        </div>
      </Section>

      <SaisieApresCoup
        ouvert={saisie}
        onFermer={() => setSaisie(false)}
        date={date}
        seances={seances.data}
        seanceInitiale={prevues[0] ?? prevuesLe(date)[0]}
      />

      <Section titre="Ton programme" aside={`${planifiees.length} par semaine`}>
        {seances.data.length === 0 ? (
          <Vide Icone={Dumbbell} titre="Aucune séance">
            Crée ta première séance avec le bouton ci-dessous, puis ajoute-lui des exercices.
          </Vide>
        ) : (
          <ul className="space-y-3">
            {[...planifiees, ...libres].map((seance) => (
              <li key={seance.id}>
                <CarteSeance seance={seance} />
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="outline"
          className="h-14 w-full gap-2 text-base font-semibold"
          disabled={enCours}
          onClick={nouvelle}
        >
          <Plus className="size-5" aria-hidden="true" />
          Nouvelle séance
        </Button>
      </Section>
    </>
  )
}

// La séance prévue ce jour-là : la consulter, la modifier, ou la démarrer si c'est aujourd'hui.
function SeancePrevue({ seance, jour, demarrable }: { seance: Seance; jour: string | null; demarrable: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-brand">{jour ? `Prévue chaque ${jour}` : "Prévue ce jour-là"}</p>
      <CarteSeance seance={seance} />
      {demarrable && <BoutonDemarrer seanceId={seance.id} />}
      <Link
        href={`/sport/seances/${seance.id}?edition=1`}
        className={buttonVariants({ variant: "outline", className: "h-12 w-full gap-2 text-base" })}
      >
        <Pencil className="size-4" aria-hidden="true" />
        Modifier la séance {seance.code}
      </Link>
    </div>
  )
}

// Une séance enregistrée ce jour-là, avec ses séries exercice par exercice.
function SeanceFaite({ log, seance }: { log: Tables<"workout_logs">; seance: Seance | undefined }) {
  const series = useSeriesSeance(log.id)
  const titre = !log.workout_id
    ? "Séance hors programme"
    : seance
      ? `Séance ${seance.code} · ${seance.nom}`
      : "Séance retirée du programme"

  const parExercice = new Map<string, { nom: string; series: NonNullable<typeof series.data> }>()
  for (const serie of series.data ?? []) {
    const groupe = parExercice.get(serie.exercise_id) ?? { nom: serie.exercise.nom, series: [] }
    groupe.series.push(serie)
    parExercice.set(serie.exercise_id, groupe)
  }

  return (
    <Carte className="overflow-hidden border-success/50">
      <div className="flex items-center gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-5" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1">
          <span className="block font-semibold">{titre}</span>
          <span className="block text-sm text-muted-foreground tabular-nums">
            Faite
            {log.duree_min !== null && ` · ${log.duree_min} min`}
            {series.data && ` · ${series.data.length} série${series.data.length > 1 ? "s" : ""}`}
          </span>
        </p>
      </div>

      {series.isPending ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">Chargement des séries…</p>
      ) : parExercice.size > 0 ? (
        <ul className="divide-y border-t">
          {[...parExercice.values()].map(({ nom, series: liste }) => {
            const textes = liste.map((s) => texteSerie({ charge: s.charge_kg, reps: s.reps, duree: s.duree_sec }))
            const identiques = textes.every((t) => t === textes[0])
            return (
              <li key={nom} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="min-w-0 font-medium">{nom}</span>
                <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                  {identiques && liste.length > 1
                    ? `${liste.length} séries${textes[0] === "Faite" ? "" : ` de ${textes[0]}`}`
                    : textes.join(" · ")}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
      {log.note && <p className="border-t px-4 py-3 text-sm text-muted-foreground">{log.note}</p>}
      {seance && (
        <div className="border-t p-3">
          <Link
            href={`/sport/seances/${seance.id}?edition=1`}
            className={buttonVariants({ variant: "outline", className: "h-12 w-full gap-2 text-base" })}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Modifier la séance {seance.code}
          </Link>
        </div>
      )}
    </Carte>
  )
}
