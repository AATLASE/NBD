import type { Metadata } from "next"

export const metadata: Metadata = { title: "Paramètres" }

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg space-y-8 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {children}
    </main>
  )
}
