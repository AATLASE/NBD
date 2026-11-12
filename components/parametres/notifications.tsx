"use client"

import { cn } from "cn"
import { BellOff, BellRing, CalendarCheck, ClipboardList, Loader2, Send, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Carte } from "@/components/blocs"
import { AvatarCoach } from "@/components/coach/avatar"
import { Stepper } from "@/components/execution/stepper"
import type { Profil } from "@/components/parametres/editeurs"
import { Button } from "@/components/ui/button"
import { useAujourdhui } from "@/lib/aujourdhui"
import { COACH, estUnCoach, phraseDuCoach } from "@/lib/coachs"
import { annoncer, useEdition } from "@/lib/edition"
import { modifierProfil, type ChampsProfil } from "@/lib/mutations"
import {
  abonnerAppareil,
  configurationNotifications,
  desabonnerAppareil,
  envoyerEssai,
  type AppareilAAbonner,
} from "@/lib/notifications/actions"

// Notifications : le coach écrit au téléphone les jours de séance, après chaque séance et quand
// il propose d'ajuster le programme. L'activation vaut pour cet appareil ; ce qu'on reçoit et
// l'heure du rappel valent pour le compte, sur tous ses appareils.

type Etat =
  | { phase: "chargement" }
  | { phase: "serveur" }
  | { phase: "navigateur" }
  | { phase: "iphone" }
  | { phase: "installation" }
  | { phase: "refusees" }
  | { phase: "inactives"; cle: string }
  | { phase: "actives"; cle: string; abonnement: PushSubscription }

const estIphone = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
const installee = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true

// La clé publique VAPID est en base64 « url » ; le navigateur la veut en octets.
function octets(cle: string) {
  const base64 = (cle + "=".repeat((4 - (cle.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

// Le service worker n'existe que dans la version construite de l'application (components/hors-ligne.tsx).
const serviceWorkerPret = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resoudre) => setTimeout(() => resoudre(null), 4000)),
  ])

const fuseau = () => Intl.DateTimeFormat().resolvedOptions().timeZone

async function lireEtat(): Promise<Etat> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { phase: estIphone() && !installee() ? "iphone" : "navigateur" }
  }
  const { disponibles, clePublique } = await configurationNotifications()
  if (!disponibles || !clePublique) return { phase: "serveur" }
  if (Notification.permission === "denied") return { phase: "refusees" }
  const installation = await serviceWorkerPret()
  if (!installation) return { phase: "installation" }
  const abonnement = await installation.pushManager.getSubscription()
  if (!abonnement || Notification.permission !== "granted") return { phase: "inactives", cle: clePublique }
  // L'appareil est peut-être connu sous un autre compte, ou oublié du serveur : on le réinscrit.
  await abonnerAppareil(abonnement.toJSON() as AppareilAAbonner, fuseau())
  return { phase: "actives", cle: clePublique, abonnement }
}

