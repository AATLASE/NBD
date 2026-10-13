"use client"

import { cn } from "cn"
import { CircleCheck, CircleDashed, Footprints, Lock, Plus, Watch } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Carte, EnTete, Etiquette, Section, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Stepper } from "@/components/execution/stepper"
import { SaisieDouleur } from "@/components/sport/saisie-douleur"
import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAujourdhui } from "@/lib/aujourdhui"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { dateCourte, nombre } from "@/lib/format"
import { changerStatutSemaine } from "@/lib/mutations"
import { useCourse, useDebutProgramme, usePied } from "@/lib/queries"
import {
  JOURS_SANS_DOULEUR_REQUIS,
  MINUTES_MARCHE_REQUISES,
  SEMAINE_REPRISE_COURSE,
  SEUIL_DOULEUR_REPRISE,
  marcheSansDouleur,
  semaineProgramme,
  serieSansDouleur,
} from "@/lib/regles"

const SORTIES_AFFICHEES = 5

export default function Course() {
  const aujourdhui = useAujourdhui()
  const course = useCourse()
  const pied = usePied()
  const debut = useDebutProgramme()
  const { executer, enCours } = useEdition()
  const [saisie, setSaisie] = useState(false)
  // Semaine verrouillée dont on demande quand même la validation.
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)

  if (!aujourdhui || !course.data || !pied.data || debut.data === undefined) {
    return <Attente requetes={[course, pied, debut]} />
  }

  const { plan, sorties } = course.data
  const { semaine } = semaineProgramme(debut.data, aujourdhui)
  const douleur = serieSansDouleur(pied.data.mesures, aujourdhui)
  const marche = marcheSansDouleur(sorties)
  // Sans protocole pied, pas de douleur à surveiller : ni conditions d'entrée ni verrou.
  const suiviDuPied = pied.data.items.length > 0
  const repriseDebloquee = !suiviDuPied || (douleur.remplie && marche)
  // La douleur du lendemain se renseigne à partir du jour suivant la sortie.
  const sansLendemain = sorties.find((s) => s.date < aujourdhui && s.douleur_lendemain === null)
  const derniere = sorties[0]

  const conditions = [
    {
      remplie: douleur.remplie,
      texte: `Douleur au réveil à ${SEUIL_DOULEUR_REPRISE} ou moins pendant ${JOURS_SANS_DOULEUR_REQUIS} jours de suite`,
      detail: `${douleur.serie} jour${douleur.serie > 1 ? "s" : ""} sur ${JOURS_SANS_DOULEUR_REQUIS}`,
    },
    {
      remplie: marche,
      texte: `${MINUTES_MARCHE_REQUISES} min de marche rapide sans douleur, ni pendant ni le lendemain`,
      detail: marche ? "Sortie enregistrée" : "Aucune sortie de ce type enregistrée",
    },
  ]

  const valider = (id: string) => void executer(() => changerStatutSemaine(id, "valide"))

  return (
    <>
      <EnTete
        titre="Course"
        sousTitre={plan.length > 0 ? `Reprise progressive sur ${plan.length} semaines` : "Tes sorties"}
      />

      <div className="space-y-3">
        <Button className="h-14 w-full gap-2 text-lg font-semibold" onClick={() => setSaisie(true)}>
          <Plus className="size-5" aria-hidden="true" />
          Enregistrer une sortie
        </Button>
        <Link
          href="/parametres/import?type=montre"
          className={buttonVariants({ variant: "outline", className: "h-12 w-full gap-2 text-base font-semibold" })}
        >
          <Watch className="size-4" aria-hidden="true" />
          Importer depuis ma montre
        </Link>
      </div>

      {sansLendemain && (
        <Carte className="border-2 border-primary p-4">
          <SaisieDouleur
            // Une nouvelle sortie à compléter repart d'un curseur neuf.
            key={sansLendemain.id}
            libelle={`Douleur le lendemain de ta sortie du ${dateCourte(sansLendemain.date)}`}
            enCours={enCours}
            onEnregistrer={(valeur) =>
              void executer(differable("enregistrerDouleurLendemain", sansLendemain.id, valeur))
            }
          />
        </Carte>
      )}

      {suiviDuPied && (
      <Section
        titre={`Entrée en semaine ${SEMAINE_REPRISE_COURSE}`}
        aside={
          <Etiquette ton={repriseDebloquee ? "success" : "neutre"}>
            {repriseDebloquee ? "Débloquée" : "Verrouillée"}
          </Etiquette>
        }
      >
        <Carte>
          <ul className="divide-y">
            {conditions.map(({ remplie, texte, detail }) => (
              <li key={texte} className="flex gap-3 p-4">
                {remplie ? (
                  <CircleCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <CircleDashed
                    className="mt-0.5 size-6 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <p className="leading-snug font-medium">
                    <span className="sr-only">{remplie ? "Remplie : " : "Non remplie : "}</span>
                    {texte}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Carte>
      </Section>
      )}

      {plan.length > 0 && (
      <Section titre="Plan">
        <ol className="space-y-3">
          {plan.map((ligne) => {
            const enCoursIci = ligne.semaine === semaine
            const bloquee = ligne.semaine === SEMAINE_REPRISE_COURSE && !repriseDebloquee
            const validee = ligne.statut === "valide"
            return (
              <li key={ligne.id} aria-current={enCoursIci ? "step" : undefined}>
                <Carte className={cn("overflow-hidden", enCoursIci && "border-2 border-primary")}>
                  <div className="flex gap-3 p-4">
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl font-bold tabular-nums",
                        enCoursIci ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}
                    >
                      <span className="sr-only">Semaine </span>
                      <span aria-hidden="true">S</span>
                      {ligne.semaine}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="leading-snug font-medium">{ligne.protocole}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {ligne.seances_par_semaine} fois par semaine ·{" "}
                        {nombre(ligne.volume_km_cible)} km visés
                      </p>
                    </div>
                    {validee ? (
                      <Etiquette ton="success">Validée</Etiquette>
                    ) : ligne.statut === "repete" ? (
                      <Etiquette ton="warning">À refaire</Etiquette>
                    ) : (
                      enCoursIci && <Etiquette ton="brand">En cours</Etiquette>
                    )}
                  </div>

                  {bloquee && (
                    <p className="flex items-start gap-2 bg-danger-soft px-4 py-3 text-sm leading-snug font-medium text-danger">
                      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      Verrouillée tant que les deux conditions d&apos;entrée ne sont pas remplies.
                    </p>
                  )}

                  {enCoursIci && (
                    <div className="grid grid-cols-2 gap-2 border-t p-3">
                      {validee ? (
                        <Button
                          variant="outline"
                          className="col-span-2 h-11 text-base"
                          disabled={enCours}
                          onClick={() => void executer(() => changerStatutSemaine(ligne.id, "a_venir"))}
                        >
                          Retirer la validation
                        </Button>
                      ) : (
                        <>
                          <Button
                            className="h-11 text-base font-semibold"
                            disabled={enCours}
                            onClick={() => (bloquee ? setAConfirmer(ligne.id) : valider(ligne.id))}
                          >
                            Valider la semaine
                          </Button>
                          <Button
                            variant="outline"
                            className="h-11 text-base"
                            disabled={enCours || ligne.statut === "repete"}
                            onClick={() => void executer(() => changerStatutSemaine(ligne.id, "repete"))}
                          >
                            À refaire
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </Carte>
              </li>
            )
          })}
        </ol>
      </Section>
      )}

      <Section titre="Dernières sorties">
        {sorties.length === 0 ? (
          <Vide Icone={Footprints} titre="Aucune sortie enregistrée">
            Marche rapide, vélo ou course : enregistre ta première sortie avec le bouton du haut.
          </Vide>
        ) : (
          <Carte>
            <ul className="divide-y">
              {sorties.slice(0, SORTIES_AFFICHEES).map((sortie) => (
                <li key={sortie.id} className="space-y-0.5 px-4 py-3 tabular-nums">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="font-medium first-letter:uppercase">{dateCourte(sortie.date)}</span>
                    <span className="font-semibold">
                      {nombre(sortie.km)} km
                      {sortie.duree_min !== null && ` · ${sortie.duree_min} min`}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Douleur après : {sortie.douleur_apres ?? "non renseignée"} · le lendemain :{" "}
                    {sortie.douleur_lendemain ?? "à renseigner"}
                  </p>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </Section>

      <Sheet open={saisie} onOpenChange={setSaisie}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          {saisie && (
            <FormulaireSortie
              kmInitial={derniere?.km ?? 0}
              dureeInitiale={derniere?.duree_min ?? 30}
              enCours={enCours}
              onEnregistrer={(sortie) => {
                setSaisie(false)
                void executer(differable("enregistrerSortie", { date: aujourdhui, ...sortie }), {
                  cle: ["course"],
                  maj: (donnees: NonNullable<typeof course.data>) => ({
                    ...donnees,
                    sorties: [
                      {
                        id: "provisoire",
                        user_id: "",
                        date: aujourdhui,
                        km: sortie.km,
                        duree_min: sortie.dureeMin,
                        douleur_apres: sortie.douleurApres,
                        douleur_lendemain: null,
                      },
                      ...donnees.sorties,
                    ],
                  }),
                })
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={aConfirmer !== null} onOpenChange={(ouvert) => !ouvert && setAConfirmer(null)}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-w-lg gap-0 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          <SheetHeader>
            <SheetTitle className="text-xl font-bold">Valider malgré le verrou ?</SheetTitle>
            <SheetDescription className="text-base">
              Les deux conditions d&apos;entrée en semaine {SEMAINE_REPRISE_COURSE} ne sont pas remplies. Reprendre
              la course trop tôt peut relancer la douleur. En cas de doute, demande à ton kiné ou à ton
              podologue.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4">
            <Button className="h-14 w-full text-base font-semibold" onClick={() => setAConfirmer(null)}>
              Ne pas valider
            </Button>
            <Button
              variant="destructive"
              className="h-12 w-full text-base"
              onClick={() => {
                if (aConfirmer) valider(aConfirmer)
                setAConfirmer(null)
              }}
            >
              Valider quand même
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function FormulaireSortie({
  kmInitial,
  dureeInitiale,
  enCours,
  onEnregistrer,
}: {
  kmInitial: number
  dureeInitiale: number
  enCours: boolean
  onEnregistrer: (sortie: { km: number; dureeMin: number; douleurApres: number }) => void
}) {
  const [km, setKm] = useState(kmInitial)
  const [dureeMin, setDureeMin] = useState(dureeInitiale)

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">Sortie d&apos;aujourd&apos;hui</SheetTitle>
        <SheetDescription className="text-base">Marche rapide, vélo, rameur ou course</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <Stepper libelle="Distance" valeur={km} unite="km" pas={0.5} max={100} onChange={setKm} />
        <Stepper libelle="Durée" valeur={dureeMin} unite="min" pas={5} min={5} max={600} onChange={setDureeMin} />
        <div className="border-t pt-4">
          <SaisieDouleur
            libelle="Douleur juste après"
            action="Enregistrer la sortie"
            enCours={enCours}
            onEnregistrer={(douleurApres) => onEnregistrer({ km, dureeMin, douleurApres })}
          />
        </div>
      </div>
    </>
  )
}
