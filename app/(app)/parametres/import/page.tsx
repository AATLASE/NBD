"use client"

import { Check, Download, FileSpreadsheet, FileUp, TriangleAlert, Watch } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useRef, useState } from "react"

import { Carte, EnTete, Etiquette, Retour, Section } from "@/components/blocs"
import { ApercuActivite } from "@/components/import/apercu-activite"
import { ApercuNutrition, ApercuSeances, Remarques } from "@/components/import/apercus"
import { Filtres } from "@/components/nutrition/repas"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEdition } from "@/lib/edition"
import { lireActivite, type Activite } from "@/lib/import/activite"
import { normaliser } from "@/lib/import/colonnes"
import { lireFichier } from "@/lib/import/lecture"
import { telechargerModele, type TypeImport } from "@/lib/import/modele"
import { lireNutrition, type LectureNutrition } from "@/lib/import/nutrition"
import { lireSeances, type LectureSeances } from "@/lib/import/seances"
import { importerActivite, importerPlanNutrition, importerSeances, type ActiviteAImporter } from "@/lib/mutations"
import { usePlanRepas, useProfil, useRepas } from "@/lib/queries"

type Etat =
  | { phase: "choix" }
  | { phase: "lecture" }
  | { phase: "erreur"; message: string }
  | { phase: "seances"; fichier: string; lecture: Extract<LectureSeances, { ok: true }>; gardees: boolean[] }
  | { phase: "nutrition"; fichier: string; lecture: Extract<LectureNutrition, { ok: true }> }
  | { phase: "montre"; fichier: string; activite: Activite; remarques: string[] }
  | { phase: "fait"; texte: string; lien: string; libelle: string }

// Deux tableaux à remplir (séances, plan nutrition), et l'activité enregistrée par une montre.
type Onglet = TypeImport | "montre"

const TYPES: { valeur: Onglet; libelle: string }[] = [
  { valeur: "seances", libelle: "Séances" },
  { valeur: "nutrition", libelle: "Plan nutrition" },
  { valeur: "montre", libelle: "Montre" },
]

const PAS_UNE_ACTIVITE =
  "Ce fichier n'est pas une activité de montre (FIT, TCX ou GPX). Pour un tableau Excel ou CSV, passe par l'onglet Séances ou Plan nutrition."

type Colonne = { nom: string; aide: string; requise?: boolean }

const COLONNES: Record<TypeImport, Colonne[]> = {
  seances: [
    { nom: "Exercice", aide: "Le nom du mouvement, une ligne par exercice.", requise: true },
    { nom: "Séance", aide: "Le nom de la séance. Il suffit de l'écrire sur sa première ligne." },
    { nom: "Séries", aide: "Le nombre de séries. 3 si la colonne manque." },
    { nom: "Répétitions", aide: "« 10 », « 8-12 », ou une durée comme « 40 s »." },
    { nom: "Charge (kg)", aide: "La charge de départ. Vide pour un exercice au poids du corps." },
    { nom: "Repos (s)", aide: "Le repos entre les séries, en secondes. 90 si la colonne manque." },
    { nom: "Jour", aide: "Lundi, mardi… Sans jour, la séance reste « sans jour fixe »." },
    { nom: "Lieu", aide: "Salle, maison ou extérieur." },
    { nom: "Note", aide: "Une consigne à garder sous les yeux pendant l'exercice." },
  ],
  nutrition: [
    { nom: "Plat", aide: "Le nom du plat, une ligne par repas.", requise: true },
    { nom: "Repas", aide: "Petit déjeuner, collation matin, déjeuner, collation ou dîner.", requise: true },
    { nom: "Jour", aide: "Lundi, mardi… Sans jour, le plat rejoint tes recettes sans toucher aux menus." },
    { nom: "Semaine", aide: "1 ou 2 : le plan tourne sur deux semaines. Sans elle, les deux sont remplies." },
    { nom: "Calories (kcal)", aide: "Pour une portion. Vides, elles sont estimées d'après les ingrédients." },
    { nom: "Protéines (g)", aide: "Pour une portion. Glucides et lipides sont lus aussi." },
    { nom: "Ingrédients", aide: "« 150 g de riz, 2 œufs » : ils alimentent la liste de courses." },
    { nom: "Préparation", aide: "Les étapes de la recette." },
  ],
}

