import { useState } from 'react';
import './AdminDashboard.css';
import Members from './Members.jsx';
import AlumniVerification from './AlumniVerification.jsx';
import OpportunitiesEvents from './OpportunitiesEvents.jsx';

const metrics = [
  ['Total alumni', '12,482', '↑ 4.2% this month', 'positive'], ['Verified alumni', '9,102', '73% of total', ''],
  ['New registrations', '154', '↑ 12% this week', 'positive'], ['Active users', '2,841', 'Daily average', ''],
  ['Job posts', '87', '32 new this month', ''], ['Event registrations', '412', 'For 3 active events', ''],
  ['Pending approvals', '42', 'Review now', 'alert'], ['Survey responses', '1,890', 'Total responses', ''],
];

const pendingJobs = [
  ['Senior Fullstack Engineer', 'TechNova Solutions', 'Posted 2h ago'],
  ['Investment Analyst', 'Global Capital Group', 'Posted 5h ago'],
];

const upcomingEvents = [
  ['Alumni Gala Dinner 2024', 'Grand Hall, Campus East', 'FEB 24', '142 / 200', 'QR Check-in'],
  ['Tech Founders Meetup', 'Virtual Session (Zoom)', 'MAR 05', '89 / 150', 'Manage Schedule'],
];

function JobsAndEvents() {
  return <div className="jobs-events-page">
    <header className="admin-page-header jobs-events-header">
      <div><p>Operations</p><h1>Job &amp; Events Management</h1><span>Admin overview of all alumni opportunities and engagement sessions.</span></div>
      <div className="jobs-events-tabs"><button className="active">Active</button><button>Archived</button></div>
    </header>

    <section className="jobs-events-overview">
      <article className="admin-panel job-approval-panel">
        <div className="panel-heading"><h2>▧ Approve Job Posts</h2><b className="pending-badge">4 pending</b></div>
        <div className="pending-job-list">{pendingJobs.map(([title, company, posted]) => <article className="pending-job" key={title}><span className="job-list-icon">▦</span><div><strong>{title}</strong><small>{company} • {posted}</small></div></article>)}</div>
        <button className="panel-link">View All Pending Posts</button>
      </article>

      <aside className="create-event-card"><h2>Create Event</h2><p>Plan your next alumni meetup, workshop, or gala dinner.</p><button className="poster-drop">▧<span>Upload Poster</span></button><button className="start-event">＋ Start New Event Flow</button></aside>
    </section>

    <section className="admin-panel events-attendance-panel">
      <div className="panel-heading"><h2>▣ Upcoming Events &amp; Attendance</h2><span className="checkin-status">● Live Check-in</span></div>
      <div className="event-management-grid">{upcomingEvents.map(([title, location, date, attendance, action], index) => <article className="event-management-card" key={title}><div className={`event-poster poster-${index + 1}`}><b>{date}</b><span>Event poster</span></div><h3>{title}</h3><p>⌖ {location}</p><footer><span><small>Registrations</small><strong>{attendance}</strong></span><button>{action === 'QR Check-in' ? '▧ ' : '◷ '}{action}</button></footer></article>)}<button className="add-event-card"><strong>▧</strong><b>Add Event Poster</b><span>Drag and drop or click to browse files</span></button></div>
    </section>

    <section className="jobs-events-bottom">
      <article className="admin-panel companies-panel"><div className="panel-heading"><h2>Manage Companies</h2></div>{[['TechNova Solutions', '12 active jobs'], ['Global Capital Group', '4 active jobs']].map(([name, count]) => <div className="company-row" key={name}><b>♟</b><strong>{name}</strong><small>{count}</small></div>)}<button className="panel-link">See all companies</button></article>
      <article className="admin-panel expired-jobs-panel"><div className="panel-heading"><h2>Expired Jobs</h2></div>{[['UX Design Intern', 'Expired 3 days ago · 14 applicants'], ['Marketing Coordinator', 'Expired 1 week ago · 45 applicants']].map(([title, detail]) => <div className="expired-job" key={title}><span><strong>{title}</strong><small>{detail}</small></span><button>Repost</button></div>)}</article>
    </section>
  </div>;
}

