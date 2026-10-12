"use client"

import { useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useState, useSyncExternalStore } from "react"

import { estDifferable, mettreEnAttente } from "@/lib/file-attente"
import { annuler, type ResultatEdition } from "@/lib/mutations"
import { horsLigne } from "@/lib/reseau"

// Côté écran de toute modification : mise à jour optimiste du cache, appel de la couche
// d'écriture, puis bandeau « Annuler ». Un échec remet l'affichage comme avant.
// Sans réseau, une saisie du quotidien (voir lib/file-attente.ts) attend sur le téléphone ;
// toute autre modification est refusée tout de suite.

// --- Bandeau ---------------------------------------------------------------------

export type Avis = {
  cle: number
  texte: string
  // Présent si l'action peut être annulée depuis le bandeau.
  groupeId: string | null
  erreur: boolean
}

let avis: Avis | null = null
let compteur = 0
const abonnes = new Set<() => void>()

function publier(suivant: Avis | null) {
  avis = suivant
  abonnes.forEach((rappel) => rappel())
}

export function annoncer(texte: string, options: { groupeId?: string; erreur?: boolean } = {}) {
  publier({ cle: ++compteur, texte, groupeId: options.groupeId ?? null, erreur: options.erreur ?? false })
}

export function fermerAvis(cle: number) {
  if (avis?.cle === cle) publier(null)
}

export function useAvis() {
  return useSyncExternalStore(
    (rappel) => {
      abonnes.add(rappel)
      return () => abonnes.delete(rappel)
    },
    () => avis,
    () => null
  )
}

// --- Exécution -------------------------------------------------------------------

// Tout ce qu'une modification du programme ou son annulation peut rendre périmé.
export const CLES_PROGRAMME = [
  "seances",
  "exercices",
  "plan-repas",
  "repas",
  "modifications",
  "journal-seances",
  "historique-series",
  "debut-programme",
  "pied",
  "course",
  "mesures",
  "journal-repas",
  "courses",
  "profil",
  "chat",
  "quota-ia",
]

type Optimiste<T> = { cle: QueryKey; maj: (actuel: T) => T }

export function useEdition() {
  const queryClient = useQueryClient()
  const [enCours, setEnCours] = useState(false)

  const rafraichir = () =>
    Promise.all(CLES_PROGRAMME.map((cle) => queryClient.invalidateQueries({ queryKey: [cle] })))

  // `silencieux` : pas de bandeau en cas de succès. L'action reste dans l'historique, et une
  // erreur s'affiche toujours.
  async function executer<T>(
    action: () => Promise<ResultatEdition>,
    optimiste?: Optimiste<T>,
    { silencieux = false }: { silencieux?: boolean } = {}
  ): Promise<ResultatEdition> {
    let avant: T | undefined
    if (optimiste) {
      // Une relecture en vol écraserait la mise à jour optimiste : on l'arrête d'abord.
      await queryClient.cancelQueries({ queryKey: optimiste.cle })
      avant = queryClient.getQueryData<T>(optimiste.cle)
      queryClient.setQueryData<T>(optimiste.cle, (actuel) =>
        actuel === undefined ? actuel : optimiste.maj(actuel)
      )
    }
    const retablir = () => {
      if (optimiste && avant !== undefined) queryClient.setQueryData<T>(optimiste.cle, avant)
    }
    // La saisie reste affichée et part dans la file : elle sera envoyée au retour du réseau.
    const attendre = (): ResultatEdition => {
      if (!estDifferable(action)) return { ok: false, message: "" }
      const compte = queryClient.getQueryData<{ id: string } | null>(["profil"])?.id ?? null
      mettreEnAttente(action.saisie.nom, action.saisie.args as never, compte)
      if (!silencieux) annoncer("Gardé sur ce téléphone. Envoi au retour du réseau.")
      return { ok: false, message: "En attente du réseau.", enAttente: true }
    }

    if (horsLigne()) {
      if (estDifferable(action)) return attendre()
      retablir()
      const message = "Hors ligne : cette modification a besoin du réseau. Rien n'a été changé."
      annoncer(message, { erreur: true })
      return { ok: false, message }
    }

    setEnCours(true)
    let resultat: ResultatEdition
    try {
      resultat = await action()
    } catch {
      // Le téléphone se croit connecté, mais la requête n'est pas passée.
      setEnCours(false)
      if (estDifferable(action)) return attendre()
      resultat = { ok: false, message: "Pas de réseau. Rien n'a été changé." }
    }
    setEnCours(false)

    if (!resultat.ok) {
      retablir()
      annoncer(resultat.message, { erreur: true })
    } else if (!silencieux) annoncer(resultat.resume, { groupeId: resultat.groupeId })
    await rafraichir()
    return resultat
  }

  async function defaire(groupeId: string) {
    if (horsLigne()) {
      annoncer("Hors ligne : l'annulation a besoin du réseau.", { erreur: true })
      return false
    }
    setEnCours(true)
    const resultat = await annuler(groupeId).catch(() => ({
      ok: false as const,
      message: "Pas de réseau. Rien n'a été annulé.",
    }))
    setEnCours(false)

    if (resultat.ok) annoncer("Modification annulée")
    else annoncer(resultat.message, { erreur: true })
    await rafraichir()
    return resultat.ok
  }

  return { executer, defaire, rafraichir, enCours }
}
