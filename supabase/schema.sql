-- TasteReel full idempotent schema (safe to re-run)
--
-- Enum note: do NOT use `ALTER TYPE ... ADD VALUE` in the same execution as CHECK/RLS that
-- cast to the new labels (PostgreSQL 55P04). We create `app_role` with all values when missing.
-- If your database already has `app_role` without `driver`/`restaurant`, run
-- `supabase/schema_enum_app_role_legacy.sql` alone first, then run this file.
--
-- Includes:
-- 1) Core tables (restaurants, menu_items)
-- 2) Auth-ready signup/login support via profiles + trigger
-- 3) RLS policies for public read + owner/admin writes
-- 4) Storage bucket + policies for menu videos

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('customer', 'driver', 'restaurant', 'admin');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'customer',
  location_source text not null default 'none',
  last_latitude double precision,
  last_longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  cuisine text,
  address text,
  latitude double precision,
  longitude double precision,
  weekly_votes integer not null default 0,
  recommended_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10, 2) not null default 0,
  video_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.order_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references public.profiles(id) on delete set null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_latitude double precision,
  customer_longitude double precision,
  status text not null default 'pending',
  total_amount numeric(10, 2) not null default 0,
  qr_code text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role public.app_role not null default 'customer';
alter table public.profiles add column if not exists location_source text not null default 'none';
alter table public.profiles add column if not exists last_latitude double precision;
alter table public.profiles add column if not exists last_longitude double precision;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.restaurants add column if not exists owner_user_id uuid references public.profiles(id) on delete set null;
alter table public.restaurants add column if not exists name text;
alter table public.restaurants add column if not exists cuisine text;
alter table public.restaurants add column if not exists address text;
alter table public.restaurants add column if not exists latitude double precision;
alter table public.restaurants add column if not exists longitude double precision;
alter table public.restaurants add column if not exists weekly_votes integer not null default 0;
alter table public.restaurants add column if not exists recommended_flag boolean not null default false;
alter table public.restaurants add column if not exists like_count integer not null default 0;
alter table public.restaurants add column if not exists created_at timestamptz not null default now();
alter table public.restaurants add column if not exists moderation_status text not null default 'pending';
alter table public.restaurants add column if not exists report_count integer not null default 0;

alter table public.restaurants drop constraint if exists restaurants_moderation_status_check;
alter table public.restaurants add constraint restaurants_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'frozen'));

-- One venue per operator account (NULL owner kept for seeded / legacy rows).
drop index if exists public.restaurants_one_row_per_owner;
create unique index restaurants_one_row_per_owner
  on public.restaurants (owner_user_id)
  where owner_user_id is not null;

alter table public.menu_items add column if not exists title text;
alter table public.menu_items add column if not exists description text;
alter table public.menu_items add column if not exists price numeric(10, 2) not null default 0;
alter table public.menu_items add column if not exists video_url text;
alter table public.menu_items add column if not exists is_available boolean not null default true;
alter table public.menu_items add column if not exists created_at timestamptz not null default now();

alter table public.order_tickets add column if not exists customer_user_id uuid references public.profiles(id) on delete set null;
alter table public.order_tickets add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
alter table public.order_tickets add column if not exists customer_latitude double precision;
alter table public.order_tickets add column if not exists customer_longitude double precision;
alter table public.order_tickets add column if not exists status text not null default 'pending';
alter table public.order_tickets add column if not exists total_amount numeric(10, 2) not null default 0;
alter table public.order_tickets add column if not exists qr_code text;
alter table public.order_tickets add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.order_tickets add column if not exists created_at timestamptz not null default now();

alter table public.order_tickets drop constraint if exists order_tickets_status_check;
alter table public.order_tickets add constraint order_tickets_status_check
  check (
    status = any (
      array['pending', 'accepted', 'driver_accepted', 'picked_up', 'completed']::text[]
    )
  );

create table if not exists public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role public.app_role not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

alter table public.profile_change_requests add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_change_requests add column if not exists requested_role public.app_role;
alter table public.profile_change_requests add column if not exists status text not null default 'pending';
alter table public.profile_change_requests add column if not exists created_at timestamptz not null default now();
alter table public.profile_change_requests add column if not exists resolved_at timestamptz;
alter table public.profile_change_requests add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

alter table public.profile_change_requests drop constraint if exists profile_change_requests_status_check;
alter table public.profile_change_requests add constraint profile_change_requests_status_check
  check (status in ('pending', 'approved', 'rejected'));

alter table public.profile_change_requests drop constraint if exists profile_change_requests_role_check;
alter table public.profile_change_requests add constraint profile_change_requests_role_check
  check ((requested_role)::text in ('driver', 'restaurant'));

alter table public.profiles drop constraint if exists profiles_location_source_check;
alter table public.profiles add constraint profiles_location_source_check
  check (location_source in ('none', 'gps', 'manual'));

create unique index if not exists profile_change_requests_one_pending_per_user
  on public.profile_change_requests (user_id)
  where (status = 'pending');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'
  )
  on conflict (id) do update
    set updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop function if exists public.increment_weekly_vote(uuid);

