"use client"

import { BookOpen, ChevronRight, Plus, SearchX } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Carte, EnTete, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { EditeurPlat } from "@/components/nutrition/editeur-plat"
import { Button, buttonVariants } from "@/components/ui/button"
import { EtiquetteTag, Filtres, macros } from "@/components/nutrition/repas"
import { LIBELLE_SLOT, LIBELLE_TAG, SLOTS } from "@/lib/libelles"
import { useRepas } from "@/lib/queries"

const TOUS = "tous"

export default function Recettes() {
  const repas = useRepas()
  const [slot, setSlot] = useState<string>(TOUS)
  const [tag, setTag] = useState<string>(TOUS)
  const [creation, setCreation] = useState(false)
  const router = useRouter()

  if (!repas.data) return <Attente requetes={[repas]} />

  const nouveauPlat = (
    <>
      <Button variant="outline" className="h-14 w-full gap-2 text-base font-semibold" onClick={() => setCreation(true)}>
        <Plus className="size-5" aria-hidden="true" />
        Nouveau plat
      </Button>
      <EditeurPlat
        plat={null}
        ouvert={creation}
        onFermer={() => setCreation(false)}
        onCree={(id) => router.push(`/nutrition/recettes/${id}`)}
      />
    </>
  )

  if (repas.data.length === 0) {
    return (
      <>
        <EnTete titre="Recettes" />
        <Vide Icone={BookOpen} titre="Aucun plat pour l'instant">
          Crée tes plats un par un, ou demande un plan complet à l&apos;assistant. Les menus se remplissent ensuite
          à partir de cette liste.
        </Vide>
        {nouveauPlat}
        <Link
          href="/bienvenue/programme"
          className={buttonVariants({ variant: "outline", className: "h-12 w-full text-base" })}
        >
          Me proposer un plan nutritif
        </Link>
      </>
    )
  }

  const tags = [...new Set(repas.data.map((r) => r.tag).filter((t): t is string => t !== null))].sort()
  const visibles = repas.data.filter(
    (r) => (slot === TOUS || r.slot === slot) && (tag === TOUS || r.tag === tag)
  )

  return (
    <>
      <EnTete
        titre="Recettes"
        sousTitre={`${visibles.length} plat${visibles.length > 1 ? "s" : ""}`}
      />

      <div className="space-y-2">
        <Filtres
          libelle="Filtrer par moment du repas"
          valeur={slot}
          onChange={setSlot}
          options={[
            { valeur: TOUS, libelle: "Tous les repas" },
            ...SLOTS.map((s) => ({ valeur: s as string, libelle: LIBELLE_SLOT[s]! })),
          ]}
        />
        <Filtres
          libelle="Filtrer par type de plat"
          valeur={tag}
          onChange={setTag}
          options={[
            { valeur: TOUS, libelle: "Tous les types" },
            ...tags.map((t) => ({ valeur: t, libelle: LIBELLE_TAG[t] ?? t })),
          ]}
        />
      </div>

      {visibles.length === 0 ? (
        <Vide Icone={SearchX} titre="Aucun plat pour ces filtres">
          Élargis le moment du repas ou le type de plat.
        </Vide>
      ) : (
        <Carte>
          <ul className="divide-y">
            {visibles.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/nutrition/recettes/${r.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none first:rounded-t-2xl last:rounded-b-2xl focus-visible:bg-muted active:bg-muted"
                >
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block leading-snug font-medium">{r.nom}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
                      {macros(r)}
                      {r.temps_min !== null && ` · ${r.temps_min} min`}
                    </span>
                  </span>
                  {r.recette_md && r.ingredients && (
                    <BookOpen className="size-4 shrink-0 text-brand" aria-label="Recette détaillée" />
                  )}
                  <EtiquetteTag tag={r.tag} />
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      {nouveauPlat}
    </>
  )
}
