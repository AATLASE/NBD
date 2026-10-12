"use client"

import { ChartNoAxesColumn, Plus, Ruler, Scale, TrendingDown, TrendingUp } from "lucide-react"
import { useState } from "react"

import { Carte, EnTete, Etiquette, Section, Stat, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Stepper } from "@/components/execution/stepper"
import { Barres, Courbe } from "@/components/graphiques"
import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAujourdhui } from "@/lib/aujourdhui"
import type { Tables } from "@/lib/database.types"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { dateCourte, nombre } from "@/lib/format"
import { LIBELLE_OBJECTIF, type Objectif } from "@/lib/libelles"
import {
  useExercices,
  useHistoriqueSeries,
  useJournalSeances,
  useMesures,
  useProfil,
  useSeances,
} from "@/lib/queries"
import {
  KCAL_CONSEILLEES_SI_PERTE_RAPIDE,
  jourCourt,
  moyenne7Jours,
  parSemaine,
  perteTropRapide,
} from "@/lib/suivi"

const DERNIERES = 5
const SEMAINES_AFFICHEES = 8
const TOUR_DE_TAILLE_DEFAUT = 90

function Releve({ lignes }: { lignes: { cle: string; libelle: string; valeur: string }[] }) {
  return (
    <ul className="divide-y border-t">
      {lignes.map(({ cle, libelle, valeur }) => (
        <li key={cle} className="flex items-baseline justify-between gap-3 px-4 py-3 tabular-nums">
          <span className="shrink-0 whitespace-nowrap text-muted-foreground first-letter:uppercase">
            {libelle}
          </span>
          <span className="text-right font-semibold">{valeur}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Progression() {
  const aujourdhui = useAujourdhui()
  const profil = useProfil()
  const mesures = useMesures()
  const journal = useJournalSeances()
  const seances = useSeances()
  const historique = useHistoriqueSeries()
  const exercices = useExercices()
  const [saisie, setSaisie] = useState(false)
  const [exerciceChoisi, setExerciceChoisi] = useState<string | null>(null)

  if (
    !aujourdhui ||
    profil.data === undefined ||
    !mesures.data ||
    !journal.data ||
    !seances.data ||
    !historique.data ||
    !exercices.data
  ) {
    return <Attente requetes={[profil, mesures, journal, seances, historique, exercices]} />
  }

  // Du plus ancien au plus récent pour les courbes ; la base renvoie le plus récent d'abord.
  const pesees = mesures.data.filter((m) => m.poids_kg !== null).toReversed()
  const tours = mesures.data.filter((m) => m.tour_taille_cm !== null).toReversed()
  const dernierePesee = pesees.at(-1)
  const moyenneActuelle = moyenne7Jours(pesees, aujourdhui)
  const alerte = perteTropRapide(pesees, aujourdhui)
  const seanceParId = new Map(seances.data.map((s) => [s.id, s]))

  // Les objectifs choisis à l'accueil donnent leur sens aux chiffres : perdre 1 kg est une
  // réussite pour qui veut perdre du poids, une simple information sinon.
  const objectifs = (profil.data?.objectifs ?? []) as Objectif[]
  const depart = profil.data?.poids_initial_kg ?? null
  const ecart = depart !== null && moyenneActuelle !== null ? Math.round((moyenneActuelle - depart) * 10) / 10 : null
  const veutPerdre = objectifs.includes("perte_de_poids")

  // Par exercice : pour chaque séance où il a été fait, la plus lourde charge et le volume total.
  const parExercice = new Map<string, { date: string; charge: number; volume: number }[]>()
  for (const seance of historique.data.toReversed()) {
    const duJour = new Map<string, { charge: number; volume: number }>()
    for (const serie of seance.set_logs) {
      const exerciceId = serie.workout_exercise?.exercise_id
      if (!exerciceId || serie.charge_kg === null) continue
      const cumul = duJour.get(exerciceId) ?? { charge: 0, volume: 0 }
      cumul.charge = Math.max(cumul.charge, serie.charge_kg)
      cumul.volume += serie.charge_kg * (serie.reps ?? 0)
      duJour.set(exerciceId, cumul)
    }
    for (const [exerciceId, cumul] of duJour) {
      parExercice.set(exerciceId, [...(parExercice.get(exerciceId) ?? []), { date: seance.date, ...cumul }])
    }
  }
  const exercicesSuivis = exercices.data.filter((e) => parExercice.has(e.id))
  const exercice = exercicesSuivis.find((e) => e.id === exerciceChoisi) ?? exercicesSuivis[0]
  const points = exercice ? parExercice.get(exercice.id)! : []

  const seancesParSemaine = parSemaine(
    journal.data.map((log) => log.date),
    aujourdhui,
    SEMAINES_AFFICHEES
  )

  return (
    <>
      <div className="space-y-3">
        <EnTete titre="Progression" />
        {objectifs.length > 0 && (
          <ul aria-label="Tes objectifs" className="flex flex-wrap gap-2">
            {objectifs.map((objectif) => (
              <li key={objectif}>
                <Etiquette ton="brand" className="h-7 px-3 text-sm">
                  {LIBELLE_OBJECTIF[objectif]}
                </Etiquette>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button className="h-14 w-full gap-2 text-lg font-semibold" onClick={() => setSaisie(true)}>
        <Plus className="size-5" aria-hidden="true" />
        Ajouter une pesée
      </Button>

      {alerte && (
        <div role="alert" className="flex gap-3 rounded-2xl bg-warning-soft p-4 text-warning">
          <TrendingDown className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="leading-snug font-medium">
            Tu perds environ {nombre(Math.round(alerte.parSemaine * 10) / 10)} kg par semaine depuis 3
            semaines. C&apos;est rapide : remonte à {nombre(KCAL_CONSEILLEES_SI_PERTE_RAPIDE)} kcal par jour
            pour préserver ta masse musculaire.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat
          libelle="Poids de départ"
          valeur={profil.data?.poids_initial_kg != null ? nombre(profil.data.poids_initial_kg) : "–"}
          unite={profil.data?.poids_initial_kg != null ? "kg" : undefined}
        />
        <Stat
          libelle="Moyenne sur 7 jours"
          valeur={moyenneActuelle !== null ? nombre(Math.round(moyenneActuelle * 10) / 10) : "–"}
          unite={moyenneActuelle !== null ? "kg" : undefined}
        />
        {ecart !== null && (
          <div className="col-span-2">
            <Carte className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm text-muted-foreground">Depuis le départ</p>
                <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                  {ecart > 0 ? "+" : ecart < 0 ? "−" : ""}
                  {nombre(Math.abs(ecart))}
                  <span className="ml-1 text-base font-medium text-muted-foreground">kg</span>
                </p>
              </div>
              {veutPerdre && ecart !== 0 && (
                <Etiquette ton={ecart < 0 ? "success" : "warning"}>
                  {ecart < 0 ? "Dans le sens de ton objectif" : "À l'opposé de ton objectif"}
                </Etiquette>
              )}
            </Carte>
          </div>
        )}
      </div>

      <Section titre="Poids">
        {pesees.length === 0 ? (
          <Vide Icone={Scale} titre="Aucune pesée">
            La courbe se dessinera à partir de la première pesée enregistrée.
          </Vide>
        ) : (
          <Carte className="overflow-hidden">
            <div className="px-2 pt-4 pb-2">
              <Courbe
                resume={`Poids : ${pesees.length} pesée${pesees.length > 1 ? "s" : ""}, la dernière à ${nombre(dernierePesee!.poids_kg!)} kg.`}
                donnees={pesees.map((p) => ({
                  libelle: jourCourt(p.date),
                  moyenne: Math.round(moyenne7Jours(pesees, p.date)! * 10) / 10,
                  pesee: p.poids_kg,
                }))}
                series={[
                  { cle: "moyenne", nom: "Moyenne mobile 7 jours" },
                  { cle: "pesee", nom: "Pesée du jour", trace: "points" },
                ]}
                seuil={depart !== null ? { valeur: depart, libelle: `Départ : ${nombre(depart)} kg` } : undefined}
                unite="kg"
              />
            </div>
            <Releve
              lignes={pesees
                .toReversed()
                .slice(0, DERNIERES)
                .map((m) => ({ cle: m.id, libelle: dateCourte(m.date), valeur: `${nombre(m.poids_kg!)} kg` }))}
            />
          </Carte>
        )}
      </Section>

      <Section titre="Tour de taille">
        {tours.length === 0 ? (
          <Vide Icone={Ruler} titre="Aucune mesure">
            Le tour de taille s&apos;enregistre en même temps que le poids.
          </Vide>
        ) : (
          <Carte className="overflow-hidden">
            <div className="px-2 pt-4 pb-2">
              <Courbe
                resume={`Tour de taille : ${tours.length} mesure${tours.length > 1 ? "s" : ""}, la dernière à ${nombre(tours.at(-1)!.tour_taille_cm!)} cm.`}
                donnees={tours.map((m) => ({ libelle: jourCourt(m.date), tour: m.tour_taille_cm }))}
                series={[{ cle: "tour", nom: "Tour de taille" }]}
                unite="cm"
              />
            </div>
            <Releve
              lignes={tours
                .toReversed()
                .slice(0, DERNIERES)
                .map((m) => ({
                  cle: m.id,
                  libelle: dateCourte(m.date),
                  valeur: `${nombre(m.tour_taille_cm!)} cm`,
                }))}
            />
          </Carte>
        )}
      </Section>

      <Section titre="Séances par semaine" aside={`${SEMAINES_AFFICHEES} dernières semaines`}>
        {journal.data.length === 0 ? (
          <Vide Icone={ChartNoAxesColumn} titre="Aucune séance enregistrée">
            Chaque séance terminée ajoutera une barre ici.
          </Vide>
        ) : (
          <Carte className="overflow-hidden">
            <div className="px-2 pt-4 pb-2">
              <Barres
                resume={`Séances par semaine : ${seancesParSemaine.at(-1)!.valeur} cette semaine, ${journal.data.length} au total.`}
                donnees={seancesParSemaine}
                nom="Séances"
                unite=""
              />
            </div>
            <Releve
              lignes={journal.data.slice(0, DERNIERES).map((log) => {
                const seance = seanceParId.get(log.workout_id)
                return {
                  cle: log.id,
                  libelle: dateCourte(log.date),
                  valeur: [
                    seance ? `${seance.code} · ${seance.nom}` : "Séance supprimée",
                    log.duree_min !== null ? `${log.duree_min} min` : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }
              })}
            />
          </Carte>
        )}
      </Section>

      <Section titre="Charges par exercice">
        {!exercice ? (
          <Vide Icone={TrendingUp} titre="Pas encore de courbe">
            L&apos;évolution de la charge et du volume apparaîtra après la première séance avec charge.
          </Vide>
        ) : (
          <>
            <Filtres
              libelle="Exercice affiché"
              valeur={exercice.id}
              onChange={setExerciceChoisi}
              options={exercicesSuivis.map((e) => ({ valeur: e.id, libelle: e.nom }))}
            />
            {/* Charge et volume n'ont pas le même ordre de grandeur : un graphique chacun. */}
            <Carte className="overflow-hidden">
              <h3 className="px-4 pt-4 text-sm font-semibold text-brand">Charge la plus lourde</h3>
              <div className="px-2 pt-2 pb-3">
                <Courbe
                  resume={`${exercice.nom}, charge la plus lourde par séance : ${nombre(points.at(-1)!.charge)} kg à la dernière.`}
                  donnees={points.map((p) => ({ libelle: jourCourt(p.date), charge: p.charge }))}
                  series={[{ cle: "charge", nom: "Charge" }]}
                  unite="kg"
                />
              </div>
              <h3 className="border-t px-4 pt-4 text-sm font-semibold text-brand">
                Volume par séance (charge × reps)
              </h3>
              <div className="px-2 pt-2 pb-3">
                <Barres
                  resume={`${exercice.nom}, volume par séance : ${nombre(points.at(-1)!.volume)} kg à la dernière.`}
                  donnees={points.map((p) => ({ libelle: jourCourt(p.date), valeur: p.volume }))}
                  nom="Volume"
                  unite="kg"
                />
              </div>
              <Releve
                lignes={points
                  .toReversed()
                  .slice(0, DERNIERES)
                  .map((p) => ({
                    cle: p.date,
                    libelle: dateCourte(p.date),
                    valeur: `${nombre(p.charge)} kg · volume ${nombre(p.volume)} kg`,
                  }))}
              />
            </Carte>
          </>
        )}
      </Section>

      <Sheet open={saisie} onOpenChange={setSaisie}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          {saisie && (
            <FormulairePesee
              date={aujourdhui}
              poidsInitial={dernierePesee?.poids_kg ?? profil.data?.poids_initial_kg ?? 80}
              tourInitial={tours.at(-1)?.tour_taille_cm ?? null}
              onFermer={() => setSaisie(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function FormulairePesee({
  date,
  poidsInitial,
  tourInitial,
  onFermer,
}: {
  date: string
  poidsInitial: number
  tourInitial: number | null
  onFermer: () => void
}) {
  const { executer, enCours } = useEdition()
  const [poids, setPoids] = useState(poidsInitial)
  const [avecTour, setAvecTour] = useState(false)
  const [tour, setTour] = useState(tourInitial ?? TOUR_DE_TAILLE_DEFAUT)

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">Pesée du jour</SheetTitle>
        <SheetDescription className="text-base">
          Le matin, à jeun : c&apos;est la moyenne sur 7 jours qui compte, pas le chiffre du jour.
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <Stepper libelle="Poids" valeur={poids} unite="kg" pas={0.1} min={30} max={300} onChange={setPoids} />
        <Filtres
          libelle="Mesurer aussi le tour de taille"
          valeur={avecTour ? "oui" : "non"}
          onChange={(v) => setAvecTour(v === "oui")}
          options={[
            { valeur: "non", libelle: "Poids seul" },
            { valeur: "oui", libelle: "Avec tour de taille" },
          ]}
        />
        {avecTour && (
          <Stepper libelle="Tour de taille" valeur={tour} unite="cm" pas={0.5} min={40} max={250} onChange={setTour} />
        )}
        <Button
          className="h-14 w-full text-lg font-semibold"
          disabled={enCours}
          onClick={() => {
            onFermer()
            void executer(differable("enregistrerPesee", date, poids, avecTour ? tour : null), {
              cle: ["mesures"],
              maj: (mesures: Tables<"body_metrics">[]) => {
                const deja = mesures.find((m) => m.date === date)
                const pesee = {
                  id: deja?.id ?? "provisoire",
                  user_id: deja?.user_id ?? "",
                  date,
                  poids_kg: poids,
                  tour_taille_cm: avecTour ? tour : (deja?.tour_taille_cm ?? null),
                }
                return [pesee, ...mesures.filter((m) => m.date !== date)].sort((a, b) => b.date.localeCompare(a.date))
              },
            })
          }}
        >
          Enregistrer
        </Button>
      </div>
    </>
  )
}
