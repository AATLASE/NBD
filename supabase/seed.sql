-- Seed du programme (SPEC section 8).
--
-- Toutes les tables portent un user_id : le contenu ne peut être inséré qu'une fois le compte créé.
-- Ce fichier installe donc une fonction de seed et un trigger qui l'exécute à la création du compte
-- (première demande de lien magique), puis rattrape un compte qui existerait déjà.
-- Rejouable sans risque : un compte déjà alimenté n'est jamais réécrit.
--
-- Deux cas, décidés le 2026-10-12 :
--   le propriétaire  = le compte dont l'adresse est inscrite dans la table private.proprietaire.
--                      Il reçoit tout le programme de la spec : exercices, séances, protocole pied,
--                      plan de course, plats, menus, courses.
--   les autres       partent de zéro : rien d'autre qu'un profil à remplir par le questionnaire
--                      d'accueil, et la grille vide des menus.
--
-- Aucune donnée personnelle ici : l'adresse du propriétaire, sa taille, son poids, son âge et sa
-- contrainte médicale viennent de `supabase/proprietaire.sql`, qui n'est pas versionné et passe
-- avant ce fichier (modèle : `supabase/proprietaire.exemple.sql`). Sans lui, pas de propriétaire.
--
-- Local    : appliqué par `supabase db reset`
-- Hébergé  : `supabase db push --include-seed`

create schema if not exists private;

create or replace function private.seed_user_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $seed$
declare
  v_identite private.proprietaire%rowtype;
  v_proprietaire boolean;
  v_attendu int;
  v_insere int;
  v_montees uuid;

  v_sauce text := $md$**Sauce asiatique de base** : 6 c. à soupe de sauce soja, 2 de vinaigre de riz, 1 de miel, 1 d'huile de sésame, 3 gousses d'ail râpées, un pouce de gingembre râpé.$md$;

  v_poke text := $md$**Poké bowl, 620 kcal**

- 60 g de riz cru assaisonné d'une cuillère à soupe de vinaigre de riz
- 130 g de thon ou saumon
- Concombre, carotte râpée
- 60 g d'édamame
- Oignon rouge, un quart d'avocat
- 2 cuillères à soupe de sauce asiatique
- Graines de sésame$md$;

  v_pizza text := $md$**Pizza maison, 700 kcal la pizza entière**

Pâte pour 2 : 250 g de farine, 160 ml d'eau tiède, 4 g de levure sèche, 5 g de sel, 1 c. à soupe d'huile d'olive. Lever 1 h ou une nuit au frigo.

Garniture : sauce tomate, 80 g de mozzarella râpée et pas plus, poulet ou jambon, champignons, roquette après cuisson.

Four 250 °C, plaque préchauffée, 8 à 10 min.$md$;

  v_poulet text := $md$**Poulet riz croustillant, 640 kcal**

150 g de filet en lamelles, trempées dans 1 blanc d'œuf puis roulées dans 2 c. à soupe de maïzena. Four 220 °C, 20 min sur grille.

Réduire 3 c. à soupe de sauce asiatique à la poêle, y jeter le poulet chaud 30 s.

70 g de riz cru, brocoli.$md$;

  v_ramen text := $md$**Ramen maison, 600 kcal**

500 ml de bouillon de volaille, 1 c. à soupe de miso, 1 c. à café de sauce soja, ail et gingembre râpés, 1 c. à café d'huile de sésame.

