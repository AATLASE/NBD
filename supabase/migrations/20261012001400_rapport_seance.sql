-- Rapport de fin de séance : temps détaillé, calories, commentaire.

-- L'heure de fin de chaque série et l'heure de début de la séance : c'est ce qui permet de
-- calculer le temps passé par exercice et le temps réel entre deux séries.
alter table set_logs add column terminee_a timestamptz;
alter table workout_logs add column debut_a timestamptz;
-- Calories mesurées par la montre, quand une activité importée correspond à la séance.
-- Sans elles, l'application affiche une estimation calculée à partir de la durée et du poids.
alter table workout_logs add column kcal int check (kcal between 0 and 5000);

-- Enregistrement d'une séance exécutée : prend désormais le commentaire de l'utilisateur, l'heure
-- de début et l'heure de fin de chaque série. Le reste ne change pas (voir 20261012000200).
drop function public.enregistrer_seance(uuid, uuid, date, int, int, jsonb, text);
create function public.enregistrer_seance(
  p_id uuid,
  p_workout_id uuid,
  p_date date,
  p_duree_min int,
  p_ressenti int,
  p_series jsonb,
  p_source text default 'user',
  p_note text default null,
  p_debut timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_change uuid;
  v_code text;
  v_series int;
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;

  select id into v_change
  from change_log
  where user_id = v_user and table_name = 'workout_logs' and row_id = p_id and operation = 'insert'
  order by applied_at
  limit 1;
  if found then
    return v_change;
  end if;

  select code into v_code from workouts where id = p_workout_id;
  if not found then
    raise exception 'Séance introuvable' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_series) as s(workout_exercise_id uuid)
    where not exists (
      select 1 from workout_exercises we
      where we.id = s.workout_exercise_id and we.workout_id = p_workout_id
    )
  ) then
    raise exception 'Une série ne correspond à aucun exercice de cette séance' using errcode = '23514';
  end if;

  insert into workout_logs (id, user_id, workout_id, date, duree_min, ressenti, note, debut_a)
  values (p_id, v_user, p_workout_id, p_date, p_duree_min, p_ressenti, nullif(btrim(p_note), ''), p_debut);

  insert into set_logs (workout_log_id, workout_exercise_id, serie_num, charge_kg, reps, duree_sec, rir, terminee_a)
  select p_id, s.workout_exercise_id, s.serie_num, s.charge_kg, s.reps, s.duree_sec, s.rir, s.terminee_a
  from jsonb_to_recordset(p_series)
    as s(workout_exercise_id uuid, serie_num int, charge_kg numeric, reps int, duree_sec int, rir int, terminee_a timestamptz);
  get diagnostics v_series = row_count;

  insert into change_log (user_id, table_name, row_id, operation, after_data, source, resume)
  values (
    v_user, 'workout_logs', p_id, 'insert',
    jsonb_build_object(
      'workout_log', (select to_jsonb(l) from workout_logs l where l.id = p_id),
      'set_logs', coalesce(
        (select jsonb_agg(to_jsonb(s) order by s.workout_exercise_id, s.serie_num)
         from set_logs s where s.workout_log_id = p_id),
        '[]'::jsonb
      )
    ),
    p_source,
    format('Séance %s enregistrée : %s série%s', v_code, v_series, case when v_series > 1 then 's' else '' end)
  )
  returning id into v_change;

  return v_change;
end;
$$;
revoke all on function public.enregistrer_seance(uuid, uuid, date, int, int, jsonb, text, text, timestamptz) from public, anon;
grant execute on function public.enregistrer_seance(uuid, uuid, date, int, int, jsonb, text, text, timestamptz) to authenticated;

-- Import d'une séance de la montre. Si la même séance est déjà dans le journal ce jour-là (faite
-- avec l'application), la montre la complète (calories, durée manquante) au lieu de créer un
-- doublon. Dans les deux cas, l'écriture est annulable.
drop function public.enregistrer_seance_importee(uuid, date, int, text);
create function public.enregistrer_seance_importee(
  p_workout_id uuid,
  p_date date,
  p_duree_min int,
  p_note text,
  p_kcal int default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_groupe uuid := gen_random_uuid();
  v_code text;
  v_existante workout_logs;
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;

  select code into v_code from workouts where id = p_workout_id;
  if not found then
    raise exception 'Séance introuvable' using errcode = 'P0002';
  end if;

  select * into v_existante
  from workout_logs
  where user_id = v_user and workout_id = p_workout_id and date = p_date
  order by debut_a nulls last
  limit 1
  for update;

  if found then
    update workout_logs
    set kcal = coalesce(p_kcal, kcal),
        duree_min = coalesce(duree_min, p_duree_min)
    where id = v_existante.id;
    insert into change_log (user_id, groupe_id, table_name, row_id, operation, before_data, after_data, source, resume)
    values (
      v_user, v_groupe, 'workout_logs', v_existante.id, 'update',
      to_jsonb(v_existante),
      (select to_jsonb(l) from workout_logs l where l.id = v_existante.id),
      'user',
      format('Séance %s complétée par la montre', v_code)
    );
    return v_groupe;
  end if;

  insert into workout_logs (id, user_id, workout_id, date, duree_min, note, kcal)
  values (v_id, v_user, p_workout_id, p_date, p_duree_min, p_note, p_kcal);

  insert into change_log (user_id, groupe_id, table_name, row_id, operation, after_data, source, resume)
  values (
    v_user, v_groupe, 'workout_logs', v_id, 'insert',
    (select to_jsonb(l) from workout_logs l where l.id = v_id),
    'user',
    format('Séance %s importée de la montre : %s min', v_code, p_duree_min)
  );

  return v_groupe;
end;
$$;
revoke all on function public.enregistrer_seance_importee(uuid, date, int, text, int) from public, anon;
grant execute on function public.enregistrer_seance_importee(uuid, date, int, text, int) to authenticated;
