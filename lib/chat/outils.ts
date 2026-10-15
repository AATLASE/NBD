import "server-only"

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"
import { after } from "next/server"
import { z } from "zod"

import {
  LIGNES_MAX_DU_CHAT,
  TABLES_DU_CHAT,
  type ChangementChat,
  type Effet,
  type LigneDiff,
  type SeancePassee,
} from "@/lib/chat/types"
import { cleDe, composerListe, type IngredientDePlat } from "@/lib/courses"
import type { Json } from "@/lib/database.types"
import { dateCourte, nombre, prescription } from "@/lib/format"
import { EQUIPEMENTS, GROUPES, JOURS, LIBELLE_SLOT, SLOTS } from "@/lib/libelles"
import { seanceDeLaSemaineType } from "@/lib/planning"
import { recalculerApresSeance } from "@/lib/recalcul"
import type { createClient } from "@/lib/supabase/server"

// Outils du chatbot (SPEC 7.2) et règles appliquées en code (SPEC 7.3 et 7.4).
//
// Le modèle propose, l'utilisateur décide. Aucune écriture ne part d'office :
//   jusqu'à 5 lignes      -> proposé : carte avant/après avec « Accepter » et « Refuser »
//   plus de 5 lignes       -> refusé, à faire à la main dans l'application
// La limite de 5 lignes vaut pour toute la demande, pas outil par outil : dix suppressions d'une
// ligne restent une opération de masse.
// Il n'existe aucun outil pour toucher au protocole pied, au plan de course ou aux objectifs de
// calories et de protéines : le modèle ne peut donc pas le faire, quelle que soit la demande.

type Client = Awaited<ReturnType<typeof createClient>>

export type Contexte = {
  supabase: Client
  aujourdhui: string
  alimentsExclus: string[]
  effets: Effet[]
  // Réservation de quota du message. Elle n'est faite qu'à l'acceptation d'une proposition.
  quota: { demandeIa: string | null }
  // Modifications du programme proposées pendant ce tour de parole : nombre de lignes touchées,
  // et file d'attente des outils.
  cumul: { lignes: number; attente: Promise<unknown> }
}

export const nouveauCumul = (): Contexte["cumul"] => ({ lignes: 0, attente: Promise.resolve() })

export const QUOTA_CHAT =
  "REFUS : la limite mensuelle de modifications par l'assistant est atteinte pour ce compte. " +
  "Explique que les questions restent illimitées, que la modification peut se faire à la main dans " +
  "l'application, et qu'un abonnement permettra bientôt d'en faire davantage."

type Plan = {
  changements: ChangementChat[]
  resume: string
  diff: LigneDiff[]
  // Lignes du programme concernées, quand ce n'est pas le nombre d'écritures : remplacer un
  // exercice archive une ligne et en crée une autre, mais ne touche qu'une ligne de la séance.
  lignes?: number
  // Modification du programme ou du plan nutritif : compte dans le quota mensuel.
  quota: boolean
  // La liste de courses est un document dérivé, pas le programme : la limite de 5 lignes ne s'y applique pas.
  sansLimite?: boolean
}

const texte = (valeur: unknown) => JSON.stringify(valeur)
const majusculeInitiale = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const PROPOSE =
  "PROPOSÉ, PAS APPLIQUÉ : une carte est affichée à l'utilisateur, avec les boutons « Accepter » et « Refuser ». Rien n'est écrit tant qu'il n'a pas accepté. Ne dis pas que c'est fait : dis que tu proposes et qu'il lui reste à valider."

async function quotaDisponible(c: Contexte) {
  if (c.quota.demandeIa) return true
  const { data } = await c.supabase.rpc("etat_demandes_ia")
  const etat = data?.[0]
  return !etat || etat.limite === null || etat.utilisees < etat.limite
}

// Point de passage unique de toute écriture demandée par le modèle. Le modèle peut lancer
// plusieurs outils à la fois : ils passent ici un par un, pour que le décompte des lignes soit juste.
function soumettre(c: Contexte, plan: Plan): Promise<string> {
  const resultat = c.cumul.attente.then(() => traiter(c, plan))
  c.cumul.attente = resultat.catch(() => undefined)
  return resultat
}

// La demande dépasse la limite : elle est refusée en entier, et ce qui était déjà proposé est retiré.
function refuserEnMasse(c: Contexte) {
  for (let i = c.effets.length - 1; i >= 0; i--) {
    const effet = c.effets[i]
    if (effet.type === "propose" && effet.quota) c.effets.splice(i, 1)
  }
  return `REFUS : cette demande toucherait plus de ${LIGNES_MAX_DU_CHAT} lignes du programme. Une opération de cette taille doit être faite à la main dans l'application. Tout ce que tu avais proposé pour ce message a été retiré : rien n'est affiché, rien n'a changé. Arrête-toi là, explique la règle et propose de procéder par petites étapes.`
}

async function traiter(c: Contexte, plan: Plan): Promise<string> {
  const ecritures = plan.changements.length
  if (ecritures === 0) return "Rien à changer : la valeur demandée est déjà en place."
  if (plan.changements.some((changement) => !TABLES_DU_CHAT.includes(changement.table))) {
    return "REFUS : cette partie du programme ne peut pas être modifiée par l'assistant."
  }
  // La limite porte sur les modifications du programme de toute la demande. Les mesures
  // (pesée, douleur) et la liste de courses n'en font pas partie.
  if (plan.quota) {
    c.cumul.lignes += plan.lignes ?? ecritures
    if (c.cumul.lignes > LIGNES_MAX_DU_CHAT) return refuserEnMasse(c)
  } else if (!plan.sansLimite && ecritures > LIGNES_MAX_DU_CHAT) {
    return `REFUS : cette opération toucherait ${ecritures} lignes. Au-delà de ${LIGNES_MAX_DU_CHAT}, elle se fait à la main dans l'application.`
  }
  if (plan.quota && !(await quotaDisponible(c))) return QUOTA_CHAT

  c.effets.push({
    type: "propose",
    id: crypto.randomUUID(),
    resume: plan.resume,
    diff: plan.diff,
    statut: "en_attente",
    changements: plan.changements,
    quota: plan.quota,
  })
  return PROPOSE
}

