-- Candidate scaling indexes. Apply after the base schema and community migrations.
-- Test on staging with production-like data and EXPLAIN (ANALYZE, BUFFERS).
-- Run each statement separately, outside a transaction: CONCURRENTLY cannot run
-- inside a transaction block. This migration has NOT been applied by the audit.
-- Do not paste the whole file into a transactional SQL Editor run.
-- For small tables, the paste-and-run alternative is:
-- supabase/maintenance/scaling_indexes_sql_editor.sql (temporarily blocks writes).

-- Latest education lookup is used for each directory/chat profile.
create index concurrently if not exists education_profile_created_idx
  on public.education(profile_id, created_at desc);

-- Full incoming-message history, complementing the existing outgoing and unread indexes.
create index concurrently if not exists direct_messages_recipient_sender_created_idx
  on public.direct_messages(recipient_id, sender_id, created_at desc);

-- Support status queues with the existing pinned-first sort.
create index concurrently if not exists alumni_service_requests_status_order_idx
  on public.alumni_service_items(status, pinned desc, created_at desc)
  where kind = 'request';

-- Stable member listing pages.
create index concurrently if not exists profiles_created_id_idx
  on public.profiles(created_at desc, id);