export function ReglagesNotifications({ profil, onChoisirCoach }: { profil: Profil; onChoisirCoach: () => void }) {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" })
  const [action, setAction] = useState<"activer" | "desactiver" | "essai" | null>(null)

  useEffect(() => {
    let actif = true
    lireEtat()
      .then((suivant) => actif && setEtat(suivant))
      .catch(() => actif && setEtat({ phase: "navigateur" }))
    return () => {
      actif = false
    }
  }, [])

  async function activer() {
    if (etat.phase !== "inactives") return
    setAction("activer")
    try {
      // Demandée tout de suite, dans le geste : sur iPhone, une attente avant fait échouer la demande.
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setEtat({ phase: permission === "denied" ? "refusees" : "inactives", cle: etat.cle } as Etat)
        return
      }
      const installation = await navigator.serviceWorker.ready
      // Un ancien abonnement fait avec une autre clé empêche d'en créer un nouveau.
      await (await installation.pushManager.getSubscription())?.unsubscribe()
      const abonnement = await installation.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octets(etat.cle) })
      const resultat = await abonnerAppareil(abonnement.toJSON() as AppareilAAbonner, fuseau())
      if (!resultat.ok) {
        await abonnement.unsubscribe()
        annoncer(resultat.message ?? "Activation impossible. Réessaie.", { erreur: true })
        return
      }
      setEtat({ phase: "actives", cle: etat.cle, abonnement })
      annoncer("Notifications activées sur cet appareil")
    } catch {
      annoncer("Activation impossible sur cet appareil. Réessaie.", { erreur: true })
    } finally {
      setAction(null)
    }
  }

  async function desactiver() {
    if (etat.phase !== "actives") return
    setAction("desactiver")
    try {
      await desabonnerAppareil(etat.abonnement.endpoint)
      await etat.abonnement.unsubscribe()
      setEtat({ phase: "inactives", cle: etat.cle })
      annoncer("Plus de notifications sur cet appareil")
    } catch {
      annoncer("Désactivation impossible. Réessaie.", { erreur: true })
    } finally {
      setAction(null)
    }
  }

  async function essayer() {
    setAction("essai")
    try {
      const resultat = await envoyerEssai()
      annoncer(resultat.message, { erreur: !resultat.ok })
    } catch {
      annoncer("Envoi impossible. Vérifie ta connexion et réessaie.", { erreur: true })
    } finally {
      setAction(null)
    }
  }

  return (
    <>
      <Carte className="space-y-4 p-4">
        <Apercu profil={profil} onChoisirCoach={onChoisirCoach} />
        <EtatAppareil etat={etat} action={action} onActiver={activer} onDesactiver={desactiver} onEssayer={essayer} />
      </Carte>
      <Choix profil={profil} />
    </>
  )
}

