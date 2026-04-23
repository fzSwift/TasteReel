-- Run in Supabase SQL Editor if you already applied an older schema.sql without this RPC.
-- Lets signed-in customers bump like_count by +1 or -1 (RLS blocks direct UPDATE on restaurants).

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

grant execute on function public.adjust_restaurant_like_count(uuid, integer) to authenticated;
