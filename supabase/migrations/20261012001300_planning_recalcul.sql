-- Le coach et l'écran Sport doivent dire la même chose : un planning par date, une note cachée
-- par séance, et les ajustements proposés après chaque séance.

-- PLANNING ------------------------------------------------------------------------------------
-- Les exceptions à la semaine type, date par date. Une ligne remplace la séance prévue ce jour-là :
-- une autre séance, ou aucune (workout_id vide : jour de repos). Sans ligne, la semaine type s'applique.
create table planning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  workout_id uuid references workouts deferrable initially deferred,
  raison text check (char_length(raison) <= 300),
  unique (user_id, date)
);

alter table planning enable row level security;
create policy planning_proprietaire on planning for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (workout_id is null or exists (select 1 from workouts w where w.id = workout_id and w.user_id = (select auth.uid())))
  );
revoke all on planning from anon;
grant select, insert, update, delete on planning to authenticated;

-- NOTE DU COACH -------------------------------------------------------------------------------
-- Ce que l'utilisateur a dit d'une séance (difficulté, douleur, fatigue). Écrite par l'assistant,
-- lue par le recalcul ; elle n'est affichée nulle part pour l'instant.
alter table workout_logs add column note_coach text check (char_length(note_coach) <= 2000);

-- AJUSTEMENTS ---------------------------------------------------------------------------------
-- Proposés automatiquement après chaque séance, appliqués seulement si l'utilisateur accepte.
-- `changements` a la forme attendue par appliquer_changements, plus la valeur `avant` de chaque
-- ligne : si le programme a bougé entre-temps, la proposition n'est plus appliquée.
create table ajustements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workout_log_id uuid references workout_logs on delete set null,
  workout_id uuid not null references workouts on delete cascade,
  created_at timestamptz not null default now(),
  resume text not null,
  explication text not null,
  diff jsonb not null default '[]'::jsonb,
  changements jsonb not null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee', 'perimee')),
  groupe_id uuid
);
create index on ajustements (user_id, statut);

alter table ajustements enable row level security;
create policy ajustements_proprietaire on ajustements for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on ajustements from anon;
grant select, insert, update, delete on ajustements to authenticated;

-- ÉCRITURE ET ANNULATION ----------------------------------------------------------------------
-- Le planning passe par la couche d'écriture : il est annulable comme le reste.

create or replace function public.appliquer_changements(
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
  k_tables constant text[] := array[
    'workouts', 'workout_exercises', 'exercises', 'meals', 'meal_plan',
    'foot_logs', 'running_logs', 'running_plan', 'body_metrics', 'meal_logs', 'profiles',
    'grocery_items', 'grocery_list_items', 'planning'
  ];
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
    if v_id is null or v_operation is null or v_operation not in ('insert', 'update', 'delete') then
      raise exception 'Changement mal formé' using errcode = '22023';
    end if;

    if v_operation = 'delete' then
      execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table)
        into v_avant using v_id;
      if v_avant is null then
        raise exception 'Ligne introuvable dans %', v_table using errcode = 'P0002';
      end if;
      execute format('delete from public.%I where id = $1', v_table) using v_id;
      insert into change_log
        (user_id, groupe_id, table_name, row_id, operation, before_data, after_data, source, resume, applied_at)
      values
        (v_user, v_groupe, v_table, v_id, 'delete', v_avant, null, p_source, p_resume, clock_timestamp());
      continue;
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
    'grocery_items', 'grocery_list_items', 'planning'
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
