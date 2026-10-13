"use client"

import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Stepper } from "@/components/execution/stepper"
import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useEdition } from "@/lib/edition"
import { LIBELLE_SLOT, LIBELLE_TAG, SLOTS, TAGS } from "@/lib/libelles"
import { enregistrerPlat, type ChampsPlat, type IngredientDuPlat } from "@/lib/mutations"
import type { Repas } from "@/lib/queries"

const INGREDIENTS_MAX = 30
// « 1,5 » comme « 1.5 » : le clavier français propose la virgule.
const lireQuantite = (saisie: string) => {
  const valeur = Number(saisie.trim().replace(",", "."))
  return saisie.trim() !== "" && Number.isFinite(valeur) && valeur >= 0 ? valeur : null
}

type LigneIngredient = { cle: number; nom: string; quantite: string; unite: string }

// `ingredients` est un jsonb libre : on ne reprend que les entrées qui ont la forme attendue.
function lireIngredients(brut: unknown): LigneIngredient[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((entree, index) => {
    if (typeof entree !== "object" || entree === null) return []
    const { nom, quantite, unite } = entree as Record<string, unknown>
    if (typeof nom !== "string") return []
    return [
      {
        cle: index,
        nom,
        quantite: typeof quantite === "number" ? String(quantite).replace(".", ",") : "",
        unite: typeof unite === "string" ? unite : "",
      },
    ]
  })
}

// Crée un plat (`plat` vide) ou modifie un plat existant : ses valeurs, ses ingrédients, sa recette.
// `onCree` reçoit l'identifiant du plat créé.
export function EditeurPlat({
  plat,
  ouvert,
  onFermer,
  onCree,
}: {
  plat: Repas | null
  ouvert: boolean
  onFermer: () => void
  onCree?: (id: string) => void
}) {
  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl text-base"
      >
        {ouvert && <Formulaire plat={plat} onFermer={onFermer} onCree={onCree} />}
      </SheetContent>
    </Sheet>
  )
}

function Groupe({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t px-4 py-4">
      <legend className="float-left w-full">
        <span className="block font-semibold">{titre}</span>
        {aide && <span className="block text-sm text-muted-foreground">{aide}</span>}
      </legend>
      <div className="clear-both space-y-3 pt-3">{children}</div>
    </fieldset>
  )
}

