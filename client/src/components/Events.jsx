import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Events.css';

const fallbackEvents = [
  {
    id: 'featured-event',
    title: 'Annual Alumni Homecoming Weekend 2024',
    category: 'Homecoming',
    date: '2024-10-18T18:00:00',
    endDate: '2024-10-20T00:00:00',
    location: 'Main Campus, Great Hall',
    time: 'October 18 - 20, 2024',
    description:
      'Join thousands of fellow alumni for a weekend of nostalgia, networking, and celebration. Featuring department tours, gala dinners, and the annual football game.',
    featured: true,
    imageLabel: 'Image placeholder',
    link: '#',
  },
  {
    id: 'london-alumni-mixer',
    title: 'London Alumni Mixer',
    category: 'Networking',
    date: '2024-11-16T18:00:00',
    location: 'London, UK',
    time: 'Sept 24, 6:00 PM',
    description: 'An evening of professional networking for alumni based in the UK. Light refreshments will be served.',
    featured: false,
    link: '#',
  },
  {
    id: 'ai-modern-industry',
    title: 'AI in Modern Industry',
    category: 'Webinars',
    date: '2024-11-18T15:00:00',
    location: 'Online (Zoom)',
    time: 'Online • Oct 5, 3:00 PM',
    description: 'Expert alumni panel discussing the impact of generative AI across various professional sectors.',
    featured: false,
    link: '#',
  },
  {
    id: 'clase-2024-reunion',
    title: 'Class of 2014 Reunion',
    category: 'Networking',
    date: '2024-11-12T18:00:00',
    location: 'San Francisco, CA',
    time: 'Oct 14 • 10:00 AM',
    description: 'Reconnect with your classmates and celebrate a decade of milestones and memories.',
    featured: false,
    link: '#',
  },
  {
    id: 'entrepreneurship-workshop',
    title: 'Entrepreneurship Workshop',
    category: 'Webinars',
    date: '2024-11-16T10:00:00',
    location: 'NDDU Innovation Hub',
    time: 'Nov 08 • 9:30 AM',
    description: 'A practical workshop on launching, validating, and scaling an idea through alumni mentorship.',
    featured: false,
    link: '#',
  },
];

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

