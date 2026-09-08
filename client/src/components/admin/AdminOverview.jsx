import { useEffect, useState } from 'react';
import CommunityOverview from './CommunityOverview.jsx';
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

export default function AdminOverview({ onNavigate, user }) {
  const [overview, setOverview] = useState(null);
  const [attention, setAttention] = useState([]);
  const [error, setError] = useState('');
  const [days,setDays]=useState(30);
  const [analytics,setAnalytics]=useState(null);
  const [health,setHealth]=useState(null);

  async function load() {
    setError('');
    try { const [summary,tasks,insights,system]=await Promise.all([adminApi('/api/admin/overview'),adminApi('/api/admin/attention'),adminApi(`/api/admin/analytics?days=${days}`),adminApi('/api/admin/system-health')]);setOverview(summary);setAttention(tasks.items||[]);setAnalytics(insights);setHealth(system); }
    catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => { load(); }, [days]);

  return <div className="live-admin-overview">
    <header className="admin-page-header"><div><p>Live community overview</p><h1>Alumni System Dashboard</h1><span>Manage alumni, support requests, batch groups, announcements, events and community activity.</span></div><div className="dashboard-range"><select value={days} onChange={e=>setDays(Number(e.target.value))}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button onClick={load}>↻ Refresh</button></div></header>
    {error && <p className="admin-access-error">{error}</p>}
    {user?.role==='admin'&&<CommunityOverview onNavigate={onNavigate}/>}
    {!overview ? <section className="admin-panel admin-live-loading">Loading live system data…</section> : <>
      <section className="admin-attention"><header><div><p>Needs attention</p><h2>Administrative work queue</h2></div><span>{attention.reduce((total,item)=>total+item.count,0)} open</span></header><div>{attention.map(item=><button className={item.count?item.tone:'clear'} key={item.key} onClick={()=>onNavigate(item.page)}><span>{item.label}</span><strong>{item.count}</strong><small>{item.count?'Review items':'All clear'}</small></button>)}</div></section>
      <section className="admin-metrics live-admin-metrics">{metricDefinitions.map(([key, label, note]) => <button className={`admin-metric ${key === 'pendingApprovals' && overview.metrics[key] ? 'alert' : ''}`} key={key} onClick={()=>onNavigate(['totalAlumni','verifiedAlumni','newRegistrations','employers','dualRole'].includes(key)?'Members':key==='pendingApprovals'?'Alumni Verification':['posts','galleryPhotos'].includes(key)?'Social & News':['opportunities','events','eventResponses'].includes(key)?'Opportunities & Events':'Dashboard')}><p>{label}</p><strong>{Number(overview.metrics[key] || 0).toLocaleString()}</strong><span>{note}{key==='newRegistrations'&&analytics?.trends?.registrations!==undefined?` · ${analytics.trends.registrations>=0?'+':''}${analytics.trends.registrations}% vs previous`:''}</span></button>)}</section>
      <section className="dashboard-operational-grid"><article className="admin-panel dashboard-chart"><header><h2>Registration &amp; engagement</h2><span>{days}-day activity</span></header><div>{(analytics?.timeline||[]).map(x=><i key={x.day} title={`${x.day}: ${x.registrations} registrations, ${x.posts} posts`}><b style={{height:`${Math.max(4,Math.min(100,(x.registrations+x.posts)*12))}%`}}/></i>)}</div><footer>Daily registrations and posts</footer></article><article className="admin-panel system-health"><header><h2>System health</h2><span>Checked {health?new Date(health.checkedAt).toLocaleTimeString():''}</span></header>{health?.checks?.map(x=><p key={x.key}><b className={x.status==='configuration_required'?'issue':'ok'}>●</b><span>{x.label}</span><small>{x.status.replaceAll('_',' ')}</small></p>)}<strong>{health?.incidents?.length?`${health.incidents.length} configuration notice(s) need attention`:'Core services operational'}</strong></article></section>
      <section className="admin-demographics-heading"><div><p>Registration insights</p><h2>Alumni &amp; employer profile data</h2><span>Live summaries from education and role selections submitted during account creation.</span></div></section>
      <section className="admin-demographics-grid"><Ranking title="Members by college" subtitle="Top registered departments" items={overview.demographics?.departments} /><Ranking title="Members by course" subtitle="Top registered programs" items={overview.demographics?.courses} /><Ranking title="Graduation years" subtitle="Most represented batches" items={overview.demographics?.graduationYears} /><Ranking title="Community roles" subtitle="Alumni, employers, and dual roles" items={overview.demographics?.roles} /></section>
      <section className="admin-secondary live-people-insights"><article className="admin-panel active-panel"><div className="panel-heading"><div><p>Community engagement</p><h2>Most active members</h2></div><span>Posts ×3 · Comments ×2 · Reactions ×1</span></div>{overview.demographics?.mostActive?.length ? overview.demographics.mostActive.map((person, index) => <div className="active-alumni" key={person.id}><b>{index + 1}</b><span><strong>{person.name}</strong><small>{person.posts} posts · {person.comments} comments · {person.reactions} reactions</small></span><em>{person.score} pts</em></div>) : <p className="demographic-empty">No member engagement yet.</p>}</article><Ranking title="Batch names" subtitle="Names supplied by registered alumni" items={overview.demographics?.batchNames} limit={5} /></section>
      <section className="admin-overview-connections admin-panel"><div className="panel-heading"><div><p>Connected modules</p><h2>System controls</h2></div></div><div>{[
        ['Members', 'Profiles, roles, account status, and registrations'],
        ['Alumni Verification', 'Pending graduation evidence and approvals'],
        ['Opportunities & Events', 'Published opportunities, events, and attendee interest'],
        ['Social & News', 'Feed and gallery content management'],
        ...(user?.role==='admin'?[['Help & Support','Alumni requests, office replies and status updates'],['Community & Requests','Batch groups and official announcements']]:[]),
      ].map(([page, description]) => <button key={page} onClick={() => onNavigate(page)}><strong>{page}</strong><span>{description}</span><b>→</b></button>)}<article><strong>Private chat</strong><span>Activity totals are connected. Message bodies and files remain visible only to participants.</span><b>🔒</b></article></div></section>
      <section className="admin-panel operations"><div className="panel-heading"><div><p>Across connected modules</p><h2>Recent activity</h2></div><button onClick={load}>Refresh</button></div>{overview.activity.length ? overview.activity.map((item) => <div className="operation" key={`${item.type}-${item.id}`}><b>◇</b><span><strong>{item.type} · {item.title}</strong><small>{item.actor} · {relativeTime(item.created_at)}</small></span></div>) : <div className="admin-live-empty">No activity has been recorded yet.</div>}</section>
    </>}
  </div>;
}
