// Libellés d'affichage des codes stockés en base. Aucun contenu de programme ici :
// uniquement la traduction des valeurs fermées du schéma.

export const JOURS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const
export type Jour = (typeof JOURS)[number]

export const SLOTS = ["petit_dej", "collation_matin", "dejeuner", "collation_aprem", "diner"] as const
export type Slot = (typeof SLOTS)[number]

export const LIBELLE_SLOT: Record<string, string> = {
  petit_dej: "Petit déjeuner",
  collation_matin: "Collation matin",
  dejeuner: "Déjeuner",
  collation_aprem: "Collation avant séance",
  diner: "Dîner",
}

export const MOMENTS = ["reveil", "journee", "quotidien", "jour_sur_deux", "soir"] as const

export const LIBELLE_MOMENT: Record<string, string> = {
  reveil: "Au réveil",
  journee: "Dans la journée",
  quotidien: "Tous les jours",
  jour_sur_deux: "Un jour sur deux",
  soir: "Le soir",
}

export const GROUPES = [
  "jambes",
  "dos",
  "pectoraux",
  "epaules",
  "bras",
  "gainage",
  "agilite",
  "pied",
  "cardio",
] as const

export const LIBELLE_GROUPE: Record<string, string> = {
  jambes: "Jambes",
  dos: "Dos",
  pectoraux: "Pectoraux",
  epaules: "Épaules",
  bras: "Bras",
  gainage: "Gainage",
  agilite: "Agilité",
  pied: "Pied",
  cardio: "Cardio",
}

export const EQUIPEMENTS = [
  "barre",
  "halteres",
  "poulie",
  "machine",
  "poids_du_corps",
  "kettlebell",
  "aucun",
] as const

export const LIBELLE_EQUIPEMENT: Record<string, string> = {
  barre: "Barre",
  halteres: "Haltères",
  poulie: "Poulie",
  machine: "Machine",
  poids_du_corps: "Poids du corps",
  kettlebell: "Kettlebell",
  aucun: "Aucun",
}

// Objectifs proposés au questionnaire d'accueil. La base refuse toute autre valeur.
export const OBJECTIFS = ["perte_de_poids", "gain_de_force", "remise_en_forme", "blessure"] as const
export type Objectif = (typeof OBJECTIFS)[number]
export const OBJECTIFS_MAX = 3

export const LIBELLE_OBJECTIF: Record<Objectif, string> = {
  perte_de_poids: "Perte de poids",
  gain_de_force: "Gain de force",
  remise_en_forme: "Remise en forme",
  blessure: "Blessure",
}

export const DESCRIPTION_OBJECTIF: Record<Objectif, string> = {
  perte_de_poids: "Perdre de la graisse en gardant le muscle",
  gain_de_force: "Soulever plus lourd, séance après séance",
  remise_en_forme: "Reprendre une activité régulière",
  blessure: "Reprendre après une blessure, sans la réveiller",
}

// Le reste du questionnaire d'accueil. Mêmes listes fermées que dans la base.
export const SEXES = ["femme", "homme", "non_precise"] as const
export type SexeDeclare = (typeof SEXES)[number]
export const LIBELLE_SEXE: Record<SexeDeclare, string> = {
  femme: "Femme",
  homme: "Homme",
  non_precise: "Je préfère ne pas répondre",
}

export const LIEUX_ENTRAINEMENT = ["salle", "street_workout", "maison"] as const
export type LieuEntrainement = (typeof LIEUX_ENTRAINEMENT)[number]
export const LIBELLE_LIEU_ENTRAINEMENT: Record<LieuEntrainement, string> = {
  salle: "Salle de sport",
  street_workout: "Parc de street workout",
  maison: "À la maison",
}
export const DESCRIPTION_LIEU_ENTRAINEMENT: Record<LieuEntrainement, string> = {
  salle: "Barres, poulies et machines",
  street_workout: "Barres de traction et barres parallèles",
  maison: "Poids du corps, sans matériel",
}

export const NIVEAUX = ["debutant", "intermediaire", "confirme"] as const
export type Niveau = (typeof NIVEAUX)[number]
export const LIBELLE_NIVEAU: Record<Niveau, string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
  confirme: "Confirmé",
}

export const REGIMES = ["omnivore", "pescetarien", "vegetarien", "vegan"] as const
export type Regime = (typeof REGIMES)[number]
export const LIBELLE_REGIME: Record<Regime, string> = {
  omnivore: "Omnivore",
  pescetarien: "Pescétarien",
  vegetarien: "Végétarien",
  vegan: "Vegan",
}
export const DESCRIPTION_REGIME: Record<Regime, string> = {
  omnivore: "Je mange de tout",
  pescetarien: "Pas de viande, mais du poisson",
  vegetarien: "Ni viande ni poisson",
  vegan: "Aucun produit animal",
}

export const LIEUX = ["salle", "maison", "exterieur"] as const

export const LIBELLE_LIEU: Record<string, string> = {
  salle: "Salle",
  maison: "Maison",
  exterieur: "Extérieur",
}

export const LIBELLE_TAG: Record<string, string> = {
  standard: "Standard",
  batch: "Batch",
  plaisir: "Plaisir",
  secours: "Secours",
}

export const CATEGORIES = [
  "proteines",
  "laitages",
  "feculents",
  "legumes",
  "fruits",
  "epicerie",
] as const

export const LIBELLE_CATEGORIE: Record<string, string> = {
  proteines: "Protéines",
  laitages: "Laitages",
  feculents: "Féculents",
  legumes: "Légumes",
  fruits: "Fruits",
  epicerie: "Épicerie",
}

export function majuscule(texte: string) {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}
