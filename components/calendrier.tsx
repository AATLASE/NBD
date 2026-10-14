"use client"

import { cn } from "cn"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Carte } from "@/components/blocs"
import { Button } from "@/components/ui/button"
import { dateLongue, decalerJours, depuisIso, joursEntre, versIso } from "@/lib/format"
import { majuscule } from "@/lib/libelles"

// Calendrier d'un mois, semaines du lundi au dimanche. Chaque date est un bouton : la choisir
// affiche son détail sous le calendrier. Une petite marque sous le numéro résume la journée.

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
const EN_TETES = [
  { court: "L", long: "lundi" },
  { court: "M", long: "mardi" },
  { court: "M", long: "mercredi" },
  { court: "J", long: "jeudi" },
  { court: "V", long: "vendredi" },
  { court: "S", long: "samedi" },
  { court: "D", long: "dimanche" },
]

//   prevu  à venir (ou aujourd'hui), pas encore fait
//   fait   enregistré ce jour-là
//   passe  prévu un jour passé, sans rien d'enregistré
export type Marque = { etat: "prevu" | "fait" | "passe"; libelle?: string; description: string }

export const premierDuMois = (iso: string) => `${iso.slice(0, 7)}-01`

function decalerMois(premier: string, mois: number) {
  const date = depuisIso(premier)
  date.setMonth(date.getMonth() + mois)
  return versIso(date)
}

// Du lundi qui précède le 1er au dimanche qui suit le dernier jour du mois.
function datesAffichees(premier: string) {
  const rang = (iso: string) => (depuisIso(iso).getDay() + 6) % 7
  const debut = decalerJours(premier, -rang(premier))
  const dernier = decalerJours(decalerMois(premier, 1), -1)
  const fin = decalerJours(dernier, 6 - rang(dernier))
  return Array.from({ length: joursEntre(debut, fin) + 1 }, (_, i) => decalerJours(debut, i))
}

const COULEUR_MARQUE = {
  prevu: "text-brand",
  fait: "text-success",
  passe: "text-muted-foreground",
} as const

export function Calendrier({
  mois,
  onMois,
  selection,
  onChoisir,
  aujourdhui,
  marque,
}: {
  // 'AAAA-MM-01' du mois affiché.
  mois: string
  onMois: (mois: string) => void
  selection: string
  onChoisir: (date: string) => void
  aujourdhui: string
  marque: (date: string) => Marque | null
}) {
  const dates = datesAffichees(mois)
  const ailleurs = selection !== aujourdhui || premierDuMois(aujourdhui) !== mois

  return (
    <Carte className="p-3">
      <div className="flex items-center gap-1 pb-2 pl-1">
        <h2 aria-live="polite" className="min-w-0 flex-1 text-lg font-semibold tracking-tight">
          {majuscule(MOIS.format(depuisIso(mois)))}
        </h2>
        {ailleurs && (
          <Button
            variant="ghost"
            className="h-11 px-3 text-sm font-semibold text-brand"
            onClick={() => {
              onChoisir(aujourdhui)
              onMois(premierDuMois(aujourdhui))
            }}
          >
            Aujourd&apos;hui
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-11" aria-label="Mois précédent" onClick={() => onMois(decalerMois(mois, -1))}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Mois suivant" onClick={() => onMois(decalerMois(mois, 1))}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1" role="group" aria-label={MOIS.format(depuisIso(mois))}>
        {EN_TETES.map(({ court, long }) => (
          <abbr
            key={long}
            title={long}
            className="pb-1 text-center text-xs font-semibold text-muted-foreground no-underline"
          >
            {court}
          </abbr>
        ))}

        {dates.map((date) => {
          const choisie = date === selection
          const duJour = date === aujourdhui
          const horsMois = premierDuMois(date) !== mois
          const m = marque(date)
          return (
            <button
              key={date}
              type="button"
              aria-pressed={choisie}
              aria-current={duJour ? "date" : undefined}
              aria-label={`${dateLongue(date)}${duJour ? ", aujourd'hui" : ""}${m ? `, ${m.description}` : ""}`}
              onClick={() => {
                onChoisir(date)
                if (horsMois) onMois(premierDuMois(date))
              }}
              className={cn(
                "flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl py-1 tabular-nums outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
                choisie ? "bg-primary text-primary-foreground" : "active:bg-muted",
                !choisie && duJour && "ring-2 ring-primary ring-inset",
                !choisie && horsMois && "text-muted-foreground/60"
              )}
            >
              <span className={cn("text-base leading-none", duJour || choisie ? "font-bold" : "font-medium")}>
                {Number(date.slice(8))}
              </span>
              <span aria-hidden="true" className="flex h-3.5 items-center">
                {m &&
                  (m.libelle ? (
                    <span
                      className={cn(
                        "text-[0.6875rem] leading-none font-bold",
                        choisie ? "text-primary-foreground" : COULEUR_MARQUE[m.etat]
                      )}
                    >
                      {m.libelle}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "size-1.5 rounded-full bg-current",
                        choisie ? "text-primary-foreground" : COULEUR_MARQUE[m.etat]
                      )}
                    />
                  ))}
              </span>
            </button>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t px-1 pt-3 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
          Prévu
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          Fait
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground" />
          Passé sans rien d&apos;enregistré
        </li>
      </ul>
    </Carte>
  )
}
