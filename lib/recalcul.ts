import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"

import type { Json } from "@/lib/database.types"
import { decalerJours, nombre, prescription } from "@/lib/format"
import { feuTricolore } from "@/lib/regles"
import type { createClient } from "@/lib/supabase/server"

// Recalcul automatique après chaque séance enregistrée.
//
// Le modèle lit la séance qui vient d'être faite, les précédentes et les notes laissées par
// l'assistant, puis propose d'ajuster les lignes concernées du programme. Ce fichier ne lui fait
// pas confiance : chaque valeur est bornée ici (hausse limitée à l'incrément de l'exercice, rien
// à la hausse quand le pied est au rouge). Le résultat n'est qu'une proposition, rangée dans
// `ajustements` : rien ne change tant que l'utilisateur n'a pas accepté. Le recalcul est gratuit.

type Client = Awaited<ReturnType<typeof createClient>>

const MODELE = "claude-opus-5-5"
const SEANCES_D_HISTORIQUE = 6
const PAS_DE_CHARGE_PAR_DEFAUT = 2.5

// Ce que le modèle peut toucher sur une ligne de séance, et rien d'autre.
export const CHAMPS_AJUSTABLES = ["charge_depart_kg", "series", "reps_min", "reps_max", "duree_sec", "repos_sec"] as const
type Champ = (typeof CHAMPS_AJUSTABLES)[number]

const Reponse = z.object({
  explication: z.string(),
  ajustements: z.array(
    z.object({
      workout_exercise_id: z.string(),
      charge_depart_kg: z.number().nullable(),
      series: z.number().nullable(),
      reps_min: z.number().nullable(),
      reps_max: z.number().nullable(),
      duree_sec: z.number().nullable(),
      repos_sec: z.number().nullable(),
    })
  ),
})

const CONSIGNE = `Tu ajustes le programme de musculation d'un utilisateur juste après une séance. Tu reçois la séance qui vient d'être faite, les précédentes sur les mêmes exercices, l'effort ressenti, les répétitions en réserve (RIR) quand elles sont notées, les notes prises par son coach sur ce qu'il a dit, la douleur de son pied et les lignes du programme concernées.

Pour chaque ligne, décide s'il faut changer la charge de départ, le nombre de séries, les répétitions, la durée ou le repos de la prochaine fois. Mets null pour tout ce qui ne change pas, et n'inclus pas une ligne qui ne change pas du tout.

Règles :
- Progresse quand c'est mérité : toutes les répétitions prévues faites avec de la marge (RIR de 2 ou plus, ou effort ressenti facile). Une seule étape à la fois, de la valeur de l'incrément de l'exercice.
- Allège quand c'est trop dur : répétitions manquées, RIR à 0 sur plusieurs séries, effort ressenti très dur, fatigue ou douleur dans les notes.
- Sans signal clair, ne change rien. Ne pas proposer d'ajustement est une bonne réponse.
- Douleur, gêne ou blessure dans les notes : jamais de hausse sur les exercices qui sollicitent la zone.
- Tu ne changes que les lignes reçues. Pas d'ajout, de retrait ni de remplacement d'exercice.

L'explication tient en deux phrases au plus, en français, en tutoyant l'utilisateur. Elle dit ce que tu changes et pourquoi, à partir de ce qu'il a fait.`

type Ligne = {
  id: string
  workout_id: string
  series: number
  reps_min: number | null
  reps_max: number | null
  duree_sec: number | null
  repos_sec: number
  charge_depart_kg: number | null
  increment_kg: number | null
  exercise: { nom: string }
  workout: { code: string; nom: string; archived: boolean | null }
}

const arrondi = (valeur: number, pas: number) => Math.round(valeur / pas) * pas
const borne = (valeur: number, min: number, max: number) => Math.min(max, Math.max(min, valeur))

