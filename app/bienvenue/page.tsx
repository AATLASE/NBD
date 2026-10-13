"use client"

import { cn } from "cn"
import { X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { seDeconnecter } from "@/app/login/actions"
import { ChoixCoach } from "@/components/coach/choix"
import { Attente } from "@/components/etats"
import { Option } from "@/components/option"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ALIMENTS_EXCLUS_MAX, BORNES, validerReponses } from "@/lib/accueil"
import type { IdCoach } from "@/lib/coachs"
import {
  DESCRIPTION_LIEU_ENTRAINEMENT,
  DESCRIPTION_OBJECTIF,
  DESCRIPTION_REGIME,
  LIBELLE_LIEU_ENTRAINEMENT,
  LIBELLE_NIVEAU,
  LIBELLE_OBJECTIF,
  LIBELLE_REGIME,
  LIBELLE_SEXE,
  LIEUX_ENTRAINEMENT,
  NIVEAUX,
  OBJECTIFS,
  OBJECTIFS_MAX,
  REGIMES,
  SEXES,
  type LieuEntrainement,
  type Niveau,
  type Objectif,
  type Regime,
  type SexeDeclare,
} from "@/lib/libelles"
import { terminerAccueil } from "@/lib/mutations"
import { useProfil } from "@/lib/queries"

// « 78,5 » comme « 78.5 » : le clavier français propose la virgule.
const lireNombre = (saisie: string) => Number(saisie.trim().replace(",", "."))
const entierDans = (saisie: string, [min, max]: readonly [number, number]) => {
  const valeur = lireNombre(saisie)
  return saisie.trim() !== "" && Number.isInteger(valeur) && valeur >= min && valeur <= max
}

const ETAPES = ["Toi", "Ton sport", "Ton alimentation", "Ton coach"] as const
const SEANCES = Array.from(
  { length: BORNES.seances[1] - BORNES.seances[0] + 1 },
  (_, index) => BORNES.seances[0] + index
)

function Question({
  titre,
  aide,
  erreur,
  children,
}: {
  titre: string
  aide?: React.ReactNode
  erreur?: string | null
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="float-left w-full pb-2">
        <span className="block font-medium">{titre}</span>
        {aide && <span className="block text-sm text-muted-foreground">{aide}</span>}
      </legend>
      <div className="clear-both space-y-2">{children}</div>
      {erreur && (
        <p role="alert" className="text-sm text-danger">
          {erreur}
        </p>
      )}
    </fieldset>
  )
}