const publishedNews = [
  ['Featured', 'Mar 12, 10:00 AM', '2024 Alumni Homecoming Gala Announced', 'Tickets are now available for the annual black-tie event...'],
  ['Announcement', 'Mar 10, 2:15 PM', 'Platform Maintenance Scheduled', 'The AlumniConnect platform will be undergoing scheduled...'],
  ['Scheduled', 'Mar 15, 9:00 AM', 'New Mentorship Program Launch', ''],
];

function SocialAndNews() {
  return <div className="social-news-page">
    <header className="admin-page-header social-news-header"><div><p>Community management</p><h1>Content Control Hub</h1><span>Manage community narratives and ensure platform safety.</span></div><div className="social-news-actions"><button className="filter-button">☰ Filter View</button><button className="create-announcement">＋ Create Announcement</button></div></header>
    <section className="social-news-layout">
      <aside className="admin-panel published-news-panel"><div className="panel-heading"><h2>Published News</h2><button>View Archive</button></div>{publishedNews.map(([tag, date, title, text]) => <article className="news-item" key={title}><header><b>{tag}</b><small>{date}</small></header><h3>{title}</h3>{text && <p>{text}</p>}{tag === 'Scheduled' && <footer><button>Edit</button><button>Cancel</button></footer>}</article>)}</aside>
      <section className="admin-panel moderation-panel"><div className="moderation-header"><h2>Moderation Queue</h2><div className="moderation-tabs"><button className="active">All<br />(8)</button><button>Reported<br />(6)</button><button>Flagged Images<br />(14)</button></div></div><article className="moderation-item"><header className="moderation-user"><b>♟</b><strong>John Doe (Class of '18')</strong><span>Reported for: Spam (3 reports)</span><time>15 mins ago</time></header><div className="moderation-body"><div><p>“Hey guys! Check out this amazing crypto opportunity. Guaranteed returns in 1 week. Link in bio! 🔥🚀 #investing #wealth”</p><div className="flagged-image">⚠<span>Flagged image</span></div></div><aside><button>✓ Ignore</button><button className="danger">♙ Remove Content</button><button className="danger">△ Warn User</button><button className="suspend">♟ Suspend Account</button></aside></div></article><article className="moderation-item"><header className="moderation-user"><b>♟</b><strong>Jane Smith (Class of '22')</strong><span>Reported for: Harassment</span><time>2 hours ago</time></header><div className="moderation-body quoted-report"><div><small>Parent post:</small><p>“I'm so excited to share my new startup project with everyone!”</p><p>“Nobody cares about your stupid little project, Jane. Stick to your day job if you can even keep one.”</p></div><aside><button>Dismiss</button><button className="danger filled">Delete &amp; Warn</button></aside></div></article><button className="load-more">Load 18 More Items</button></section>
    </section>
  </div>;
}