// --- Lectures communes --------------------------------------------------------------------

async function lireLigne(c: Contexte, id: string) {
  const { data } = await c.supabase
    .from("workout_exercises")
    .select("*, exercise:exercises(id, nom), workout:workouts(id, code)")
    .eq("id", id)
    .maybeSingle()
  return data && !data.archived ? data : null
}

async function lireSeance(c: Contexte, critere: { id: string } | { code: string }) {
  const requete = c.supabase
    .from("workouts")
    .select("*, workout_exercises(*, exercise:exercises(id, nom))")
    .not("archived", "is", true)
    .not("workout_exercises.archived", "is", true)
    .order("ordre", { referencedTable: "workout_exercises" })
  const { data } = await ("id" in critere ? requete.eq("id", critere.id) : requete.ilike("code", critere.code)).limit(1)
  return data?.[0] ?? null
}

const chargeDe = (l: { charge_depart_kg: number | null }) =>
  l.charge_depart_kg === null ? "sans charge" : `${nombre(l.charge_depart_kg)} kg`

const resumeLigne = (l: Parameters<typeof prescription>[0] & { charge_depart_kg: number | null; repos_sec: number }) =>
  `${prescription(l)}, ${chargeDe(l)}, repos ${l.repos_sec} s`

// Réglages d'une ligne de séance que le modèle peut fixer, avec leurs bornes.
const Reglages = z.object({
  series: z.number().int().min(1).max(20).optional(),
  reps_min: z.number().int().min(1).max(200).nullable().optional(),
  reps_max: z.number().int().min(1).max(200).nullable().optional(),
  duree_sec: z.number().int().min(5).max(3600).nullable().optional(),
  repos_sec: z.number().int().min(0).max(900).optional(),
  charge_depart_kg: z.number().min(0).max(1000).nullable().optional(),
  charge_cible_kg: z.number().min(0).max(1000).nullable().optional(),
  increment_kg: z.number().min(0.25).max(100).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
})

const LIBELLE_REGLAGE: Record<string, string> = {
  series: "Séries",
  reps_min: "Reps mini",
  reps_max: "Reps maxi",
  duree_sec: "Durée (s)",
  repos_sec: "Repos (s)",
  charge_depart_kg: "Charge de départ (kg)",
  charge_cible_kg: "Charge cible (kg)",
  increment_kg: "Incrément (kg)",
  note: "Note",
}
const lisible = (valeur: unknown) => (valeur === null || valeur === undefined ? "aucun" : String(valeur).replace(".", ","))

type SerieFaite = { charge_kg: number | null; reps: number | null; duree_sec: number | null }

// « 3 × 10 à 40 kg » quand les séries sont identiques, sinon le détail série par série.
function resumeSeries(series: SerieFaite[]) {
  const textes = series.map(
    (s) =>
      [s.reps !== null ? String(s.reps) : null, s.duree_sec !== null ? `${s.duree_sec} s` : null].filter(Boolean).join(" · ") +
      (s.charge_kg !== null ? ` à ${nombre(s.charge_kg)} kg` : "")
  )
  if (textes.every((t) => t === "")) return `${series.length} série${series.length > 1 ? "s" : ""}`
  return textes.every((t) => t === textes[0]) ? `${series.length} × ${textes[0]}` : textes.join(" / ")
}

function parExercice<T extends SerieFaite>(series: { nom: string; serie: T }[]) {
  const groupes = new Map<string, T[]>()
  for (const { nom, serie } of series) groupes.set(nom, [...(groupes.get(nom) ?? []), serie])
  return groupes
}

// Retrouve un exercice par son nom, ou prépare sa création.
async function exercicePour(c: Contexte, nom: string, groupe?: string, equipement?: string) {
  const { data } = await c.supabase.from("exercises").select("id, nom").not("archived", "is", true)
  const connu = (data ?? []).find((e) => cleDe(e.nom) === cleDe(nom))
  if (connu) return { id: connu.id, nom: connu.nom, creation: null }
  const id = crypto.randomUUID()
  const creation: ChangementChat = {
    table: "exercises",
    operation: "insert",
    id,
    data: { nom: nom.trim().slice(0, 60), groupe: groupe ?? "jambes", equipement: equipement ?? "aucun" },
  }
  return { id, nom: nom.trim(), creation }
}

// --- Les outils -----------------------------------------------------------------------------

