"use client"

import Link from "next/link"

import { nombre } from "@/lib/format"
import { useJournalRepas, useJournalSeances, useMesures, useProfil, useRepas, useSeances } from "@/lib/queries"
import { lundiDe } from "@/lib/suivi"

// Les trois chiffres qu'on vient chercher en ouvrant l'application, sur l'écran d'accueil :
// où en est la semaine de sport, ce qui a été mangé aujourd'hui, le dernier poids.
// Chaque repère mène à l'écran qui le détaille. Un tiret tient la place d'une donnée absente.
export function Reperes({ aujourdhui }: { aujourdhui: string }) {
  const seances = useSeances()
  const journalSeances = useJournalSeances()
  const journalRepas = useJournalRepas()
  const repas = useRepas()
  const mesures = useMesures()
  const profil = useProfil()

  const lundi = lundiDe(aujourdhui)
  const faites = journalSeances.data?.filter((log) => log.date >= lundi && log.date <= aujourdhui).length
  const prevues = seances.data?.filter((s) => s.jour_suggere !== null).length ?? 0

  const kcalParPlat = new Map((repas.data ?? []).map((plat) => [plat.id, plat.kcal]))
  const kcal = journalRepas.data
    ?.filter((log) => log.date === aujourdhui)
    .reduce((total, log) => total + (log.kcal_reel ?? (log.meal_id ? (kcalParPlat.get(log.meal_id) ?? 0) : 0)), 0)
  const cible = profil.data?.objectif_kcal ?? null

  const pesee = mesures.data?.find((m) => m.poids_kg !== null)

  return (
    <ul aria-label="Repères du jour" className="grid grid-cols-3 gap-2">
      <Repere
        href="/sport/progression"
        libelle="Séances"
        valeur={faites === undefined ? null : String(faites)}
        unite={prevues > 0 ? `/ ${prevues}` : undefined}
        detail="cette semaine"
      />
      <Repere
        href="/nutrition"
        libelle="Calories"
        valeur={kcal === undefined ? null : nombre(kcal)}
        detail={cible !== null ? `sur ${nombre(cible)} kcal` : "kcal aujourd'hui"}
      />
      <Repere
        href="/sport/progression"
        libelle="Poids"
        valeur={pesee?.poids_kg != null ? nombre(pesee.poids_kg) : null}
        unite={pesee ? "kg" : undefined}
        detail={pesee ? "dernière pesée" : "aucune pesée"}
      />
    </ul>
  )
}

function Repere({
  href,
  libelle,
  valeur,
  unite,
  detail,
}: {
  href: string
  libelle: string
  valeur: string | null
  unite?: string
  detail: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full min-h-24 flex-col rounded-2xl border bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <span className="text-sm font-medium text-muted-foreground">{libelle}</span>
        <span className="text-2xl leading-tight font-bold tracking-tight tabular-nums">
          {valeur ?? "–"}
          {valeur !== null && unite && (
            <span className="ml-1 text-sm font-medium tracking-normal text-muted-foreground">{unite}</span>
          )}
        </span>
        <span className="mt-auto text-xs leading-snug text-muted-foreground">{detail}</span>
      </Link>
    </li>
  )
}
