// Lit une activité enregistrée par une montre : le fichier FIT de Garmin et Coros, ou ses
// exports TCX et GPX. On n'en garde que le résumé (sport, date, durée, distance), pas la trace.
// Tout se passe dans le navigateur : le fichier n'est envoyé nulle part.

import { strFromU8, unzipSync } from "fflate"

import { TAILLE_MAX } from "@/lib/import/lecture"

export type Discipline = "course" | "marche" | "velo" | "musculation" | "autre"

export type Activite = {
  format: "FIT" | "TCX" | "GPX"
  discipline: Discipline
  libelle: string
  // Jour de l'activité, à l'heure du téléphone : 'AAAA-MM-JJ'.
  date: string
  dureeMin: number
  km: number | null
  kcal: number | null
  fcMoyenne: number | null
  // Séries de travail comptées par la montre pendant une séance de musculation.
  series: number | null
}

export type LectureActivite =
  | { ok: true; activite: Activite; remarques: string[] }
  // `tableur` : le fichier est un tableau, à lire avec l'import de séances ou de menus.
  | { ok: false; message: string; tableur?: boolean }

type Resume = {
  sport: string
  debut: Date | null
  secondes: number | null
  metres: number | null
  kcal: number | null
  fc: number | null
  series: number | null
}

// --- FIT -------------------------------------------------------------------------
// Format binaire : un en-tête, puis des enregistrements. Une « définition » annonce la forme des
// messages qui suivent (quels champs, quelle taille) ; les messages de données la respectent.
// Seuls trois types de messages nous servent : le résumé de séance, les points et les séries.

const SESSION = 18
const POINT = 20
const SERIE = 225
// Les dates d'un fichier FIT comptent les secondes depuis le 31 décembre 1989.
const EPOQUE_FIT = Date.UTC(1989, 11, 31) / 1000

type Champ = { numero: number; taille: number; type: number }
type Definition = { global: number; grandBoutiste: boolean; champs: Champ[]; taille: number }

// Valeur d'un champ numérique, ou null s'il porte la valeur « absente » de son type.
function valeur(vue: DataView, position: number, champ: Champ, grandBoutiste: boolean): number | null {
  const petit = !grandBoutiste
  switch (champ.type & 0x1f) {
    case 0: // enum
    case 2: // uint8
    case 13: {
      const v = vue.getUint8(position)
      return v === 0xff ? null : v
    }
    case 10: {
      const v = vue.getUint8(position)
      return v === 0 ? null : v
    }
    case 1: {
      const v = vue.getInt8(position)
      return v === 0x7f ? null : v
    }
    case 3: {
      const v = vue.getInt16(position, petit)
      return v === 0x7fff ? null : v
    }
    case 4: {
      const v = vue.getUint16(position, petit)
      return v === 0xffff ? null : v
    }
    case 11: {
      const v = vue.getUint16(position, petit)
      return v === 0 ? null : v
    }
    case 5: {
      const v = vue.getInt32(position, petit)
      return v === 0x7fffffff ? null : v
    }
    case 6: {
      const v = vue.getUint32(position, petit)
      return v === 0xffffffff ? null : v
    }
    case 12: {
      const v = vue.getUint32(position, petit)
      return v === 0 ? null : v
    }
    case 8: {
      const v = vue.getFloat32(position, petit)
      return Number.isFinite(v) ? v : null
    }
    default:
      return null
  }
}

const TAILLE_DU_TYPE: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 8: 4, 10: 1, 11: 2, 12: 4, 13: 1 }

