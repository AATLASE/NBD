// Fabrique, sur le téléphone, le fichier Excel modèle à remplir : les bonnes colonnes et quelques
// lignes d'exemple. Un .xlsx s'ouvre correctement partout (Excel, Numbers, Google Sheets), là où
// un CSV dépend des réglages de langue du tableur.

import { strToU8, zipSync } from "fflate"

export type TypeImport = "seances" | "nutrition"

type Valeur = string | number | null

const MODELES: Record<TypeImport, { nom: string; largeurs: number[]; lignes: Valeur[][] }> = {
  seances: {
    nom: "modele-seances.xlsx",
    largeurs: [20, 12, 12, 30, 9, 13, 13, 11, 34],
    lignes: [
      ["Séance", "Jour", "Lieu", "Exercice", "Séries", "Répétitions", "Charge (kg)", "Repos (s)", "Note"],
      ["Haut du corps", "Lundi", "Salle", "Développé couché barre", 4, "6-8", 60, 120, "Exemple : remplace ces lignes par les tiennes"],
      [null, null, null, "Tirage vertical poulie", 4, "8-10", 50, 90, null],
      [null, null, null, "Planche", 3, "40 s", null, 45, "Une durée s'écrit avec « s »"],
      ["Bas du corps", "Jeudi", "Salle", "Squat barre", 4, "6-8", 80, 150, null],
      [null, null, null, "Fentes haltères", 3, "10", 14, 90, null],
    ],
  },
  nutrition: {
    nom: "modele-plan-nutrition.xlsx",
    largeurs: [10, 12, 18, 30, 16, 14, 13, 12, 46, 34],
    lignes: [
      ["Semaine", "Jour", "Repas", "Plat", "Calories (kcal)", "Protéines (g)", "Glucides (g)", "Lipides (g)", "Ingrédients", "Préparation"],
      [1, "Lundi", "Petit déjeuner", "Porridge banane", 450, 22, 60, 12, "60 g de flocons d'avoine, 250 ml de lait, 1 banane", "Exemple : remplace ces lignes par les tiennes"],
      [null, null, "Déjeuner", "Bol poulet riz", 620, 48, 70, 14, "150 g de poulet, 70 g de riz, 100 g de brocoli", null],
      [null, null, "Collation", "Skyr et fruits rouges", 180, 20, 18, 1, null, null],
      [null, null, "Dîner", "Omelette aux légumes", 480, 32, 12, 30, "3 œufs, 150 g de courgette, 5 g de beurre", null],
      [null, "Mardi", "Petit déjeuner", "Porridge banane", null, null, null, null, null, "Un plat déjà décrit plus haut : son nom suffit"],
    ],
  },
}

const echapper = (texte: string) =>
  texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function lettre(colonne: number) {
  let nom = ""
  for (let n = colonne + 1; n > 0; n = Math.floor((n - 1) / 26)) nom = String.fromCharCode(65 + ((n - 1) % 26)) + nom
  return nom
}

function feuille(lignes: Valeur[][], largeurs: number[]) {
  const colonnes = largeurs.map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`).join("")
  const rangees = lignes
    .map((ligne, r) => {
      const cellules = ligne
        .map((valeur, c) => {
          if (valeur === null) return ""
          const reference = `${lettre(c)}${r + 1}`
          // La première ligne porte les titres, en gras.
          const style = r === 0 ? ' s="1"' : ""
          return typeof valeur === "number"
            ? `<c r="${reference}"${style}><v>${valeur}</v></c>`
            : `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${echapper(valeur)}</t></is></c>`
        })
        .join("")
      return `<row r="${r + 1}">${cellules}</row>`
    })
    .join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${colonnes}</cols><sheetData>${rangees}</sheetData></worksheet>`
}

const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const TYPES = `${ENTETE}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
const LIENS = `${ENTETE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
const CLASSEUR = `${ENTETE}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Import" sheetId="1" r:id="rId1"/></sheets></workbook>`
const LIENS_DU_CLASSEUR = `${ENTETE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
// Deux styles : le texte courant, et les titres en gras.
const STYLES = `${ENTETE}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

export function creerModele(type: TypeImport) {
  const { nom, largeurs, lignes } = MODELES[type]
  const octets = zipSync({
    "[Content_Types].xml": strToU8(TYPES),
    "_rels/.rels": strToU8(LIENS),
    "xl/workbook.xml": strToU8(CLASSEUR),
    "xl/_rels/workbook.xml.rels": strToU8(LIENS_DU_CLASSEUR),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(feuille(lignes, largeurs)),
  })
  return { nom, octets }
}

export function telechargerModele(type: TypeImport) {
  const { nom, octets } = creerModele(type)
  const adresse = URL.createObjectURL(
    new Blob([octets.slice()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  )
  const lien = document.createElement("a")
  lien.href = adresse
  lien.download = nom
  document.body.append(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(adresse), 10_000)
}
