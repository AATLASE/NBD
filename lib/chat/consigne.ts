import "server-only"

import { semaineMenu, semaineProgramme } from "@/lib/regles"
import type { createClient } from "@/lib/supabase/server"

type Client = Awaited<ReturnType<typeof createClient>>

// Partie fixe de la consigne : identique d'un message à l'autre, donc mise en cache par l'API.
export const CONSIGNE = `Tu es l'assistant d'une application personnelle de suivi sportif et nutritionnel. Tu parles à son utilisateur, en français, en le tutoyant, avec des réponses courtes : il te lit sur son téléphone, souvent en salle entre deux séries.

Ton domaine est le sport et la nutrition, et lui seulement : l'entraînement, la récupération, l'alimentation, les données et le programme de cet utilisateur. Pour toute autre demande, dis en une phrase que tu ne t'occupes que de ça.

## Ce que tu sais et ce que tu peux faire

L'état actuel de son programme t'est donné à chaque message. Pour le détail (identifiants des lignes d'une séance, historique d'un exercice, logs d'une période), utilise les outils de lecture avant de répondre ou de modifier. Ne devine jamais un identifiant : relis la séance.

Tu modifies son programme avec les outils d'écriture. C'est l'application, pas toi, qui décide de ce qui arrive ensuite, et chaque outil te le dit dans sa réponse :

- « APPLIQUÉ » : c'est écrit, et il voit un bouton pour annuler. Confirme en une phrase ce qui a changé.
- « PROPOSÉ, PAS APPLIQUÉ » : une carte avant/après lui est affichée et il doit appuyer sur « Appliquer ». Dis que tu proposes, explique ton choix en une phrase, et ne dis jamais que c'est fait.
- « REFUS » : l'application a bloqué l'opération. Explique-lui pourquoi avec tes mots et propose ce qui reste possible.

Enregistrer une mesure qu'il te donne (poids, douleur du pied, série faite) est toujours possible. Quand il t'annonce une charge qu'il vient de soulever, mets à jour la charge de départ de l'exercice et enregistre la série.

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
- Il ne peut pas aller en salle : s'il a une séance prévue pour la maison, propose-la. Ne modifie rien.
- Il demande ce qu'il mange ce soir : lis les menus du jour et réponds.
- Il veut déplacer un repas : échange les deux cases, une par appel d'outil.`

// Partie variable : l'état du programme au moment du message (SPEC 7.1).
export async function construireEtat(supabase: Client, aujourdhui: string) {
  const depuis = new Date(`${aujourdhui}T00:00:00`)
  depuis.setDate(depuis.getDate() - 6)
  const il_y_a_7_jours = depuis.toISOString().slice(0, 10)

  const [profil, seances, plan, plats, pied, poids, seancesFaites, repas, sorties, premiers] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase
      .from("workouts")
      .select("code, nom, lieu, jour_suggere, duree_min, workout_exercises(ordre, series, reps_min, reps_max, duree_sec, charge_depart_kg, archived, exercise:exercises(nom))")
      .not("archived", "is", true)
      .order("ordre"),
    supabase.from("meal_plan").select("semaine, jour, slot, meal:meals(nom)"),
    supabase.from("meals").select("nom, slot, kcal, proteines_g, tag").not("archived", "is", true),
    supabase.from("foot_logs").select("date, douleur_matin, protocole_fait").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("body_metrics").select("date, poids_kg").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("workout_logs").select("date, duree_min, ressenti, workout:workouts(code)").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("meal_logs").select("date, slot, hors_plan, kcal_reel").gte("date", il_y_a_7_jours).order("date"),
    supabase.from("running_logs").select("date, km, duree_min, douleur_apres, douleur_lendemain").gte("date", il_y_a_7_jours).order("date"),
    Promise.all(
      (["workout_logs", "foot_logs", "running_logs", "body_metrics", "meal_logs"] as const).map((table) =>
        supabase.from(table).select("date").order("date").limit(1)
      )
    ),
  ])

  const debut = premiers.map((r) => r.data?.[0]?.date).filter((d): d is string => Boolean(d)).sort()[0] ?? null
  const { semaine, brute } = semaineProgramme(debut, aujourdhui)
  const p = profil.data

  return {
    alimentsExclus: p?.aliments_exclus ?? [],
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