60 g de nouilles, 120 g de poulet effiloché, 1 œuf mollet 6 min 30, épinards ou pak choï, ciboule, maïs.$md$;

  -- Quantités pour une portion. La pâte à pizza de la recette est donnée pour 2 : moitié ici.
  v_ing_poke jsonb := $json$[
    {"nom": "riz", "quantite": 60, "unite": "g"},
    {"nom": "vinaigre de riz", "quantite": 1, "unite": "c. à soupe"},
    {"nom": "thon ou saumon", "quantite": 130, "unite": "g"},
    {"nom": "concombre", "quantite": null, "unite": null},
    {"nom": "carotte râpée", "quantite": null, "unite": null},
    {"nom": "édamame", "quantite": 60, "unite": "g"},
    {"nom": "oignon rouge", "quantite": null, "unite": null},
    {"nom": "avocat", "quantite": 0.25, "unite": "pièce"},
    {"nom": "sauce asiatique", "quantite": 2, "unite": "c. à soupe"},
    {"nom": "graines de sésame", "quantite": null, "unite": null}
  ]$json$;

  v_ing_pizza jsonb := $json$[
    {"nom": "farine", "quantite": 125, "unite": "g"},
    {"nom": "levure sèche", "quantite": 2, "unite": "g"},
    {"nom": "sel", "quantite": 2.5, "unite": "g"},
    {"nom": "huile d'olive", "quantite": 0.5, "unite": "c. à soupe"},
    {"nom": "sauce tomate", "quantite": null, "unite": null},
    {"nom": "mozzarella râpée", "quantite": 80, "unite": "g"},
    {"nom": "poulet ou jambon", "quantite": null, "unite": null},
    {"nom": "champignons", "quantite": null, "unite": null},
    {"nom": "roquette", "quantite": null, "unite": null}
  ]$json$;

  v_ing_poulet jsonb := $json$[
    {"nom": "filet de poulet", "quantite": 150, "unite": "g"},
    {"nom": "blanc d'œuf", "quantite": 1, "unite": "pièce"},
    {"nom": "maïzena", "quantite": 2, "unite": "c. à soupe"},
    {"nom": "sauce asiatique", "quantite": 3, "unite": "c. à soupe"},
    {"nom": "riz", "quantite": 70, "unite": "g"},
    {"nom": "brocoli", "quantite": null, "unite": null}
  ]$json$;

  v_ing_ramen jsonb := $json$[
    {"nom": "bouillon de volaille", "quantite": 500, "unite": "ml"},
    {"nom": "miso", "quantite": 1, "unite": "c. à soupe"},
    {"nom": "sauce soja", "quantite": 1, "unite": "c. à café"},
    {"nom": "ail", "quantite": null, "unite": null},
    {"nom": "gingembre", "quantite": null, "unite": null},
    {"nom": "huile de sésame", "quantite": 1, "unite": "c. à café"},
    {"nom": "nouilles", "quantite": 60, "unite": "g"},
    {"nom": "poulet effiloché", "quantite": 120, "unite": "g"},
    {"nom": "œuf", "quantite": 1, "unite": "pièce"},
    {"nom": "épinards ou pak choï", "quantite": null, "unite": null},
    {"nom": "ciboule", "quantite": null, "unite": null},
    {"nom": "maïs", "quantite": null, "unite": null}
  ]$json$;
