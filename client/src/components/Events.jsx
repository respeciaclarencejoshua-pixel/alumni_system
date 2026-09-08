import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Events.css';

function formatDateLabel(dateString) {
  if (!dateString) return 'TBA';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMonthDay(dateString) {
  if (!dateString) return 'TBA';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date).toUpperCase();
}

function formatShortTime(dateString) {
  if (!dateString) return 'TBA';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function EventCountdown({ startDate, endDate }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const start = new Date(startDate).getTime(), end = endDate ? new Date(endDate).getTime() : null;
  const target = end && now >= start ? end : start;
  const seconds = Math.max(0, Math.floor((target - now) / 1000));
  const parts = [Math.floor(seconds / 86400), Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return <div className="event-countdown"><p>{end && now >= start ? 'Event ends in' : 'Event starts in'}</p><div>{parts.map((part, index) => <span key={['Days', 'Hours', 'Minutes', 'Seconds'][index]}><strong>{String(part).padStart(2, '0')}</strong><small>{['Days', 'Hours', 'Minutes', 'Seconds'][index]}</small></span>)}</div></div>;
}

function EventVisual({ event, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (event?.image_url && !imageFailed) {
    return <img src={event.image_url} alt={`${event.title} event`} loading="lazy" onError={() => setImageFailed(true)} />;
  }
  return <div className="event-image-fallback" aria-label="No event image available"><span className="event-fallback-mark" aria-hidden="true">NDDU</span><span className="event-fallback-icon" aria-hidden="true">▦</span><div><small>{event?.category || 'Alumni event'}</small><strong>NDDU Alumni Events</strong><time>{formatMonthDay(event?.date)}</time></div></div>;
}

function EventLocationMap({ event }) {
  const lat = Number(event.latitude), lng = Number(event.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const delta = .012;
  const bbox = `${lng-delta},${lat-delta},${lng+delta},${lat+delta}`;
  return <section className="public-event-map" aria-label="Event map"><iframe title={`Map for ${event.title}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`} loading="lazy"/><a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer">View location in OpenStreetMap ↗</a></section>;
}

export default function EventsPage({ user, verificationStatus }) {
  const [events, setEvents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All Events');
  const [selectedTimeframe, setSelectedTimeframe] = useState('All dates');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateSearch, setDateSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [interestedIds, setInterestedIds] = useState([]);
  const [registrationStatuses, setRegistrationStatuses] = useState({});
  const [eventMessage, setEventMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState('');const[reloadKey,setReloadKey]=useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        setLoadError('');
        const response = await fetch('/api/events');
        if (!response.ok) throw new Error('Unable to load events');
        const payload = await response.json();
        const loaded = Array.isArray(payload?.events) ? payload.events : [];
        if (isMounted) {
          setEvents(loaded);
        }
      } catch (error) {
        setLoadError(error.message||'Events could not be loaded.');
        if (isMounted) {
          setEvents([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadEvents();
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!user?.id || verificationStatus !== 'verified') { setInterestedIds([]); setRegistrationStatuses({}); return; }
    let active = true;
    supabase.from('event_registrations').select('event_id,status').eq('user_id', user.id).then(({ data, error }) => {
      if (!active || error) return;
      const current = (data || []).filter((item) => ['registered','waitlisted','attended'].includes(item.status));
      setInterestedIds(current.map((item) => item.event_id));
      setRegistrationStatuses(Object.fromEntries(current.map((item) => [item.event_id, item.status])));
    });
    return () => { active = false; };
  }, [user?.id, verificationStatus]);

  const categories = ['All Events', ...new Set(events.map(event=>event.category).filter(Boolean))];

  const filteredEvents = useMemo(() => {
    const now = new Date();

    const byCategory = events.filter((event) => {
      const category = event.category || 'Networking';
      return selectedCategory === 'All Events' || category === selectedCategory;
    });

    const byTimeframe = byCategory.filter((event) => {
      const eventDate = new Date(event.date || event.startDate || event.created_at || new Date());
      if (selectedTimeframe === 'All dates') return true;
      return selectedTimeframe === 'Upcoming' ? eventDate >= now : eventDate < now;
    });

    const byLocation = byTimeframe.filter((event) => {
      if (!locationFilter) return true;
      const place = `${event.location || ''} ${event.city || ''}`.toLowerCase();
      return place.includes(locationFilter.toLowerCase());
    });

    return byLocation.filter((event) => {
      const date = new Date(event.date || event.startDate || event.created_at);
      const matchesMonth = selectedMonth === 'all' || date.getMonth() === Number(selectedMonth);
      const matchesYear = selectedYear === 'all' || date.getFullYear() === Number(selectedYear);
      const searchable = `${event.title || ''} ${event.description || ''} ${event.location || ''}`.toLowerCase();
      return matchesMonth && matchesYear && (!dateSearch.trim() || searchable.includes(dateSearch.toLowerCase().trim()));
    });
  }, [events, selectedCategory, selectedTimeframe, locationFilter, selectedMonth, selectedYear, dateSearch]);

  const eventYears = [...new Set(events.map((event) => new Date(event.date || event.startDate || event.created_at).getFullYear()).filter(Number.isFinite))].sort((a, b) => a - b);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const featuredEvent = filteredEvents.find((event) => event.featured) || filteredEvents[0];
  const otherEvents = filteredEvents.filter((event) => event.id !== (featuredEvent?.id ?? ''));
  const isRegistrationClosed = (event) => {
    const closesAt = event.registrationDeadline || event.date;
    return Boolean(closesAt && new Date(closesAt) <= new Date());
  };
  const registrationAction = (event) => registrationStatuses[event.id] === 'waitlisted' ? 'Leave waitlist' : interestedIds.includes(event.id) ? 'Cancel registration' : isRegistrationClosed(event) ? 'Registration closed' : 'Register for event';
  async function markInterested(event) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return setEventMessage('Please sign in before marking interest.');
    if (verificationStatus !== 'verified') return setEventMessage('Complete alumni verification before registering for events.');
    if (isRegistrationClosed(event)) return setEventMessage('Registration for this event is closed.');
    const { data, error } = await supabase.rpc('manage_event_registration', { p_event_id: event.id, p_action: 'register' });
    if (error) return setEventMessage(error.message);
    setInterestedIds((current) => current.includes(event.id) ? current : [...current, event.id]);
    setEvents((current) => current.map((item) => item.id === event.id && !interestedIds.includes(event.id) ? { ...item, interest_count: (item.interest_count || 0) + 1 } : item));
    setRegistrationStatuses((current) => ({ ...current, [event.id]: data.status }));
    setEventMessage(data.status === 'waitlisted' ? 'This event is full. You have been added to the waitlist.' : 'You are registered for this event.');
  }

  async function removeInterest(event) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return setEventMessage('Please sign in to manage your interests.');
    if (verificationStatus !== 'verified') return setEventMessage('Complete alumni verification before managing event registration.');
    const { error } = await supabase.rpc('manage_event_registration', { p_event_id: event.id, p_action: 'cancel' });
    if (error) return setEventMessage(error.message);
    setInterestedIds((current) => current.filter((id) => id !== event.id));
    setRegistrationStatuses((current) => { const next = { ...current }; delete next[event.id]; return next; });
    setEvents((current) => current.map((item) => item.id === event.id && interestedIds.includes(event.id) ? { ...item, interest_count: Math.max(0, (item.interest_count || 0) - 1) } : item));
    setEventMessage('Your event registration has been cancelled.');
  }

  return (
    <div className="events-page-shell">
      <div className="events-page-content">
        <div className="events-page-title-block">
          <h1>Alumni Events</h1>
          <p>
            Connect, learn, and grow with our global network. From local networking mixers to
            international homecoming celebrations.
          </p>
        </div>

        <section className="events-date-toolbar" aria-label="Event date and search controls">
          <label className="event-search"><span aria-hidden="true">⌕</span><input value={dateSearch} onChange={(event) => setDateSearch(event.target.value)} placeholder="Search by title, description, or place" /></label>
          <div className="date-select-group"><select aria-label="Filter by month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="all">All months</option>{monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}</select><select aria-label="Filter by year" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">All years</option>{eventYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
          <button className="clear-event-filters" type="button" onClick={()=>{setSelectedCategory('All Events');setSelectedTimeframe('Upcoming');setLocationFilter('');setDateSearch('');setSelectedMonth('all');setSelectedYear('all');}}>Reset</button>
        </section>

        <div className="events-layout">
          <aside className="events-sidebar">
            <div className="filter-group">
              <h2>Category</h2>
              {categories.map((category) => (
                <label key={category} className="filter-option">
                  <input
                    type="radio" name="event-category"
                    checked={selectedCategory === category}
                    onChange={() => setSelectedCategory(category)}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h2>Timeframe</h2>
              {['All dates', 'Upcoming', 'Past Events'].map((period) => (
                <label key={period} className="filter-option">
                  <input
                    type="radio" name="event-timeframe"
                    checked={selectedTimeframe === period}
                    onChange={() => setSelectedTimeframe(period)}
                  />
                  <span>{period}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h2>Location</h2>
              <input
                className="location-input"
                type="text"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder="Filter by city..."
              />
            </div>
          </aside>

          <main className="events-main-panel">
            {loading ? (
              <div className="events-empty-state">Loading upcoming events...</div>
            ) : loadError ? (
              <div className="events-empty-state" role="alert"><p>{loadError}</p><button onClick={()=>setReloadKey(key=>key+1)}>Try again</button></div>
            ) : !featuredEvent ? (
              <div className="events-empty-state">No events match your current filters.</div>
            ) : (
              <>
                <article className="featured-event-card">
                  <div className="featured-image"><EventVisual event={featuredEvent}/></div>

                  <div className="featured-copy">
                    <span className="featured-badge">{featuredEvent.category || 'Event'}</span>
                    <h2>{featuredEvent.title}</h2>
                    <p className="event-date-line">{formatDateLabel(featuredEvent.date)}</p>
                    <p className="event-place-line">{featuredEvent.location}</p>
                    <p className="event-description">{featuredEvent.description}</p>
                    <div className="cta-row">
                      <button type="button" className="primary-action" disabled={!interestedIds.includes(featuredEvent.id)&&isRegistrationClosed(featuredEvent)} onClick={() => interestedIds.includes(featuredEvent.id) ? removeInterest(featuredEvent) : markInterested(featuredEvent)}>{registrationAction(featuredEvent)}</button>
                      <button type="button" className="secondary-action" onClick={() => setSelectedEvent(featuredEvent)}>View details</button>
                    </div>
                  </div>
                </article>

                <div className="event-grid">
                  {otherEvents.slice(0, 2).map((event) => (
                    <article key={event.id} className="mini-event-card">
                      <div className="mini-event-image"><EventVisual event={event} compact/></div>

                      <div className="mini-event-body">
                        <h3>{event.title}</h3>
                        <p className="mini-event-meta">{formatShortTime(event.date)}</p>
                        <p className="mini-event-description">{event.description}</p>
                        <button type="button" className="register-button" onClick={() => setSelectedEvent(event)}>View details</button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {featuredEvent && otherEvents.length > 2 && <div className="other-session-list">
              <h3>Other upcoming sessions</h3>

              {otherEvents.slice(2).map((event) => (
                  <div key={event.id} className="session-item">
                    <div className="session-date">
                      <span>{formatMonthDay(event.date).split(' ')[0]}</span>
                      <strong>{formatMonthDay(event.date).split(' ').slice(1).join(' ')}</strong>
                    </div>
                    <div className="session-summary">
                      <h4>{event.title}</h4>
                      <p>{event.location}</p>
                    </div>
                    <button type="button" className="session-arrow" aria-label={`View ${event.title}`} onClick={() => setSelectedEvent(event)}>
                      ›
                    </button>
                  </div>
                ))}
            </div>}
          </main>
        </div>
        {eventMessage && <p className="event-feedback">{eventMessage}</p>}
        {selectedEvent && <div className="event-details-modal" role="presentation" onMouseDown={() => setSelectedEvent(null)}><section role="dialog" aria-modal="true" aria-label={selectedEvent.title} onMouseDown={(event) => event.stopPropagation()}><header><div><span>{selectedEvent.category || 'Event'}</span><h2>{selectedEvent.title}</h2></div><button type="button" onClick={() => setSelectedEvent(null)} aria-label="Close event details">×</button></header><div className="event-details-image"><EventVisual event={selectedEvent}/></div><div className="event-details-body"><p className="event-detail-date">{formatShortTime(selectedEvent.date)}{selectedEvent.endDate ? ` – ${formatShortTime(selectedEvent.endDate)}` : ''}</p><p className="event-place-line">⌖ {selectedEvent.location || 'Location to be announced'}</p>{selectedEvent.registrationDeadline&&<p className="event-place-line">Registration closes {formatShortTime(selectedEvent.registrationDeadline)}</p>}<EventLocationMap event={selectedEvent}/><EventCountdown startDate={selectedEvent.date} endDate={selectedEvent.endDate} /><h3>About this event</h3><p>{selectedEvent.description}</p><div className="event-interest-count">{selectedEvent.interest_count || 0} registered alumni{selectedEvent.capacity?` · ${selectedEvent.capacity} capacity`:''}</div><button className="primary-action" disabled={!interestedIds.includes(selectedEvent.id)&&isRegistrationClosed(selectedEvent)} onClick={() => interestedIds.includes(selectedEvent.id) ? removeInterest(selectedEvent) : markInterested(selectedEvent)}>{registrationAction(selectedEvent)}</button></div></section></div>}
      </div>
    </div>
  );
}
