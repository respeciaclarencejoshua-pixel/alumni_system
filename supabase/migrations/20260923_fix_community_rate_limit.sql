-- Fix missing sender_id/reporter_id fields on community inserts.
-- Run this entire file in the Supabase SQL Editor. Existing triggers stay attached.
begin;
create or replace function public.enforce_community_rate_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare recent_count integer; actor uuid; maximum integer; window_start timestamptz;
begin
  -- Use separate statements: each trigger row only has its own table's fields.
  if tg_table_name in ('feed_posts', 'feed_comments') then
    actor := new.user_id;
  elsif tg_table_name = 'direct_messages' then
    actor := new.sender_id;
  elsif tg_table_name = 'content_reports' then
    actor := new.reporter_id;
  else
    raise exception 'Unsupported community table: %', tg_table_name;
  end if;
  if actor is null or actor is distinct from auth.uid() then raise exception 'Invalid actor.'; end if;
  if tg_table_name='feed_posts' then maximum:=10;window_start:=now()-interval '5 minutes';select count(*) into recent_count from public.feed_posts where user_id=actor and created_at>=window_start;
  elsif tg_table_name='feed_comments' then maximum:=30;window_start:=now()-interval '5 minutes';select count(*) into recent_count from public.feed_comments where user_id=actor and created_at>=window_start;
  elsif tg_table_name='direct_messages' then maximum:=60;window_start:=now()-interval '1 minute';select count(*) into recent_count from public.direct_messages where sender_id=actor and created_at>=window_start;
  else maximum:=5;window_start:=now()-interval '1 hour';select count(*) into recent_count from public.content_reports where reporter_id=actor and created_at>=window_start; end if;
  if recent_count>=maximum then raise exception 'Please wait before trying this action again.'; end if; return new;
end; $$;
revoke all on function public.enforce_community_rate_limit() from public;
commit;
