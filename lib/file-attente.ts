"use client"

import { useSyncExternalStore } from "react"

import {
  cocherArticle,
  cocherRepas,
  enregistrerDouleur,
  enregistrerDouleurLendemain,
  enregistrerHorsPlan,
  enregistrerPesee,
  enregistrerSeance,
  enregistrerSortie,
  marquerProtocole,
  type ResultatEdition,
} from "@/lib/mutations"

// File d'attente de synchronisation (SPEC, phase 8). Les saisies du quotidien faites sans
// réseau sont gardées sur le téléphone, puis envoyées dans l'ordre au retour du réseau.
// Seules ces écritures peuvent attendre : modifier la structure du programme demande le réseau.

const ACTIONS = {
  enregistrerSeance,
  enregistrerDouleur,
  marquerProtocole,
  enregistrerPesee,
  enregistrerSortie,
  enregistrerDouleurLendemain,
  cocherRepas,
  enregistrerHorsPlan,
  cocherArticle,
}
export type NomAction = keyof typeof ACTIONS

type Resultat = { ok: true } | { ok: false; message: string }

export type Saisie = {
  id: string
  nom: NomAction
  args: unknown[]
  // Compte qui a fait la saisie : elle n'est jamais envoyée sous un autre compte.
  compte: string | null
  essais: number
}

type Etat = { saisies: Saisie[]; envoi: boolean }

const CLE = "nbd:file-attente"
const ESSAIS_MAX = 4
const abonnes = new Set<() => void>()
const VIDE: Etat = { saisies: [], envoi: false }
let etat: Etat | undefined

function charger(): Etat {
  try {
    const brut = window.localStorage.getItem(CLE)
    const saisies = brut ? (JSON.parse(brut) as Saisie[]) : []
    return { saisies: Array.isArray(saisies) ? saisies.filter((s) => s.nom in ACTIONS) : [], envoi: false }
  } catch {
    return VIDE
  }
}

function lire(): Etat {
  if (etat === undefined) etat = charger()
  return etat
}

function publier(suivant: Etat) {
  etat = suivant
  try {
    window.localStorage.setItem(CLE, JSON.stringify(suivant.saisies))
  } catch {
    // Stockage plein ou indisponible : la file reste en mémoire le temps de la visite.
  }
  abonnes.forEach((rappel) => rappel())
}

export function useFileAttente() {
  return useSyncExternalStore(
    (rappel) => {
      abonnes.add(rappel)
      return () => abonnes.delete(rappel)
    },
    lire,
    () => VIDE
  )
}

export function mettreEnAttente<N extends NomAction>(
  nom: N,
  args: Parameters<(typeof ACTIONS)[N]>,
  compte: string | null
) {
  const actuel = lire()
  publier({ ...actuel, saisies: [...actuel.saisies, { id: crypto.randomUUID(), nom, args, compte, essais: 0 }] })
}

// Une écriture qui sait attendre : `executer` la met en file si le réseau manque.
export type Differable = (() => Promise<ResultatEdition>) & {
  saisie: { nom: NomAction; args: unknown[] }
}

export function differable<N extends Exclude<NomAction, "enregistrerSeance">>(
  nom: N,
  ...args: Parameters<(typeof ACTIONS)[N]>
): Differable {
  const action = ACTIONS[nom] as unknown as (...a: unknown[]) => Promise<ResultatEdition>
  return Object.assign(() => action(...args), { saisie: { nom, args } })
}

export const estDifferable = (action: unknown): action is Differable =>
  typeof action === "function" && "saisie" in action

// Envoie les saisies en attente, dans l'ordre. S'arrête au premier échec de réseau : le reste
// repartira à la prochaine tentative. `compte` est le compte connecté, s'il est connu.
export async function vider(compte: string | null): Promise<{ envoyees: number; rejets: string[] }> {
  const bilan = { envoyees: 0, rejets: [] as string[] }
  if (lire().envoi || lire().saisies.length === 0 || !navigator.onLine) return bilan
  publier({ ...lire(), envoi: true })

  const retirer = (id: string) => publier({ ...lire(), saisies: lire().saisies.filter((s) => s.id !== id) })
  while (lire().saisies.length > 0) {
    const saisie = lire().saisies[0]
    if (saisie.compte && compte && saisie.compte !== compte) {
      retirer(saisie.id)
      continue
    }
    try {
      const action = ACTIONS[saisie.nom] as unknown as (...a: unknown[]) => Promise<Resultat>
      const resultat = await action(...saisie.args)
      retirer(saisie.id)
      if (resultat.ok) bilan.envoyees += 1
      else bilan.rejets.push(resultat.message)
    } catch {
      // Toujours pas de réseau, ou serveur injoignable. Une saisie qui échoue encore et encore
      // alors que le réseau est là est abandonnée, pour ne pas bloquer les suivantes.
      if (navigator.onLine && saisie.essais + 1 >= ESSAIS_MAX) {
        retirer(saisie.id)
        bilan.rejets.push("Une saisie faite hors ligne n'a pas pu être envoyée.")
      } else if (navigator.onLine) {
        publier({
          ...lire(),
          saisies: lire().saisies.map((s) => (s.id === saisie.id ? { ...s, essais: s.essais + 1 } : s)),
        })
      }
      break
    }
  }
  publier({ ...lire(), envoi: false })
  return bilan
}