function lireFit(octets: Uint8Array): Resume[] {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  const sessions: Record<number, number | null>[] = []
  let premierPoint: number | null = null
  let dernierPoint: number | null = null
  let distancePoints: number | null = null
  let series = 0
  let aDesSeries = false

  // Un fichier peut en enchaîner plusieurs, chacun avec son en-tête.
  let debut = 0
  while (debut + 12 <= octets.length) {
    const tailleEntete = octets[debut]!
    if (strFromU8(octets.subarray(debut + 8, debut + 12)) !== ".FIT") break
    const fin = Math.min(octets.length, debut + tailleEntete + vue.getUint32(debut + 4, true))
    const definitions = new Map<number, Definition>()
    let p = debut + tailleEntete

    while (p < fin) {
      const entete = octets[p++]!
      const compresse = (entete & 0x80) !== 0
      if (!compresse && (entete & 0x40) !== 0) {
        // Définition : octet réservé, boutisme, numéro du message, puis la liste des champs.
        const grandBoutiste = octets[p + 1] === 1
        const global = vue.getUint16(p + 2, !grandBoutiste)
        const nombre = octets[p + 4]!
        p += 5
        const champs: Champ[] = []
        let taille = 0
        for (let i = 0; i < nombre; i++, p += 3) {
          champs.push({ numero: octets[p]!, taille: octets[p + 1]!, type: octets[p + 2]! })
          taille += octets[p + 1]!
        }
        // Champs ajoutés par des applications tierces : on ne retient que la place qu'ils prennent.
        if ((entete & 0x20) !== 0) {
          const tiers = octets[p++]!
          for (let i = 0; i < tiers; i++, p += 3) taille += octets[p + 1]!
        }
        definitions.set(entete & 0x0f, { global, grandBoutiste, champs, taille })
        continue
      }

      const definition = definitions.get(compresse ? (entete >> 5) & 0x03 : entete & 0x0f)
      if (!definition) throw new Error("message sans définition")
      if (p + definition.taille > fin) break

      if (definition.global === SESSION || definition.global === POINT || definition.global === SERIE) {
        const message: Record<number, number | null> = {}
        let position = p
        for (const champ of definition.champs) {
          // Un champ plus petit que son type est tronqué : on ne le lit pas.
          if (champ.taille >= (TAILLE_DU_TYPE[champ.type & 0x1f] ?? Infinity)) {
            message[champ.numero] = valeur(vue, position, champ, definition.grandBoutiste)
          }
          position += champ.taille
        }
        if (definition.global === SESSION) sessions.push(message)
        else if (definition.global === POINT) {
          const instant = message[253] ?? null
          if (instant !== null) {
            premierPoint ??= instant
            dernierPoint = instant
          }
          // Distance cumulée, en centimètres.
          if (message[5] != null) distancePoints = message[5]
        } else {
          aDesSeries = true
          // Type de série : 1 pour une série de travail, 0 pour un repos.
          if (message[5] === 1) series += 1
        }
      }
      p += definition.taille
    }
    // Deux octets de contrôle ferment chaque fichier.
    debut = fin + 2
  }

  const enDate = (secondes: number | null | undefined) =>
    secondes == null ? null : new Date((secondes + EPOQUE_FIT) * 1000)
  const SPORTS: Record<number, string> = { 1: "running", 2: "cycling", 4: "fitness", 5: "swimming", 10: "training", 11: "walking", 15: "rowing", 17: "hiking" }

  if (sessions.length === 0) {
    // Enregistrement interrompu : pas de résumé, mais les points permettent de le reconstituer.
    if (premierPoint === null || dernierPoint === null) return []
    return [
      {
        sport: "",
        debut: enDate(premierPoint),
        secondes: dernierPoint - premierPoint,
        metres: distancePoints === null ? null : distancePoints / 100,
        kcal: null,
        fc: null,
        series: aDesSeries ? series : null,
      },
    ]
  }

  return sessions.map((session) => {
    // Sous-sport 20 : musculation, quel que soit le sport qui le porte.
    const sport = session[6] === 20 ? "strength" : (SPORTS[session[5] ?? -1] ?? "")
    return {
      sport,
      debut: enDate(session[2] ?? session[253]),
      // Temps en activité (pauses exclues), à défaut temps écoulé ; en millièmes de seconde.
      secondes: (session[8] ?? session[7]) == null ? null : (session[8] ?? session[7])! / 1000,
      metres: session[9] == null ? null : session[9] / 100,
      kcal: session[11] ?? null,
      fc: session[16] ?? null,
      series: sport === "strength" && aDesSeries ? series : null,
    }
  })
}

