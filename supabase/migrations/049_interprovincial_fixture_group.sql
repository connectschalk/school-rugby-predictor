-- Canonical "Interprovincial" fixture group + aliases for cross-province / festival fixtures.

insert into public.fixture_groups (name, slug, group_type, is_active)
values ('Interprovincial', 'interprovincial', 'custom', true)
on conflict (slug) do update
set
  name = excluded.name,
  group_type = excluded.group_type,
  is_active = excluded.is_active;

insert into public.fixture_group_aliases (alias, group_id)
select v.alias, fg.id
from public.fixture_groups fg
cross join (
  values
    ('Interprovincial'),
    ('Cross Province'),
    ('Cross-Province'),
    ('Invitational'),
    ('Festival')
) as v(alias)
where fg.slug = 'interprovincial'
on conflict (alias) do update
set group_id = excluded.group_id;