create or replace function public.increment_weekly_vote(restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurants
  set weekly_votes = weekly_votes + 1
  where id = restaurant_id;
end;
$$;

drop function if exists public.increment_restaurant_report(uuid);

create or replace function public.increment_restaurant_report(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and (p.role)::text = 'customer'
  ) then
    return;
  end if;
  update public.restaurants
  set report_count = report_count + 1
  where id = target_id;
end;
$$;

-- Customers cannot UPDATE restaurants directly (RLS). Use this RPC for like/unlike (+1 / -1).
drop function if exists public.adjust_restaurant_like_count(uuid, integer);

create or replace function public.adjust_restaurant_like_count(target_id uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and (p.role)::text = 'customer'
  ) then
    return;
  end if;
  if p_delta is null or p_delta not in (-1, 1) then
    return;
  end if;
  update public.restaurants
  set like_count = greatest(0, like_count + p_delta)
  where id = target_id
    and moderation_status = 'approved';
end;
$$;

-- Do not DROP is_admin: policies depend on it (2BP01).
create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = user_id and p.role = 'admin'
  );
$$;

-- Used in RLS: restaurant-role accounts only see their own venue/menus, not the public catalog.
create or replace function public.auth_is_restaurant_role()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role)::text = 'restaurant'
  );
$$;

drop function if exists public.admin_resolve_profile_change_request(uuid, text);

create or replace function public.admin_resolve_profile_change_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.profile_change_requests%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_action is null or lower(trim(p_action)) not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;

  select * into strict r
  from public.profile_change_requests
  where id = p_request_id
  for update;

  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;

  if lower(trim(p_action)) = 'approve' then
    update public.profiles
    set role = r.requested_role, updated_at = now()
    where id = r.user_id;
  end if;

  update public.profile_change_requests
  set
    status = case when lower(trim(p_action)) = 'approve' then 'approved' else 'rejected' end,
    resolved_at = now(),
    resolved_by = auth.uid()
  where id = p_request_id;

  return jsonb_build_object('ok', true);
exception
  when no_data_found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
end;
$$;

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.order_tickets enable row level security;

drop policy if exists "Profile read own" on public.profiles;
create policy "Profile read own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "Profile update own" on public.profiles;
create policy "Profile update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin(auth.uid()))
  with check (auth.uid() = id or public.is_admin(auth.uid()));

-- Lets the client create a missing row (e.g. user existed before the auth trigger); required for order_tickets FK.
drop policy if exists "Profile insert own" on public.profiles;
create policy "Profile insert own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "Anyone can read restaurants" on public.restaurants;
drop policy if exists "restaurants_select_scope" on public.restaurants;
create policy "restaurants_select_scope"
  on public.restaurants for select
  using (
    public.is_admin(auth.uid())
    or owner_user_id = auth.uid()
    or (
      not public.auth_is_restaurant_role()
      and moderation_status = 'approved'
    )
  );

drop policy if exists "Owner can insert restaurants" on public.restaurants;
drop policy if exists "Restaurant role can insert own venue" on public.restaurants;
create policy "Restaurant role can insert own venue"
  on public.restaurants for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (
      owner_user_id = auth.uid()
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and (p.role)::text = 'restaurant'
      )
    )
  );

drop policy if exists "Owner can update restaurants" on public.restaurants;
create policy "Owner can update restaurants"
  on public.restaurants for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Owner can delete restaurants" on public.restaurants;
create policy "Owner can delete restaurants"
  on public.restaurants for delete
  to authenticated
  using (owner_user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Anyone can read menu items" on public.menu_items;
drop policy if exists "menu_items_select_scope" on public.menu_items;
create policy "menu_items_select_scope"
  on public.menu_items for select
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.restaurants r
      where r.id = menu_items.restaurant_id
        and r.owner_user_id is not null
        and r.owner_user_id = auth.uid()
    )
    or (
      not public.auth_is_restaurant_role()
      and exists (
        select 1 from public.restaurants r
        where r.id = menu_items.restaurant_id
          and r.moderation_status = 'approved'
      )
    )
  );

drop policy if exists "Owner can insert menu items" on public.menu_items;
create policy "Owner can insert menu items"
  on public.menu_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_items.restaurant_id
        and (r.owner_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists "Owner can update menu items" on public.menu_items;
create policy "Owner can update menu items"
  on public.menu_items for update
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_items.restaurant_id
        and (r.owner_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_items.restaurant_id
        and (r.owner_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists "Owner can delete menu items" on public.menu_items;
create policy "Owner can delete menu items"
  on public.menu_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_items.restaurant_id
        and (r.owner_user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists "Customer can create tickets" on public.order_tickets;
create policy "Customer can create tickets"
  on public.order_tickets for insert
  to authenticated
  with check (customer_user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Users can read own tickets" on public.order_tickets;
drop policy if exists "order_tickets_select_visible" on public.order_tickets;
create policy "order_tickets_select_visible"
  on public.order_tickets for select
  to authenticated
  using (
    customer_user_id = auth.uid()
    or public.is_admin(auth.uid())
    or exists (
      select 1
      from public.restaurants r
      where r.id = order_tickets.restaurant_id
        and r.owner_user_id is not null
        and r.owner_user_id = auth.uid()
    )
    or (
      exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role)::text = 'driver')
      and status in ('accepted', 'driver_accepted', 'picked_up')
    )
  );

drop policy if exists "Admins can update tickets" on public.order_tickets;
drop policy if exists "Admin updates any ticket" on public.order_tickets;
drop policy if exists "Restaurant updates venue tickets" on public.order_tickets;
drop policy if exists "Driver updates delivery tickets" on public.order_tickets;

create policy "Admin updates any ticket"
  on public.order_tickets for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "Restaurant updates venue tickets"
  on public.order_tickets for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = order_tickets.restaurant_id
        and r.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = order_tickets.restaurant_id
        and r.owner_user_id = auth.uid()
    )
  );

create policy "Driver updates delivery tickets"
  on public.order_tickets for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role)::text = 'driver')
    and status in ('accepted', 'driver_accepted')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role)::text = 'driver')
  );

