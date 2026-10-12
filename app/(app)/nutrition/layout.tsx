import type { Metadata } from "next"

import { SubTabs, type Onglet } from "@/components/nav/sub-tabs"

export const metadata: Metadata = { title: "Nutrition" }

const ONGLETS: Onglet[] = [
  { href: "/nutrition", libelle: "Aujourd'hui" },
  { href: "/nutrition/menus", libelle: "Menus" },
  { href: "/nutrition/recettes", libelle: "Recettes" },
  { href: "/nutrition/courses", libelle: "Courses" },
  { href: "/nutrition/suivi", libelle: "Suivi" },
]

export default function NutritionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubTabs libelle="Section Nutrition" onglets={ONGLETS} />
      <main className="mx-auto w-full max-w-lg space-y-8 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </>
  )
}
