-- Une séance faite peut s'enregistrer après coup, et sortir du programme : un mélange de
-- plusieurs séances, ou des exercices qui ne figurent dans aucune. Chaque série porte donc
-- directement son exercice ; la séance du programme et sa ligne d'exercice deviennent facultatives.

alter table set_logs add column exercise_id uuid references exercises deferrable initially deferred;
update set_logs s set exercise_id = we.exercise_id from workout_exercises we where we.id = s.workout_exercise_id;
alter table set_logs alter column exercise_id set not null;
alter table set_logs alter column workout_exercise_id drop not null;
create index on set_logs (exercise_id);

-- Vide : séance hors programme.
alter table workout_logs alter column workout_id drop not null;

-- Le mode exécution n'envoie que la ligne de séance de chaque série : l'exercice s'en déduit.
create function private.exercice_de_la_serie()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.exercise_id is null then
    select exercise_id into new.exercise_id from workout_exercises where id = new.workout_exercise_id;
  end if;
  return new;
end;
$$;
create trigger set_logs_exercice before insert on set_logs
  for each row execute function private.exercice_de_la_serie();

-- Une série ne peut désigner qu'un exercice du même compte.
drop policy set_logs_proprietaire on set_logs;
create policy set_logs_proprietaire on set_logs for all to authenticated
  using (
    exists (select 1 from workout_logs l where l.id = workout_log_id and l.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from workout_logs l where l.id = workout_log_id and l.user_id = (select auth.uid()))
    and exists (select 1 from exercises e where e.id = exercise_id and e.user_id = (select auth.uid()))
  );