alter table public.profile_change_requests enable row level security;

drop policy if exists "profile_change_requests_select_own_or_admin" on public.profile_change_requests;
create policy "profile_change_requests_select_own_or_admin"
  on public.profile_change_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profile_change_requests_insert_own_pending_customer" on public.profile_change_requests;
create policy "profile_change_requests_insert_own_pending_customer"
  on public.profile_change_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and (requested_role)::text in ('driver', 'restaurant')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'customer'
    )
  );

grant usage on schema public to anon, authenticated;
-- Public read for listings; authenticated also needs DML so RLS can allow owner/admin writes.
grant select on table public.restaurants to anon, authenticated;
grant select, insert, update, delete on table public.restaurants to authenticated;
grant select on table public.menu_items to anon, authenticated;
grant select, insert, update, delete on table public.menu_items to authenticated;
grant select, insert, update on table public.order_tickets to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert on table public.profile_change_requests to authenticated;
grant execute on function public.increment_weekly_vote(uuid) to anon, authenticated;
grant execute on function public.increment_restaurant_report(uuid) to authenticated;
grant execute on function public.adjust_restaurant_like_count(uuid, integer) to authenticated;
grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.auth_is_restaurant_role() to anon, authenticated;
grant execute on function public.admin_resolve_profile_change_request(uuid, text) to authenticated;

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
-- Native video players do not send Supabase cookies; explicit anon/authenticated SELECT is reliable.
create policy "Public read menu videos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-videos');

drop policy if exists "Authenticated upload menu videos" on storage.objects;
create policy "Authenticated upload menu videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated update own menu videos" on storage.objects;
create policy "Authenticated update own menu videos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'menu-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated delete own menu videos" on storage.objects;
create policy "Authenticated delete own menu videos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into public.restaurants (
  owner_user_id,
  name,
  cuisine,
  address,
  latitude,
  longitude,
  weekly_votes,
  recommended_flag,
  like_count,
  moderation_status,
  report_count
)
select * from (values
  (null::uuid, 'Lagos Grill House', 'African BBQ', '12 Marina Road', 6.4541, 3.3947, 12, true, 0, 'approved'::text, 0),
  (null::uuid, 'Roma Bites', 'Italian', '44 Palm Street', 6.4474, 3.3903, 9, true, 0, 'approved'::text, 0),
  (null::uuid, 'Tokyo Bowl', 'Japanese', '7 Glover Close', 6.4418, 3.4132, 4, false, 0, 'approved'::text, 0)
) as v(
  owner_user_id,
  name,
  cuisine,
  address,
  latitude,
  longitude,
  weekly_votes,
  recommended_flag,
  like_count,
  moderation_status,
  report_count
)
where not exists (select 1 from public.restaurants);

-- Existing rows (before this column existed) stay pending; keep demo venues orderable.
update public.restaurants
set moderation_status = 'approved', report_count = coalesce(report_count, 0)
where name in ('Lagos Grill House', 'Roma Bites', 'Tokyo Bowl');

insert into public.menu_items (restaurant_id, title, description, price, video_url)
select r.id, d.title, d.description, d.price::numeric, d.video_url
from public.restaurants r
join (values
  ('Lagos Grill House', 'Smoky Chicken Platter', 'Charcoal grilled chicken with spicy house sauce.', '18.50', 'https://cdn.coverr.co/videos/coverr-a-chef-cutting-carrots-1579/1080p.mp4'),
  ('Roma Bites', 'Truffle Pasta', 'Creamy truffle linguine with parmesan.', '22.00', 'https://cdn.coverr.co/videos/coverr-pasta-with-sauce-1574/1080p.mp4'),
  ('Tokyo Bowl', 'Salmon Rice Bowl', 'Seared salmon on sushi rice with sesame dressing.', '20.00', 'https://cdn.coverr.co/videos/coverr-serving-a-bowl-of-food-7470/1080p.mp4')
) as d(restaurant_name, title, description, price, video_url)
  on r.name = d.restaurant_name
where not exists (
  select 1 from public.menu_items mi where mi.restaurant_id = r.id
);
