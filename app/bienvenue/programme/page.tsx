"use client"

import { Check, RefreshCw, Sparkles, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"

import { Carte, EnTete, Lettre, Section, Stat } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { macros } from "@/components/nutrition/repas"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEdition } from "@/lib/edition"
import { charge, nombre, prescription } from "@/lib/format"
import { LIBELLE_LIEU, LIBELLE_SLOT, SLOTS, majuscule } from "@/lib/libelles"
import { adopterPlanNutrition, adopterProgrammeSport } from "@/lib/mutations"
import type { PropositionNutrition, PropositionSport } from "@/lib/proposition/schemas"
import { useProfil, useQuotaIa } from "@/lib/queries"

// État d'une des deux propositions (sport ou nutrition).
type Etat<T> =
  | { phase: "attente" }
  | { phase: "chargement" }
  | { phase: "prete"; proposition: T; retires: string[] }
  | { phase: "erreur"; message: string }
  | { phase: "adoptee"; combien: number }

type Reponse<T> = { ok: true; proposition: T; retires: string[] } | { ok: false; message: string }

async function demander<T>(sujet: "sport" | "nutrition"): Promise<Reponse<T>> {
  try {
    const reponse = await fetch(`/api/proposition/${sujet}`, { method: "POST" })
    return (await reponse.json()) as Reponse<T>
  } catch {
    return { ok: false, message: "Pas de réseau. Vérifie ta connexion et réessaie." }
  }
}

const CODES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

// La lecture du paramètre d'adresse impose cette barrière sur une page rendue à l'avance.
export default function PageProposition() {
  return (
    <Suspense>
      <Proposition />
    </Suspense>
  )
}

