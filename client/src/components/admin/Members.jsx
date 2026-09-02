import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/adminApi.js';
import './Members.css';

export default function Members() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [advanced,setAdvanced]=useState({department:'',course:'',year:'',batch:'',organization:'',email:'all',access:'all',joinedAfter:'',activeAfter:''});
  const [exportOpen,setExportOpen]=useState(false);
  const [exportScope,setExportScope]=useState('current');
  const [exportFields,setExportFields]=useState(['name','email','roles','status','department','course','graduationYear','batchName','joined']);
  const [selectedIds,setSelectedIds]=useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmingUserId, setConfirmingUserId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogMember, setDialogMember] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verificationNote, setVerificationNote] = useState('');
  const [memberForm, setMemberForm] = useState({ first_name: '', last_name: '', email: '', password: '', role: 'alumni', status: 'pending', suspension_reason:'', email_confirmed: true });

  const usersPerPage = 8;

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      setLoadError('');

      const first = await adminApi('/api/admin/members?page=1&pageSize=100');
      const pages=Math.ceil((first.total||0)/100);const rest=pages>1?await Promise.all(Array.from({length:pages-1},(_,i)=>adminApi(`/api/admin/members?page=${i+2}&pageSize=100`))):[];
      const members=[...(first.members||[]),...rest.flatMap(x=>x.members||[])];
      setUsers(members);setFilteredUsers(members);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  useEffect(() => {
    let filtered = users;

    // Role filter
    if (roleFilter !== 'All Roles') {
      filtered = filtered.filter(user => (user.roles || [user.role]).includes(roleFilter));
    }

    // Status filter
    if (statusFilter !== 'All Statuses') {
      filtered = filtered.filter(user => user.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        user =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if(advanced.department)filtered=filtered.filter(x=>x.department===advanced.department);
    if(advanced.course)filtered=filtered.filter(x=>x.course===advanced.course);
    if(advanced.year)filtered=filtered.filter(x=>String(x.graduationYear)===advanced.year);
    if(advanced.batch)filtered=filtered.filter(x=>x.batchName===advanced.batch);
    if(advanced.organization)filtered=filtered.filter(x=>x.organization===advanced.organization);
    if(advanced.email!=='all')filtered=filtered.filter(x=>x.emailConfirmed===(advanced.email==='confirmed'));
    if(advanced.access==='locked')filtered=filtered.filter(x=>x.locked);if(advanced.access==='deactivated')filtered=filtered.filter(x=>x.deactivated);
    if(advanced.joinedAfter)filtered=filtered.filter(x=>new Date(x.joined)>=new Date(advanced.joinedAfter));
    if(advanced.activeAfter)filtered=filtered.filter(x=>x.lastSignInAt&&new Date(x.lastSignInAt)>=new Date(advanced.activeAfter));

    setFilteredUsers(filtered);
    setCurrentPage(1);
  }, [users, searchQuery, roleFilter, statusFilter,advanced]);

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIdx = (currentPage - 1) * usersPerPage;
  const paginatedUsers = filteredUsers.slice(
    startIdx,
    startIdx + usersPerPage
  );

  const getRoleColor = role => {
    const colors = {
      ADMIN: '#3B82F6',
      EMPLOYER: '#8B5CF6',
      STAFF: '#10B981',
      ALUMNI: '#6B7280',
    };

    return colors[role] || '#6B7280';
  };

  const getStatusColor = status => {
    const colors = {
      Verified: '#10B981',
      Pending: '#F59E0B',
      Suspended: '#EF4444',
    };

    return colors[status] || '#6B7280';
  };

  const getInitials = name => {
    return name
      .split(' ')
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatJoined = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: 'Unknown', time: '' };
    return {
      date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  };

  async function handleConfirmEmail(user) {
    const confirmed = window.confirm(
      `Confirm the email address for ${user.name} (${user.email})?`
    );

    if (!confirmed) {
      return;
    }

    setConfirmingUserId(user.id);
    setActionError('');

    try {
      await adminApi(`/api/admin/users/${user.id}/confirm-email`, {
        method: 'PATCH',
      });

      setUsers(currentUsers =>
        currentUsers.map(currentUser =>
          currentUser.id === user.id
            ? {
                ...currentUser,
                emailConfirmed: true,
              }
            : currentUser
        )
      );
    } catch (error) {
      setActionError(error.message);
    } finally {
      setConfirmingUserId(null);
    }
  }

  async function openView(user) {
    setDialog('view'); setDialogMember(null); setActionError('');
    try { const { member } = await adminApi(`/api/admin/members/${user.id}`); setDialogMember(member); setVerificationNote(member.verification?.reviewer_note || ''); }
    catch (error) { setActionError(error.message); setDialog(null); }
  }

  async function openEdit(user) {
    setDialog('edit'); setActionError('');
    try {
      const { member } = await adminApi(`/api/admin/members/${user.id}`);
      setDialogMember(member);
      setMemberForm({ first_name: member.first_name || '', last_name: member.last_name || '', email: member.email || '', password: '', role: member.role, status: member.status, suspension_reason:member.suspension_reason||'', email_confirmed: member.email_confirmed });
    } catch (error) { setActionError(error.message); setDialog(null); }
  }

  function openAdd() {
    setMemberForm({ first_name: '', last_name: '', email: '', password: '', role: 'alumni', status: 'pending', email_confirmed: true });
    setDialogMember(null); setDialog('add'); setActionError('');
  }

  async function saveMember(event) {
    event.preventDefault(); setSaving(true); setActionError('');
    try {
      if (dialog === 'add') await adminApi('/api/admin/members', { method: 'POST', body: JSON.stringify(memberForm) });
      else await adminApi(`/api/admin/members/${dialogMember.id}`, { method: 'PATCH', body: JSON.stringify(memberForm) });
      setDialog(null); await loadMembers();
    } catch (error) { setActionError(error.message); }
    finally { setSaving(false); }
  }

  async function toggleLock(user) {
    const action = user.locked ? 'unlock' : 'lock';
    if (!window.confirm(`${action === 'lock' ? 'Lock' : 'Unlock'} ${user.name}'s account?${action === 'lock' ? ' They will not be able to sign in.' : ''}`)) return;
    try {
      await adminApi(`/api/admin/members/${user.id}/lock`, { method: 'PATCH', body: JSON.stringify({ locked: !user.locked }) });
      setUsers((items) => items.map((item) => item.id === user.id ? { ...item, locked: !item.locked } : item));
    } catch (error) { setActionError(error.message); }
  }

  async function openVerificationDocument() {
    if (!dialogMember?.verification?.id) return;
    try { const { url } = await adminApi(`/api/admin/verifications/${dialogMember.verification.id}/document`); window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (error) { setActionError(error.message); }
  }

  async function decideVerification(status) {
    if (!dialogMember?.verification) return;
    if (status !== 'verified' && !verificationNote.trim()) return setActionError('Add a reviewer note before requesting information or rejecting a submission.');
    setSaving(true); setActionError('');
    try {
      await adminApi(`/api/admin/verifications/${dialogMember.verification.id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewerNote: verificationNote }) });
      const { member } = await adminApi(`/api/admin/members/${dialogMember.id}`);
      setDialogMember(member); await loadMembers();
    } catch (error) { setActionError(error.message); }
    finally { setSaving(false); }
  }

  async function accountAction(action){if(!dialogMember)return;try{if(action==='reset')await adminApi(`/api/admin/members/${dialogMember.id}/send-password-reset`,{method:'POST'});if(action==='confirm')await adminApi(`/api/admin/members/${dialogMember.id}/resend-confirmation`,{method:'POST'});if(action==='sessions')await adminApi(`/api/admin/members/${dialogMember.id}/revoke-sessions`,{method:'POST'});if(action==='roles'){const value=window.prompt('Enter roles separated by commas: alumni, employer, staff, admin',(dialogMember.roles||[dialogMember.role]).join(', '));if(!value)return;await adminApi(`/api/admin/members/${dialogMember.id}/roles`,{method:'PUT',body:JSON.stringify({roles:value.split(',').map(x=>x.trim())})})}if(action==='suspend'){const reason=window.prompt('Suspension reason:');if(!reason)return;const until=window.prompt('Suspend until (YYYY-MM-DD):');if(!until)return;await adminApi(`/api/admin/members/${dialogMember.id}/suspension`,{method:'PATCH',body:JSON.stringify({reason,until})})}if(action==='deactivate'||action==='restore'){const deactivate=action==='deactivate';const reason=window.prompt(deactivate?'Reason for permanent deactivation:':'Reason for restoring this account:');if(!reason)return;await adminApi(`/api/admin/members/${dialogMember.id}/deactivation`,{method:'PATCH',body:JSON.stringify({deactivate,reason})})}setActionError(action==='reset'?'Password-reset email sent.':'Account action completed.');const{member}=await adminApi(`/api/admin/members/${dialogMember.id}`);setDialogMember(member);loadMembers()}catch(error){setActionError(error.message)}}

  function verificationPanel() {
    const verification = dialogMember?.verification;
    if (!verification) return <section className="member-verification empty"><h3>No verification submission</h3><p>This member has not uploaded graduation evidence yet.</p></section>;
    const awaitingDecision = ['pending', 'needs_information'].includes(verification.status);
    return <section className="member-verification"><header><div><small>Alumni verification</small><h3>Graduation evidence</h3></div><b className={`verification-state ${verification.status}`}>{verification.status.replace('_', ' ')}</b></header><div className="verification-facts"><span><small>Graduation name</small><strong>{verification.graduation_name}</strong></span><span><small>Program</small><strong>{verification.program}</strong></span><span><small>Graduation year</small><strong>{verification.graduation_year}</strong></span></div><button className="verification-document-button" onClick={openVerificationDocument}>📄 <span><strong>{verification.document_filename}</strong><small>Open secure document · link expires in 60 seconds</small></span></button><label>Reviewer notes<textarea value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="Add a note for the alumnus…" /></label>{awaitingDecision ? <footer><button disabled={saving} onClick={() => decideVerification('rejected')}>Reject</button><button disabled={saving} onClick={() => decideVerification('needs_information')}>Request information</button><button className="approve" disabled={saving} onClick={() => decideVerification('verified')}>Approve & verify</button></footer> : <p className="verification-reviewed">Decision recorded{verification.reviewed_at ? ` on ${new Date(verification.reviewed_at).toLocaleDateString()}` : ''}.</p>}</section>;
  }

  function memberInsightsPanel(){if(!dialogMember)return null;return <section className="member-insights"><h3>Profile &amp; activity</h3><dl><div><dt>Roles</dt><dd>{(dialogMember.roles||[dialogMember.role]).join(', ')}</dd></div><div><dt>Warnings</dt><dd>{dialogMember.warnings_count||0}</dd></div><div><dt>Account source</dt><dd>{dialogMember.account_source||'self registration'}</dd></div><div><dt>Suspension ends</dt><dd>{dialogMember.suspension_expires_at?new Date(dialogMember.suspension_expires_at).toLocaleString():'Not suspended'}</dd></div></dl>{dialogMember.employer&&<p className="member-education"><strong>{dialogMember.employer.organization}</strong><span>{dialogMember.employer.job_title} · {dialogMember.employer.company_email}</span></p>}<div className="member-activity-counts">{Object.entries(dialogMember.activity||{}).map(([key,value])=><span key={key}><strong>{value}</strong>{key}</span>)}</div><h3>Verification history</h3>{dialogMember.verification_history?.length?dialogMember.verification_history.map(x=><p className="member-history-row" key={x.id}><b>{x.status.replace('_',' ')}</b><span>{new Date(x.created_at).toLocaleString()}{x.reviewer_note?` · ${x.reviewer_note}`:''}</span></p>):<p className="member-modal-empty">No verification history.</p>}<h3>Account security</h3><div className="member-security-actions"><button onClick={()=>accountAction('reset')}>Send password reset</button>{!dialogMember.email_confirmed&&<button onClick={()=>accountAction('confirm')}>Resend confirmation</button>}<button onClick={()=>accountAction('roles')}>Change roles</button><button onClick={()=>accountAction('sessions')}>Revoke sessions</button><button onClick={()=>accountAction('suspend')}>Temporary suspension</button><button className="danger" onClick={()=>accountAction(dialogMember.deactivated_at?'restore':'deactivate')}>{dialogMember.deactivated_at?'Restore account':'Deactivate account'}</button></div></section>}

  const handleExportCSV = () => {
    const definitions={name:['Name',u=>u.name],email:['Email',u=>u.email],roles:['Roles',u=>(u.roles||[u.role]).join('; ')],status:['Status',u=>u.status],department:['Department',u=>u.department],course:['Course',u=>u.course],graduationYear:['Graduation year',u=>u.graduationYear],batchName:['Batch name',u=>u.batchName],organization:['Employer organization',u=>u.organization],joined:['Joined',u=>u.joined],emailConfirmed:['Email confirmed',u=>u.emailConfirmed?'Yes':'No']};
    const chosen=exportFields.filter(x=>definitions[x]);const headers=chosen.map(x=>definitions[x][0]);const source=exportScope==='all'?users:exportScope==='selected'?users.filter(x=>selectedIds.includes(x.id)):filteredUsers;
    const rows = source.map(user => chosen.map(field=>definitions[field][1](user)??''));

    const csv = [headers, ...rows]
      .map(row =>
        row
          .map(cell => `"${String(cell).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `nddu-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const roles = [
    'All Roles',
    'ADMIN',
    'EMPLOYER',
    'STAFF',
    'ALUMNI',
  ];

  const statuses = [
    'All Statuses',
    'Verified',
    'Pending',
    'Suspended',
  ];

  return (
    <div className="members-container">
      <div className="members-header">
        <div className="members-title">
          <p className="members-kicker">
            Community administration
          </p>

          <h1>Member directory</h1>

          <p>
            Find people, update account access, and guide pending
            alumni through verification.
          </p>
        </div>

        <div className="members-actions">
          <button
            className="btn-secondary"
            onClick={()=>setExportOpen(x=>!x)}
          >
            ⬇ Export CSV
          </button>

          <button className="btn-primary" onClick={openAdd}>
            + Add member
          </button>
        </div>
      </div>

      {exportOpen&&<section className="member-export-panel"><div><strong>Export safe member fields</strong><span>Passwords, security data, and verification documents are always excluded.</span></div><label>Scope<select value={exportScope} onChange={e=>setExportScope(e.target.value)}><option value="current">Current search results</option><option value="selected">Selected members ({selectedIds.length})</option><option value="all">All loaded members</option></select></label><fieldset><legend>Columns</legend>{Object.entries({name:'Name',email:'Email',roles:'Roles',status:'Status',department:'Department',course:'Course',graduationYear:'Graduation year',batchName:'Batch name',organization:'Organization',joined:'Joined',emailConfirmed:'Email confirmation'}).map(([key,label])=><label key={key}><input type="checkbox" checked={exportFields.includes(key)} onChange={e=>setExportFields(f=>e.target.checked?[...f,key]:f.filter(x=>x!==key))}/>{label}</label>)}</fieldset><button disabled={!exportFields.length||(exportScope==='selected'&&!selectedIds.length)} onClick={handleExportCSV}>Download CSV</button></section>}

      <div className="members-filters">
        <div className="filter-group">
          <label>Member type</label>

          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            {roles.map(role => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Account status</label>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {statuses.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group search">
          <label>Search members</label>

          <input
            type="text"
            placeholder="Type a name or email address…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <details className="advanced-member-filters"><summary>Advanced filters</summary><div>{[['department','Department'],['course','Course'],['year','Graduation year'],['batch','Batch name'],['organization','Employer organization']].map(([key,label])=><label key={key}>{label}<select value={advanced[key]} onChange={e=>setAdvanced({...advanced,[key]:e.target.value})}><option value="">All</option>{[...new Set(users.map(x=>key==='year'?x.graduationYear:key==='batch'?x.batchName:x[key]).filter(Boolean))].sort().map(x=><option key={x}>{x}</option>)}</select></label>)}<label>Email state<select value={advanced.email} onChange={e=>setAdvanced({...advanced,email:e.target.value})}><option value="all">All</option><option value="confirmed">Confirmed</option><option value="unconfirmed">Unconfirmed</option></select></label><label>Account access<select value={advanced.access} onChange={e=>setAdvanced({...advanced,access:e.target.value})}><option value="all">All</option><option value="locked">Locked</option><option value="deactivated">Deactivated</option></select></label><label>Registered after<input type="date" value={advanced.joinedAfter} onChange={e=>setAdvanced({...advanced,joinedAfter:e.target.value})}/></label><label>Last active after<input type="date" value={advanced.activeAfter} onChange={e=>setAdvanced({...advanced,activeAfter:e.target.value})}/></label><button onClick={()=>setAdvanced({department:'',course:'',year:'',batch:'',organization:'',email:'all',access:'all',joinedAfter:'',activeAfter:''})}>Reset filters</button></div></details>

      <div className="members-results-summary">
        <strong>{filteredUsers.length} {filteredUsers.length === 1 ? 'member' : 'members'}</strong>
        <span>{searchQuery || roleFilter !== 'All Roles' || statusFilter !== 'All Statuses' ? 'Matching the selected filters' : 'All registered accounts'}</span>
      </div>

      <div className="members-table">
        {loadError && (
          <p className="members-error">
            {loadError}
          </p>
        )}

        {actionError && (
          <p className="members-error">
            {actionError}
          </p>
        )}

        <div className="table-header">
          <div className="col-user">
            Member
          </div>

          <div className="col-role">
            Member type
          </div>

          <div className="col-joined">
            Joined
          </div>

          <div className="col-status">
            Account status
          </div>

          <div className="col-actions">
            Actions
          </div>
        </div>

        {paginatedUsers.map(user => (
          <div
            className="table-row"
            key={user.id}
          >
            <div className="col-user">
              <input className="member-select" type="checkbox" checked={selectedIds.includes(user.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,user.id]:ids.filter(id=>id!==user.id))} aria-label={`Select ${user.name}`}/>
              <div className="user-avatar">
                {getInitials(user.name)}
              </div>

              <div className="user-info">
                <div className="user-name">
                  {user.name}
                </div>

                <div className="user-email">
                  {user.email}
                </div>

                <div className="user-email-status">
                  {user.emailConfirmed ? (
                    <span className="email-confirmed">
                      ✓ Email confirmed
                    </span>
                  ) : (
                    <span className="email-unconfirmed">
                      Email not confirmed
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="col-role">
              <div className="role-badges">{(user.roles || [user.role]).map((role) => <span key={role} className="role-badge" style={{ backgroundColor: getRoleColor(role) }}>{role}</span>)}</div>
            </div>

            <div className="col-joined" data-label="Joined">
              <strong>{formatJoined(user.joined).date}</strong>
              <span>{formatJoined(user.joined).time}</span>
            </div>

            <div className="col-status" data-label="Account status">
              <span
                className="status-badge"
                style={{
                  color: getStatusColor(user.status),
                }}
              >
                ● {user.status}
              </span>
            </div>

            <div className="col-actions">
              {!user.emailConfirmed ? (
                <button
                  className="action-btn confirm-btn"
                  onClick={() => handleConfirmEmail(user)}
                  disabled={confirmingUserId === user.id}
                  title="Confirm user's email address"
                >
                  {confirmingUserId === user.id
                    ? 'Confirming…'
                    : 'Confirm Email'}
                </button>
              ) : (
                <span className="email-confirmed">
                  ✓ Confirmed
                </span>
              )}

              <button
                className="action-btn"
                onClick={() => openEdit(user)}
                aria-label={`Edit ${user.name}`}
                title="Edit member details"
              >
                Edit
              </button>

              <button
                className="action-btn"
                onClick={() => openView(user)}
                aria-label={`View ${user.name}`}
                title="View member profile"
              >
                View
              </button>

              <button
                className={`action-btn ${user.locked ? 'unlock-btn' : 'lock-btn'}`}
                onClick={() => toggleLock(user)}
                aria-label={`Lock ${user.name}`}
                title="Temporarily lock account"
              >
                {user.locked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          </div>
        ))}

        <div className="table-footer">
          <span>
            Showing{' '}
            {filteredUsers.length
              ? startIdx + 1
              : 0}
            –
            {Math.min(
              startIdx + usersPerPage,
              filteredUsers.length
            )}{' '}
            of {filteredUsers.length} members
          </span>

          <div className="pagination">
            <button
              className="page-btn"
              onClick={() =>
                setCurrentPage(
                  Math.max(1, currentPage - 1)
                )
              }
              disabled={currentPage === 1}
            >
              ‹
            </button>

            {Array.from(
              { length: totalPages },
              (_, i) => i + 1
            ).map(page => (
              <button
                key={page}
                className={`page-btn ${
                  page === currentPage
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  setCurrentPage(page)
                }
              >
                {page}
              </button>
            ))}

            {totalPages > 5 && (
              <span className="page-ellipsis">
                ...
              </span>
            )}

            {totalPages > 5 && (
              <button
                className={`page-btn ${
                  currentPage === totalPages
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  setCurrentPage(totalPages)
                }
              >
                {totalPages}
              </button>
            )}

            <button
              className="page-btn"
              onClick={() =>
                setCurrentPage(
                  Math.min(
                    totalPages,
                    currentPage + 1
                  )
                )
              }
              disabled={
                currentPage === totalPages ||
                totalPages === 0
              }
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {dialog && <div className="member-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }}><section className="member-modal" role="dialog" aria-modal="true" aria-label={`${dialog} member`}>
        <header><div><small>Member directory</small><h2>{dialog === 'add' ? 'Add a member' : dialog === 'edit' ? 'Edit member' : 'Member profile'}</h2></div><button onClick={() => setDialog(null)} aria-label="Close">×</button></header>
        {actionError && <p className="member-dialog-error" role="alert">{actionError}</p>}
        {dialog === 'view' ? (dialogMember ? <div className="member-profile-view"><div className="member-profile-identity"><div className="user-avatar">{getInitials(`${dialogMember.first_name || ''} ${dialogMember.last_name || ''}`)}</div><span><strong>{dialogMember.first_name} {dialogMember.last_name}</strong><small>{dialogMember.email}</small></span></div><dl><div><dt>Role</dt><dd>{dialogMember.role}</dd></div><div><dt>Status</dt><dd>{dialogMember.status}</dd></div><div><dt>Email</dt><dd>{dialogMember.email_confirmed ? 'Confirmed' : 'Not confirmed'}</dd></div><div><dt>Access</dt><dd>{dialogMember.locked ? 'Locked' : 'Active'}</dd></div><div><dt>Joined</dt><dd>{formatJoined(dialogMember.created_at).date}</dd></div><div><dt>Last sign in</dt><dd>{dialogMember.last_sign_in_at ? new Date(dialogMember.last_sign_in_at).toLocaleString() : 'Never'}</dd></div></dl><h3>Education</h3>{dialogMember.education?.length ? dialogMember.education.map((item) => <p className="member-education" key={item.id}><strong>{item.course || item.degree || 'Education record'}</strong><span>{item.department || ''}{item.graduation_year ? ` · Class of ${item.graduation_year}` : ''}</span></p>) : <p className="member-modal-empty">No education records added.</p>}</div> : <p className="member-modal-empty">Loading member…</p>) : <form className="member-form" onSubmit={saveMember}><div className="member-form-grid"><label>First name<input required value={memberForm.first_name} onChange={(e) => setMemberForm({...memberForm,first_name:e.target.value})}/></label><label>Last name<input required value={memberForm.last_name} onChange={(e) => setMemberForm({...memberForm,last_name:e.target.value})}/></label></div><label>Email address<input required type="email" value={memberForm.email} onChange={(e) => setMemberForm({...memberForm,email:e.target.value})}/></label>{dialog === 'add' && <label>Temporary password<input required minLength="8" type="password" value={memberForm.password} onChange={(e) => setMemberForm({...memberForm,password:e.target.value})}/><small>At least 8 characters. Share it securely with the member.</small></label>}<div className="member-form-grid"><label>Role<select value={memberForm.role} onChange={(e) => setMemberForm({...memberForm,role:e.target.value})}>{['alumni','employer','staff','admin'].map(item=><option key={item}>{item}</option>)}</select></label><label>Account status<select value={memberForm.status} onChange={(e) => setMemberForm({...memberForm,status:e.target.value})}>{['pending','verified','suspended'].map(item=><option key={item}>{item}</option>)}</select></label></div>{dialog === 'add' && <label className="member-check"><input type="checkbox" checked={memberForm.email_confirmed} onChange={(e) => setMemberForm({...memberForm,email_confirmed:e.target.checked})}/> Mark email as confirmed</label>}<footer><button type="button" onClick={() => setDialog(null)}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : dialog === 'add' ? 'Create member' : 'Save changes'}</button></footer></form>}
        {dialog === 'view' && dialogMember && verificationPanel()}
        {dialog === 'view' && dialogMember && memberInsightsPanel()}
      </section></div>}
    </div>
  );
}
