-- Le propriétaire de l'application : le seul compte qui reçoit le programme complet du seed.
--
-- Son adresse et ses données personnelles ne figurent pas dans le dépôt. Elles sont inscrites
-- dans cette table, une fois par base, par le fichier `supabase/proprietaire.sql`, qui n'est pas
-- versionné (modèle : `supabase/proprietaire.exemple.sql`). Table vide : pas de propriétaire,
-- tous les comptes partent de zéro.

create schema if not exists private;

create table private.proprietaire (
  email text primary key,
  taille_cm int,
  poids_initial_kg numeric,
  age int,
  contrainte_medicale text
);

-- Lue uniquement par la fonction de seed (security definer). Jamais par l'application.
alter table private.proprietaire enable row level security;
revoke all on private.proprietaire from public, anon, authenticated;
