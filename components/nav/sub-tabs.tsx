"use client"

import { cn } from "cn"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

export type Onglet = { href: string; libelle: string }

// Sous-onglets d'une section, collés en haut, défilables horizontalement.
// Le premier onglet est la racine de la section : il n'est actif que sur son adresse exacte.
export function SubTabs({ libelle, onglets }: { libelle: string; onglets: Onglet[] }) {
  const pathname = usePathname()
  const actifRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    actifRef.current?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [pathname])

  return (
    <nav
      aria-label={libelle}
      className="sticky top-0 z-30 border-b bg-background pt-[env(safe-area-inset-top)]"
    >
      <ul className="scrollbar-none mx-auto flex max-w-lg overflow-x-auto px-2">
        {onglets.map(({ href, libelle }, index) => {
          const actif =
            index === 0 ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="shrink-0">
              <Link
                ref={actif ? actifRef : undefined}
                href={href}
                aria-current={actif ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center px-3 text-[0.9375rem] whitespace-nowrap outline-none focus-visible:bg-muted",
                  actif ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                )}
              >
                {libelle}
                {actif && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
                  />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
