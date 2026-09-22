-- SQL Editor alternative for small tables / a quiet maintenance period.
-- Paste this entire file into a new SQL Editor query and run it once.
-- Unlike CONCURRENTLY, these builds temporarily block writes to the indexed tables.
-- Timeouts abort the transaction rather than waiting indefinitely. If a timeout
-- occurs, use the concurrent migration one statement at a time with autocommit.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create index if not exists education_profile_created_idx
  on public.education(profile_id, created_at desc);

create index if not exists direct_messages_recipient_sender_created_idx
  on public.direct_messages(recipient_id, sender_id, created_at desc);

create index if not exists alumni_service_requests_status_order_idx
  on public.alumni_service_items(status, pinned desc, created_at desc)
  where kind = 'request';

create index if not exists profiles_created_id_idx
  on public.profiles(created_at desc, id);

commit;

-- All four should be listed with indisvalid = true and indisready = true.
select c.relname as index_name, i.indisvalid, i.indisready
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'education_profile_created_idx',
  'direct_messages_recipient_sender_created_idx',
  'alumni_service_requests_status_order_idx',
  'profiles_created_id_idx'
)
order by c.relname;
