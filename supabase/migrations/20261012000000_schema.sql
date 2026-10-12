-- Schéma complet de l'application (SPEC section 4), RLS comprise.
--
-- Ajouts par rapport au SQL de la spec. Chacun sert à ranger en base un contenu du seed
-- (section 8) qui n'avait pas de colonne, pour respecter « aucune donnée en dur dans le code » :
--   profiles.age, profiles.contrainte_medicale   profil de la section 1, lu par le chatbot
--   profiles.aliments_exclus                     section 8.14
--   workouts.note                                note de séance (8.1, 8.4)
--   workouts.circuit_repos_tours_sec             repos entre deux tours du circuit (8.4)
--   workout_exercises.bloc                       'series' ou 'circuit' (8.4)
--   foot_progression (table)                     progression des montées sur pointe (8.6)
--   foot_protocol_items.moment = 'quotidien'     les lignes « Tous les jours » (8.6)
--   running_plan.seances_par_semaine             « 2 fois par semaine » (8.7)
-- Les contraintes CHECK reprennent les valeurs listées en commentaire dans la spec.

-- Profil et objectifs
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  taille_cm int not null default 173,
  poids_initial_kg numeric not null default 92,
  age int,
  contrainte_medicale text,
  objectif_kcal int not null default 2000,
  objectif_proteines_g int not null default 170,
  objectif_lipides_g int not null default 65,
  objectif_glucides_g int not null default 180,
  budget_courses_eur numeric default 35,
  aliments_exclus text[] not null default '{}',
  created_at timestamptz default now()
);

-- SPORT ------------------------------------------------------------

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nom text not null,
  groupe text not null,            -- 'jambes','dos','pectoraux','epaules','bras','gainage','agilite','pied','cardio'
  equipement text,                 -- 'barre','halteres','poulie','machine','poids_du_corps','kettlebell','aucun'
  note text,
  archived boolean default false
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  code text not null,              -- 'A','B','C','D','MAISON'
  nom text not null,
  lieu text not null check (lieu in ('salle','maison','exterieur')),
  duree_min int not null,
  jour_suggere text check (jour_suggere in ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche')),
  ordre int not null,
  note text,
  circuit_repos_tours_sec int,     -- renseigné si la séance contient un bloc circuit
  archived boolean default false
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts on delete cascade,
  exercise_id uuid not null references exercises,
  ordre int not null,
  bloc text not null default 'series' check (bloc in ('series','circuit')),
  series int not null check (series > 0),   -- nombre de tours pour un bloc circuit
  reps_min int,
  reps_max int,
  duree_sec int,                   -- pour le gainage, alternative aux reps ; temps de travail en circuit
  repos_sec int not null default 90,
  charge_depart_kg numeric,
  charge_cible_kg numeric,
  increment_kg numeric,
  note text
);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workout_id uuid not null references workouts,
  date date not null default current_date,
  duree_min int,
  ressenti int check (ressenti between 1 and 5),
  note text
);

create table set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references workout_logs on delete cascade,
  workout_exercise_id uuid not null references workout_exercises,
  serie_num int not null,
  charge_kg numeric,
  reps int,
  rir int check (rir between 0 and 5)   -- répétitions en réserve
);

-- PIED ET COURSE ----------------------------------------------------

create table foot_protocol_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  moment text not null check (moment in ('reveil','journee','soir','jour_sur_deux','quotidien')),
  exercice text not null,
  dosage text not null,
  ordre int not null,
  actif boolean default true
);

create table foot_progression (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  protocol_item_id uuid not null references foot_protocol_items on delete cascade,
  semaine_debut int not null,
  semaine_fin int not null,
  dosage text not null,
  check (semaine_debut <= semaine_fin)
);

create table foot_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  douleur_matin int not null check (douleur_matin between 0 and 10),
  protocole_fait boolean default false,
  note text,
  unique (user_id, date)
);

create table running_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  semaine int not null,
  protocole text not null,
  seances_par_semaine int not null default 2,
  volume_km_cible numeric not null,
  statut text default 'a_venir' check (statut in ('a_venir','en_cours','valide','repete'))
);

create table running_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  km numeric not null,
  duree_min int,
  douleur_apres int check (douleur_apres between 0 and 10),
  douleur_lendemain int check (douleur_lendemain between 0 and 10)   -- saisi le lendemain
);