const AUTRES_APPLICATIONS: Record<TypeImport, string> = {
  seances:
    "Strong et Hevy exportent tes entraînements en CSV depuis leurs réglages. Choisis ce fichier tel quel : la dernière fois que chaque séance a été faite devient une séance de ton programme, avec ses charges.",
  nutrition:
    "Un journal alimentaire exporté en CSV (une ligne par aliment, avec la date et le repas) est accepté tel quel : les aliments d'un même repas sont réunis en un plat, et les 14 derniers jours deviennent tes menus.",
}

// La lecture du paramètre d'adresse impose cette barrière sur une page rendue à l'avance.
export default function PageImport() {
  return (
    <Suspense>
      <Import />
    </Suspense>
  )
}

// Importer des séances ou un plan nutrition depuis un tableur, ou une activité depuis le fichier
// d'une montre. Le fichier est lu sur le téléphone, l'aperçu montre ce qui a été compris, et rien
// n'est écrit avant le bouton d'import.
function Import() {
  const router = useRouter()
  const demande = useSearchParams().get("type")
  const type: Onglet = demande === "nutrition" || demande === "montre" ? demande : "seances"
  const [etat, setEtat] = useState<Etat>({ phase: "choix" })
  const champ = useRef<HTMLInputElement>(null)
  const { executer, enCours } = useEdition()
  const profil = useProfil()
  const repas = useRepas()
  const plan = usePlanRepas()

  function changerDeType(suivant: Onglet) {
    setEtat({ phase: "choix" })
    router.replace(`/parametres/import?type=${suivant}`, { scroll: false })
  }

  async function ouvrir(fichier: File) {
    setEtat({ phase: "lecture" })

    // Un fichier de montre se reconnaît à son contenu, quel que soit l'onglet ouvert.
    const activite = await lireActivite(fichier)
    if (activite.ok || !activite.tableur) {
      if (type !== "montre") router.replace("/parametres/import?type=montre", { scroll: false })
      return setEtat(
        activite.ok
          ? { phase: "montre", fichier: fichier.name, activite: activite.activite, remarques: activite.remarques }
          : { phase: "erreur", message: activite.message }
      )
    }
    if (type === "montre") return setEtat({ phase: "erreur", message: PAS_UNE_ACTIVITE })

    const lu = await lireFichier(fichier)
    if (!lu.ok) return setEtat({ phase: "erreur", message: lu.message })

    const seances = () => lireSeances(lu.tableau, fichier.name)
    const nutrition = () => lireNutrition(lu.tableau)
    const tronque = lu.tronque ? ["Fichier très long : seules les 50 000 premières lignes ont été lues."] : []

    const montrerSeances = (lecture: Extract<LectureSeances, { ok: true }>) =>
      setEtat({
        phase: "seances",
        fichier: fichier.name,
        lecture: { ...lecture, remarques: [...tronque, ...lecture.remarques] },
        gardees: lecture.seances.map(() => true),
      })
    const montrerNutrition = (lecture: Extract<LectureNutrition, { ok: true }>) =>
      setEtat({ phase: "nutrition", fichier: fichier.name, lecture: { ...lecture, remarques: [...tronque, ...lecture.remarques] } })

    // Le fichier est lu selon l'onglet choisi. S'il n'y correspond pas mais qu'il se lit dans
    // l'autre sens, on bascule : se tromper d'onglet ne doit pas coûter un message d'erreur.
    if (type === "seances") {
      const lecture = seances()
      if (lecture.ok) return montrerSeances(lecture)
      const autre = nutrition()
      if (!autre.ok) return setEtat({ phase: "erreur", message: lecture.message })
      router.replace("/parametres/import?type=nutrition", { scroll: false })
      return montrerNutrition({ ...autre, remarques: ["Ce fichier contient des repas : il est lu comme un plan nutrition.", ...autre.remarques] })
    }
    const lecture = nutrition()
    if (lecture.ok) return montrerNutrition(lecture)
    const autre = seances()
    if (!autre.ok) return setEtat({ phase: "erreur", message: lecture.message })
    router.replace("/parametres/import?type=seances", { scroll: false })
    montrerSeances({ ...autre, remarques: ["Ce fichier contient des exercices : il est lu comme des séances.", ...autre.remarques] })
  }

  async function importer() {
    if (etat.phase === "seances") {
      const seances = etat.lecture.seances.filter((_, index) => etat.gardees[index])
      const resultat = await executer(() => importerSeances({ seances }))
      if (resultat.ok) {
        setEtat({
          phase: "fait",
          texte: `${seances.length} séance${seances.length > 1 ? "s" : ""} ajoutée${seances.length > 1 ? "s" : ""} à ton programme`,
          lien: "/sport/seances",
          libelle: "Voir mes séances",
        })
      }
    } else if (etat.phase === "nutrition") {
      const { plats, cases } = etat.lecture
      const resultat = await executer(() => importerPlanNutrition({ plats, cases }))
      if (resultat.ok) {
        setEtat({
          phase: "fait",
          texte: cases.length > 0 ? "Plan nutrition importé : tes menus sont à jour" : "Plats ajoutés à tes recettes",
          lien: cases.length > 0 ? "/nutrition/menus" : "/nutrition/recettes",
          libelle: cases.length > 0 ? "Voir mes menus" : "Voir mes recettes",
        })
      }
    }
  }

  async function importerDeLaMontre(activite: ActiviteAImporter) {
    const resultat = await executer(() => importerActivite(activite))
    if (!resultat.ok) return
    setEtat(
      activite.vers === "course"
        ? { phase: "fait", texte: "Sortie ajoutée à ton suivi de course", lien: "/sport/course", libelle: "Voir mes sorties" }
        : { phase: "fait", texte: "Séance ajoutée à ton journal de sport", lien: "/sport/progression", libelle: "Voir ma progression" }
    )
  }

  // Ce que le plan nutrition importé rencontre dans ce qui existe déjà.
  const rencontre = useMemo(() => {
    if (etat.phase !== "nutrition") return null
    const { plats, cases } = etat.lecture
    const cle = (nom: string, slot: string) => `${nom.trim().toLowerCase()}|${slot}`
    const existants = new Set((repas.data ?? []).map((plat) => cle(plat.nom, plat.slot)))
    const connus = new Set(plats.flatMap((plat, index) => (existants.has(cle(plat.nom, plat.slot)) ? [index] : [])))

    const remplaces = cases.filter((c) => {
      const prevu = plan.data?.find((p) => p.semaine === c.semaine && p.jour === c.jour && p.slot === c.slot)?.meal
      return prevu != null && cle(prevu.nom, prevu.slot) !== cle(plats[c.plat]!.nom, c.slot)
    }).length

    // Recherche de mots, comme pour les propositions de l'assistant : elle ne remplace pas une relecture.
    const exclus = (profil.data?.aliments_exclus ?? []).map(normaliser).filter((terme) => terme.length >= 2)
    const aRelire = plats
      .filter((plat) => {
        const texte = normaliser([plat.nom, ...plat.ingredients.map((i) => i.nom)].join(" "))
        return exclus.some((terme) => texte.includes(terme))
      })
      .map((plat) => plat.nom)
    return { connus, remplaces, aRelire }
  }, [etat, repas.data, plan.data, profil.data])

  const nombreGardees = etat.phase === "seances" ? etat.gardees.filter(Boolean).length : 0
  const enApercu = etat.phase === "seances" || etat.phase === "nutrition"
  // Ce qui touche à l'existant passe avant les remarques de lecture.
  const remarques = !enApercu
    ? []
    : [
        rencontre &&
          rencontre.aRelire.length > 0 &&
          `Contient peut-être un aliment que tu as exclu, à relire : ${rencontre.aRelire.slice(0, 5).join(", ")}.`,
        rencontre &&
          rencontre.remplaces > 0 &&
          `${rencontre.remplaces} repas déjà prévu${rencontre.remplaces > 1 ? "s" : ""} dans tes menus ${rencontre.remplaces > 1 ? "seront remplacés" : "sera remplacé"}. Les autres cases ne bougent pas.`,
        ...etat.lecture.remarques,
      ].filter((texte): texte is string => Boolean(texte))

  return (
    <>
      <div className="space-y-2">
        <Retour href="/parametres">Paramètres</Retour>
        <EnTete
          titre="Importer"
          sousTitre={type === "montre" ? "Depuis le fichier d'une montre" : "Depuis un fichier Excel ou CSV"}
        />
      </div>

      {(etat.phase === "choix" || etat.phase === "erreur") && (
        <Filtres libelle="Ce que contient le fichier" options={TYPES} valeur={type} onChange={changerDeType} />
      )}

      <input
        ref={champ}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        // Pas de filtre pour la montre : un téléphone grise les extensions qu'il ne connaît pas (.fit).
        accept={
          type === "montre"
            ? undefined
            : ".xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0]
          // Vidé pour que le même fichier, corrigé entre-temps, puisse être rechoisi.
          evenement.target.value = ""
          if (fichier) void ouvrir(fichier)
        }}
      />

      {etat.phase === "erreur" && (
        <Carte className="border-danger/40 p-4">
          <p role="alert" className="flex gap-2 leading-snug font-medium text-danger">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {etat.message}
          </p>
        </Carte>
      )}

      {(etat.phase === "choix" || etat.phase === "erreur") && type === "montre" && (
        <>
          <Carte className="space-y-3 p-4">
            <p className="leading-snug text-muted-foreground">
              Le fichier d&apos;une activité enregistrée par ta montre Garmin ou Coros. Une sortie rejoint ton suivi de
              course, une séance de musculation ton journal de sport.
            </p>
            <Button className="h-14 w-full gap-2 text-lg font-semibold" onClick={() => champ.current?.click()}>
              <FileUp className="size-5" aria-hidden="true" />
              Choisir un fichier
            </Button>
            <p className="text-sm text-muted-foreground">
              FIT, TCX ou GPX, 10 Mo au plus. Le fichier est lu sur ton téléphone : seul le résumé de
              l&apos;activité est enregistré, pas le tracé.
            </p>
          </Carte>

          <Section titre="Où trouver le fichier">
            <p className="leading-snug text-muted-foreground">
              Dans Garmin Connect ou dans l&apos;application Coros, ouvre l&apos;activité et utilise son menu
              d&apos;export : fichier d&apos;origine (FIT), TCX ou GPX. Enregistre le fichier sur ton téléphone, puis
              choisis-le ici.
            </p>
            <p className="leading-snug text-muted-foreground">
              Le FIT est le plus complet : il dit le sport pratiqué, le cardio et, en musculation, le nombre de
              séries.
            </p>
          </Section>
        </>
      )}

      {(etat.phase === "choix" || etat.phase === "erreur") && type !== "montre" && (
        <>
          <Carte className="space-y-3 p-4">
            <p className="leading-snug text-muted-foreground">
              {type === "seances"
                ? "Un tableau avec une ligne par exercice. Tu vois ce qui a été compris avant que quoi que ce soit ne change."
                : "Un tableau avec une ligne par repas. Tu vois ce qui a été compris avant que quoi que ce soit ne change."}
            </p>
            <Button className="h-14 w-full gap-2 text-lg font-semibold" onClick={() => champ.current?.click()}>
              <FileUp className="size-5" aria-hidden="true" />
              Choisir un fichier
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full gap-2 text-base font-semibold"
              onClick={() => telechargerModele(type)}
            >
              <Download className="size-4" aria-hidden="true" />
              Télécharger le modèle Excel
            </Button>
            <p className="text-sm text-muted-foreground">
              Excel (.xlsx) ou CSV, 10 Mo au plus. Le fichier est lu sur ton téléphone.
            </p>
          </Carte>

          <Section titre="Colonnes reconnues">
            <Carte>
              <dl className="divide-y">
                {COLONNES[type].map((colonne) => (
                  <div key={colonne.nom} className="space-y-0.5 px-4 py-3">
                    <dt className="flex items-center gap-2 font-semibold">
                      {colonne.nom}
                      {colonne.requise && <Etiquette ton="brand">Obligatoire</Etiquette>}
                    </dt>
                    <dd className="text-sm leading-snug text-muted-foreground">{colonne.aide}</dd>
                  </div>
                ))}
              </dl>
            </Carte>
            <p className="text-sm text-muted-foreground">
              L&apos;ordre des colonnes est libre, et leurs titres peuvent être en anglais.
            </p>
          </Section>

          <Section titre="Depuis une autre application">
            <p className="leading-snug text-muted-foreground">{AUTRES_APPLICATIONS[type]}</p>
          </Section>
        </>
      )}

      {etat.phase === "lecture" && (
        <div className="space-y-3" role="status" aria-busy="true">
          <p className="font-medium">Lecture du fichier…</p>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {enApercu && (
        <>
          <Carte className="flex items-center gap-3 p-4">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"
            >
              <FileSpreadsheet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate leading-snug font-semibold">{etat.fichier}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {etat.phase === "seances"
                  ? `${etat.lecture.seances.length} séance${etat.lecture.seances.length > 1 ? "s" : ""} · ${etat.lecture.seances.reduce((n, s) => n + s.exercices.length, 0)} exercices`
                  : `${etat.lecture.plats.length} plat${etat.lecture.plats.length > 1 ? "s" : ""} · ${etat.lecture.cases.length} repas dans les menus`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEtat({ phase: "choix" })}
              className="inline-flex h-11 shrink-0 items-center rounded-lg px-2 font-medium text-brand outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
            >
              Changer
            </button>
          </Carte>

          <Remarques remarques={remarques} />
        </>
      )}

      {etat.phase === "montre" && (
        <>
          <Carte className="flex items-center gap-3 p-4">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"
            >
              <Watch className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate leading-snug font-semibold">{etat.fichier}</p>
              <p className="text-sm text-muted-foreground">Fichier {etat.activite.format}</p>
            </div>
            <button
              type="button"
              onClick={() => setEtat({ phase: "choix" })}
              className="inline-flex h-11 shrink-0 items-center rounded-lg px-2 font-medium text-brand outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
            >
              Changer
            </button>
          </Carte>
          <ApercuActivite
            // Un autre fichier repart de choix neufs.
            key={`${etat.fichier}-${etat.activite.date}-${etat.activite.dureeMin}`}
            activite={etat.activite}
            remarques={etat.remarques}
            enCours={enCours}
            onImporter={importerDeLaMontre}
          />
        </>
      )}

      {etat.phase === "seances" && (
        <Section titre="Séances trouvées">
          <p className="-mt-1 leading-snug text-muted-foreground">
            Elles s&apos;ajoutent à tes séances : rien n&apos;est remplacé. Décoche celles que tu ne veux pas.
          </p>
          <ApercuSeances
            seances={etat.lecture.seances}
            gardees={etat.gardees}
            onBasculer={(index) =>
              setEtat({ ...etat, gardees: etat.gardees.map((gardee, i) => (i === index ? !gardee : gardee)) })
            }
          />
        </Section>
      )}

      {etat.phase === "nutrition" && rencontre && (
        <ApercuNutrition plats={etat.lecture.plats} cases={etat.lecture.cases} connus={rencontre.connus} />
      )}

      {enApercu && (
        <>
          {/* Laisse la place de la barre fixe sous le dernier élément. */}
          <div aria-hidden="true" className="h-16" />
          <div
            data-barre-fixe
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background px-4 py-3"
          >
            <Button
              className="mx-auto flex h-14 w-full max-w-lg gap-2 text-lg font-semibold"
              disabled={enCours || (etat.phase === "seances" && nombreGardees === 0)}
              onClick={importer}
            >
              <Check className="size-5" aria-hidden="true" />
              {etat.phase === "seances"
                ? nombreGardees === 0
                  ? "Aucune séance cochée"
                  : `Importer ${nombreGardees} séance${nombreGardees > 1 ? "s" : ""}`
                : etat.lecture.cases.length > 0
                  ? "Importer ce plan"
                  : `Ajouter ${etat.lecture.plats.length} plat${etat.lecture.plats.length > 1 ? "s" : ""} à mes recettes`}
            </Button>
          </div>
        </>
      )}

      {etat.phase === "fait" && (
        <div className="space-y-3">
          <Carte className="flex items-center gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-5" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 leading-snug font-semibold">{etat.texte}</p>
          </Carte>
          <Link href={etat.lien} className={buttonVariants({ className: "h-14 w-full text-lg font-semibold" })}>
            {etat.libelle}
          </Link>
          <Button
            variant="outline"
            className="h-12 w-full text-base font-semibold"
            onClick={() => setEtat({ phase: "choix" })}
          >
            Importer un autre fichier
          </Button>
          <p className="text-sm text-muted-foreground">
            Un doute ? L&apos;import s&apos;annule d&apos;un geste depuis l&apos;historique des modifications, dans
            Paramètres.
          </p>
        </div>
      )}
    </>
  )
}
