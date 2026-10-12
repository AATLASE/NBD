-- Quota de demandes IA, et tables de courses ouvertes à la couche d'écriture (phase 6).

-- QUOTA ---------------------------------------------------------------------------------
-- Par défaut, un compte a droit à 2 demandes IA par mois civil. Une ligne dans quotas_ia change
-- cette limite pour un compte : un nombre plus grand (futur abonnement), ou vide pour illimité.
-- Aucune des deux tables n'est inscriptible depuis l'application : seules les fonctions
-- ci-dessous y écrivent. Un compte ne peut donc ni effacer ses demandes ni relever sa limite.

-- Les fonctions internes vivent dans ce schéma, hors de portée de l'API. Le seed le crée aussi,
-- mais il passe après les migrations.
create schema if not exists private;

create table quotas_ia (
  user_id uuid primary key references auth.users on delete cascade,
  demandes_par_mois int check (demandes_par_mois >= 0)   -- vide = illimité
);

create table demandes_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('sport', 'nutrition')),
  created_at timestamptz not null default now()
);
create index on demandes_ia (user_id, created_at);

alter table quotas_ia enable row level security;
alter table demandes_ia enable row level security;
create policy quotas_ia_lecture on quotas_ia for select to authenticated
  using (user_id = (select auth.uid()));
create policy demandes_ia_lecture on demandes_ia for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on quotas_ia, demandes_ia from anon, authenticated;
grant select on quotas_ia, demandes_ia to authenticated;

-- Limite du compte connecté : vide = illimité.
create function private.limite_ia(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from quotas_ia where user_id = p_user)
      then (select demandes_par_mois from quotas_ia where user_id = p_user)
    else 2
  end;
$$;

-- Réserve une demande avant d'appeler le modèle. Renvoie son identifiant, ou rien si le quota du
-- mois est atteint. Le verrou par compte empêche deux demandes simultanées de passer ensemble
-- sous la limite.
create function public.reserver_demande_ia(p_type text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_limite int;
  v_utilisees int;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  v_limite := private.limite_ia(v_user);
  select count(*) into v_utilisees
  from demandes_ia
  where user_id = v_user and created_at >= date_trunc('month', now());

  if v_limite is not null and v_utilisees >= v_limite then
    return null;
  end if;

  insert into demandes_ia (user_id, type) values (v_user, p_type) returning id into v_id;
  return v_id;
end;
$$;

-- Rend une demande qui n'a rien produit (erreur du modèle, refus, réponse coupée).
-- Limité aux demandes toutes récentes : ce n'est pas un moyen de remettre son compteur à zéro.
create function public.rendre_demande_ia(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from demandes_ia
  where id = p_id and user_id = auth.uid() and created_at > now() - interval '15 minutes';
$$;

-- Où en est le compte connecté ce mois-ci. `limite` vide = illimité.
create function public.etat_demandes_ia()
returns table (utilisees int, limite int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::int from demandes_ia
     where user_id = auth.uid() and created_at >= date_trunc('month', now())),
    private.limite_ia(auth.uid());
$$;

revoke all on function private.limite_ia(uuid) from public;
revoke all on function public.reserver_demande_ia(text) from public, anon;
revoke all on function public.rendre_demande_ia(uuid) from public, anon;
revoke all on function public.etat_demandes_ia() from public, anon;
grant execute on function public.reserver_demande_ia(text) to authenticated;
grant execute on function public.rendre_demande_ia(uuid) to authenticated;
grant execute on function public.etat_demandes_ia() to authenticated;

-- COURSES -------------------------------------------------------------------------------
-- La liste de courses et le catalogue de produits passent par la couche d'écriture.

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
    'grocery_items', 'grocery_list_items'
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
    'workouts', 'workout_exercises', 'exercises', 'meals', 'meal_plan', 'workout_logs',
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