-- Enregistre une séance à n'importe quelle date passée, et remplace au besoin une séance déjà
-- enregistrée. Tout tient dans un seul groupe de l'historique : l'annuler retire la nouvelle
-- séance, rétablit l'ancienne avec ses séries, et supprime les exercices créés pour l'occasion.
--
--   p_exercices : exercices à créer, [{ "id", "nom", "groupe", "equipement" }]
--   p_series    : [{ "exercise_id", "workout_exercise_id" (facultatif), "serie_num", "charge_kg", "reps", "duree_sec" }]
--
-- La fonction s'exécute avec les droits de l'appelant : la RLS s'applique à chaque écriture.
create function public.enregistrer_seance_passee(
  p_id uuid,
  p_date date,
  p_series jsonb,
  p_resume text,
  p_workout_id uuid default null,
  p_duree_min int default null,
  p_note text default null,
  p_exercices jsonb default '[]'::jsonb,
  p_remplace uuid default null,
  p_source text default 'chatbot'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_groupe uuid := gen_random_uuid();
  v_ancienne jsonb;
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;
  -- Un jour de marge : la date vient du téléphone, qui peut être en avance sur le serveur.
  if p_date > current_date + 1 then
    raise exception 'Une séance ne peut pas être datée dans le futur' using errcode = '22023';
  end if;
  if jsonb_typeof(p_series) is distinct from 'array' or jsonb_array_length(p_series) = 0 then
    raise exception 'Aucune série à enregistrer' using errcode = '22023';
  end if;
  if p_workout_id is not null and not exists (select 1 from workouts where id = p_workout_id) then
    raise exception 'Séance introuvable' using errcode = 'P0002';
  end if;

  insert into exercises (id, user_id, nom, groupe, equipement)
  select e.id, v_user, e.nom, e.groupe, e.equipement
  from jsonb_to_recordset(p_exercices) as e(id uuid, nom text, groupe text, equipement text);

  insert into change_log (user_id, groupe_id, table_name, row_id, operation, after_data, source, resume, applied_at)
  select v_user, v_groupe, 'exercises', e.id, 'insert', to_jsonb(e), p_source, p_resume, clock_timestamp()
  from exercises e
  where e.id in (select x.id from jsonb_to_recordset(p_exercices) as x(id uuid));

  if exists (
    select 1
    from jsonb_to_recordset(p_series) as s(exercise_id uuid, workout_exercise_id uuid)
    where not exists (select 1 from exercises e where e.id = s.exercise_id)
       or (s.workout_exercise_id is not null and not exists (
         select 1 from workout_exercises we
         where we.id = s.workout_exercise_id and we.workout_id = p_workout_id and we.exercise_id = s.exercise_id
       ))
  ) then
    raise exception 'Une série ne correspond à aucun exercice connu' using errcode = '23514';
  end if;

  if p_remplace is not null then
    select to_jsonb(l) into v_ancienne from workout_logs l where l.id = p_remplace for update;
    if v_ancienne is null then
      raise exception 'Séance à remplacer introuvable' using errcode = 'P0002';
    end if;
    -- Les séries d'abord, la séance ensuite : l'annulation repasse dans l'ordre inverse et
    -- recrée la séance avant ses séries.
    insert into change_log (user_id, groupe_id, table_name, row_id, operation, before_data, source, resume, applied_at)
    select v_user, v_groupe, 'set_logs', s.id, 'delete', to_jsonb(s), p_source, p_resume, clock_timestamp()
    from set_logs s
    where s.workout_log_id = p_remplace
    order by s.serie_num;
    insert into change_log (user_id, groupe_id, table_name, row_id, operation, before_data, source, resume, applied_at)
    values (v_user, v_groupe, 'workout_logs', p_remplace, 'delete', v_ancienne, p_source, p_resume, clock_timestamp());
    delete from workout_logs where id = p_remplace;
  end if;

  insert into workout_logs (id, user_id, workout_id, date, duree_min, note)
  values (p_id, v_user, p_workout_id, p_date, p_duree_min, p_note);

  insert into set_logs (workout_log_id, exercise_id, workout_exercise_id, serie_num, charge_kg, reps, duree_sec)
  select p_id, s.exercise_id, s.workout_exercise_id, s.serie_num, s.charge_kg, s.reps, s.duree_sec
  from jsonb_to_recordset(p_series)
    as s(exercise_id uuid, workout_exercise_id uuid, serie_num int, charge_kg numeric, reps int, duree_sec int);

  -- Annuler l'insertion de la séance emporte ses séries par cascade.
  insert into change_log (user_id, groupe_id, table_name, row_id, operation, after_data, source, resume, applied_at)
  values (
    v_user, v_groupe, 'workout_logs', p_id, 'insert',
    jsonb_build_object(
      'workout_log', (select to_jsonb(l) from workout_logs l where l.id = p_id),
      'set_logs', (select jsonb_agg(to_jsonb(s) order by s.exercise_id, s.serie_num) from set_logs s where s.workout_log_id = p_id)
    ),
    p_source, p_resume, clock_timestamp()
  );

  return v_groupe;
end;
$$;
revoke all on function public.enregistrer_seance_passee(uuid, date, jsonb, text, uuid, int, text, jsonb, uuid, text) from public, anon;
grant execute on function public.enregistrer_seance_passee(uuid, date, jsonb, text, uuid, int, text, jsonb, uuid, text) to authenticated;

-- L'annulation sait désormais recréer des séries supprimées.
create or replace function public.annuler_changement(p_groupe uuid)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  k_tables constant text[] := array[
    'workouts', 'workout_exercises', 'exercises', 'meals', 'meal_plan', 'workout_logs', 'set_logs',
    'foot_logs', 'running_logs', 'running_plan', 'body_metrics', 'meal_logs', 'profiles',
    'grocery_items', 'grocery_list_items'
  ];
  v_user uuid := auth.uid();
  v_ligne change_log;
  v_colonnes text;
  v_touchees int;
  v_total int := 0;
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;

  for v_ligne in
    select * from change_log
    where groupe_id = p_groupe and user_id = v_user and undone_at is null
    order by applied_at desc, id
    for update
  loop
    if not (v_ligne.table_name = any (k_tables)) then
      raise exception 'Annulation impossible sur %', v_ligne.table_name using errcode = '42501';
    end if;

    if v_ligne.operation = 'insert' then
      execute format('delete from public.%I where id = $1', v_ligne.table_name) using v_ligne.row_id;

    elsif v_ligne.operation = 'update' then
      select string_agg(quote_ident(avant.key), ', ')
      into v_colonnes
      from jsonb_each(v_ligne.before_data) as avant
      where avant.key not in ('id', 'user_id')
        and avant.value is distinct from (v_ligne.after_data -> avant.key);

      if v_colonnes is not null then
        execute format(
          'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2)) where id = $1',
          v_ligne.table_name, v_colonnes, v_colonnes, v_ligne.table_name
        ) using v_ligne.row_id, v_ligne.before_data;
        get diagnostics v_touchees = row_count;
        if v_touchees = 0 then
          raise exception 'La ligne à rétablir n''existe plus' using errcode = 'P0002';
        end if;
      end if;

    else
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
        v_ligne.table_name, v_ligne.table_name
      ) using v_ligne.before_data;
    end if;

    v_total := v_total + 1;
  end loop;

  if v_total = 0 then
    raise exception 'Rien à annuler' using errcode = 'P0002';
  end if;

  update change_log set undone_at = now()
  where groupe_id = p_groupe and user_id = v_user and undone_at is null;

  return v_total;
end;
$$;
