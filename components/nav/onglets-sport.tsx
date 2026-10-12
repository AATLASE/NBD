"use client"

import { useEffect, useSyncExternalStore } from "react"

import { SubTabs, type Onglet } from "@/components/nav/sub-tabs"
import { usePied } from "@/lib/queries"

const ONGLETS: Onglet[] = [
  { href: "/sport", libelle: "Aujourd'hui" },
  { href: "/sport/seances", libelle: "Séances" },
  { href: "/sport/pied", libelle: "Pied" },
  { href: "/sport/course", libelle: "Course" },
  { href: "/sport/progression", libelle: "Progression" },
]

// Dernière réponse connue, gardée sur le téléphone : à l'ouverture, l'onglet Pied est tout de
// suite à sa place (ou absent), au lieu d'apparaître une fraction de seconde plus tard.
const CLE = "nbd:protocole-pied"
const lireMemoire = () => {
  try {
    return window.localStorage.getItem(CLE) === "1"
  } catch {
    return false
  }
}

// L'onglet Pied n'existe que pour un compte qui a un protocole pied.
export function OngletsSport() {
  const pied = usePied()
  const memoire = useSyncExternalStore(
    () => () => {},
    lireMemoire,
    () => false
  )
  const aUnProtocole = pied.data ? pied.data.items.length > 0 : memoire

  useEffect(() => {
    if (!pied.data) return
    try {
      window.localStorage.setItem(CLE, pied.data.items.length > 0 ? "1" : "0")
    } catch {
      // Stockage indisponible : l'onglet apparaîtra simplement après le chargement.
    }
  }, [pied.data])

  return (
    <SubTabs
      libelle="Section Sport"
      onglets={aUnProtocole ? ONGLETS : ONGLETS.filter((onglet) => onglet.href !== "/sport/pied")}
    />
  )
}
