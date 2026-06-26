-- NextPlay Memory Map platform: organisations, maps, areas, pins, stories, media, tags, audit.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  type text not null default 'school'
    check (type in ('school', 'event', 'venue', 'club', 'community')),
  logo_url text,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memory_maps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  title text not null,
  slug text not null unique,
  tagline text,
  description text,
  visibility text not null default 'link_only'
    check (visibility in ('private', 'link_only', 'public')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  profile_image_url text,
  landing_background_url text,
  primary_color text not null default '#FFD400',
  primary_text_color text not null default '#050505',
  secondary_color text not null default 'transparent',
  secondary_text_color text not null default '#FFFFFF',
  accent_color text not null default '#FFD400',
  sponsor_name text,
  sponsor_logo_url text,
  sponsor_website_url text,
  sponsor_message text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_maps_org_idx on public.memory_maps (organisation_id);
create index if not exists memory_maps_slug_idx on public.memory_maps (slug);

create table if not exists public.memory_map_members (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('admin', 'moderator', 'contributor', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  relationship text,
  request_message text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (memory_map_id, user_id)
);

create index if not exists memory_map_members_map_idx on public.memory_map_members (memory_map_id);
create index if not exists memory_map_members_user_idx on public.memory_map_members (user_id);

create table if not exists public.memory_areas (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  name text not null,
  description text,
  map_type text not null check (map_type in ('geo', 'image')),
  geofence_polygon jsonb,
  centre_lat double precision,
  centre_lng double precision,
  map_image_url text,
  image_width integer,
  image_height integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_areas_map_idx on public.memory_areas (memory_map_id);

create table if not exists public.memory_categories (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  name text not null,
  description text,
  icon text,
  colour text not null default '#FFD400',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (memory_map_id, name)
);

create index if not exists memory_categories_map_idx on public.memory_categories (memory_map_id);

create table if not exists public.memory_pins (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.memory_areas (id) on delete cascade,
  category_id uuid references public.memory_categories (id) on delete set null,
  title text not null,
  description text,
  icon text,
  colour text,
  lat double precision,
  lng double precision,
  x_position double precision,
  y_position double precision,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden', 'archived', 'deleted')),
  is_official boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_pins_area_idx on public.memory_pins (area_id);
create index if not exists memory_pins_status_idx on public.memory_pins (status);

create table if not exists public.memory_stories (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.memory_pins (id) on delete cascade,
  title text not null,
  description text,
  story_type text not null default 'mixed'
    check (story_type in ('video', 'photo', 'text', 'mixed')),
  event_year integer not null,
  event_date date,
  uploaded_by uuid references auth.users (id) on delete set null,
  logged_by_display_name text,
  upload_mode text not null default 'archive_submission'
    check (upload_mode in ('current_location', 'manual_geo', 'manual_image_map', 'archive_submission')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high', 'admin_review')),
  status text not null default 'pending_review'
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'hidden', 'archived', 'deleted')),
  rejection_reason text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users (id) on delete set null,
  rejected_at timestamptz,
  moved_by uuid references auth.users (id) on delete set null,
  moved_at timestamptz,
  previous_pin_id uuid references public.memory_pins (id) on delete set null,
  deleted_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  contains_minors boolean not null default false,
  mentions_full_names boolean not null default false,
  shows_injury boolean not null default false,
  is_archive_content boolean not null default false,
  has_permission_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_stories_pin_idx on public.memory_stories (pin_id);
create index if not exists memory_stories_status_idx on public.memory_stories (status);

create table if not exists public.memory_story_media (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.memory_stories (id) on delete cascade,
  media_type text not null check (media_type in ('video', 'image')),
  file_url text not null,
  thumbnail_url text,
  file_name text,
  file_size integer,
  mime_type text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists memory_story_media_story_idx on public.memory_story_media (story_id);

create table if not exists public.memory_tags (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (memory_map_id, name)
);

create table if not exists public.memory_story_tags (
  story_id uuid not null references public.memory_stories (id) on delete cascade,
  tag_id uuid not null references public.memory_tags (id) on delete cascade,
  primary key (story_id, tag_id)
);

create table if not exists public.memory_audit_logs (
  id uuid primary key default gen_random_uuid(),
  memory_map_id uuid not null references public.memory_maps (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists memory_audit_logs_map_idx on public.memory_audit_logs (memory_map_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_memory_map_admin(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin(p_user_id)
    or exists (
      select 1
      from public.memory_map_members m
      where m.memory_map_id = p_map_id
        and m.user_id = p_user_id
        and m.status = 'approved'
        and m.role in ('admin', 'moderator')
    )
    or exists (
      select 1
      from public.memory_maps mm
      where mm.id = p_map_id
        and mm.created_by = p_user_id
    );
$$;

create or replace function public.is_memory_map_contributor(p_map_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_memory_map_admin(p_map_id, p_user_id)
    or exists (
      select 1
      from public.memory_map_members m
      where m.memory_map_id = p_map_id
        and m.user_id = p_user_id
        and m.status = 'approved'
        and m.role = 'contributor'
    );
$$;

create or replace function public.memory_map_id_for_pin(p_pin_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ma.memory_map_id
  from public.memory_pins p
  join public.memory_areas ma on ma.id = p.area_id
  where p.id = p_pin_id
  limit 1;
$$;

create or replace function public.touch_memory_map_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organisations_touch on public.organisations;
create trigger trg_organisations_touch before update on public.organisations
for each row execute function public.touch_memory_map_updated_at();

drop trigger if exists trg_memory_maps_touch on public.memory_maps;
create trigger trg_memory_maps_touch before update on public.memory_maps
for each row execute function public.touch_memory_map_updated_at();

drop trigger if exists trg_memory_areas_touch on public.memory_areas;
create trigger trg_memory_areas_touch before update on public.memory_areas
for each row execute function public.touch_memory_map_updated_at();

drop trigger if exists trg_memory_pins_touch on public.memory_pins;
create trigger trg_memory_pins_touch before update on public.memory_pins
for each row execute function public.touch_memory_map_updated_at();

drop trigger if exists trg_memory_stories_touch on public.memory_stories;
create trigger trg_memory_stories_touch before update on public.memory_stories
for each row execute function public.touch_memory_map_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.memory_maps enable row level security;
alter table public.memory_map_members enable row level security;
alter table public.memory_areas enable row level security;
alter table public.memory_categories enable row level security;
alter table public.memory_pins enable row level security;
alter table public.memory_stories enable row level security;
alter table public.memory_story_media enable row level security;
alter table public.memory_tags enable row level security;
alter table public.memory_story_tags enable row level security;
alter table public.memory_audit_logs enable row level security;

-- Public read: active maps
create policy memory_maps_public_select on public.memory_maps
for select using (
  status = 'active'
  and visibility in ('public', 'link_only')
);

create policy memory_maps_admin_all on public.memory_maps
for all using (public.is_memory_map_admin(id, auth.uid()))
with check (public.is_memory_map_admin(id, auth.uid()));

-- Areas/categories: public read when map is viewable
create policy memory_areas_public_select on public.memory_areas
for select using (
  is_active = true
  and exists (
    select 1 from public.memory_maps mm
    where mm.id = memory_map_id
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

create policy memory_areas_admin_all on public.memory_areas
for all using (public.is_memory_map_admin(memory_map_id, auth.uid()))
with check (public.is_memory_map_admin(memory_map_id, auth.uid()));

create policy memory_categories_public_select on public.memory_categories
for select using (
  is_active = true
  and exists (
    select 1 from public.memory_maps mm
    where mm.id = memory_map_id
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

create policy memory_categories_admin_all on public.memory_categories
for all using (public.is_memory_map_admin(memory_map_id, auth.uid()))
with check (public.is_memory_map_admin(memory_map_id, auth.uid()));

-- Pins: public approved only
create policy memory_pins_public_select on public.memory_pins
for select using (
  status = 'approved'
  and exists (
    select 1
    from public.memory_areas ma
    join public.memory_maps mm on mm.id = ma.memory_map_id
    where ma.id = area_id
      and ma.is_active = true
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

create policy memory_pins_admin_all on public.memory_pins
for all using (public.is_memory_map_admin(public.memory_map_id_for_pin(id), auth.uid()))
with check (public.is_memory_map_admin(public.memory_map_id_for_pin(id), auth.uid()));

-- Stories: public approved only
create policy memory_stories_public_select on public.memory_stories
for select using (
  status = 'approved'
  and exists (
    select 1
    from public.memory_pins p
    join public.memory_areas ma on ma.id = p.area_id
    join public.memory_maps mm on mm.id = ma.memory_map_id
    where p.id = pin_id
      and p.status = 'approved'
      and ma.is_active = true
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

create policy memory_stories_contributor_insert on public.memory_stories
for insert with check (
  public.is_memory_map_contributor(public.memory_map_id_for_pin(pin_id), auth.uid())
);

create policy memory_stories_admin_all on public.memory_stories
for all using (public.is_memory_map_admin(public.memory_map_id_for_pin(pin_id), auth.uid()))
with check (public.is_memory_map_admin(public.memory_map_id_for_pin(pin_id), auth.uid()));

-- Media follows story visibility
create policy memory_story_media_public_select on public.memory_story_media
for select using (
  exists (
    select 1 from public.memory_stories s where s.id = story_id and s.status = 'approved'
  )
);

create policy memory_story_media_admin_all on public.memory_story_media
for all using (
  public.is_memory_map_admin(public.memory_map_id_for_pin(
    (select pin_id from public.memory_stories where id = story_id)
  ), auth.uid())
);

-- Members
create policy memory_map_members_self_select on public.memory_map_members
for select using (user_id = auth.uid() or public.is_memory_map_admin(memory_map_id, auth.uid()));

create policy memory_map_members_self_insert on public.memory_map_members
for insert with check (user_id = auth.uid());

create policy memory_map_members_admin_update on public.memory_map_members
for update using (public.is_memory_map_admin(memory_map_id, auth.uid()));

-- Tags
create policy memory_tags_public_select on public.memory_tags
for select using (
  exists (
    select 1 from public.memory_maps mm
    where mm.id = memory_map_id
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

create policy memory_tags_admin_all on public.memory_tags
for all using (public.is_memory_map_admin(memory_map_id, auth.uid()))
with check (public.is_memory_map_admin(memory_map_id, auth.uid()));

create policy memory_story_tags_public_select on public.memory_story_tags
for select using (
  exists (select 1 from public.memory_stories s where s.id = story_id and s.status = 'approved')
);

-- Audit: admin only
create policy memory_audit_logs_admin_select on public.memory_audit_logs
for select using (public.is_memory_map_admin(memory_map_id, auth.uid()));

create policy memory_audit_logs_admin_insert on public.memory_audit_logs
for insert with check (public.is_memory_map_admin(memory_map_id, auth.uid()));

-- Organisations: public read for active maps
create policy organisations_public_select on public.organisations
for select using (
  exists (
    select 1 from public.memory_maps mm
    where mm.organisation_id = organisations.id
      and mm.status = 'active'
      and mm.visibility in ('public', 'link_only')
  )
);

revoke all on public.organisations, public.memory_maps, public.memory_map_members,
  public.memory_areas, public.memory_categories, public.memory_pins, public.memory_stories,
  public.memory_story_media, public.memory_tags, public.memory_story_tags, public.memory_audit_logs
  from anon, authenticated;

grant select on public.organisations, public.memory_maps, public.memory_areas,
  public.memory_categories, public.memory_pins, public.memory_stories, public.memory_story_media,
  public.memory_tags, public.memory_story_tags
  to anon, authenticated;

grant select, insert, update, delete on public.organisations, public.memory_maps,
  public.memory_map_members, public.memory_areas, public.memory_categories, public.memory_pins,
  public.memory_stories, public.memory_story_media, public.memory_tags, public.memory_story_tags,
  public.memory_audit_logs
  to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('memory-map-branding', 'memory-map-branding', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('memory-map-backgrounds', 'memory-map-backgrounds', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('memory-map-sponsors', 'memory-map-sponsors', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('memory-map-area-maps', 'memory-map-area-maps', true, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('memory-map-story-media', 'memory-map-story-media', true, 262144000, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy memory_map_branding_read on storage.objects for select
using (bucket_id in ('memory-map-branding', 'memory-map-backgrounds', 'memory-map-sponsors', 'memory-map-area-maps', 'memory-map-story-media'));

create policy memory_map_branding_admin_write on storage.objects for insert
with check (
  bucket_id in ('memory-map-branding', 'memory-map-backgrounds', 'memory-map-sponsors', 'memory-map-area-maps')
  and auth.uid() is not null
);

create policy memory_map_story_media_write on storage.objects for insert
with check (bucket_id = 'memory-map-story-media' and auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Demo seed (Boishaai)
-- ---------------------------------------------------------------------------

insert into public.organisations (id, name, slug, type, description)
values (
  'a1000000-0000-4000-8000-000000000001',
  'Boishaai',
  'boishaai',
  'school',
  'Boishaai — demo organisation for NextPlay Memory Map.'
)
on conflict (slug) do nothing;

insert into public.memory_maps (
  id, organisation_id, title, slug, tagline, description,
  visibility, status, primary_color, accent_color,
  sponsor_name, sponsor_message
)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Boishaai Memory Map',
  'boishaai',
  'Every place has a story.',
  'A living archive of Boishaai rugby, hostel life, hall events and school history.',
  'link_only',
  'active',
  '#FFD400',
  '#FFD400',
  'Standard Bank',
  'Proudly supporting school sport and heritage.'
)
on conflict (slug) do nothing;

-- Categories
insert into public.memory_categories (id, memory_map_id, name, colour, icon, sort_order) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Sport', '#A855F7', 'trophy', 1),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'History', '#3B82F6', 'landmark', 2),
  ('a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Hostel', '#22C55E', 'home', 3),
  ('a3000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'Interviews', '#EF4444', 'mic', 4),
  ('a3000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'Events', '#F97316', 'calendar', 5),
  ('a3000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000001', 'Archive', '#9CA3AF', 'archive', 6)
on conflict (memory_map_id, name) do nothing;

-- Areas
insert into public.memory_areas (id, memory_map_id, name, map_type, centre_lat, centre_lng, sort_order) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Main Campus', 'geo', -33.9249, 18.4241, 1),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Main Rugby Field', 'geo', -33.9255, 18.4250, 2),
  ('a4000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Hostel', 'image', null, null, 3),
  ('a4000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'School Hall', 'image', null, null, 4),
  ('a4000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'Off-site Fields', 'geo', -33.9300, 18.4300, 5)
on conflict (id) do nothing;

-- Pins
insert into public.memory_pins (id, area_id, category_id, title, description, lat, lng, x_position, y_position, status, colour) values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'Scoreboard Corner', 'Where unforgettable tries were celebrated.', -33.9256, 18.4252, null, null, 'approved', '#A855F7'),
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'Pavilion Steps', 'Old boys gather here after big matches.', -33.9253, 18.4248, null, null, 'approved', '#3B82F6'),
  ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'Main Field Tunnel', 'The walk from the changeroom to the field.', -33.9254, 18.4251, null, null, 'approved', '#A855F7'),
  ('a5000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'Hostel Dining Hall', 'Meals, war cries and lifelong friendships.', null, null, 42, 58, 'approved', '#22C55E'),
  ('a5000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000005', 'School Hall Stage', 'Assemblies, concerts and prize giving.', null, null, 55, 35, 'approved', '#F97316')
on conflict (id) do nothing;

-- Stories
insert into public.memory_stories (id, pin_id, title, description, story_type, event_year, logged_by_display_name, upload_mode, risk_level, status) values
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'Winning try vs Grey', 'The moment the crowd erupted in 2025.', 'video', 2025, 'Media Team', 'current_location', 'low', 'approved'),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 'Old boys remember the pavilion', 'Reunion stories from the class of 2018.', 'mixed', 2018, 'Old Boys Committee', 'archive_submission', 'low', 'approved'),
  ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000001', 'First XV reunion story', 'Photos and memories from 1998.', 'mixed', 1998, 'Archive Team', 'archive_submission', 'low', 'approved'),
  ('a6000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000004', 'Hostel life in 2001', 'A day in the hostel dining hall.', 'mixed', 2001, 'Parent Contributor', 'manual_image_map', 'medium', 'pending_review'),
  ('a6000000-0000-4000-8000-000000000005', 'a5000000-0000-4000-8000-000000000004', 'Hostel war cry', 'The legendary hostel war cry on derby day.', 'video', 1998, 'Old Boy', 'archive_submission', 'low', 'approved'),
  ('a6000000-0000-4000-8000-000000000006', 'a5000000-0000-4000-8000-000000000002', 'Founders Day Parade', 'Marching onto the pavilion steps.', 'photo', 2024, 'Teacher', 'manual_geo', 'low', 'pending_review')
on conflict (id) do nothing;

insert into public.memory_tags (id, memory_map_id, name) values
  ('a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'rugby'),
  ('a7000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'hostel'),
  ('a7000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'reunion')
on conflict (memory_map_id, name) do nothing;

insert into public.memory_story_tags (story_id, tag_id) values
  ('a6000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000003')
on conflict do nothing;

revoke all on function public.is_memory_map_admin(uuid, uuid) from public;
revoke all on function public.is_memory_map_contributor(uuid, uuid) from public;
revoke all on function public.memory_map_id_for_pin(uuid) from public;
grant execute on function public.is_memory_map_admin(uuid, uuid) to authenticated;
grant execute on function public.is_memory_map_contributor(uuid, uuid) to authenticated;
grant execute on function public.memory_map_id_for_pin(uuid) to authenticated;
