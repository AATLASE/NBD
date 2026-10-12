"use client"

import { useParams } from "next/navigation"
import Markdown from "react-markdown"

import { Carte, Retour, Section, Stat, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { EtiquetteTag } from "@/components/nutrition/repas"
import { nombre } from "@/lib/format"
import { LIBELLE_SLOT } from "@/lib/libelles"
import { useRepas } from "@/lib/queries"

type Ingredient = { nom: string; quantite: number | null; unite: string | null }

// `ingredients` est un jsonb libre : on ne garde que les entrées qui ont la forme attendue.
function lireIngredients(brut: unknown): Ingredient[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((entree) => {
    if (typeof entree !== "object" || entree === null) return []
    const { nom, quantite, unite } = entree as Record<string, unknown>
    if (typeof nom !== "string") return []
    return [
      {
        nom,
        quantite: typeof quantite === "number" ? quantite : null,
        unite: typeof unite === "string" ? unite : null,
      },
    ]
  })
}

export default function DetailRecette() {
  const { id } = useParams<{ id: string }>()
  const repas = useRepas()

  if (!repas.data) return <Attente requetes={[repas]} />

  const plat = repas.data.find((r) => r.id === id)
  if (!plat) {
    return (
      <>
        <Retour href="/nutrition/recettes">Recettes</Retour>
        <Vide titre="Plat introuvable">Il a peut-être été supprimé ou archivé.</Vide>
      </>
    )
  }

  const ingredients = lireIngredients(plat.ingredients)

  return (
    <>
      <div className="space-y-3">
        <Retour href="/nutrition/recettes">Recettes</Retour>
        <header className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            {LIBELLE_SLOT[plat.slot] ?? plat.slot}
            <EtiquetteTag tag={plat.tag} />
          </p>
          <h1 className="text-2xl leading-tight font-bold tracking-tight">{plat.nom}</h1>
        </header>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat libelle="Énergie" valeur={plat.kcal} unite="kcal" />
        <Stat libelle="Protéines" valeur={plat.proteines_g} unite="g" />
        {plat.temps_min !== null && <Stat libelle="Préparation" valeur={plat.temps_min} unite="min" />}
      </div>

      {ingredients.length > 0 && (
        <Section titre="Ingrédients" aside="Pour une portion">
          <Carte>
            <ul className="divide-y">
              {ingredients.map((ingredient) => (
                <li
                  key={ingredient.nom}
                  className="flex items-baseline justify-between gap-3 px-4 py-3"
                >
                  <span className="first-letter:uppercase">{ingredient.nom}</span>
                  {ingredient.quantite !== null && (
                    <span className="shrink-0 font-semibold tabular-nums">
                      {nombre(ingredient.quantite)} {ingredient.unite}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Carte>
        </Section>
      )}

      <Section titre="Recette">
        {plat.recette_md ? (
          <Carte className="space-y-3 p-4 leading-relaxed">
            <Markdown
              components={{
                ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              }}
            >
              {plat.recette_md}
            </Markdown>
          </Carte>
        ) : (
          <Vide titre="Pas de recette détaillée">
            Ce plat suit la formule de son repas, sans étapes écrites.
          </Vide>
        )}
      </Section>
    </>
  )
}
