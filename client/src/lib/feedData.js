export const FEED_PAGE_SIZE = 10;
export const COMMENT_PAGE_SIZE = 20;
const reactionTypes = ['like', 'celebrate', 'support'];

export function feedPageQuery(db, userId, cursor) {
  let query = db.from('feed_posts').select(`*,
    feed_reactions(user_id,reaction),feed_saved_posts(user_id),
    reaction_likes:feed_reactions(count),reaction_celebrates:feed_reactions(count),
    reaction_supports:feed_reactions(count),comment_total:feed_comments(count)`)
    .eq('moderation_status', 'published').is('deleted_at', null)
    .eq('feed_reactions.user_id', userId)
    .eq('feed_saved_posts.user_id', userId)
    .eq('reaction_likes.reaction', 'like')
    .eq('reaction_celebrates.reaction', 'celebrate')
    .eq('reaction_supports.reaction', 'support')
    .eq('comment_total.moderation_status', 'published')
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);
  if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  return query;
}

export function commentsPageQuery(db, postId, cursor) {
  let query = db.from('feed_comments')
    .select('id,user_id,author_name,content,created_at,parent_comment_id,media_path,gif_url')
    .eq('post_id', postId).eq('moderation_status', 'published')
    .order('created_at').order('id').limit(COMMENT_PAGE_SIZE + 1);
  if (cursor) query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
  return query;
}

export function normalizeFeedPost(post) {
  const reactions = post.feed_reactions || [];
  return {
    ...post,
    feed_reactions: reactions,
    feed_saved_posts: post.feed_saved_posts || [],
    feed_comments: post.feed_comments || [],
    comment_count: post.comment_total?.[0]?.count ?? post.feed_comments?.length ?? 0,
    reaction_counts: {
      like: post.reaction_likes?.[0]?.count ?? reactions.filter(item => item.reaction === 'like').length,
      celebrate: post.reaction_celebrates?.[0]?.count ?? reactions.filter(item => item.reaction === 'celebrate').length,
      support: post.reaction_supports?.[0]?.count ?? reactions.filter(item => item.reaction === 'support').length,
    },
    comments_loaded: false,
    comments_has_more: false,
    comments_cursor: null,
  };
}

export function applyOwnReaction(post, userId, reaction) {
  if (!reactionTypes.includes(reaction)) return post;
  const previous = post.feed_reactions.find(item => item.user_id === userId)?.reaction;
  const next = previous === reaction ? null : reaction;
  const counts = { ...post.reaction_counts };
  if (previous) counts[previous] = Math.max(0, (counts[previous] || 0) - 1);
  if (next) counts[next] = (counts[next] || 0) + 1;
  return { ...post, reaction_counts: counts, feed_reactions: [...post.feed_reactions.filter(item => item.user_id !== userId), ...(next ? [{ user_id: userId, reaction: next }] : [])] };
}

export function mergeRows(current, incoming) {
  const rows = new Map(current.map(row => [row.id, row]));
  incoming.forEach(row => rows.set(row.id, row));
  return [...rows.values()];
}
