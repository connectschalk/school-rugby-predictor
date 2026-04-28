create table if not exists public.fixture_group_aliases (
  alias text primary key,
  group_id uuid not null references public.fixture_groups (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists fixture_group_aliases_alias_lower_idx
on public.fixture_group_aliases (lower(alias));

alter table public.fixture_group_aliases enable row level security;

drop policy if exists fixture_group_aliases_select_public on public.fixture_group_aliases;
create policy fixture_group_aliases_select_public
on public.fixture_group_aliases for select
using (true);

drop policy if exists fixture_group_aliases_insert_admin on public.fixture_group_aliases;
create policy fixture_group_aliases_insert_admin
on public.fixture_group_aliases for insert
with check (public.is_app_admin(auth.uid()));

drop policy if exists fixture_group_aliases_update_admin on public.fixture_group_aliases;
create policy fixture_group_aliases_update_admin
on public.fixture_group_aliases for update
using (public.is_app_admin(auth.uid()))
with check (public.is_app_admin(auth.uid()));

drop policy if exists fixture_group_aliases_delete_admin on public.fixture_group_aliases;
create policy fixture_group_aliases_delete_admin
on public.fixture_group_aliases for delete
using (public.is_app_admin(auth.uid()));

create or replace function public.resolve_fixture_group_alias(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_slug text;
  v_group_id uuid;
begin
  if v_name = '' then
    return null;
  end if;

  -- Exact canonical name/slug first.
  select fg.id into v_group_id
  from public.fixture_groups fg
  where lower(fg.name) = lower(v_name)
     or fg.slug = public.slugify_group_name(v_name)
  order by fg.created_at asc
  limit 1;

  if v_group_id is not null then
    return v_group_id;
  end if;

  -- Alias mapping.
  select fga.group_id into v_group_id
  from public.fixture_group_aliases fga
  where lower(fga.alias) = lower(v_name)
  limit 1;

  return v_group_id;
end;
$$;

do $$
declare
  v_wp uuid;
  v_ep uuid;
  v_fs uuid;
  v_gp uuid;
  v_kzn uuid;
begin
  -- Canonical targets.
  select id into v_wp from public.fixture_groups where slug = 'western-province' limit 1;
  select id into v_ep from public.fixture_groups where slug = 'eastern-cape' limit 1;
  select id into v_fs from public.fixture_groups where slug in ('free-state-griquas', 'free-state-griquas') order by created_at asc limit 1;
  select id into v_gp from public.fixture_groups where slug in ('noordvaal', 'gauteng-noordvaal', 'gauteng') order by created_at asc limit 1;
  select id into v_kzn from public.fixture_groups where slug = 'kwazulu-natal' limit 1;

  if v_wp is not null then
    insert into public.fixture_group_aliases(alias, group_id) values ('WP', v_wp)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_ep is not null then
    insert into public.fixture_group_aliases(alias, group_id) values ('EP', v_ep)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_fs is not null then
    insert into public.fixture_group_aliases(alias, group_id) values ('FS', v_fs)
    on conflict (alias) do update set group_id = excluded.group_id;
    insert into public.fixture_group_aliases(alias, group_id) values ('NC', v_fs)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_gp is not null then
    insert into public.fixture_group_aliases(alias, group_id) values ('GP', v_gp)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_kzn is not null then
    insert into public.fixture_group_aliases(alias, group_id) values ('KZN', v_kzn)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;

  -- Hide/deactivate short-code duplicates from pool selection.
  update public.fixture_groups
  set is_active = false,
      visible_in_pools = false
  where slug in ('wp', 'ep', 'fs', 'gp', 'kzn', 'nc');
end $$;

revoke all on function public.resolve_fixture_group_alias(text) from public;
grant execute on function public.resolve_fixture_group_alias(text) to authenticated;
grant select on public.fixture_group_aliases to anon, authenticated;
