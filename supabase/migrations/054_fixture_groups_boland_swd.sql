-- Canonical province groups for Boland and South Western Districts (Teams tab / team provinces + pool logic).

insert into public.fixture_groups (name, slug, group_type, is_active)
values
  ('Boland', 'boland', 'province', true),
  ('South Western Districts', 'south-western-districts', 'province', true)
on conflict (slug) do update
set name = excluded.name,
    group_type = excluded.group_type,
    is_active = excluded.is_active;

do $$
declare
  v_bl uuid;
  v_swd uuid;
begin
  select id into v_bl from public.fixture_groups where slug = 'boland' limit 1;
  select id into v_swd from public.fixture_groups where slug = 'south-western-districts' limit 1;

  if v_bl is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('BL', v_bl)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;

  if v_swd is not null then
    insert into public.fixture_group_aliases (alias, group_id) values ('SWD', v_swd)
    on conflict (alias) do update set group_id = excluded.group_id;
  end if;
end $$;
