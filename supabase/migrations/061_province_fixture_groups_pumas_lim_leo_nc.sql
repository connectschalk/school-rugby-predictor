-- Province groups + Teams.province codes (PUM, LIM, LEO, NC).
-- Gauteng / Blue Bulls as their own province rows (GP / BUL); Noordvaal hidden in app picker.
-- Re-point NC alias to Northern Cape. Point GP / BUL at gauteng / blue-bulls.

alter table public.teams add column if not exists province text;

insert into public.fixture_groups (name, slug, group_type, is_active, visible_in_pools)
values
  ('Northern Cape', 'northern-cape', 'province', true, true),
  ('Pumas', 'pumas', 'province', true, true),
  ('Limpopo', 'limpopo', 'province', true, true),
  ('Leopards', 'leopards', 'province', true, true),
  ('Gauteng', 'gauteng', 'province', true, true),
  ('Blue Bulls', 'blue-bulls', 'province', true, true)
on conflict (slug) do update
set
  name = excluded.name,
  group_type = excluded.group_type,
  is_active = true,
  visible_in_pools = true;

do $$
declare
  v_nc uuid;
  v_pum uuid;
  v_lim uuid;
  v_leo uuid;
  v_gp uuid;
  v_bul uuid;
begin
  select id into v_nc from public.fixture_groups where slug = 'northern-cape' limit 1;
  select id into v_pum from public.fixture_groups where slug = 'pumas' limit 1;
  select id into v_lim from public.fixture_groups where slug = 'limpopo' limit 1;
  select id into v_leo from public.fixture_groups where slug = 'leopards' limit 1;
  select id into v_gp from public.fixture_groups where slug = 'gauteng' limit 1;
  select id into v_bul from public.fixture_groups where slug = 'blue-bulls' limit 1;

  if v_nc is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('NC', v_nc)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_pum is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('PUM', v_pum)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_lim is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('LIM', v_lim)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_leo is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('LEO', v_leo)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_gp is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('GP', v_gp)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
  if v_bul is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('BUL', v_bul)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
end $$;
