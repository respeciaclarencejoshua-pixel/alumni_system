import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase.js';
import Feed from './components/Feed.jsx';
import AboutNDDU from './components/AboutNDDU.jsx';
import Opportunities from './components/Opportunities';
import Events from './components/Events.jsx';
import Gallery from './components/Gallery.jsx';
import Register from './Register.jsx';
import Login from './Login.jsx';
import Profile from './components/Profile.jsx';
import AccountSettings from './components/AccountSettings.jsx';
import Chat from './components/Chat.jsx';
import Directory from './components/Directory.jsx';
import AlumniProfilePage from './components/AlumniProfilePage.jsx';
import NotificationsPage from './components/NotificationsPage.jsx';
import './components/ProfileNavigation.css';

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

    comment: <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />,
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
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [homeData, setHomeData] = useState({ news: [], events: [], metrics: null });
  const [siteConfig, setSiteConfig] = useState({ allowOpenSignups: true });
  const [homeError, setHomeError] = useState('');
  const [messageContact, setMessageContact] = useState(null);

  const [activeTab, setActiveTab] = useState('Home');

  async function loadPublicContent() {
    setHomeError('');
    const results = await Promise.allSettled([
      fetch('/api/config').then((response) => response.ok ? response.json() : Promise.reject()),
      fetch('/api/home').then((response) => response.ok ? response.json() : Promise.reject()),
      fetch('/api/events').then((response) => response.ok ? response.json() : Promise.reject()),
    ]);
    const [config, home, eventData] = results;
    if (config.status === 'fulfilled') setSiteConfig(config.value);
    if (home.status === 'fulfilled') setHomeData((current) => ({ ...current, ...home.value }));
    if (eventData.status === 'fulfilled') setHomeData((current) => ({ ...current, events: eventData.value.events || [] }));
    if (results.some((result) => result.status === 'rejected')) setHomeError('Some public content could not be loaded. You can retry without refreshing the page.');
  }

  useEffect(() => { loadPublicContent(); }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setSettingsOpen(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setAccountMenuOpen(false);
  }

  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;

  function notificationText(notification) {
    if (notification._source === 'account_notifications') return notification.subject || notification.message;
    if (notification.kind === 'comment') return `${notification.actor_name} commented on your post.`;
    const reaction = notification.reaction === 'celebrate' ? 'celebrated' : notification.reaction === 'support' ? 'supported' : 'liked';
    return `${notification.actor_name} ${reaction} your post.`;
  }

  function notificationTime(value) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function openNotification(notification) {
    if (!notification.read_at) {
      const { error } = await supabase.from(notification._source || 'notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id);
      if (!error) setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    }
    setNotificationsOpen(false);
    const destination = notification._source !== 'account_notifications' ? 'Feed'
      : notification.kind?.includes('event') ? 'Events'
      : notification.kind?.includes('opportun') || notification.kind?.includes('application') ? 'Opportunities'
      : notification.kind?.includes('message') ? 'Directory'
      : notification.kind?.includes('gallery') ? 'Gallery'
      : 'Home';
    setActiveTab(destination);
  }

  async function markAllNotificationsRead() {
    if (!user?.id || unreadNotifications === 0) return;
    const readAt = new Date().toISOString();
    const results = await Promise.all(['notifications','account_notifications'].map((table) => supabase.from(table).update({ read_at: readAt }).eq('recipient_id', user.id).is('read_at', null)));
    if (!results.some((result) => result.error)) setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
  }

  const navItems = [
    'Home',
    'About NDDU',
    'Feed',
    'Directory',
    'Opportunities',
    'Events',
    'Gallery',
  ];

  const accountFirstName =
    accountProfile?.first_name?.trim() ||
    user?.user_metadata?.first_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Account';

  const accountLastName =
    accountProfile?.last_name?.trim() ||
    user?.user_metadata?.last_name?.trim() ||
    '';

  const accountInitials =
    `${accountFirstName[0] || ''}${accountLastName[0] || ''}`.toUpperCase();

  const AccountAvatar = ({ menu = false }) => (
    <span
      className={`account-avatar ${
        menu ? 'account-avatar-menu' : ''
      }`}
    >
      {accountProfile?.avatar_url ? (
        <img src={accountProfile.avatar_url} alt="" />
      ) : (
        accountInitials
      )}
    </span>
  );

  useEffect(() => {
    if (!user) {
      setVerificationStatus(null);
      return;
    }

    supabase
      .from('alumni_verifications')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setVerificationStatus(data?.status || null);
      });
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setNotificationsOpen(false);
      return undefined;
    }

    let active = true;
    const loadNotifications = async () => {
      const [community, account] = await Promise.all([
        supabase.from('notifications').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('account_notifications').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(100),
      ]);
      if (active && !community.error && !account.error) setNotifications([
        ...(community.data || []).map((item) => ({ ...item, _source: 'notifications' })),
        ...(account.data || []).map((item) => ({ ...item, _source: 'account_notifications' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200));
    };
    loadNotifications();

    const channel = supabase.channel(`notifications:${user.id}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
      loadNotifications
    ).on('postgres_changes', { event: '*', schema: 'public', table: 'account_notifications', filter: `recipient_id=eq.${user.id}` }, loadNotifications).subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setAccountProfile(null);
      return;
    }

    supabase
      .from('profiles')
      .select('first_name, last_name, email, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAccountProfile(data || null);
      });
  }, [user]);

  const quickActions = [
    {
      icon: 'user',
      title: 'Find Classmates',
      text: 'Reconnect with fellow NDDU graduates.',
      action: 'Browse directory',
      tab: 'Directory',
    },
    {
      icon: 'briefcase',
      title: 'Explore Careers',
      text: 'Discover opportunities shared by alumni.',
      action: 'View jobs',
      tab: 'Opportunities',
    },
    {
      icon: 'pin',
      title: 'Attend Events',
      text: 'Join reunions, homecoming, and gatherings.',
      action: 'See events',
      tab: 'Events',
    },
    {
      icon: 'chart',
      title: 'View Memories',
      text: 'Explore photos shared by the alumni community.',
      action: 'Open gallery',
      tab: 'Gallery',
    },
  ];

  const feedItems = homeData.news.map((item) => ({ category: item.category || 'University News', time: new Date(item.created_at).toLocaleDateString(), title: item.title, text: item.description || item.text || '' }));
  const events = homeData.events.slice(0, 4).map((item) => ({ date: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), title: item.title, place: item.location || 'Details to follow' }));

  if (authView === 'register') {
    return (
      <Register
        onLogin={() => setAuthView('login')}
        onClose={() => setAuthView(null)}
      />
    );
  }

  if (authView === 'login') {
    return (
      <Login
        onRegister={() => siteConfig.allowOpenSignups && setAuthView('register')}
        onClose={() => setAuthView(null)}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="institution-bar">
        <div>
          <a href="tel:+63835524444">(083) 552 4444</a>
          <span aria-hidden="true">|</span>
          <a href="mailto:info@nddu.edu.ph">info@nddu.edu.ph</a>
        </div>

        <a href="https://www.nddu.edu.ph/" target="_blank" rel="noreferrer">
          NDDU official website
        </a>
      </div>

      <header className="topbar">
        <a
          className="brand"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
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
              onClick={() => setActiveTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          {user ? (
            <>
              <div className="notification-wrap">
                <button
                  aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
                  aria-expanded={notificationsOpen}
                  className="icon-button notification-button"
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    setAccountMenuOpen(false);
                  }}
                >
                  <Icon name="bell" />
                  {unreadNotifications > 0 && <span className="notification-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
                </button>

                {notificationsOpen && (
                  <section className="notification-panel" aria-label="Notifications">
                    <header>
                      <h2>Notifications</h2>
                      {unreadNotifications > 0 && <button type="button" onClick={markAllNotificationsRead}>Mark all as read</button>}
                    </header>
                    {notifications.length === 0 ? (
                      <p className="notification-empty">You have no notifications yet.</p>
                    ) : (
                      <ul>
                        {notifications.map((notification) => (
                          <li key={notification.id} className={notification.read_at ? '' : 'unread'}>
                            <button type="button" onClick={() => openNotification(notification)}>
                              <span className="notification-symbol"><Icon name={notification.kind === 'comment' ? 'comment' : 'user'} /></span>
                              <span><strong>{notificationText(notification)}</strong><small>{notificationTime(notification.created_at)}</small></span>
                              {!notification.read_at && <i aria-label="Unread notification" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button className="notification-view-all" type="button" onClick={()=>{setNotificationsOpen(false);setActiveTab('Notifications')}}>View all notifications</button>
                  </section>
                )}
              </div>

              <button
                aria-label="Account settings"
                className="icon-button"
                onClick={() => setSettingsOpen(true)}
              >
                <Icon name="settings" />
              </button>

              <div className="account-menu-wrap">
                <button
                  className="account-trigger"
                  aria-expanded={accountMenuOpen}
                  onClick={() =>
                    setAccountMenuOpen((open) => {
                      setNotificationsOpen(false);
                      return !open;
                    })
                  }
                >
                  <AccountAvatar />
                  <span>{accountFirstName}</span>
                  <i>⌄</i>
                </button>

                {accountMenuOpen && (
                  <div className="account-menu">
                    <button className="account-menu-profile" onClick={()=>{setAccountMenuOpen(false);setActiveTab('Profile')}}>
                      <AccountAvatar menu />

                      <span>
                        <small>My alumni account</small>
                        <strong>{accountFirstName}</strong>
                        <small>{user.email}</small>
                      </span>
                    </button>

                    <div
                      className={`account-verification-status ${
                        verificationStatus || 'not-started'
                      }`}
                    >
                      <span>
                        {verificationStatus === 'verified'
                          ? '✓'
                          : verificationStatus === 'pending'
                          ? '◌'
                          : '!'}
                      </span>

                      <p>
                        <strong>
                          {verificationStatus === 'verified'
                            ? 'Alumni verified'
                            : verificationStatus === 'pending'
                            ? 'Verification under review'
                            : verificationStatus ===
                              'needs_information'
                            ? 'More information needed'
                            : 'Alumni not verified'}
                        </strong>

                        <small>
                          {verificationStatus === 'verified'
                            ? 'Your profile is confirmed.'
                            : 'Complete verification to join the directory.'}
                        </small>
                      </p>
                    </div>

                    <button
                      className="account-menu-primary"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setVerificationOpen(true);
                      }}
                    >
                      {verificationStatus === 'verified'
                        ? 'View verification'
                        : 'Verify alumni status'}

                      <span>→</span>
                    </button>

                    <div className="account-menu-options">
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                      >
                        <span>⚙</span>
                        Profile settings
                      </button>
                    </div>

                    <button
                      className="account-menu-signout"
                      onClick={signOut}
                    >
                      <span>↪</span>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                className="header-auth-button"
                onClick={() => setAuthView('login')}
              >
                Log in
              </button>

              <button
                className="header-auth-button header-auth-button-primary"
                onClick={() => siteConfig.allowOpenSignups && setAuthView('register')}
                disabled={!siteConfig.allowOpenSignups}
              >
                {siteConfig.allowOpenSignups ? 'Join now' : 'Registration closed'}
              </button>
            </>
          )}
        </div>
      </header>

      <main id="top" tabIndex="-1">
        {activeTab === 'About NDDU' ? (
          <AboutNDDU />
        ) : activeTab === 'Feed' ? (
          <Feed user={user} profile={accountProfile} verificationStatus={verificationStatus} onMessage={setMessageContact} onViewProfile={()=>setActiveTab('Profile')} />
        ) : activeTab === 'Profile' && user ? (
          <AlumniProfilePage user={user} profile={accountProfile} onProfileChange={setAccountProfile} />
        ) : activeTab === 'Notifications' && user ? (
          <NotificationsPage notifications={notifications} onOpen={openNotification} onMarkAll={markAllNotificationsRead} onChange={setNotifications} />
        ) : activeTab === 'Directory' ? (
          <Directory user={user} verificationStatus={verificationStatus} onMessage={setMessageContact} />
        ) : activeTab === 'Events' ? (
          <Events user={user} verificationStatus={verificationStatus} />
        ) : activeTab === 'Gallery' ? (
          <Gallery user={user} profile={accountProfile} verificationStatus={verificationStatus} />
        ) : activeTab === 'Opportunities' ? (
          <Opportunities user={user} profile={accountProfile} verificationStatus={verificationStatus} />
        ) : (
          <>
            {homeError && <div className="public-load-error" role="alert"><span>{homeError}</span><button onClick={loadPublicContent}>Retry</button></div>}
            <section className="hero-section">
              <div
                className="hero-background"
                aria-hidden="true"
              >
                <img
                  src="https://www.nddu.edu.ph/wp-content/uploads/2022/03/Slide-2-e1731164886823.png"
                  alt=""
                />
              </div>

              <div className="hero-copy">
                <p className="eyebrow">
                  Education Towards Excellence and Human Integrity
                </p>

                <h1>
                  Welcome home, {user ? accountFirstName : 'Alumni'}.
                </h1>

                <p>
                  Welcome home. Reconnect with classmates, discover
                  opportunities, and continue serving the NDDU community.
                </p>

                <div className="hero-actions">
                  <button
                    className="dark-button"
                    onClick={() => siteConfig.allowOpenSignups && setAuthView('register')}
                    disabled={!siteConfig.allowOpenSignups}
                  >
                    {siteConfig.allowOpenSignups ? 'Create Your Alumni Profile' : 'Registration is currently closed'}
                  </button>

                  {!user && (
                    <button
                      className="hero-login-button"
                      onClick={() => setAuthView('login')}
                    >
                      Log in
                    </button>
                  )}
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
                    Simple tools to help you reconnect, grow your
                    career, and support fellow alumni.
                  </p>
                </div>

                <div className="quick-grid">
                  {quickActions.map((item) => (
                    <article
                      className="quick-card"
                      key={item.title}
                    >
                      <span className="quick-icon">
                        <Icon
                          name={item.icon}
                          size={25}
                        />
                      </span>

                      <h3>{item.title}</h3>

                      <p>{item.text}</p>

                      <button className="card-link" onClick={() => setActiveTab(item.tab)}>
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
                    Connected by faith, friendship, and shared
                    purpose.
                  </h2>
                </div>

                <div className="impact-grid">
                  <div>
                    <strong>{homeData.metrics?.alumni?.toLocaleString() || '—'}</strong>
                    <span>NDDU alumni</span>
                  </div>

                  <div>
                    <strong>{homeData.metrics?.photos?.toLocaleString() || '—'}</strong>
                    <span>Alumni photos shared</span>
                  </div>

                  <div>
                    <strong>{homeData.metrics?.opportunities?.toLocaleString() || '—'}</strong>
                    <span>Career opportunities</span>
                  </div>

                  <div>
                    <strong>{homeData.metrics?.events?.toLocaleString() || '—'}</strong>
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
                  {feedItems.length ? feedItems.map((item) => (
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
                  )) : <p>No published university news yet.</p>}
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
                  {events.length ? events.map((event) => (
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
                  )) : <p>No upcoming published events yet.</p>}
                </div>
              </section>

              <section className="panel story-panel">
                <div className="section-title">
                  <h2>Share your alumni story</h2>

                  <button className="text-button small" onClick={() => setActiveTab('Feed')}>
                    Open community feed
                  </button>
                </div>

                <article className="story-card">
                  <div>
                    <blockquote>
                      Your experience can encourage the next generation of NDDU alumni.
                    </blockquote>

                    <p className="author">
                      Share a verified community update
                    </p>
                  </div>

                  <p className="quote-copy">
                    Publish a career milestone, reunion memory, or message of support in the alumni feed.
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
                    Update your details, discover what is new,
                    and stay close to the people who shared your
                    NDDU journey.
                  </p>
                </div>

                <button
                  className="dark-button"
                  onClick={() => siteConfig.allowOpenSignups && setAuthView('register')}
                  disabled={!siteConfig.allowOpenSignups}
                >
                  {siteConfig.allowOpenSignups ? 'Create Your Alumni Profile' : 'Registration is currently closed'}
                </button>
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="site-footer">
        <div>
          <strong>NDDU ALUMNICONNECT</strong>

          <p>
            © {new Date().getFullYear()} Alumni Management System. All rights reserved.
          </p>
        </div>

        <div className="footer-links">
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms of Service</a>
          <a href="#support">Contact Support</a>
          <a href="https://www.nddu.edu.ph/" target="_blank" rel="noreferrer">
            NDDU Website
          </a>
        </div>
      </footer>

      {verificationOpen && user && (
        <div
          className="verification-modal-backdrop"
          role="presentation"
          onMouseDown={() => setVerificationOpen(false)}
        >
          <section
            className="verification-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Alumni verification"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="verification-modal-close"
              aria-label="Close verification"
              onClick={() => setVerificationOpen(false)}
            >
              ×
            </button>

            <Profile
              user={user}
              onStatusChange={(verification) =>
                setVerificationStatus(
                  verification?.status || null
                )
              }
            />
          </section>
        </div>
      )}

      {settingsOpen && user && (
        <AccountSettings
          user={user}
          profile={accountProfile}
          onClose={() => setSettingsOpen(false)}
          onProfileChange={setAccountProfile}
        />
      )}

      {user && verificationStatus === 'verified' && <Chat user={user} contact={messageContact} onContactHandled={() => setMessageContact(null)} />}
    </div>
  );
}

export default App;
