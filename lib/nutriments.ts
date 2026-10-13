// Estimation des calories et des protéines d'un plat d'après ses ingrédients. Fonctions pures.
//
// C'est un calcul de l'application, sans appel à l'assistant : il marche hors ligne et ne coûte
// rien. Il s'appuie sur une table d'aliments courants (valeurs moyennes pour 100 g) : c'est une
// estimation, pas une analyse. Un ingrédient inconnu de la table, ou sans quantité, n'est pas
// compté, et le résultat dit lesquels.

export type IngredientAEstimer = { nom: string; quantite: number | null; unite: string | null }

// `piece` : poids en grammes d'une unité (un œuf, une banane, une tranche, une gousse, une dose).
type Aliment = { cles: string[]; kcal: number; prot: number; piece?: number }

// Les céréales et légumineuses sont comptées crues ou sèches, comme on les pèse dans une recette,
// sauf si le nom dit « cuit ». Les légumineuses « en boîte » sont comptées cuites.
const ALIMENTS: Aliment[] = [
  // Féculents
  { cles: ["riz cuit"], kcal: 130, prot: 2.7 },
  { cles: ["riz"], kcal: 350, prot: 7 },
  { cles: ["pates cuites", "pate cuite"], kcal: 150, prot: 5 },
  { cles: ["pates", "pate", "spaghetti", "coquillettes", "penne", "tagliatelles"], kcal: 355, prot: 12 },
  { cles: ["nouilles", "vermicelles"], kcal: 350, prot: 11 },
  { cles: ["semoule", "couscous"], kcal: 360, prot: 12 },
  { cles: ["quinoa"], kcal: 368, prot: 14 },
  { cles: ["boulgour"], kcal: 342, prot: 12 },
  { cles: ["flocons d'avoine", "flocon d'avoine", "avoine"], kcal: 370, prot: 13 },
  { cles: ["muesli", "granola"], kcal: 400, prot: 10 },
  { cles: ["pain de mie"], kcal: 270, prot: 8, piece: 25 },
  { cles: ["pain complet"], kcal: 250, prot: 10, piece: 30 },
  { cles: ["pain"], kcal: 265, prot: 9, piece: 30 },
  { cles: ["tortilla", "wrap", "galette de ble"], kcal: 300, prot: 8, piece: 60 },
  { cles: ["patate douce"], kcal: 86, prot: 1.6, piece: 200 },
  { cles: ["pomme de terre", "pommes de terre", "patate"], kcal: 80, prot: 2, piece: 150 },
  { cles: ["farine"], kcal: 350, prot: 10 },
  { cles: ["maizena", "fecule"], kcal: 350, prot: 0.3 },
  { cles: ["mais"], kcal: 100, prot: 3 },
  { cles: ["gnocchi"], kcal: 150, prot: 4 },
  // Légumineuses
  { cles: ["lentilles cuites", "lentilles en boite"], kcal: 115, prot: 9 },
  { cles: ["lentilles", "lentille"], kcal: 340, prot: 25 },
  { cles: ["pois chiches secs"], kcal: 360, prot: 20 },
  { cles: ["pois chiches", "pois chiche"], kcal: 140, prot: 8 },
  { cles: ["haricots rouges", "haricot rouge", "haricots noirs"], kcal: 125, prot: 8.5 },
  { cles: ["haricots blancs", "haricot blanc"], kcal: 120, prot: 8 },
  { cles: ["haricots verts", "haricot vert"], kcal: 30, prot: 2 },
  { cles: ["petits pois", "petit pois"], kcal: 80, prot: 5.5 },
  { cles: ["edamame"], kcal: 120, prot: 11 },
  // Viandes, poissons, œufs, protéines végétales
  { cles: ["poulet", "blanc de poulet", "filet de poulet", "volaille"], kcal: 110, prot: 23 },
  { cles: ["dinde"], kcal: 105, prot: 24 },
  { cles: ["steak hache", "boeuf hache", "viande hachee"], kcal: 180, prot: 19 },
  { cles: ["boeuf", "steak"], kcal: 150, prot: 21 },
  { cles: ["porc"], kcal: 160, prot: 21 },
  { cles: ["jambon"], kcal: 115, prot: 20, piece: 40 },
  { cles: ["lardons", "bacon"], kcal: 280, prot: 15 },
  { cles: ["saucisse", "merguez", "chipolata"], kcal: 300, prot: 14, piece: 60 },
  { cles: ["chorizo"], kcal: 450, prot: 24 },
  { cles: ["saumon"], kcal: 200, prot: 20 },
  { cles: ["thon"], kcal: 110, prot: 25 },
  { cles: ["cabillaud", "colin", "poisson blanc", "poisson"], kcal: 85, prot: 18 },
  { cles: ["sardines", "sardine"], kcal: 200, prot: 24 },
  { cles: ["maquereau"], kcal: 230, prot: 20 },
  { cles: ["crevettes", "crevette"], kcal: 90, prot: 19 },
  { cles: ["blanc d'oeuf", "blancs d'oeufs"], kcal: 48, prot: 11, piece: 33 },
  { cles: ["oeuf", "oeufs"], kcal: 145, prot: 12.5, piece: 55 },
  { cles: ["tofu"], kcal: 125, prot: 13 },
  { cles: ["tempeh"], kcal: 190, prot: 19 },
  { cles: ["seitan"], kcal: 120, prot: 24 },
  { cles: ["whey", "proteine en poudre", "proteines en poudre"], kcal: 380, prot: 78, piece: 30 },
  // Laitages et boissons végétales
  { cles: ["lait de coco"], kcal: 190, prot: 2 },
  { cles: ["lait d'avoine", "boisson avoine"], kcal: 45, prot: 1 },
  { cles: ["lait de soja", "boisson soja"], kcal: 40, prot: 3.3 },
  { cles: ["lait d'amande"], kcal: 25, prot: 0.5 },
  { cles: ["lait"], kcal: 46, prot: 3.3 },
  { cles: ["skyr"], kcal: 60, prot: 10, piece: 150 },
  { cles: ["yaourt grec", "yaourt a la grecque"], kcal: 100, prot: 6, piece: 150 },
  { cles: ["yaourt de soja"], kcal: 50, prot: 4, piece: 125 },
  { cles: ["yaourt"], kcal: 60, prot: 4, piece: 125 },
  { cles: ["fromage blanc"], kcal: 75, prot: 7 },
  { cles: ["cottage"], kcal: 95, prot: 12 },
  { cles: ["ricotta"], kcal: 150, prot: 9 },
  { cles: ["mozzarella"], kcal: 250, prot: 18, piece: 125 },
  { cles: ["feta"], kcal: 265, prot: 14 },
  { cles: ["parmesan"], kcal: 400, prot: 36 },
  { cles: ["chevre"], kcal: 290, prot: 18 },
  { cles: ["emmental", "gruyere", "comte", "fromage rape", "fromage"], kcal: 370, prot: 27 },
  { cles: ["creme legere"], kcal: 160, prot: 3 },
  { cles: ["creme fraiche", "creme"], kcal: 290, prot: 2.4 },
  { cles: ["beurre de cacahuete", "beurre de cacahuetes", "beurre d'arachide", "puree de cacahuete"], kcal: 600, prot: 25 },
  { cles: ["puree d'amande", "puree d'amandes"], kcal: 610, prot: 21 },
  { cles: ["beurre"], kcal: 740, prot: 0.7 },
  // Matières grasses, graines, fruits à coque
  { cles: ["huile"], kcal: 900, prot: 0 },
  { cles: ["amandes", "amande"], kcal: 600, prot: 21 },
  { cles: ["noix de cajou"], kcal: 580, prot: 18 },
  { cles: ["noisettes", "noisette"], kcal: 650, prot: 15 },
  { cles: ["cacahuetes", "cacahuete", "arachides"], kcal: 590, prot: 26 },
  { cles: ["noix"], kcal: 680, prot: 15 },
  { cles: ["graines de chia"], kcal: 480, prot: 17 },
  { cles: ["graines de sesame", "sesame", "graines de courge", "graines de tournesol", "graines"], kcal: 570, prot: 20 },
  { cles: ["avocat"], kcal: 160, prot: 2, piece: 150 },
  { cles: ["olives", "olive"], kcal: 150, prot: 1 },
  // Sucré
  { cles: ["miel"], kcal: 320, prot: 0.3 },
  { cles: ["sirop d'erable", "sirop d'agave"], kcal: 270, prot: 0 },
  { cles: ["sucre"], kcal: 400, prot: 0 },
  { cles: ["confiture"], kcal: 250, prot: 0.5 },
  { cles: ["chocolat"], kcal: 550, prot: 8 },
  { cles: ["cacao"], kcal: 350, prot: 20 },
  { cles: ["compote"], kcal: 70, prot: 0.3, piece: 100 },
  // Sauces et condiments
  { cles: ["houmous"], kcal: 250, prot: 7 },
  { cles: ["pesto"], kcal: 450, prot: 5 },
  { cles: ["mayonnaise"], kcal: 700, prot: 1 },
  { cles: ["ketchup"], kcal: 100, prot: 1.5 },
  { cles: ["concentre de tomate", "concentre de tomates"], kcal: 80, prot: 4 },
  { cles: ["sauce tomate", "coulis de tomate", "tomates concassees", "tomate concassee", "passata"], kcal: 30, prot: 1.5 },
  { cles: ["sauce soja"], kcal: 60, prot: 8 },
  { cles: ["miso"], kcal: 200, prot: 12 },
  { cles: ["moutarde"], kcal: 150, prot: 7 },
  { cles: ["vinaigre"], kcal: 20, prot: 0 },
  { cles: ["bouillon"], kcal: 5, prot: 0.5 },
  { cles: ["levure"], kcal: 300, prot: 40 },
  { cles: ["sel", "poivre", "epices", "epice", "curry", "paprika", "cumin", "eau"], kcal: 0, prot: 0 },
  // Fruits
  { cles: ["banane", "bananes"], kcal: 90, prot: 1.1, piece: 120 },
  { cles: ["pomme", "pommes"], kcal: 54, prot: 0.3, piece: 150 },
  { cles: ["poire", "poires"], kcal: 55, prot: 0.4, piece: 160 },
  { cles: ["orange", "oranges", "clementine", "clementines"], kcal: 47, prot: 0.9, piece: 130 },
  { cles: ["fruits rouges", "framboises", "framboise", "myrtilles", "myrtille"], kcal: 50, prot: 1 },
  { cles: ["fraises", "fraise"], kcal: 33, prot: 0.7 },
  { cles: ["raisins secs", "fruits secs"], kcal: 300, prot: 3 },
  { cles: ["raisin"], kcal: 70, prot: 0.7 },
  { cles: ["kiwi", "kiwis"], kcal: 60, prot: 1.1, piece: 75 },
  { cles: ["mangue"], kcal: 60, prot: 0.8, piece: 300 },
  { cles: ["ananas"], kcal: 50, prot: 0.5 },
  { cles: ["dattes", "datte"], kcal: 280, prot: 2, piece: 10 },
  { cles: ["citron"], kcal: 30, prot: 1, piece: 60 },
  { cles: ["jus d'orange", "jus de fruit", "jus de fruits"], kcal: 45, prot: 0.7 },
  { cles: ["fruit", "fruits"], kcal: 55, prot: 0.7, piece: 130 },
  // Légumes
  { cles: ["tomates cerises", "tomate cerise", "tomate", "tomates"], kcal: 20, prot: 0.9, piece: 120 },
  { cles: ["carotte", "carottes"], kcal: 36, prot: 0.8, piece: 100 },
  { cles: ["courgette", "courgettes"], kcal: 17, prot: 1.2, piece: 200 },
  { cles: ["brocoli", "brocolis"], kcal: 30, prot: 2.8 },
  { cles: ["chou-fleur", "chou fleur"], kcal: 25, prot: 2 },
  { cles: ["epinards", "epinard"], kcal: 23, prot: 2.9 },
  { cles: ["salade", "laitue", "roquette", "mache"], kcal: 15, prot: 1.4 },
  { cles: ["concombre"], kcal: 15, prot: 0.7, piece: 300 },
  { cles: ["poivron", "poivrons"], kcal: 26, prot: 1, piece: 150 },
  { cles: ["oignon", "oignons", "echalote", "echalotes"], kcal: 40, prot: 1.1, piece: 100 },
  { cles: ["ail"], kcal: 130, prot: 6, piece: 5 },
  { cles: ["champignons", "champignon"], kcal: 22, prot: 3 },
  { cles: ["aubergine", "aubergines"], kcal: 25, prot: 1, piece: 250 },
  { cles: ["poireau", "poireaux"], kcal: 30, prot: 1.5, piece: 150 },
  { cles: ["pak choi", "chou"], kcal: 20, prot: 1.4 },
  { cles: ["radis"], kcal: 16, prot: 0.7 },
  { cles: ["betterave"], kcal: 43, prot: 1.6 },
  { cles: ["courge", "potiron", "butternut", "potimarron"], kcal: 30, prot: 1 },
  { cles: ["gingembre"], kcal: 80, prot: 1.8 },
  { cles: ["ciboule", "ciboulette", "persil", "coriandre", "basilic", "menthe", "herbes"], kcal: 30, prot: 3 },
  { cles: ["legumes", "legume", "crudites"], kcal: 30, prot: 2 },
]

