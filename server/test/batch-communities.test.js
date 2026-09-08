import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20260908_batch_communities.sql', import.meta.url), 'utf8');
test('batch chat membership uses the existing group membership source', () => {
  assert.match(sql, /is_batch_member[\s\S]*public\.is_verified_user\(\) and exists\(select 1 from public\.alumni_space_members/);
  assert.match(sql, /batch_entry_read[\s\S]*public\.is_batch_member\(space_id\)/);
  assert.match(sql, /batch_entry_write[\s\S]*author_id=auth.uid\(\)/);
  assert.doesNotMatch(sql, /create table public\.batch_chat_members/);
});
test('batch presidents need verified membership to publish batch announcements', () => {
  assert.match(sql, /can_announce_batch[\s\S]*public\.is_batch_member\(p_space\)[\s\S]*president_id=auth.uid\(\)/);
  assert.match(sql, /kind='announcement' and public\.can_announce_batch\(space_id\)/);
  assert.match(sql, /Choose a verified alumnus as batch president/);
});
test('batch membership directory does not expose private contact information', () => {
  const definition = sql.slice(sql.indexOf('create function public.list_batch_members'), sql.indexOf('create function public.check_batch_president'));
  assert.doesNotMatch(definition, /email|phone|address/);
  assert.match(definition, /public\.is_batch_member\(p_space\) or public\.community_manager\(\)/);
});
test('batch migration preserves existing discussions and limits photo uploads', () => {
  assert.match(sql, /from public.alumni_service_items where kind='discussion'/);
  assert.match(sql, /from public.alumni_service_replies r join/);
  assert.match(sql, /5242880,array\['image\/jpeg','image\/png','image\/webp'\]/);
  assert.match(sql, /batch_photo_upload[\s\S]*public\.community_manager\(\)/);
});
