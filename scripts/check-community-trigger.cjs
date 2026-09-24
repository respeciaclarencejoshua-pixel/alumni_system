// Isolated PostgreSQL regression check. No network/database credentials are used.
// Set PGLITE_MODULE to an installed @electric-sql/pglite module before running.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  const actor = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const tables = [['feed_posts', 'user_id', 10], ['feed_comments', 'user_id', 30], ['direct_messages', 'sender_id', 60], ['content_reports', 'reporter_id', 5]];
  try {
    await db.exec(`create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;`);
    for (const [table, column] of tables) {
      await db.exec(`create table public.${table} (${column} uuid, created_at timestamptz default now());`);
    }
    // Reproduce the original failure before applying the fix.
    await db.exec(`create function public.enforce_community_rate_limit() returns trigger language plpgsql as $$
      declare actor uuid;
      begin
        actor := case tg_table_name when 'feed_posts' then new.user_id when 'feed_comments' then new.user_id when 'direct_messages' then new.sender_id when 'content_reports' then new.reporter_id else auth.uid() end;
        return new;
      end; $$;`);
    for (const [table] of tables) {
      await db.exec(`create trigger rate_limit before insert on public.${table} for each row execute function public.enforce_community_rate_limit();`);
    }
    for (const table of ['feed_posts', 'feed_comments']) {
      await assert.rejects(db.query(`insert into public.${table}(user_id) values ($1)`, [actor]), /has no field "sender_id"/);
    }
    console.log('Reproduced the original sender_id error for posts and comments.');

    const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260923_fix_community_rate_limit.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Safe to reapply.
    for (const [table, column, maximum] of tables) {
      await assert.rejects(db.query(`insert into public.${table}(${column}) values ($1)`, [other]), /Invalid actor/);
      await assert.rejects(db.exec(`insert into public.${table}(${column}) values (null)`), /Invalid actor/);
      for (let i = 0; i < maximum; i++) {
        await db.query(`insert into public.${table}(${column}) values ($1)`, [actor]);
      }
      await assert.rejects(db.query(`insert into public.${table}(${column}) values ($1)`, [actor]), /Please wait/);
      await db.exec(`update public.${table} set created_at = now() - interval '2 hours';`);
      await db.query(`insert into public.${table}(${column}) values ($1)`, [actor]);
      console.log(`${table}: inserts succeed; actor checks, limits, and expired windows pass.`);
    }
    const schema = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
    const functionSql = migration.slice(migration.indexOf('create or replace function'), migration.indexOf('commit;')).trim();
    assert.ok(schema.includes(functionSql), 'Fresh schema and migration must contain the same fix');
    console.log('Migration reapplication and fresh-schema consistency passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
