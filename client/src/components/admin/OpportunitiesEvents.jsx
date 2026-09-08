import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';
import { supabase } from '../../lib/supabase.js';
import GoogleMapsLocationPicker from '../OpenStreetMapLocationPicker.jsx';

const blankEvent = { title: '', category: 'Networking', status:'published', capacity:'', registrationDeadline:'', date: '', endDate: '', location: '', latitude: null, longitude: null, description: '', image_url: '' };
const eventImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const eventImageMaxBytes = 10 * 1024 * 1024;
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2), minute = index % 2 ? '30' : '00';
  const value = `${String(hour).padStart(2, '0')}:${minute}`;
  return { value, label: `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}` };
});

function SchedulePicker({ id, label, value, onChange, required = false, minDate }) {
  const datePart = value?.slice(0, 10) || '';
  const timePart = value?.slice(11, 16) || '09:00';
  return <div className="schedule-picker"><div className="schedule-picker-heading"><label htmlFor={`${id}-date`}>{label}</label><small>{required ? 'Required' : 'Optional'}</small></div><div className="schedule-picker-controls"><input id={`${id}-date`} aria-label={`${label} date`} required={required} type="date" min={minDate} value={datePart} onChange={(event)=>onChange(event.target.value ? `${event.target.value}T${timePart}` : '')}/><select aria-label={`${label} time`} disabled={!datePart} value={timePart} onChange={(event)=>onChange(`${datePart}T${event.target.value}`)}>{timeOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>{!required&&value&&<button className="clear-schedule-time" type="button" onClick={()=>onChange('')}>Clear</button>}</div>;
}

export default function OpportunitiesEvents() {
  const [opportunities, setOpportunities] = useState([]), [events, setEvents] = useState([]), [tab, setTab] = useState('active');
  const [message, setMessage] = useState(''), [eventForm, setEventForm] = useState(null), [opportunityForm, setOpportunityForm] = useState(null), [interestList, setInterestList] = useState(null);
  const [eventImageFile, setEventImageFile] = useState(null);
  
  async function load() {
    try { const [opportunitiesResult, eventsResult] = await Promise.all([adminApi('/api/admin/opportunities'), adminApi('/api/admin/resources/events')]); setOpportunities(opportunitiesResult.opportunities || []); setEvents((eventsResult.resources || []).map((item) => ({ id: item.id, ...item.payload, created_at: item.created_at }))); }
    catch (error) { setMessage(error.message); }
  }
  
  useEffect(() => { load(); }, []);
  
  async function uploadEventImage(file) {
    if (!file) return null;
    if (!eventImageTypes.has(file.type)) throw new Error('Choose a JPG, PNG, or WebP event image.');
    if (file.size > eventImageMaxBytes) throw new Error('Event image must be 10 MB or smaller.');
    const fileExt = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `event-images/${fileName}`;
      
    const { error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(filePath, file, { upsert: false, contentType: file.type });
      
    if (uploadError) throw uploadError;
      
    const { data: { publicUrl } } = supabase.storage
      .from('event-images')
      .getPublicUrl(filePath);
      
    return publicUrl;
  }
  
  async function saveOpportunity(event) { event.preventDefault(); try { await adminApi(`/api/admin/opportunities/${opportunityForm.id}`, { method: 'PATCH', body: JSON.stringify(opportunityForm) }); setOpportunityForm(null); setMessage('Opportunity updated.'); load(); } catch (error) { setMessage(error.message); } }
  async function duplicateOpportunity(item){try{await adminApi(`/api/admin/opportunities/${item.id}/duplicate`,{method:'POST'});setMessage('Draft copy created.');load()}catch(error){setMessage(error.message)}}
  async function reportEmployer(item){const reason=window.prompt('Describe the suspected scam or fraudulent employer activity:');if(!reason)return;try{await adminApi(`/api/admin/opportunities/${item.id}/report-employer`,{method:'POST',body:JSON.stringify({reason})});setMessage('Employer concern reported and listing paused.');load()}catch(error){setMessage(error.message)}}
  
  async function saveEvent(event) { 
    event.preventDefault(); 
    if (eventForm.endDate && new Date(eventForm.endDate) <= new Date(eventForm.date)) {
      setMessage('End date and time must be later than the start.');
      return;
    }
    try { 
      let payload = { ...eventForm };
      delete payload.id;
      
      // Upload image if a new file was selected
      if (eventImageFile) payload.image_url = await uploadEventImage(eventImageFile);
      
      await adminApi(eventForm.id ? `/api/admin/resources/events/${eventForm.id}` : '/api/admin/resources/events', { 
        method: eventForm.id ? 'PATCH' : 'POST', 
        body: JSON.stringify({ ...payload, featured: Boolean(payload.featured) }) 
      }); 
      setEventForm(null); 
      setEventImageFile(null);
      setMessage(eventForm.id ? 'Event updated.' : payload.status === 'draft' ? 'Event draft saved.' : 'Event created and published.');
      load(); 
    } catch (error) { 
      setMessage(error.message); 
    } 
  }

  async function deleteEvent(item) {
    if (!item?.id) return;
    if (!window.confirm(`Delete "${item.title}" from the community calendar?`)) return;

    try {
      await adminApi(`/api/admin/resources/events/${item.id}`, { method: 'DELETE' });
      setMessage('Event deleted.');
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }
  
  async function showInterests(event) { try { const result = await adminApi(`/api/admin/events/${event.id}/registrations`); setInterestList({ title: event.title, eventId:event.id, people: (result.registrations || []).map(item=>({ ...item, user_id:item.user_id, name:[item.profiles?.first_name,item.profiles?.last_name].filter(Boolean).join(' ')||'Member', email:item.profiles?.email||'' })) }); } catch (error) { setMessage(error.message); } }
  async function updateAttendance(person,status){try{await adminApi(`/api/admin/events/${interestList.eventId}/registrations/${person.id}`,{method:'PATCH',body:JSON.stringify({status})});setInterestList({...interestList,people:interestList.people.map(item=>item.id===person.id?{...item,status}:item)});}catch(error){setMessage(error.message)}}
  const reviewStatuses=['submitted','under_review','needs_changes'];
  const visible = opportunities.filter((item) => tab==='review'?reviewStatuses.includes(item.status):tab==='archived'?['archived','expired','rejected'].includes(item.status):['active','approved','paused'].includes(item.status)), activeCount = opportunities.filter((item) => item.status === 'active').length, reviewCount=opportunities.filter(item=>reviewStatuses.includes(item.status)).length;
  return <div className="jobs-events-page admin-operations-page">
    <header className="admin-page-header jobs-events-header"><div><p>Operations</p><h1>Opportunities &amp; Events</h1><span>Review submissions, publish trusted opportunities, and manage the community calendar.</span></div><div className="jobs-events-tabs"><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review ({reviewCount})</button><button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Published</button><button className={tab === 'archived' ? 'active' : ''} onClick={() => setTab('archived')}>History</button></div></header>
    {message && <p className="admin-resource-message" role="status"><span aria-hidden="true">✓</span>{message}<button type="button" aria-label="Dismiss message" onClick={()=>setMessage('')}>×</button></p>}
    <section className="operations-summary"><article><small>Published opportunities</small><strong>{activeCount}</strong><span>Visible to alumni</span></article><article><small>Awaiting review</small><strong>{reviewCount}</strong><span>Needs an administrative decision</span></article><article><small>Calendar events</small><strong>{events.length}</strong><span>Draft, scheduled, and published</span></article></section>
    <section className="jobs-events-overview"><article className="admin-panel job-approval-panel"><div className="panel-heading"><div><p>Opportunity library</p><h2>{tab === 'active' ? 'Active opportunities' : 'Archived opportunities'}</h2></div><b className="pending-badge">{visible.length}</b></div><div className="pending-job-list">{visible.length ? visible.map((item) => <article className="pending-job opportunity-admin-row" key={item.id}><span className="job-list-icon">▦</span><div><strong>{item.title}</strong><small>{item.company_name} · {item.category} · Posted by {item.author_name}</small><em>{item.location}</em></div><aside><button onClick={() => setOpportunityForm(item)}>Edit</button></aside></article>) : <div className="admin-empty-state"><strong>No {tab} opportunities</strong></div>}</div></article></section>
    <section className="admin-panel events-attendance-panel"><div className="panel-heading"><div><p>Community calendar</p><h2>Calendar events</h2></div></div><div className="event-management-grid">{events.length ? events.map((item, index) => <article className="event-management-card" key={item.id}><div className={`event-poster poster-${(index % 2) + 1}`} style={item.image_url ? { backgroundImage: `url(${item.image_url})`, backgroundSize: 'cover' } : undefined}><b>{item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : 'TBA'}</b><span>{item.category || 'Event'} · {item.status || 'published'}</span></div><h3>{item.title}</h3><p>⌖ {item.location || 'Location TBA'}</p><footer><span><small>{item.date ? `${new Date(item.date).toLocaleString()}${item.endDate ? ` – ${new Date(item.endDate).toLocaleString()}` : ''}` : 'Date TBA'}</small></span><button onClick={() => showInterests(item)}>Registrations</button><button onClick={() => setEventForm({ ...item, date: item.date?.slice(0, 16) || '', endDate: item.endDate?.slice(0, 16) || '', registrationDeadline:item.registrationDeadline?.slice(0,16)||'' })}>Edit</button><button onClick={() => deleteEvent(item)}>Delete</button></footer></article>) : <div className="admin-empty-state"><strong>No calendar events yet</strong><button onClick={() => setEventForm(blankEvent)}>Create event</button></div>}<button className="add-event-card" onClick={() => setEventForm(blankEvent)}><strong>＋</strong><b>Create event</b><span>Add an event to the alumni calendar</span></button></div></section>
    {opportunityForm && <div className="admin-event-modal"><form onSubmit={saveOpportunity}><header><div><small>Opportunity review</small><h2>{reviewStatuses.includes(opportunityForm.status)?'Review opportunity':'Edit opportunity'}</h2></div><button type="button" onClick={() => setOpportunityForm(null)}>×</button></header><label>Title<input required value={opportunityForm.title} onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })} /></label><label>Company<input required value={opportunityForm.company_name} onChange={(e) => setOpportunityForm({ ...opportunityForm, company_name: e.target.value })} /></label><div className="member-form-grid"><label>Status<select value={opportunityForm.status} onChange={e=>setOpportunityForm({...opportunityForm,status:e.target.value})}>{['submitted','under_review','needs_changes','active','paused','rejected','archived'].map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}</select></label><label>Application deadline<input type="date" value={opportunityForm.application_deadline||''} onChange={e=>setOpportunityForm({...opportunityForm,application_deadline:e.target.value})}/></label></div><div className="member-form-grid"><label>Employment type<input value={opportunityForm.employment_type||''} onChange={e=>setOpportunityForm({...opportunityForm,employment_type:e.target.value})} placeholder="Full-time, internship…"/></label><label>Work arrangement<select value={opportunityForm.work_arrangement||''} onChange={e=>setOpportunityForm({...opportunityForm,work_arrangement:e.target.value})}><option value="">Not specified</option><option>Onsite</option><option>Hybrid</option><option>Remote</option></select></label></div><label>Location<input required value={opportunityForm.location} onChange={(e) => setOpportunityForm({ ...opportunityForm, location: e.target.value })} /></label><label>Description<textarea required value={opportunityForm.description} onChange={(e) => setOpportunityForm({ ...opportunityForm, description: e.target.value })} /></label><label>Reviewer note<textarea value={opportunityForm.reviewer_note||''} onChange={e=>setOpportunityForm({...opportunityForm,reviewer_note:e.target.value})} placeholder="Required when requesting changes or rejecting"/></label><footer><button type="button" onClick={() => setOpportunityForm(null)}>Cancel</button><button>Save decision</button></footer></form></div>}
    {eventForm && <div className="admin-event-modal"><form onSubmit={saveEvent}><header><div><small>Community calendar</small><h2>{eventForm.id ? 'Edit event' : 'Create event'}</h2></div><button type="button" aria-label="Close event editor" onClick={() => { setEventForm(null); setEventImageFile(null); }}>×</button></header><label>Event title<input required maxLength="160" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} /></label><div className="member-form-grid"><label>Category<select value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}>{['Networking', 'Webinars', 'Homecoming'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Visibility<select value={eventForm.status||'published'} onChange={e=>setEventForm({...eventForm,status:e.target.value})}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option><option value="cancelled">Cancelled</option></select></label></div><div className="event-datetime-fields"><SchedulePicker id="event-start" label="Starts" required value={eventForm.date} minDate={new Date().toISOString().slice(0,10)} onChange={(date)=>setEventForm({...eventForm,date,endDate:eventForm.endDate&&date&&new Date(eventForm.endDate)>new Date(date)?eventForm.endDate:'',registrationDeadline:eventForm.registrationDeadline&&date&&new Date(eventForm.registrationDeadline)<=new Date(date)?eventForm.registrationDeadline:''})}/><SchedulePicker id="event-end" label="Ends" value={eventForm.endDate} minDate={eventForm.date?.slice(0,10)} onChange={(endDate)=>setEventForm({...eventForm,endDate})}/></div><div className="member-form-grid"><SchedulePicker id="registration-deadline" label="Registration closes" value={eventForm.registrationDeadline} minDate={new Date().toISOString().slice(0,10)} onChange={(registrationDeadline)=>setEventForm({...eventForm,registrationDeadline})}/><label>Capacity <small>(optional)</small><input type="number" min="1" max="100000" value={eventForm.capacity||''} onChange={e=>setEventForm({...eventForm,capacity:e.target.value})} placeholder="Unlimited"/></label></div><p className="schedule-help">Choose the event schedule. Registration closing time and capacity are optional.</p><GoogleMapsLocationPicker value={eventForm.location} latitude={eventForm.latitude} longitude={eventForm.longitude} onChange={(place)=>setEventForm({...eventForm,...place})}/><label>Event image <small>(optional, JPG/PNG/WebP, up to 10 MB)</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setEventImageFile(e.target.files?.[0] || null)} /></label><label>Description<textarea required maxLength="5000" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} /></label><label className="setting-toggle"><span><strong>Feature this event</strong><p>Show it first on the alumni Events page.</p></span><input type="checkbox" checked={Boolean(eventForm.featured)} onChange={e=>setEventForm({...eventForm,featured:e.target.checked})}/></label><footer><button type="button" onClick={() => { setEventForm(null); setEventImageFile(null); }}>Cancel</button><button>{eventForm.id ? 'Save event' : eventForm.status==='draft' ? 'Save draft' : 'Publish event'}</button></footer></form></div>}
    {interestList && <div className="admin-event-modal"><section className="event-interest-dialog"><header><div><small>Registration & attendance</small><h2>{interestList.title}</h2></div><button onClick={() => setInterestList(null)}>×</button></header><p>{interestList.people.length} registrations</p>{interestList.people.length ? <ul>{interestList.people.map((person) => <li key={person.id}><b>{person.name}</b><span>{person.email} · {person.status}</span><div><button onClick={()=>updateAttendance(person,'attended')}>Check in</button><button onClick={()=>updateAttendance(person,'no_show')}>No show</button></div></li>)}</ul> : <p>No registrations yet.</p>}</section></div>}
  </div>;
}
