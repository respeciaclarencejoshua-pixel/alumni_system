import test from 'node:test';
import assert from 'node:assert/strict';
import { communityAccess } from '../../client/src/lib/communityAccess.js';

test('verified super admin can use community pages without an alumni submission', () => {
  assert.deepEqual(communityAccess('owner', { id: 'owner', role: 'admin', status: 'verified' }, null), { isSuperAdmin: true, verificationStatus: 'verified' });
});

test('pending, suspended, deactivated and previous-account profiles do not grant super admin access', () => {
  for (const profile of [
    { id: 'owner', role: 'admin', status: 'pending' },
    { id: 'owner', role: 'admin', status: 'suspended' },
    { id: 'owner', role: 'admin', status: 'verified', deactivated_at: '2026-09-22' },
    { id: 'other', role: 'admin', status: 'verified' },
  ]) assert.equal(communityAccess('owner', profile, null).isSuperAdmin, false);
  assert.equal(communityAccess('owner', { id: 'owner', role: 'admin', status: 'suspended' }, 'verified').verificationStatus, null);
});

test('ordinary alumni and staff retain their existing verification requirement', () => {
  for (const role of ['alumni', 'staff', 'employer']) {
    const profile = { id: 'user', role, status: 'verified' };
    assert.equal(communityAccess('user', profile, null).verificationStatus, null);
    assert.equal(communityAccess('user', profile, 'verified').verificationStatus, 'verified');
  }
  assert.equal(communityAccess(null, { id: 'owner', role: 'admin', status: 'verified' }, 'verified').verificationStatus, null);
});