function Analytics() {
  const employmentMetrics = [['Employed', '84.2%', '↑ 4.7% from prev'], ['Avg Salary', '$62k', 'Annual base'], ['Entrepreneurs', '12.5%', 'Steady growth']];
  const surveys = [['Graduate Tracer Survey 2024', 'Ends in 14 days · 450 responses', '68%'], ['Homecoming Event Feedback', 'Closed · 1,200 responses', '92%']];
  const jobTrends = [['Tech/Engineering', '85%'], ['Business/Finance', '62%'], ['Arts/Media', '34%']];
  return <div className="analytics-page">
    <header className="admin-page-header analytics-header"><div><p>Insights</p><h1>Analytics &amp; Reports</h1><span>Monitor alumni engagement and program effectiveness.</span></div><button className="export-data">⌄ Export Data</button></header>
    <section className="analytics-top-grid"><article className="admin-panel employment-panel"><div className="panel-heading"><h2>Employment Statistics</h2><button>Class of 2023⌄</button></div><div className="employment-metrics">{employmentMetrics.map(([label, value, note]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div><div className="employment-chart">{[70, 40, 78, 27, 54].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></article><article className="admin-panel active-users-panel"><div className="panel-heading"><h2>Active Users</h2></div>{[['Daily Active', '1,240'], ['Weekly Active', '4,890'], ['Monthly Active', '12,150']].map(([label, value]) => <div className="active-user-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}<div className="user-distribution"><small>User distribution</small><i><b /></i><footer><span>60% alumni</span><span>25% students</span></footer></div></article></section>
    <section className="admin-panel survey-panel"><div className="panel-heading"><h2>Survey Management</h2><button>＋ Create New Survey</button></div>{surveys.map(([title, detail, completion]) => <article className="survey-row" key={title}><b>▧</b><span><strong>{title}</strong><small>{detail}</small></span><em><small>Completion rate</small><strong>{completion}</strong></em><div><button>✎</button><button>◉</button><button>▥</button></div></article>)}</section>
    <section className="analytics-bottom-grid"><article className="admin-panel applications-panel"><div className="panel-heading"><h2>Job Applications Trends</h2></div>{jobTrends.map(([label, value]) => <div className="application-trend" key={label}><span>{label}</span><i><b style={{ width: value }} /></i><strong>{value}</strong></div>)}</article><article className="admin-panel location-panel"><div className="panel-heading"><h2>Alumni Location</h2></div><div className="location-map">Geographic heatmap</div><footer><span>Domestic <b>72%</b></span><span>International <b>28%</b></span></footer></article></section>
  </div>;
}

function Settings() {
  const [allowSignups, setAllowSignups] = useState(true);
  const [verifyDomain, setVerifyDomain] = useState(false);
  const [activeTab, setActiveTab] = useState('Configuration');
  return <div className="settings-page">
    <header className="admin-page-header settings-header"><div><p>Administration</p><h1>System Settings</h1><span>Configure environment, track logs, and manage system backups.</span></div></header>
    <nav className="settings-tabs">{['Configuration', 'Activity Logs', 'Backup & Restore'].map(tab => <button className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
    {activeTab === 'Configuration' ? <section className="settings-grid">
      <article className="admin-panel setting-card school-info-card"><header><h2>School Info</h2><span>♧</span></header><label>Institution Name<input defaultValue="Global Alumni University" /></label><label>Contact Email<input type="email" defaultValue="admin@gau.edu" /></label><div className="official-logo">Official logo</div><button className="settings-submit">Save Changes</button></article>
      <article className="admin-panel setting-card registration-card"><header><h2>Registration</h2><span>♙</span></header><div className="setting-toggle"><div><strong>Allow Open Signups</strong><p>New users can register without invitation.</p></div><button className={`switch ${allowSignups ? 'on' : ''}`} aria-label="Allow open signups" aria-pressed={allowSignups} onClick={() => setAllowSignups(!allowSignups)}><i /></button></div><div className="setting-toggle"><div><strong>Verify Domain</strong><p>Require .edu or .org domains.</p></div><button className={`switch ${verifyDomain ? 'on' : ''}`} aria-label="Verify domain" aria-pressed={verifyDomain} onClick={() => setVerifyDomain(!verifyDomain)}><i /></button></div><button className="settings-submit">Manage Fields</button></article>
      <article className="admin-panel setting-card branding-card"><header><h2>Branding &amp; Email</h2><span>✺</span></header>{[['✉', 'Email Templates', 'Welcome, password reset, and approval emails.'], ['♙', 'Password Policies', 'Enforce 12+ characters, symbols, and MFA.'], ['✎', 'Theme Customization', 'Configure accent colors and typography.']].map(([icon, title, description]) => <button className="setting-link" key={title}><b>{icon}</b><span><strong>{title}</strong><small>{description}</small></span></button>)}<button className="settings-submit">Global Config</button></article>
    </section> : <section className="admin-panel settings-empty"><h2>{activeTab}</h2><p>This settings area is ready for your {activeTab.toLowerCase()} controls.</p></section>}
  </div>;
}

export default function AdminDashboard({ onSignOut }) {
  const [activePage, setActivePage] = useState('Dashboard');

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand"><strong>Admin Portal</strong><small>System control center</small></div>
      <nav className="admin-nav">{[['▦', 'Dashboard'], ['♙', 'Members'], ['✓', 'Alumni Verification'], ['▣', 'Opportunities & Events'], ['▤', 'Social & News'], ['◔', 'Analytics'], ['⚙', 'Settings']].map(([icon, item]) => <button className={activePage === item ? 'selected' : ''} key={item} onClick={() => setActivePage(item)}><span>{icon}</span>{item}{item === 'Alumni Verification' && <b className="nav-count">14</b>}</button>)}</nav>
      <div className="admin-user"><b>AU</b><span><strong>Admin User</strong><small>Super administrator</small></span></div><button className="admin-report" onClick={onSignOut}>Sign out</button>
    </aside>
    <section className="admin-content">
      {activePage === 'Dashboard' && <>
        <header className="admin-page-header"><div><p>Community overview</p><h1>Alumni System Dashboard</h1><span>Monitor alumni engagement, content, and community operations.</span></div><button>▣ Last 30 days</button></header>
        <section className="admin-metrics">{metrics.map(([label, value, note, tone]) => <article className={`admin-metric ${tone}`} key={label}><p>{label}</p><strong>{value}</strong><span>{note}</span></article>)}</section>
        <section className="admin-insights"><article className="admin-panel chart-panel"><div className="panel-heading"><h2>Employment Rate & User Activity</h2><span>■ Employment &nbsp; <i>■</i> Activity</span></div><div className="admin-bars">{[60, 40, 70, 48, 52, 30, 66, 55, 75, 34].map((height, index) => <i key={index} className={index % 2 ? 'activity-bar' : 'employment-bar'} style={{ height: `${height}%` }} />)}</div><div className="chart-labels"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span></div></article>
        <article className="admin-panel course-panel"><div className="panel-heading"><h2>Alumni by Course</h2><button>•••</button></div>{[['Computer Science', '43%'], ['Engineering', '28%'], ['Business Admin', '18%'], ['Arts & Design', '11%']].map(([course, value]) => <div className="course-row" key={course}><span><strong>{course}</strong><em>{value}</em></span><i><b style={{ width: value }} /></i></div>)}</article></section>
        <section className="admin-secondary"><article className="admin-panel batch-panel"><div className="panel-heading"><h2>Alumni by Batch (Last 5 Years)</h2><button>•••</button></div><div className="batch-chart">{[35, 52, 67, 49, 75].map((height, index) => <i style={{ height: `${height}%` }} key={index} />)}</div><div className="chart-labels"><span>2020</span><span>2021</span><span>2022</span><span>2023</span><span>2024</span></div></article><article className="admin-panel active-panel"><div className="panel-heading"><h2>Most Active Alumni</h2><button>•••</button></div>{[['JD', 'Jane Doe', 'Class of 2010', '2,140 pts'], ['MS', 'Marcus Smith', 'Class of 2015', '1,980 pts'], ['AL', 'Alice Lee', 'Class of 2008', '1,820 pts']].map(([initials, name, year, points]) => <div className="active-alumni" key={name}><b>{initials}</b><span><strong>{name}</strong><small>{year}</small></span><em>{points}</em></div>)}</article></section>
        <section className="admin-panel operations"><div className="panel-heading"><div><p>Needs your attention</p><h2>System Operations Log</h2></div><button>View all</button></div>{[['New alumni registration', 'Sarah Jenkins (CS \'24)', '2 minutes ago', 'Approve'], ['Job post verified', 'Senior UX Designer at Google', '1 hour ago', 'View'], ['New event scheduled', 'Annual Alumni Homecoming 2024', '4 hours ago', 'Details']].map(([action, name, time, button]) => <div className="operation" key={action}><b>▧</b><span><strong>{action} · {name}</strong><small>{time}</small></span><button>{button}</button></div>)}</section>
      </>}
      {activePage === 'Members' && <Members />}
      {activePage === 'Alumni Verification' && <AlumniVerification />}
      {activePage === 'Opportunities & Events' && <OpportunitiesEvents />}
      {activePage === 'Social & News' && <SocialAndNews />}
      {activePage === 'Analytics' && <Analytics />}
      {activePage === 'Settings' && <Settings />}
    </section>
  </div>;

}
