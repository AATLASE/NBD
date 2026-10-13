// Ouvre un fichier de tableur choisi sur le téléphone et le rend sous forme de tableau de textes.
// Tout se passe dans le navigateur : le fichier n'est envoyé nulle part.

import { strFromU8, unzipSync } from "fflate"

import type { Tableau } from "@/lib/import/colonnes"

export const TAILLE_MAX = 10 * 1024 * 1024
export const LIGNES_MAX = 50_000

export type Lecture = { ok: true; tableau: Tableau; tronque: boolean } | { ok: false; message: string }

const ILLISIBLE = "Ce fichier n'a pas pu être lu. Enregistre-le en .xlsx ou en .csv, puis réessaie."

// --- CSV -----------------------------------------------------------------------

// Excel en français enregistre ses CSV en Windows-1252 ; les applications en UTF-8, parfois
// en UTF-16. On essaie dans cet ordre, sans jamais afficher de caractères cassés.
function decoder(octets: Uint8Array) {
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder("utf-16le").decode(octets)
  if (octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder("utf-16be").decode(octets)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets)
  } catch {
    return new TextDecoder("windows-1252").decode(octets)
  }
}

// Le séparateur le plus fréquent de la première ligne, hors guillemets : « ; » pour un Excel
// français, « , » pour la plupart des applications, la tabulation pour un copier-coller.
function trouverSeparateur(texte: string) {
  const compte: Record<string, number> = { ";": 0, ",": 0, "\t": 0 }
  let entreGuillemets = false
  for (const caractere of texte) {
    if (caractere === '"') entreGuillemets = !entreGuillemets
    else if (!entreGuillemets && (caractere === "\n" || caractere === "\r")) break
    else if (!entreGuillemets && caractere in compte) compte[caractere]! += 1
  }
  return (Object.entries(compte).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as string
}

export function lireCsv(texte: string): Tableau {
  const source = texte.replace(/^﻿/, "")
  const separateur = trouverSeparateur(source)
  const tableau: Tableau = []
  let ligne: string[] = []
  let champ = ""
  let entreGuillemets = false

  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (entreGuillemets) {
      if (c !== '"') champ += c
      else if (source[i + 1] === '"') {
        champ += '"'
        i++
      } else entreGuillemets = false
    } else if (c === '"') entreGuillemets = true
    else if (c === separateur) {
      ligne.push(champ)
      champ = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++
      ligne.push(champ)
      tableau.push(ligne)
      ligne = []
      champ = ""
    } else champ += c
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ)
    tableau.push(ligne)
  }
  return tableau
}

// --- Excel (.xlsx) ---------------------------------------------------------------

// Un .xlsx est une archive de fichiers XML. On y lit la première feuille qui contient des
// données : ses cellules, et la table des textes partagés à laquelle elles renvoient.

function xml(archive: Record<string, Uint8Array>, chemin: string) {
  const octets = archive[chemin]
  return octets ? new DOMParser().parseFromString(strFromU8(octets), "application/xml") : null
}

const texteDe = (noeud: Element) =>
  Array.from(noeud.getElementsByTagName("t"))
    // Les annotations phonétiques (japonais) doublent le texte : on les laisse de côté.
    .filter((t) => t.parentElement?.localName !== "rPh")
    .map((t) => t.textContent ?? "")
    .join("")

// « C7 » : la colonne C, donc l'indice 2.
function indiceDeColonne(reference: string) {
  let indice = 0
  for (const lettre of reference.replace(/\d+$/, "")) indice = indice * 26 + (lettre.charCodeAt(0) - 64)
  return indice - 1
}

function cheminsDesFeuilles(archive: Record<string, Uint8Array>) {
  const classeur = xml(archive, "xl/workbook.xml")
  const liens = xml(archive, "xl/_rels/workbook.xml.rels")
  const cibles = new Map(
    Array.from(liens?.getElementsByTagName("Relationship") ?? []).map((lien) => [
      lien.getAttribute("Id"),
      lien.getAttribute("Target") ?? "",
    ])
  )
  const chemins = Array.from(classeur?.getElementsByTagName("sheet") ?? [])
    .map((feuille) => cibles.get(feuille.getAttribute("r:id")))
    .filter((cible): cible is string => Boolean(cible))
    .map((cible) => (cible.startsWith("/") ? cible.slice(1) : `xl/${cible}`))
  // Classeur inhabituel : on se rabat sur les feuilles trouvées dans l'archive.
  return chemins.length > 0
    ? chemins
    : Object.keys(archive)
        .filter((nom) => /^xl\/worksheets\/[^/]+\.xml$/.test(nom))
        .sort()
}

