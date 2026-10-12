-- Modèle. Copie ce fichier en `supabase/proprietaire.sql` (ignoré par git) et remplis-le.
--
-- Il désigne le compte propriétaire : celui qui reçoit le programme complet du seed à sa première
-- connexion, avec des demandes IA illimitées. Tous les autres comptes partent de zéro.
-- Sans ce fichier, il n'y a pas de propriétaire.
--
-- Appliqué avant `seed.sql` par `supabase db reset` (local) et `supabase db push --include-seed`
-- (hébergé), ou à la main dans l'éditeur SQL de Supabase.

insert into private.proprietaire (email, taille_cm, poids_initial_kg, age, contrainte_medicale)
values ('adresse@exemple.fr', 175, 80, 30, null)
on conflict (email) do update set
  taille_cm = excluded.taille_cm,
  poids_initial_kg = excluded.poids_initial_kg,
  age = excluded.age,
  contrainte_medicale = excluded.contrainte_medicale;
