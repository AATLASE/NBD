"use client"

import { Calculator, Plus, Sparkles, Trash2 } from "lucide-react"
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
import { estimerPlat, type Estimation } from "@/lib/nutriments"
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
  const [estimation, setEstimation] = useState<Estimation | null>(null)
  const [assistant, setAssistant] = useState<EtatAssistant>({ etat: "repos" })

  const nomValide = nom.trim().length >= 2

  const ingredientsSaisis = (): IngredientDuPlat[] =>
    ingredients
      .filter((l) => l.nom.trim() !== "")
      .map((l) => ({ nom: l.nom.trim(), quantite: lireQuantite(l.quantite), unite: l.unite.trim() || null }))

  // Estime les calories et les protéines d'après les ingrédients saisis, et remplit les deux
  // valeurs. Elles restent modifiables à la main : c'est une estimation, parfois partielle.
  function recalculer() {
    const resultat = estimerPlat(ingredientsSaisis())
    setAssistant({ etat: "repos" })
    setEstimation(resultat)
    if (resultat.kcal === 0 && resultat.proteines === 0) return
    setKcal(Math.min(3000, resultat.kcal))
    setProteines(Math.min(300, resultat.proteines))
  }
  const changerIngredient = (cle: number, champ: Partial<LigneIngredient>) =>
    setIngredients((lignes) => lignes.map((l) => (l.cle === cle ? { ...l, ...champ } : l)))

  // La même estimation, demandée à l'assistant : il compte aussi ce qui n'a pas de quantité ou
  // n'est pas dans la table, et dit ce qu'il a supposé. Rien n'est enregistré à ce stade.
  async function recalculerAvecAssistant() {
    const liste = ingredientsSaisis()
    setEstimation(null)
    if (liste.length === 0) {
      setAssistant({ etat: "erreur", message: "Ajoute d'abord au moins un ingrédient." })
      return
    }
    if (!navigator.onLine) {
      setAssistant({
        etat: "erreur",
        message: "Hors ligne : l'assistant a besoin du réseau. Le calcul d'après les ingrédients, lui, fonctionne.",
      })
      return
    }
    setAssistant({ etat: "calcul" })
    try {
      const reponse = await fetch("/api/plat/estimation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: nom.trim(), ingredients: liste, recette: recette.trim() || null }),
      })
      const corps = (await reponse.json().catch(() => null)) as {
        ok?: boolean
        message?: string
        estimation?: { kcal: number; proteines_g: number; lipides_g: number; glucides_g: number; hypotheses: string[] }
      } | null
      if (!reponse.ok || !corps?.ok || !corps.estimation) {
        setAssistant({ etat: "erreur", message: corps?.message ?? "L'assistant ne répond pas. Réessaie." })
        return
      }
      const e = corps.estimation
      const rien = e.kcal === 0 && e.proteines_g === 0
      if (!rien) {
        setKcal(e.kcal)
        setProteines(e.proteines_g)
        setLipides(e.lipides_g)
        setGlucides(e.glucides_g)
      }
      setAssistant({ etat: "fait", kcal: e.kcal, proteines: e.proteines_g, hypotheses: e.hypotheses, rien })
    } catch {
      setAssistant({ etat: "erreur", message: "Pas de réseau. L'assistant n'a pas pu répondre." })
    }
  }

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
      ingredients: ingredientsSaisis(),
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

      <Groupe titre="Pour une portion">
        <Button variant="outline" className="h-12 w-full gap-2 text-base" onClick={recalculer}>
          <Calculator className="size-5" aria-hidden="true" />
          Recalculer d&apos;après les ingrédients
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full gap-2 text-base"
          disabled={assistant.etat === "calcul"}
          onClick={() => void recalculerAvecAssistant()}
        >
          <Sparkles className="size-5" aria-hidden="true" />
          {assistant.etat === "calcul" ? "L'assistant calcule…" : "Recalculer avec l'assistant"}
        </Button>
        {assistant.etat === "repos" ? (
          <ResultatEstimation estimation={estimation} />
        ) : (
          <ResultatAssistant assistant={assistant} />
        )}
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

type EtatAssistant =
  | { etat: "repos" }
  | { etat: "calcul" }
  | { etat: "erreur"; message: string }
  | { etat: "fait"; kcal: number; proteines: number; hypotheses: string[]; rien: boolean }

function ResultatAssistant({ assistant }: { assistant: Exclude<EtatAssistant, { etat: "repos" }> }) {
  if (assistant.etat === "calcul") {
    return (
      <p role="status" className="animate-pulse rounded-2xl bg-muted px-4 py-3 text-sm motion-reduce:animate-none">
        L&apos;assistant estime le plat d&apos;après ses ingrédients…
      </p>
    )
  }
  if (assistant.etat === "erreur") {
    return (
      <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-snug font-medium text-danger">
        {assistant.message}
      </p>
    )
  }
  return (
    <div role="status" className="space-y-1 rounded-2xl bg-muted px-4 py-3 text-sm leading-snug">
      <p className="font-medium">
        {assistant.rien
          ? "L'assistant n'a rien pu estimer : les valeurs n'ont pas changé."
          : `Estimation de l'assistant : ${assistant.kcal} kcal et ${assistant.proteines} g de protéines.`}
      </p>
      {assistant.hypotheses.length > 0 && (
        <>
          <p className="text-muted-foreground">Ce qu&apos;il a supposé :</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {assistant.hypotheses.map((hypothese) => (
              <li key={hypothese}>{hypothese}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

const RAISON = { inconnu: "inconnu de la table", "sans quantité": "sans quantité", "unité inconnue": "unité non reconnue" }

function ResultatEstimation({ estimation }: { estimation: Estimation | null }) {
  if (!estimation) {
    return (
      <p className="text-sm text-muted-foreground">
        Le premier calcul est immédiat : il additionne les ingrédients ci-dessus qui ont une quantité, d&apos;après
        une table d&apos;aliments courants. L&apos;assistant, lui, estime aussi ce qui n&apos;est pas chiffré ou pas
        dans la table. Dans les deux cas, tu peux ajuster à la main.
      </p>
    )
  }
  const total = estimation.comptes.length + estimation.ignores.length
  const rien = estimation.kcal === 0 && estimation.proteines === 0
  return (
    <div role="status" className="space-y-1 rounded-2xl bg-muted px-4 py-3 text-sm leading-snug">
      {total === 0 ? (
        <p className="font-medium">Ajoute d&apos;abord des ingrédients avec leur quantité.</p>
      ) : rien ? (
        <p className="font-medium">Aucun ingrédient n&apos;a pu être compté : les valeurs n&apos;ont pas changé.</p>
      ) : (
        <p className="font-medium">
          Estimation : {estimation.kcal} kcal et {estimation.proteines} g de protéines, d&apos;après{" "}
          {estimation.comptes.length} ingrédient{estimation.comptes.length > 1 ? "s" : ""} sur {total}.
        </p>
      )}
      {estimation.ignores.length > 0 && (
        <p className="text-muted-foreground">
          Non compté{estimation.ignores.length > 1 ? "s" : ""} :{" "}
          {estimation.ignores.map((i) => `${i.nom} (${RAISON[i.raison]})`).join(", ")}. Ajoute ce qu&apos;ils
          apportent à la main.
        </p>
      )}
    </div>
  )
}
