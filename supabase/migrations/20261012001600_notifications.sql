-- Notifications : le coach écrit au téléphone les jours de séance, après chaque séance (compte
-- rendu) et quand il propose d'ajuster le programme.

-- RÉGLAGES ------------------------------------------------------------------------------------
-- Ce que le compte veut recevoir, et l'heure du rappel des jours de séance (heure du téléphone).
alter table profiles
  add column notif_seance boolean not null default true,
  add column notif_rapport boolean not null default true,
  add column notif_ajustement boolean not null default true,
  add column notif_heure smallint not null default 8 check (notif_heure between 5 and 22);

-- ABONNEMENTS ---------------------------------------------------------------------------------
-- Un appareil qui a accepté les notifications : l'adresse où le navigateur les reçoit et ses deux
-- clés de chiffrement. `fuseau` est celui du téléphone, pour envoyer le rappel à son heure.
-- Un appareil passé à un autre compte change de propriétaire (même adresse).
create table push_abonnements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  fuseau text not null default 'Europe/Paris' check (char_length(fuseau) <= 64),
  created_at timestamptz not null default now()
);
create index on push_abonnements (user_id);

alter table push_abonnements enable row level security;
create policy push_abonnements_proprietaire on push_abonnements for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on push_abonnements from anon;
grant select, insert, update, delete on push_abonnements to authenticated;

-- Enregistre l'appareil pour le compte connecté, même s'il appartenait à un autre compte avant
-- (le navigateur garde la même adresse d'un compte à l'autre).
create function public.abonner_appareil(p_endpoint text, p_p256dh text, p_auth text, p_fuseau text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Session requise' using errcode = '28000';
  end if;
  insert into push_abonnements (user_id, endpoint, p256dh, auth, fuseau)
  values (v_user, p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_fuseau, ''), 'Europe/Paris'))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, fuseau = excluded.fuseau;
end;
$$;
revoke all on function public.abonner_appareil(text, text, text, text) from public, anon;
grant execute on function public.abonner_appareil(text, text, text, text) to authenticated;

-- RAPPELS ENVOYÉS -----------------------------------------------------------------------------
-- Un rappel par compte et par jour, au plus : la ligne est posée avant l'envoi, et un second
-- passage (redémarrage, deuxième serveur) la trouve déjà là. Lue et écrite par le serveur seul.
create table notifications_envoyees (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  type text not null check (type in ('seance')),
  envoyee_a timestamptz not null default now(),
  primary key (user_id, date, type)
);
alter table notifications_envoyees enable row level security;
revoke all on notifications_envoyees from anon, authenticated;