export default function EventsPage() {
  const [events, setEvents] = useState(fallbackEvents);
  const [selectedCategory, setSelectedCategory] = useState('All Events');
  const [selectedTimeframe, setSelectedTimeframe] = useState('Upcoming');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateSearch, setDateSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [interestedIds, setInterestedIds] = useState([]);
  const [eventMessage, setEventMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetch('/api/events');
        if (!response.ok) throw new Error('Unable to load events');
        const payload = await response.json();
        const loaded = Array.isArray(payload?.events) && payload.events.length > 0 ? payload.events : fallbackEvents;
        if (isMounted) {
          setEvents(loaded);
        }
      } catch (error) {
        if (isMounted) {
          setEvents(fallbackEvents);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadEvents();
    return () => {
      isMounted = false;
    };
  }, []);

  const categories = ['All Events', 'Networking', 'Webinars', 'Homecoming'];

  const filteredEvents = useMemo(() => {
    const now = new Date();

    const byCategory = events.filter((event) => {
      const category = event.category || 'Networking';
      return selectedCategory === 'All Events' || category === selectedCategory;
    });

    const byTimeframe = byCategory.filter((event) => {
      const eventDate = new Date(event.date || event.startDate || event.created_at || new Date());
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

  const featuredEvent = filteredEvents.find((event) => event.featured) || filteredEvents[0] || fallbackEvents[0];
  const otherEvents = filteredEvents.filter((event) => event.id !== (featuredEvent?.id ?? ''));
  async function markInterested(event) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return setEventMessage('Please sign in before marking interest.');
    const { error } = await supabase.from('event_interests').insert({ event_id: event.id, user_id: session.user.id });
    if (error && error.code !== '23505') return setEventMessage(error.message);
    setInterestedIds((current) => current.includes(event.id) ? current : [...current, event.id]);
    setEvents((current) => current.map((item) => item.id === event.id && !interestedIds.includes(event.id) ? { ...item, interest_count: (item.interest_count || 0) + 1 } : item));
    setEventMessage('Your interest has been recorded.');
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
          <div className="date-select-group"><span aria-hidden="true">▦</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="all">All months</option>{monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}</select><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="all">All years</option>{eventYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
          <label className="event-search"><span aria-hidden="true">⌕</span><input value={dateSearch} onChange={(event) => setDateSearch(event.target.value)} placeholder="Search events" /></label>
          <div className="event-view-switch" aria-label="View mode">{['yearly', 'monthly', 'weekly', 'daily', 'list'].map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => setViewMode(mode)}>{mode}</button>)}</div>
        </section>

        <div className="events-layout">
          <aside className="events-sidebar">
            <div className="filter-group">
              <h2>Category</h2>
              {categories.map((category) => (
                <label key={category} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedCategory === category}
                    onChange={() => setSelectedCategory(category)}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h2>Timeframe</h2>
              {['Upcoming', 'Past Events'].map((period) => (
                <label key={period} className="filter-option">
                  <input
                    type="checkbox"
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
            ) : !featuredEvent ? (
              <div className="events-empty-state">No events match your current filters.</div>
            ) : (
              <>
                <article className="featured-event-card">
                  <div className="featured-image">
                    <span>Image placeholder</span>
                  </div>

                  <div className="featured-copy">
                    <span className="featured-badge">{featuredEvent.category || 'Event'}</span>
                    <h2>{featuredEvent.title}</h2>
                    <p className="event-date-line">{formatDateLabel(featuredEvent.date)}</p>
                    <p className="event-place-line">{featuredEvent.location}</p>
                    <p className="event-description">{featuredEvent.description}</p>
                    <div className="cta-row">
                      <button type="button" className="primary-action" onClick={() => markInterested(featuredEvent)}>{interestedIds.includes(featuredEvent.id) ? '✓ Interested' : 'I’m interested'}</button>
                      <button type="button" className="secondary-action" onClick={() => setSelectedEvent(featuredEvent)}>View details</button>
                    </div>
                  </div>
                </article>

                <div className="event-grid">
                  {otherEvents.slice(0, 2).map((event) => (
                    <article key={event.id} className="mini-event-card">
                      <div className="mini-event-image">
                        <span>Image</span>
                      </div>

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

            <div className="other-session-list">
              <h3>Other upcoming sessions</h3>

              {otherEvents.slice(2).length > 0 ? (
                otherEvents.slice(2).map((event) => (
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
                ))
              ) : (
                <div className="session-item muted-item">
                  <div className="session-summary">
                    <h4>No additional sessions available.</h4>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
        {eventMessage && <p className="event-feedback">{eventMessage}</p>}
        {selectedEvent && <div className="event-details-modal" role="presentation" onMouseDown={() => setSelectedEvent(null)}><section role="dialog" aria-modal="true" aria-label={selectedEvent.title} onMouseDown={(event) => event.stopPropagation()}><header><div><span>{selectedEvent.category || 'Event'}</span><h2>{selectedEvent.title}</h2></div><button onClick={() => setSelectedEvent(null)} aria-label="Close event details">×</button></header><div className="event-details-image" style={selectedEvent.image_url ? { backgroundImage: `url(${selectedEvent.image_url})` } : undefined} /><div className="event-details-body"><p className="event-detail-date">{formatShortTime(selectedEvent.date)}{selectedEvent.endDate ? ` – ${formatShortTime(selectedEvent.endDate)}` : ''}</p><p className="event-place-line">⌖ {selectedEvent.location || 'Location to be announced'}</p><EventCountdown startDate={selectedEvent.date} endDate={selectedEvent.endDate} /><h3>About this event</h3><p>{selectedEvent.description}</p><div className="event-interest-count">{selectedEvent.interest_count || 0} alumni interested</div><button className="primary-action" onClick={() => markInterested(selectedEvent)}>{interestedIds.includes(selectedEvent.id) ? '✓ Interested' : 'I’m interested'}</button></div></section></div>}
      </div>
    </div>
  );
}
