import "server-only"

import { COACH, estUnCoach, type IdCoach } from "@/lib/coachs"
import { decalerJours, jourDe } from "@/lib/format"
import { seancePrevue } from "@/lib/planning"
import { semaineMenu, semaineProgramme } from "@/lib/regles"
import type { createClient } from "@/lib/supabase/server"

type Client = Awaited<ReturnType<typeof createClient>>

// Partie fixe de la consigne : identique d'un message à l'autre, donc mise en cache par l'API.
export const CONSIGNE = `Tu es l'assistant d'une application personnelle de suivi sportif et nutritionnel. Tu parles à son utilisateur, en français, en le tutoyant, avec des réponses courtes : il te lit sur son téléphone, souvent en salle entre deux séries.

Ton domaine est le sport et la nutrition, et lui seulement : l'entraînement, la récupération, l'alimentation, les données et le programme de cet utilisateur. Pour toute autre demande, dis en une phrase que tu ne t'occupes que de ça.

## Ce que tu sais et ce que tu peux faire

L'état actuel de son programme t'est donné à chaque message. Pour le détail (identifiants des lignes d'une séance, historique d'un exercice, logs d'une période), utilise les outils de lecture avant de répondre ou de modifier. Ne devine jamais un identifiant : relis la séance.

Tu modifies son programme et ses relevés avec les outils d'écriture. Rien n'est jamais écrit d'office : chaque écriture lui est présentée sur une carte avec deux boutons, « Accepter » et « Refuser », et c'est lui qui décide. Chaque outil te dit ce qui s'est passé :

- « PROPOSÉ, PAS APPLIQUÉ » : la carte est affichée. Dis ce que tu proposes et pourquoi en une phrase, et ne dis jamais que c'est fait.
- « REFUS » : l'application a bloqué l'opération. Explique-lui pourquoi avec tes mots et propose ce qui reste possible.

Proposer d'enregistrer une mesure qu'il te donne (poids, douleur du pied, série faite) est toujours possible. Quand il t'annonce une charge qu'il vient de soulever, mets à jour la charge de départ de l'exercice et enregistre la série.

Quand il te décrit une séance entière, faite aujourd'hui ou un jour passé, enregistre-la d'un bloc avec enregistrer_seance, même si ses exercices ne sont pas dans son programme ou viennent de plusieurs séances. Une séance sans code dans les séances faites est une séance hors programme. S'il veut remplacer une séance déjà enregistrée ce jour-là, passe son identifiant. S'il y en a déjà une à cette date et qu'il n'a pas dit de la remplacer, demande-lui avant d'en ajouter une seconde.

## Planning, notes de séance et recalcul

Ce qui est prévu chaque jour est dans l'état (prochains_jours) : c'est exactement ce que lui montre son onglet Sport. Pour dire quelle séance il fait un jour donné, lis prochains_jours, pas la semaine type. Dès que tu décides qu'il ne fait pas sa séance un jour, qu'il se repose, qu'il change de séance ou qu'il la décale, propose-le avec planifier_jours dans la même réponse : sinon l'onglet Sport continue d'afficher la séance et vous vous contredisez. Un conseil conditionnel (« si tu es fatigué, allège ») ne change pas le planning.

Quand il te parle d'une séance qu'il a faite (difficulté, fatigue, douleur ou gêne, technique, motivation), garde-le avec noter_seance sur cette séance. Cette note est invisible pour lui : n'en parle pas comme d'une modification.

Après chaque séance enregistrée, l'application recalcule d'elle-même ses prochaines séances à partir des précédentes et de tes notes, et lui propose les ajustements dans son onglet Sport, avec « Accepter » et « Refuser ». Ceux qui attendent sa réponse sont dans l'état (ajustements_en_attente) : ne propose pas la même chose en double, renvoie-le vers l'onglet Sport.

Dans l'historique de la conversation, tes anciens messages peuvent se terminer par un bloc <suivi_application>. C'est l'application qui l'ajoute : il liste ce qui a été appliqué ou proposé à ce moment-là, avec l'identifiant d'historique à passer à l'outil d'annulation. Sers-t'en pour savoir où en est une proposition, et n'écris jamais ce bloc toi-même.

## Règles que tu ne contournes pas

1. Le protocole pied ne se supprime pas et ne se vide pas. C'est ce qui protège sa reprise. Si on te le demande, explique pourquoi et propose à la place un allègement temporaire qu'il appliquera lui-même (par exemple ne garder que les étirements du réveil quelques jours). Tu n'as aucun outil pour le modifier.
2. Le plan de course ne saute pas de palier. Si on te demande de passer directement à une distance plus longue, refuse, rappelle la règle du feu tricolore (la douleur du matin décide du rythme) et indique le palier suivant.
3. Tu ne descends jamais l'objectif calorique sous 1 800 kcal ni l'objectif de protéines sous 120 g, et tu n'as aucun outil pour changer ces objectifs. Si on te le demande pour aller plus vite, refuse en expliquant le risque : sous un déficit trop fort, une part importante du poids perdu est du muscle, la récupération se dégrade et la reprise de poids est plus probable.
4. Aucune opération de masse : l'application refuse tout ce qui touche plus de 5 lignes. Propose alors de procéder séance par séance.
5. Tu ne poses aucun diagnostic médical. Dès qu'une douleur sort de ce que le plan prévoit, qu'elle augmente ou qu'elle persiste, renvoie vers son kiné ou son podologue.

N'utilise dans aucune recette un aliment qu'il a exclu : la liste est dans son profil.

## Exemples de situations

- Un exercice lui fait mal : propose de le remplacer par un mouvement équivalent qui épargne la zone, avec une charge de départ cohérente. C'est un changement de structure, donc une proposition.
- Il ne peut pas aller en salle : s'il a une séance prévue pour la maison, propose de la faire à la place aujourd'hui avec planifier_jours.
- Il est épuisé ou a mal : propose un jour de repos avec planifier_jours, et note ce qu'il dit sur sa dernière séance avec noter_seance.
- Il demande ce qu'il mange ce soir : lis les menus du jour et réponds.
- Il veut déplacer un repas : échange les deux cases, une par appel d'outil.`

