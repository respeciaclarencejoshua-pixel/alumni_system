import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';
import GalleryReview from './GalleryReview.jsx';

const initials = (name = '') => name.split(' ').filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase() || 'A';

export default function CommunityContent() {
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const result = await adminApi('/api/admin/community-content'); setPosts(result.posts || []); setMessage(''); }
    catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({ all: posts.length, feed: posts.filter((post) => !post.media_path).length, gallery: posts.filter((post) => post.media_path).length }), [posts]);
  const visible = useMemo(() => posts.filter((post) => {
    const typeMatches = filter === 'all' || (filter === 'gallery' ? post.media_path : !post.media_path);
    return typeMatches && `${post.author_name} ${post.content}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [posts, filter, search]);

  async function remove(post) {
    if (!window.confirm(`Remove this post by ${post.author_name}? Its comments, reactions, and gallery image will also be removed.`)) return;
    try { await adminApi(`/api/admin/community-content/${post.id}`, { method: 'DELETE' }); setPosts((items) => items.filter((item) => item.id !== post.id)); setMessage('Post removed and recorded in the audit log.'); }
    catch (error) { setMessage(error.message); }
  }

  return <div className="content-admin-page">
    <header className="admin-page-header content-admin-heading"><div><p>Community moderation</p><h1>Feed &amp; Gallery</h1><span>Review alumni posts, photos, and community engagement in one place.</span></div><button onClick={load} disabled={loading}>↻ {loading ? 'Loading' : 'Refresh'}</button></header>
    {message && <p className="admin-resource-message">{message}</p>}
    <GalleryReview />

    <section className="content-summary" aria-label="Content summary"><article><span>All content</span><strong>{counts.all}</strong></article><article><span>Text posts</span><strong>{counts.feed}</strong></article><article><span>Gallery photos</span><strong>{counts.gallery}</strong></article></section>

    <section className="admin-panel content-toolbar"><label><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posts or authors" aria-label="Search posts or authors"/></label><nav aria-label="Content type">{[['all','All'],['feed','Text'],['gallery','Photos']].map(([key,label]) => <button className={filter === key ? 'active' : ''} onClick={() => setFilter(key)} key={key}>{label}<b>{counts[key]}</b></button>)}</nav></section>

    <section className="content-list" aria-live="polite">
      {loading ? <div className="admin-panel content-empty">Loading community content…</div> : visible.length ? visible.map((post) => <article className={`admin-panel content-row ${post.media_url ? 'has-media' : ''}`} key={post.id}>
        {post.media_url && <button className="content-thumbnail" onClick={() => window.open(post.media_url, '_blank', 'noopener,noreferrer')} aria-label="Open post image"><img src={post.media_url} alt="Post attachment"/></button>}
        <div className="content-row-main"><header><span className="content-author-avatar">{initials(post.author_name)}</span><div><strong>{post.author_name}</strong><time>{new Date(post.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · {new Date(post.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div><b className="content-type">{post.media_path ? 'Photo' : 'Text'}</b></header><p>{post.content || 'Photo shared without a caption.'}</p><footer><div><span>♡ <b>{post.reaction_count}</b> reactions</span><span>□ <b>{post.comment_count}</b> comments</span></div><button onClick={() => remove(post)}>Remove</button></footer></div>
      </article>) : <div className="admin-panel content-empty"><strong>No matching posts</strong><span>Try another search or content filter.</span></div>}
    </section>
  </div>;
}
