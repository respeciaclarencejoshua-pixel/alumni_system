export function communityAccess(userId, profile, alumniStatus) {
  const currentProfile = Boolean(userId && profile?.id === userId);
  const isSuperAdmin = currentProfile && profile.role === 'admin' && profile.status === 'verified' && !profile.deactivated_at;
  const restricted = currentProfile && (profile.status === 'suspended' || profile.deactivated_at);
  return {
    isSuperAdmin,
    verificationStatus: !userId || restricted ? null : isSuperAdmin ? 'verified' : alumniStatus,
  };
}
