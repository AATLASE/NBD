"use client"

import { Calculator, Plus, X } from "lucide-react"
import { useState } from "react"

import { ChoixCoach } from "@/components/coach/choix"
import { Stepper } from "@/components/execution/stepper"
import { Filtres } from "@/components/nutrition/repas"
import { Option } from "@/components/option"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ALIMENTS_EXCLUS_MAX, BORNES } from "@/lib/accueil"
import { calculerCibles } from "@/lib/cibles"
import { estUnCoach, type IdCoach } from "@/lib/coachs"
import type { Tables } from "@/lib/database.types"
import { useEdition } from "@/lib/edition"
import { nombre } from "@/lib/format"
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
  type Objectif,
  type SexeDeclare,
} from "@/lib/libelles"
import { modifierBudget, modifierProfil, type ChampsProfil } from "@/lib/mutations"

// Les feuilles de modification de l'onglet Paramètres : une par sujet, ouverte depuis sa ligne.

export type Profil = Tables<"profiles">
export type Sujet = "coach" | "nutrition" | "mensurations" | "objectifs" | "entrainement" | "alimentation" | "budget"

const TITRES: Record<Sujet, { titre: string; description: string }> = {
  coach: { titre: "Mon coach", description: "Il donne son ton à l'assistant et aux petits mots de l'accueil. Tu peux en changer quand tu veux." },
  nutrition: { titre: "Objectifs du jour", description: "Ce que tu vises chaque jour. Les jauges de l'onglet Nutrition s'y réfèrent." },
  mensurations: { titre: "Mensurations", description: "Elles servent à calculer tes besoins et à tracer ta courbe de poids." },
  objectifs: { titre: "Mes objectifs", description: `Jusqu'à ${OBJECTIFS_MAX}. L'assistant en tient compte.` },
  entrainement: { titre: "Entraînement", description: "Où tu t'entraînes, à quel rythme et avec quelle expérience." },
  alimentation: { titre: "Alimentation", description: "Ton régime et les aliments que tu ne manges pas." },
  budget: { titre: "Budget courses", description: "Le montant visé par semaine. La liste de courses s'y compare." },
}

