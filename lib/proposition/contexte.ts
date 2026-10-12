import "server-only"

import { validerReponses, type ReponsesAccueil } from "@/lib/accueil"
import type { Cibles } from "@/lib/cibles"
import type { ProfilPourProposition } from "@/lib/proposition/garde-fous"
import type { createClient } from "@/lib/supabase/server"

type Client = Awaited<ReturnType<typeof createClient>>

export type ContexteProposition = {
  reponses: ReponsesAccueil
  cibles: Cibles
  garde: ProfilPourProposition
}

// Relit en base les réponses au questionnaire du compte connecté. Elles ne viennent jamais du
// navigateur : une proposition se fabrique et se vérifie toujours contre le profil enregistré.
// null si le compte n'est pas connecté ou n'a pas fini le questionnaire.
export async function lireContexte(supabase: Client): Promise<ContexteProposition | null> {
  const { data: profil } = await supabase.from("profiles").select("*").maybeSingle()
  if (!profil || profil.accueil_fait_le === null) return null

  const reponses = validerReponses({
    poidsKg: profil.poids_initial_kg,
    tailleCm: profil.taille_cm,
    age: profil.age,
    sexe: profil.sexe,
    objectifs: profil.objectifs,
    zoneBlessure: profil.zone_blessure,
    lieux: profil.lieux_entrainement,
    seancesParSemaine: profil.seances_par_semaine,
    niveau: profil.niveau,
    regime: profil.regime,
    alimentsExclus: profil.aliments_exclus,
  })
  const ciblesCompletes =
    profil.objectif_kcal !== null &&
    profil.objectif_proteines_g !== null &&
    profil.objectif_lipides_g !== null &&
    profil.objectif_glucides_g !== null
  if (!reponses || !ciblesCompletes) return null

  return {
    reponses,
    cibles: {
      kcal: profil.objectif_kcal!,
      proteinesG: profil.objectif_proteines_g!,
      lipidesG: profil.objectif_lipides_g!,
      glucidesG: profil.objectif_glucides_g!,
    },
    garde: {
      lieux: reponses.lieux,
      seancesParSemaine: reponses.seancesParSemaine,
      regime: reponses.regime,
      alimentsExclus: reponses.alimentsExclus,
    },
  }
}
