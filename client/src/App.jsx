import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase.js';
import Feed from './components/Feed.jsx';
import Events from './components/Events.jsx';
import Register from './Register.jsx';
import Login from './Login.jsx';
import Profile from './components/Profile.jsx';
import AccountSettings from './components/AccountSettings.jsx';

const Icon = ({ name, size = 18 }) => {
  const icons = {
    bell: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    ),

    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-3v-.09A1.7 1.7 0 0 0 10.68 18.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 14.7 1.7 1.7 0 0 0 5.47 13.67H5v-3h.47a1.7 1.7 0 0 0 1.55-1.03A1.7 1.7 0 0 0 6.68 7.76l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.71 4.43V4h3v.43a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H21v3h-.05A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),

    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="1" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),

    chart: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M7 16v-3M12 16V8M17 16v-5" />
      </>
    ),

    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),

    arrow: <path d="m9 18 6-6-6-6" />,

    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
};

function App() {
  const [authView, setAuthView] = useState(null);
  const [user, setUser] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountProfile, setAccountProfile] = useState(null);

  // Navigation state
  const [activeTab, setActiveTab] = useState('Home');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setAccountMenuOpen(false);
  }

  const navItems = [
    'Home',
    'Feed',
    'Jobs',
    'Opportunities',
    'Events',
    'Mentorship',
  ];
  const accountFirstName = accountProfile?.first_name?.trim() || user?.user_metadata?.first_name?.trim() || user?.email?.split('@')[0] || 'Account';
  const accountLastName = accountProfile?.last_name?.trim() || user?.user_metadata?.last_name?.trim() || '';
  const accountInitials = `${accountFirstName[0] || ''}${accountLastName[0] || ''}`.toUpperCase();
  const AccountAvatar = ({ menu = false }) => <span className={`account-avatar ${menu ? 'account-avatar-menu' : ''}`}>{accountProfile?.avatar_url ? <img src={accountProfile.avatar_url} alt="" /> : accountInitials}</span>;

  useEffect(() => {
    if (!user) {
      setVerificationStatus(null);
      return;
    }
    supabase.from('alumni_verifications').select('status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setVerificationStatus(data?.status || null));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAccountProfile(null);
      return;
    }
    supabase.from('profiles').select('first_name, last_name, email, avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => setAccountProfile(data || null));
  }, [user]);

  const quickActions = [
    {
      icon: 'user',
      title: 'Find Classmates',
      text: 'Reconnect with fellow NDDU graduates.',
      action: 'Browse directory',
    },
    {
      icon: 'briefcase',
      title: 'Explore Careers',
      text: 'Discover opportunities shared by alumni.',
      action: 'View jobs',
    },
    {
      icon: 'pin',
      title: 'Attend Events',
      text: 'Join reunions, homecoming, and gatherings.',
      action: 'See events',
    },
    {
      icon: 'chart',
      title: 'Give Back',
      text: 'Share your knowledge through mentorship.',
      action: 'Become a mentor',
    },
  ];

  const feedItems = [
    {
      category: 'University News',
      time: '2 hours ago',
      title: 'New Research Wing Inauguration',
      text: 'The university has officially opened the state-of-the-art research facility dedicated to sustainable energy...',
    },
    {
      category: 'Alumni Spotlight',
      time: 'Yesterday',
      title: "Class of '15 CEO featured in Fortune",
      text: 'Jane Doe discusses her journey from the computer science labs to leading a tech giant...',
    },
  ];

  const jobs = [
    {
      icon: 'briefcase',
      title: 'Senior Product Designer',
      company: 'TechCorp • San Francisco, CA',
    },
    {
      icon: 'chart',
      title: 'Data Science Lead',
      company: 'FinanceFlow • Remote',
    },
  ];

  const events = [
    {
      date: 'MAY 24',
      title: 'Annual Homecoming Gala',
      place: 'Main Campus',
    },
    {
      date: 'JUN 02',
      title: 'Networking Mixer: NY',
      place: 'Midtown Lounge',
    },
  ];

  if (authView === 'register') {
    return <Register onLogin={() => setAuthView('login')} onClose={() => setAuthView(null)} />;
  }

  if (authView === 'login') {
    return <Login onRegister={() => setAuthView('register')} onClose={() => setAuthView(null)} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('Home');
          }}
          aria-label="Notre Dame of Dadiangas University Alumni home"
        >
          <img
            src="https://www.nddu.edu.ph/wp-content/uploads/2021/06/cropped-NDDU-Site-Favicon.png"
            alt="Notre Dame of Dadiangas University seal"
          />

          <span>
            <em>Notre Dame of Dadiangas University</em>
            <strong>ALUMNI</strong>
          </span>
        </a>

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item}
              className={activeTab === item ? 'active' : ''}
              onClick={() => {
                setActiveTab(item);
              }}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          {user ? <><button aria-label="Notifications" className="icon-button"><Icon name="bell" /></button><button aria-label="Account settings" className="icon-button" onClick={() => setSettingsOpen(true)}><Icon name="settings" /></button><div className="account-menu-wrap"><button className="account-trigger" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}><AccountAvatar /><span>{accountFirstName}</span><i>⌄</i></button>{accountMenuOpen && <div className="account-menu"><header className="account-menu-profile"><AccountAvatar menu /><span><small>My alumni account</small><strong>{accountFirstName}</strong><small>{user.email}</small></span></header><div className={`account-verification-status ${verificationStatus || 'not-started'}`}><span>{verificationStatus === 'verified' ? '✓' : verificationStatus === 'pending' ? '◌' : '!'}</span><p><strong>{verificationStatus === 'verified' ? 'Alumni verified' : verificationStatus === 'pending' ? 'Verification under review' : verificationStatus === 'needs_information' ? 'More information needed' : 'Alumni not verified'}</strong><small>{verificationStatus === 'verified' ? 'Your profile is confirmed.' : 'Complete verification to join the directory.'}</small></p></div><button className="account-menu-primary" onClick={() => { setAccountMenuOpen(false); setVerificationOpen(true); }}>{verificationStatus === 'verified' ? 'View verification' : 'Verify alumni status'} <span>→</span></button><div className="account-menu-options"><button onClick={() => { setAccountMenuOpen(false); setSettingsOpen(true); }}><span>⚙</span> Profile settings</button></div><button className="account-menu-signout" onClick={signOut}><span>↪</span> Sign out</button></div>}</div></> : <><button className="header-auth-button" onClick={() => setAuthView('login')}>Log in</button><button className="header-auth-button header-auth-button-primary" onClick={() => setAuthView('register')}>Join now</button></>}
        </div>
      </header>

      <main id="top">
        {activeTab === 'Feed' ? (
          <Feed />
        ) : activeTab === 'Events' ? (
          <Events />
        ) : (
          <>
            <section className="hero-section">
              <div className="hero-background" aria-hidden="true">
                <img
                  src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=90"
                  alt=""
                />
              </div>

              <div className="hero-copy">
                <p className="eyebrow">
                  Notre Dame of Dadiangas University
                </p>

                <h1>Welcome home, Alumni.</h1>

                <p>
                  Reconnect with classmates, discover opportunities,
                  and continue making a difference in the NDDU community.
                </p>

                <div className="hero-actions">
                  <button
                    className="dark-button"
                    onClick={() => setAuthView('register')}
                  >
                  Create Your Alumni Profile
                  </button>
                  {!user && <button className="hero-login-button" onClick={() => setAuthView('login')}>Log in</button>}
                </div>
              </div>
            </section>

            <div className="content-grid">
              <section className="quick-section panel-wide">
                <div className="section-intro">
                  <p className="eyebrow green">Start here</p>

                  <h2>
                    Stay connected in the ways that matter most.
                  </h2>

                  <p>
                    Simple tools to help you reconnect, grow your career,
                    and support fellow alumni.
                  </p>
                </div>

                <div className="quick-grid">
                  {quickActions.map((item) => (
                    <article
                      className="quick-card"
                      key={item.title}
                    >
                      <span className="quick-icon">
                        <Icon name={item.icon} size={25} />
                      </span>

                      <h3>{item.title}</h3>

                      <p>{item.text}</p>

                      <button className="card-link">
                        {item.action}
                        <Icon name="arrow" size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="impact-section panel-wide">
                <div>
                  <p className="eyebrow">
                    Our growing community
                  </p>

                  <h2>
                    Connected by faith, friendship, and shared purpose.
                  </h2>
                </div>

                <div className="impact-grid">
                  <div>
                    <strong>12,000+</strong>
                    <span>NDDU alumni</span>
                  </div>

                  <div>
                    <strong>180+</strong>
                    <span>Mentors ready to help</span>
                  </div>

                  <div>
                    <strong>40+</strong>
                    <span>Career opportunities</span>
                  </div>

                  <div>
                    <strong>12</strong>
                    <span>Upcoming gatherings</span>
                  </div>
                </div>
              </section>

              <section className="panel feed-panel">
                <div className="section-title">
                  <h2>From NDDU</h2>
                  <button className="text-button small">
                    View All
                  </button>
                </div>

                <div className="feed-list">
                  {feedItems.map((item) => (
                    <article
                      className="feed-card"
                      key={item.title}
                    >
                      <div className="meta">
                        <span>{item.category}</span>
                        <time>{item.time}</time>
                      </div>

                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel jobs-panel">
                <div className="section-title">
                  <h2>Featured careers</h2>

                  <button className="text-button small">
                    View All
                  </button>
                </div>

                <div className="job-list">
                  {jobs.map((job) => (
                    <button
                      className="job-card"
                      key={job.title}
                    >
                      <span className="job-icon">
                        <Icon name={job.icon} />
                      </span>

                      <span>
                        <strong>{job.title}</strong>
                        <small>{job.company}</small>
                      </span>

                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel events-panel">
                <div className="section-title">
                  <h2>Upcoming events</h2>

                  <button className="text-button small">
                    View Calendar
                  </button>
                </div>

                <div className="events-list">
                  {events.map((event) => (
                    <article
                      className="event-card"
                      key={event.title}
                    >
                      <time>{event.date}</time>

                      <h3>{event.title}</h3>

                      <p>
                        <Icon name="pin" size={14} />
                        {event.place}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel story-panel">
                <div className="section-title">
                  <h2>Alumni stories</h2>

                  <button className="text-button small">
                    Read More
                  </button>
                </div>

                <article className="story-card">
                  <img
                    src="https://i.pravatar.cc/120?img=47"
                    alt="Robert Chen"
                  />

                  <div>
                    <blockquote>
                      “My degree was the foundation...”
                    </blockquote>

                    <p className="author">
                      — Robert Chen, Class of ’08
                    </p>
                  </div>

                  <p className="quote-copy">
                    “The mentorship program at AlumniConnect helped me
                    navigate my early career challenges and eventually
                    launch my own startup...”
                  </p>
                </article>
              </section>

              <section className="join-section panel-wide">
                <div>
                  <p className="eyebrow">
                    Your NDDU community is here
                  </p>

                  <h2>
                    Keep your alumni story moving forward.
                  </h2>

                  <p>
                    Update your details, discover what is new, and stay
                    close to the people who shared your NDDU journey.
                  </p>
                </div>

                <button
                  className="dark-button"
                  onClick={() => setShowRegister(true)}
                >
                  Create Your Alumni Profile
                </button>
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="site-footer">
        <div>
          <strong>ALUMNICONNECT</strong>

          <p>
            © 2024 Alumni Management System. All rights reserved.
          </p>
        </div>

        <div className="footer-links">
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms of Service</a>
          <a href="#support">Contact Support</a>
        </div>
      </footer>
      {verificationOpen && user && <div className="verification-modal-backdrop" role="presentation" onMouseDown={() => setVerificationOpen(false)}><section className="verification-modal" role="dialog" aria-modal="true" aria-label="Alumni verification" onMouseDown={(event) => event.stopPropagation()}><button className="verification-modal-close" aria-label="Close verification" onClick={() => setVerificationOpen(false)}>×</button><Profile user={user} onStatusChange={(verification) => setVerificationStatus(verification?.status || null)} /></section></div>}
      {settingsOpen && user && <AccountSettings user={user} profile={accountProfile} onClose={() => setSettingsOpen(false)} onProfileChange={setAccountProfile} />}
    </div>
  );
}

export default App;
