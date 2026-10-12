"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

import { BandeauAnnulation } from "@/components/bandeau-annulation"
import { SocleHorsLigne } from "@/components/hors-ligne"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Changer d'onglet réaffiche le cache tout de suite, puis rafraîchit en arrière-plan.
            staleTime: 60_000,
            // Une lecture reste en mémoire, et donc dans la sauvegarde hors ligne, une semaine
            // après son dernier affichage.
            gcTime: 7 * 24 * 3600 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={client}>
      <SocleHorsLigne />
      {children}
      <BandeauAnnulation />
    </QueryClientProvider>
  )
}