function Formulaire({
  plat,
  onFermer,
  onCree,
}: {
  plat: Repas | null
  onFermer: () => void
  onCree?: (id: string) => void
}) {
  const { executer, enCours } = useEdition()

  const [nom, setNom] = useState(plat?.nom ?? "")
  const [slot, setSlot] = useState<string>(plat?.slot ?? "dejeuner")
  const [tag, setTag] = useState<string>(plat?.tag ?? "standard")
  const [kcal, setKcal] = useState(plat?.kcal ?? 500)
  const [proteines, setProteines] = useState(plat?.proteines_g ?? 30)
  const [detail, setDetail] = useState(plat ? plat.lipides_g !== null || plat.glucides_g !== null : false)
  const [lipides, setLipides] = useState(plat?.lipides_g ?? 15)
  const [glucides, setGlucides] = useState(plat?.glucides_g ?? 50)
  const [avecTemps, setAvecTemps] = useState(plat ? plat.temps_min !== null : false)
  const [temps, setTemps] = useState(plat?.temps_min ?? 15)
  const [ingredients, setIngredients] = useState<LigneIngredient[]>(() => lireIngredients(plat?.ingredients))
  const [recette, setRecette] = useState(plat?.recette_md ?? "")
  const [compteur, setCompteur] = useState(1000)

  const nomValide = nom.trim().length >= 2
  const changerIngredient = (cle: number, champ: Partial<LigneIngredient>) =>
    setIngredients((lignes) => lignes.map((l) => (l.cle === cle ? { ...l, ...champ } : l)))

  async function enregistrer() {
    const champs: ChampsPlat = {
      nom: nom.trim(),
      slot,
      tag,
      kcal,
      proteines_g: proteines,
      lipides_g: detail ? lipides : null,
      glucides_g: detail ? glucides : null,
      temps_min: avecTemps ? temps : null,
      recette_md: recette.trim() || null,
      ingredients: ingredients
        .filter((l) => l.nom.trim() !== "")
        .map(
          (l): IngredientDuPlat => ({
            nom: l.nom.trim(),
            quantite: lireQuantite(l.quantite),
            unite: l.unite.trim() || null,
          })
        ),
    }

    if (plat) {
      onFermer()
      // Mise à jour immédiate de l'écran, avant la réponse du serveur.
      await executer(() => enregistrerPlat(plat.id, champs), {
        cle: ["repas"],
        maj: (repas: Repas[]) => repas.map((r) => (r.id === plat.id ? ({ ...r, ...champs } as Repas) : r)),
      })
      return
    }
    const resultat = await executer(() => enregistrerPlat(null, champs))
    if (resultat.ok) {
      onFermer()
      if (resultat.id) onCree?.(resultat.id)
    }
  }

  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">{plat ? "Modifier le plat" : "Nouveau plat"}</SheetTitle>
        <SheetDescription className="text-base">
          Les valeurs sont celles d&apos;une portion. Seuls le nom, les calories et les protéines sont nécessaires.
        </SheetDescription>
      </SheetHeader>

      <Groupe titre="Le plat">
        <div className="space-y-2">
          <Label htmlFor="nom-plat">Nom</Label>
          <Input
            id="nom-plat"
            value={nom}
            maxLength={90}
            autoComplete="off"
            onChange={(e) => setNom(e.target.value)}
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Moment du repas</p>
          <Filtres
            libelle="Moment du repas"
            valeur={slot}
            onChange={setSlot}
            options={SLOTS.map((s) => ({ valeur: s as string, libelle: LIBELLE_SLOT[s]! }))}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Type de plat</p>
          <Filtres
            libelle="Type de plat"
            valeur={tag}
            onChange={setTag}
            options={TAGS.map((t) => ({ valeur: t as string, libelle: LIBELLE_TAG[t]! }))}
          />
        </div>
      </Groupe>

      <Groupe titre="Pour une portion">
        <Stepper libelle="Calories" valeur={kcal} unite="kcal" pas={10} min={0} max={3000} onChange={setKcal} />
        <Stepper libelle="Protéines" valeur={proteines} unite="g" pas={1} min={0} max={300} onChange={setProteines} />
        <Filtres
          libelle="Lipides et glucides"
          valeur={detail ? "oui" : "non"}
          onChange={(v) => setDetail(v === "oui")}
          options={[
            { valeur: "non", libelle: "Sans lipides ni glucides" },
            { valeur: "oui", libelle: "Les préciser" },
          ]}
        />
        {detail && (
          <>
            <Stepper compact libelle="Lipides" valeur={lipides} unite="g" pas={1} min={0} max={300} onChange={setLipides} />
            <Stepper compact libelle="Glucides" valeur={glucides} unite="g" pas={1} min={0} max={500} onChange={setGlucides} />
          </>
        )}
        <Filtres
          libelle="Temps de préparation"
          valeur={avecTemps ? "oui" : "non"}
          onChange={(v) => setAvecTemps(v === "oui")}
          options={[
            { valeur: "non", libelle: "Sans temps de préparation" },
            { valeur: "oui", libelle: "Le préciser" },
          ]}
        />
        {avecTemps && (
          <Stepper compact libelle="Préparation" valeur={temps} unite="min" pas={5} min={0} max={600} onChange={setTemps} />
        )}
      </Groupe>

      <Groupe titre="Ingrédients" aide="Ils alimentent la liste de courses. La quantité est facultative.">
        {ingredients.length > 0 && (
          <ul className="space-y-3">
            {ingredients.map((ligne, index) => (
              <li key={ligne.cle} className="space-y-2 rounded-2xl border bg-card p-3">
                <Input
                  aria-label={`Ingrédient ${index + 1}`}
                  value={ligne.nom}
                  maxLength={80}
                  placeholder="Riz, poulet…"
                  autoCapitalize="none"
                  onChange={(e) => changerIngredient(ligne.cle, { nom: e.target.value })}
                  className="h-12"
                />
                <div className="flex gap-2">
                  <Input
                    aria-label={`Quantité de l'ingrédient ${index + 1}`}
                    value={ligne.quantite}
                    inputMode="decimal"
                    maxLength={8}
                    placeholder="Quantité"
                    onChange={(e) => changerIngredient(ligne.cle, { quantite: e.target.value })}
                    className="h-12 min-w-0 flex-1"
                  />
                  <Input
                    aria-label={`Unité de l'ingrédient ${index + 1}`}
                    value={ligne.unite}
                    maxLength={20}
                    placeholder="g, ml, pièce"
                    autoCapitalize="none"
                    onChange={(e) => changerIngredient(ligne.cle, { unite: e.target.value })}
                    className="h-12 min-w-0 flex-1"
                  />
                  <Button
                    variant="outline"
                    aria-label={`Retirer l'ingrédient ${index + 1}`}
                    className="size-12 shrink-0 text-danger"
                    onClick={() => setIngredients((lignes) => lignes.filter((l) => l.cle !== ligne.cle))}
                  >
                    <Trash2 className="size-5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          className="h-12 w-full gap-2 text-base"
          disabled={ingredients.length >= INGREDIENTS_MAX}
          onClick={() => {
            setIngredients((lignes) => [...lignes, { cle: compteur, nom: "", quantite: "", unite: "" }])
            setCompteur(compteur + 1)
          }}
        >
          <Plus className="size-5" aria-hidden="true" />
          Ajouter un ingrédient
        </Button>
      </Groupe>

      <Groupe titre="Recette" aide="Facultatif. Une étape par ligne ; commence une ligne par un tiret pour faire une liste.">
        <Label htmlFor="recette-plat" className="sr-only">
          Recette
        </Label>
        <textarea
          id="recette-plat"
          value={recette}
          rows={6}
          maxLength={4000}
          onChange={(e) => setRecette(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </Groupe>

      <div className="sticky bottom-0 space-y-2 border-t bg-popover px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {!nomValide && <p className="text-sm text-muted-foreground">Donne un nom au plat pour l&apos;enregistrer.</p>}
        <Button className="h-14 w-full text-lg font-semibold" disabled={enCours || !nomValide} onClick={enregistrer}>
          {plat ? "Enregistrer" : "Créer le plat"}
        </Button>
      </div>
    </>
  )
}
