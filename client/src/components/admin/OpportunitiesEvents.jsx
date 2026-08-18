import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';
import { supabase } from '../../lib/supabase.js';

const blankEvent = { title: '', category: 'Networking', date: '', endDate: '', location: '', description: '', image_url: '' };

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
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `event-images/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file, { upsert: false });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('event-images')
        .getPublicUrl(filePath);
      
      return publicUrl;
    } catch (error) {
      setMessage('Error uploading image: ' + error.message);
      return null;
    }
  }
  
  async function saveOpportunity(event) { event.preventDefault(); try { await adminApi(`/api/admin/opportunities/${opportunityForm.id}`, { method: 'PATCH', body: JSON.stringify(opportunityForm) }); setOpportunityForm(null); setMessage('Opportunity updated.'); load(); } catch (error) { setMessage(error.message); } }
  
  async function saveEvent(event) { 
    event.preventDefault(); 
    try { 
      let payload = { ...eventForm };
      delete payload.id;
      
      // Upload image if a new file was selected
      if (eventImageFile) {
        const imageUrl = await uploadEventImage(eventImageFile);
        if (imageUrl) {
          payload.image_url = imageUrl;
        }
      }
      
      await adminApi(eventForm.id ? `/api/admin/resources/events/${eventForm.id}` : '/api/admin/resources/events', { 
        method: eventForm.id ? 'PATCH' : 'POST', 
        body: JSON.stringify({ ...payload, featured: Boolean(payload.featured) }) 
      }); 
      setEventForm(null); 
      setEventImageFile(null);
      setMessage(eventForm.id ? 'Event updated.' : 'Event created and published.'); 
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
  
  async function showInterests(event) { try { const result = await adminApi(`/api/admin/events/${event.id}/interests`); setInterestList({ title: event.title, people: result.interests || [] }); } catch (error) { setMessage(error.message); } }
  const visible = opportunities.filter((item) => item.status === tab), activeCount = opportunities.filter((item) => item.status === 'active').length;
  return <div className="jobs-events-page admin-operations-page">
    <header className="admin-page-header jobs-events-header"><div><p>Operations</p><h1>Opportunities &amp; Events</h1><span>Review posts, keep event details current, and manage what alumni can see.</span></div><div className="jobs-events-tabs"><button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active</button><button className={tab === 'archived' ? 'active' : ''} onClick={() => setTab('archived')}>Archived</button></div></header>
    {message && <p className="admin-resource-message">{message}</p>}
    <section className="operations-summary"><article><small>Active opportunities</small><strong>{activeCount}</strong><span>Visible to alumni</span></article><article><small>Archived opportunities</small><strong>{opportunities.length - activeCount}</strong><span>Kept for records</span></article><article><small>Published events</small><strong>{events.length}</strong><span>Shown on Events page</span></article></section>
    <section className="jobs-events-overview"><article className="admin-panel job-approval-panel"><div className="panel-heading"><div><p>Opportunity library</p><h2>{tab === 'active' ? 'Active opportunities' : 'Archived opportunities'}</h2></div><b className="pending-badge">{visible.length}</b></div><div className="pending-job-list">{visible.length ? visible.map((item) => <article className="pending-job opportunity-admin-row" key={item.id}><span className="job-list-icon">▦</span><div><strong>{item.title}</strong><small>{item.company_name} · {item.category} · Posted by {item.author_name}</small><em>{item.location}</em></div><aside><button onClick={() => setOpportunityForm(item)}>Edit</button></aside></article>) : <div className="admin-empty-state"><strong>No {tab} opportunities</strong></div>}</div></article></section>
    <section className="admin-panel events-attendance-panel"><div className="panel-heading"><div><p>Community calendar</p><h2>Published events</h2></div></div><div className="event-management-grid">{events.length ? events.map((item, index) => <article className="event-management-card" key={item.id}><div className={`event-poster poster-${(index % 2) + 1}`} style={item.image_url ? { backgroundImage: `url(${item.image_url})`, backgroundSize: 'cover' } : undefined}><b>{item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : 'TBA'}</b><span>{item.category || 'Event'}</span></div><h3>{item.title}</h3><p>⌖ {item.location || 'Location TBA'}</p><footer><span><small>{item.date ? `${new Date(item.date).toLocaleString()}${item.endDate ? ` – ${new Date(item.endDate).toLocaleString()}` : ''}` : 'Date TBA'}</small></span><button onClick={() => showInterests(item)}>Interested</button><button onClick={() => setEventForm({ ...item, date: item.date?.slice(0, 16) || '', endDate: item.endDate?.slice(0, 16) || '' })}>Edit</button><button onClick={() => deleteEvent(item)}>Delete</button></footer></article>) : <div className="admin-empty-state"><strong>No events published</strong><button onClick={() => setEventForm(blankEvent)}>Create event</button></div>}<button className="add-event-card" onClick={() => setEventForm(blankEvent)}><strong>＋</strong><b>Create event</b><span>Add an event to the alumni calendar</span></button></div></section>
    {opportunityForm && <div className="admin-event-modal"><form onSubmit={saveOpportunity}><header><h2>Edit opportunity</h2><button type="button" onClick={() => setOpportunityForm(null)}>×</button></header><label>Title<input required value={opportunityForm.title} onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })} /></label><label>Company<input required value={opportunityForm.company_name} onChange={(e) => setOpportunityForm({ ...opportunityForm, company_name: e.target.value })} /></label><label>Location<input required value={opportunityForm.location} onChange={(e) => setOpportunityForm({ ...opportunityForm, location: e.target.value })} /></label><label>Description<textarea required value={opportunityForm.description} onChange={(e) => setOpportunityForm({ ...opportunityForm, description: e.target.value })} /></label><footer><button type="button" onClick={() => setOpportunityForm(null)}>Cancel</button><button>Save changes</button></footer></form></div>}
    {eventForm && <div className="admin-event-modal"><form onSubmit={saveEvent}><header><div><small>Community calendar</small><h2>{eventForm.id ? 'Edit event' : 'Create event'}</h2></div><button type="button" onClick={() => { setEventForm(null); setEventImageFile(null); }}>×</button></header><label>Event title<input required value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} /></label><label>Category<select value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}>{['Networking', 'Webinars', 'Homecoming'].map((item) => <option key={item}>{item}</option>)}</select></label><div className="event-datetime-fields"><label>Starts<input required type="datetime-local" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} /></label><label>Ends<input required type="datetime-local" value={eventForm.endDate} min={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })} /></label></div><label>Location<input required value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} /></label><label>Event image <small>(optional)</small><input type="file" accept="image/*" onChange={(e) => setEventImageFile(e.target.files?.[0] || null)} /></label><label>Description<textarea required value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} /></label><footer><button type="button" onClick={() => { setEventForm(null); setEventImageFile(null); }}>Cancel</button><button>{eventForm.id ? 'Save event' : 'Publish event'}</button></footer></form></div>}
    {interestList && <div className="admin-event-modal"><section className="event-interest-dialog"><header><div><small>Event engagement</small><h2>{interestList.title}</h2></div><button onClick={() => setInterestList(null)}>×</button></header><p>{interestList.people.length} alumni interested</p>{interestList.people.length ? <ul>{interestList.people.map((person) => <li key={person.user_id}><b>{person.name}</b><span>{person.email}</span></li>)}</ul> : <p>No alumni have marked interest yet.</p>}</section></div>}
  </div>;
}
