-- Public bucket for Predict a Score profile avatars (path: {user_uuid}/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prediction-avatars',
  'prediction-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage: anyone can read public objects in this bucket
create policy "prediction_avatars_select_public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'prediction-avatars');

-- First path segment must equal auth user id
create policy "prediction_avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'prediction-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "prediction_avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'prediction-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'prediction-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "prediction_avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'prediction-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Match comments: see migration 007_game_match_comments.sql
