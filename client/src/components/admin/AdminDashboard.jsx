import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './AdminDashboard.css';
import { adminApi } from '../../lib/adminApi.js';

const AdminOverview = lazy(() => import('./AdminOverview.jsx'));
const Members = lazy(() => import('./Members.jsx'));
const AlumniVerification = lazy(() => import('./AlumniVerification.jsx'));
const OpportunitiesEvents = lazy(() => import('./OpportunitiesEvents.jsx'));
const CommunityContent = lazy(() => import('./CommunityContent.jsx'));
const AdminAnalytics = lazy(() => import('./AdminAnalytics.jsx'));
const SystemSettings = lazy(() => import('./SystemSettings.jsx'));

const pages = [
  { icon: '⌂', label: 'Dashboard', scope: 'dashboard', component: AdminOverview },
  { icon: '♙', label: 'Members', scope: 'members', component: Members },
  { icon: '✓', label: 'Alumni Verification', scope: 'verification', component: AlumniVerification },
  { icon: '▣', label: 'Opportunities & Events', scopes: ['opportunities', 'events'], component: OpportunitiesEvents },
  { icon: '▤', label: 'Social & News', scopes: ['moderation', 'gallery'], component: CommunityContent },
  { icon: '◔', label: 'Analytics', scope: 'analytics', component: AdminAnalytics },
  { icon: '⚙', label: 'Settings', scope: 'settings', component: SystemSettings },
];

function hasPageAccess(page, scopes) {
  return page.scope ? scopes.includes(page.scope) : page.scopes.some((scope) => scopes.includes(scope));
}

export default function AdminDashboard({ onSignOut, access }) {
  const scopes = access?.permission?.scopes || ['dashboard'];
  const availablePages = useMemo(() => pages.filter((page) => hasPageAccess(page, scopes)), [scopes]);
  const [activePage, setActivePage] = useState(availablePages[0]?.label || 'Dashboard');
  const [taskCounts, setTaskCounts] = useState({});
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!availablePages.some((page) => page.label === activePage)) setActivePage(availablePages[0]?.label);
  }, [activePage, availablePages]);

  useEffect(() => {
    adminApi('/api/admin/attention').then((result) => setTaskCounts((result.items || []).reduce((counts, item) => ({ ...counts, [item.page]: (counts[item.page] || 0) + item.count }), {}))).catch(() => setTaskCounts({}));
  }, [activePage]);

  const selected = availablePages.find((page) => page.label === activePage) || availablePages[0];
  const ActiveComponent = selected?.component;
  const user = access?.user || {};
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Administrator';
  const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'AU';
  const roleName = (access?.permission?.admin_role || user.role || 'staff').replaceAll('_', ' ');

  return <div className={`admin-shell ${navOpen ? 'nav-open' : ''}`}>
    <button className="admin-mobile-menu" type="button" aria-expanded={navOpen} aria-controls="admin-navigation" onClick={() => setNavOpen((open) => !open)}>☰ <span>Menu</span></button>
    <aside className="admin-sidebar" id="admin-navigation">
      <div className="admin-sidebar-brand"><strong>Admin Portal</strong><small>System control center</small></div>
      <nav className="admin-nav" aria-label="Admin navigation">{availablePages.map((page) => <button className={activePage === page.label ? 'selected' : ''} key={page.label} onClick={() => { setActivePage(page.label); setNavOpen(false); }}><span aria-hidden="true">{page.icon}</span>{page.label}{taskCounts[page.label] > 0 && <b className="nav-count" aria-label={`${taskCounts[page.label]} items need attention`}>{taskCounts[page.label]}</b>}</button>)}</nav>
      <div className="admin-user"><b>{initials}</b><span><strong>{displayName}</strong><small>{roleName}</small></span></div>
      <button className="admin-report" onClick={onSignOut}>Sign out</button>
    </aside>
    <main className="admin-content" id="admin-main" tabIndex="-1">
      <Suspense fallback={<section className="admin-panel admin-live-loading" role="status">Loading admin tools…</section>}>
        {ActiveComponent ? <ActiveComponent onNavigate={setActivePage} scopes={scopes} /> : <section className="admin-panel"><h1>No assigned tools</h1><p>Ask a super administrator to assign access.</p></section>}
      </Suspense>
    </main>
  </div>;
}
