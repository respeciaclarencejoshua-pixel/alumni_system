import test from 'node:test';
import assert from 'node:assert/strict';
import { RedisRateLimitStore, rateLimitStore } from '../src/redisRateLimitStore.js';

test('separate instances use the same remote counter and isolate limiter namespaces', async () => {
  const counters = new Map();
  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    const [command, script, keyCount, key, window] = JSON.parse(options.body);
    let result;
    if (command === 'DEL') { counters.delete(script); result = 1; }
    else {
      assert.equal(keyCount, 1);
      const increment = script.includes("redis.call('INCR'");
      const hits = Math.max(0, (counters.get(key) || 0) + (increment ? 1 : -1));
      counters.set(key, hits);
      result = increment ? [hits, window] : hits;
    }
    return new Response(JSON.stringify({ result }));
  };
  const make = prefix => {
    const store = new RedisRateLimitStore({ url: 'https://redis.example', token: 'test-token', prefix, fetchImpl });
    store.init({ windowMs: 60000 });
    return store;
  };
  const a = make('admin:'); const b = make('admin:'); const sensitive = make('sensitive:');
  const results = await Promise.all(Array.from({ length: 100 }, (_, index) => (index % 2 ? a : b).increment('user')));
  assert.equal(Math.max(...results.map(row => row.totalHits)), 100);
  assert.ok(results[0].resetTime > new Date());
  assert.equal((await sensitive.increment('user')).totalHits, 1);
  await b.decrement('user');
  assert.equal((await a.increment('user')).totalHits, 100);
  await b.resetKey('user');
  assert.equal((await a.increment('user')).totalHits, 1);
});

test('remote failures fail closed without exposing provider details', async () => {
  for (const response of [new Response('secret provider details', { status: 503 }), new Response('{"error":"private details"}'), new Response('{"result":[-1,0]}')]) {
    const store = new RedisRateLimitStore({ url: 'https://redis.example', token: 'private-token', prefix: 'test:', fetchImpl: async () => response });
    store.init({ windowMs: 60000 });
    await assert.rejects(store.increment('user'), error => error.status === 503 && !/private|secret/.test(error.message));
  }
});

test('configuration allows local memory, rejects partial setup and separates deployment environments', () => {
  assert.equal(rateLimitStore('admin', {}), undefined);
  assert.throws(() => rateLimitStore('admin', { UPSTASH_REDIS_REST_TOKEN: 'token' }), /Configure both/);
  const env = { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'token', VERCEL_ENV: 'production' };
  assert.equal(rateLimitStore('admin', env).prefix, 'alumni:production:admin:');
  assert.equal(rateLimitStore('admin', { ...env, VERCEL_ENV: 'preview' }).prefix, 'alumni:preview:admin:');
});
