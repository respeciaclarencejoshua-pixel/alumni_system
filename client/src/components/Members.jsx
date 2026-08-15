import { useState, useEffect } from 'react';
import { adminApi } from '../lib/adminApi.js';
import './Members.css';

export default function Members() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState('');
  const usersPerPage = 4;

  useEffect(() => {
    adminApi('/api/admin/members?pageSize=100')
      .then(({ members }) => {
        setUsers(members);
        setFilteredUsers(members);
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    // Apply filters
    let filtered = users;

    // Role filter
    if (roleFilter !== 'All Roles') {
      filtered = filtered.filter(user => user.role === roleFilter);
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

    setFilteredUsers(filtered);
    setCurrentPage(1);
  }, [users, searchQuery, roleFilter, statusFilter]);

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIdx = (currentPage - 1) * usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIdx, startIdx + usersPerPage);

  const getRoleColor = (role) => {
    const colors = {
      ADMIN: '#3B82F6',
      EMPLOYER: '#8B5CF6',
      STAFF: '#10B981',
    };
    return colors[role] || '#6B7280';
  };

  const getStatusColor = (status) => {
    const colors = {
      Verified: '#10B981',
      Pending: '#F59E0B',
      Suspended: '#EF4444',
    };
    return colors[status] || '#6B7280';
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Joined', 'Status'];
    const rows = filteredUsers.map(user => [
      user.name,
      user.email,
      user.role,
      user.joined,
      user.status
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'members.csv';
    link.click();
  };

  const roles = ['All Roles', 'ADMIN', 'EMPLOYER', 'STAFF'];
  const statuses = ['All Statuses', 'Verified', 'Pending', 'Suspended'];

  return (
    <div className="members-container">
      <div className="members-header">
        <div className="members-title">
          <p className="members-kicker">Community administration</p>
          <h1>Member directory</h1>
          <p>Find people, update account access, and guide pending alumni through verification.</p>
        </div>
        <div className="members-actions">
          <button className="btn-secondary" onClick={handleExportCSV}>
            ⬇ Export CSV
          </button>
          <button className="btn-primary">+ Add New User</button>
        </div>
      </div>

      <div className="members-filters">
        <div className="filter-group">
          <label>Member type</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            {roles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Account status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        <div className="filter-group search">
          <label>Search members</label>
          <input
            type="text"
            placeholder="Type a name or email address…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="members-table">
        {loadError && <p className="members-error">{loadError}</p>}
        <div className="table-header">
          <div className="col-user">Member</div>
          <div className="col-role">Member type</div>
          <div className="col-joined">JOINED</div>
          <div className="col-status">Account status</div>
          <div className="col-actions">ACTIONS</div>
        </div>

        {paginatedUsers.map(user => (
          <div className="table-row" key={user.id}>
            <div className="col-user">
              <div className="user-avatar">{getInitials(user.name)}</div>
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-email">{user.email}</div>
              </div>
            </div>
            <div className="col-role">
              <span className="role-badge" style={{ backgroundColor: getRoleColor(user.role) }}>
                {user.role}
              </span>
            </div>
            <div className="col-joined">{user.joined}</div>
            <div className="col-status">
              <span className="status-badge" style={{ color: getStatusColor(user.status) }}>
                ● {user.status}
              </span>
            </div>
            <div className="col-actions">
              <button className="action-btn" aria-label={`Edit ${user.name}`} title="Edit member details">Edit</button>
              <button className="action-btn" aria-label={`View ${user.name}`} title="View member profile">View</button>
              <button className="action-btn" aria-label={`Lock ${user.name}`} title="Temporarily lock account">Lock</button>
            </div>
          </div>
        ))}

        <div className="table-footer">
          <span>Showing {filteredUsers.length ? startIdx + 1 : 0}–{Math.min(startIdx + usersPerPage, filteredUsers.length)} of {filteredUsers.length} members</span>
          <div className="pagination">
            <button
              className="page-btn"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`page-btn ${page === currentPage ? 'active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            {totalPages > 5 && <span className="page-ellipsis">...</span>}
            {totalPages > 5 && (
              <button
                className={`page-btn ${currentPage === totalPages ? 'active' : ''}`}
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            )}
            <button
              className="page-btn"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
