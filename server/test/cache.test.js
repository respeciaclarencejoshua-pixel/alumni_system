import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAsyncCache } from '../../shared/asyncCache.mjs';

test('concurrent cache misses share exactly one loader', async () => {
  let calls = 0;
  const cache = createAsyncCache({ ttlMs: 1000 });
  const values = await Promise.all(Array.from({ length: 300 }, () => cache.get('public', async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return 'data'; })));
  assert.equal(calls, 1);
  assert.equal(values.length, 300);
  assert.ok(values.every(value => value === 'data'));
});

test('cache entries expire and failures are retried', async () => {
  let time = 0, calls = 0;
  const cache = createAsyncCache({ ttlMs: 100, now: () => time });
  const load = () => ++calls;
  assert.equal(await cache.get('a', load), 1);
  assert.equal(await cache.get('a', load), 1);
  time = 101;
  assert.equal(await cache.get('a', load), 2);
  await assert.rejects(cache.get('b', () => { throw new Error('offline'); }));
  assert.equal(await cache.get('b', () => 'recovered'), 'recovered');
});

test('clearing during a pending request does not repopulate stale cache', async () => {
  const cache = createAsyncCache({ ttlMs: 1000 });
  let resolveOld;
  const old = cache.get('a', () => new Promise(resolve => { resolveOld = resolve; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.get('a', () => 'new'), 'new');
  resolveOld('old'); await old;
  assert.equal(await cache.get('a', () => 'wrong'), 'new');
});

test('cache memory is bounded by maxEntries', async () => {
  const cache = createAsyncCache({ ttlMs: 1000, maxEntries: 2 });
  await cache.get('a', () => 'a'); await cache.get('b', () => 'b'); await cache.get('c', () => 'c');
  assert.equal(await cache.get('a', () => 'reloaded'), 'reloaded');
});

test('zero TTL still deduplicates in-flight work but refreshes after completion', async () => {
  const cache = createAsyncCache({ ttlMs: 0 });
  let calls = 0;
  await Promise.all([cache.get('a', () => ++calls), cache.get('a', () => ++calls)]);
  assert.equal(calls, 1);
  await cache.get('a', () => ++calls);
  assert.equal(calls, 2);
});