const normaliser = (texte: string) =>
  texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/[’`]/g, "'")
    .trim()

// Mot entier : « ail » ne doit pas se trouver dans « volaille », ni « lait » dans « laitue ».
const contient = (texte: string, cle: string) =>
  new RegExp(`(^|[^a-z])${cle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(texte)

// L'aliment de la table qui correspond au nom, en préférant la clé la plus précise :
// « lait de coco » l'emporte sur « lait », « riz cuit » sur « riz ».
function trouver(nom: string): Aliment | null {
  const texte = normaliser(nom)
  let meilleur: { aliment: Aliment; longueur: number } | null = null
  for (const aliment of ALIMENTS) {
    for (const cle of aliment.cles) {
      if (cle.length > (meilleur?.longueur ?? 0) && contient(texte, cle)) meilleur = { aliment, longueur: cle.length }
    }
  }
  return meilleur?.aliment ?? null
}

// Grammes par unité, quand l'unité est une mesure. Les liquides sont comptés à 1 g par ml.
const GRAMMES: [RegExp, number][] = [
  [/^(g|gr|gramme|grammes)$/, 1],
  [/^(kg|kilo|kilos)$/, 1000],
  [/^(ml|millilitre|millilitres)$/, 1],
  [/^(cl)$/, 10],
  [/^(l|litre|litres)$/, 1000],
  [/^(c a soupe|cs|cas|cuillere a soupe|cuilleres a soupe|cuil a soupe)$/, 15],
  [/^(c a cafe|cc|cac|cuillere a cafe|cuilleres a cafe|cuil a cafe)$/, 5],
  [/^(verre|verres)$/, 200],
  [/^(tasse|tasses|bol|bols)$/, 250],
  [/^(poignee|poignees)$/, 30],
  [/^(pincee|pincees)$/, 0],
]
// Unités qui désignent une pièce de l'aliment : son poids vient de la table.
const PIECE = /^(|piece|pieces|unite|unites|tranche|tranches|gousse|gousses|pot|pots|dose|doses|boule|boules)$/

function enGrammes(quantite: number, unite: string | null, aliment: Aliment): number | null {
  const u = normaliser(unite ?? "").replace(/\./g, "")
  for (const [motif, grammes] of GRAMMES) if (motif.test(u)) return quantite * grammes
  if (PIECE.test(u) && aliment.piece !== undefined) return quantite * aliment.piece
  return null
}

export type Estimation = {
  kcal: number
  proteines: number
  // Ingrédients pris en compte, et ceux qui n'ont pas pu l'être, avec la raison.
  comptes: string[]
  ignores: { nom: string; raison: "inconnu" | "sans quantité" | "unité inconnue" }[]
}

export function estimerPlat(ingredients: IngredientAEstimer[]): Estimation {
  const estimation: Estimation = { kcal: 0, proteines: 0, comptes: [], ignores: [] }
  let kcal = 0
  let proteines = 0

  for (const ingredient of ingredients) {
    const nom = ingredient.nom.trim()
    if (!nom) continue
    const aliment = trouver(nom)
    if (!aliment) {
      estimation.ignores.push({ nom, raison: "inconnu" })
      continue
    }
    if (ingredient.quantite === null) {
      // Un condiment sans valeur (sel, épices) ne manque pas au calcul.
      if (aliment.kcal === 0) estimation.comptes.push(nom)
      else estimation.ignores.push({ nom, raison: "sans quantité" })
      continue
    }
    const grammes = enGrammes(ingredient.quantite, ingredient.unite, aliment)
    if (grammes === null) {
      estimation.ignores.push({ nom, raison: "unité inconnue" })
      continue
    }
    kcal += (grammes * aliment.kcal) / 100
    proteines += (grammes * aliment.prot) / 100
    estimation.comptes.push(nom)
  }

  estimation.kcal = Math.round(kcal / 10) * 10
  estimation.proteines = Math.round(proteines)
  return estimation
}
