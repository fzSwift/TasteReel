-- Run this in the Supabase Dashboard → SQL → New query.
-- Safe to re-run: idempotent bucket upsert + policy replace.
--
-- After this, in Dashboard → Storage → menu-videos → Configuration,
-- confirm "Public bucket" is enabled (this script sets public = true).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-videos',
  'menu-videos',
  true,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read menu videos" on storage.objects;

create policy "Public read menu videos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-videos');