begin
  select p.* into v_identite
  from private.proprietaire p
  join auth.users u on lower(u.email) = lower(p.email)
  where u.id = p_user;
  v_proprietaire := found;

  -- Profil. Celui du propriétaire est celui de la spec (section 1), questionnaire d'accueil déjà
  -- considéré comme fait. Celui d'un autre compte est vide : il le remplit au questionnaire.
  -- C'est aussi le garde-fou : si le profil existe déjà, le compte a déjà été alimenté.
  if v_proprietaire then
    insert into profiles
      (id, taille_cm, poids_initial_kg, age, contrainte_medicale,
       objectif_kcal, objectif_proteines_g, objectif_lipides_g, objectif_glucides_g,
       budget_courses_eur, aliments_exclus, accueil_fait_le)
    values
      (p_user, v_identite.taille_cm, v_identite.poids_initial_kg, v_identite.age, v_identite.contrainte_medicale,
       2000, 170, 65, 180,
       35, array['truffe', 'choux de Bruxelles'], now())
    on conflict (id) do nothing;
  else
    insert into profiles (id) values (p_user) on conflict (id) do nothing;
  end if;
  if not found then
    return;
  end if;

  -- Tout autre compte part de zéro : seulement la grille vide des menus,
  -- 2 semaines x 7 jours x 5 repas, à remplir avec ses propres plats.
  if not v_proprietaire then
    insert into meal_plan (user_id, semaine, jour, slot)
    select p_user, s.semaine, j.jour, r.slot
    from (values (1), (2)) as s(semaine)
    cross join (values ('lundi'), ('mardi'), ('mercredi'), ('jeudi'), ('vendredi'), ('samedi'), ('dimanche')) as j(jour)
    cross join (values ('petit_dej'), ('collation_matin'), ('dejeuner'), ('collation_aprem'), ('diner')) as r(slot);
    return;
  end if;

  -- À partir d'ici : le programme du propriétaire.

  -- Demandes IA illimitées pour lui (limite vide). Les autres ont le quota par défaut.
  insert into quotas_ia (user_id, demandes_par_mois) values (p_user, null)
  on conflict (user_id) do nothing;

  -- 8.1 à 8.5 : exercices ------------------------------------------------
  insert into exercises (user_id, nom, groupe, equipement)
  select p_user, v.nom, v.groupe, v.equipement
  from (values
    ('Squat barre',                        'jambes',    'barre'),
    ('Soulevé de terre roumain',           'jambes',    'barre'),
    ('Presse à cuisses',                   'jambes',    'machine'),
    ('Tirage vertical poitrine',           'dos',       'poulie'),
    ('Rowing haltère un bras',             'dos',       'halteres'),
    ('Gainage planche',                    'gainage',   'poids_du_corps'),
    ('Tractions',                          'dos',       'poids_du_corps'),
    ('Développé incliné haltères',         'pectoraux', 'halteres'),
    ('Rowing barre',                       'dos',       'barre'),
    ('Élévations latérales',               'epaules',   'halteres'),
    ('Curl barre EZ',                      'bras',      'barre'),
    ('Extension triceps poulie',           'bras',      'poulie'),
    ('Planche latérale',                   'gainage',   'poids_du_corps'),
    ('Dead bug',                           'gainage',   'poids_du_corps'),
    ('Développé couché barre',             'pectoraux', 'barre'),
    ('Split squat bulgare',                'jambes',    'halteres'),
    ('Hip thrust',                         'jambes',    'barre'),
    ('Développé militaire',                'epaules',   'barre'),
    ('Face pull poulie',                   'epaules',   'poulie'),
    ('Marche du fermier',                  'gainage',   'halteres'),
    ('Kettlebell swing',                   'jambes',    'kettlebell'),
    ('Rameur',                             'cardio',    'machine'),
    ('Tirage poulie basse',                'dos',       'poulie'),
    ('Développé haltères debout',          'epaules',   'halteres'),
    ('Step-up sur banc contrôlé',          'jambes',    'poids_du_corps'),
    ('Pas chassés latéraux',               'agilite',   'aucun'),
    ('Carioca',                            'agilite',   'aucun'),
    ('Changements de direction sur plots', 'agilite',   'aucun'),
    ('Appuis sur échelle d''agilité',      'agilite',   'aucun'),
    ('Pompes pieds surélevés',             'pectoraux', 'poids_du_corps'),
    ('Rowing inversé',                     'dos',       'poids_du_corps'),
    ('Leg curl glissé sur serviette',      'jambes',    'poids_du_corps')
  ) as v(nom, groupe, equipement);

  -- 8.1 à 8.5 : séances --------------------------------------------------
  -- La durée de la séance maison n'est pas donnée par la spec : 40 min, estimation à ajuster.
  insert into workouts (user_id, code, nom, lieu, duree_min, jour_suggere, ordre, note, circuit_repos_tours_sec)
  values
    (p_user, 'A', 'Bas du corps et tirage', 'salle', 55, 'lundi', 1,
      'Pas de mollets, ils sont déjà chargés par le protocole pied.', null),
    (p_user, 'B', 'Haut du corps complet', 'salle', 50, 'mercredi', 2, null, null),
    (p_user, 'C', 'Poussée et unilatéral', 'salle', 55, 'vendredi', 3, null, null),
    (p_user, 'D', 'Circuit et agilité', 'salle', 45, 'samedi', 4,
      'Circuit de 6 exercices en salle : 40 secondes de travail et 20 de repos, 4 tours, 2 min entre les tours. Puis 10 min d''agilité dehors, au sol et sans saut.', 120),
    (p_user, 'MAISON', 'Séance maison de secours', 'maison', 40, null, 5, null, null);

  -- 8.1 à 8.5 : contenu des séances ---------------------------------------
  -- Bloc circuit : series = nombre de tours, duree_sec = travail, repos_sec = repos.
  -- Charges « 2 x 24 kg » : la valeur stockée est celle d'un haltère, précisée en note.
  -- Tractions : 0 kg = poids du corps, la cible est le lest ajouté.
  -- Repos non précisé par la spec (séance maison) : valeur par défaut du schéma, 90 s.
  -- Agilité : 15 s, pour tenir les 10 min annoncées.
  with v(code, ordre, exercice, bloc, series, reps_min, reps_max, duree_sec, repos_sec, depart, cible, increment, note) as (
    values
      ('A', 1, 'Squat barre',               'series', 4, 6::int, 8::int, null::int, 120::int, 80::numeric, 115::numeric, 5::numeric, null::text),
      ('A', 2, 'Soulevé de terre roumain',  'series', 3, 8,  10, null, 120, 80,  120, 5,   null),
      ('A', 3, 'Presse à cuisses',          'series', 3, 10, 12, null, 90,  160, 280, 10,  null),
      ('A', 4, 'Tirage vertical poitrine',  'series', 4, 8,  10, null, 90,  60,  90,  2.5, null),
      ('A', 5, 'Rowing haltère un bras',    'series', 3, 10, 10, null, 60,  28,  42,  2,   null),
      ('A', 6, 'Gainage planche',           'series', 3, null, null, 40, 45, null, null, null, null),

      ('B', 1, 'Tractions',                  'series', 4, 6,  8,  null, 120, 0,  12, 2,   'Poids du corps au départ, puis lest ajouté.'),
      ('B', 2, 'Développé incliné haltères', 'series', 4, 8,  10, null, 90,  24, 32, 2,   'Charge par haltère.'),
      ('B', 3, 'Rowing barre',               'series', 4, 8,  10, null, 90,  60, 85, 2.5, null),
      ('B', 4, 'Élévations latérales',       'series', 3, 15, 15, null, 45,  8,  12, 1,   'Charge par haltère.'),
      ('B', 5, 'Curl barre EZ',              'series', 3, 10, 10, null, 60,  25, 35, 2.5, null),
      ('B', 6, 'Extension triceps poulie',   'series', 3, 12, 12, null, 60,  25, 35, 2.5, null),
      ('B', 7, 'Planche latérale',           'series', 3, null, null, 30, 30, null, null, null, 'Par côté.'),
      ('B', 8, 'Dead bug',                   'series', 3, 10, 10, null, 30,  null, null, null, 'Par côté.'),

      ('C', 1, 'Développé couché barre', 'series', 4, 6,  8,  null, 120, 70, 90,  2.5, null),
      ('C', 2, 'Split squat bulgare',    'series', 3, 8,  8,  null, 90,  14, 24,  2,   'Par jambe. Charge par haltère.'),
      ('C', 3, 'Hip thrust',             'series', 3, 10, 10, null, 90,  80, 160, 10,  null),
      ('C', 4, 'Développé militaire',    'series', 3, 8,  8,  null, 90,  45, 65,  2.5, null),
      ('C', 5, 'Face pull poulie',       'series', 3, 15, 15, null, 60,  30, 40,  2.5, null),
      ('C', 6, 'Marche du fermier',      'series', 3, null, null, null, 90, 30, 45, 4, '40 m par série. Charge par main.'),

      ('D', 1,  'Kettlebell swing',          'circuit', 4, null, null, 40, 20, 24,   null, null, null),
      ('D', 2,  'Rameur',                    'circuit', 4, null, null, 40, 20, null, null, null, null),
      ('D', 3,  'Tirage poulie basse',       'circuit', 4, null, null, 40, 20, null, null, null, null),
      ('D', 4,  'Développé haltères debout', 'circuit', 4, null, null, 40, 20, null, null, null, null),
      ('D', 5,  'Step-up sur banc contrôlé', 'circuit', 4, null, null, 40, 20, null, null, null, null),
      ('D', 6,  'Gainage planche',           'circuit', 4, null, null, 40, 20, null, null, null, null),
      ('D', 7,  'Pas chassés latéraux',               'series', 6, null, null, null, 15, null, null, null, '10 m aller-retour.'),
      ('D', 8,  'Carioca',                            'series', 4, null, null, null, 15, null, null, null, '10 m.'),
      ('D', 9,  'Changements de direction sur plots', 'series', 6, null, null, null, 15, null, null, null, '4 plots espacés de 5 m.'),
      ('D', 10, 'Appuis sur échelle d''agilité',      'series', 1, null, null, 300,  15, null, null, null, null),

      ('MAISON', 1, 'Tractions',                     'series', 5, null, null, null, null, null, null, null, 'Maximum de répétitions.'),
      ('MAISON', 2, 'Pompes pieds surélevés',        'series', 5, null, null, null, null, null, null, null, 'Maximum de répétitions.'),
      ('MAISON', 3, 'Rowing inversé',                'series', 4, 12, 12, null, null, null, null, null, null),
      ('MAISON', 4, 'Split squat bulgare',           'series', 4, 15, 15, null, null, null, null, null, 'Au poids du corps.'),
      ('MAISON', 5, 'Leg curl glissé sur serviette', 'series', 3, 8,  8,  null, null, null, null, null, null),
      ('MAISON', 6, 'Gainage planche',               'series', 3, null, null, 60, null, null, null, null, null),
      ('MAISON', 7, 'Planche latérale',              'series', 3, null, null, 45, null, null, null, null, null)
  ),
  ins as (
    insert into workout_exercises
      (workout_id, exercise_id, ordre, bloc, series, reps_min, reps_max, duree_sec, repos_sec,
       charge_depart_kg, charge_cible_kg, increment_kg, note)
    select w.id, e.id, v.ordre, v.bloc, v.series, v.reps_min, v.reps_max, v.duree_sec, coalesce(v.repos_sec, 90),
           v.depart, v.cible, v.increment, v.note
    from v
    join workouts w on w.user_id = p_user and w.code = v.code
    join exercises e on e.user_id = p_user and e.nom = v.exercice
    returning 1
  )
  select (select count(*) from v), (select count(*) from ins) into v_attendu, v_insere;
  if v_attendu <> v_insere then
    raise exception 'Seed des séances incomplet : % lignes attendues, % insérées', v_attendu, v_insere;
  end if;

  -- 8.6 : protocole pied -------------------------------------------------
  insert into foot_protocol_items (user_id, moment, exercice, dosage, ordre)
  values
    (p_user, 'reveil',        'Étirement du fascia, orteils tirés vers le tibia, avant de poser le pied', '10 fois 10 s', 1),
    (p_user, 'reveil',        'Mollet contre le mur, jambe tendue puis fléchie, enchaîné', '2 fois 30 s par position', 2),
    (p_user, 'journee',       'Étirement du fascia, 2 fois de plus', '10 fois 10 s, 2 fois', 3),
    (p_user, 'jour_sur_deux', 'Montées sur pointe lentes, serviette roulée sous les orteils, sur une marche, tempo 3-2-3', 'Voir progression', 4),
    (p_user, 'quotidien',     'Pied creux actif, « short foot »', '3 x 10, tenu 5 s', 5),
    (p_user, 'quotidien',     'Serviette au sol ramenée avec les orteils', '3 x 15', 6),
    (p_user, 'soir',          'Roulage balle de tennis ou bouteille congelée', '5 min', 7);

  select id into strict v_montees
  from foot_protocol_items
  where user_id = p_user and moment = 'jour_sur_deux';

  insert into foot_progression (user_id, protocol_item_id, semaine_debut, semaine_fin, dosage)
  values
    (p_user, v_montees, 1, 2, '3 x 12 sur 2 pieds au poids du corps'),
    (p_user, v_montees, 3, 4, '4 x 10 sur 2 pieds avec sac à dos 8 à 12 kg'),
    (p_user, v_montees, 5, 6, '4 x 8 sur 1 pied'),
    (p_user, v_montees, 7, 8, '5 x 8 sur 1 pied avec sac 10 à 15 kg');

  -- 8.7 : plan de course ---------------------------------------------------
  insert into running_plan (user_id, semaine, protocole, seances_par_semaine, volume_km_cible)
  values
    (p_user, 1, 'Vélo ou rameur 30 min, marche rapide 30 min', 2, 0),
    (p_user, 2, 'Vélo ou rameur 30 min, marche rapide 30 min', 2, 0),
    (p_user, 3, 'Vélo ou rameur 35 min, marche rapide 45 min dont 10 en côte', 2, 0),
    (p_user, 4, 'Vélo ou rameur 35 min, marche rapide 45 min dont 10 en côte', 2, 0),
    (p_user, 5, '6 x (1 min course lente / 2 min marche)', 2, 2.5),
    (p_user, 6, '8 x (1,5 min course / 1,5 min marche)', 2, 4),
    (p_user, 7, '6 x (3 min course / 1,5 min marche)', 2, 6),
    (p_user, 8, '4 x (6 min course / 1 min marche)', 2, 9),
    (p_user, 9, '5 km continus, allure lente', 2, 10);

  -- 8.8 à 8.12 : repas -----------------------------------------------------
  -- Les plats des menus prennent les macros de la formule de leur slot (600/50 au déjeuner,
  -- 600/45 au dîner), sauf les 4 recettes signature dont la spec donne les kcal.
  insert into meals (user_id, nom, slot, kcal, proteines_g, temps_min, tag, recette_md, ingredients)
  select p_user, v.nom, v.slot, v.kcal, v.proteines_g, v.temps_min, v.tag, v.recette_md, v.ingredients
  from (values
    -- 8.8 : formules
    ('Formule petit déjeuner', 'petit_dej', 450, 40, null::int, 'standard',
      '300 g de skyr ou fromage blanc 0 %, 40 g de flocons d''avoine, 1 fruit, 10 g de beurre de cacahuète.', null::jsonb),
    ('Formule collation matin', 'collation_matin', 150, 15, null, 'standard',
      '1 fruit et 20 g d''amandes, ou 1 skyr nature.', null),
    ('Formule déjeuner', 'dejeuner', 600, 50, null, 'standard',
      '150 g de protéine cuite, 70 g de féculent cru, légumes à volonté, 1 c. à soupe d''huile.', null),
    ('Formule collation avant séance', 'collation_aprem', 200, 20, null, 'standard',
      '1 banane et 1 skyr, ou 2 tranches de pain complet et jambon ou thon.', null),
    ('Formule dîner', 'diner', 600, 45, null, 'standard',
      '150 g de protéine cuite, 50 g de féculent cru, beaucoup de légumes, 1 c. à soupe d''huile.', null),

    -- 8.9 et 8.10 : déjeuners
    ('Bol poulet, riz, légumes rôtis, sauce asiatique',       'dejeuner', 600, 50, null, 'standard', v_sauce, null),
    ('Poké maison : riz, thon, concombre, carotte, édamame',  'dejeuner', 620, 50, null, 'standard', v_poke || E'\n\n' || v_sauce, v_ing_poke),
    ('Wrap poulet crudités, fromage blanc',                   'dejeuner', 600, 50, null, 'standard', null, null),
    ('Chili lentilles et bœuf haché, riz (portion congelée)', 'dejeuner', 600, 50, null, 'batch',    null, null),
    ('Pâtes complètes, sauce tomate, thon',                   'dejeuner', 600, 50, null, 'standard', null, null),
    ('Œufs brouillés, pain complet, grande salade',           'dejeuner', 600, 50, null, 'standard', null, null),
    ('Salade composée des restes',                            'dejeuner', 600, 50, null, 'standard', null, null),
    ('Poké maison : riz, saumon, avocat, radis',              'dejeuner', 620, 50, null, 'standard', v_poke || E'\n\n' || v_sauce, v_ing_poke),
    ('Bol poulet, riz, légumes, sauce asiatique',             'dejeuner', 600, 50, null, 'standard', v_sauce, null),
    ('Salade pois chiches, thon, tomates, feta',              'dejeuner', 600, 50, null, 'standard', null, null),
    ('Pâtes bolognaise à la dinde (portion congelée)',        'dejeuner', 600, 50, null, 'batch',    null, null),
    ('Wrap thon crudités, fromage blanc',                     'dejeuner', 600, 50, null, 'standard', null, null),
    ('Œufs au plat, patates douces rôties, salade',           'dejeuner', 600, 50, null, 'standard', null, null),
    ('Grande salade composée',                                'dejeuner', 600, 50, null, 'standard', null, null),

    -- 8.9 et 8.10 : dîners
    ('Omelette 3 œufs, légumes rôtis, 2 tranches de pain complet', 'diner', 600, 45, null, 'standard', null, null),
    ('Lentilles au curry et lait de coco, yaourt nature',          'diner', 600, 45, null, 'standard', null, null),
    ('Poêlée riz, poulet croustillant, légumes',                   'diner', 640, 45, null, 'standard', v_poulet || E'\n\n' || v_sauce, v_ing_poulet),
    ('Ramen maison : bouillon, nouilles, poulet, œuf, légumes',    'diner', 600, 45, null, 'standard', v_ramen, v_ing_ramen),
    ('Pizza maison, salade verte',                                 'diner', 700, 45, null, 'plaisir',  v_pizza, v_ing_pizza),
    ('Repas libre',                                                'diner', 600, 45, null, 'plaisir',  null, null),
    ('Poulet rôti et légumes du nouveau batch',                    'diner', 600, 45, null, 'batch',    null, null),
    ('Chili con carne aux lentilles, riz',                         'diner', 600, 45, null, 'standard', null, null),
    ('Omelette aux champignons, grande salade, pain',              'diner', 600, 45, null, 'standard', null, null),
    ('Ramen maison, œuf mollet, pak choï',                         'diner', 600, 45, null, 'standard', v_ramen, v_ing_ramen),
    ('Wok poulet, nouilles, légumes, sauce asiatique',             'diner', 600, 45, null, 'standard', v_sauce, null),
    ('Nouveau batch : poulet, riz, légumes',                       'diner', 600, 45, null, 'batch',    null, null),

    -- 8.12 : plats de secours
    ('Œufs brouillés, légumes surgelés poêlés, 2 tranches de pain complet', 'diner', 520, 32, 8,  'secours', null, null),
    ('Pâtes, sauce tomate du bocal, 1 boîte de thon',                       'diner', 600, 40, 10, 'secours', null, null),
    ('Portion congelée réchauffée',                                         'diner', 600, 45, 4,  'secours', null, null)
  ) as v(nom, slot, kcal, proteines_g, temps_min, tag, recette_md, ingredients);

  -- 8.9 et 8.10 : plan de repas sur 2 semaines ------------------------------
  -- Petit déjeuner et collations : la formule du slot, tous les jours.
  with menus(semaine, jour, dejeuner, diner) as (
    values
      (1, 'lundi',    'Bol poulet, riz, légumes rôtis, sauce asiatique',       'Omelette 3 œufs, légumes rôtis, 2 tranches de pain complet'),
      (1, 'mardi',    'Poké maison : riz, thon, concombre, carotte, édamame',  'Lentilles au curry et lait de coco, yaourt nature'),
      (1, 'mercredi', 'Wrap poulet crudités, fromage blanc',                   'Poêlée riz, poulet croustillant, légumes'),
      (1, 'jeudi',    'Chili lentilles et bœuf haché, riz (portion congelée)', 'Ramen maison : bouillon, nouilles, poulet, œuf, légumes'),
      (1, 'vendredi', 'Pâtes complètes, sauce tomate, thon',                   'Pizza maison, salade verte'),
      (1, 'samedi',   'Œufs brouillés, pain complet, grande salade',           'Repas libre'),
      (1, 'dimanche', 'Salade composée des restes',                            'Poulet rôti et légumes du nouveau batch'),
      (2, 'lundi',    'Poké maison : riz, saumon, avocat, radis',              'Chili con carne aux lentilles, riz'),
      (2, 'mardi',    'Bol poulet, riz, légumes, sauce asiatique',             'Omelette aux champignons, grande salade, pain'),
      (2, 'mercredi', 'Salade pois chiches, thon, tomates, feta',              'Ramen maison, œuf mollet, pak choï'),
      (2, 'jeudi',    'Pâtes bolognaise à la dinde (portion congelée)',        'Wok poulet, nouilles, légumes, sauce asiatique'),
      (2, 'vendredi', 'Wrap thon crudités, fromage blanc',                     'Pizza maison, salade verte'),
      (2, 'samedi',   'Œufs au plat, patates douces rôties, salade',           'Repas libre'),
      (2, 'dimanche', 'Grande salade composée',                                'Nouveau batch : poulet, riz, légumes')
  ),
  formules(slot, nom) as (
    values
      ('petit_dej',       'Formule petit déjeuner'),
      ('collation_matin', 'Formule collation matin'),
      ('collation_aprem', 'Formule collation avant séance')
  ),
  lignes as (
    select semaine, jour, 'dejeuner' as slot, dejeuner as nom from menus
    union all
    select semaine, jour, 'diner', diner from menus
    union all
    select m.semaine, m.jour, f.slot, f.nom from menus m cross join formules f
  ),
  ins as (
    insert into meal_plan (user_id, semaine, jour, slot, meal_id)
    select p_user, l.semaine, l.jour, l.slot, me.id
    from lignes l
    join meals me on me.user_id = p_user and me.nom = l.nom and me.slot = l.slot
    returning 1
  )
  select (select count(*) from lignes), (select count(*) from ins) into v_attendu, v_insere;
  if v_attendu <> v_insere then
    raise exception 'Seed du plan de repas incomplet : % lignes attendues, % insérées', v_attendu, v_insere;
  end if;

  -- 8.13 : courses de base et protéines par euro -----------------------------
  -- Whey et filet de poulet ne figurent que dans le tableau protéines par euro : non récurrents.
  insert into grocery_items (user_id, nom, categorie, quantite, prix_eur, proteines_par_euro, recurrent)
  values
    (p_user, 'Œufs',               'proteines', '18',       4.50, 25,   true),
    (p_user, 'Cuisses de poulet',  'proteines', '1 kg',     5.50, 25,   true),
    (p_user, 'Fromage blanc 0 %',  'laitages',  '1 kg',     2.20, 36,   true),
    (p_user, 'Thon en boîte',      'proteines', '4 boîtes', 3.00, 33,   true),
    (p_user, 'Lentilles sèches',   'proteines', '500 g',    1.50, 80,   true),
    (p_user, 'Riz',                'feculents', '1 kg',     1.50, null, true),
    (p_user, 'Flocons d''avoine',  'feculents', '1 kg',     1.50, null, true),
    (p_user, 'Pâtes complètes',    'feculents', '500 g',    0.80, null, true),
    (p_user, 'Farine',             'epicerie',  '1 kg',     0.80, null, true),
    (p_user, 'Tomates concassées', 'epicerie',  '2 boîtes', 1.00, null, true),
    (p_user, 'Légumes surgelés',   'legumes',   '2 kg',     3.00, null, true),
    (p_user, 'Légumes frais',      'legumes',   '2,5 kg',   3.00, null, true),
    (p_user, 'Bananes et pommes',  'fruits',    '2 kg',     2.70, null, true),
    (p_user, 'Whey',               'proteines', null,       null, 34,   false),
    (p_user, 'Filet de poulet',    'proteines', null,       null, 15,   false);
end;
$seed$;

create or replace function private.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.seed_user_data(new.id);
  return new;
end;
$$;

revoke all on function private.seed_user_data(uuid) from public;
revoke all on function private.on_auth_user_created() from public;

drop trigger if exists seed_on_auth_user_created on auth.users;
create trigger seed_on_auth_user_created
  after insert on auth.users
  for each row execute function private.on_auth_user_created();

-- Rattrapage : un propriétaire dont le compte existait avant le quota.
insert into quotas_ia (user_id, demandes_par_mois)
select u.id, null from auth.users u join private.proprietaire p on lower(p.email) = lower(u.email)
on conflict (user_id) do nothing;

-- Rattrapage : les comptes créés avant l'installation du trigger.
do $$
declare
  v_compte uuid;
begin
  for v_compte in select id from auth.users order by created_at, id loop
    perform private.seed_user_data(v_compte);
  end loop;
end $$;
