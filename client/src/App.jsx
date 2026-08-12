import { useState } from 'react';

const Icon = ({ name, size = 18 }) => {
  const icons = {
    bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-3v-.09A1.7 1.7 0 0 0 10.68 18.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 14.7 1.7 1.7 0 0 0 5.47 13.67H5v-3h.47a1.7 1.7 0 0 0 1.55-1.03A1.7 1.7 0 0 0 6.68 7.76l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.71 4.43V4h3v.43a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H21v3h-.05A1.7 1.7 0 0 0 19.4 15Z" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="1" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    chart: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M7 16v-3M12 16V8M17 16v-5" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
};

function App() {
  const [activeTab, setActiveTab] = useState('Directory');
  const navItems = ['Directory', 'Feed', 'Jobs', 'Opportunities', 'Events', 'Mentorship'];
  const feedItems = [
    { category: 'University News', time: '2 hours ago', title: 'New Research Wing Inauguration', text: 'The university has officially opened the state-of-the-art research facility dedicated to sustainable energy...' },
    { category: 'Alumni Spotlight', time: 'Yesterday', title: "Class of '15 CEO featured in Fortune", text: 'Jane Doe discusses her journey from the computer science labs to leading a tech giant...' },
  ];
  const jobs = [
    { icon: 'briefcase', title: 'Senior Product Designer', company: 'TechCorp • San Francisco, CA' },
    { icon: 'chart', title: 'Data Science Lead', company: 'FinanceFlow • Remote' },
  ];
  const events = [
    { date: 'MAY 24', title: 'Annual Homecoming Gala', place: 'Main Campus' },
    { date: 'JUN 02', title: 'Networking Mixer: NY', place: 'Midtown Lounge' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top">AlumniConnect</a>
        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => <button key={item} className={activeTab === item ? 'active' : ''} onClick={() => setActiveTab(item)}>{item}</button>)}
        </nav>
        <div className="header-actions">
          <button aria-label="Notifications" className="icon-button"><Icon name="bell" /></button>
          <button aria-label="Settings" className="icon-button"><Icon name="settings" /></button>
          <img className="avatar" src="https://i.pravatar.cc/80?img=12" alt="Your profile" />
        </div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <h1>Welcome, Alumni</h1>
            <p>Stay connected, find opportunities, and give back to your community.</p>
            <div className="hero-actions">
              <button className="dark-button">View Your Profile</button>
              <button className="text-button">Find Classmates</button>
            </div>
          </div>
          <div className="hero-portrait" aria-label="Alumni networking at a university event">
            <img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1100&q=85" alt="Alumni friends smiling together" />
            <div className="portrait-overlay"><span>Building connections</span><strong>for life.</strong></div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel feed-panel">
            <div className="section-title"><h2>Latest from the feed</h2><button className="text-button small">View All</button></div>
            <div className="feed-list">
              {feedItems.map((item) => <article className="feed-card" key={item.title}><div className="meta"><span>{item.category}</span><time>{item.time}</time></div><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
          </section>
          <section className="panel jobs-panel">
            <div className="section-title"><h2>Featured jobs</h2><button className="text-button small">View All</button></div>
            <div className="job-list">
              {jobs.map((job) => <button className="job-card" key={job.title}><span className="job-icon"><Icon name={job.icon} /></span><span><strong>{job.title}</strong><small>{job.company}</small></span><Icon name="arrow" /></button>)}
            </div>
          </section>
          <section className="panel events-panel">
            <div className="section-title"><h2>Upcoming events</h2><button className="text-button small">View Calendar</button></div>
            <div className="events-list">
              {events.map((event) => <article className="event-card" key={event.title}><time>{event.date}</time><h3>{event.title}</h3><p><Icon name="pin" size={14} /> {event.place}</p></article>)}
            </div>
          </section>
          <section className="panel story-panel">
            <div className="section-title"><h2>Success stories</h2><button className="text-button small">Read More</button></div>
            <article className="story-card"><img src="https://i.pravatar.cc/120?img=47" alt="Robert Chen" /><div><blockquote>“My degree was the foundation...”</blockquote><p className="author">— Robert Chen, Class of ’08</p></div><p className="quote-copy">“The mentorship program at AlumniConnect helped me navigate my early career challenges and eventually launch my own startup...”</p></article>
          </section>
        </div>
      </main>

      <footer className="site-footer"><div><strong>ALUMNICONNECT</strong><p>© 2024 Alumni Management System. All rights reserved.</p></div><div className="footer-links"><a href="#privacy">Privacy Policy</a><a href="#terms">Terms of Service</a><a href="#support">Contact Support</a></div></footer>
    </div>
  );
}

export default App;
