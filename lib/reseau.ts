"use client"

import { useSyncExternalStore } from "react"

function abonner(rappel: () => void) {
  window.addEventListener("online", rappel)
  window.addEventListener("offline", rappel)
  return () => {
    window.removeEventListener("online", rappel)
    window.removeEventListener("offline", rappel)
  }
}

// Vrai tant que le téléphone se dit connecté. Côté serveur, on suppose le réseau présent.
export function useEnLigne() {
  return useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    () => true
  )
}

export const horsLigne = () => typeof navigator !== "undefined" && !navigator.onLine
