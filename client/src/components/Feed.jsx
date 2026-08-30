import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Feed.css';

const emojiChoices = ['\u{1F600}', '\u{1F389}', '\u{2764}\u{FE0F}', '\u{1F64F}', '\u{1F44F}', '\u{1F31F}'];
const reactionChoices = [
  { id: 'like', icon: 'like', emoji: '\u{1F44D}', label: 'Like' },
  { id: 'celebrate', icon: 'celebrate', emoji: '\u{1F389}', label: 'Celebrate' },
  { id: 'support', icon: 'support', emoji: '\u{2764}\u{FE0F}', label: 'Support' },
];

const Icon = ({ name, size = 20 }) => {
  const icons = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
    comment: <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
    feed: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    send: <path d="m22 2-7 20-4-9-9-4ZM22 2 11 13" />,
    like: <><path d="M7 10v11H3V10h4Z" /><path d="M7 20h10.4a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.6 10H14l.7-3.4A3 3 0 0 0 11.8 3L7 10Z" /></>,
    celebrate: <><path d="m4 20 4.5-12 7.5 7.5L4 20Z" /><path d="m8.5 8 7.5 7.5M14 4l1-2M18 7l3-1M17 11l2 2M10 5 1-3" /></>,
    support: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
};

function withTimeout(operation, message = 'The request timed out. Please check your connection and try again.') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), 15000);
  });
  return Promise.race([operation, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function formatDate(value) {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)} days ago`;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function extractHashtags(value = '') {
  return value.match(/#[\p{L}\p{N}_]+/gu) || [];
}

function normalizePost(post) {
  return {
    ...post,
    feed_reactions: post.feed_reactions || [],
    feed_comments: (post.feed_comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    feed_saved_posts: post.feed_saved_posts || [],
  };
}

function PostText({ text, onHashtag }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
  return <p className="post-content">{parts.map((part, index) => part.startsWith('#') ? <button type="button" className="post-hashtag" key={`${part}-${index}`} onClick={() => onHashtag(part.toLowerCase())}>{part}</button> : part)}</p>;
}

export default function Feed({ user, profile }) {
  const firstName = profile?.first_name?.trim() || user?.user_metadata?.first_name?.trim() || user?.email?.split('@')[0] || 'Alumni';
  const lastName = profile?.last_name?.trim() || user?.user_metadata?.last_name?.trim() || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ');
  const email = profile?.email || user?.email || '';
  const avatar = profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=012b09&color=ffffff&bold=true`;
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeHashtag, setActiveHashtag] = useState('');
  const [openComments, setOpenComments] = useState([]);
  const [openReactionPost, setOpenReactionPost] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [busyPost, setBusyPost] = useState('');
  const mediaInput = useRef(null);
  const composerInput = useRef(null);

  function replacePost(postId, update) {
    setPosts((current) => current.map((post) => post.id === postId ? update(post) : post));
  }

  async function loadPosts() {
    setLoading(true);
    setMessage('');
    try {
      const enriched = await withTimeout(
        supabase.from('feed_posts').select('*, feed_reactions(user_id, reaction), feed_comments(id, user_id, author_name, content, created_at), feed_saved_posts(user_id)').order('created_at', { ascending: false })
      );
      if (!enriched.error) {
        setPosts((enriched.data || []).map(normalizePost));
      } else {
        const basic = await withTimeout(supabase.from('feed_posts').select('*').order('created_at', { ascending: false }));
        if (basic.error) throw basic.error;
        setPosts((basic.data || []).map(normalizePost));
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPosts(); }, []);

  const hashtags = useMemo(() => {
    const counts = new Map();
    posts.forEach((post) => extractHashtags(post.content).forEach((tag) => {
      const normalized = tag.toLowerCase();
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [posts]);

  const visiblePosts = useMemo(() => posts.filter((post) => {
    const savedMatch = !savedOnly || post.feed_saved_posts.some((save) => save.user_id === user?.id);
    const tagMatch = !activeHashtag || extractHashtags(post.content).some((tag) => tag.toLowerCase() === activeHashtag);
    return savedMatch && tagMatch;
  }), [posts, savedOnly, activeHashtag, user?.id]);

  function insertEmoji(emoji) {
    const input = composerInput.current;
    const start = input?.selectionStart ?? content.length;
    const end = input?.selectionEnd ?? content.length;
    setContent(`${content.slice(0, start)}${emoji}${content.slice(end)}`);
    setShowEmojis(false);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function publish() {
    if (!user?.id) return setMessage('Please sign in before publishing a post.');
    if (!content.trim() && !media) return setMessage('Write an update or attach a photo before posting.');
    if (media && (!['image/jpeg', 'image/png', 'image/webp'].includes(media.type) || media.size > 10 * 1024 * 1024)) return setMessage('Use a JPG, PNG, or WebP image no larger than 10 MB.');
    setSubmitting(true);
    setMessage('');
    let mediaPath = null;
    let mediaUrl = null;
    try {
      if (media) {
        mediaPath = `${user.id}/${crypto.randomUUID()}.${media.name.split('.').pop().toLowerCase()}`;
        const upload = await supabase.storage.from('feed-media').upload(mediaPath, media, { contentType: media.type, upsert: false });
        if (upload.error) throw upload.error;
        mediaUrl = supabase.storage.from('feed-media').getPublicUrl(mediaPath).data.publicUrl;
      }
      const result = await withTimeout(supabase.from('feed_posts').insert({ user_id: user.id, author_name: displayName, author_avatar_url: profile?.avatar_url || null, content: content.trim(), media_path: mediaPath }).select().single());
      if (result.error) throw result.error;
      setPosts((current) => [{ ...normalizePost(result.data), media_url: mediaUrl }, ...current]);
      setContent('');
      setMedia(null);
      if (mediaInput.current) mediaInput.current.value = '';
      setMessage('Your post is now visible to the alumni community.');
    } catch (error) {
      if (mediaPath) await supabase.storage.from('feed-media').remove([mediaPath]);
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function react(post, reaction) {
    if (!user?.id) return setMessage('Please sign in to react to a post.');
    setBusyPost(post.id);
    const existing = post.feed_reactions.find((item) => item.user_id === user.id);
    const query = existing?.reaction === reaction
      ? supabase.from('feed_reactions').delete().eq('post_id', post.id).eq('user_id', user.id)
      : supabase.from('feed_reactions').upsert({ post_id: post.id, user_id: user.id, reaction }, { onConflict: 'post_id,user_id' });
    const { error } = await query;
    if (error) setMessage('Reactions will be available after the updated database schema is applied.');
    else replacePost(post.id, (current) => ({ ...current, feed_reactions: [...current.feed_reactions.filter((item) => item.user_id !== user.id), ...(existing?.reaction === reaction ? [] : [{ user_id: user.id, reaction }])] }));
    setOpenReactionPost('');
    setBusyPost('');
  }

  async function toggleSave(post) {
    if (!user?.id) return setMessage('Please sign in to save a post.');
    setBusyPost(post.id);
    const saved = post.feed_saved_posts.some((item) => item.user_id === user.id);
    const query = saved
      ? supabase.from('feed_saved_posts').delete().eq('post_id', post.id).eq('user_id', user.id)
      : supabase.from('feed_saved_posts').insert({ post_id: post.id, user_id: user.id });
    const { error } = await query;
    if (error) setMessage('Saved posts will be available after the updated database schema is applied.');
    else replacePost(post.id, (current) => ({ ...current, feed_saved_posts: saved ? current.feed_saved_posts.filter((item) => item.user_id !== user.id) : [...current.feed_saved_posts, { user_id: user.id }] }));
    setBusyPost('');
  }

  async function addComment(post) {
    const draft = commentDrafts[post.id]?.trim();
    if (!user?.id) return setMessage('Please sign in to comment.');
    if (!draft) return;
    setBusyPost(post.id);
    const { data, error } = await supabase.from('feed_comments').insert({ post_id: post.id, user_id: user.id, author_name: displayName, content: draft }).select().single();
    if (error) setMessage('Comments will be available after the updated database schema is applied.');
    else {
      replacePost(post.id, (current) => ({ ...current, feed_comments: [...current.feed_comments, data] }));
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
    }
    setBusyPost('');
  }

  return (
    <div className="feed-layout feed-layout-live">
      <aside className="feed-sidebar-left" aria-label="Feed options">
        <section className="profile-card">
          <img className="profile-image" src={avatar} alt={`${displayName}'s profile`} />
          <h2>{displayName}</h2>
          <p className="profile-email">{email || 'NDDU Alumni'}</p>
          <nav className="feed-nav" aria-label="Post views">
            <button className={`nav-item ${!savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(false)}><Icon name="feed" /><span>All posts</span></button>
            <button className={`nav-item ${savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(true)}><Icon name="bookmark" /><span>Saved posts</span></button>
          </nav>
        </section>
        <section className="feed-topics">
          <h2>Popular topics</h2>
          {hashtags.length ? hashtags.map(([tag, count]) => <button key={tag} className={activeHashtag === tag ? 'active' : ''} onClick={() => setActiveHashtag(activeHashtag === tag ? '' : tag)}><span>{tag}</span><small>{count} {count === 1 ? 'post' : 'posts'}</small></button>) : <p>Hashtags from alumni posts will appear here.</p>}
        </section>
      </aside>

      <section className="feed-main" aria-labelledby="feed-heading">
        <header className="feed-heading"><p>NDDU Alumni Community</p><h1>Alumni Feed</h1><span>Share milestones, memories, opportunities, and encouragement.</span></header>
        <section className="post-creator" aria-labelledby="create-post-title">
          <img src={avatar} alt="" className="avatar" />
          <div className="creator-input">
            <label id="create-post-title" htmlFor="feed-post-content">Share an update</label>
            <textarea ref={composerInput} id="feed-post-content" placeholder="What would you like to share with fellow alumni? Add #ClassYear or another topic." value={content} onChange={(event) => setContent(event.target.value)} maxLength="2000" />
            <div className="creator-meta"><span>{content.length} of 2,000 characters</span>{media && <span className="selected-media">Photo selected: {media.name}<button type="button" onClick={() => setMedia(null)}>Remove</button></span>}</div>
            <input ref={mediaInput} className="feed-media-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setMedia(event.target.files?.[0] || null)} />
            <div className="creator-actions">
              <div className="creator-buttons">
                <button type="button" className="creator-btn" onClick={() => mediaInput.current?.click()}><Icon name="image" />Add photo</button>
                <div className="emoji-control">
                  <button type="button" className="creator-btn" aria-expanded={showEmojis} onClick={() => setShowEmojis((open) => !open)}><Icon name="smile" />Add emoji</button>
                  {showEmojis && <div className="emoji-picker" aria-label="Choose an emoji">{emojiChoices.map((emoji) => <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>)}</div>}
                </div>
              </div>
              <button className="post-button" type="button" disabled={submitting} onClick={publish}>{submitting ? 'Publishing...' : 'Publish post'}</button>
            </div>
            {message && <p className={`feed-message ${message === 'Your post is now visible to the alumni community.' ? 'feed-message-success' : ''}`} role="status">{message}</p>}
          </div>
        </section>

        {activeHashtag && <div className="feed-filter"><span>Showing posts tagged <strong>{activeHashtag}</strong></span><button onClick={() => setActiveHashtag('')}>Clear filter</button></div>}

        <section className="feed-posts" aria-label="Alumni posts">
          {loading ? <p className="feed-empty">Loading alumni posts...</p> : visiblePosts.length === 0 ? <div className="feed-empty"><h2>No posts found</h2><p>{savedOnly ? 'Posts you save will appear here.' : 'Try another hashtag or share a new update.'}</p></div> : visiblePosts.map((post) => {
            const currentReaction = post.feed_reactions.find((item) => item.user_id === user?.id)?.reaction;
            const currentReactionChoice = reactionChoices.find((choice) => choice.id === currentReaction);
            const reactionSummary = reactionChoices.map((choice) => ({
              ...choice,
              count: post.feed_reactions.filter((item) => item.reaction === choice.id).length,
            })).filter((choice) => choice.count > 0);
            const saved = post.feed_saved_posts.some((item) => item.user_id === user?.id);
            const commentsOpen = openComments.includes(post.id);
            return <article key={post.id} className="feed-post">
              <header className="post-header">
                <img src={post.author_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name)}&background=012b09&color=ffffff&bold=true`} alt="" className="author-avatar" />
                <div><h2>{post.author_name}</h2><p>NDDU Alumni</p><time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{formatDate(post.created_at)}</time></div>
              </header>
              {post.content && <PostText text={post.content} onHashtag={setActiveHashtag} />}
              {post.media_path && <div className="post-image"><img src={post.media_url || supabase.storage.from('feed-media').getPublicUrl(post.media_path).data.publicUrl} alt="Photo shared with this post" loading="lazy" /></div>}
              <div className="post-summary" aria-live="polite">
                <span className="reaction-summary">{reactionSummary.length ? reactionSummary.map((choice) => <span key={choice.id}><Icon name={choice.icon} size={17} />{choice.count} {choice.label}</span>) : <span>No reactions</span>}</span>
                <span>{post.feed_comments.length} {post.feed_comments.length === 1 ? 'comment' : 'comments'}</span>
              </div>
              <div className="post-actions">
                <div className="reaction-menu-wrap">
                  <button className={currentReaction ? 'active' : ''} aria-expanded={openReactionPost === post.id} onClick={() => setOpenReactionPost((current) => current === post.id ? '' : post.id)}><Icon name={currentReactionChoice?.icon || 'like'} />{currentReactionChoice?.label || 'React'}</button>
                  <div className={`reaction-menu ${openReactionPost === post.id ? 'open' : ''}`} aria-label="Choose a reaction">{reactionChoices.map((choice) => <button key={choice.id} type="button" title={choice.label} aria-label={choice.label} disabled={busyPost === post.id} className={currentReaction === choice.id ? 'active' : ''} aria-pressed={currentReaction === choice.id} onClick={() => react(post, choice.id)}><span className="reaction-emoji" aria-hidden="true">{choice.emoji}</span></button>)}</div>
                </div>
                <button className={commentsOpen ? 'active' : ''} onClick={() => setOpenComments((current) => current.includes(post.id) ? current.filter((id) => id !== post.id) : [...current, post.id])}><Icon name="comment" />Comment</button>
                <button className={saved ? 'active' : ''} disabled={busyPost === post.id} onClick={() => toggleSave(post)}><Icon name="bookmark" />{saved ? 'Saved' : 'Save'}</button>
              </div>
              {commentsOpen && <section className="comments-section" aria-label={`Comments on ${post.author_name}'s post`}>
                {post.feed_comments.length ? <ul>{post.feed_comments.map((comment) => <li key={comment.id}><strong>{comment.author_name}</strong><p>{comment.content}</p><time dateTime={comment.created_at}>{formatDate(comment.created_at)}</time></li>)}</ul> : <p className="no-comments">No comments yet. Start the conversation.</p>}
                <div className="comment-composer"><label htmlFor={`comment-${post.id}`}>Write a comment</label><div><input id={`comment-${post.id}`} value={commentDrafts[post.id] || ''} maxLength="1000" placeholder="Write a kind and helpful comment" onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') addComment(post); }} /><button aria-label="Post comment" disabled={busyPost === post.id || !commentDrafts[post.id]?.trim()} onClick={() => addComment(post)}><Icon name="send" /></button></div></div>
              </section>}
            </article>;
          })}
        </section>
      </section>
    </div>
  );
}
