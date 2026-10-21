-- Une date du planning peut porter une activité hors programme (street workout, randonnée, sport
-- collectif) à la place de la séance prévue, sans rien changer aux autres semaines.
-- Sans séance ni activité, la ligne vaut toujours repos.
alter table planning add column activite text check (char_length(activite) between 2 and 60);
alter table planning add constraint planning_seance_ou_activite check (workout_id is null or activite is null);
