"use client"

import { useSyncExternalStore } from "react"

import { versIso } from "@/lib/format"

const abonner = () => () => {}

// La date du jour n'existe que sur le téléphone : `null` pendant le rendu serveur,
// pour ne jamais afficher le jour du serveur (UTC) à la place de celui de l'utilisateur.
export function useAujourdhui(): string | null {
  return useSyncExternalStore(
    abonner,
    () => versIso(new Date()),
    () => null
  )
}
