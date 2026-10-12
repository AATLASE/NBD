import { History } from "lucide-react"
import Link from "next/link"

// Accès à l'historique des modifications, depuis chaque écran qu'on peut modifier.
export function LienHistorique() {
  return (
    <Link
      href="/historique"
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 font-medium text-brand outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
    >
      <History className="size-5" aria-hidden="true" />
      Historique
    </Link>
  )
}
