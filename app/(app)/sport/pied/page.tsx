"use client"

import { cn } from "cn"
import { Activity } from "lucide-react"

import { Carte, EnTete, Etiquette, Section, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Courbe } from "@/components/graphiques"
import { ProtocolePied, palierDeLaSemaine } from "@/components/sport/protocole-pied"
import { useAujourdhui } from "@/lib/aujourdhui"
import { dateCourte, decalerJours, nombre } from "@/lib/format"
import { useDebutProgramme, usePied, useProfil } from "@/lib/queries"
import { SEUIL_DOULEUR_REPRISE, feuTricolore, semaineProgramme, type EtatFeu } from "@/lib/regles"
import { jourCourt } from "@/lib/suivi"

const FEUX: Record<EtatFeu, { titre: string; consigne: string; lampe: string; texte: string }> = {
  vert: {
    titre: "Feu vert",
    consigne: "Le plan se poursuit normalement, progression comprise.",
    lampe: "bg-success",
    texte: "text-success",
  },
  orange: {
    titre: "Feu orange",
    consigne: "Reste sur le palier actuel. Pas de progression tant que la douleur ne redescend pas.",
    lampe: "bg-warning",
    texte: "text-warning",
  },
  rouge: {
    titre: "Feu rouge",
    consigne:
      "Arrête la course et les impacts, garde seulement le protocole. Si ça dure, vois ton kiné ou ton podologue.",
    lampe: "bg-danger",
    texte: "text-danger",
  },
}
const ORDRE_FEUX: EtatFeu[] = ["rouge", "orange", "vert"]
const JOURS_DE_COURBE = 30
const MESURES_LISTEES = 7

export default function Pied() {
  const aujourdhui = useAujourdhui()
  const pied = usePied()
  const debut = useDebutProgramme()
  const profil = useProfil()

  if (!aujourdhui || !pied.data || debut.data === undefined || profil.data === undefined) {
    return <Attente requetes={[pied, debut, profil]} />
  }

  const { items, paliers, mesures } = pied.data

  if (items.length === 0) {
    return (
      <>
        <EnTete titre="Pied" />
        <Vide Icone={Activity} titre="Pas de protocole pied sur ce compte">
          Cet écran sert au suivi d&apos;une blessure du pied. Il n&apos;y a rien à suivre ici.
        </Vide>
      </>
    )
  }
  const { semaine } = semaineProgramme(debut.data, aujourdhui)
  const feu = feuTricolore(mesures, aujourdhui)
  const itemsAProgression = items.filter((item) => paliers.some((p) => p.protocol_item_id === item.id))

  // Un point par jour sur 30 jours, jours sans mesure compris : l'axe du temps reste régulier.
  const parDate = new Map(mesures.map((m) => [m.date, m.douleur_matin]))
  const courbe = Array.from({ length: JOURS_DE_COURBE }, (_, index) => {
    const date = decalerJours(aujourdhui, index - (JOURS_DE_COURBE - 1))
    return { libelle: jourCourt(date), douleur: parDate.get(date) ?? null }
  })
  const recentes = mesures.filter((m) => m.date > decalerJours(aujourdhui, -JOURS_DE_COURBE))

  return (
    <>
      <EnTete titre="Pied" sousTitre={profil.data?.contrainte_medicale ?? undefined} />

      <Carte className="flex items-center gap-4 p-4">
        <div aria-hidden="true" className="flex flex-col gap-1.5 rounded-full bg-muted p-2">
          {ORDRE_FEUX.map((etat) => (
            <span
              key={etat}
              className={cn(
                "size-5 rounded-full",
                feu?.etat === etat ? FEUX[etat].lampe : "bg-foreground/15"
              )}
            />
          ))}
        </div>
        {feu ? (
          <div className="min-w-0 space-y-1">
            <p className={cn("text-xl font-bold", FEUX[feu.etat].texte)}>{FEUX[feu.etat].titre}</p>
            <p className="leading-snug">{FEUX[feu.etat].consigne}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              Moyenne {nombre(Math.round(feu.moyenne * 10) / 10)} sur 10, {feu.jours} mesure
              {feu.jours > 1 ? "s" : ""} en 7 jours
            </p>
          </div>
        ) : (
          <div className="min-w-0 space-y-1">
            <p className="text-xl font-bold">Feu éteint</p>
            <p className="leading-snug text-muted-foreground">
              Aucune douleur matinale renseignée sur les 7 derniers jours.
            </p>
          </div>
        )}
      </Carte>

      <Section titre="Protocole" aside={`Semaine ${semaine}`}>
        <ProtocolePied items={items} paliers={paliers} semaine={semaine} />
      </Section>

      {itemsAProgression.map((item) => {
        const actuel = palierDeLaSemaine(paliers, item.id, semaine)
        return (
          <Section key={item.id} titre="Progression">
            <p className="-mt-1 text-sm leading-snug text-muted-foreground">{item.exercice}</p>
            <Carte>
              <ol className="divide-y">
                {paliers
                  .filter((p) => p.protocol_item_id === item.id)
                  .map((palier) => {
                    const enCours = palier.id === actuel?.id
                    return (
                      <li
                        key={palier.id}
                        aria-current={enCours ? "step" : undefined}
                        className="flex items-center gap-3 p-4"
                      >
                        <span
                          className={cn(
                            "flex h-9 w-16 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
                            enCours ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}
                        >
                          S{palier.semaine_debut}
                          {palier.semaine_fin !== palier.semaine_debut && `-${palier.semaine_fin}`}
                        </span>
                        <span className={cn("min-w-0 flex-1 leading-snug", enCours && "font-semibold")}>
                          {palier.dosage}
                        </span>
                        {enCours && <Etiquette ton="brand">En cours</Etiquette>}
                      </li>
                    )
                  })}
              </ol>
            </Carte>
          </Section>
        )
      })}

      <Section titre="Douleur matinale" aside="30 jours">
        {recentes.length === 0 ? (
          <Vide Icone={Activity} titre="Pas encore de mesure">
            La courbe apparaîtra dès la première douleur matinale enregistrée.
          </Vide>
        ) : (
          <Carte className="overflow-hidden">
            <div className="px-2 pt-4 pb-2">
              <Courbe
                resume={`Douleur matinale sur ${JOURS_DE_COURBE} jours : ${recentes.length} mesure${recentes.length > 1 ? "s" : ""}, la dernière à ${recentes[0]!.douleur_matin} sur 10.`}
                donnees={courbe}
                series={[{ cle: "douleur", nom: "Douleur" }]}
                unite="/ 10"
                domaine={[0, 10]}
                seuil={{ valeur: SEUIL_DOULEUR_REPRISE, libelle: `Seuil de reprise : ${SEUIL_DOULEUR_REPRISE}` }}
              />
            </div>
            <ul className="divide-y border-t">
              {recentes.slice(0, MESURES_LISTEES).map((mesure) => (
                <li key={mesure.id} className="flex items-center justify-between px-4 py-3 tabular-nums">
                  <span className="text-muted-foreground first-letter:uppercase">{dateCourte(mesure.date)}</span>
                  <span className="font-semibold">{mesure.douleur_matin} / 10</span>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </Section>
    </>
  )
}