export function creerOutils(c: Contexte) {
  const db = c.supabase

  return [
    // ----- Lecture -----
    betaZodTool({
      name: "get_programme",
      description:
        "Lit une partie du programme de l'utilisateur. 'sport' : les séances et leurs exercices. 'nutrition' : les plats et les menus des deux semaines. 'pied' : le protocole pied et les dernières douleurs. 'course' : le plan de course et les sorties.",
      inputSchema: z.object({ section: z.enum(["sport", "nutrition", "pied", "course"]) }),
      run: async ({ section }) => {
        if (section === "sport") {
          const { data } = await db
            .from("workouts")
            .select("id, code, nom, lieu, duree_min, jour_suggere, note, workout_exercises(id, ordre, series, reps_min, reps_max, duree_sec, repos_sec, charge_depart_kg, charge_cible_kg, increment_kg, archived, exercise:exercises(nom))")
            .not("archived", "is", true)
            .order("ordre")
          return texte(
            (data ?? []).map((s) => ({ ...s, workout_exercises: s.workout_exercises.filter((l) => !l.archived).sort((a, b) => a.ordre - b.ordre) }))
          )
        }
        if (section === "nutrition") {
          const [{ data: plats }, { data: plan }] = await Promise.all([
            db.from("meals").select("id, nom, slot, kcal, proteines_g, tag").not("archived", "is", true),
            db.from("meal_plan").select("semaine, jour, slot, meal_id"),
          ])
          return texte({ plats, menus: plan })
        }
        if (section === "pied") {
          const [{ data: items }, { data: paliers }, { data: douleurs }] = await Promise.all([
            db.from("foot_protocol_items").select("moment, exercice, dosage").order("ordre"),
            db.from("foot_progression").select("semaine_debut, semaine_fin, dosage"),
            db.from("foot_logs").select("date, douleur_matin, protocole_fait").order("date", { ascending: false }).limit(14),
          ])
          return texte({ protocole: items, progression: paliers, douleurs })
        }
        const [{ data: plan }, { data: sorties }] = await Promise.all([
          db.from("running_plan").select("semaine, protocole, volume_km_cible, statut").order("semaine"),
          db.from("running_logs").select("date, km, duree_min, douleur_apres, douleur_lendemain").order("date", { ascending: false }).limit(10),
        ])
        return texte({ plan, sorties })
      },
    }),

    betaZodTool({
      name: "get_seance",
      description: "Lit une séance par son code (A, B, C…), avec l'identifiant de chacune de ses lignes d'exercice. À appeler avant de modifier une séance.",
      inputSchema: z.object({ code: z.string().min(1).max(8) }),
      run: async ({ code }) => {
        const seance = await lireSeance(c, { code })
        return seance ? texte(seance) : `Aucune séance avec le code ${code}.`
      },
    }),

    betaZodTool({
      name: "get_historique",
      description: "Lit les dernières séances faites pour un exercice, par son nom : charges, répétitions et RIR de chaque série.",
      inputSchema: z.object({ exercice: z.string().min(2).max(60), nb_seances: z.number().int().min(1).max(10) }),
      run: async ({ exercice, nb_seances }) => {
        const { data } = await db
          .from("workout_logs")
          .select("date, set_logs(serie_num, charge_kg, reps, duree_sec, rir, exercise:exercises(nom))")
          .order("date", { ascending: false })
          .limit(40)
        const seances = (data ?? [])
          .map((log) => ({
            date: log.date,
            series: log.set_logs.filter((s) => cleDe(s.exercise.nom).includes(cleDe(exercice))),
          }))
          .filter((s) => s.series.length > 0)
          .slice(0, nb_seances)
        return seances.length ? texte(seances) : `Aucune séance enregistrée pour « ${exercice} ».`
      },
    }),

    betaZodTool({
      name: "get_logs",
      description: "Lit les enregistrements d'une période : 'seances', 'poids', 'pied' (douleur du matin), 'repas' ou 'course'. Dates au format AAAA-MM-JJ.",
      inputSchema: z.object({
        type: z.enum(["seances", "poids", "pied", "repas", "course"]),
        depuis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        jusqu_a: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      run: async ({ type, depuis, jusqu_a }) => {
        const table = ({ seances: "workout_logs", poids: "body_metrics", pied: "foot_logs", repas: "meal_logs", course: "running_logs" } as const)[type]
        const { data } = await db.from(table).select("*").gte("date", depuis).lte("date", jusqu_a).order("date").limit(200)
        return texte(data ?? [])
      },
    }),

    // ----- Séances -----
    betaZodTool({
      name: "update_exercice",
      description: "Change les réglages d'une ligne d'exercice dans une séance : séries, répétitions, repos, charges. Ne change pas l'exercice lui-même.",
      inputSchema: z.object({ workout_exercise_id: z.uuid(), champs: Reglages }),
      run: async ({ workout_exercise_id, champs }) => {
        const ligne = await lireLigne(c, workout_exercise_id)
        if (!ligne) return "Ligne d'exercice introuvable. Relis la séance avec get_seance."
        const actuel = ligne as unknown as Record<string, unknown>
        const modifies = Object.entries(champs).filter(([cle, valeur]) => valeur !== undefined && actuel[cle] !== valeur)
        if (modifies.length === 0) return soumettre(c, { changements: [], resume: "", diff: [], quota: true })
        const diff = modifies.map(([cle, valeur]) => ({ titre: LIBELLE_REGLAGE[cle] ?? cle, avant: lisible(actuel[cle]), apres: lisible(valeur) }))
        return soumettre(c, {
          changements: [{ table: "workout_exercises", operation: "update", id: ligne.id, data: Object.fromEntries(modifies) }],
          resume: `${ligne.exercise.nom} (séance ${ligne.workout.code}) : ${diff.map((d) => `${d.titre.toLowerCase()} ${d.avant} → ${d.apres}`).join(", ")}`,
          diff,
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "ajouter_exercice",
      description: "Ajoute un exercice à la fin d'une séance. Donne le groupe musculaire et l'équipement si l'exercice est nouveau pour l'utilisateur.",
      inputSchema: z.object({
        workout_id: z.uuid(),
        exercice: z.string().min(2).max(60),
        groupe: z.enum(GROUPES).optional(),
        equipement: z.enum(EQUIPEMENTS).optional(),
        parametres: Reglages,
      }),
      run: async ({ workout_id, exercice, groupe, equipement, parametres }) => {
        const seance = await lireSeance(c, { id: workout_id })
        if (!seance) return "Séance introuvable."
        const cible = await exercicePour(c, exercice, groupe, equipement)
        const { data: toutes } = await db.from("workout_exercises").select("ordre").eq("workout_id", workout_id)
        const ordre = Math.max(0, ...(toutes ?? []).map((l) => l.ordre)) + 1
        const reglages = { series: 3, repos_sec: 90, reps_min: null, reps_max: null, duree_sec: null, charge_depart_kg: null, ...parametres }
        return soumettre(c, {
          changements: [
            ...(cible.creation ? [cible.creation] : []),
            { table: "workout_exercises", operation: "insert", id: crypto.randomUUID(), data: { workout_id, exercise_id: cible.id, ordre, ...reglages } },
          ],
          resume: `${cible.nom} ajouté à la séance ${seance.code}`,
          diff: [{ titre: `Séance ${seance.code}`, avant: null, apres: `${cible.nom} : ${resumeLigne(reglages)}` }],
          lignes: 1,
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "supprimer_exercice",
      description: "Retire un exercice d'une séance. Les séries déjà enregistrées sur cet exercice sont conservées.",
      inputSchema: z.object({ workout_exercise_id: z.uuid() }),
      run: async ({ workout_exercise_id }) => {
        const ligne = await lireLigne(c, workout_exercise_id)
        if (!ligne) return "Ligne d'exercice introuvable."
        return soumettre(c, {
          changements: [{ table: "workout_exercises", operation: "update", id: ligne.id, data: { archived: true } }],
          resume: `${ligne.exercise.nom} retiré de la séance ${ligne.workout.code}`,
          diff: [{ titre: `Séance ${ligne.workout.code}`, avant: `${ligne.exercise.nom} : ${resumeLigne(ligne)}`, apres: null }],
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "remplacer_exercice",
      description: "Remplace un exercice d'une séance par un autre, à la même place. Sans paramètres, le nouvel exercice reprend les séries, répétitions et repos de l'ancien ; précise au moins une charge de départ adaptée.",
      inputSchema: z.object({
        workout_exercise_id: z.uuid(),
        nouvel_exercice: z.string().min(2).max(60),
        groupe: z.enum(GROUPES).optional(),
        equipement: z.enum(EQUIPEMENTS).optional(),
        parametres: Reglages.optional(),
      }),
      run: async ({ workout_exercise_id, nouvel_exercice, groupe, equipement, parametres }) => {
        const ligne = await lireLigne(c, workout_exercise_id)
        if (!ligne) return "Ligne d'exercice introuvable."
        const cible = await exercicePour(c, nouvel_exercice, groupe, equipement)
        if (cible.id === ligne.exercise.id) return "C'est déjà cet exercice."
        const reglages = {
          series: ligne.series, reps_min: ligne.reps_min, reps_max: ligne.reps_max, duree_sec: ligne.duree_sec,
          repos_sec: ligne.repos_sec, charge_depart_kg: ligne.charge_depart_kg, charge_cible_kg: ligne.charge_cible_kg,
          increment_kg: ligne.increment_kg, note: null, ...parametres,
        }
        // L'ancienne ligne est archivée, pas réécrite : ses séries enregistrées restent attachées au bon exercice.
        return soumettre(c, {
          changements: [
            ...(cible.creation ? [cible.creation] : []),
            { table: "workout_exercises", operation: "update", id: ligne.id, data: { archived: true } },
            { table: "workout_exercises", operation: "insert", id: crypto.randomUUID(), data: { workout_id: ligne.workout.id, exercise_id: cible.id, ordre: ligne.ordre, bloc: ligne.bloc, ...reglages } },
          ],
          resume: `${ligne.exercise.nom} remplacé par ${cible.nom} dans la séance ${ligne.workout.code}`,
          diff: [{ titre: `Séance ${ligne.workout.code}, exercice ${ligne.ordre}`, avant: `${ligne.exercise.nom} : ${resumeLigne(ligne)}`, apres: `${cible.nom} : ${resumeLigne(reglages)}` }],
          lignes: 1,
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "reordonner_seance",
      description: "Change l'ordre des exercices d'une séance. Donne la liste complète des identifiants de lignes, dans le nouvel ordre.",
      inputSchema: z.object({ workout_id: z.uuid(), ordre_ids: z.array(z.uuid()).min(2).max(30) }),
      run: async ({ workout_id, ordre_ids }) => {
        const seance = await lireSeance(c, { id: workout_id })
        if (!seance) return "Séance introuvable."
        const lignes = seance.workout_exercises
        if (lignes.length !== ordre_ids.length || new Set(ordre_ids).size !== ordre_ids.length || !lignes.every((l) => ordre_ids.includes(l.id))) {
          return "La liste doit contenir exactement les lignes de la séance, une fois chacune."
        }
        const rangs = lignes.map((l) => l.ordre)
        const changements = ordre_ids.flatMap((id, index): ChangementChat[] => {
          const ligne = lignes.find((l) => l.id === id)!
          return ligne.ordre === rangs[index] ? [] : [{ table: "workout_exercises", operation: "update", id, data: { ordre: rangs[index] } }]
        })
        const nom = (id: string) => lignes.find((l) => l.id === id)!.exercise.nom
        return soumettre(c, {
          changements,
          resume: `Séance ${seance.code} : ordre des exercices modifié`,
          diff: [{ titre: `Ordre de la séance ${seance.code}`, avant: lignes.map((l) => l.exercise.nom).join(" · "), apres: ordre_ids.map(nom).join(" · ") }],
          lignes: 1,
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "update_charges",
      description: "Change les charges de départ de plusieurs exercices d'une séance : soit un facteur appliqué à toutes (0,9 pour alléger de 10 %), soit une liste de valeurs par ligne.",
      inputSchema: z.object({
        workout_id: z.uuid(),
        facteur: z.number().min(0.3).max(2).optional(),
        valeurs: z.array(z.object({ workout_exercise_id: z.uuid(), charge_depart_kg: z.number().min(0).max(1000) })).max(30).optional(),
      }),
      run: async ({ workout_id, facteur, valeurs }) => {
        const seance = await lireSeance(c, { id: workout_id })
        if (!seance) return "Séance introuvable."
        const voulues = new Map(
          valeurs
            ? valeurs.map((v) => [v.workout_exercise_id, v.charge_depart_kg])
            : seance.workout_exercises
                .filter((l) => l.charge_depart_kg !== null && facteur !== undefined)
                // Arrondi au demi-kilo : une charge calculée doit rester chargeable sur une barre.
                .map((l) => [l.id, Math.round(l.charge_depart_kg! * facteur! * 2) / 2])
        )
        const touchees = seance.workout_exercises.filter((l) => voulues.has(l.id) && voulues.get(l.id) !== l.charge_depart_kg)
        return soumettre(c, {
          changements: touchees.map((l) => ({ table: "workout_exercises", operation: "update" as const, id: l.id, data: { charge_depart_kg: voulues.get(l.id) } })),
          resume: `Séance ${seance.code} : charges de départ ajustées`,
          diff: touchees.map((l) => ({ titre: l.exercise.nom, avant: chargeDe(l), apres: `${nombre(voulues.get(l.id)!)} kg` })),
          quota: true,
        })
      },
    }),

    // ----- Nutrition -----
    betaZodTool({
      name: "remplacer_repas",
      description: "Place un plat dans une case des menus (semaine 1 ou 2, jour, repas). Pour échanger deux repas, appelle l'outil une fois par case.",
      inputSchema: z.object({ semaine: z.union([z.literal(1), z.literal(2)]), jour: z.enum(JOURS), slot: z.enum(SLOTS), meal_id: z.uuid() }),
      run: async ({ semaine, jour, slot, meal_id }) => {
        const [{ data: caseMenu }, { data: plat }] = await Promise.all([
          db.from("meal_plan").select("id, meal_id, meal:meals(nom)").eq("semaine", semaine).eq("jour", jour).eq("slot", slot).maybeSingle(),
          db.from("meals").select("nom, slot").eq("id", meal_id).maybeSingle(),
        ])
        if (!caseMenu || !plat) return "Case de menu ou plat introuvable. Relis le programme nutrition."
        if (plat.slot !== slot) return `Ce plat est prévu pour « ${LIBELLE_SLOT[plat.slot]} », pas pour « ${LIBELLE_SLOT[slot]} ».`
        if (caseMenu.meal_id === meal_id) return soumettre(c, { changements: [], resume: "", diff: [], quota: true })
        return soumettre(c, {
          changements: [{ table: "meal_plan", operation: "update", id: caseMenu.id, data: { meal_id } }],
          resume: `${LIBELLE_SLOT[slot]} de ${jour} (semaine ${semaine}) : ${plat.nom}`,
          diff: [{ titre: `${LIBELLE_SLOT[slot]} de ${jour}`, avant: caseMenu.meal?.nom ?? "rien", apres: plat.nom }],
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "creer_recette",
      description: "Ajoute un plat à la liste de l'utilisateur, avec ses macros pour une portion, ses ingrédients chiffrés et sa recette en Markdown.",
      inputSchema: z.object({
        nom: z.string().min(2).max(90),
        slot: z.enum(SLOTS),
        kcal: z.number().int().min(0).max(3000),
        proteines_g: z.number().int().min(0).max(300),
        lipides_g: z.number().int().min(0).max(300).nullable().optional(),
        glucides_g: z.number().int().min(0).max(500).nullable().optional(),
        temps_min: z.number().int().min(0).max(600).nullable().optional(),
        recette_md: z.string().max(3000),
        ingredients: z.array(z.object({ nom: z.string().min(1).max(80), quantite: z.number().nullable(), unite: z.string().max(20).nullable() })).max(30),
      }),
      run: async (plat) => {
        // Aliments exclus par l'utilisateur (SPEC 8.14) : vérifiés ici, pas seulement demandés au modèle.
        const textes = [plat.nom, ...plat.ingredients.map((i) => i.nom)].map(cleDe)
        const interdit = c.alimentsExclus.find((aliment) => textes.some((t) => t.includes(cleDe(aliment))))
        if (interdit) return `REFUS : ce plat contient « ${interdit} », que l'utilisateur a exclu. Propose une recette sans cet aliment.`
        return soumettre(c, {
          changements: [{ table: "meals", operation: "insert", id: crypto.randomUUID(), data: { ...plat, tag: "standard" } }],
          resume: `Plat créé : ${plat.nom}`,
          diff: [{ titre: LIBELLE_SLOT[plat.slot] ?? plat.slot, avant: null, apres: `${plat.nom} : ${plat.kcal} kcal, ${plat.proteines_g} g de protéines` }],
          quota: true,
        })
      },
    }),

    betaZodTool({
      name: "generer_liste_courses",
      description: "Génère la liste de courses de la semaine qui commence le lundi donné (AAAA-MM-JJ), à partir des menus de la semaine 1 ou 2.",
      inputSchema: z.object({ semaine_du: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), semaine_menu: z.union([z.literal(1), z.literal(2)]) }),
      run: async ({ semaine_du, semaine_menu }) => {
        const [{ data: cases }, { data: catalogue }, { data: ancienne }] = await Promise.all([
          db.from("meal_plan").select("meal:meals(ingredients)").eq("semaine", semaine_menu),
          db.from("grocery_items").select("nom, categorie, quantite, prix_eur, recurrent"),
          db.from("grocery_list_items").select("id").eq("semaine_du", semaine_du),
        ])
        const ingredients = (cases ?? []).flatMap((ligne) => (Array.isArray(ligne.meal?.ingredients) ? (ligne.meal.ingredients as unknown as IngredientDePlat[]) : []))
        const articles = composerListe(ingredients, catalogue ?? []).slice(0, 200)
        if (articles.length === 0) return "Rien à mettre dans la liste : les plats de cette semaine n'ont pas d'ingrédients renseignés."
        return soumettre(c, {
          changements: [
            ...(ancienne ?? []).map((a): ChangementChat => ({ table: "grocery_list_items", operation: "delete", id: a.id })),
            ...articles.map((a): ChangementChat => ({ table: "grocery_list_items", operation: "insert", id: crypto.randomUUID(), data: { semaine_du, ...a } })),
          ],
          resume: `Liste de courses du ${dateCourte(semaine_du)} générée : ${articles.length} articles`,
          diff: [{ titre: `Semaine du ${dateCourte(semaine_du)}`, avant: ancienne?.length ? `${ancienne.length} articles` : "pas de liste", apres: `${articles.length} articles` }],
          sansLimite: true,
          quota: false,
        })
      },
    }),

    // ----- Journal des repas : ce qu'il a réellement mangé -----
    betaZodTool({
      name: "noter_repas",
      description:
        "Enregistre ce qu'il a réellement mangé, aujourd'hui ou un jour passé (AAAA-MM-JJ), repas par repas. Les menus ne sont pas modifiés. " +
        "Pour un plat de sa liste (celui du menu ou un autre), donne meal_id (lu avec get_programme nutrition). " +
        "Pour autre chose (restaurant, plat improvisé), donne une description courte et une estimation réaliste des calories et des protéines, sans meal_id. " +
        "Un repas déjà noté ce jour-là est remplacé.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        repas: z
          .array(
            z.object({
              slot: z.enum(SLOTS),
              meal_id: z.uuid().nullable().optional(),
              description: z.string().min(2).max(200).nullable().optional(),
              kcal: z.number().int().min(0).max(5000).nullable().optional(),
              proteines_g: z.number().int().min(0).max(400).nullable().optional(),
            })
          )
          .min(1)
          .max(SLOTS.length),
      }),
      run: async ({ date, repas }) => {
        if (date > c.aujourdhui) return "REFUS : on ne note pas un repas à l'avance."
        if (new Set(repas.map((r) => r.slot)).size !== repas.length) return "Un même repas apparaît deux fois : un seul par moment de la journée."
        const idsPlats = repas.flatMap((r) => (r.meal_id ? [r.meal_id] : []))
        const [{ data: plats }, { data: dejaNotes }] = await Promise.all([
          idsPlats.length ? db.from("meals").select("id, nom, kcal, proteines_g").in("id", idsPlats) : Promise.resolve({ data: [] }),
          db.from("meal_logs").select("id, slot, meal_id, hors_plan, kcal_reel, note, meal:meals(nom)").eq("date", date),
        ])
        const parPlat = new Map((plats ?? []).map((p) => [p.id, p]))
        const changements: ChangementChat[] = []
        const diff: LigneDiff[] = []
        for (const r of repas) {
          const plat = r.meal_id ? parPlat.get(r.meal_id) : undefined
          if (r.meal_id && !plat) return `Plat introuvable pour « ${LIBELLE_SLOT[r.slot]} ». Relis la liste avec get_programme nutrition.`
          if (!plat && (!r.description || r.kcal == null || r.proteines_g == null)) {
            return `Pour « ${LIBELLE_SLOT[r.slot]} », donne soit meal_id, soit une description avec une estimation des calories et des protéines.`
          }
          const data = plat
            ? { meal_id: plat.id, hors_plan: false, kcal_reel: null, proteines_reel: null, note: null }
            : { meal_id: null, hors_plan: true, kcal_reel: r.kcal, proteines_reel: r.proteines_g, note: r.description!.trim() }
          const existant = (dejaNotes ?? []).find((l) => l.slot === r.slot)
          changements.push(
            existant
              ? { table: "meal_logs", operation: "update", id: existant.id, data }
              : { table: "meal_logs", operation: "insert", id: crypto.randomUUID(), data: { date, slot: r.slot, ...data } }
          )
          diff.push({
            titre: LIBELLE_SLOT[r.slot] ?? r.slot,
            avant: existant
              ? existant.hors_plan
                ? `Hors plan${existant.note ? ` : ${existant.note}` : ""}${existant.kcal_reel !== null ? `, ${existant.kcal_reel} kcal` : ""}`
                : (existant.meal?.nom ?? "Repas noté")
              : null,
            apres: plat ? `${plat.nom} (${plat.kcal} kcal)` : `${r.description!.trim()} : ${r.kcal} kcal, ${r.proteines_g} g de protéines`,
          })
        }
        return soumettre(c, {
          changements,
          resume: `Repas du ${dateCourte(date)} : ${repas.length} repas noté${repas.length > 1 ? "s" : ""}`,
          diff,
          // C'est un relevé, pas le programme : pas de quota.
          quota: false,
        })
      },
    }),

    // ----- Mesures : gratuites, ce ne sont pas des modifications du programme -----
    betaZodTool({
      name: "log_poids",
      description: "Enregistre une pesée (et le tour de taille s'il est donné) pour une date AAAA-MM-JJ.",
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), poids_kg: z.number().min(30).max(300), tour_taille_cm: z.number().min(40).max(250).nullable().optional() }),
      run: async ({ date, poids_kg, tour_taille_cm }) => {
        const { data: existant } = await db.from("body_metrics").select("id, poids_kg").eq("date", date).maybeSingle()
        const data = tour_taille_cm == null ? { poids_kg } : { poids_kg, tour_taille_cm }
        return soumettre(c, {
          changements: [existant ? { table: "body_metrics", operation: "update", id: existant.id, data } : { table: "body_metrics", operation: "insert", id: crypto.randomUUID(), data: { date, ...data } }],
          resume: `Pesée du ${dateCourte(date)} : ${nombre(poids_kg)} kg`,
          diff: [],
          quota: false,
        })
      },
    }),

    betaZodTool({
      name: "log_douleur_pied",
      description: "Enregistre la douleur du pied au réveil, de 0 à 10, pour une date AAAA-MM-JJ.",
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), douleur: z.number().int().min(0).max(10) }),
      run: async ({ date, douleur }) => {
        const { data: existant } = await db.from("foot_logs").select("id").eq("date", date).maybeSingle()
        return soumettre(c, {
          changements: [existant ? { table: "foot_logs", operation: "update", id: existant.id, data: { douleur_matin: douleur } } : { table: "foot_logs", operation: "insert", id: crypto.randomUUID(), data: { date, douleur_matin: douleur } }],
          resume: `Douleur du matin du ${dateCourte(date)} : ${douleur} sur 10`,
          diff: [],
          quota: false,
        })
      },
    }),

    betaZodTool({
      name: "log_serie",
      description: "Enregistre une série faite aujourd'hui sur un exercice d'une séance : charge et répétitions.",
      inputSchema: z.object({ workout_exercise_id: z.uuid(), charge_kg: z.number().min(0).max(1000).nullable(), reps: z.number().int().min(0).max(999) }),
      run: async ({ workout_exercise_id, charge_kg, reps }) => {
        const ligne = await lireLigne(c, workout_exercise_id)
        if (!ligne) return "Ligne d'exercice introuvable."
        const resume = `Série du jour : ${ligne.exercise.nom}, ${charge_kg === null ? "" : `${nombre(charge_kg)} kg × `}${reps}`
        // Une série isolée devient une petite séance du jour, rattachée à la sienne. C'est un relevé : pas de quota.
        c.effets.push({
          type: "propose",
          id: crypto.randomUUID(),
          resume,
          diff: [],
          statut: "en_attente",
          changements: [],
          seance: {
            p_id: crypto.randomUUID(),
            p_date: c.aujourdhui,
            p_workout_id: ligne.workout.id,
            p_series: [
              { exercise_id: ligne.exercise.id, workout_exercise_id: ligne.id, serie_num: 1, charge_kg, reps, duree_sec: null },
            ],
            p_resume: resume,
          },
          quota: false,
        })
        return PROPOSE
      },
    }),

    betaZodTool({
      name: "enregistrer_seance",
      description:
        "Enregistre une séance faite, avec toutes ses séries, aujourd'hui ou à une date passée (AAAA-MM-JJ). Le programme n'est pas modifié. " +
        "Les exercices peuvent venir de plusieurs séances du programme, ou d'aucune : reprends le nom exact d'un exercice déjà connu quand c'est le même mouvement ; sinon il est créé, et il faut alors donner son groupe et son équipement. " +
        "Une entrée de « series » par série faite : « 10 × 3 séries à 40 kg » donne trois entrées de 10 reps à 40 kg. " +
        "seance_code rattache la séance à une séance du programme (A, B…), seulement si c'est bien celle-là ; sans lui, elle est enregistrée hors programme. " +
        "Pour remplacer une séance déjà enregistrée, passe son identifiant (dans l'état ou via get_logs) dans remplace_id : l'ancienne et ses séries sont retirées.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        seance_code: z.string().min(1).max(8).nullable().optional(),
        remplace_id: z.uuid().nullable().optional(),
        duree_min: z.number().int().min(1).max(600).nullable().optional(),
        note: z.string().max(300).nullable().optional(),
        exercices: z
          .array(
            z.object({
              nom: z.string().min(2).max(60),
              groupe: z.enum(GROUPES).optional(),
              equipement: z.enum(EQUIPEMENTS).optional(),
              series: z
                .array(
                  z.object({
                    charge_kg: z.number().min(0).max(1000).nullable(),
                    reps: z.number().int().min(0).max(999).nullable(),
                    duree_sec: z.number().int().min(1).max(3600).nullable().optional(),
                  })
                )
                .min(1)
                .max(20),
            })
          )
          .min(1)
          .max(20),
      }),
      run: async ({ date, seance_code, remplace_id, duree_min, note, exercices }) => {
        if (date > c.aujourdhui) return "REFUS : une séance ne s'enregistre pas à une date future."
        const seance = seance_code ? await lireSeance(c, { code: seance_code }) : null
        if (seance_code && !seance) return `Aucune séance avec le code ${seance_code}. Enregistre-la hors programme, sans seance_code.`

        const [{ data: connus }, { data: ancienne }] = await Promise.all([
          db.from("exercises").select("id, nom").not("archived", "is", true),
          remplace_id
            ? db
                .from("workout_logs")
                .select("id, date, workout:workouts(code), set_logs(serie_num, charge_kg, reps, duree_sec, exercise:exercises(nom))")
                .eq("id", remplace_id)
                .order("serie_num", { referencedTable: "set_logs" })
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (remplace_id && !ancienne) return "Séance à remplacer introuvable. Relis les séances faites avec get_logs."

        // Un mouvement cité deux fois n'est créé qu'une fois.
        const parCle = new Map((connus ?? []).map((e) => [cleDe(e.nom), e]))
        const nouveaux: { id: string; nom: string; groupe: string; equipement: string }[] = []
        const sansGroupe: string[] = []
        const series: (SerieFaite & { exercise_id: string; workout_exercise_id: string | null; serie_num: number })[] = []
        const faites: { nom: string; serie: SerieFaite }[] = []
        for (const exercice of exercices) {
          const cle = cleDe(exercice.nom)
          if (!parCle.has(cle)) {
            if (!exercice.groupe || !exercice.equipement) {
              sansGroupe.push(exercice.nom)
              continue
            }
            const nouveau = { id: crypto.randomUUID(), nom: exercice.nom.trim().slice(0, 60) }
            nouveaux.push({ ...nouveau, groupe: exercice.groupe, equipement: exercice.equipement })
            parCle.set(cle, nouveau)
          }
          const cible = parCle.get(cle)!
          const ligne = seance?.workout_exercises.find((l) => l.exercise.id === cible.id)
          const deja = series.filter((s) => s.exercise_id === cible.id).length
          exercice.series.forEach((s, i) => {
            const serie = { charge_kg: s.charge_kg, reps: s.reps, duree_sec: s.duree_sec ?? null }
            series.push({ ...serie, exercise_id: cible.id, workout_exercise_id: ligne?.id ?? null, serie_num: deja + i + 1 })
            faites.push({ nom: cible.nom, serie })
          })
        }
        if (sansGroupe.length > 0) {
          return `Rien n'est enregistré. Exercices nouveaux pour l'utilisateur : ${sansGroupe.join(", ")}. Rappelle l'outil en donnant groupe et equipement pour chacun.`
        }

        const nombreExercices = new Set(series.map((s) => s.exercise_id)).size
        const libelle = seance ? `séance ${seance.code}` : "hors programme"
        const contenu = `${nombreExercices} exercice${nombreExercices > 1 ? "s" : ""}, ${series.length} série${series.length > 1 ? "s" : ""}`
        const resume = `Séance du ${dateCourte(date)} ${ancienne ? "remplacée" : "enregistrée"} (${libelle}) : ${contenu}`
        const args: SeancePassee = {
          p_id: crypto.randomUUID(),
          p_date: date,
          p_series: series as unknown as Json,
          p_resume: resume,
          p_workout_id: seance?.id,
          p_duree_min: duree_min ?? undefined,
          p_note: note ?? undefined,
          p_exercices: nouveaux as unknown as Json,
          p_remplace: ancienne?.id,
        }

        // Proposé avec l'avant (s'il y en a un) et l'après, exercice par exercice. C'est un relevé : pas de quota.
        const avant = parExercice((ancienne?.set_logs ?? []).map((s) => ({ nom: s.exercise.nom, serie: s })))
        const apres = parExercice(faites)
        const noms = [...new Set([...avant.keys(), ...apres.keys()])]
        c.effets.push({
          type: "propose",
          id: crypto.randomUUID(),
          resume,
          diff: [
            ...(ancienne
              ? [
                  {
                    titre: `Séance du ${dateCourte(ancienne.date)}`,
                    avant: `${ancienne.workout ? `Séance ${ancienne.workout.code}` : "Hors programme"}, ${ancienne.set_logs.length} série${ancienne.set_logs.length > 1 ? "s" : ""}`,
                    apres: `${seance ? `Séance ${seance.code}` : "Hors programme"}, ${series.length} série${series.length > 1 ? "s" : ""}`,
                  },
                ]
              : []),
            ...noms.map((nom) => ({
              titre: nom,
              avant: avant.has(nom) ? resumeSeries(avant.get(nom)!) : null,
              apres: apres.has(nom) ? resumeSeries(apres.get(nom)!) : null,
            })),
          ],
          statut: "en_attente",
          changements: [],
          seance: args,
          quota: false,
        })
        return PROPOSE
      },
    }),

    // ----- Planning par date -----
    betaZodTool({
      name: "planifier_jours",
      description:
        "Change ce qui est prévu à des dates précises, sans toucher à la semaine type : un jour de repos (seance_code à null) ou une autre séance du programme (seance_code). " +
        "Pour décaler une séance, mets le jour d'origine en repos et la séance au nouveau jour, dans le même appel. Donne toujours la raison, en quelques mots. " +
        "Remettre à une date la séance de sa semaine type retire l'exception. Aujourd'hui ou plus tard seulement.",
      inputSchema: z.object({
        jours: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              seance_code: z.string().min(1).max(8).nullable(),
              raison: z.string().min(2).max(300),
            })
          )
          .min(1)
          .max(7),
      }),
      run: async ({ jours }) => {
        if (jours.some((j) => j.date < c.aujourdhui)) return "REFUS : le planning ne se change pas pour un jour passé."
        if (new Set(jours.map((j) => j.date)).size !== jours.length) return "Une même date apparaît deux fois : regroupe-les."
        const [{ data: seances }, { data: exceptions }] = await Promise.all([
          db.from("workouts").select("id, code, nom, jour_suggere").not("archived", "is", true),
          db.from("planning").select("id, date, workout_id").in("date", jours.map((j) => j.date)),
        ])
        const liste = seances ?? []
        const libelle = (id: string | null | undefined) => {
          const seance = id ? liste.find((s) => s.id === id) : undefined
          return seance ? `Séance ${seance.code} · ${seance.nom}` : "Repos"
        }
        const changements: ChangementChat[] = []
        const diff: LigneDiff[] = []
        for (const jour of jours) {
          const cible = jour.seance_code ? liste.find((s) => s.code.toLowerCase() === jour.seance_code!.toLowerCase()) : null
          if (jour.seance_code && !cible) return `Aucune séance avec le code ${jour.seance_code}.`
          const type = seanceDeLaSemaineType(jour.date, liste)
          const existante = (exceptions ?? []).find((e) => e.date === jour.date)
          const avant = libelle(existante ? existante.workout_id : type?.id)
          const voulue = cible?.id ?? null
          if (voulue === (type?.id ?? null)) {
            // Revenir à la semaine type, c'est retirer l'exception.
            if (existante) changements.push({ table: "planning", operation: "delete", id: existante.id })
          } else {
            const data = { date: jour.date, workout_id: voulue, raison: jour.raison }
            changements.push(
              existante
                ? { table: "planning", operation: "update", id: existante.id, data }
                : { table: "planning", operation: "insert", id: crypto.randomUUID(), data }
            )
          }
          const apres = libelle(voulue)
          if (avant !== apres) diff.push({ titre: majusculeInitiale(dateCourte(jour.date)), avant, apres })
        }
        return soumettre(c, {
          changements,
          resume: jours.length === 1 ? `${majusculeInitiale(dateCourte(jours[0]!.date))} : ${libelle(changements[0]?.data?.workout_id as string | null)}. ${jours[0]!.raison}` : `Planning ajusté sur ${jours.length} jours : ${jours[0]!.raison}`,
          diff,
          // Décider d'un repos ou d'un décalage n'est pas modifier le programme : pas de quota.
          quota: false,
          sansLimite: true,
        })
      },
    }),

    // ----- Mémoire du coach -----
    betaZodTool({
      name: "noter_seance",
      description:
        "Garde dans une séance faite ce que l'utilisateur en dit : difficulté, fatigue, douleur ou gêne, technique, motivation. " +
        "La note est invisible pour lui : elle sert au recalcul automatique de ses prochaines séances, relancé à chaque note. Une phrase factuelle, sans conseil. " +
        "L'identifiant de la séance est dans l'état (séances faites) ou via get_logs.",
      inputSchema: z.object({ workout_log_id: z.uuid(), note: z.string().min(3).max(400) }),
      run: async ({ workout_log_id, note }) => {
        const { data: log } = await db.from("workout_logs").select("id, note_coach").eq("id", workout_log_id).maybeSingle()
        if (!log) return "Séance introuvable. Relis les séances faites avec get_logs."
        const texte = [log.note_coach, note.trim()].filter(Boolean).join("\n").slice(-2000)
        const { error } = await db.from("workout_logs").update({ note_coach: texte }).eq("id", log.id)
        if (error) return "ÉCHEC : la note n'a pas pu être enregistrée."
        after(() => recalculerApresSeance(c.supabase, log.id, { force: true }))
        return "NOTÉ, de façon invisible pour l'utilisateur : n'en parle pas comme d'une modification. Le recalcul de ses prochaines séances est relancé ; s'il y a quelque chose à ajuster, une proposition apparaîtra dans son onglet Sport."
      },
    }),

    betaZodTool({
      name: "annuler",
      description: "Annule une modification déjà appliquée, à partir de son identifiant d'historique.",
      inputSchema: z.object({ change_log_id: z.uuid() }),
      run: async ({ change_log_id }) => {
        const { data } = await db.from("change_log").select("groupe_id, resume").or(`id.eq.${change_log_id},groupe_id.eq.${change_log_id}`).limit(1)
        const entree = data?.[0]
        if (!entree) return "Modification introuvable dans l'historique."
        const { error } = await db.rpc("annuler_changement", { p_groupe: entree.groupe_id })
        return error ? "Cette modification ne peut plus être annulée (déjà annulée, ou l'élément a changé depuis)." : `ANNULÉ : ${entree.resume}`
      },
    }),
  ]
}
