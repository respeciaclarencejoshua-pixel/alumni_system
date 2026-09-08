import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app, normalizeEventPayload, requiredAdminScope, toPublicEvent } from '../src/index.js';
import { readFile } from 'node:fs/promises';

let server;
let origin;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('status is available and does not disclose Express', async () => {
  const response = await fetch(`${origin}/api/status`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('admin endpoints reject missing credentials with a stable code', async () => {
  const response = await fetch(`${origin}/api/admin/me`);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'AUTH_REQUIRED');
});

test('unknown APIs do not return the single-page application', async () => {
  const response = await fetch(`${origin}/api/not-a-real-endpoint`);
  assert.equal(response.status, 404);
});

test('database schema protects alumni community writes', async () => {
  const schema = await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /^--[\s\S]*begin;[\s\S]*perform pg_advisory_xact_lock\(71420260906001\);/);
  assert.match(schema, /commit;\s*$/);
  assert.match(schema, /Users can publish their own feed posts[\s\S]*public\.is_verified_user\(\)/);
  assert.match(schema, /Users can send direct messages[\s\S]*public\.is_verified_user\(\)/);
  assert.match(schema, /Anyone can view published events[\s\S]*payload ->> 'status' = 'published'/);
  assert.match(schema, /normalize_opportunity_author/);
  assert.match(schema, /create or replace function public\.manage_event_registration[\s\S]*for update[\s\S]*skip locked/);
  assert.match(schema, /manage_event_registration[\s\S]*Registration for this event is closed/);
  assert.match(schema, /lower\(coalesce\(payload ->> 'status',''\)\) in \('published','active','approved'\)/);
  assert.match(schema, /revoke insert, update, delete on public\.event_registrations from authenticated/);
  assert.match(schema, /revoke update on public\.direct_messages from authenticated[\s\S]*grant update \(read_at\)/);
  assert.match(schema, /create table if not exists public\.saved_opportunities/);
  assert.match(schema, /drop function if exists public\.list_chat_profiles\(\);\s*create or replace function public\.list_chat_profiles\(\)/);
  assert.match(schema, /get_public_alumni_profile\(p_profile_id uuid\)[\s\S]*p\.status='verified'[\s\S]*public\.is_verified_user\(\)/);
  assert.match(schema, /coalesce\(nullif\(e\.course,''\),v\.program\)[\s\S]*from public\.alumni_verifications/);
  assert.match(schema, /create table if not exists public\.alumni_connections[\s\S]*manage_alumni_connection[\s\S]*public\.is_verified_user\(\)/);
  assert.match(schema, /create table if not exists public\.hidden_feed_posts[\s\S]*Users hide posts for themselves[\s\S]*user_id=auth\.uid\(\)/);
  assert.match(schema, /create table if not exists public\.feed_post_edit_history[\s\S]*create or replace function public\.manage_own_feed_post/);
  assert.match(schema, /manage_own_feed_post[\s\S]*where id=p_post_id and user_id=auth\.uid\(\) for update/);
  assert.match(schema, /revoke all on function public\.manage_own_feed_post/);
  assert.match(schema, /create or replace function public\.save_own_alumni_profile[\s\S]*update public\.profiles[\s\S]*update public\.education/);
  assert.match(schema, /create table if not exists public\.alumni_blocks[\s\S]*manage_alumni_block[\s\S]*Users can send direct messages[\s\S]*alumni_blocks/);
  assert.match(schema, /create function public\.list_alumni_directory[\s\S]*not exists\(select 1 from public\.alumni_blocks/);
  assert.match(schema, /content_reports_one_open_per_target/);
  assert.match(schema, /create or replace function public\.enforce_community_rate_limit[\s\S]*rate_limit_direct_messages/);
  assert.match(schema, /opportunities_application_url_check[\s\S]*manage_own_opportunity/);
  assert.match(schema, /revoke update on public\.gallery_submissions from authenticated/);
  assert.match(schema, /drop constraint if exists feed_posts_gif_url_check;\s*alter table public\.feed_posts add constraint feed_posts_gif_url_check/);
  assert.ok(schema.lastIndexOf('drop policy if exists "Verified users can view verified profiles"') > schema.lastIndexOf('create policy "Verified users can view verified profiles"'));
});

test('GIF proxy never exposes its server API key', async () => {
  const response = await fetch(`${origin}/api/gifs`);
  const body = await response.json();
  assert.ok([200, 502, 503].includes(response.status));
  if (response.status === 502) assert.equal(body.code, 'GIF_PROVIDER_ERROR');
  if (response.status === 503) assert.equal(body.code, 'GIFS_NOT_CONFIGURED');
  assert.equal(JSON.stringify(body).includes('GIPHY_API_KEY'), false);
});

test('admin resource routes require the owning permission scope', () => {
  assert.equal(requiredAdminScope('/resources/events'), 'events');
  assert.equal(requiredAdminScope('/resources/jobs'), 'opportunities');
  assert.equal(requiredAdminScope('/resources/news'), 'moderation');
  assert.equal(requiredAdminScope('/resources/reports'), 'analytics');
  assert.equal(requiredAdminScope('/resources/surveys'), 'settings');
});

test('event payloads are normalized and malformed values are rejected', () => {
  const event = normalizeEventPayload({
    title: ' Alumni Homecoming ',
    description: 'Reconnect with the alumni community.',
    category: 'Homecoming',
    date: '2026-09-20T09:00:00+08:00',
    endDate: '2026-09-20T18:00:00+08:00',
    location: 'NDDU Campus',
    capacity: '500',
    latitude: '6.1164',
    longitude: '125.1716',
    image_url: 'https://example.com/event.webp',
    internalNote: 'must not survive normalization',
  });
  assert.equal(event.title, 'Alumni Homecoming');
  assert.equal(event.capacity, 500);
  assert.equal(event.internalNote, undefined);
  assert.equal(event.status, 'published');
  assert.throws(() => normalizeEventPayload({ ...event, date: 'not-a-date' }), /valid date/);
  assert.throws(() => normalizeEventPayload({ ...event, image_url: 'javascript:alert(1)' }), /HTTP or HTTPS/);
  assert.throws(() => normalizeEventPayload({ ...event, endDate: '2026-09-19T09:00:00Z' }), /later than/);
});

test('public events expose an allowlisted response only', () => {
  const event = toPublicEvent({
    id: 'event-1',
    created_at: '2026-09-01T00:00:00Z',
    payload: {
      title: 'Public event',
      description: 'Public details',
      status: 'published',
      date: '2026-09-20T01:00:00Z',
      location: 'NDDU',
      privateStaffNote: 'never expose this',
    },
  }, 4);
  assert.equal(event.interest_count, 4);
  assert.equal(event.privateStaffNote, undefined);
  assert.deepEqual(Object.keys(event).sort(), [
    'capacity', 'category', 'city', 'created_at', 'date', 'description', 'endDate',
    'featured', 'id', 'image_url', 'interest_count', 'latitude', 'location',
    'longitude', 'publishedAt', 'registrationDeadline', 'status', 'title',
  ].sort());
});
