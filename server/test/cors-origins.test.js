import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredOrigins } from '../src/corsOrigins.js';

test('Vercel exact production and deployment domains are allowed even with a stale localhost setting', () => {
  const origins = configuredOrigins({ NODE_ENV: 'production', VERCEL: '1', CLIENT_ORIGIN: 'http://localhost:5173', VERCEL_PROJECT_PRODUCTION_URL: 'alumni-system-client.vercel.app', VERCEL_URL: 'alumni-abc-team.vercel.app', VERCEL_BRANCH_URL: 'alumni-git-main-team.vercel.app' });
  for (const host of ['alumni-system-client.vercel.app', 'alumni-abc-team.vercel.app', 'alumni-git-main-team.vercel.app']) assert.equal(origins.has(`https://${host}`), true);
  for (const value of ['https://unrelated.vercel.app', 'https://alumni-system-client.vercel.app.evil.example', 'http://alumni-system-client.vercel.app', 'null']) assert.equal(origins.has(value), false);
});

test('configured origins normalize whitespace, host casing and trailing slashes', () => {
  assert.deepEqual([...configuredOrigins({ NODE_ENV: 'production', CLIENT_ORIGIN: ' https://ALUMNI.example/ , https://www.alumni.example:443/' })], ['https://alumni.example', 'https://www.alumni.example']);
});

test('invalid origin configuration cannot open a wildcard or opaque origin', () => {
  const origins = configuredOrigins({ NODE_ENV: 'production', CLIENT_ORIGIN: '*,null,https://example.com/admin,https://user:password@example.com,https://example.com?x=1,javascript:alert(1)' });
  assert.equal(origins.size, 0);
  assert.equal(configuredOrigins({ NODE_ENV: 'production' }).size, 0);
  assert.equal(configuredOrigins({ NODE_ENV: 'development' }).has('http://localhost:5173'), true);
});

test('production API accepts same-site admin preflight and still requires authentication', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'production', VERCEL: '1',
    VERCEL_PROJECT_PRODUCTION_URL: 'alumni-system-client.vercel.app',
    CLIENT_ORIGIN: 'http://localhost:5173',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-key', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
    UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
  });
  const { app } = await import('../src/index.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/admin/me`;
  const origin = 'https://alumni-system-client.vercel.app';
  try {
    const response = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    const unauthorized = await fetch(endpoint, { headers: { Origin: origin } });
    assert.equal(unauthorized.status, 401);
    const rejected = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://unrelated.vercel.app', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
