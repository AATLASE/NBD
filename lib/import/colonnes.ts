// Lecture tolérante d'un tableau venu d'un tableur : on reconnaît les colonnes à leur titre,
// en français ou en anglais, dans n'importe quel ordre, et on comprend les valeurs telles
// qu'on les tape (« 62,5 », « 8-12 », « 1 min 30 », « Lun »). Fonctions pures.

import { JOURS, type Jour, type Slot } from "@/lib/libelles"

export type Tableau = string[][]

export function normaliser(texte: string) {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// --- Colonnes ------------------------------------------------------------------

// Unités écrites dans un titre de colonne (« Charge (kg) », « Repos en s ») : elles ne changent
// pas le sens de la colonne.
const UNITES = /\b(kg|kgs|lb|lbs|g|gr|kcal|s|sec|secs|secondes|min|mn|minutes|km|m|en)\b/g

const sansUnite = (cle: string) => cle.replace(UNITES, " ").replace(/\s+/g, " ").trim()

export type Colonnes<C extends string> = Partial<Record<C, number>>

// Associe chaque champ à une colonne. Les titres exacts passent avant les titres « à une unité
// près », et, pour un même champ, les alias sont essayés dans l'ordre où ils sont déclarés.
export function reconnaitre<C extends string>(
  entetes: readonly string[],
  alias: Record<C, readonly string[]>
): Colonnes<C> {
  const cles = entetes.map((entete) => normaliser(entete ?? ""))
  const colonnes: Colonnes<C> = {}
  const prises = new Set<number>()

  for (const lire of [(cle: string) => cle, sansUnite]) {
    for (const champ of Object.keys(alias) as C[]) {
      if (colonnes[champ] !== undefined) continue
      trouver: for (const nom of alias[champ]) {
        for (let i = 0; i < cles.length; i++) {
          if (!prises.has(i) && cles[i] !== "" && lire(cles[i]!) === nom) {
            colonnes[champ] = i
            prises.add(i)
            break trouver
          }
        }
      }
    }
  }
  return colonnes
}

// La ligne de titres n'est pas toujours la première (un tableur commence souvent par un titre).
// On prend la première ligne, parmi les 15 premières, où toutes les colonnes requises sont là.
export function trouverEntetes<C extends string>(
  tableau: Tableau,
  alias: Record<C, readonly string[]>,
  requises: readonly C[]
): { ligne: number; colonnes: Colonnes<C>; entetes: string[] } | null {
  for (let ligne = 0; ligne < Math.min(tableau.length, 15); ligne++) {
    const colonnes = reconnaitre(tableau[ligne]!, alias)
    if (requises.every((champ) => colonnes[champ] !== undefined)) {
      return { ligne, colonnes, entetes: tableau[ligne]! }
    }
  }
  return null
}

export function cellule(ligne: readonly string[], colonne: number | undefined) {
  return colonne === undefined ? "" : (ligne[colonne] ?? "").trim()
}

// --- Valeurs -------------------------------------------------------------------

// « 62,5 », « 1 250 », « 1.250,5 », « 80 kg » : le premier nombre du texte.
export function lireNombre(texte: string): number | null {
  const propre = texte.replace(/(\d)[\s  ](?=\d{3}\b)/g, "$1")
  const trouve = propre.match(/-?\d+(?:[.,]\d+)*/)
  if (!trouve) return null
  let brut = trouve[0]
  // Deux séparateurs : le dernier est la virgule décimale, l'autre sépare les milliers.
  if (brut.includes(".") && brut.includes(",")) {
    const decimale = brut.lastIndexOf(".") > brut.lastIndexOf(",") ? "." : ","
    brut = brut.replace(decimale === "." ? /,/g : /\./g, "")
  }
  const nombre = Number(brut.replace(",", "."))
  return Number.isFinite(nombre) ? nombre : null
}

export function lireEntier(texte: string): number | null {
  const nombre = lireNombre(texte)
  return nombre === null ? null : Math.round(nombre)
}

const A_UNE_DUREE = /\d\s*(s|sec|secs|seconde|secondes|min|mn|minute|minutes|h)\b|\d[:'′]\d/

// « 90 », « 90 s », « 1:30 », « 1 min 30 », « 1'30 », « 2 min » : une durée en secondes.
export function lireDureeSec(texte: string): number | null {
  const t = texte.toLowerCase().trim()
  if (!t) return null
  const horloge = t.match(/^(\d+)\s*[:'′]\s*(\d{1,2})/)
  if (horloge) return Number(horloge[1]) * 60 + Number(horloge[2])
  const minutes = t.match(/(\d+(?:[.,]\d+)?)\s*(?:min|mn|minute|minutes)\s*(\d+)?/)
  if (minutes) return Math.round(Number(minutes[1]!.replace(",", ".")) * 60 + Number(minutes[2] ?? 0))
  const nombre = lireNombre(t)
  return nombre === null ? null : Math.round(nombre)
}

// Durée d'une séance, en minutes : « 45 », « 1h 5m », « 1 h 15 », « 50 min », ou des secondes
// quand le nombre est trop grand pour être des minutes (export de Strong).
export function lireDureeMin(texte: string): number | null {
  const t = texte.toLowerCase().trim()
  if (!t) return null
  const heures = t.match(/(\d+)\s*h(?:\s*(\d+))?/)
  if (heures) return Number(heures[1]) * 60 + Number(heures[2] ?? 0)
  const nombre = lireNombre(t)
  if (nombre === null) return null
  return Math.round(nombre > 600 ? nombre / 60 : nombre)
}

export type Repetitions = {
  series: number | null
  repsMin: number | null
  repsMax: number | null
  dureeSec: number | null
}

// Ce qu'on tape dans une colonne « Répétitions » : « 10 », « 8-12 », « 8 à 12 », « 40 s »,
// et même « 4 x 8-10 » quand le nombre de séries est écrit avec.
export function lireRepetitions(texte: string): Repetitions {
  let t = texte.toLowerCase().replace(/[–—]/g, "-").trim()
  const vide: Repetitions = { series: null, repsMin: null, repsMax: null, dureeSec: null }
  if (!t) return vide

  let series: number | null = null
  const produit = t.match(/^(\d+)\s*[x×*]\s*(.+)$/)
  if (produit) {
    series = Number(produit[1])
    t = produit[2]!
  }
  if (A_UNE_DUREE.test(t)) return { ...vide, series, dureeSec: lireDureeSec(t) }

  const plage = t.match(/(\d+)\s*(?:-|à|a|to|\/)\s*(\d+)/)
  if (plage) {
    const [a, b] = [Number(plage[1]), Number(plage[2])]
    return { series, repsMin: Math.min(a, b), repsMax: Math.max(a, b), dureeSec: null }
  }
  const seul = t.match(/\d+/)
  if (seul) return { series, repsMin: Number(seul[0]), repsMax: Number(seul[0]), dureeSec: null }
  return { ...vide, series }
}

// Une date telle qu'un tableur ou un export l'écrit, rendue en 'AAAA-MM-JJ'.
export function lireDate(texte: string): string | null {
  const t = texte.trim()
  if (!t) return null
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // Jour en premier, à la française.
  const fr = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/)
  if (fr) return `${fr[3]}-${fr[2]!.padStart(2, "0")}-${fr[1]!.padStart(2, "0")}`
  // Numéro de série d'Excel : nombre de jours depuis le 30 décembre 1899.
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000)
    return date.toISOString().slice(0, 10)
  }
  // « 1 Mar 2026, 18:22 » (Hevy) et autres écritures en toutes lettres.
  if (!/[a-z]{3}/i.test(t)) return null
  const lue = new Date(t.replace(",", ""))
  if (Number.isNaN(lue.getTime())) return null
  const mois = String(lue.getMonth() + 1).padStart(2, "0")
  return `${lue.getFullYear()}-${mois}-${String(lue.getDate()).padStart(2, "0")}`
}

const JOUR_PAR_NOM: Record<string, Jour> = {}
const NOMS_DE_JOUR: [Jour, string[]][] = [
  ["lundi", ["lundi", "lun", "monday", "mon"]],
  ["mardi", ["mardi", "mar", "tuesday", "tue", "tues"]],
  ["mercredi", ["mercredi", "mer", "wednesday", "wed"]],
  ["jeudi", ["jeudi", "jeu", "thursday", "thu", "thur", "thurs"]],
  ["vendredi", ["vendredi", "ven", "friday", "fri"]],
  ["samedi", ["samedi", "sam", "saturday", "sat"]],
  ["dimanche", ["dimanche", "dim", "sunday", "sun"]],
]
for (const [jour, noms] of NOMS_DE_JOUR) for (const nom of noms) JOUR_PAR_NOM[nom] = jour

function jourDeLaDate(iso: string): Jour {
  const [annee, mois, jour] = iso.split("-").map(Number)
  return JOURS[(new Date(annee!, mois! - 1, jour!).getDay() + 6) % 7]!
}

// « Lundi », « lun », « Monday », « Jour 3 », « J3 », ou une date.
export function lireJour(texte: string): Jour | null {
  const cle = normaliser(texte)
  if (!cle) return null
  if (JOUR_PAR_NOM[cle]) return JOUR_PAR_NOM[cle]
  const numero = cle.match(/^(?:jour|j|day|d)?\s*([1-7])$/)
  if (numero) return JOURS[Number(numero[1]) - 1]!
  const date = lireDate(texte)
  return date ? jourDeLaDate(date) : null
}

// Le plan de menus tourne sur deux semaines : « 1 », « Semaine 2 », « S1 », « A » ou « B ».
export function lireSemaine(texte: string): number | null {
  const cle = normaliser(texte)
  if (cle === "a") return 1
  if (cle === "b") return 2
  const numero = cle.match(/^(?:semaine|sem|s|week|w)?\s*(\d{1,2})$/)
  return numero ? Number(numero[1]) : null
}

export function lireSlot(texte: string): Slot | null {
  const cle = normaliser(texte)
  if (!cle) return null
  if (/petit dej|breakfast|^matin$|^pdj$/.test(cle)) return "petit_dej"
  if (/collation|snack|gouter|encas|en cas/.test(cle)) {
    return /matin|morning|^collation 1$|^snack 1$/.test(cle) ? "collation_matin" : "collation_aprem"
  }
  if (/dejeuner|lunch|^midi$/.test(cle)) return "dejeuner"
  if (/diner|dinner|souper|supper|^soir$/.test(cle)) return "diner"
  return null
}

export function lireLieu(texte: string): "salle" | "maison" | "exterieur" | null {
  const cle = normaliser(texte)
  if (/salle|gym|club/.test(cle)) return "salle"
  if (/maison|home|domicile|appart/.test(cle)) return "maison"
  if (/exterieur|dehors|outdoor|outside|parc|street/.test(cle)) return "exterieur"
  return null
}