// À quoi ressemblera le message : le coach en expéditeur, une phrase dans sa voix.
function Apercu({ profil, onChoisirCoach }: { profil: Profil; onChoisirCoach: () => void }) {
  const aujourdhui = useAujourdhui()
  const coach = estUnCoach(profil.coach) ? profil.coach : null
  return (
    <div className="space-y-2">
      <div aria-hidden="true" className="flex items-start gap-3 rounded-2xl bg-muted p-3">
        {coach ? (
          <AvatarCoach coach={coach} className="size-10 rounded-xl" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card">
            <BellRing className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{coach ? COACH[coach].nom : "Séance du jour"}</span>
            <span className="text-muted-foreground tabular-nums">{profil.notif_heure} h 00</span>
          </p>
          <p className="text-sm leading-snug">
            {coach && aujourdhui ? phraseDuCoach(coach, "seance", aujourdhui, 1) : "Une séance est prévue aujourd'hui."}
          </p>
        </div>
      </div>
      {coach ? (
        <p className="text-sm text-muted-foreground">
          C&apos;est {COACH[coach].nom} qui t&apos;écrit, avec sa façon de parler.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          <button type="button" onClick={onChoisirCoach} className="font-semibold text-foreground underline underline-offset-4">
            Choisis un coach
          </button>{" "}
          pour qu&apos;il t&apos;écrive lui-même.
        </p>
      )}
    </div>
  )
}

const MESSAGES: Record<"serveur" | "navigateur" | "iphone" | "installation" | "refusees", { titre: string; texte: string }> = {
  serveur: {
    titre: "Pas encore disponibles",
    texte: "Les notifications ne sont pas configurées sur le serveur de l'application.",
  },
  navigateur: {
    titre: "Ce navigateur ne les reçoit pas",
    texte: "Ouvre NBD dans Chrome, Edge, Firefox ou Safari à jour, ou depuis l'application installée.",
  },
  iphone: {
    titre: "Installe d'abord l'application",
    texte: "Sur iPhone, les notifications passent par l'application : touche Partager puis « Sur l'écran d'accueil », et ouvre NBD depuis son icône.",
  },
  installation: {
    titre: "Installation en cours",
    texte: "L'application finit de s'installer sur cet appareil. Recharge la page dans un instant.",
  },
  refusees: {
    titre: "Refusées sur cet appareil",
    texte: "Réautorise-les dans les réglages du téléphone (Notifications, puis NBD ou ton navigateur), puis reviens ici.",
  },
}

function EtatAppareil({
  etat,
  action,
  onActiver,
  onDesactiver,
  onEssayer,
}: {
  etat: Etat
  action: "activer" | "desactiver" | "essai" | null
  onActiver: () => void
  onDesactiver: () => void
  onEssayer: () => void
}) {
  if (etat.phase === "chargement") {
    return <div className="h-14 animate-pulse rounded-xl bg-muted" aria-label="Vérification de cet appareil" />
  }

  if (etat.phase === "inactives") {
    return (
      <Button className="h-14 w-full gap-2 text-lg font-semibold" disabled={action !== null} onClick={onActiver}>
        {action === "activer" ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <BellRing className="size-5" aria-hidden="true" />}
        Activer sur cet appareil
      </Button>
    )
  }

  if (etat.phase === "actives") {
    return (
      <div className="space-y-3">
        <p role="status" className="flex items-center gap-2 font-semibold text-success">
          <BellRing className="size-5" aria-hidden="true" />
          Actives sur cet appareil
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12 gap-2 text-base font-semibold" disabled={action !== null} onClick={onEssayer}>
            {action === "essai" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Essayer
          </Button>
          <Button variant="outline" className="h-12 gap-2 text-base font-semibold" disabled={action !== null} onClick={onDesactiver}>
            {action === "desactiver" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
            Désactiver
          </Button>
        </div>
      </div>
    )
  }

  const { titre, texte } = MESSAGES[etat.phase]
  return (
    <div role="status" className="flex gap-3 rounded-xl border p-3">
      <BellOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="leading-snug">
        <span className="block font-semibold">{titre}</span>
        <span className="block text-sm text-muted-foreground">{texte}</span>
      </p>
    </div>
  )
}

type Interrupteur = "notif_seance" | "notif_rapport" | "notif_ajustement"

const TYPES: { champ: Interrupteur; Icone: LucideIcon; titre: string; description: string }[] = [
  { champ: "notif_seance", Icone: CalendarCheck, titre: "Jours de séance", description: "Le matin, ce qui est au programme" },
  { champ: "notif_rapport", Icone: ClipboardList, titre: "Compte rendu", description: "Après chaque séance : durée, séries, records" },
  { champ: "notif_ajustement", Icone: SlidersHorizontal, titre: "Ajustements du programme", description: "Quand il propose de changer une séance" },
]

// Ce que le compte reçoit, sur tous ses appareils. Chaque changement est enregistré tout de suite.
function Choix({ profil }: { profil: Profil }) {
  const { executer } = useEdition()
  const [heure, setHeure] = useState(profil.notif_heure)
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enregistrer = (champs: ChampsProfil) =>
    executer(() => modifierProfil(champs), { cle: ["profil"], maj: (p: Profil) => ({ ...p, ...champs }) }, { silencieux: true })

  // L'heure s'enregistre une fois qu'on a fini d'appuyer, pas à chaque pas.
  function changerHeure(valeur: number) {
    setHeure(valeur)
    if (attente.current) clearTimeout(attente.current)
    attente.current = setTimeout(() => void enregistrer({ notif_heure: valeur }), 700)
  }
  useEffect(() => () => {
    if (attente.current) clearTimeout(attente.current)
  }, [])

  return (
    <Carte>
      <ul className="divide-y">
        {TYPES.map(({ champ, Icone, titre, description }) => (
          <li key={champ}>
            <button
              type="button"
              role="switch"
              aria-checked={profil[champ]}
              onClick={() => void enregistrer({ [champ]: !profil[champ] })}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:bg-muted active:bg-muted"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icone className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-semibold">{titre}</span>
                <span className="block text-sm leading-snug text-muted-foreground">{description}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "relative h-8 w-13 shrink-0 rounded-full transition-colors duration-200",
                  profil[champ] ? "bg-primary" : "bg-input"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 left-1 size-6 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none",
                    profil[champ] && "translate-x-5"
                  )}
                />
              </span>
            </button>
            {champ === "notif_seance" && profil.notif_seance && (
              <div className="flex items-center justify-between gap-3 px-4 pb-4">
                <span className="text-sm text-muted-foreground">À quelle heure</span>
                <Stepper libelle="Heure du rappel" valeur={heure} unite="h" pas={1} min={5} max={22} compact onChange={changerHeure} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Carte>
  )
}
