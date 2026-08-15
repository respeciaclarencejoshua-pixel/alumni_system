import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Feed.css';

const Icon = ({ name, size = 18 }) => {
  const icons = {
    heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    messageCircle: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    image: <rect x="3" y="3" width="18" height="18" rx="2" />,
    star: <polygon points="12 2 15.09 10.26 24 10.35 17.77 16.88 19.91 25.07 12 19.54 4.09 25.07 6.23 16.88 0 10.35 8.91 10.26 12 2" />,
    mapPin: <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
};

function relativeTime(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export default function Feed({ user, profile }) {
  const firstName = profile?.first_name?.trim() || user?.user_metadata?.first_name?.trim() || user?.email?.split('@')[0] || 'Alumni';
  const lastName = profile?.last_name?.trim() || user?.user_metadata?.last_name?.trim() || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ');
  const email = profile?.email || user?.email || '';
  const avatar = profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=003b16&color=ffffff&bold=true`;
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const mediaInput = useRef(null);

  async function loadPosts() {
    setLoading(true);
    const { data, error } = await supabase.from('feed_posts').select('*').order('created_at', { ascending: false });
    if (error) setMessage(error.message);
    else setPosts(data || []);
    setLoading(false);
  }

  useEffect(() => { loadPosts(); }, []);

  async function publish() {
    if (!content.trim() && !media) return setMessage('Write an update or attach an image before posting.');
    if (media && (!['image/jpeg', 'image/png', 'image/webp'].includes(media.type) || media.size > 10 * 1024 * 1024)) return setMessage('Use a JPG, PNG, or WebP image no larger than 10 MB.');
    setSubmitting(true); setMessage('');
    let mediaUrl = null;
    let mediaPath = null;
    if (media) {
      mediaPath = `${user.id}/${crypto.randomUUID()}.${media.name.split('.').pop().toLowerCase()}`;
      const { error: uploadError } = await supabase.storage.from('feed-media').upload(mediaPath, media, { contentType: media.type, upsert: false });
      if (uploadError) { setMessage(uploadError.message); setSubmitting(false); return; }
      mediaUrl = supabase.storage.from('feed-media').getPublicUrl(mediaPath).data.publicUrl;
    }
    const { data, error } = await supabase.from('feed_posts').insert({ user_id: user.id, author_name: displayName, author_avatar_url: profile?.avatar_url || null, content: content.trim(), media_path: mediaPath }).select().single();
    if (error) {
      if (mediaPath) await supabase.storage.from('feed-media').remove([mediaPath]);
      setMessage(error.message);
    } else {
      setPosts((current) => [{ ...data, media_url: mediaUrl }, ...current]);
      setContent(''); setMedia(null);
      if (mediaInput.current) mediaInput.current.value = '';
    }
    setSubmitting(false);
  }

  return <div className="feed-layout feed-layout-live">
    <aside className="feed-sidebar-left"><div className="profile-card"><div className="profile-image"><img src={avatar} alt={`${displayName}'s profile`} /></div><h3>{displayName}</h3><p className="profile-email">{email}</p><nav className="feed-nav"><button className="nav-item active"><Icon name="image" size={20} /><span>Feed</span></button><button className="nav-item"><Icon name="star" size={20} /><span>Events</span></button><button className="nav-item"><Icon name="messageCircle" size={20} /><span>Mentorship</span></button><button className="nav-item"><Icon name="heart" size={20} /><span>Saved posts</span></button></nav></div></aside>
    <main className="feed-main"><section className="post-creator"><img src={avatar} alt="" className="avatar" /><div className="creator-input"><textarea placeholder="Share an achievement or update with your network..." value={content} onChange={(event) => setContent(event.target.value)} maxLength="2000" /><input ref={mediaInput} className="feed-media-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setMedia(event.target.files?.[0] || null)} /><div className="creator-actions"><div className="creator-buttons"><button type="button" className="creator-btn" onClick={() => mediaInput.current?.click()}><Icon name="image" size={20} />{media ? media.name : 'Media'}</button></div><button className="post-button" type="button" disabled={submitting} onClick={publish}>{submitting ? 'Posting…' : 'Post'}</button></div>{message && <p className="feed-message">{message}</p>}</div></section>
      <section className="feed-posts">{loading ? <p className="feed-empty">Loading posts…</p> : posts.length === 0 ? <p className="feed-empty">No posts yet. Share the first update with your alumni community.</p> : posts.map((post) => <article key={post.id} className="feed-post"><div className="post-header"><div className="post-author"><img src={post.author_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name)}&background=003b16&color=ffffff&bold=true`} alt="" className="author-avatar" /><div><h4>{post.author_name}</h4><p>{post.user_id === user?.id ? email : 'NDDU Alumni'}</p></div></div></div><div className="post-time">{relativeTime(post.created_at)}</div>{post.content && <p className="post-content">{post.content}</p>}{post.media_path && <div className="post-image"><img src={post.media_url || supabase.storage.from('feed-media').getPublicUrl(post.media_path).data.publicUrl} alt="Post attachment" /></div>}</article>)}</section>
    </main>
  </div>;
}
