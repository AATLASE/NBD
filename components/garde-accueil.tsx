"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { useProfil } from "@/lib/queries"

// Un compte qui n'a pas encore répondu au questionnaire d'accueil y est conduit,
// quelle que soit l'adresse par laquelle il arrive.
export function GardeAccueil({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const profil = useProfil()
  // Seulement d'après un profil à jour : celui gardé sur le téléphone peut dater d'avant le
  // questionnaire, s'il a été rempli depuis un autre appareil. On attend alors sa relecture.
  const aFaire = !profil.isStale && profil.data != null && profil.data.accueil_fait_le === null

  useEffect(() => {
    if (aFaire) router.replace("/bienvenue")
  }, [aFaire, router])

  // Rien de l'application ne s'affiche le temps de la redirection.
  return aFaire ? null : children
}
