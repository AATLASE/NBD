import { JOURS, type Jour } from "@/lib/libelles"

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" })

export function nombre(valeur: number) {
  return NOMBRE.format(valeur)
}

export function euros(valeur: number) {
  return EUROS.format(valeur)
}

// Les dates circulent en 'AAAA-MM-JJ', dans le fuseau du téléphone, comme les colonnes `date` de la base.
export function versIso(date: Date) {
  const mois = String(date.getMonth() + 1).padStart(2, "0")
  const jour = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${mois}-${jour}`
}

export function depuisIso(iso: string) {
  const [annee, mois, jour] = iso.split("-").map(Number)
  return new Date(annee!, mois! - 1, jour!)
}

export function decalerJours(iso: string, jours: number) {
  const date = depuisIso(iso)
  date.setDate(date.getDate() + jours)
  return versIso(date)
}

export function joursEntre(debutIso: string, finIso: string) {
  return Math.round((depuisIso(finIso).getTime() - depuisIso(debutIso).getTime()) / 86_400_000)
}

export function dateLongue(iso: string) {
  return DATE_LONGUE.format(depuisIso(iso))
}

const DATE_COURTE = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" })

export function dateCourte(iso: string) {
  return DATE_COURTE.format(depuisIso(iso))
}

export function jourDe(iso: string): Jour {
  // getDay() : dimanche = 0. JOURS commence au lundi.
  return JOURS[(depuisIso(iso).getDay() + 6) % 7]!
}

export function duree(secondes: number) {
  if (secondes < 60) return `${secondes} s`
  const minutes = Math.floor(secondes / 60)
  const reste = secondes % 60
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste}`
}

type Prescription = {
  series: number
  reps_min: number | null
  reps_max: number | null
  duree_sec: number | null
}

// « 4 × 6-8 », « 3 × 40 s », « 3 × 10 », ou « 5 séries » quand ni reps ni durée ne sont fixées.
export function prescription({ series, reps_min, reps_max, duree_sec }: Prescription) {
  if (duree_sec !== null) return `${series} × ${duree(duree_sec)}`
  if (reps_min !== null && reps_max !== null && reps_min !== reps_max) {
    return `${series} × ${reps_min}-${reps_max}`
  }
  const reps = reps_max ?? reps_min
  if (reps !== null) return `${series} × ${reps}`
  return series > 1 ? `${series} séries` : "1 série"
}

type Charge = {
  charge_depart_kg: number | null
  charge_cible_kg: number | null
}

export function charge({ charge_depart_kg, charge_cible_kg }: Charge) {
  if (charge_depart_kg === null) return null
  if (charge_cible_kg === null) return `${nombre(charge_depart_kg)} kg`
  return `${nombre(charge_depart_kg)} → ${nombre(charge_cible_kg)} kg`
}