create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  poids_kg numeric,
  tour_taille_cm numeric,
  unique (user_id, date)
);

-- NUTRITION ---------------------------------------------------------

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nom text not null,
  slot text not null check (slot in ('petit_dej','collation_matin','dejeuner','collation_aprem','diner')),
  kcal int not null,
  proteines_g int not null,
  lipides_g int,
  glucides_g int,
  temps_min int,
  recette_md text,                 -- markdown, affiché tel quel
  ingredients jsonb,               -- [{"nom":"riz","quantite":60,"unite":"g"}]
  tag text,                        -- 'secours','plaisir','batch','standard'
  archived boolean default false
);

create table meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  semaine int not null check (semaine in (1, 2)),   -- le plan tourne sur 2 semaines
  jour text not null check (jour in ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche')),
  slot text not null check (slot in ('petit_dej','collation_matin','dejeuner','collation_aprem','diner')),
  meal_id uuid references meals,
  unique (user_id, semaine, jour, slot)
);

create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  slot text not null check (slot in ('petit_dej','collation_matin','dejeuner','collation_aprem','diner')),
  meal_id uuid references meals,
  kcal_reel int,                   -- si écart avec le prévu
  proteines_reel int,
  hors_plan boolean default false, -- true si repas commandé ou improvisé
  note text
);

create table grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nom text not null,
  categorie text not null,         -- 'proteines','feculents','legumes','fruits','epicerie','laitages'
  quantite text,
  prix_eur numeric,
  proteines_par_euro numeric,
  recurrent boolean default true
);

create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  semaine_du date not null,
  nom text not null,
  categorie text not null,
  quantite text,
  prix_eur numeric,
  coche boolean default false
);

-- CHATBOT ET HISTORIQUE ---------------------------------------------

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);

create table change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  table_name text not null,
  row_id uuid,
  operation text not null check (operation in ('insert','update','delete')),
  before_data jsonb,
  after_data jsonb,
  source text not null check (source in ('user','chatbot')),
  resume text not null,            -- phrase lisible : "Squat remplacé par presse à cuisses dans la séance A"
  applied_at timestamptz default now(),
  undone_at timestamptz
);

-- INDEX -------------------------------------------------------------

create index on exercises (user_id);
create index on workouts (user_id, ordre);
create index on workout_exercises (workout_id, ordre);
create index on workout_exercises (exercise_id);
create index on workout_logs (user_id, date);
create index on workout_logs (workout_id);
create index on set_logs (workout_log_id);
create index on set_logs (workout_exercise_id);
create index on foot_protocol_items (user_id, ordre);
create index on foot_progression (user_id);
create index on foot_progression (protocol_item_id);
create index on running_plan (user_id, semaine);
create index on running_logs (user_id, date);
create index on meals (user_id, slot);
create index on meal_plan (meal_id);
create index on meal_logs (user_id, date);
create index on meal_logs (meal_id);
create index on grocery_items (user_id);
create index on grocery_list_items (user_id, semaine_du);
create index on chat_messages (user_id, created_at);
create index on change_log (user_id, applied_at desc);

-- ROW LEVEL SECURITY ------------------------------------------------
-- Une seule règle partout : on ne lit et n'écrit que ses propres lignes.

alter table profiles enable row level security;
create policy profiles_proprietaire on profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'exercises', 'workouts', 'workout_logs',
    'foot_protocol_items', 'foot_progression', 'foot_logs',
    'running_plan', 'running_logs', 'body_metrics',
    'meals', 'meal_plan', 'meal_logs',
    'grocery_items', 'grocery_list_items',
    'chat_messages', 'change_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_proprietaire', t
    );
  end loop;
end $$;

-- Les deux tables sans user_id héritent du propriétaire de leur parent.
alter table workout_exercises enable row level security;
create policy workout_exercises_proprietaire on workout_exercises for all to authenticated
  using (
    exists (select 1 from workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
    and exists (select 1 from exercises e where e.id = exercise_id and e.user_id = (select auth.uid()))
  );

alter table set_logs enable row level security;
create policy set_logs_proprietaire on set_logs for all to authenticated
  using (
    exists (select 1 from workout_logs l where l.id = workout_log_id and l.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from workout_logs l where l.id = workout_log_id and l.user_id = (select auth.uid()))
  );

-- Aucun accès sans session ; l'utilisateur connecté passe par les règles ci-dessus.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
