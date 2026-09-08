import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function HomeAnnouncements({ user, onViewAll }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setItems([]); setError(''); setLoading(Boolean(user));
    if (!user) return;
    supabase.from('alumni_service_items').select('id,title,body,pinned,created_at')
      .eq('kind', 'announcement').order('pinned', { ascending: false })
      .order('created_at', { ascending: false }).limit(3)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError('Announcements could not be loaded. Please try again.');
        else setItems(data || []);
        setLoading(false);
      }).catch(() => { if (active) { setError('Announcements could not be loaded. Please try again.'); setLoading(false); } });
    return () => { active = false; };
  }, [user?.id, revision]);
  return <section className="panel-wide home-announcements" aria-labelledby="home-announcements-title">
    <header><div><p>ALUMNI OFFICE</p><h2 id="home-announcements-title">Official announcements</h2></div>
      {user && <button type="button" onClick={onViewAll}>View all announcements →</button>}
    </header>
    {!user ? <p>Sign in with your verified alumni account to read official announcements.</p> : loading ? <p role="status">Loading announcements…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRevision(n => n + 1)}>Retry</button></p> : items.length ? <div className="home-announcement-list">
      {items.map(item => <article key={item.id}>
        <div className="home-announcement-meta">{item.pinned && <span>Pinned</span>}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time></div>
        <h3>{item.title}</h3>
        <details><summary>Read announcement</summary><p>{item.body}</p></details>
      </article>)}
    </div> : <p>No announcements available for your account yet. Announcements are shared with verified alumni.</p>}
  </section>;
}
