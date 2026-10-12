import type { Metadata } from "next"

import { GardeAccueil } from "@/components/garde-accueil"

export const metadata: Metadata = { title: "Séance en cours" }

// Plein écran : ni barre de navigation ni sous-onglets pendant une séance.
export default function ExecutionLayout({ children }: { children: React.ReactNode }) {
  return <GardeAccueil>{children}</GardeAccueil>
}
