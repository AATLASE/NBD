"use client"

import { Pencil, Trash2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import Markdown from "react-markdown"

import { Carte, Retour, Section, Stat, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { EditeurPlat } from "@/components/nutrition/editeur-plat"
import { EtiquetteTag } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { useEdition } from "@/lib/edition"
import { nombre } from "@/lib/format"
import { LIBELLE_SLOT } from "@/lib/libelles"
import { supprimerPlat } from "@/lib/mutations"
import { useRepas, type Repas } from "@/lib/queries"

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
  const router = useRouter()
  const { executer, enCours } = useEdition()
  const [edition, setEdition] = useState(false)

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

  async function supprimer() {
    const resultat = await executer(() => supprimerPlat(plat!.id), {
      cle: ["repas"],
      maj: (liste: Repas[]) => liste.filter((r) => r.id !== plat!.id),
    })
    if (resultat.ok) router.push("/nutrition/recettes")
  }

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

      <Button variant="outline" className="h-12 w-full gap-2 text-base font-semibold" onClick={() => setEdition(true)}>
        <Pencil className="size-4" aria-hidden="true" />
        Modifier le plat
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Stat libelle="Énergie" valeur={plat.kcal} unite="kcal" />
        <Stat libelle="Protéines" valeur={plat.proteines_g} unite="g" />
        {plat.lipides_g !== null && <Stat libelle="Lipides" valeur={plat.lipides_g} unite="g" />}
        {plat.glucides_g !== null && <Stat libelle="Glucides" valeur={plat.glucides_g} unite="g" />}
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
            Ce plat n&apos;a pas d&apos;étapes écrites. Tu peux en ajouter avec « Modifier le plat ».
          </Vide>
        )}
      </Section>

      <Button variant="destructive" className="h-12 w-full gap-2 text-base" disabled={enCours} onClick={supprimer}>
        <Trash2 className="size-5" aria-hidden="true" />
        Supprimer ce plat
      </Button>

      <EditeurPlat plat={plat} ouvert={edition} onFermer={() => setEdition(false)} />
    </>
  )
}