// Questionnaire posé une seule fois, à la première connexion d'un nouveau compte.
// Ses réponses servent à calculer les cibles nutritionnelles et à proposer un programme.
export default function Bienvenue() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const profil = useProfil()
  const [etape, setEtape] = useState(0)
  // Les erreurs d'une étape ne s'affichent qu'après une tentative de la quitter.
  const [tentee, setTentee] = useState(-1)

  const [poids, setPoids] = useState("")
  const [taille, setTaille] = useState("")
  const [age, setAge] = useState("")
  const [sexe, setSexe] = useState<SexeDeclare | null>(null)
  const [objectifs, setObjectifs] = useState<Objectif[]>([])
  const [zoneBlessure, setZoneBlessure] = useState("")
  const [lieux, setLieux] = useState<LieuEntrainement[]>([])
  const [seances, setSeances] = useState<number | null>(null)
  const [niveau, setNiveau] = useState<Niveau | null>(null)
  const [regime, setRegime] = useState<Regime | null>(null)
  const [exclus, setExclus] = useState<string[]>([])
  const [saisieExclu, setSaisieExclu] = useState("")
  const [coach, setCoach] = useState<IdCoach | null>(null)

  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  // Déjà rempli (ou compte du propriétaire) : rien à faire ici. Sauf si on vient justement de le
  // remplir : on est alors en route vers la proposition, et il ne faut pas détourner ce trajet.
  const enRouteVersLaProposition = useRef(false)
  const dejaFait = profil.data != null && profil.data.accueil_fait_le !== null
  useEffect(() => {
    if (dejaFait && !enRouteVersLaProposition.current) router.replace("/sport")
  }, [dejaFait, router])

  if (profil.data === undefined || dejaFait) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 pt-[calc(2rem+env(safe-area-inset-top))]">
        <Attente requetes={[profil]} />
      </main>
    )
  }

  const poidsKg = lireNombre(poids)
  const erreursParEtape = [
    {
      poids:
        poids.trim() === "" || !(poidsKg >= BORNES.poids[0] && poidsKg <= BORNES.poids[1])
          ? `Ton poids en kilos, entre ${BORNES.poids[0]} et ${BORNES.poids[1]}.`
          : null,
      taille: entierDans(taille, BORNES.taille)
        ? null
        : `Ta taille en centimètres, entre ${BORNES.taille[0]} et ${BORNES.taille[1]}.`,
      age: entierDans(age, BORNES.age) ? null : `Ton âge, entre ${BORNES.age[0]} et ${BORNES.age[1]} ans.`,
      sexe: sexe ? null : "Choisis une réponse.",
    },
    {
      objectifs: objectifs.length === 0 ? "Choisis au moins un objectif." : null,
      lieux: lieux.length === 0 ? "Choisis au moins un lieu." : null,
      seances: seances === null ? "Choisis un nombre de séances." : null,
      niveau: niveau ? null : "Choisis ton niveau.",
    },
    { regime: regime ? null : "Choisis ton régime." },
    { coach: coach ? null : "Choisis ton coach." },
  ] as const
  const montrer = tentee >= etape
  const e0 = montrer && etape === 0 ? erreursParEtape[0] : null
  const e1 = montrer && etape === 1 ? erreursParEtape[1] : null
  const e2 = montrer && etape === 2 ? erreursParEtape[2] : null
  const e3 = montrer && etape === 3 ? erreursParEtape[3] : null
  const objectifsComplets = objectifs.length >= OBJECTIFS_MAX

  const basculer = <T,>(liste: T[], valeur: T, max = Infinity) =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : liste.length < max ? [...liste, valeur] : liste

  function ajouterExclu() {
    const aliment = saisieExclu.trim().toLowerCase()
    if (aliment.length >= 2 && !exclus.includes(aliment) && exclus.length < ALIMENTS_EXCLUS_MAX) {
      setExclus([...exclus, aliment])
    }
    setSaisieExclu("")
  }

  function suivant(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    setErreur(null)
    setTentee(etape)
    if (Object.values(erreursParEtape[etape]!).some(Boolean)) {
      // Le premier champ en erreur reprend le focus, quand c'est un champ de saisie.
      const premier = Object.entries(erreursParEtape[etape]!).find(([, message]) => message)?.[0]
      document.getElementById(`accueil-${premier}`)?.focus()
      return
    }
    if (etape < ETAPES.length - 1) {
      setEtape(etape + 1)
      window.scrollTo({ top: 0 })
      return
    }

    // Un aliment tapé mais pas encore ajouté compte quand même.
    const reste = saisieExclu.trim().toLowerCase()
    const reponses = validerReponses({
      poidsKg,
      tailleCm: lireNombre(taille),
      age: lireNombre(age),
      sexe,
      objectifs,
      zoneBlessure,
      lieux,
      seancesParSemaine: seances,
      niveau,
      regime,
      alimentsExclus: reste.length >= 2 ? [...exclus, reste] : exclus,
    })
    if (!reponses) {
      setErreur("Une réponse manque ou n'est pas valide. Reviens en arrière pour vérifier.")
      return
    }

    demarrer(async () => {
      const resultat = await terminerAccueil(reponses, coach).catch(() => ({
        ok: false as const,
        message: "Pas de réseau. Réessaie dans un instant.",
      }))
      if (!resultat.ok) {
        setErreur(resultat.message)
        return
      }
      enRouteVersLaProposition.current = true
      router.replace("/bienvenue/programme?auto=1")
      await queryClient.invalidateQueries({ queryKey: ["profil"] })
    })
  }

  return (
    <main className="mx-auto w-full max-w-sm space-y-6 px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Bienvenue</h1>
          <p className="text-muted-foreground">
            Quelques questions pour te proposer un programme de sport et un plan nutritif. Tu pourras
            tout modifier ensuite.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold tabular-nums">
            Étape {etape + 1} sur {ETAPES.length} · {ETAPES[etape]}
          </p>
          <div
            role="progressbar"
            aria-label="Avancement du questionnaire"
            aria-valuenow={etape + 1}
            aria-valuemin={1}
            aria-valuemax={ETAPES.length}
            className="flex gap-1.5"
          >
            {ETAPES.map((nom, index) => (
              <span
                key={nom}
                className={cn("h-1.5 flex-1 rounded-full", index <= etape ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
        </div>
      </header>

      <form onSubmit={suivant} noValidate className="space-y-7">
        {etape === 0 && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["poids", "Poids (kg)", poids, setPoids, "decimal"],
                  ["taille", "Taille (cm)", taille, setTaille, "numeric"],
                  ["age", "Âge", age, setAge, "numeric"],
                ] as const
              ).map(([cle, libelle, valeur, changer, clavier]) => (
                <div key={cle} className="space-y-2">
                  <Label htmlFor={`accueil-${cle}`}>{libelle}</Label>
                  <Input
                    id={`accueil-${cle}`}
                    inputMode={clavier}
                    autoComplete="off"
                    value={valeur}
                    onChange={(evenement) => changer(evenement.target.value)}
                    aria-invalid={e0?.[cle] ? true : undefined}
                    aria-describedby={e0?.[cle] ? `accueil-${cle}-erreur` : undefined}
                    className="h-14 text-xl font-semibold tabular-nums md:text-xl"
                  />
                </div>
              ))}
              {(["poids", "taille", "age"] as const).map(
                (cle) =>
                  e0?.[cle] && (
                    <p key={cle} id={`accueil-${cle}-erreur`} role="alert" className="col-span-3 text-sm text-danger">
                      {e0[cle]}
                    </p>
                  )
              )}
            </div>

            <Question
              titre="Sexe"
              aide="Il sert uniquement à estimer ta dépense énergétique."
              erreur={e0?.sexe}
            >
              <div role="radiogroup" aria-label="Sexe" className="space-y-2">
                {SEXES.map((valeur) => (
                  <Option
                    key={valeur}
                    role="radio"
                    coche={sexe === valeur}
                    titre={LIBELLE_SEXE[valeur]}
                    onClick={() => setSexe(valeur)}
                  />
                ))}
              </div>
            </Question>
          </>
        )}

        {etape === 1 && (
          <>
            <Question
              titre="Tes objectifs"
              aide={`Jusqu'à ${OBJECTIFS_MAX}, ceux qui comptent le plus pour toi. ${objectifs.length} sur ${OBJECTIFS_MAX} choisi${objectifs.length > 1 ? "s" : ""}.`}
              erreur={e1?.objectifs}
            >
              {OBJECTIFS.map((objectif) => (
                <Option
                  key={objectif}
                  role="checkbox"
                  coche={objectifs.includes(objectif)}
                  bloque={objectifsComplets && !objectifs.includes(objectif)}
                  titre={LIBELLE_OBJECTIF[objectif]}
                  description={DESCRIPTION_OBJECTIF[objectif]}
                  onClick={() => setObjectifs(basculer(objectifs, objectif, OBJECTIFS_MAX))}
                />
              ))}
              <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
                {objectifsComplets && `${OBJECTIFS_MAX} objectifs choisis : retires-en un pour en changer.`}
              </p>
            </Question>

            {objectifs.includes("blessure") && (
              <div className="space-y-2">
                <Label htmlFor="accueil-zone">Quelle zone est concernée ?</Label>
                <Input
                  id="accueil-zone"
                  value={zoneBlessure}
                  maxLength={100}
                  onChange={(evenement) => setZoneBlessure(evenement.target.value)}
                  aria-describedby="accueil-zone-aide"
                  className="h-12"
                />
                <p id="accueil-zone-aide" className="text-sm text-muted-foreground">
                  Par exemple « genou droit » ou « bas du dos ». Le programme évitera de la charger. Il ne
                  remplace pas l&apos;avis d&apos;un kiné ou d&apos;un médecin.
                </p>
              </div>
            )}

            <Question titre="Où t'entraînes-tu ?" aide="Plusieurs réponses possibles." erreur={e1?.lieux}>
              {LIEUX_ENTRAINEMENT.map((lieu) => (
                <Option
                  key={lieu}
                  role="checkbox"
                  coche={lieux.includes(lieu)}
                  titre={LIBELLE_LIEU_ENTRAINEMENT[lieu]}
                  description={DESCRIPTION_LIEU_ENTRAINEMENT[lieu]}
                  onClick={() => setLieux(basculer(lieux, lieu))}
                />
              ))}
            </Question>

            <Question titre="Combien de séances par semaine ?" erreur={e1?.seances}>
              <div role="radiogroup" aria-label="Séances par semaine" className="grid grid-cols-5 gap-2">
                {SEANCES.map((nombre) => (
                  <button
                    key={nombre}
                    type="button"
                    role="radio"
                    aria-checked={seances === nombre}
                    onClick={() => setSeances(nombre)}
                    className={cn(
                      "h-14 rounded-xl border-2 text-xl font-bold tabular-nums outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
                      seances === nombre
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card active:bg-muted"
                    )}
                  >
                    {nombre}
                  </button>
                ))}
              </div>
            </Question>

            <Question titre="Ton niveau" erreur={e1?.niveau}>
              <div role="radiogroup" aria-label="Niveau" className="space-y-2">
                {NIVEAUX.map((valeur) => (
                  <Option
                    key={valeur}
                    role="radio"
                    coche={niveau === valeur}
                    titre={LIBELLE_NIVEAU[valeur]}
                    onClick={() => setNiveau(valeur)}
                  />
                ))}
              </div>
            </Question>
          </>
        )}

        {etape === 2 && (
          <>
            <Question titre="Ton régime alimentaire" erreur={e2?.regime}>
              <div role="radiogroup" aria-label="Régime alimentaire" className="space-y-2">
                {REGIMES.map((valeur) => (
                  <Option
                    key={valeur}
                    role="radio"
                    coche={regime === valeur}
                    titre={LIBELLE_REGIME[valeur]}
                    description={DESCRIPTION_REGIME[valeur]}
                    onClick={() => setRegime(valeur)}
                  />
                ))}
              </div>
            </Question>

            <div className="space-y-2">
              <Label htmlFor="accueil-exclu">Allergies ou aliments à éviter</Label>
              <div className="flex gap-2">
                <Input
                  id="accueil-exclu"
                  value={saisieExclu}
                  maxLength={40}
                  autoComplete="off"
                  aria-describedby="accueil-exclu-aide"
                  onChange={(evenement) => setSaisieExclu(evenement.target.value)}
                  onKeyDown={(evenement) => {
                    if (evenement.key === "Enter") {
                      evenement.preventDefault()
                      ajouterExclu()
                    }
                  }}
                  className="h-12"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 shrink-0 px-4 text-base"
                  disabled={saisieExclu.trim().length < 2 || exclus.length >= ALIMENTS_EXCLUS_MAX}
                  onClick={ajouterExclu}
                >
                  Ajouter
                </Button>
              </div>
              <p id="accueil-exclu-aide" className="text-sm text-muted-foreground">
                Facultatif. Un aliment à la fois : arachide, lactose, champignons…
              </p>
              {exclus.length > 0 && (
                <ul aria-label="Aliments à éviter" className="flex flex-wrap gap-2 pt-1">
                  {exclus.map((aliment) => (
                    <li key={aliment}>
                      <button
                        type="button"
                        aria-label={`Retirer ${aliment}`}
                        onClick={() => setExclus(exclus.filter((a) => a !== aliment))}
                        className="flex h-11 items-center gap-1.5 rounded-full border bg-card pr-3 pl-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                      >
                        {aliment}
                        <X className="size-4 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {etape === 3 && (
          <Question
            titre="Choisis ton coach"
            aide="C'est lui ou elle qui te répondra dans le chat et t'encouragera au fil des jours. Tu pourras en changer dans Paramètres."
            erreur={e3?.coach}
          >
            <ChoixCoach valeur={coach} onChange={setCoach} />
          </Question>
        )}

        {erreur && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 leading-snug font-medium text-danger">
            {erreur}
          </p>
        )}

        <div className="flex gap-3">
          {etape > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-14 px-5 text-base"
              disabled={enCours}
              onClick={() => {
                setEtape(etape - 1)
                window.scrollTo({ top: 0 })
              }}
            >
              Retour
            </Button>
          )}
          <Button type="submit" className="h-14 flex-1 text-lg font-semibold" disabled={enCours}>
            {etape < ETAPES.length - 1 ? "Continuer" : enCours ? "Enregistrement…" : "Voir ma proposition"}
          </Button>
        </div>
      </form>

      {etape === 0 && (
        <form action={seDeconnecter}>
          <Button type="submit" variant="ghost" className="h-11 w-full text-base text-muted-foreground">
            Se déconnecter
          </Button>
        </form>
      )}
    </main>
  )
}