function lireFeuille(archive: Record<string, Uint8Array>, chemin: string, partages: string[]): Tableau {
  const feuille = xml(archive, chemin)
  const tableau: Tableau = []
  for (const rangee of Array.from(feuille?.getElementsByTagName("row") ?? [])) {
    const ligne: string[] = []
    let suivante = 0
    for (const c of Array.from(rangee.getElementsByTagName("c"))) {
      const reference = c.getAttribute("r")
      const colonne = reference ? indiceDeColonne(reference) : suivante
      suivante = colonne + 1
      const type = c.getAttribute("t")
      const valeur = c.getElementsByTagName("v")[0]?.textContent ?? ""
      let texte = valeur
      if (type === "s") texte = partages[Number(valeur)] ?? ""
      else if (type === "inlineStr") texte = texteDe(c)
      else if (type === "b") texte = valeur === "1" ? "oui" : "non"
      // Un nombre : Excel écrit parfois 62.50000000000001 pour 62,5.
      else if (type !== "str" && valeur !== "" && Number.isFinite(Number(valeur))) {
        texte = String(Number(Number(valeur).toPrecision(12)))
      }
      while (ligne.length < colonne) ligne.push("")
      ligne[colonne] = texte
    }
    tableau.push(ligne)
    if (tableau.length >= LIGNES_MAX) break
  }
  return tableau
}

function lireXlsx(octets: Uint8Array): Tableau {
  const archive = unzipSync(octets, {
    filter: (fichier) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(fichier.name),
  })
  const partages = Array.from(xml(archive, "xl/sharedStrings.xml")?.getElementsByTagName("si") ?? []).map(texteDe)

  for (const chemin of cheminsDesFeuilles(archive)) {
    const tableau = lireFeuille(archive, chemin, partages)
    if (tableau.some((ligne) => ligne.some((texte) => texte.trim() !== ""))) return tableau
  }
  return []
}

// --- Fichier ---------------------------------------------------------------------

const commencePar = (octets: Uint8Array, signature: number[]) => signature.every((octet, i) => octets[i] === octet)

export async function lireFichier(fichier: File): Promise<Lecture> {
  if (fichier.size > TAILLE_MAX) {
    return { ok: false, message: "Ce fichier dépasse 10 Mo. Garde seulement la feuille utile, puis réessaie." }
  }
  let octets: Uint8Array
  try {
    octets = new Uint8Array(await fichier.arrayBuffer())
  } catch {
    return { ok: false, message: ILLISIBLE }
  }

  let tableau: Tableau
  try {
    if (commencePar(octets, [0x50, 0x4b])) tableau = lireXlsx(octets)
    else if (commencePar(octets, [0xd0, 0xcf, 0x11, 0xe0])) {
      return {
        ok: false,
        message:
          "C'est un ancien fichier Excel (.xls). Ouvre-le et enregistre-le au format .xlsx ou .csv, puis réessaie.",
      }
    } else if (commencePar(octets, [0x25, 0x50, 0x44, 0x46])) {
      return { ok: false, message: "C'est un PDF. L'import lit les tableaux Excel (.xlsx) et CSV." }
    } else tableau = lireCsv(decoder(octets))
  } catch {
    return { ok: false, message: ILLISIBLE }
  }

  const utiles = tableau.filter((ligne) => ligne.some((texte) => texte.trim() !== ""))
  if (utiles.length < 2) {
    return { ok: false, message: "Ce fichier ne contient pas de tableau : il faut une ligne de titres et au moins une ligne." }
  }
  return { ok: true, tableau: utiles.slice(0, LIGNES_MAX), tronque: utiles.length > LIGNES_MAX }
}
