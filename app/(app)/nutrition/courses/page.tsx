"use client"

import { cn } from "cn"
import { Check, RefreshCw, ShoppingBasket } from "lucide-react"
import { useState } from "react"

import { Carte, EnTete, Section, Vide } from "@/components/blocs"
import { Attente } from "@/components/etats"
import { Stepper } from "@/components/execution/stepper"
import { LienHistorique } from "@/components/lien-historique"
import { Filtres } from "@/components/nutrition/repas"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAujourdhui } from "@/lib/aujourdhui"
import type { Tables } from "@/lib/database.types"
import { useEdition } from "@/lib/edition"
import { differable } from "@/lib/file-attente"
import { dateCourte, decalerJours, euros, nombre } from "@/lib/format"
import { CATEGORIES, LIBELLE_CATEGORIE } from "@/lib/libelles"
import { fixerPrixArticle, genererListeCourses, modifierBudget } from "@/lib/mutations"
import { useCourses, useDebutProgramme, useProfil } from "@/lib/queries"
import { semaineMenu, semaineProgramme } from "@/lib/regles"
import { lundiDe } from "@/lib/suivi"

type Article = Tables<"grocery_list_items">
type Donnees = { produits: Tables<"grocery_items">[]; listeSemaine: Article[] }

const PRIX_PROPOSE = 1
const BUDGET_PROPOSE = 35

