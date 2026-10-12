"use client"

import { useSyncExternalStore } from "react"

// Les cases cochées du protocole pied, pour la journée en cours, sur ce téléphone.
// La base ne retient qu'un seul booléen par jour (foot_logs.protocole_fait) : il passe à vrai
// quand toutes les cases du jour sont cochées. Le détail case par case reste local.

type Etat = { date: string; faits: string[] }

const CLE = "nbd:protocole-du-jour"
const VIDE: string[] = []
const abonnes = new Set<() => void>()
let cache: Etat | null | undefined

function charger(): Etat | null {
  try {
    const brut = window.localStorage.getItem(CLE)
    return brut ? (JSON.parse(brut) as Etat) : null
  } catch {
    return null
  }
}

export function ecrireProtocoleDuJour(date: string, faits: string[]) {
  cache = { date, faits }
  try {
    window.localStorage.setItem(CLE, JSON.stringify(cache))
  } catch {
    // Stockage indisponible : les cases tiennent le temps de l'onglet.
  }
  abonnes.forEach((rappel) => rappel())
}

// Les identifiants cochés aujourd'hui. Les cases d'un autre jour ne comptent plus.
export function useProtocoleDuJour(date: string | null): string[] {
  const etat = useSyncExternalStore(
    (rappel) => {
      abonnes.add(rappel)
      return () => abonnes.delete(rappel)
    },
    () => {
      if (cache === undefined) cache = charger()
      return cache
    },
    () => null
  )
  return etat && etat.date === date ? etat.faits : VIDE
}