// --- TCX et GPX --------------------------------------------------------------------

const enfant = (parent: Element, nom: string) => Array.from(parent.children).find((e) => e.localName === nom)
const nombreDe = (element: Element | undefined) => {
  const lu = Number(element?.textContent)
  return element && Number.isFinite(lu) ? lu : null
}
const dateDe = (texte: string | null | undefined) => {
  const date = texte ? new Date(texte.trim()) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function lireTcx(document: Document): Resume[] {
  return Array.from(document.getElementsByTagName("Activity")).map((activite) => {
    const tours = Array.from(activite.children).filter((e) => e.localName === "Lap")
    const somme = (nom: string) => {
      const valeurs = tours.map((tour) => nombreDe(enfant(tour, nom))).filter((v): v is number => v !== null)
      return valeurs.length > 0 ? valeurs.reduce((a, b) => a + b, 0) : null
    }
    // Fréquence cardiaque moyenne : celle de chaque tour, pondérée par sa durée.
    let battements = 0
    let dureeAvecFc = 0
    for (const tour of tours) {
      const fc = nombreDe(enfant(enfant(tour, "AverageHeartRateBpm") ?? tour, "Value"))
      const secondes = nombreDe(enfant(tour, "TotalTimeSeconds"))
      if (fc !== null && secondes !== null) {
        battements += fc * secondes
        dureeAvecFc += secondes
      }
    }
    return {
      sport: activite.getAttribute("Sport") ?? "",
      debut: dateDe(enfant(activite, "Id")?.textContent ?? tours[0]?.getAttribute("StartTime")),
      secondes: somme("TotalTimeSeconds"),
      metres: somme("DistanceMeters"),
      kcal: somme("Calories"),
      fc: dureeAvecFc > 0 ? Math.round(battements / dureeAvecFc) : null,
      series: null,
    }
  })
}

// Distance entre deux points du globe, en mètres.
function ecart(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

function lireGpx(document: Document): Resume[] {
  return Array.from(document.getElementsByTagName("trk")).map((trace) => {
    let metres = 0
    let precedent: [number, number] | null = null
    let premier: Date | null = null
    let dernier: Date | null = null
    for (const point of Array.from(trace.getElementsByTagName("trkpt"))) {
      const position: [number, number] = [Number(point.getAttribute("lat")), Number(point.getAttribute("lon"))]
      if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue
      if (precedent) metres += ecart(precedent, position)
      precedent = position
      const instant = dateDe(enfant(point, "time")?.textContent)
      if (instant) {
        premier ??= instant
        dernier = instant
      }
    }
    return {
      sport: enfant(trace, "type")?.textContent ?? "",
      debut: premier,
      secondes: premier && dernier ? (dernier.getTime() - premier.getTime()) / 1000 : null,
      metres: precedent ? metres : null,
      kcal: null,
      fc: null,
      series: null,
    }
  })
}

// --- Fichier ---------------------------------------------------------------------

const DISCIPLINES: [RegExp, Discipline, string][] = [
  [/strength|muscu|weight/, "musculation", "Musculation"],
  [/trail/, "course", "Trail"],
  [/run|course|jog/, "course", "Course à pied"],
  [/hik|rando/, "marche", "Randonnée"],
  [/walk|marche/, "marche", "Marche"],
  [/cycl|bik|ride|velo|vélo/, "velo", "Vélo"],
  [/swim|natation/, "autre", "Natation"],
  [/row|rameur|aviron/, "autre", "Rameur"],
  [/training|fitness|cardio|hiit|workout/, "autre", "Entraînement"],
]

function versIso(date: Date) {
  const mois = String(date.getMonth() + 1).padStart(2, "0")
  return `${date.getFullYear()}-${mois}-${String(date.getDate()).padStart(2, "0")}`
}

function conclure(format: Activite["format"], resumes: Resume[]): LectureActivite {
  const resume = resumes[0]
  if (!resume) {
    return { ok: false, message: "Aucune activité dans ce fichier. Exporte une activité terminée, puis réessaie." }
  }
  if (!resume.debut || resume.secondes === null || resume.secondes < 30) {
    return {
      ok: false,
      message:
        format === "GPX"
          ? "Ce fichier GPX est un tracé sans horaires (un itinéraire), pas une activité enregistrée."
          : "Ce fichier ne dit ni quand ni combien de temps a duré l'activité : il ne peut pas être importé.",
    }
  }
  const maintenant = Date.now()
  if (resume.debut.getTime() > maintenant + 86_400_000 || resume.debut.getFullYear() < 2000) {
    return { ok: false, message: "La date de cette activité est incohérente : vérifie l'heure de ta montre." }
  }

  const sport = resume.sport.toLowerCase()
  const reconnue = DISCIPLINES.find(([motif]) => motif.test(sport))
  const km = resume.metres !== null && resume.metres >= 10 ? Math.round(resume.metres / 10) / 100 : null
  const remarques: string[] = []
  if (resumes.length > 1) remarques.push("Ce fichier contient plusieurs activités : seule la première est lue.")

  return {
    ok: true,
    remarques,
    activite: {
      format,
      discipline: reconnue?.[1] ?? "autre",
      libelle: reconnue?.[2] ?? "Activité",
      date: versIso(resume.debut),
      dureeMin: Math.max(1, Math.round(resume.secondes / 60)),
      km,
      kcal: resume.kcal !== null && resume.kcal > 0 ? Math.round(resume.kcal) : null,
      fcMoyenne: resume.fc !== null && resume.fc > 0 ? Math.round(resume.fc) : null,
      series: resume.series !== null && resume.series > 0 ? resume.series : null,
    },
  }
}

const estUnFit = (octets: Uint8Array) => octets.length >= 14 && strFromU8(octets.subarray(8, 12)) === ".FIT"

function lireOctets(octets: Uint8Array): LectureActivite {
  if (estUnFit(octets)) return conclure("FIT", lireFit(octets))

  // « Exporter le fichier d'origine » de Garmin Connect donne une archive qui contient le .fit.
  if (octets[0] === 0x50 && octets[1] === 0x4b) {
    let contenu: Uint8Array | undefined
    try {
      contenu = Object.values(unzipSync(octets, { filter: (fichier) => /\.(fit|tcx|gpx)$/i.test(fichier.name) }))[0]
    } catch {
      // Archive illisible : ce n'est pas à cet import de le dire, un classeur Excel en est une aussi.
    }
    if (contenu) return lireOctets(contenu)
    return { ok: false, tableur: true, message: "Ce fichier n'est pas une activité de montre (FIT, TCX ou GPX)." }
  }

  const texte = strFromU8(octets.subarray(0, 600)).replace(/^﻿/, "").trimStart()
  if (texte.startsWith("<")) {
    const document = new DOMParser().parseFromString(strFromU8(octets), "application/xml")
    const racine = document.documentElement.localName
    if (racine === "TrainingCenterDatabase") return conclure("TCX", lireTcx(document))
    if (racine === "gpx") return conclure("GPX", lireGpx(document))
  }
  return { ok: false, tableur: true, message: "Ce fichier n'est pas une activité de montre (FIT, TCX ou GPX)." }
}

export async function lireActivite(fichier: File): Promise<LectureActivite> {
  if (fichier.size > TAILLE_MAX) return { ok: false, message: "Ce fichier dépasse 10 Mo." }
  try {
    return lireOctets(new Uint8Array(await fichier.arrayBuffer()))
  } catch {
    return { ok: false, message: "Ce fichier d'activité est abîmé ou incomplet : il n'a pas pu être lu." }
  }
}