export default function Courses() {
  const aujourdhui = useAujourdhui()
  const courses = useCourses()
  const profil = useProfil()
  const debut = useDebutProgramme()
  const { executer, enCours } = useEdition()
  const [choix, setChoix] = useState<"courante" | "suivante">("courante")
  const [articleAPrix, setArticleAPrix] = useState<string | null>(null)
  const [budgetOuvert, setBudgetOuvert] = useState(false)

  if (!aujourdhui || !courses.data || profil.data === undefined || debut.data === undefined) {
    return <Attente requetes={[courses, profil, debut]} />
  }

  // La semaine de courses commence un lundi. Le plan de repas tourne sur 2 semaines : la semaine
  // prochaine utilise l'autre moitié du plan.
  const lundi = lundiDe(aujourdhui)
  const menuCourant = semaineMenu(semaineProgramme(debut.data, aujourdhui).brute)
  const semaineDu = choix === "courante" ? lundi : decalerJours(lundi, 7)
  const menu = choix === "courante" ? menuCourant : menuCourant === 1 ? 2 : 1

  const { produits, listeSemaine } = courses.data
  const liste = listeSemaine.filter((article) => article.semaine_du === semaineDu)
  const total = liste.reduce((somme, article) => somme + (article.prix_eur ?? 0), 0)
  const sansPrix = liste.filter((article) => article.prix_eur === null).length
  const pris = liste.filter((article) => article.coche).length
  const budget = profil.data?.budget_courses_eur ?? null

  // Rayons connus dans l'ordre du magasin, puis ceux créés depuis.
  const rayons = [
    ...CATEGORIES.filter((c) => liste.some((a) => a.categorie === c)),
    ...[...new Set(liste.map((a) => a.categorie))].filter((c) => !(CATEGORIES as readonly string[]).includes(c)),
  ]

  const rendement = produits
    .filter((p) => p.proteines_par_euro !== null)
    .sort((a, b) => b.proteines_par_euro! - a.proteines_par_euro!)
  const rendementMax = rendement[0]?.proteines_par_euro ?? 1

  const dansLaListe = (maj: (article: Article) => Article) => ({
    cle: ["courses"],
    maj: (donnees: Donnees) => ({ ...donnees, listeSemaine: donnees.listeSemaine.map(maj) }),
  })

  function cocher(article: Article) {
    const coche = !article.coche
    // En magasin on coche vite et souvent : pas de bandeau à chaque article.
    void executer(
      differable("cocherArticle", article.id, coche),
      dansLaListe((a) => (a.id === article.id ? { ...a, coche } : a)),
      { silencieux: true }
    )
  }

  const articleOuvert = liste.find((article) => article.id === articleAPrix) ?? null

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EnTete titre="Courses" />
        <LienHistorique />
      </div>

      <Filtres
        libelle="Semaine de courses"
        valeur={choix}
        onChange={setChoix}
        options={[
          { valeur: "courante", libelle: `Cette semaine · ${dateCourte(lundi)}` },
          { valeur: "suivante", libelle: `Semaine prochaine · ${dateCourte(decalerJours(lundi, 7))}` },
        ]}
      />

      {liste.length === 0 ? (
        <div className="space-y-3">
          <Vide Icone={ShoppingBasket} titre="Pas encore de liste pour cette semaine">
            Elle additionne les ingrédients des repas prévus dans les menus de la semaine {menu}.
          </Vide>
          <Button
            className="h-14 w-full text-lg font-semibold"
            disabled={enCours}
            onClick={() => void executer(() => genererListeCourses(semaineDu, menu))}
          >
            Générer la liste
          </Button>
        </div>
      ) : (
        <>
          {/* Le total reste visible pendant qu'on parcourt les rayons. */}
          <Carte className="sticky top-[calc(3rem+env(safe-area-inset-top)+0.5rem)] z-20 space-y-1 p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-3xl font-bold tracking-tight tabular-nums">{euros(total)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {pris} sur {liste.length} pris
              </p>
            </div>
            {budget !== null && (
              <p className={cn("font-medium tabular-nums", total <= budget ? "text-success" : "text-warning")}>
                {total <= budget
                  ? `${euros(budget - total)} sous le budget de ${euros(budget)}`
                  : `${euros(total - budget)} au-dessus du budget de ${euros(budget)}`}
              </p>
            )}
            {sansPrix > 0 && (
              <p className="text-sm text-muted-foreground">
                {sansPrix} article{sansPrix > 1 ? "s" : ""} sans prix : le total ne les compte pas.
              </p>
            )}
          </Carte>

          {rayons.map((rayon) => (
            <Carte key={rayon}>
              <h2 className="px-4 pt-4 pb-1 text-sm font-semibold text-brand">
                {LIBELLE_CATEGORIE[rayon] ?? rayon}
              </h2>
              <ul className="divide-y">
                {liste
                  .filter((article) => article.categorie === rayon)
                  .map((article) => (
                    <li key={article.id} className="flex items-stretch">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={Boolean(article.coche)}
                        onClick={() => cocher(article)}
                        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left outline-none focus-visible:bg-muted active:bg-muted"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors duration-150",
                            article.coche ? "border-primary bg-primary text-primary-foreground" : "border-input"
                          )}
                        >
                          {article.coche && <Check className="size-5" strokeWidth={3} />}
                        </span>
                        <span className={cn("min-w-0 flex-1", article.coche && "text-muted-foreground line-through")}>
                          <span className="font-medium">{article.nom}</span>
                          {article.quantite && <span className="text-muted-foreground"> · {article.quantite}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setArticleAPrix(article.id)}
                        aria-label={
                          article.prix_eur !== null
                            ? `Prix de ${article.nom} : ${euros(article.prix_eur)}. Modifier`
                            : `Indiquer le prix de ${article.nom}`
                        }
                        className={cn(
                          "flex min-w-20 shrink-0 items-center justify-end px-4 tabular-nums outline-none focus-visible:bg-muted active:bg-muted",
                          article.prix_eur !== null ? "font-semibold" : "text-sm font-medium text-brand"
                        )}
                      >
                        {article.prix_eur !== null ? euros(article.prix_eur) : "Prix ?"}
                      </button>
                    </li>
                  ))}
              </ul>
            </Carte>
          ))}

          <Button
            variant="outline"
            className="h-12 w-full gap-2 text-base"
            disabled={enCours}
            onClick={() => void executer(() => genererListeCourses(semaineDu, menu))}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Regénérer depuis les menus
          </Button>
        </>
      )}

      <Carte className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted-foreground">Budget par semaine</p>
          <p className="text-xl font-bold tabular-nums">{budget !== null ? euros(budget) : "Non fixé"}</p>
        </div>
        <Button variant="outline" className="h-11 px-4 text-base" onClick={() => setBudgetOuvert(true)}>
          {budget !== null ? "Modifier" : "Fixer un budget"}
        </Button>
      </Carte>

      {rendement.length > 0 && (
        <Section titre="Protéines par euro">
          <Carte>
            <ol className="divide-y">
              {rendement.map((produit) => (
                <li key={produit.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{produit.nom}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-bold">{nombre(produit.proteines_par_euro!)} g</span>
                      <span className="text-muted-foreground"> par €</span>
                    </span>
                  </div>
                  <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full origin-left rounded-full bg-primary"
                      style={{ transform: `scaleX(${produit.proteines_par_euro! / rendementMax})` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </Carte>
        </Section>
      )}

      <Sheet open={articleOuvert !== null} onOpenChange={(ouvert) => !ouvert && setArticleAPrix(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg gap-0 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          {articleOuvert && (
            <Montant
              key={articleOuvert.id}
              titre={articleOuvert.nom}
              aide="Le prix est retenu pour les prochaines listes."
              libelle="Prix"
              initial={articleOuvert.prix_eur ?? PRIX_PROPOSE}
              pas={0.1}
              max={500}
              onEnregistrer={(prix) => {
                setArticleAPrix(null)
                void executer(
                  () => fixerPrixArticle(articleOuvert.id, prix),
                  dansLaListe((a) => (a.id === articleOuvert.id ? { ...a, prix_eur: prix } : a))
                )
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={budgetOuvert} onOpenChange={setBudgetOuvert}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-lg gap-0 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] text-base"
        >
          {budgetOuvert && (
            <Montant
              titre="Budget courses"
              aide="Par semaine. Le total de la liste s'y compare."
              libelle="Budget"
              initial={budget ?? BUDGET_PROPOSE}
              pas={1}
              max={2000}
              onEnregistrer={(montant) => {
                setBudgetOuvert(false)
                void executer(() => modifierBudget(montant))
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// Saisie d'un montant en euros, sans clavier.
function Montant({
  titre,
  aide,
  libelle,
  initial,
  pas,
  max,
  onEnregistrer,
}: {
  titre: string
  aide: string
  libelle: string
  initial: number
  pas: number
  max: number
  onEnregistrer: (montant: number) => void
}) {
  const [montant, setMontant] = useState(initial)
  return (
    <>
      <SheetHeader className="pr-14">
        <SheetTitle className="text-xl font-bold">{titre}</SheetTitle>
        <SheetDescription className="text-base">{aide}</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <Stepper libelle={libelle} valeur={montant} unite="€" pas={pas} max={max} onChange={setMontant} />
        <Button className="h-14 w-full text-lg font-semibold" onClick={() => onEnregistrer(montant)}>
          Enregistrer
        </Button>
      </div>
    </>
  )
}
