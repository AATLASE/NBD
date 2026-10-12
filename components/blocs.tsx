import { cn } from "cn"
import { ChevronLeft, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { nombre } from "@/lib/format"

// Briques d'affichage partagées par tous les écrans.

export function EnTete({ titre, sousTitre }: { titre: string; sousTitre?: React.ReactNode }) {
  return (
    <header className="space-y-1">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{titre}</h1>
      {sousTitre && <p className="text-muted-foreground">{sousTitre}</p>}
    </header>
  )
}

export function Section({
  titre,
  aside,
  children,
}: {
  titre: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{titre}</h2>
        {aside && <div className="shrink-0 text-sm text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function Carte({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border bg-card", className)} {...props} />
}

const TONS = {
  neutre: "bg-muted text-foreground",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const
export type Ton = keyof typeof TONS

export function Etiquette({
  ton = "neutre",
  className,
  ...props
}: React.ComponentProps<"span"> & { ton?: Ton }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        TONS[ton],
        className
      )}
      {...props}
    />
  )
}

// Pastille d'identité d'une séance : son code, ou son initiale si le code est long.
export function Lettre({ code, className }: { code: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground",
        className
      )}
    >
      {code.length <= 2 ? code : code.charAt(0)}
    </span>
  )
}

export function Stat({
  libelle,
  valeur,
  unite,
}: {
  libelle: string
  valeur: React.ReactNode
  unite?: string
}) {
  return (
    <Carte className="p-4">
      <p className="text-sm text-muted-foreground">{libelle}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
        {valeur}
        {unite && <span className="ml-1 text-base font-medium text-muted-foreground">{unite}</span>}
      </p>
    </Carte>
  )
}

export function Jauge({
  libelle,
  valeur,
  max,
  unite,
}: {
  libelle: string
  valeur: number
  max: number
  unite: string
}) {
  const part = max > 0 ? Math.min(valeur / max, 1) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{libelle}</span>
        <span className="text-muted-foreground tabular-nums">
          <span className="text-xl font-bold text-foreground">{nombre(valeur)}</span> / {nombre(max)} {unite}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={libelle}
        aria-valuenow={valeur}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`${nombre(valeur)} sur ${nombre(max)} ${unite}`}
        className="h-3 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${part})` }}
        />
      </div>
    </div>
  )
}

export function Vide({
  Icone,
  titre,
  children,
}: {
  Icone?: LucideIcon
  titre: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed px-5 py-8 text-center">
      {Icone && <Icone className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />}
      <p className="font-medium">{titre}</p>
      {children && <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

export function Retour({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 font-medium text-brand outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
    >
      <ChevronLeft className="size-5" aria-hidden="true" />
      {children}
    </Link>
  )
}
