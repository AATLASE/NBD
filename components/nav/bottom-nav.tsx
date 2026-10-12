"use client"

import { cn } from "cn"
import { Dumbbell, MessageCircle, Utensils, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const ENTREES: { href: string; libelle: string; Icone: LucideIcon }[] = [
  { href: "/sport", libelle: "Sport", Icone: Dumbbell },
  { href: "/nutrition", libelle: "Nutrition", Icone: Utensils },
  { href: "/chat", libelle: "Chat", Icone: MessageCircle },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {ENTREES.map(({ href, libelle, Icone }) => {
          const actif = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "group flex h-16 flex-col items-center justify-center gap-1 text-xs outline-none",
                  actif ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-16 items-center justify-center rounded-full transition-colors duration-150 group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                    actif ? "bg-primary text-primary-foreground" : "group-active:bg-muted"
                  )}
                >
                  <Icone className="size-5" aria-hidden="true" />
                </span>
                {libelle}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
