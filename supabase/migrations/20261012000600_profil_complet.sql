-- Questionnaire d'accueil complet, et profils qui n'héritent plus des chiffres du propriétaire.

-- Les valeurs par défaut de la spec (173 cm, 92 kg, 2 000 kcal, 170 g...) sont celles d'une seule
-- personne. Un nouveau compte n'a ni poids ni cibles tant qu'il n'a pas répondu au questionnaire :
-- ces colonnes deviennent vides par défaut. Le profil du propriétaire, déjà rempli, ne change pas.
alter table profiles
  alter column taille_cm drop default, alter column taille_cm drop not null,
  alter column poids_initial_kg drop default, alter column poids_initial_kg drop not null,
  alter column objectif_kcal drop default, alter column objectif_kcal drop not null,
  alter column objectif_proteines_g drop default, alter column objectif_proteines_g drop not null,
  alter column objectif_lipides_g drop default, alter column objectif_lipides_g drop not null,
  alter column objectif_glucides_g drop default, alter column objectif_glucides_g drop not null,
  alter column budget_courses_eur drop default;

-- Réponses qui servent à proposer un programme de sport et un plan nutritif.
alter table profiles
  add column sexe text check (sexe in ('homme', 'femme', 'non_precise')),
  add column regime text check (regime in ('omnivore', 'pescetarien', 'vegetarien', 'vegan')),
  add column lieux_entrainement text[] not null default '{}'
    check (lieux_entrainement <@ array['salle', 'street_workout', 'maison']),
  add column seances_par_semaine int check (seances_par_semaine between 1 and 7),
  add column niveau text check (niveau in ('debutant', 'intermediaire', 'confirme')),
  add column zone_blessure text;
