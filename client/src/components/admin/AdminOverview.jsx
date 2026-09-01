import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';

const metricDefinitions = [
  ['totalAlumni', 'Registered alumni', 'Member directory'],
  ['verifiedAlumni', 'Verified alumni', 'Approved profiles'],
  ['newRegistrations', 'New registrations', 'Last 30 days'],
  ['pendingApprovals', 'Pending approvals', 'Needs review'],
  ['posts', 'Feed posts', 'Community content'],
  ['galleryPhotos', 'Gallery photos', 'Images shared in feed'],
  ['opportunities', 'Active opportunities', 'Jobs and programs'],
  ['events', 'Published events', 'Community calendar'],
  ['eventResponses', 'Event interests', 'Alumni responses'],
  ['messages', 'Private messages', 'Count only—content stays private'],
  ['employers', 'Employer accounts', 'Includes dual-role members'],
  ['dualRole', 'Alumni + employers', 'Members with both roles'],
];

function Ranking({ title, subtitle, items = [], limit = 6 }) {
  const visible = items.slice(0, limit);
  const maximum = Math.max(...visible.map((item) => Number(item.value)), 1);
  return <article className="admin-panel demographic-card"><header><h2>{title}</h2><span>{subtitle}</span></header>{visible.length ? <div className="demographic-bars">{visible.map((item) => <div key={item.label}><p><strong>{item.label}</strong><b>{item.value}</b></p><i><span style={{ width: `${Math.max(5, Number(item.value) / maximum * 100)}%` }} /></i></div>)}</div> : <p className="demographic-empty">No registration data yet.</p>}</article>;
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return new Date(value).toLocaleDateString();
}

export default function AdminOverview({ onNavigate }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try { setOverview(await adminApi('/api/admin/overview')); }
    catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => { load(); }, []);

  return <div className="live-admin-overview">
    <header className="admin-page-header"><div><p>Live community overview</p><h1>Alumni System Dashboard</h1><span>Connected to the current member, content, events, opportunities, gallery, and chat records.</span></div><button onClick={load}>↻ Refresh</button></header>
    {error && <p className="admin-access-error">{error}</p>}
    {!overview ? <section className="admin-panel admin-live-loading">Loading live system data…</section> : <>
      <section className="admin-metrics live-admin-metrics">{metricDefinitions.map(([key, label, note]) => <article className={`admin-metric ${key === 'pendingApprovals' && overview.metrics[key] ? 'alert' : ''}`} key={key}><p>{label}</p><strong>{Number(overview.metrics[key] || 0).toLocaleString()}</strong><span>{note}</span></article>)}</section>
      <section className="admin-demographics-heading"><div><p>Registration insights</p><h2>Alumni &amp; employer profile data</h2><span>Live summaries from education and role selections submitted during account creation.</span></div></section>
      <section className="admin-demographics-grid"><Ranking title="Members by college" subtitle="Top registered departments" items={overview.demographics?.departments} /><Ranking title="Members by course" subtitle="Top registered programs" items={overview.demographics?.courses} /><Ranking title="Graduation years" subtitle="Most represented batches" items={overview.demographics?.graduationYears} /><Ranking title="Community roles" subtitle="Alumni, employers, and dual roles" items={overview.demographics?.roles} /></section>
      <section className="admin-secondary live-people-insights"><article className="admin-panel active-panel"><div className="panel-heading"><div><p>Community engagement</p><h2>Most active members</h2></div><span>Posts ×3 · Comments ×2 · Reactions ×1</span></div>{overview.demographics?.mostActive?.length ? overview.demographics.mostActive.map((person, index) => <div className="active-alumni" key={person.id}><b>{index + 1}</b><span><strong>{person.name}</strong><small>{person.posts} posts · {person.comments} comments · {person.reactions} reactions</small></span><em>{person.score} pts</em></div>) : <p className="demographic-empty">No member engagement yet.</p>}</article><Ranking title="Batch names" subtitle="Names supplied by registered alumni" items={overview.demographics?.batchNames} limit={5} /></section>
      <section className="admin-overview-connections admin-panel"><div className="panel-heading"><div><p>Connected modules</p><h2>System controls</h2></div></div><div>{[
        ['Members', 'Profiles, roles, account status, and registrations'],
        ['Alumni Verification', 'Pending graduation evidence and approvals'],
        ['Opportunities & Events', 'Published opportunities, events, and attendee interest'],
        ['Social & News', 'Feed and gallery content management'],
      ].map(([page, description]) => <button key={page} onClick={() => onNavigate(page)}><strong>{page}</strong><span>{description}</span><b>→</b></button>)}<article><strong>Private chat</strong><span>Activity totals are connected. Message bodies and files remain visible only to participants.</span><b>🔒</b></article></div></section>
      <section className="admin-panel operations"><div className="panel-heading"><div><p>Across connected modules</p><h2>Recent activity</h2></div><button onClick={load}>Refresh</button></div>{overview.activity.length ? overview.activity.map((item) => <div className="operation" key={`${item.type}-${item.id}`}><b>◇</b><span><strong>{item.type} · {item.title}</strong><small>{item.actor} · {relativeTime(item.created_at)}</small></span></div>) : <div className="admin-live-empty">No activity has been recorded yet.</div>}</section>
    </>}
  </div>;
}
