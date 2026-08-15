import { useEffect, useMemo, useState } from 'react';
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

export default function EventsPage() {
  const [events, setEvents] = useState(fallbackEvents);
  const [selectedCategory, setSelectedCategory] = useState('All Events');
  const [selectedTimeframe, setSelectedTimeframe] = useState('Upcoming');
  const [locationFilter, setLocationFilter] = useState('');
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

    return byLocation;
  }, [events, selectedCategory, selectedTimeframe, locationFilter]);

  const featuredEvent = filteredEvents.find((event) => event.featured) || filteredEvents[0] || fallbackEvents[0];
  const otherEvents = filteredEvents.filter((event) => event.id !== (featuredEvent?.id ?? ''));

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
                      <button type="button" className="primary-action">Register Now</button>
                      <button type="button" className="secondary-action">Details</button>
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
                        <button type="button" className="register-button">Register</button>
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
                    <button type="button" className="session-arrow" aria-label={`View ${event.title}`}>
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
      </div>
    </div>
  );
}
