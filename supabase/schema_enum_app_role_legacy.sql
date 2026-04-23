-- One-time helper for databases that already have `public.app_role` but only older labels
-- (e.g. 'customer', 'admin') and are missing 'driver' / 'restaurant'.
--
-- Run this script **by itself** in the Supabase SQL Editor and let it finish, then run
-- `schema.sql`. Do not paste this and the full schema into one run if your platform wraps
-- multiple statements in a single transaction together with enum casts to new labels.
--
-- If `app_role` was never created, skip this file; `schema.sql` creates the enum with all values.

alter type public.app_role add value if not exists 'driver';
alter type public.app_role add value if not exists 'restaurant';
