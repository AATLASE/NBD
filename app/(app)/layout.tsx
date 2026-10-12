import { GardeAccueil } from "@/components/garde-accueil"
import { PreparationHorsLigne } from "@/components/hors-ligne"
import { BottomNav } from "@/components/nav/bottom-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GardeAccueil>
      {children}
      <BottomNav />
      <PreparationHorsLigne />
    </GardeAccueil>
  )
}
