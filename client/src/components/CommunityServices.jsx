import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './CommunityServices.css';
import BatchGroups from './BatchGroups.jsx';
import HelpCenter from './HelpCenter.jsx';

const statuses = { submitted: 'Submitted', reviewing: 'Being reviewed', needs_information: 'Needs information', completed: 'Completed' };
const date = value => new Date(value).toLocaleString();
async function result(query) {
  const { data, error } = await query;
  if (error) throw new Error(['42P01', 'PGRST205'].includes(error.code) ? 'Community services are not available yet. The administrator must apply the community services database migration.' : error.message);
  return data;
}

export default function CommunityServices({ user, admin = false, onBackToFeed, initialTab = 'announcement', initialAnnouncementId, requestOnly = false }) {
  const [tab, setTab] = useState(initialTab);
  const [spaces, setSpaces] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [space, setSpace] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [manager, setManager] = useState(false);
  const [verified, setVerified] = useState(false);
  const support=tab==='request'&&!admin;
  const requestsRef=useRef(null),composeRef=useRef(null);
  const [requestSubject,setRequestSubject]=useState('');
  const [requestLimit,setRequestLimit]=useState(100);
  const [category,setCategory]=useState('General assistance');
  const [requesters,setRequesters]=useState({});
  const [categoryFilter,setCategoryFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('all');
  function openSupport(category,topic=''){setCategory(category);setRequestSubject(topic?`${topic}: `:'');setCompose(true);setTimeout(()=>{composeRef.current?.scrollIntoView({behavior:'smooth',block:'center'});composeRef.current?.querySelector('input')?.focus({preventScroll:true});},0);}
  const [compose, setCompose] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setManager(false); setVerified(false);
    if (user?.id) Promise.all([result(supabase.from('profiles').select('role,status').eq('id', user.id).single()), result(supabase.rpc('community_manager'))]).then(([p, allowed]) => {
      if (!cancelled) { setManager(allowed === true); setVerified(p.status === 'verified'); }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user?.id]);
  useEffect(() => {
    let cancelled = false;
    setItems([]); setError('');
    if (!user) return;
    setLoading(true);
    async function load() {
      const [groups, joined] = tab === 'discussion' ? await Promise.all([
        result(supabase.from('alumni_spaces').select('*').order('name')),
        result(supabase.from('alumni_space_members').select('space_id').eq('user_id', user.id)),
      ]) : [[], []];
      let query = supabase.from('alumni_service_items').select('*').eq('kind', tab).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(tab==='request'?requestLimit:100);
      if (tab === 'discussion') query = query.eq('space_id', space || '00000000-0000-0000-0000-000000000000');
      if (tab === 'request' && !admin) query = query.eq('author_id', user.id);
      const rows = await result(query);
      if(initialAnnouncementId && tab==='announcement'){
        const target=await result(supabase.from('alumni_service_items').select('*').eq('id',initialAnnouncementId).eq('kind','announcement').maybeSingle());
        if(!cancelled){if(target){if(!rows.some(r=>r.id===target.id))rows.unshift(target);else{rows.splice(rows.findIndex(r=>r.id===target.id),1);rows.unshift(target);}setSelected(target);}else setNotice('This announcement is no longer available or you do not have access.');}
      }
      if(admin&&tab==='request'&&rows.length){const ids=[...new Set(rows.map(row=>row.author_id))];const people=await result(supabase.from('profiles').select('id,first_name,last_name,avatar_url').in('id',ids));if(!cancelled)setRequesters(Object.fromEntries(people.map(person=>[person.id,person])));}
      if (!cancelled) { setSpaces(groups); setMemberships(joined.map(m => m.space_id)); setItems(rows); if(!initialAnnouncementId)setSelected(current=>rows.find(row=>row.id===current?.id)||null); }
    }
    load().catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    const timer=tab==='request'?setInterval(()=>{if(!document.hidden)load().catch(e=>{if(!cancelled)setError(e.message);});},15000):null;
    return () => { cancelled = true; if(timer)clearInterval(timer); };
  }, [user?.id, tab, space, revision, admin,requestLimit]);
  useEffect(()=>{setReplies([]);},[selected?.id]);
  useEffect(() => {
    let cancelled = false;
    if(!selected)return;
    const load=()=>result(supabase.from('alumni_service_replies').select('*').eq('item_id', selected.id).order('created_at')).then(rows => { if (!cancelled) setReplies(rows); }).catch(e => { if (!cancelled) setError(e.message); });load();
    return () => { cancelled = true; };
  }, [selected]);
  async function mutate(action, success, reload = true) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success);window.dispatchEvent(new Event('support-requests-changed')); if (reload) setRevision(n => n + 1); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function publish(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if(fields.get('title').trim().length<3||!fields.get('body').trim()){setError('Enter a subject with at least 3 characters and describe your request.');return;}
    await mutate(async () => {
      await result(supabase.from('alumni_service_items').insert({ kind: tab, author_id: user.id, space_id: tab === 'discussion' ? space : null, title: fields.get('title').trim(), body: fields.get('body').trim(), category: fields.get('category') || 'General assistance' }));
      setCompose(false);
    }, tab === 'request' ? 'Request submitted. Open it below to follow its status and replies.' : 'Published successfully.');
  }
  const joined = memberships.includes(space);
  const canCompose = (tab === 'request' && !admin) || (tab === 'announcement' ? admin && manager : joined && verified);
  const filtered = items.filter(i => `${i.title} ${i.body} ${requesters[i.author_id]?.first_name||''} ${requesters[i.author_id]?.last_name||''}`.toLowerCase().includes(search.toLowerCase())&&(tab!=='request'||statusFilter==='all'||i.status===statusFilter)&&(categoryFilter==='all'||tab!=='request'||i.category===categoryFilter));
  if (tab === 'discussion') return <>
    {admin && <div className="community-services"><button type="button" onClick={() => setTab('announcement')}>← Back to community management</button></div>}
    <BatchGroups user={user} admin={admin} onBackToFeed={onBackToFeed} />
  </>;
  return <section className="community-services">
    {onBackToFeed && <button type="button" className="cs-back-to-feed" onClick={onBackToFeed}>← Back to community feed</button>}
    {support?<HelpCenter onRequest={openSupport} onRequests={()=>requestsRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}/>:<header className="cs-heading"><span>NDDU ALUMNI COMMUNITY</span><h1>{admin ? requestOnly?'Help & Support requests':'Community management' : tab === 'announcement' ? 'Official announcements' : tab === 'discussion' ? 'Alumni groups' : 'Help & support'}</h1><p>{admin ? requestOnly?'Read alumni requests, reply to questions, and keep members informed of their progress.':'Manage official updates, alumni groups, and support requests.' : tab === 'announcement' ? 'Read the latest official updates and notices from the alumni office.' : tab === 'discussion' ? 'Find your batch, join a group, and connect with fellow alumni.' : 'Contact the alumni office, track your requests, and follow up on replies.'}</p></header>}
    {!user ? <p className="cs-card">Please sign in to access announcements, groups, and your requests.</p> : <>
      {admin && !requestOnly && <nav className="cs-tabs" aria-label="Community sections">{[['announcement', 'Official announcements'], ['discussion', 'Alumni groups'], ['request', 'Request queue']].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setCompose(false); setNotice(''); setSearch(''); }}>{label}</button>)}</nav>}
      {error && <div className="cs-feedback" role="alert">{error} <button onClick={() => setRevision(n => n + 1)}>Retry</button></div>}
      {notice && <p role="status" className="cs-feedback">{notice}</p>}
      {admin && !manager && <p className="cs-card">Management requires a verified administrator account and a current session. Sign in again if your session expired, and complete MFA if required. Staff permissions are not expanded automatically.</p>}
      {tab === 'discussion' && <div className="cs-card">
        <h2>Find your community</h2><p>Groups are created by the alumni office. Verified alumni can join and participate. Discussions are visible to group members and administrators.</p>
        {!verified && <p>Complete alumni verification to join groups.</p>}
        <div className="cs-toolbar"><label>Group<select value={space} onChange={e => setSpace(e.target.value)}><option value="">Choose a group</option>{spaces.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>
          {space && verified && <button disabled={busy} onClick={() => mutate(() => result(joined ? supabase.from('alumni_space_members').delete().eq('space_id', space).eq('user_id', user.id) : supabase.from('alumni_space_members').insert({ space_id: space, user_id: user.id })), joined ? 'You left the group.' : 'You joined the group.')}>{joined ? 'Leave group' : 'Join group'}</button>}
        </div><p>{spaces.find(g => g.id === space)?.description}</p>
        {admin && manager && <details><summary>Create an alumni group</summary><form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); mutate(async () => { await result(supabase.from('alumni_spaces').insert({ name: f.get('name').trim(), description: f.get('description').trim() })); form.reset(); }, 'Group created.'); }}><label>Group name<input name="name" required minLength={3} maxLength={100} placeholder="Example: BSIT — Class of 2023" /></label><label>Description<textarea name="description" maxLength={1000} /></label><button disabled={busy}>Create group</button></form></details>}
      </div>}
      <div className="cs-section-heading" ref={requestsRef}>
        <div>
          <h2>{tab === 'announcement' ? 'Official announcements' : tab === 'discussion' ? 'Group discussions' : admin ? 'Request queue' : 'My requests'}</h2>
          <p>{tab === 'announcement' ? 'Updates and notices from the alumni office.' : tab === 'discussion' ? 'Share updates and connect with your group.' : 'Follow up on requests and conversations with the alumni office.'}</p>
        </div>
        {canCompose && <button type="button" className="cs-primary cs-create-action" disabled={busy} aria-expanded={compose} aria-controls="cs-compose-form" onClick={() => {setRequestSubject('');setCategory('General assistance');setCompose(v => !v);}}>{compose ? 'Cancel' : <><span aria-hidden="true">+ </span>{tab === 'request' ? 'New request' : tab === 'discussion' ? 'Start a discussion' : 'Publish announcement'}</>}</button>}
      </div>
      <div className="cs-toolbar">{tab==='request'&&<label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All requests</option>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}{admin&&tab==='request'&&<label>Topic<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">All topics</option>{['General assistance','Record correction','Document inquiry'].map(c=><option key={c}>{c}</option>)}</select></label>}<label>Search {tab === 'request' ? 'requests' : tab === 'discussion' ? 'discussions' : 'announcements'}<input value={search} onChange={e => setSearch(e.target.value)} placeholder={admin&&tab==='request'?'Search loaded requests or alumni names':'Search by title or description'} /></label></div>
      {tab === 'request' && compose && <p className="support-privacy">Your request is private to you and authorized administrators. Please leave out passwords, payment details and identity documents.</p>}
      {compose && canCompose && <form ref={composeRef} id="cs-compose-form" className="cs-card" onSubmit={publish}>{support&&<><h2>Contact the alumni office</h2><p>Tell us what you need help with. You can track this conversation in My requests after sending.</p></>}
        {tab === 'request' && <label>What do you need help with?<select name="category" value={category} onChange={e=>setCategory(e.target.value)}><option>General assistance</option><option>Record correction</option><option>Document inquiry</option></select></label>}
        <label>{support?'Subject':'Title'}<input name="title" key={requestSubject} defaultValue={support?requestSubject:undefined} placeholder={support?'Briefly describe what you need help with':undefined} required minLength={3} maxLength={160} /></label>
        <label>{tab === 'request' ? 'Describe your request' : 'Message'}<textarea name="body" placeholder={support?'Describe your question or problem and any steps you have already tried.':undefined} required minLength={1} maxLength={5000} rows={5} /></label>
        <button className="cs-primary" disabled={busy}>{busy ? 'Saving…' : tab === 'request' ? 'Submit request' : 'Publish'}</button>
      </form>}
      {loading ? <p role="status">Loading…</p> : <div className="cs-list">{filtered.map(item => <article className="cs-card" key={item.id}>
        {admin&&item.kind==='request'&&<div className="support-requester"><span>{requesters[item.author_id]?.avatar_url?<img src={requesters[item.author_id].avatar_url} alt=""/>:(requesters[item.author_id]?.first_name?.[0]||'A')}</span><div><strong>{[requesters[item.author_id]?.first_name,requesters[item.author_id]?.last_name].filter(Boolean).join(' ')||'Alumni member'}</strong><small>Request #{item.id.slice(0,8).toUpperCase()}</small></div></div>}<small>{item.kind === 'announcement' ? 'OFFICIAL • ALUMNI OFFICE' : item.kind === 'request' ? `${item.category} • ${statuses[item.status]}` : 'GROUP DISCUSSION'}{item.pinned && ' • PINNED'}</small>
        <h2><button className="cs-title" onClick={() => setSelected(selected?.id === item.id ? null : item)} aria-expanded={selected?.id === item.id}>{item.title}</button></h2><time dateTime={item.created_at}>{date(item.created_at)}</time>
        <p className="cs-body">{selected?.id === item.id ? item.body : item.body.slice(0, 220) + (item.body.length > 220 ? '…' : '')}</p>
        <button onClick={() => setSelected(selected?.id === item.id ? null : item)}>{selected?.id === item.id ? 'Close conversation' : item.kind==='request'?'View conversation':'View details'}</button>
        {selected?.id === item.id && <div className="cs-details">
          {admin && manager && item.kind === 'request' && <label>Update request status<select disabled={busy} value={item.status} onChange={e => mutate(() => result(supabase.from('alumni_service_items').update({ status: e.target.value }).eq('id', item.id).select('id').single()), 'Status updated.')}>{Object.entries(statuses).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>}
          {admin && manager && item.kind === 'announcement' && <button disabled={busy} onClick={() => mutate(() => result(supabase.from('alumni_service_items').update({ pinned: !item.pinned }).eq('id', item.id)), 'Announcement updated.')}>{item.pinned ? 'Unpin' : 'Pin announcement'}</button>}
          {item.kind !== 'announcement' && <><h3>Conversation</h3>{replies.length === 0 && <p>No replies yet.</p>}{replies.map(reply => <div className="cs-reply" key={reply.id}><small>{reply.author_id === user.id ? 'You' : item.kind === 'request' ? (reply.author_id === item.author_id ? 'Requester' : 'Alumni office') : 'Group member'} • {date(reply.created_at)}</small><p className="cs-body">{reply.body}</p></div>)}
            {(item.kind === 'request' || joined) && <form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); mutate(async () => { const added = await result(supabase.from('alumni_service_replies').insert({ item_id: item.id, author_id: user.id, body: f.get('reply').trim() }).select().single()); setReplies(old => [...old, added]); form.reset(); }, 'Reply sent.', false); }}><label>{admin&&item.kind==='request'?'Reply to alumnus':'Your reply'}<textarea name="reply" required maxLength={3000} rows={3} /></label><button disabled={busy}>{busy?'Sending...':'Send reply'}</button></form>}
          </>}
        </div>}
      </article>)}{!filtered.length && !error && <p className="cs-card">{tab === 'discussion' && !space ? 'Choose a group above to get started.' : tab === 'discussion' && !joined && !admin ? 'Join this group to view its discussions.' : search||statusFilter!=='all' ? 'No matching requests or entries. Try another search or filter.' : support ? 'No support requests yet. Need a hand? Choose a help topic above or select New request to contact the alumni office.' : 'Nothing here yet.'}</p>}</div>}
      {tab==='request'&&items.length>=requestLimit&&<button type="button" disabled={loading||busy} onClick={()=>setRequestLimit(n=>n+100)}>Load older requests</button>}<p className="cs-note">{tab==='request'?`Showing ${items.length} requests. New replies and status changes are checked every 15 seconds while this page is visible.`:'Showing up to 100 recent entries. Use Refresh to check for new updates.'} <button disabled={loading || busy} onClick={() => setRevision(n => n + 1)}>{tab==='request'?'Check for updates':'Refresh'}</button></p>
    </>}
  </section>;
}
