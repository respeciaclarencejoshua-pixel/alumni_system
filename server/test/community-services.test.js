import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20260907_community_services.sql', import.meta.url), 'utf8');
test('community migration enables RLS on every new table', () => {
  for (const table of ['alumni_spaces', 'alumni_space_members', 'alumni_service_items', 'alumni_service_replies']) {
    assert.ok(migration.includes(`alter table public.${table} enable row level security;`));
  }
  assert.match(migration, /set local lock_timeout = '5s'/);
  assert.match(migration, /commit;\s*$/);
});
test('management authority includes role, MFA and session age checks', () => {
  assert.match(migration, /role='admin' and status='verified'/);
  assert.match(migration, /require_admin_mfa/);
  assert.match(migration, /auth.jwt\(\)->>'aal'='aal2'/);
  assert.match(migration, /session_timeout_minutes/);
});
test('members cannot update request ownership or create another author’s content', () => {
  assert.match(migration, /grant update\(status,pinned\)/);
  assert.doesNotMatch(migration, /grant update on/);
  assert.match(migration, /author_id=auth.uid\(\) and status='submitted'/);
  assert.match(migration, /kind='request' and author_id=auth.uid\(\)/);
  assert.match(migration, /replies_create[\s\S]*author_id=auth.uid\(\)/);
});