export function EditeurProfil({
  profil,
  sujet,
  onFermer,
}: {
  profil: Profil
  sujet: Sujet | null
  onFermer: () => void
}) {
  return (
    <Sheet open={sujet !== null} onOpenChange={(ouvert) => !ouvert && onFermer()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-lg gap-0 overflow-y-auto rounded-t-3xl text-base"
      >
        {sujet && (
          <>
            <SheetHeader className="pr-14">
              <SheetTitle className="text-xl font-bold">{TITRES[sujet].titre}</SheetTitle>
              <SheetDescription className="text-base">{TITRES[sujet].description}</SheetDescription>
            </SheetHeader>
            {/* La clé repart d'un formulaire neuf à chaque ouverture. */}
            <Formulaire key={sujet} profil={profil} sujet={sujet} onFermer={onFermer} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Bloc({ titre, aide, children }: { titre?: string; aide?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t px-4 py-4">
      {titre && (
        <div>
          <p className="font-semibold">{titre}</p>
          {aide && <p className="text-sm text-muted-foreground">{aide}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function Pied({
  onEnregistrer,
  bloque,
  raison,
}: {
  onEnregistrer: () => void
  bloque: boolean
  raison?: string | null
}) {
  return (
    <div className="sticky bottom-0 space-y-2 border-t bg-popover px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {raison && (
        <p role="alert" className="text-sm font-medium text-danger">
          {raison}
        </p>
      )}
      <Button className="h-14 w-full text-lg font-semibold" disabled={bloque} onClick={onEnregistrer}>
        Enregistrer
      </Button>
    </div>
  )
}

function Formulaire({ profil, sujet, onFermer }: { profil: Profil; sujet: Sujet; onFermer: () => void }) {
  const { executer, enCours } = useEdition()

  // Enregistre et met l'écran à jour tout de suite, avant la réponse du serveur.
  function enregistrer(champs: ChampsProfil) {
    onFermer()
    void executer(() => modifierProfil(champs), {
      cle: ["profil"],
      maj: (actuel: Profil | null) => actuel && ({ ...actuel, ...champs } as Profil),
    })
  }

  if (sujet === "coach") return <CoachChoisi profil={profil} enCours={enCours} onEnregistrer={enregistrer} />
  if (sujet === "nutrition") return <Nutrition profil={profil} enCours={enCours} onEnregistrer={enregistrer} />
  if (sujet === "mensurations") return <Mensurations profil={profil} enCours={enCours} onEnregistrer={enregistrer} />
  if (sujet === "objectifs") return <Objectifs profil={profil} enCours={enCours} onEnregistrer={enregistrer} />
  if (sujet === "entrainement") return <Entrainement profil={profil} enCours={enCours} onEnregistrer={enregistrer} />
  if (sujet === "alimentation") return <Alimentation profil={profil} enCours={enCours} onEnregistrer={enregistrer} />
  return <Budget profil={profil} onFermer={onFermer} />
}

type PropsSujet = { profil: Profil; enCours: boolean; onEnregistrer: (champs: ChampsProfil) => void }

// --- Coach ----------------------------------------------------------------------------------

function CoachChoisi({ profil, enCours, onEnregistrer }: PropsSujet) {
  const [coach, setCoach] = useState<IdCoach | null>(estUnCoach(profil.coach) ? profil.coach : null)
  return (
    <>
      <Bloc>
        <ChoixCoach valeur={coach} onChange={setCoach} />
      </Bloc>
      <Pied
        bloque={enCours || coach === null}
        raison={coach === null ? "Choisis un coach." : null}
        onEnregistrer={() => coach && onEnregistrer({ coach })}
      />
    </>
  )
}

// --- Objectifs nutritionnels ---------------------------------------------------------------

function Nutrition({ profil, enCours, onEnregistrer }: PropsSujet) {
  const [kcal, setKcal] = useState(profil.objectif_kcal ?? 2000)
  const [proteines, setProteines] = useState(profil.objectif_proteines_g ?? 120)
  const [lipides, setLipides] = useState(profil.objectif_lipides_g ?? 65)
  const [glucides, setGlucides] = useState(profil.objectif_glucides_g ?? 220)

  const { poids_initial_kg: poids, taille_cm: taille, age, sexe, seances_par_semaine: seances } = profil
  const calculable = poids !== null && taille !== null && age !== null && seances !== null
  function recalculer() {
    if (!calculable) return
    const cibles = calculerCibles({
      poidsKg: poids,
      tailleCm: taille,
      age,
      sexe: (sexe as SexeDeclare | null) ?? "non_precise",
      seancesParSemaine: seances,
      objectifs: profil.objectifs as Objectif[],
    })
    setKcal(cibles.kcal)
    setProteines(cibles.proteinesG)
    setLipides(cibles.lipidesG)
    setGlucides(cibles.glucidesG)
  }
  const apportDesMacros = proteines * 4 + glucides * 4 + lipides * 9

  return (
    <>
      <Bloc>
        <Stepper libelle="Calories" valeur={kcal} unite="kcal" pas={50} min={800} max={6000} onChange={setKcal} />
        <Stepper libelle="Protéines" valeur={proteines} unite="g" pas={5} min={20} max={400} onChange={setProteines} />
      </Bloc>
      <Bloc titre="Répartition" aide={`Ces trois valeurs apportent ${nombre(apportDesMacros)} kcal au total.`}>
        <Stepper compact libelle="Lipides" valeur={lipides} unite="g" pas={5} min={10} max={300} onChange={setLipides} />
        <Stepper compact libelle="Glucides" valeur={glucides} unite="g" pas={5} min={0} max={900} onChange={setGlucides} />
      </Bloc>
      <Bloc>
        <Button
          variant="outline"
          className="h-12 w-full gap-2 text-base"
          disabled={!calculable}
          onClick={recalculer}
        >
          <Calculator className="size-5" aria-hidden="true" />
          Recalculer d&apos;après mon profil
        </Button>
        <p className="text-sm text-muted-foreground">
          {calculable
            ? "Le calcul part de tes mensurations, de ton rythme d'entraînement et de tes objectifs. Tu peux ensuite ajuster à la main."
            : "Renseigne d'abord tes mensurations et ton rythme d'entraînement pour utiliser le calcul."}
        </p>
      </Bloc>
      <Pied
        bloque={enCours}
        onEnregistrer={() =>
          onEnregistrer({
            objectif_kcal: kcal,
            objectif_proteines_g: proteines,
            objectif_lipides_g: lipides,
            objectif_glucides_g: glucides,
          })
        }
      />
    </>
  )
}

// --- Mensurations -----------------------------------------------------------------------------

function Mensurations({ profil, enCours, onEnregistrer }: PropsSujet) {
  const [poids, setPoids] = useState(profil.poids_initial_kg ?? 70)
  const [taille, setTaille] = useState(profil.taille_cm ?? 170)
  const [age, setAge] = useState(profil.age ?? 30)
  const [sexe, setSexe] = useState<SexeDeclare>((profil.sexe as SexeDeclare | null) ?? "non_precise")

  return (
    <>
      <Bloc>
        <Stepper libelle="Poids de départ" valeur={poids} unite="kg" pas={0.5} min={BORNES.poids[0]} max={BORNES.poids[1]} onChange={setPoids} />
        <Stepper libelle="Taille" valeur={taille} unite="cm" pas={1} min={BORNES.taille[0]} max={BORNES.taille[1]} onChange={setTaille} />
        <Stepper libelle="Âge" valeur={age} unite="ans" pas={1} min={BORNES.age[0]} max={BORNES.age[1]} onChange={setAge} />
      </Bloc>
      <Bloc titre="Sexe" aide="Il sert uniquement à estimer ta dépense énergétique.">
        <div role="radiogroup" aria-label="Sexe" className="space-y-2">
          {SEXES.map((valeur) => (
            <Option key={valeur} role="radio" coche={sexe === valeur} titre={LIBELLE_SEXE[valeur]} onClick={() => setSexe(valeur)} />
          ))}
        </div>
      </Bloc>
      <Bloc>
        <p className="text-sm text-muted-foreground">
          Tes pesées de tous les jours s&apos;enregistrent dans Sport, onglet Progression. Ici, c&apos;est le poids de
          départ de ta courbe.
        </p>
      </Bloc>
      <Pied
        bloque={enCours}
        onEnregistrer={() => onEnregistrer({ poids_initial_kg: poids, taille_cm: taille, age, sexe })}
      />
    </>
  )
}

// --- Objectifs --------------------------------------------------------------------------------

function Objectifs({ profil, enCours, onEnregistrer }: PropsSujet) {
  const [objectifs, setObjectifs] = useState<Objectif[]>(profil.objectifs as Objectif[])
  const [zone, setZone] = useState(profil.zone_blessure ?? "")
  const [contrainte, setContrainte] = useState(profil.contrainte_medicale ?? "")

  const basculer = (objectif: Objectif) =>
    setObjectifs((actuels) =>
      actuels.includes(objectif) ? actuels.filter((o) => o !== objectif) : [...actuels, objectif]
    )
  const plein = objectifs.length >= OBJECTIFS_MAX

  return (
    <>
      <Bloc>
        <div role="group" aria-label="Objectifs" className="space-y-2">
          {OBJECTIFS.map((objectif) => (
            <Option
              key={objectif}
              role="checkbox"
              coche={objectifs.includes(objectif)}
              bloque={plein && !objectifs.includes(objectif)}
              titre={LIBELLE_OBJECTIF[objectif]}
              description={DESCRIPTION_OBJECTIF[objectif]}
              onClick={() => basculer(objectif)}
            />
          ))}
        </div>
        {objectifs.includes("blessure") && (
          <div className="space-y-2">
            <Label htmlFor="zone-blessure">Zone concernée</Label>
            <Input
              id="zone-blessure"
              value={zone}
              maxLength={100}
              placeholder="Genou droit, épaule…"
              onChange={(e) => setZone(e.target.value)}
              className="h-12"
            />
          </div>
        )}
      </Bloc>
      <Bloc titre="Contrainte médicale" aide="Facultatif. Une phrase suffit : l'assistant l'aura toujours sous les yeux.">
        <Label htmlFor="contrainte" className="sr-only">
          Contrainte médicale
        </Label>
        <Input
          id="contrainte"
          value={contrainte}
          maxLength={200}
          onChange={(e) => setContrainte(e.target.value)}
          className="h-12"
        />
      </Bloc>
      <Pied
        bloque={enCours || objectifs.length === 0}
        raison={objectifs.length === 0 ? "Choisis au moins un objectif." : null}
        onEnregistrer={() =>
          onEnregistrer({
            objectifs,
            zone_blessure: objectifs.includes("blessure") && zone.trim() ? zone.trim() : null,
            contrainte_medicale: contrainte.trim() || null,
          })
        }
      />
    </>
  )
}

// --- Entraînement -----------------------------------------------------------------------------

function Entrainement({ profil, enCours, onEnregistrer }: PropsSujet) {
  const [lieux, setLieux] = useState<string[]>(profil.lieux_entrainement ?? [])
  const [seances, setSeances] = useState(profil.seances_par_semaine ?? 3)
  const [niveau, setNiveau] = useState<string>(profil.niveau ?? "debutant")

  const basculer = (lieu: string) =>
    setLieux((actuels) => (actuels.includes(lieu) ? actuels.filter((l) => l !== lieu) : [...actuels, lieu]))

  return (
    <>
      <Bloc>
        <Stepper
          libelle="Séances par semaine"
          valeur={seances}
          unite=""
          pas={1}
          min={BORNES.seances[0]}
          max={BORNES.seances[1]}
          onChange={setSeances}
        />
      </Bloc>
      <Bloc titre="Où tu t'entraînes">
        <div role="group" aria-label="Lieux d'entraînement" className="space-y-2">
          {LIEUX_ENTRAINEMENT.map((lieu) => (
            <Option
              key={lieu}
              role="checkbox"
              coche={lieux.includes(lieu)}
              titre={LIBELLE_LIEU_ENTRAINEMENT[lieu]}
              description={DESCRIPTION_LIEU_ENTRAINEMENT[lieu]}
              onClick={() => basculer(lieu)}
            />
          ))}
        </div>
      </Bloc>
      <Bloc titre="Niveau">
        <Filtres
          libelle="Niveau"
          valeur={niveau}
          onChange={setNiveau}
          options={NIVEAUX.map((n) => ({ valeur: n as string, libelle: LIBELLE_NIVEAU[n] }))}
        />
      </Bloc>
      <Pied
        bloque={enCours || lieux.length === 0}
        raison={lieux.length === 0 ? "Choisis au moins un lieu." : null}
        onEnregistrer={() => onEnregistrer({ lieux_entrainement: lieux, seances_par_semaine: seances, niveau })}
      />
    </>
  )
}

// --- Alimentation -----------------------------------------------------------------------------

function Alimentation({ profil, enCours, onEnregistrer }: PropsSujet) {
  const [regime, setRegime] = useState<string>(profil.regime ?? "omnivore")
  const [exclus, setExclus] = useState<string[]>(profil.aliments_exclus)
  const [saisie, setSaisie] = useState("")

  const propre = saisie.trim().toLowerCase()
  const ajoutable = propre.length >= 2 && !exclus.includes(propre) && exclus.length < ALIMENTS_EXCLUS_MAX
  function ajouter() {
    if (!ajoutable) return
    setExclus([...exclus, propre])
    setSaisie("")
  }

  return (
    <>
      <Bloc titre="Régime">
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
      </Bloc>
      <Bloc titre="Aliments exclus" aide="Allergies ou aliments que tu ne manges pas. L'assistant ne les proposera jamais.">
        {exclus.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {exclus.map((aliment) => (
              <li key={aliment}>
                <button
                  type="button"
                  aria-label={`Retirer ${aliment}`}
                  onClick={() => setExclus(exclus.filter((a) => a !== aliment))}
                  className="flex h-11 items-center gap-2 rounded-full border bg-card pr-2 pl-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                >
                  {aliment}
                  <X className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(evenement) => {
            evenement.preventDefault()
            ajouter()
          }}
        >
          <Label htmlFor="aliment-exclu" className="sr-only">
            Aliment à exclure
          </Label>
          <Input
            id="aliment-exclu"
            value={saisie}
            maxLength={40}
            placeholder="Arachide, coriandre…"
            autoCapitalize="none"
            onChange={(e) => setSaisie(e.target.value)}
            className="h-12"
          />
          <Button type="submit" variant="outline" className="h-12 shrink-0 gap-1.5 px-4 text-base" disabled={!ajoutable}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter
          </Button>
        </form>
      </Bloc>
      <Pied bloque={enCours} onEnregistrer={() => onEnregistrer({ regime, aliments_exclus: exclus })} />
    </>
  )
}

// --- Budget courses ---------------------------------------------------------------------------

function Budget({ profil, onFermer }: { profil: Profil; onFermer: () => void }) {
  const { executer, enCours } = useEdition()
  const [montant, setMontant] = useState(profil.budget_courses_eur ?? 35)

  return (
    <>
      <Bloc>
        <Stepper libelle="Budget par semaine" valeur={montant} unite="€" pas={1} min={0} max={2000} onChange={setMontant} />
      </Bloc>
      <Pied
        bloque={enCours}
        onEnregistrer={() => {
          onFermer()
          void executer(() => modifierBudget(montant), {
            cle: ["profil"],
            maj: (actuel: Profil | null) => actuel && { ...actuel, budget_courses_eur: montant },
          })
        }}
      />
    </>
  )
}
