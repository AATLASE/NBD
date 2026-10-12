"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CloudUpload, WifiOff } from "lucide-react"
import { useCallback, useEffect, useMemo } from "react"

import { annoncer, CLES_PROGRAMME } from "@/lib/edition"
import { useFileAttente, vider } from "@/lib/file-attente"
import { restaurer, suivre } from "@/lib/persistance"
import { LECTURES, useCompte, useRepas, useSeances } from "@/lib/queries"
import { useEnLigne } from "@/lib/reseau"

const RELANCE_MS = 30_000
// Les écrans à adresse fixe. Ceux des séances et des recettes s'y ajoutent d'après les données.
const ECRANS = [
  "/sport",
  "/sport/seances",
  "/sport/pied",
  "/sport/course",
  "/sport/progression",
  "/nutrition",
  "/nutrition/menus",
  "/nutrition/recettes",
  "/nutrition/courses",
  "/nutrition/suivi",
  "/historique",
  "/chat",
]

// Socle hors ligne (SPEC, phase 8), présent sur tous les écrans :
//   - réaffiche au lancement les données gardées sur le téléphone, et les tient à jour ;
//   - installe le service worker, qui garde les pages ;
//   - envoie au retour du réseau les saisies faites sans lui ;
//   - dit en haut de l'écran quand on est hors ligne ou qu'il reste des saisies à envoyer.
export function SocleHorsLigne() {
  const client = useQueryClient()
  const enLigne = useEnLigne()
  const file = useFileAttente()
  const compte = useCompte()

  useEffect(() => {
    restaurer(client)
    return suivre(client)
  }, [client])

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") {
      // En développement, un service worker servirait d'anciennes versions des fichiers en cours
      // d'écriture : on retire celui qu'une version construite aurait laissé sur cette adresse.
      void navigator.serviceWorker.getRegistrations().then((installations) => installations.forEach((i) => void i.unregister()))
      return
    }
    navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_VERSION}`).catch(() => undefined)
  }, [])

  const envoyer = useCallback(async () => {
    const bilan = await vider(compte)
    if (bilan.envoyees > 0) {
      await Promise.all(CLES_PROGRAMME.map((cle) => client.invalidateQueries({ queryKey: [cle] })))
      annoncer(
        bilan.envoyees === 1
          ? "La saisie faite hors ligne est enregistrée"
          : `Les ${bilan.envoyees} saisies faites hors ligne sont enregistrées`
      )
    }
    if (bilan.rejets.length > 0) annoncer(bilan.rejets[0], { erreur: true })
  }, [client, compte])

  const enAttente = file.saisies.length
  useEffect(() => {
    if (!enLigne || enAttente === 0) return
    void envoyer()
    const relance = setInterval(() => void envoyer(), RELANCE_MS)
    const auRetour = () => {
      if (document.visibilityState === "visible") void envoyer()
    }
    document.addEventListener("visibilitychange", auRetour)
    return () => {
      clearInterval(relance)
      document.removeEventListener("visibilitychange", auRetour)
    }
  }, [enLigne, enAttente, envoyer])

  if (enLigne && enAttente === 0) return null

  const saisies = enAttente === 1 ? "1 saisie" : `${enAttente} saisies`
  const texte = !enLigne
    ? enAttente === 0
      ? "Hors ligne · données gardées sur ce téléphone"
      : `Hors ligne · ${saisies} en attente d'envoi`
    : file.envoi
      ? `Envoi de ${saisies}…`
      : `${saisies} en attente d'envoi`
  const Icone = enLigne ? CloudUpload : WifiOff

  return (
    <div
      data-etat-reseau
      role="status"
      className="sticky top-0 z-50 bg-foreground pt-[env(safe-area-inset-top)] text-background"
    >
      <p className="mx-auto flex h-8 max-w-lg items-center justify-center gap-2 px-4 text-sm font-medium">
        <Icone className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{texte}</span>
      </p>
    </div>
  )
}

// Tant que le réseau est là, prépare son absence : lit toutes les données de l'application et
// fait garder tous ses écrans, y compris ceux qui n'ont jamais été ouverts.
export function PreparationHorsLigne() {
  const client = useQueryClient()
  const enLigne = useEnLigne()
  const seances = useSeances()
  const repas = useRepas()

  useEffect(() => {
    if (!enLigne) return
    // Après l'écran en cours, pour ne pas lui disputer le réseau.
    const plusTard = setTimeout(() => LECTURES.forEach((lecture) => void client.prefetchQuery(lecture)), 1500)
    return () => clearTimeout(plusTard)
  }, [client, enLigne])

  const ecrans = useMemo(() => {
    if (!seances.data || !repas.data) return null
    return [
      ...ECRANS,
      ...seances.data.flatMap((seance) => [`/sport/seances/${seance.id}`, `/seance/${seance.id}`]),
      ...repas.data.map((plat) => `/nutrition/recettes/${plat.id}`),
    ].join("\n")
  }, [seances.data, repas.data])

  useEffect(() => {
    if (!enLigne || !ecrans || !("serviceWorker" in navigator)) return
    let actif = true
    void navigator.serviceWorker.ready.then((installation) => {
      if (actif) installation.active?.postMessage({ type: "PRECHARGER", urls: ecrans.split("\n") })
    })
    return () => {
      actif = false
    }
  }, [enLigne, ecrans])

  return null
}