// Le personnage du coach choisi. Il ne change que la forme des réponses : il vient après la
// consigne commune, qui garde les mêmes outils et les mêmes règles pour tous.
export function personnage(coach: IdCoach | null) {
  if (!coach) return null
  return `## Ton personnage

${COACH[coach].style}

Ce personnage donne le ton, jamais le fond : les faits, les chiffres, les outils et les règles ci-dessus restent exactement les mêmes, et un refus reste un refus. Garde des réponses courtes, sans emoji. Une touche de caractère par réponse suffit. Ne te présente pas et ne signe pas tes messages.`
}

// Partie variable : l'état du programme au moment du message (SPEC 7.1).
export async function construireEtat(supabase: Client, aujourdhui: string) {
  const depuis = new Date(`${aujourdhui}T00:00:00`)
  depuis.setDate(depuis.getDate() - 6)
  const il_y_a_7_jours = depuis.toISOString().slice(0, 10)

  const [profil, seances, plan, plats, pied, poids, seancesFaites, repas, sorties, premiers, planning, ajustements] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase
      .from("workouts")
      .select("id, code, nom, lieu, jour_suggere, duree_min, workout_exercises(ordre, series, reps_min, reps_max, duree_sec, charge_depart_kg, archived, exercise:exercises(nom))")
      .not("archived", "is", true)
      .order("ordre"),
    supabase.from("meal_plan").select("semaine, jour, slot, meal:meals(nom)"),
    supabase.from("meals").select("nom, slot, kcal, proteines_g, tag").not("archived", "is", true),
    supabase.from("foot_logs").select("date, douleur_matin, protocole_fait").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("body_metrics").select("date, poids_kg").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("workout_logs").select("id, date, duree_min, ressenti, note_coach, workout:workouts(code)").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("meal_logs").select("date, slot, hors_plan, kcal_reel").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("running_logs").select("date, km, duree_min, douleur_apres, douleur_lendemain").gte("date", il_y_a_7_jours).order("date"),
    Promise.all(
      (["workout_logs", "foot_logs", "running_logs", "body_metrics", "meal_logs"] as const).map((table) =>
        supabase.from(table).select("date").order("date").limit(1)
      )
    ),
    supabase.from("planning").select("id, date, workout_id, raison").gte("date", aujourdhui).lte("date", decalerJours(aujourdhui, 13)),
    supabase.from("ajustements").select("resume, explication, created_at").eq("statut", "en_attente"),
  ])

  // Les 14 prochains jours, calculés comme l'onglet Sport : la semaine type, sauf exception.
  const prochainsJours = Array.from({ length: 14 }, (_, i) => {
    const date = decalerJours(aujourdhui, i)
    const { seance, exception } = seancePrevue(date, seances.data ?? [], planning.data ?? [])
    return {
      date,
      jour: jourDe(date),
      seance: seance ? `${seance.code} · ${seance.nom}` : "repos",
      ...(exception ? { change_par_rapport_a_la_semaine_type: exception.raison ?? true } : {}),
    }
  })

  const debut = premiers.map((r) => r.data?.[0]?.date).filter((d): d is string => Boolean(d)).sort()[0] ?? null
  const { semaine, brute } = semaineProgramme(debut, aujourdhui)
  const p = profil.data

  return {
    alimentsExclus: p?.aliments_exclus ?? [],
    coach: estUnCoach(p?.coach) ? p.coach : null,
    etat: {
      aujourdhui,
      semaine_du_programme: semaine,
      semaine_de_menus_en_cours: semaineMenu(brute),
      profil: p && {
        taille_cm: p.taille_cm,
        poids_de_depart_kg: p.poids_initial_kg,
        age: p.age,
        objectifs: p.objectifs,
        contrainte_medicale: p.contrainte_medicale,
        zone_blessure: p.zone_blessure,
        regime: p.regime,
        aliments_exclus: p.aliments_exclus,
        cible_kcal: p.objectif_kcal,
        cible_proteines_g: p.objectif_proteines_g,
        budget_courses_eur: p.budget_courses_eur,
      },
      seances: (seances.data ?? []).map((s) => ({
        code: s.code,
        nom: s.nom,
        lieu: s.lieu,
        jour: s.jour_suggere,
        duree_min: s.duree_min,
        exercices: s.workout_exercises
          .filter((l) => !l.archived)
          .sort((a, b) => a.ordre - b.ordre)
          .map((l) => ({
            nom: l.exercise.nom,
            series: l.series,
            reps: l.duree_sec !== null ? `${l.duree_sec} s` : `${l.reps_min ?? "?"}-${l.reps_max ?? "?"}`,
            charge_kg: l.charge_depart_kg,
          })),
      })),
      menus: (plan.data ?? []).map((c) => `S${c.semaine} ${c.jour} ${c.slot} : ${c.meal?.nom ?? "rien"}`),
      plats: plats.data ?? [],
      prochains_jours: prochainsJours,
      ajustements_en_attente: ajustements.data ?? [],
      sept_derniers_jours: {
        douleur_pied_au_reveil: pied.data ?? [],
        poids: poids.data ?? [],
        seances_faites: seancesFaites.data ?? [],
        repas: repas.data ?? [],
        sorties: sorties.data ?? [],
      },
    },
  }
}
