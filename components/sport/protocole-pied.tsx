import { cn } from "cn"
import { Check } from "lucide-react"

import { Carte } from "@/components/blocs"
import { LIBELLE_MOMENT, MOMENTS } from "@/lib/libelles"
import type { Tables } from "@/lib/database.types"

type Item = Tables<"foot_protocol_items">
type Palier = Tables<"foot_progression">

export function palierDeLaSemaine(paliers: Palier[], itemId: string, semaine: number) {
  const propres = paliers.filter((p) => p.protocol_item_id === itemId)
  return (
    propres.find((p) => semaine >= p.semaine_debut && semaine <= p.semaine_fin) ??
    // Au-delà du dernier palier défini, on reste sur le dernier.
    propres.findLast((p) => semaine > p.semaine_fin) ??
    null
  )
}

// Les exercices du protocole prévus un jour donné.
export function itemsDuJour(items: Item[], avecJourSurDeux: boolean) {
  return items.filter((item) => avecJourSurDeux || item.moment !== "jour_sur_deux")
}

// Le protocole groupé par moment de la journée. Pour un exercice à progression,
// le dosage affiché est celui du palier de la semaine en cours.
// Avec `coches` et `onBasculer`, chaque exercice devient une case à cocher.
export function ProtocolePied({
  items,
  paliers,
  semaine,
  coches,
  onBasculer,
}: {
  items: Item[]
  paliers: Palier[]
  semaine: number
  coches?: string[]
  onBasculer?: (itemId: string) => void
}) {
  const groupes = MOMENTS.map((moment) => ({
    moment,
    items: items.filter((item) => item.moment === moment),
  })).filter((groupe) => groupe.items.length > 0)

  return (
    <Carte className="divide-y">
      {groupes.map(({ moment, items }) => (
        <div key={moment} className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-brand">{LIBELLE_MOMENT[moment] ?? moment}</h3>
          <ul className={onBasculer ? "space-y-1" : "space-y-3"}>
            {items.map((item) => {
              const dosage = palierDeLaSemaine(paliers, item.id, semaine)?.dosage ?? item.dosage
              const texte = (
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block leading-snug">{item.exercice}</span>
                  <span className="block text-sm font-medium text-muted-foreground tabular-nums">
                    {dosage}
                  </span>
                </span>
              )

              if (!onBasculer) return <li key={item.id}>{texte}</li>

              const fait = coches?.includes(item.id) ?? false
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={fait}
                    onClick={() => onBasculer(item.id)}
                    className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors duration-150",
                        fait ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      )}
                    >
                      {fait && <Check className="size-5" strokeWidth={3} />}
                    </span>
                    {texte}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </Carte>
  )
}