// Garde-fous : la valeur proposée est ramenée dans ce que la séance d'hier autorise.
function borner(ligne: Ligne, champ: Champ, propose: number | null, sansHausse: boolean): number | null {
  const actuel = ligne[champ]
  // Une valeur absente (exercice au poids du corps, pas de durée) n'est jamais créée par le recalcul.
  if (propose === null || actuel === null || !Number.isFinite(propose)) return null
  const plafond = (hausse: number) => (sansHausse ? actuel : actuel + hausse)
  let valeur: number
  switch (champ) {
    case "charge_depart_kg": {
      const pas = ligne.increment_kg ?? PAS_DE_CHARGE_PAR_DEFAUT
      valeur = arrondi(borne(propose, Math.max(0, actuel - Math.max(pas, actuel * 0.2)), plafond(pas)), 0.25)
      break
    }
    case "series":
      valeur = borne(Math.round(propose), Math.max(1, actuel - 1), Math.min(10, plafond(1)))
      break
    case "reps_min":
    case "reps_max":
      valeur = borne(Math.round(propose), Math.max(1, actuel - 2), plafond(2))
      break
    case "duree_sec":
      valeur = borne(arrondi(propose, 5), Math.max(5, actuel - 15), plafond(15))
      break
    case "repos_sec":
      // Plus de repos n'est jamais une prise de risque : la règle « sans hausse » ne s'y applique pas.
      valeur = borne(arrondi(propose, 15), Math.max(30, actuel - 30), Math.min(300, actuel + 30))
      break
  }
  return valeur === actuel ? null : valeur
}

const decrire = (l: Pick<Ligne, "series" | "reps_min" | "reps_max" | "duree_sec" | "repos_sec" | "charge_depart_kg">) =>
  [prescription(l), l.charge_depart_kg !== null ? `${nombre(l.charge_depart_kg)} kg` : null, `repos ${l.repos_sec} s`]
    .filter(Boolean)
    .join(", ")

// `force` : relancer même si un recalcul a déjà été fait pour cette séance (une note vient d'arriver).
export async function recalculerApresSeance(supabase: Client, logId: string, { force = false } = {}) {
  try {
    await recalculer(supabase, logId, force)
  } catch (erreur) {
    // Tâche de fond : un échec ne doit jamais remonter jusqu'à l'utilisateur.
    console.error("[recalcul]", erreur)
  }
}

