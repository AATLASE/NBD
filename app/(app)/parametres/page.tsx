"use client"

import {
  ChevronRight,
  Dumbbell,
  History,
  LogOut,
  Pencil,
  Ruler,
  ShoppingBasket,
  Sparkles,
  Target,
  Utensils,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { seDeconnecter } from "@/app/login/actions"
import { Carte, EnTete, Section } from "@/components/blocs"
import { AvatarCoach } from "@/components/coach/avatar"
import { Attente } from "@/components/etats"
import { EditeurProfil, type Profil, type Sujet } from "@/components/parametres/editeurs"
import { Button } from "@/components/ui/button"
import { COACH, estUnCoach } from "@/lib/coachs"
import { nombre } from "@/lib/format"
import {
  LIBELLE_LIEU_ENTRAINEMENT,
  LIBELLE_NIVEAU,
  LIBELLE_OBJECTIF,
  LIBELLE_REGIME,
  type LieuEntrainement,
  type Niveau,
  type Objectif,
  type Regime,
} from "@/lib/libelles"
import { useEmail, useProfil, useQuotaIa } from "@/lib/queries"

const A_RENSEIGNER = "À renseigner"

// Tout ce qui se règle une fois et sert partout : objectifs du jour, profil, budget, compte.
// Chaque ligne dit sa valeur actuelle et ouvre sa feuille de modification.
export default function Parametres() {
  const profil = useProfil()
  const quota = useQuotaIa()
  const email = useEmail()
  const [sujet, setSujet] = useState<Sujet | null>(null)

  if (!profil.data) return <Attente requetes={[profil]} />
  const p = profil.data

  return (
    <>
      <EnTete titre="Paramètres" sousTitre={email.data ?? undefined} />

      <Section titre="Mon coach">
        <button
          type="button"
          onClick={() => setSujet("coach")}
          className="flex min-h-20 w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
        >
          {estUnCoach(p.coach) ? (
            <>
              <AvatarCoach coach={p.coach} className="size-14 rounded-2xl" />
              <span className="min-w-0 flex-1">
                <span className="block text-lg leading-tight font-bold">{COACH[p.coach].nom}</span>
                <span className="block text-sm text-muted-foreground">
                  {COACH[p.coach].titre} · appuie pour en changer
                </span>
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block leading-snug font-semibold">Choisir mon coach</span>
              <span className="block text-sm text-muted-foreground">
                Quatre caractères, quatre façons de te répondre et de te motiver.
              </span>
            </span>
          )}
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </Section>

      <Section titre="Objectifs du jour">
        <Carte className="overflow-hidden">
          <dl className="grid grid-cols-2">
            <Cible libelle="Calories" valeur={p.objectif_kcal} unite="kcal" className="border-r border-b" />
            <Cible libelle="Protéines" valeur={p.objectif_proteines_g} unite="g" className="border-b" />
            <Cible libelle="Lipides" valeur={p.objectif_lipides_g} unite="g" className="border-r" />
            <Cible libelle="Glucides" valeur={p.objectif_glucides_g} unite="g" />
          </dl>
        </Carte>
        <Button variant="outline" className="h-12 w-full gap-2 text-base font-semibold" onClick={() => setSujet("nutrition")}>
          <Pencil className="size-4" aria-hidden="true" />
          Modifier mes objectifs
        </Button>
      </Section>

      <Section titre="Mon profil">
        <Carte>
          <ul className="divide-y">
            <Ligne Icone={Ruler} titre="Mensurations" valeur={mensurations(p)} onClick={() => setSujet("mensurations")} />
            <Ligne Icone={Target} titre="Mes objectifs" valeur={objectifs(p)} onClick={() => setSujet("objectifs")} />
            <Ligne Icone={Dumbbell} titre="Entraînement" valeur={entrainement(p)} onClick={() => setSujet("entrainement")} />
            <Ligne Icone={Utensils} titre="Alimentation" valeur={alimentation(p)} onClick={() => setSujet("alimentation")} />
          </ul>
        </Carte>
      </Section>

      <Section titre="Courses">
        <Carte>
          <ul>
            <Ligne
              Icone={ShoppingBasket}
              titre="Budget par semaine"
              valeur={p.budget_courses_eur === null ? "Non fixé" : `${nombre(p.budget_courses_eur)} €`}
              onClick={() => setSujet("budget")}
            />
          </ul>
        </Carte>
      </Section>

      <Section titre="Assistant">
        <Carte>
          <ul className="divide-y">
            <Ligne
              Icone={Sparkles}
              titre="Me proposer un nouveau programme"
              valeur={
                !quota.data
                  ? "Programme de sport ou plan nutritif, d'après ton profil"
                  : quota.data.limite === null
                    ? "Demandes illimitées"
                    : `${quota.data.utilisees} demande${quota.data.utilisees > 1 ? "s" : ""} sur ${quota.data.limite} utilisée${quota.data.utilisees > 1 ? "s" : ""} ce mois-ci`
              }
              href="/bienvenue/programme"
            />
          </ul>
        </Carte>
      </Section>

      <Section titre="Compte">
        <Carte>
          <ul className="divide-y">
            <Ligne
              Icone={History}
              titre="Historique des modifications"
              valeur="Tout ce qui a changé, avec le bouton pour annuler"
              href="/historique"
            />
          </ul>
        </Carte>
        <form action={seDeconnecter}>
          <Button type="submit" variant="outline" className="h-12 w-full gap-2 text-base font-semibold text-danger">
            <LogOut className="size-5" aria-hidden="true" />
            Se déconnecter
          </Button>
        </form>
      </Section>

      <EditeurProfil profil={p} sujet={sujet} onFermer={() => setSujet(null)} />
    </>
  )
}

function Cible({
  libelle,
  valeur,
  unite,
  className,
}: {
  libelle: string
  valeur: number | null
  unite: string
  className?: string
}) {
  return (
    <div className={`p-4 ${className ?? ""}`}>
      <dt className="text-sm text-muted-foreground">{libelle}</dt>
      <dd className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
        {valeur === null ? (
          <span className="text-base font-medium text-muted-foreground">{A_RENSEIGNER}</span>
        ) : (
          <>
            {nombre(valeur)}
            <span className="ml-1 text-base font-medium text-muted-foreground">{unite}</span>
          </>
        )}
      </dd>
    </div>
  )
}

const CONTENU_LIGNE =
  "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:bg-muted active:bg-muted"

function Ligne({
  Icone,
  titre,
  valeur,
  onClick,
  href,
}: {
  Icone: LucideIcon
  titre: string
  valeur: string
  onClick?: () => void
  href?: string
}) {
  const contenu = (
    <>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"
      >
        <Icone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-semibold">{titre}</span>
        <span className="block text-sm leading-snug text-muted-foreground">{valeur}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  )
  return (
    <li className="first:*:rounded-t-2xl last:*:rounded-b-2xl">
      {href ? (
        <Link href={href} className={CONTENU_LIGNE}>
          {contenu}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={CONTENU_LIGNE}>
          {contenu}
        </button>
      )}
    </li>
  )
}

// --- Résumés affichés sur chaque ligne ---------------------------------------------------------

function mensurations(p: Profil) {
  const morceaux = [
    p.poids_initial_kg !== null && `${nombre(p.poids_initial_kg)} kg`,
    p.taille_cm !== null && `${p.taille_cm} cm`,
    p.age !== null && `${p.age} ans`,
  ].filter(Boolean)
  return morceaux.length > 0 ? morceaux.join(" · ") : A_RENSEIGNER
}

function objectifs(p: Profil) {
  const choisis = p.objectifs.map((o) => LIBELLE_OBJECTIF[o as Objectif] ?? o)
  const morceaux = [...choisis, p.contrainte_medicale].filter(Boolean)
  return morceaux.length > 0 ? morceaux.join(" · ") : "À choisir"
}

function entrainement(p: Profil) {
  const morceaux = [
    p.seances_par_semaine !== null && `${p.seances_par_semaine} séances par semaine`,
    p.niveau && (LIBELLE_NIVEAU[p.niveau as Niveau] ?? p.niveau),
    ...(p.lieux_entrainement ?? []).map((l) => LIBELLE_LIEU_ENTRAINEMENT[l as LieuEntrainement] ?? l),
  ].filter(Boolean)
  return morceaux.length > 0 ? morceaux.join(" · ") : A_RENSEIGNER
}

function alimentation(p: Profil) {
  const exclus = p.aliments_exclus.length
  const morceaux = [
    p.regime && (LIBELLE_REGIME[p.regime as Regime] ?? p.regime),
    exclus > 0 && `${exclus} aliment${exclus > 1 ? "s" : ""} exclu${exclus > 1 ? "s" : ""}`,
  ].filter(Boolean)
  return morceaux.length > 0 ? morceaux.join(" · ") : A_RENSEIGNER
}
