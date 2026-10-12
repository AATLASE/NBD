-- Phase 3 : enregistrement d'une séance exécutée.

-- Les séries chronométrées (gainage, stations de circuit) n'ont pas de répétitions :
-- sans cette colonne, leur durée réelle n'avait nulle part où aller. Ajout par rapport à la spec.
alter table set_logs add column duree_sec int check (duree_sec > 0);

-- Écrit la séance, ses séries et la ligne change_log dans une seule transaction :
-- soit tout est enregistré, soit rien.
--
-- p_id est généré par le téléphone. Si la même séance est renvoyée (double appui, réseau
-- instable, file d'attente hors ligne), rien n'est dupliqué : on renvoie l'entrée existante.
--
-- La fonction s'exécute avec les droits de l'appelant : la RLS s'applique à chaque écriture.
create function public.enregistrer_seance(
  p_id uuid,
  p_workout_id uuid,
  p_date date,
  p_duree_min int,
  p_ressenti int,
  p_series jsonb,
  p_source text default 'user'
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

  insert into workout_logs (id, user_id, workout_id, date, duree_min, ressenti)
  values (p_id, v_user, p_workout_id, p_date, p_duree_min, p_ressenti);

  insert into set_logs (workout_log_id, workout_exercise_id, serie_num, charge_kg, reps, duree_sec, rir)
  select p_id, s.workout_exercise_id, s.serie_num, s.charge_kg, s.reps, s.duree_sec, s.rir
  from jsonb_to_recordset(p_series)
    as s(workout_exercise_id uuid, serie_num int, charge_kg numeric, reps int, duree_sec int, rir int);
  get diagnostics v_series = row_count;

  -- Une seule entrée d'historique pour toute la séance : l'annuler supprime la séance,
  -- et ses séries suivent par cascade.
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

revoke all on function public.enregistrer_seance(uuid, uuid, date, int, int, jsonb, text) from public, anon;
grant execute on function public.enregistrer_seance(uuid, uuid, date, int, int, jsonb, text) to authenticated;
