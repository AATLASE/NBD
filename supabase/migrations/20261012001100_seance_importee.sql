-- Une séance de sport faite hors de l'application, enregistrée par la montre, entre dans le
-- journal sans ses séries : la date, la durée et une note. Annulable comme toute autre écriture.

create function public.enregistrer_seance_importee(
  p_workout_id uuid,
  p_date date,
  p_duree_min int,
  p_note text
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
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;

  select code into v_code from workouts where id = p_workout_id;
  if not found then
    raise exception 'Séance introuvable' using errcode = 'P0002';
  end if;

  insert into workout_logs (id, user_id, workout_id, date, duree_min, note)
  values (v_id, v_user, p_workout_id, p_date, p_duree_min, p_note);

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
revoke all on function public.enregistrer_seance_importee(uuid, date, int, text) from public, anon;
grant execute on function public.enregistrer_seance_importee(uuid, date, int, text) to authenticated;
