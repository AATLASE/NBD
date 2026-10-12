-- Phase 4 : édition du programme, historique et annulation.

-- Retirer un exercice d'une séance ne doit pas effacer les séries déjà enregistrées dessus.
-- Comme pour exercises, workouts et meals dans la spec, on archive au lieu de supprimer.
alter table workout_exercises add column archived boolean not null default false;

-- Une action de l'utilisateur peut toucher plusieurs lignes (réordonner une séance, échanger
-- deux repas, dupliquer une séance). Elles partagent un groupe_id : c'est le groupe qu'on annule.
alter table change_log add column groupe_id uuid not null default gen_random_uuid();
create index on change_log (user_id, groupe_id);

-- Applique une liste de changements dans une seule transaction, avec une ligne change_log
-- par ligne touchée. Tout passe ou rien ne passe.
--
--   p_changements : [{ "table": "...", "operation": "insert" | "update", "id": "...", "data": {...} }]
--
-- La fonction s'exécute avec les droits de l'appelant : la RLS s'applique à chaque écriture.
-- Les noms de table viennent d'une liste fermée, les noms de colonne sont vérifiés contre le
-- schéma, et le propriétaire d'une ligne n'est jamais lu depuis l'appel.
create function public.appliquer_changements(
  p_changements jsonb,
  p_resume text,
  p_source text default 'user'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  k_tables constant text[] := array['workouts', 'workout_exercises', 'exercises', 'meals', 'meal_plan'];
  v_user uuid := auth.uid();
  v_groupe uuid := gen_random_uuid();
  v_changement jsonb;
  v_table text;
  v_operation text;
  v_id uuid;
  v_data jsonb;
  v_colonnes text;
  v_reconnues int;
  v_avant jsonb;
  v_apres jsonb;
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changements) is distinct from 'array' or jsonb_array_length(p_changements) = 0 then
    raise exception 'Aucun changement à appliquer' using errcode = '22023';
  end if;

  for v_changement in select * from jsonb_array_elements(p_changements) loop
    v_table := v_changement->>'table';
    v_operation := v_changement->>'operation';
    v_id := (v_changement->>'id')::uuid;
    v_data := coalesce(v_changement->'data', '{}'::jsonb) - 'id' - 'user_id';

    if v_table is null or not (v_table = any (k_tables)) then
      raise exception 'Table non modifiable : %', v_table using errcode = '42501';
    end if;
    if v_id is null or v_operation is null or v_operation not in ('insert', 'update') then
      raise exception 'Changement mal formé' using errcode = '22023';
    end if;

    if v_operation = 'insert' then
      v_data := v_data || jsonb_build_object('id', v_id);
      if exists (
        select 1 from pg_attribute
        where attrelid = format('public.%I', v_table)::regclass and attname = 'user_id' and not attisdropped
      ) then
        v_data := v_data || jsonb_build_object('user_id', v_user);
      end if;
    end if;

    select string_agg(quote_ident(attname), ', '), count(*)
    into v_colonnes, v_reconnues
    from pg_attribute
    where attrelid = format('public.%I', v_table)::regclass
      and attnum > 0 and not attisdropped and v_data ? attname;

    if v_colonnes is null or v_reconnues <> (select count(*) from jsonb_object_keys(v_data)) then
      raise exception 'Colonne inconnue dans un changement sur %', v_table using errcode = '42703';
    end if;

    if v_operation = 'insert' then
      v_avant := null;
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
        v_table, v_colonnes, v_colonnes, v_table
      ) using v_data;
    else
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_avant using v_id;
      if v_avant is null then
        raise exception 'Ligne introuvable dans %', v_table using errcode = 'P0002';
      end if;
      execute format(
        'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2)) where id = $1',
        v_table, v_colonnes, v_colonnes, v_table
      ) using v_id, v_data;
    end if;

    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
      into v_apres using v_id;

    -- clock_timestamp() et non now() : l'ordre des lignes d'un même groupe est conservé.
    insert into change_log
      (user_id, groupe_id, table_name, row_id, operation, before_data, after_data, source, resume, applied_at)
    values
      (v_user, v_groupe, v_table, v_id, v_operation, v_avant, v_apres, p_source, p_resume, clock_timestamp());
  end loop;

  return v_groupe;
end;
$$;

-- Annule un groupe de changements, du dernier au premier.
--   insert  -> la ligne créée est supprimée
--   update  -> seules les colonnes que ce changement avait modifiées reprennent leur ancienne
--              valeur : une modification faite depuis sur un autre champ est conservée
--   delete  -> la ligne est recréée à l'identique
-- Renvoie le nombre de lignes rétablies.
create function public.annuler_changement(p_groupe uuid)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  k_tables constant text[] := array[
    'workouts', 'workout_exercises', 'exercises', 'meals', 'meal_plan', 'workout_logs'
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

revoke all on function public.appliquer_changements(jsonb, text, text) from public, anon;
revoke all on function public.annuler_changement(uuid) from public, anon;
grant execute on function public.appliquer_changements(jsonb, text, text) to authenticated;
grant execute on function public.annuler_changement(uuid) to authenticated;
