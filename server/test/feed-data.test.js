import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { feedPageQuery, commentsPageQuery, normalizeFeedPost, applyOwnReaction, mergeRows } from '../../client/src/lib/feedData.js';

function captureQueries() {
  const requests = [];
  const db = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async url => { requests.push(new URL(url)); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  return { db, requests };
}

test('feed pages bound rows and retrieve aggregate counts plus only the viewer’s interactions', async () => {
  const { db, requests } = captureQueries();
  await feedPageQuery(db, 'viewer');
  const params = requests[0].searchParams;
  assert.equal(params.get('limit'), '11');
  assert.equal(params.get('feed_reactions.user_id'), 'eq.viewer');
  assert.equal(params.get('feed_saved_posts.user_id'), 'eq.viewer');
  assert.equal(params.get('comment_total.moderation_status'), 'eq.published');
  assert.match(params.get('select'), /comment_total:feed_comments\(count\)/);
  assert.equal(params.get('order'), 'created_at.desc,id.desc');
  assert.equal(params.get('offset'), null);
});

test('feed and comment cursors include ID tie breakers and opposite chronological directions', async () => {
  const { db, requests } = captureQueries();
  const cursor = { created_at: '2026-09-22T00:00:00+00:00', id: '11111111-1111-4111-8111-111111111111' };
  await feedPageQuery(db, 'viewer', cursor);
  await commentsPageQuery(db, 'post', cursor);
  assert.equal(requests[0].searchParams.get('or'), `(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id}))`);
  const params = requests[1].searchParams;
  assert.equal(params.get('limit'), '21');
  assert.equal(params.get('order'), 'created_at.asc,id.asc');
  assert.equal(params.get('moderation_status'), 'eq.published');
  assert.equal(params.get('post_id'), 'eq.post');
  assert.match(params.get('or'), /created_at.gt./);
  assert.match(params.get('or'), /id.gt./);
});

test('changing or removing a personal reaction preserves other users’ aggregate counts', () => {
  const post = normalizeFeedPost({ id: 'post', feed_reactions: [{ user_id: 'viewer', reaction: 'like' }], reaction_likes: [{ count: 500 }], reaction_supports: [{ count: 12 }], reaction_celebrates: [{ count: 0 }], comment_total: [{ count: 10000 }] });
  assert.equal(post.comment_count, 10000);
  assert.deepEqual(post.feed_comments, []);
  const switched = applyOwnReaction(post, 'viewer', 'support');
  assert.deepEqual(switched.reaction_counts, { like: 499, support: 13, celebrate: 0, laugh: 0, wow: 0, sad: 0 });
  const removed = applyOwnReaction(switched, 'viewer', 'support');
  assert.deepEqual(removed.reaction_counts, { like: 499, support: 12, celebrate: 0, laugh: 0, wow: 0, sad: 0 });
  assert.deepEqual(removed.feed_reactions, []);
  assert.equal(post.reaction_counts.like, 500);
});

test('merging paginated comments preserves local additions without duplicates', () => {
  const rows = mergeRows([{ id: 'a', content: 'old' }, { id: 'local' }], [{ id: 'a', content: 'updated' }, { id: 'b' }]);
  assert.deepEqual(rows, [{ id: 'a', content: 'updated' }, { id: 'local' }, { id: 'b' }]);
});

 test('new reaction counts survive switching and removing a reaction', async () => {
  const {db, requests} = captureQueries();
  await feedPageQuery(db, 'viewer');
  for (const type of ['laugh', 'wow', 'sad']) {
    assert.equal(requests[0].searchParams.get(`reaction_${type}s.reaction`), `eq.${type}`);
    const post = normalizeFeedPost({ [`reaction_${type}s`]: [{ count: 40 }] });
    const reacted = applyOwnReaction(post, 'viewer', type);
    assert.equal(reacted.reaction_counts[type], 41);
    assert.equal(applyOwnReaction(reacted, 'viewer', type).reaction_counts[type], 40);
    assert.equal(applyOwnReaction(reacted, 'viewer', 'like').reaction_counts[type], 40);
  }
});