async function recalculer(supabase: Client, logId: string, force: boolean) {
  const { data: log } = await supabase
    .from("workout_logs")
    .select("id, user_id, date, workout_id, duree_min, ressenti, note_coach, set_logs(exercise_id, serie_num, charge_kg, reps, duree_sec, rir, exercise:exercises(nom))")
    .eq("id", logId)
    .maybeSingle()
  if (!log || log.set_logs.length === 0) return

  if (!force) {
    const { data: deja } = await supabase.from("ajustements").select("id").eq("workout_log_id", logId).limit(1)
    if (deja && deja.length > 0) return
  }

  // Les lignes du programme concernées : celles de la séance faite, et celles qui portent un
  // exercice fait ce jour-là (une séance hors programme ajuste les séances qui le contiennent).
  const exercices = [...new Set(log.set_logs.map((s) => s.exercise_id))]
  const filtre = log.workout_id
    ? `workout_id.eq.${log.workout_id},exercise_id.in.(${exercices.join(",")})`
    : `exercise_id.in.(${exercices.join(",")})`
  const { data: brutes } = await supabase
    .from("workout_exercises")
    .select("id, workout_id, series, reps_min, reps_max, duree_sec, repos_sec, charge_depart_kg, increment_kg, exercise_id, archived, exercise:exercises(nom), workout:workouts(code, nom, archived)")
    .or(filtre)
    .eq("archived", false)
  const lignes = ((brutes ?? []) as unknown as (Ligne & { exercise_id: string })[]).filter((l) => !l.workout.archived)
  if (lignes.length === 0) return

  const [{ data: precedentes }, { data: douleurs }, { data: profil }] = await Promise.all([
    supabase
      .from("workout_logs")
      .select("date, ressenti, note_coach, set_logs(exercise_id, serie_num, charge_kg, reps, duree_sec, rir)")
      .lt("date", log.date)
      .order("date", { ascending: false })
      .limit(SEANCES_D_HISTORIQUE),
    supabase.from("foot_logs").select("date, douleur_matin").gte("date", decalerJours(log.date, -6)).lte("date", log.date),
    supabase.from("profiles").select("objectifs, niveau, contrainte_medicale, zone_blessure").maybeSingle(),
  ])
  const feu = feuTricolore(
    (douleurs ?? []).flatMap((d) => (d.douleur_matin === null ? [] : [{ date: d.date, douleur_matin: d.douleur_matin }])),
    log.date
  )
  const sansHausse = feu?.etat === "rouge"

  const donnees = {
    seance_faite: {
      date: log.date,
      duree_min: log.duree_min,
      ressenti_1_a_5: log.ressenti,
      notes_du_coach: log.note_coach,
      series: log.set_logs.map((s) => ({ exercice: s.exercise.nom, serie: s.serie_num, charge_kg: s.charge_kg, reps: s.reps, duree_sec: s.duree_sec, rir: s.rir })),
    },
    seances_precedentes: (precedentes ?? []).map((p) => ({
      date: p.date,
      ressenti_1_a_5: p.ressenti,
      notes_du_coach: p.note_coach,
      series: p.set_logs
        .filter((s) => exercices.includes(s.exercise_id))
        .map((s) => ({ exercice: lignes.find((l) => l.exercise_id === s.exercise_id)?.exercise.nom, charge_kg: s.charge_kg, reps: s.reps, duree_sec: s.duree_sec, rir: s.rir })),
    })),
    pied: feu ? { feu: feu.etat, moyenne_douleur_7_jours: Math.round(feu.moyenne * 10) / 10 } : null,
    hausses_interdites: sansHausse,
    profil,
    lignes_du_programme: lignes.map((l) => ({
      workout_exercise_id: l.id,
      seance: `${l.workout.code} · ${l.workout.nom}`,
      exercice: l.exercise.nom,
      series: l.series,
      reps_min: l.reps_min,
      reps_max: l.reps_max,
      duree_sec: l.duree_sec,
      repos_sec: l.repos_sec,
      charge_depart_kg: l.charge_depart_kg,
      increment_kg: l.increment_kg ?? PAS_DE_CHARGE_PAR_DEFAUT,
    })),
  }

  const reponse = await new Anthropic().beta.messages.parse({
    model: MODELE,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(Reponse) },
    // Requête refusée par un filtre de sécurité : l'API la rejoue sur le modèle de repli recommandé.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: CONSIGNE,
    messages: [{ role: "user", content: JSON.stringify(donnees) }],
  })
  const sortie = reponse.stop_reason === "refusal" ? null : reponse.parsed_output
  if (!sortie) return

  // Chaque proposition du modèle passe par les garde-fous ; une ligne inconnue est ignorée.
  const parId = new Map(lignes.map((l) => [l.id, l]))
  const touchees = sortie.ajustements.flatMap((a) => {
    const ligne = parId.get(a.workout_exercise_id)
    if (!ligne) return []
    const data: Partial<Record<Champ, number>> = {}
    const avant: Partial<Record<Champ, number | null>> = {}
    for (const champ of CHAMPS_AJUSTABLES) {
      const valeur = borner(ligne, champ, a[champ], sansHausse)
      if (valeur !== null) {
        data[champ] = valeur
        avant[champ] = ligne[champ]
      }
    }
    // Des répétitions mini au-dessus des maxi : la proposition est incohérente, on l'écarte.
    const min = data.reps_min ?? ligne.reps_min
    const max = data.reps_max ?? ligne.reps_max
    if (min !== null && max !== null && min > max) return []
    return Object.keys(data).length > 0 ? [{ ligne, data, avant }] : []
  })

  // Une nouvelle séance rend les propositions encore en attente pour les mêmes séances caduques.
  const seancesTouchees = [...new Set(lignes.map((l) => l.workout_id))]
  await supabase
    .from("ajustements")
    .update({ statut: "perimee" })
    .eq("statut", "en_attente")
    .in("workout_id", seancesTouchees)
  if (touchees.length === 0) return

  const parSeance = new Map<string, typeof touchees>()
  for (const t of touchees) parSeance.set(t.ligne.workout_id, [...(parSeance.get(t.ligne.workout_id) ?? []), t])

  await supabase.from("ajustements").insert(
    [...parSeance.entries()].map(([workoutId, liste]) => {
      const { code } = liste[0]!.ligne.workout
      return {
        user_id: log.user_id,
        workout_log_id: log.id,
        workout_id: workoutId,
        resume: `Séance ${code} : ${liste.length} exercice${liste.length > 1 ? "s" : ""} à ajuster`,
        explication: sortie.explication.trim().slice(0, 500),
        diff: liste.map(({ ligne, data }) => ({
          titre: ligne.exercise.nom,
          avant: decrire(ligne),
          apres: decrire({ ...ligne, ...data }),
        })) as unknown as Json,
        changements: liste.map(({ ligne, data, avant }) => ({
          table: "workout_exercises",
          operation: "update",
          id: ligne.id,
          data,
          avant,
        })) as unknown as Json,
      }
    })
  )
}
