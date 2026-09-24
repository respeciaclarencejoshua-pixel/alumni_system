-- Run in Supabase SQL Editor before deploying the expanded reaction picker.
-- Preserve existing reactions and allow new reactions in notification triggers too.
begin;
set local lock_timeout = '5s';
alter table public.feed_reactions drop constraint if exists feed_reactions_reaction_check;
alter table public.feed_reactions add constraint feed_reactions_reaction_check
  check (reaction in ('like', 'celebrate', 'support', 'laugh', 'wow', 'sad'));
alter table public.notifications drop constraint if exists notifications_reaction_check;
alter table public.notifications add constraint notifications_reaction_check
  check (reaction is null or reaction in ('like', 'celebrate', 'support', 'laugh', 'wow', 'sad'));
commit;
