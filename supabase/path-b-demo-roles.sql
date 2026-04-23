-- Path B: real Supabase + in-app login (Expo Go or EAS build).
-- 1) Supabase Dashboard → Authentication → Users → "Add user" (or sign up from the app).
--    Create one user per role you need, with distinct emails and known passwords.
-- 2) Run the UPDATEs below in SQL Editor (edit emails to match your users).
-- 3) Ensure `supabase/schema.sql` (or equivalent) is applied so `public.profiles` and `app_role` exist.
--
-- New users default to role `customer` via trigger `handle_new_user`. This file promotes them.

begin;

update public.profiles p
set
  role = 'admin'::public.app_role,
  full_name = coalesce(nullif(p.full_name, ''), 'Demo Admin'),
  updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = lower('demo-admin@example.com');

update public.profiles p
set
  role = 'driver'::public.app_role,
  full_name = coalesce(nullif(p.full_name, ''), 'Demo Driver'),
  updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = lower('demo-driver@example.com');

update public.profiles p
set
  role = 'restaurant'::public.app_role,
  full_name = coalesce(nullif(p.full_name, ''), 'Demo Restaurant'),
  updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = lower('demo-restaurant@example.com');

-- Optional: keep one account as customer (default) — e.g. demo-customer@example.com needs no update.

commit;

-- Verify:
-- select u.email, p.role, p.full_name from auth.users u join public.profiles p on p.id = u.id order by u.email;
