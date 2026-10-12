// Composition de la liste de courses d'une semaine (SPEC 5.2, onglet Courses). Fonctions pures.
//
// La liste réunit deux sources :
//   1. les produits récurrents du catalogue (les « courses de base »), tels quels ;
//   2. les ingrédients des repas prévus cette semaine-là, additionnés par ingrédient et par unité.
// Un ingrédient déjà couvert par un produit récurrent n'est pas ajouté une seconde fois.

import { nombre } from "@/lib/format"

export type IngredientDePlat = { nom: string; quantite: number | null; unite: string | null }

export type ProduitCatalogue = {
  nom: string
  categorie: string
  quantite: string | null
  prix_eur: number | null
  recurrent: boolean | null
}

export type Article = { nom: string; categorie: string; quantite: string | null; prix_eur: number | null }

// Minuscules d'abord : « Œufs » doit devenir « oeufs » au même titre que « œufs ».
const sansAccent = (texte: string) =>
  texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/œ/g, "oe")
    .trim()

// Forme de comparaison : sans accents, au singulier approximatif (« œufs » et « œuf » se rejoignent).
export function cleDe(nom: string) {
  return sansAccent(nom)
    .split(/\s+/)
    .map((mot) => (mot.length > 3 ? mot.replace(/[sx]$/, "") : mot))
    .join(" ")
}

// « riz » correspond à « Riz » ; « thon » à « Thon en boîte » ; « lentilles » à « Lentilles sèches ».
function correspond(ingredient: string, produit: string) {
  const a = cleDe(ingredient)
  const b = cleDe(produit)
  return a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `)
}

// Rayon d'un ingrédient inconnu du catalogue, d'après son nom. Par défaut : épicerie.
const RAYONS: [string, string[]][] = [
  // Deux légumes dont le nom commence comme une légumineuse.
  ["legumes", ["haricot vert", "haricots verts", "petit pois", "petits pois"]],
  ["proteines", ["poulet", "dinde", "boeuf", "porc", "jambon", "steak", "viande", "thon", "saumon", "poisson", "cabillaud", "crevette", "oeuf", "tofu", "tempeh", "seitan", "lentille", "pois chiche", "haricot", "edamame", "whey", "proteine"]],
  ["laitages", ["lait", "yaourt", "skyr", "fromage", "feta", "mozzarella", "parmesan", "creme", "beurre"]],
  ["feculents", ["riz", "pate", "nouille", "pain", "flocon", "avoine", "semoule", "quinoa", "boulgour", "pomme de terre", "pommes de terre", "patate", "farine", "tortilla", "wrap", "mais"]],
  ["fruits", ["banane", "pomme", "poire", "orange", "citron", "fruit", "fraise", "framboise", "myrtille", "raisin", "kiwi", "mangue", "ananas", "datte", "avocat"]],
  ["legumes", ["legume", "tomate", "carotte", "courgette", "brocoli", "epinard", "salade", "laitue", "roquette", "concombre", "poivron", "oignon", "ail", "champignon", "chou", "pak choi", "aubergine", "radis", "poireau", "ciboule", "gingembre", "haricot vert", "petit pois"]],
]
// Un laitage végétal (« lait de coco », « beurre de cacahuète ») se range en épicerie.
const VEGETAL = ["de coco", "de soja", "d'amande", "d'avoine", "de cacahuete", "d'arachide", "de sesame", "vegetal"]

export function rayonDe(nom: string) {
  // Sur le nom entier, sans mise au singulier : « pois chiches » doit contenir « pois chiche ».
  const texte = sansAccent(nom)
  // Mot entier, pluriel admis : « ail » ne doit pas se trouver dans « volaille », ni « lait » dans « laitue ».
  const contient = (mot: string) => new RegExp(`(^|[^a-z])${mot}[sx]?([^a-z]|$)`).test(texte)
  for (const [rayon, mots] of RAYONS) {
    if (!mots.some(contient)) continue
    // « Lait d'avoine », « yaourt de soja » : ni un laitage ni, à cause du mot « avoine », un féculent.
    if (rayon === "laitages" && VEGETAL.some((qualificatif) => texte.includes(qualificatif))) return "epicerie"
    return rayon
  }
  return "epicerie"
}

// Additionne les ingrédients de tous les repas de la semaine, par ingrédient et par unité.
export function agreger(ingredients: IngredientDePlat[]) {
  const cumul = new Map<string, { nom: string; unite: string | null; quantite: number | null; fois: number }>()
  for (const ingredient of ingredients) {
    const nom = ingredient.nom.trim()
    if (nom.length < 2) continue
    const unite = ingredient.unite?.trim() || null
    const cle = `${cleDe(nom)}|${unite ?? ""}`
    const ligne = cumul.get(cle) ?? { nom, unite, quantite: null, fois: 0 }
    ligne.fois += 1
    if (ingredient.quantite !== null) ligne.quantite = (ligne.quantite ?? 0) + ingredient.quantite
    cumul.set(cle, ligne)
  }
  return [...cumul.values()]
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1)

export function composerListe(ingredients: IngredientDePlat[], catalogue: ProduitCatalogue[]): Article[] {
  const recurrents = catalogue.filter((produit) => produit.recurrent)
  const articles: Article[] = recurrents.map((produit) => ({
    nom: produit.nom,
    categorie: produit.categorie,
    quantite: produit.quantite,
    prix_eur: produit.prix_eur,
  }))

  for (const ligne of agreger(ingredients)) {
    if (recurrents.some((produit) => correspond(ligne.nom, produit.nom))) continue
    // Un produit connu mais non récurrent prête son rayon et son dernier prix.
    const connu = catalogue.find((produit) => correspond(ligne.nom, produit.nom))
    const quantite =
      ligne.quantite !== null
        ? `${nombre(Math.round(ligne.quantite * 10) / 10)}${ligne.unite ? ` ${ligne.unite}` : ""}`
        : ligne.fois > 1
          ? `pour ${ligne.fois} repas`
          : null
    articles.push({
      nom: majuscule(ligne.nom),
      categorie: connu?.categorie ?? rayonDe(ligne.nom),
      quantite,
      prix_eur: connu?.prix_eur ?? null,
    })
  }
  return articles
}
