import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Opportunities.css';

const categories = ['jobs', 'internships', 'scholarships', 'freelance'];
const emptyForm = { category: 'jobs', title: '', company_name: '', location: '', description: '', requirements: '', tags: '', application_url: '', expires_at: '' };
const labelFor = (value) => value === 'jobs' ? 'Job opportunity' : value === 'freelance' ? 'Freelance' : value.slice(0, -1);
const relativeTime = (date) => { const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000)); return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; };

export default function Opportunities({ user, profile, verificationStatus }) {
  const [opportunities, setOpportunities] = useState([]);
  const [applications, setApplications] = useState({});
  const [saved, setSaved] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('latest');
  const [form, setForm] = useState(emptyForm);
  const [posting, setPosting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(12);

  async function loadOpportunities() {
    setLoading(true); setMessage('');
    const [posts, counts] = await Promise.all([
      supabase.from('opportunities').select('id,user_id,author_name,category,title,company_name,location,description,requirements,application_url,tags,created_at,featured,status,expires_at,updated_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('opportunity_application_counts').select('*'),
    ]);
    if (posts.error || counts.error) setMessage(posts.error?.message || counts.error?.message || 'Could not load opportunities.');
    else { const byId = Object.fromEntries((counts.data || []).map((item) => [item.opportunity_id, item])); setOpportunities((posts.data || []).map((post) => ({ ...post, counts: byId[post.id] || { applicant_count: 0, interested_count: 0 } }))); }
    setLoading(false);
  }

  useEffect(() => { loadOpportunities(); }, []);
  useEffect(() => {
    if (!user?.id || verificationStatus !== 'verified') { setApplications({}); setSaved([]); return; }
    Promise.all([
      supabase.from('opportunity_applications').select('opportunity_id,response').eq('user_id', user.id),
      supabase.from('saved_opportunities').select('opportunity_id').eq('user_id', user.id),
    ]).then(([responses, savedItems]) => {
      if (!responses.error) setApplications(Object.fromEntries((responses.data || []).map((item) => [item.opportunity_id, item.response])));
      if (!savedItems.error) setSaved((savedItems.data || []).map((item) => item.opportunity_id));
    });
  }, [user?.id, verificationStatus]);
  useEffect(() => { setVisibleCount(12); }, [activeCategory, search, sortOrder]);

  const filtered = useMemo(() => opportunities.filter((item) => {
    const text = [item.title, item.company_name, item.location, item.description, item.requirements, ...(item.tags || [])].join(' ').toLowerCase();
    const categoryMatch = activeCategory === 'all' ? item.status==='active' : activeCategory === 'saved' ? saved.includes(item.id) : activeCategory==='my' ? item.user_id===user?.id : item.category === activeCategory;
    return categoryMatch && (!search.trim() || text.includes(search.toLowerCase().trim()));
  }).sort((a, b) => sortOrder === 'latest' ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at)), [opportunities, activeCategory, saved, search, sortOrder,user?.id]);

  async function postOpportunity(event) {
    event.preventDefault();
    if (!user?.id) return setMessage('Please sign in before posting an opportunity.');
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before posting opportunities.');
    setPosting(true); setMessage('');
    const name = [profile?.first_name || user.user_metadata?.first_name, profile?.last_name || user.user_metadata?.last_name].filter(Boolean).join(' ') || 'Alumni member';
    const { error } = await supabase.from('opportunities').insert({ user_id: user.id, author_name: name, category: form.category, title: form.title.trim(), company_name: form.company_name.trim(), location: form.location.trim(), description: form.description.trim(), requirements: form.requirements.trim(), application_url: form.application_url.trim() || null, expires_at:form.expires_at?new Date(`${form.expires_at}T23:59:59`).toISOString():null, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) });
    setPosting(false);
    if (error) return setMessage(error.message);
    setForm(emptyForm); setShowForm(false); setMessage('Opportunity submitted for administrator review.'); loadOpportunities();
  }

  async function respond(item, response) {
    if (!user?.id) return setMessage('Please sign in before responding to an opportunity.');
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before responding to opportunities.');
    if (item.user_id === user.id) return setMessage('You cannot respond to your own opportunity.');
    const { error } = await supabase.from('opportunity_applications').upsert({ opportunity_id: item.id, user_id: user.id, response }, { onConflict: 'opportunity_id,user_id' });
    if (error) return setMessage(error.message);
    setApplications((current) => ({ ...current, [item.id]: response }));
    setMessage(response === 'applied' ? 'Your application status has been recorded.' : 'Your interest has been recorded.');
    loadOpportunities();
  }

  async function withdrawResponse(item){const{error}=await supabase.from('opportunity_applications').delete().eq('opportunity_id',item.id).eq('user_id',user.id);if(error)return setMessage(error.message);setApplications(current=>{const next={...current};delete next[item.id];return next});setMessage('Your response was withdrawn.');loadOpportunities()}
  async function manageOpportunity(item,action){const{error}=await supabase.rpc('manage_own_opportunity',{p_id:item.id,p_action:action});if(error)return setMessage(error.message);setSelected(null);setMessage(action==='reopen'?'Opportunity reopened.':'Opportunity closed.');loadOpportunities()}

  async function toggleSaved(item) {
    if (!user?.id) return setMessage('Sign in to save opportunities.');
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before saving opportunities.');
    const isSaved = saved.includes(item.id);
    const result = isSaved ? await supabase.from('saved_opportunities').delete().eq('opportunity_id', item.id).eq('user_id', user.id) : await supabase.from('saved_opportunities').insert({ opportunity_id: item.id, user_id: user.id });
    if (result.error) return setMessage(result.error.message);
    setSaved((current) => isSaved ? current.filter((id) => id !== item.id) : [...current, item.id]);
  }

  const nav = [{ id: 'all', label: 'All Opportunities' }, ...categories.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })), { id: 'saved', label: 'Saved' }, {id:'my',label:'My opportunities'}];
  return <div className="opportunities-page"><section className="opportunity-hero"><div><p className="opportunity-kicker">NDDU Alumni Network</p><h1>Grow together.<br/>Go further.</h1><p>Discover jobs, internships, scholarships, and projects shared by the alumni community.</p><button onClick={() => setShowForm(true)}>＋ Post an Opportunity</button></div></section><div className="opportunity-shell"><aside className="opportunity-sidebar"><h2>Explore</h2>{nav.map((item) => <button key={item.id} className={activeCategory === item.id ? 'active' : ''} onClick={() => setActiveCategory(item.id)}>{item.label}</button>)}</aside><section className="opportunity-content" aria-labelledby="opportunities-title"><header><div><p className="opportunity-kicker">Community opportunities</p><h2 id="opportunities-title">{activeCategory === 'all' ? 'Latest opportunities' : nav.find((item) => item.id === activeCategory)?.label}</h2></div><div className="opportunity-tools"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, company, skill…" aria-label="Search opportunities"/><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort opportunities"><option value="latest">Newest first</option><option value="oldest">Oldest first</option></select></div></header>{message && <p className="opportunity-message" role="status">{message}</p>}<div className="opportunity-list">{loading ? <p className="feed-empty" role="status">Loading opportunities…</p> : filtered.length === 0 ? <div className="no-opportunities"><h3>No opportunities found</h3><p>Try another category or search term.</p></div> : filtered.slice(0, visibleCount).map((item) => <article className="opportunity-card" key={item.id}><div className="opportunity-card-top"><div className="opportunity-icon">▣</div><div className="opportunity-main"><div className="opportunity-meta"><span className="opportunity-type">{labelFor(item.category)}</span><span className="opportunity-posted">{item.status==='archived'?'Closed':relativeTime(item.created_at)}</span></div><h3>{item.title}</h3><p className="opportunity-company">{item.company_name}</p><p className="opportunity-location">⌖ {item.location}</p><p className="opportunity-description">{item.description}</p><div className="opportunity-tags">{(item.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div><p className="opportunity-counts">{item.counts.applicant_count} applied · {item.counts.interested_count} interested</p></div><button className={`save-opportunity ${saved.includes(item.id) ? 'saved' : ''}`} aria-label={saved.includes(item.id) ? `Remove ${item.title} from saved opportunities` : `Save ${item.title}`} onClick={() => toggleSaved(item)}>{saved.includes(item.id) ? '♥' : '♡'}</button></div><div className="opportunity-card-footer"><span>Posted by {item.author_name}</span>{item.user_id===user?.id&&<button className="owner-opportunity-action" onClick={()=>manageOpportunity(item,item.status==='active'?'close':'reopen')}>{item.status==='active'?'Close':'Reopen'}</button>}<button className="view-opportunity" onClick={() => setSelected(item)}>View opportunity →</button></div></article>)}</div>{visibleCount < filtered.length && <button className="opportunity-load-more" onClick={() => setVisibleCount((count) => count + 12)}>Load more</button>}</section></div>
    {showForm && <div className="opportunity-modal" role="presentation" onMouseDown={() => setShowForm(false)}><form className="opportunity-dialog" role="dialog" aria-modal="true" aria-label="Post an opportunity" onSubmit={postOpportunity} onMouseDown={(event) => event.stopPropagation()}><header><h2>Post an opportunity</h2><button type="button" aria-label="Close" onClick={() => setShowForm(false)}>×</button></header><div className="opportunity-form-grid"><label>Type<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item} value={item}>{labelFor(item)}</option>)}</select></label><label>Company / organization<input required maxLength="150" value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })}/></label><label>Opportunity title<input required maxLength="160" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label><label>Location<input required maxLength="160" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}/></label></div><label>Details<textarea required maxLength="4000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label><label>Requirements<textarea required maxLength="4000" value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })}/></label><label>Skills / tags<input maxLength="500" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })}/></label><label>Expires on (optional)<input type="date" min={new Date().toISOString().slice(0,10)} value={form.expires_at} onChange={(event)=>setForm({...form,expires_at:event.target.value})}/></label><label>External application link<input type="url" maxLength="2048" value={form.application_url} onChange={(event) => setForm({ ...form, application_url: event.target.value })} placeholder="https://"/></label><footer><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="post-opportunity-button" disabled={posting}>{posting ? 'Submitting…' : 'Submit for review'}</button></footer></form></div>}
    {selected && <div className="opportunity-modal" role="presentation" onMouseDown={() => setSelected(null)}><section className="opportunity-dialog opportunity-details" role="dialog" aria-modal="true" aria-label={selected.title} onMouseDown={(event) => event.stopPropagation()}><header className="opportunity-details-header"><div><span className="opportunity-type">{labelFor(selected.category)}</span><h2>{selected.title}</h2><p>{selected.company_name}</p></div><button aria-label="Close opportunity details" onClick={() => setSelected(null)}>×</button></header><p>⌖ {selected.location} · Posted by {selected.author_name}</p><h3>About this opportunity</h3><p className="detail-copy">{selected.description}</p><h3>Requirements</h3><p className="detail-copy">{selected.requirements || 'No additional requirements provided.'}</p><footer>{selected.user_id===user?.id?<><button className="interest-button" onClick={()=>manageOpportunity(selected,selected.status==='active'?'close':'reopen')}>{selected.status==='active'?'Close opportunity':'Reopen opportunity'}</button></>:<><button className="interest-button" onClick={()=>applications[selected.id]?withdrawResponse(selected):respond(selected,'interested')}>{applications[selected.id]? 'Withdraw response':'I’m interested'}</button>{selected.application_url&&<a className="post-opportunity-button" href={selected.application_url} target="_blank" rel="noopener noreferrer">Open application ↗</a>}<button className="post-opportunity-button" onClick={()=>respond(selected,'applied')}>{applications[selected.id]==='applied'?'✓ Application recorded':'Mark as applied'}</button></>}</footer></section></div>}
  </div>;
}
