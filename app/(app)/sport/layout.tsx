import type { Metadata } from "next"

import { OngletsSport } from "@/components/nav/onglets-sport"

export const metadata: Metadata = { title: "Sport" }

export default function SportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OngletsSport />
      <main className="mx-auto w-full max-w-lg space-y-8 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </>
  )
}