// Écran qui suit le questionnaire d'accueil : une proposition de programme et une proposition de
// plan nutritif, fabriquées à partir des réponses. Rien n'est écrit tant qu'on n'adopte pas.
function Proposition() {
  const router = useRouter()
  const auto = useSearchParams().get("auto") === "1"
  const profil = useProfil()
  const quota = useQuotaIa()
  const queryClient = useQueryClient()
  const { executer, enCours } = useEdition()
  const [sport, setSport] = useState<Etat<PropositionSport>>({ phase: "attente" })
  const [nutrition, setNutrition] = useState<Etat<PropositionNutrition>>({ phase: "attente" })

  async function proposerSport() {
    setSport({ phase: "chargement" })
    const reponse = await demander<PropositionSport>("sport")
    setSport(reponse.ok ? { phase: "prete", ...reponse } : { phase: "erreur", message: reponse.message })
    void queryClient.invalidateQueries({ queryKey: ["quota-ia"] })
  }
  async function proposerNutrition() {
    setNutrition({ phase: "chargement" })
    const reponse = await demander<PropositionNutrition>("nutrition")
    setNutrition(reponse.ok ? { phase: "prete", ...reponse } : { phase: "erreur", message: reponse.message })
    void queryClient.invalidateQueries({ queryKey: ["quota-ia"] })
  }

  // En arrivant du questionnaire, les deux propositions partent toutes seules, une seule fois.
  const lance = useRef(false)
  const pret = profil.data != null && profil.data.accueil_fait_le !== null
  useEffect(() => {
    if (!auto || !pret || lance.current) return
    lance.current = true
    void proposerSport()
    void proposerNutrition()
    // Lancement unique, protégé par `lance` : les deux fonctions n'ont pas à le redéclencher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, pret])

  const questionnaireAFaire = profil.data != null && profil.data.accueil_fait_le === null
  useEffect(() => {
    if (questionnaireAFaire) router.replace("/bienvenue")
  }, [questionnaireAFaire, router])

  if (!profil.data || questionnaireAFaire) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 pt-[calc(2rem+env(safe-area-inset-top))]">
        <Attente requetes={[profil]} />
      </main>
    )
  }

  const { objectif_kcal: kcal, objectif_proteines_g: proteines, aliments_exclus: exclus } = profil.data

  // Demandes IA du mois. Une limite vide veut dire illimité : on n'affiche alors rien.
  const limite = quota.data?.limite ?? null
  const restantes = limite === null ? null : Math.max(0, limite - (quota.data?.utilisees ?? 0))
  const epuise = restantes === 0

  async function adopterSport(proposition: PropositionSport) {
    const resultat = await executer(() => adopterProgrammeSport(proposition))
    if (resultat.ok) setSport({ phase: "adoptee", combien: proposition.seances.length })
  }
  async function adopterNutrition(proposition: PropositionNutrition) {
    const resultat = await executer(() => adopterPlanNutrition(proposition))
    if (resultat.ok) setNutrition({ phase: "adoptee", combien: proposition.plats.length })
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-8 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <EnTete
        titre="Ta proposition"
        sousTitre="Faite à partir de tes réponses. Adopte ce qui te convient, tu pourras tout modifier ensuite."
      />

      {restantes !== null && (
        <p
          className={
            epuise
              ? "rounded-2xl bg-warning-soft px-4 py-3 leading-snug"
              : "text-sm text-muted-foreground tabular-nums"
          }
        >
          {epuise
            ? `Tu as utilisé tes ${limite} propositions de ce mois. Elles reviennent le mois prochain ; un abonnement permettra bientôt d'en avoir davantage.`
            : `Il te reste ${restantes} proposition${restantes > 1 ? "s" : ""} sur ${limite} ce mois-ci. Un programme en utilise une, un plan nutritif aussi.`}
        </p>
      )}

      <Section titre="Programme de sport">
        {sport.phase === "attente" && (
          <Invitation
            texte="Un programme de départ, adapté à tes objectifs, ton niveau et ton matériel."
            action="Me proposer un programme"
            bloque={epuise}
            onClick={proposerSport}
          />
        )}
        {sport.phase === "chargement" && <Preparation texte="On prépare ton programme. Cela peut prendre une minute." />}
        {sport.phase === "erreur" && <Echec message={sport.message} onReessayer={proposerSport} />}
        {sport.phase === "adoptee" && (
          <Adoptee
            texte={`Programme adopté : ${sport.combien} séance${sport.combien > 1 ? "s" : ""}`}
            lien="/sport/seances"
            libelle="Voir mes séances"
          />
        )}
        {sport.phase === "prete" && (
          <>
            <p className="rounded-2xl bg-brand-soft px-4 py-3 leading-snug">{sport.proposition.conseils}</p>
            {sport.retires.length > 0 && (
              <Remarque texte={`Retiré de la proposition, faute de matériel : ${sport.retires.join(", ")}.`} />
            )}
            <ol className="space-y-3">
              {sport.proposition.seances.map((seance, index) => (
                <li key={index}>
                  <Carte className="overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <Lettre code={CODES[index] ?? "S"} />
                      <div className="min-w-0">
                        <h3 className="leading-snug font-semibold">{seance.nom}</h3>
                        <p className="text-sm text-muted-foreground">
                          {majuscule(seance.jour)} · {seance.duree_min} min · {LIBELLE_LIEU[seance.lieu]}
                        </p>
                      </div>
                    </div>
                    {seance.note && (
                      <p className="border-t px-4 py-3 text-sm leading-snug text-muted-foreground">{seance.note}</p>
                    )}
                    <ul className="divide-y border-t">
                      {seance.exercices.map((exercice, rang) => (
                        <li key={rang} className="space-y-0.5 px-4 py-2.5">
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="leading-snug font-medium">{exercice.nom}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{prescription(exercice)}</span>
                          </p>
                          {charge(exercice) && (
                            <p className="text-sm text-muted-foreground tabular-nums">{charge(exercice)}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Carte>
                </li>
              ))}
            </ol>
            <Choix
              adopter="Adopter ce programme"
              sansAutre={epuise}
              enCours={enCours}
              onAdopter={() => adopterSport(sport.proposition)}
              onAutre={proposerSport}
            />
          </>
        )}
      </Section>

      <Section titre="Plan nutritif">
        {kcal !== null && proteines !== null && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat libelle="Calories par jour" valeur={nombre(kcal)} unite="kcal" />
              <Stat libelle="Protéines par jour" valeur={proteines} unite="g" />
            </div>
            <p className="-mt-1 text-sm text-muted-foreground">
              Cibles estimées d&apos;après ton poids, ta taille, ton âge, ton rythme d&apos;entraînement et tes
              objectifs. Ce sont des repères, pas une prescription médicale.
            </p>
          </>
        )}

        {nutrition.phase === "attente" && (
          <Invitation
            texte="Une base de plats qui respecte ton régime et tes cibles, répartie sur deux semaines de menus."
            action="Me proposer un plan nutritif"
            bloque={epuise}
            onClick={proposerNutrition}
          />
        )}
        {nutrition.phase === "chargement" && (
          <Preparation texte="On compose tes plats. Cela peut prendre une minute." />
        )}
        {nutrition.phase === "erreur" && <Echec message={nutrition.message} onReessayer={proposerNutrition} />}
        {nutrition.phase === "adoptee" && (
          <Adoptee
            texte={`Plan adopté : ${nutrition.combien} plat${nutrition.combien > 1 ? "s" : ""}, menus remplis`}
            lien="/nutrition/menus"
            libelle="Voir mes menus"
          />
        )}
        {nutrition.phase === "prete" && (
          <>
            <p className="rounded-2xl bg-brand-soft px-4 py-3 leading-snug">{nutrition.proposition.conseils}</p>
            {exclus.length > 0 && (
              <Remarque
                texte={`Tu as indiqué : ${exclus.join(", ")}. Ces plats ont été composés et vérifiés pour les éviter, mais la vérification ne remplace pas ta lecture : en cas d'allergie, relis toujours les ingrédients.`}
              />
            )}
            {nutrition.retires.length > 0 && (
              <Remarque texte={`Retiré de la proposition : ${nutrition.retires.join(" ; ")}.`} />
            )}
            {SLOTS.map((slot) => {
              const plats = nutrition.proposition.plats.filter((plat) => plat.slot === slot)
              return (
                plats.length > 0 && (
                  <Carte key={slot}>
                    <h3 className="px-4 pt-4 pb-1 text-sm font-semibold text-brand">{LIBELLE_SLOT[slot]}</h3>
                    <ul className="divide-y">
                      {plats.map((plat, rang) => (
                        <li key={rang} className="space-y-0.5 px-4 py-2.5">
                          <p className="leading-snug font-medium">{plat.nom}</p>
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {macros(plat)} · {plat.temps_min} min
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Carte>
                )
              )
            })}
            <Choix
              adopter="Adopter ce plan"
              sansAutre={epuise}
              enCours={enCours}
              onAdopter={() => adopterNutrition(nutrition.proposition)}
              onAutre={proposerNutrition}
            />
          </>
        )}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href="/sport"
          className={buttonVariants({
            variant: sport.phase === "adoptee" || nutrition.phase === "adoptee" ? "default" : "outline",
            className: "mx-auto flex h-14 w-full max-w-lg text-lg font-semibold",
          })}
        >
          {sport.phase === "adoptee" || nutrition.phase === "adoptee"
            ? "Aller à l'application"
            : "Continuer sans proposition"}
        </Link>
      </div>
    </main>
  )
}

function Invitation({
  texte,
  action,
  bloque,
  onClick,
}: {
  texte: string
  action: string
  bloque: boolean
  onClick: () => void
}) {
  return (
    <Carte className="space-y-4 p-4">
      <p className="leading-snug text-muted-foreground">{texte}</p>
      <Button className="h-12 w-full gap-2 text-base font-semibold" disabled={bloque} onClick={onClick}>
        <Sparkles className="size-5" aria-hidden="true" />
        {action}
      </Button>
    </Carte>
  )
}

function Preparation({ texte }: { texte: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <p className="font-medium">{texte}</p>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  )
}

function Echec({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <Carte className="space-y-4 border-danger/40 p-4">
      <p role="alert" className="flex gap-2 leading-snug font-medium text-danger">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        {message}
      </p>
      <Button variant="outline" className="h-12 w-full gap-2 text-base" onClick={onReessayer}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Réessayer
      </Button>
      <p className="text-sm text-muted-foreground">
        Tu peux aussi continuer et construire toi-même, exercice par exercice.
      </p>
    </Carte>
  )
}

function Adoptee({ texte, lien, libelle }: { texte: string; lien: string; libelle: string }) {
  return (
    <Carte className="flex items-center gap-3 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
        <Check className="size-5" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 leading-snug font-semibold">{texte}</p>
      <Link
        href={lien}
        className="inline-flex h-11 shrink-0 items-center rounded-lg px-2 font-medium text-brand outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {libelle}
      </Link>
    </Carte>
  )
}

function Remarque({ texte }: { texte: string }) {
  return (
    <p className="flex gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm leading-snug text-warning">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="text-foreground">{texte}</span>
    </p>
  )
}

function Choix({
  adopter,
  sansAutre,
  enCours,
  onAdopter,
  onAutre,
}: {
  adopter: string
  // Quota du mois épuisé : on ne peut plus demander d'autre proposition.
  sansAutre: boolean
  enCours: boolean
  onAdopter: () => void
  onAutre: () => void
}) {
  return (
    <div className="space-y-2">
      <Button className="h-14 w-full gap-2 text-lg font-semibold" disabled={enCours} onClick={onAdopter}>
        <Check className="size-5" aria-hidden="true" />
        {adopter}
      </Button>
      {!sansAutre && (
        <Button variant="outline" className="h-12 w-full gap-2 text-base" disabled={enCours} onClick={onAutre}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Autre proposition
        </Button>
      )}
    </div>
  )
}
