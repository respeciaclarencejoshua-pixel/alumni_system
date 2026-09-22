import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import http from 'node:http';
import { opportunityUpdateSchema, galleryCurationSchema } from '../src/adminValidation.js';
import { toLocalDateTime, toApiDateTime } from '../../client/src/lib/adminDates.js';

const adminId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000001501';
let fixture, server, origin, handler, role = 'admin', calls = [];
const token = `header.${Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), aal: 'aal2' })).toString('base64url')}.signature`;
const json = (res, body, status = 200, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const authUser = id => ({ id, email: 'fixture@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-09-01T00:00:00Z', banned_until: null });

before(async () => {
  fixture = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ method: req.method, url, body });
    if (url.pathname === '/auth/v1/user') { const claims=JSON.parse(Buffer.from(req.headers.authorization.split(' ')[1].split('.')[1], 'base64url')); return json(res, authUser(claims.sub || adminId)); }
    if (url.pathname === '/rest/v1/profiles' && url.searchParams.get('select') === 'id,first_name,last_name,email,role,status') return json(res, { id: (url.searchParams.get('id') || '').replace('eq.', '') || adminId, role, status: 'verified' });
    if (url.pathname === '/rest/v1/system_settings') return json(res, { id: 1, rate_limit_per_minute: 1000, verification_document_retention_days: 45 });
    if (url.pathname === '/rest/v1/admin_permissions') return json(res, { scopes: ['dashboard', 'analytics'], admin_role: 'analyst' });
    if (handler && await handler(req, res, url, body)) return;
    if (url.pathname.startsWith('/auth/v1/admin/users/')) return json(res, { user: authUser(url.pathname.split('/').at(-1)) });
    if (['/rest/v1/system_incidents', '/rest/v1/admin_audit_logs'].includes(url.pathname)) return json(res, []);
    json(res, { message: `Unexpected mock request: ${req.method} ${url}` }, 500);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fixture.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-publishable';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-only';
  const { app } = await import('../src/index.js');
  await new Promise(resolve => { server = app.listen({port:0,host:'127.0.0.1',backlog:1024}, resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => fixture.close(resolve)); });
beforeEach(() => { calls = []; handler = null; role = 'admin'; });
async function request(path, method = 'GET', body) {
  const response = await fetch(`${origin}/api/admin${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
function memberTarget(req, res, url) {
  if (url.pathname === '/rest/v1/profiles' && url.searchParams.get('select') === 'id,role,status') { json(res, { id: memberId, role: 'alumni', status: 'verified' }); return true; }
  return false;
}

test('member auth details are retrieved by ID beyond the first 1000 accounts', async () => {
  handler = (req, res, url) => {
    if (url.pathname === '/rest/v1/profiles') { json(res, [{ id: memberId, first_name: 'Member', email: 'fixture@example.test', role: 'staff', status: 'verified', avatar_url: 'https://example.test/avatar.png' }], 200, { 'Content-Range': '0-0/1' }); return true; }
    if (['profile_roles', 'education', 'employer_profiles'].some(t => url.pathname === `/rest/v1/${t}`)) { json(res, url.pathname.endsWith('profile_roles') ? [{ profile_id: memberId, role: 'alumni' }] : []); return true; }
    return false;
  };
  const result = await request('/members');
  assert.equal(result.status, 200);
  assert.equal(result.body.members[0].emailConfirmed, true);
  assert.deepEqual(result.body.members[0].roles, ['STAFF', 'ALUMNI']);
  assert.equal(result.body.members[0].avatarUrl, 'https://example.test/avatar.png');
  assert.ok(calls.some(c => c.url.pathname === `/auth/v1/admin/users/${memberId}`));
  assert.ok(!calls.some(c => c.url.pathname === '/auth/v1/admin/users'));
});

test('email confirmation looks up the exact member ID', async () => {
  handler = memberTarget;
  const result = await request(`/users/${memberId}/confirm-email`, 'PATCH');
  assert.equal(result.status, 200);
  assert.ok(!calls.some(c => c.url.pathname === '/auth/v1/admin/users'));
});

test('string lock values are rejected before any account write', async () => {
  handler = memberTarget;
  assert.equal((await request(`/members/${memberId}/lock`, 'PATCH', { locked: 'false' })).status, 400);
  assert.ok(!calls.some(c => c.method === 'PUT'));
});

test('staff without settings scope cannot read administrative audit logs', async () => {
  role = 'staff';
  assert.equal((await request('/audit-logs')).status, 403);
  assert.ok(!calls.some(c => c.url.pathname === '/rest/v1/admin_audit_logs'));
});

test('member editor prevents self-demotion to pending', async () => {
  handler = (req, res, url) => { if (url.pathname === '/rest/v1/profiles') { json(res, { id: adminId, role: 'admin', status: 'verified' }); return true; } return false; };
  const result = await request(`/members/${adminId}`, 'PATCH', { first_name: 'Admin', last_name: 'User', email: 'admin@example.test', role: 'admin', status: 'pending' });
  assert.equal(result.status, 400);
  assert.ok(!calls.some(c => c.method === 'PATCH' || c.method === 'PUT'));
});

test('verification safeguards reject truthy strings', async () => {
  const checks = Object.fromEntries(['name', 'program', 'year', 'readable', 'authentic'].map(key => [key, 'false']));
  assert.equal((await request(`/verifications/${memberId}`, 'PATCH', { status: 'verified', checks })).status, 400);
});

test('cancelled registration cannot be checked in using a QR token', async () => {
  handler = (req, res, url) => { if (url.pathname === '/rest/v1/event_registrations') { assert.equal(url.searchParams.get('status'), 'in.(registered,attended)'); json(res, []); return true; } return false; };
  const result = await request(`/events/${memberId}/check-in`, 'POST', { qrToken: 'a'.repeat(32) });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'CHECK_IN_NOT_ALLOWED');
});

test('attendance endpoint excludes waitlisted and cancelled registrations', async () => {
  handler = (req, res, url) => { if (url.pathname === '/rest/v1/event_registrations') { assert.equal(url.searchParams.get('status'), 'in.(registered,attended,no_show)'); json(res, []); return true; } return false; };
  assert.equal((await request(`/events/${adminId}/registrations/${memberId}`, 'PATCH', { status: 'attended' })).status, 409);
});

test('failed moderation does not resolve the report', async () => {
  handler = (req, res, url) => {
    if (url.pathname === '/rest/v1/content_reports') { json(res, { id: memberId, target_id: memberId, target_type: 'feed_post', status: 'open' }); return true; }
    if (url.pathname === '/rest/v1/feed_posts') { json(res, null); return true; }
    return false;
  };
  assert.equal((await request(`/moderation/reports/${memberId}`, 'PATCH', { status: 'resolved', action: 'hide', reason: 'Fixture review' })).status, 404);
  assert.ok(!calls.some(c => c.method === 'PATCH' && c.url.pathname === '/rest/v1/content_reports'));
});

test('unsupported target actions fail instead of falsely reporting success', async () => {
  handler = (req, res, url) => { if (url.pathname === '/rest/v1/content_reports') { json(res, { id: memberId, target_id: memberId, target_type: 'member', status: 'open' }); return true; } return false; };
  const result = await request(`/moderation/reports/${memberId}`, 'PATCH', { status: 'resolved', action: 'hide', reason: 'Fixture review' });
  assert.equal(result.status, 400);
  assert.ok(!calls.some(c => c.method === 'PATCH'));
});

test('opportunity listing reads additional database pages', async () => {
  handler = (req, res, url) => {
    if (url.pathname === '/rest/v1/opportunities') { const offset = Number(url.searchParams.get('offset')); json(res, offset === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [{ id: 500 }]); return true; }
    return false;
  };
  const result = await request('/opportunities');
  assert.equal(result.status, 200);
  assert.equal(result.body.opportunities.length, 501);
});

test('post search is applied in the database before pagination', async () => {
  handler = (req, res, url) => { if (url.pathname === '/rest/v1/feed_posts') { assert.match(url.searchParams.get('or'), /author_name\.ilike/); assert.match(url.searchParams.get('or'), /content\.ilike/); assert.equal(url.searchParams.get('offset'), '10'); json(res, [], 200, { 'Content-Range': '*/0' }); return true; } return false; };
  assert.equal((await request('/community-content?page=2&search=alumni')).status, 200);
});

test('opportunity edits validate links, dates, counts, and boolean types', () => {
  for (const input of [{ application_url: 'javascript:alert(1)' }, { application_deadline: 'not-a-date' }, { openings: -1 }, { openings: '1.5' }, { featured: 'false' }, { title: ' ' }]) assert.equal(opportunityUpdateSchema.safeParse(input).success, false);
  assert.equal(opportunityUpdateSchema.safeParse({ openings: '2', application_url: 'https://example.test/jobs', application_deadline: null }).success, true);
});

test('gallery curation rejects malformed rank and dates', () => {
  for (const input of [{ featuredRank: '-1' }, { featuredRank: '2.5' }, { featuredStartsAt: 'garbage' }]) assert.equal(galleryCurationSchema.safeParse(input).success, false);
});

test('event datetime round trip preserves the saved instant in the local timezone', () => {
  const timestamp = '2026-09-22T01:30:00.000Z';
  assert.equal(toApiDateTime(toLocalDateTime(timestamp)), timestamp);
  assert.equal(toLocalDateTime(null), '');
  assert.equal(toApiDateTime(''), null);
});

test('revoke sessions cannot shorten an existing account ban', async () => {
  handler = memberTarget;
  const result = await request(`/members/${memberId}/revoke-sessions`, 'POST');
  assert.equal(result.status, 501);
  assert.equal(result.body.code, 'SESSION_REVOCATION_UNAVAILABLE');
  assert.ok(!calls.some(c => c.url.pathname.startsWith('/auth/v1/admin/') && c.method === 'PUT'));
});

test('invalid opportunity fields return field-level validation errors', async () => {
  const result = await request(`/opportunities/${memberId}`, 'PATCH', { openings: -3 });
  assert.equal(result.status, 400);
  assert.ok(result.body.fields.openings.length);
  assert.ok(!calls.some(c => c.url.pathname === '/rest/v1/opportunities'));
});

test('gallery schedule is checked against the saved start before writing', async () => {
  handler = (req, res, url) => {
    if (url.pathname === '/rest/v1/gallery_submissions') { json(res, { status: 'approved', featured_starts_at: '2026-10-01T00:00:00Z', featured_ends_at: null }); return true; }
    return false;
  };
  const result = await request(`/gallery-submissions/${memberId}/curate`, 'PATCH', { featuredEndsAt: '2026-09-01T00:00:00Z' });
  assert.equal(result.status, 400);
  assert.ok(!calls.some(c => c.method === 'PATCH'));
});

test('reviewed verifications cannot be overwritten', async () => {
  handler = (req, res, url) => {
    if (url.pathname === '/rest/v1/alumni_verifications') { assert.equal(url.searchParams.get('status'), 'in.(pending,under_review,needs_information)'); json(res, []); return true; }
    return false;
  };
  const result = await request(`/verifications/${memberId}`, 'PATCH', { status: 'rejected', reviewerNote: 'Reviewed' });
  assert.equal(result.status, 409);
});

test('legacy status endpoint cannot silently desynchronize profile and auth email', async () => {
  handler = memberTarget;
  const result = await request(`/members/${memberId}/status`, 'PATCH', { status: 'verified', email: 'changed@example.test' });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'USE_MEMBER_EDITOR');
  assert.ok(!calls.some(c => c.method === 'PATCH'));
});

test('array request bodies are rejected consistently', async () => {
  assert.equal((await request('/resources/news', 'POST', [])).status, 400);
});

test('member CSV exports neutralize spreadsheet formulas and preserve quotes', async () => {
  const { csvCell } = await import('../../client/src/lib/adminCsv.js');
  assert.equal(csvCell('=HYPERLINK("https://example.test")').startsWith('"\'='), true);
  assert.equal(csvCell(' +123').startsWith('"\''), true);
  assert.equal(csvCell('Alice "A"'), '"Alice ""A"""');
});

test('absent event coordinates remain absent rather than pointing to zero', async () => {
  const { toPublicEvent } = await import('../src/index.js');
  const result = toPublicEvent({ id: memberId, payload: { latitude: null, longitude: '' } });
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
});

test('100 simultaneous public event requests share one backend read', async t => {
  handler = async (req, res, url) => {
    if (url.pathname === '/rest/v1/admin_resources') {
      await new Promise(resolve => setTimeout(resolve, 25));
      json(res, [{ id: memberId, payload: { title: 'Public event', status: 'published' } }]);
      return true;
    }
    if (url.pathname === '/rest/v1/event_registrations') { json(res, []); return true; }
    return false;
  };
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: 100 }, async () => {
    const start = performance.now();
    const response = await fetch(`${origin}/api/events`);
    const body = await response.json();
    return { status: response.status, elapsed: performance.now() - start, body };
  }));
  assert.ok(results.every(result => result.status === 200 && result.body.events.length === 1));
  assert.equal(calls.filter(call => call.url.pathname === '/rest/v1/admin_resources').length, 1);
  assert.equal(calls.filter(call => call.url.pathname === '/rest/v1/event_registrations').length, 1);
  const durations = results.map(result => result.elapsed).sort((a,b) => a-b);
  t.diagnostic(JSON.stringify({ scenario: 'Local Express with mock Supabase, not a production capacity result', requests: 100, errors: 0, databaseReads: 2, elapsedMs: Math.round(performance.now()-started), p95Ms: Math.round(durations[Math.ceil(durations.length*0.95)-1]) }));
});


test('sensitive action limits are per verified account, not shared campus IP', async () => {
  handler = memberTarget;
  const makeToken = sub => `header.${Buffer.from(JSON.stringify({ sub, iat: Math.floor(Date.now()/1000), aal:'aal2' })).toString('base64url')}.signature`;
  const hit = async sub => {
    const response = await fetch(`${origin}/api/admin/members/${memberId}/lock`, {method:'PATCH',headers:{Authorization:`Bearer ${makeToken(sub)}`,'Content-Type':'application/json'},body:JSON.stringify({locked:'invalid'})});
    await response.json(); return response.status;
  };
  for (let i=0;i<30;i++) assert.equal(await hit('00000000-0000-4000-8000-000000000071'),400);
  assert.equal(await hit('00000000-0000-4000-8000-000000000071'),429);
  assert.equal(await hit('00000000-0000-4000-8000-000000000072'),400);
});
