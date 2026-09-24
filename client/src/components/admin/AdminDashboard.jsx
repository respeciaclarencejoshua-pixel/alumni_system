import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import './AdminDashboard.css';
import { adminApi } from '../../lib/adminApi.js';

const AdminOverview = lazy(() => import('./AdminOverview.jsx'));
const Members = lazy(() => import('./Members.jsx'));
const AlumniVerification = lazy(() => import('./AlumniVerification.jsx'));
const OpportunitiesEvents = lazy(() => import('./OpportunitiesEvents.jsx'));
const CommunityContent = lazy(() => import('./CommunityContent.jsx'));
const AdminAnalytics = lazy(() => import('./AdminAnalytics.jsx'));
const SystemSettings = lazy(() => import('./SystemSettings.jsx'));
import CommunityServices from '../CommunityServices.jsx';
import { supabase } from '../../lib/supabase.js';
function SupportRequests(props){return <CommunityServices {...props} initialTab="request" requestOnly/>;}

const pages = [
  { icon: '⌂', label: 'Dashboard', scope: 'dashboard', component: AdminOverview },
  { icon: '♙', label: 'Members', scope: 'members', component: Members },
  { icon: '✓', label: 'Alumni Verification', scope: 'verification', component: AlumniVerification },
  { icon: '▣', label: 'Opportunities & Events', scopes: ['opportunities', 'events'], component: OpportunitiesEvents },
  { icon: '▤', label: 'Social & News', scopes: ['moderation', 'gallery'], component: CommunityContent },
  { icon: '◔', label: 'Analytics', scope: 'analytics', component: AdminAnalytics },
  { icon: '⚙', label: 'Settings', scope: 'settings', component: SystemSettings },
  { icon: '?', label: 'Help & Support', scope: 'dashboard', adminOnly: true, component: SupportRequests },
  { icon: '+', label: 'Community & Requests', scope: 'dashboard', adminOnly: true, component: CommunityServices },
];

function hasPageAccess(page, scopes) {
  return page.scope ? scopes.includes(page.scope) : page.scopes.some((scope) => scopes.includes(scope));
}

export default function AdminDashboard({ onSignOut, access }) {
  const scopes = access?.permission?.scopes || ['dashboard'];
  const availablePages = useMemo(() => pages.filter((page) => hasPageAccess(page, scopes) && (!page.adminOnly || access?.user?.role === 'admin')), [scopes, access?.user?.role]);
  const [activePage, setActivePage] = useState(availablePages[0]?.label || 'Dashboard');
  const [taskCounts, setTaskCounts] = useState({});
  const [supportCount,setSupportCount]=useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 1100px)');
    if (!navOpen || !mobile.matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const nodes = () => [...navRef.current.querySelectorAll('button:not([disabled]), a[href]')].filter(node => node.getClientRects().length);
    nodes()[0]?.focus();
    function onKey(event) {
      if (event.key === 'Escape') setNavOpen(false);
      if (event.key !== 'Tab') return;
      const items = nodes(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    const onResize = event => { if (!event.matches) setNavOpen(false); };
    mobile.addEventListener('change', onResize);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); mobile.removeEventListener('change', onResize); menuRef.current?.focus(); };
  }, [navOpen]);

  useEffect(() => {
    if (!availablePages.some((page) => page.label === activePage)) setActivePage(availablePages[0]?.label);
  }, [activePage, availablePages]);

  useEffect(() => {
    adminApi('/api/admin/attention').then((result) => setTaskCounts((result.items || []).reduce((counts, item) => ({ ...counts, [item.page]: (counts[item.page] || 0) + item.count }), {}))).catch(() => setTaskCounts({}));
  }, [activePage]);

  useEffect(()=>{if(access?.user?.role!=='admin')return;let active=true;async function load(){if(document.hidden)return;const {count,error}=await supabase.from('alumni_service_items').select('id',{count:'exact',head:true}).eq('kind','request').in('status',['submitted','reviewing']);if(active&&!error)setSupportCount(count||0);}load();const timer=setInterval(load,15000);window.addEventListener('support-requests-changed',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('support-requests-changed',load);};},[access?.user?.id,access?.user?.role]);
  const selected = availablePages.find((page) => page.label === activePage) || availablePages[0];
  const ActiveComponent = selected?.component;
  const user = access?.user || {};
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Administrator';
  const initials = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'AU';
  const roleName = (access?.permission?.admin_role || user.role || 'staff').replaceAll('_', ' ');

  return <div className={`admin-shell ${navOpen ? 'nav-open' : ''}`}>
    <a className="skip-content" href="#admin-main">Skip to admin content</a>
    <div className="admin-mobile-bar"><button ref={menuRef} className="admin-mobile-menu" type="button" aria-expanded={navOpen} aria-controls="admin-navigation" onClick={() => setNavOpen((open) => !open)}>☰ <span>Admin menu</span></button><strong>{activePage}</strong></div>
    {navOpen && <button className="admin-nav-backdrop" aria-label="Close admin navigation" tabIndex={-1} onClick={() => setNavOpen(false)} />}
    <aside ref={navRef} className="admin-sidebar" id="admin-navigation">
      <button className="admin-nav-close" onClick={() => setNavOpen(false)}>Close menu <span aria-hidden="true">&times;</span></button>
      <div className="admin-sidebar-brand"><strong>Admin menu</strong><small>Choose a section to manage</small></div>
      <nav className="admin-nav" aria-label="Admin navigation">{availablePages.map((page) => <button className={activePage === page.label ? 'selected' : ''} aria-current={activePage === page.label ? 'page' : undefined} key={page.label} onClick={() => { setActivePage(page.label); setNavOpen(false); }}><span aria-hidden="true">{page.icon}</span>{page.label}{page.label==='Help & Support'&&supportCount>0&&<b className="nav-count" aria-label={`${supportCount} open support requests`}>{supportCount}</b>}{taskCounts[page.label] > 0 && <b className="nav-count" aria-label={`${taskCounts[page.label]} items need attention`}>{taskCounts[page.label]}</b>}</button>)}</nav>
      <div className="admin-user"><b>{initials}</b><span><strong>{displayName}</strong><small>{roleName}</small></span></div>
      <button className="admin-report" onClick={onSignOut}>Sign out</button>
    </aside>
    <main className="admin-content" id="admin-main" tabIndex="-1">
      <Suspense fallback={<section className="admin-panel admin-live-loading" role="status">Loading admin tools…</section>}>
        {ActiveComponent ? <ActiveComponent onNavigate={setActivePage} scopes={scopes} user={user} admin={selected.adminOnly === true} /> : <section className="admin-panel"><h1>No assigned tools</h1><p>Ask a super administrator to assign access.</p></section>}
      </Suspense>
    </main>
  </div>;
}
