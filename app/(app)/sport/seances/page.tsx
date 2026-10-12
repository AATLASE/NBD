"use client"

import { Dumbbell, Plus } from "lucide-react"
import { useRouter } from "next/navigation"

import { EnTete, Section, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { LienHistorique } from "@/components/lien-historique"
import { CarteSeance } from "@/components/sport/seance"
import { Button } from "@/components/ui/button"
import { useEdition } from "@/lib/edition"
import { creerSeance } from "@/lib/mutations"
import { useSeances } from "@/lib/queries"

export default function Seances() {
  const seances = useSeances()
  const router = useRouter()
  const { executer, enCours } = useEdition()

  async function nouvelle() {
    const resultat = await executer(creerSeance)
    if (resultat.ok && resultat.id) router.push(`/sport/seances/${resultat.id}?edition=1`)
  }

  if (!seances.data) return <Attente requetes={[seances]} />

  // Les séances rattachées à un jour forment la semaine type ; les autres sont des solutions de repli.
  const planifiees = seances.data.filter((s) => s.jour_suggere !== null)
  const libres = seances.data.filter((s) => s.jour_suggere === null)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EnTete
          titre="Séances"
          sousTitre={`${planifiees.length} séance${planifiees.length > 1 ? "s" : ""} par semaine`}
        />
        <LienHistorique />
      </div>

      {seances.data.length === 0 && (
        <Vide Icone={Dumbbell} titre="Aucune séance">
          Crée ta première séance avec le bouton ci-dessous, puis ajoute-lui des exercices.
        </Vide>
      )}

      {planifiees.length > 0 && (
        <ul className="space-y-3">
          {planifiees.map((seance) => (
            <li key={seance.id}>
              <CarteSeance seance={seance} />
            </li>
          ))}
        </ul>
      )}

      {libres.length > 0 && (
        <Section titre="Sans jour fixe">
          <ul className="space-y-3">
            {libres.map((seance) => (
              <li key={seance.id}>
                <CarteSeance seance={seance} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Button
        variant="outline"
        className="h-14 w-full gap-2 text-base font-semibold"
        disabled={enCours}
        onClick={nouvelle}
      >
        <Plus className="size-5" aria-hidden="true" />
        Nouvelle séance
      </Button>
    </>
  )
}
