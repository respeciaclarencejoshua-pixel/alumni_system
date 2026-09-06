import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './AccountSettings.css';

export default function AccountSettings({ user, profile, onClose, onProfileChange }) {
  const [firstName, setFirstName] = useState(profile?.first_name || user.user_metadata?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || user.user_metadata?.last_name || '');
  const [avatar, setAvatar] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const avatarUrl = useMemo(() => avatar ? URL.createObjectURL(avatar) : profile?.avatar_url, [avatar, profile?.avatar_url]);
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'AU';
  useEffect(() => () => { if (avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarUrl); }, [avatarUrl]);

  async function save(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    let newAvatarUrl = profile?.avatar_url || '';
    let uploadedPath = null;
    if (avatar) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatar.type) || avatar.size > 2 * 1024 * 1024) { setMessage('Use a JPG, PNG, or WebP image no larger than 2 MB.'); setSaving(false); return; }
      const extension = avatar.name.split('.').pop().toLowerCase();
      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from('profile-avatars').upload(uploadedPath, avatar, { contentType: avatar.type });
      if (error) { setMessage(error.message); setSaving(false); return; }
      newAvatarUrl = supabase.storage.from('profile-avatars').getPublicUrl(uploadedPath).data.publicUrl;
    }
    const { data, error } = await supabase.rpc('update_own_profile', { p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_avatar_url: newAvatarUrl });
    if (error) { if (uploadedPath) await supabase.storage.from('profile-avatars').remove([uploadedPath]); setMessage(error.message); setSaving(false); return; }
    if (uploadedPath && profile?.avatar_url) {
      const marker = '/profile-avatars/';
      const oldPath = decodeURIComponent(profile.avatar_url.split(marker)[1]?.split('?')[0] || '');
      if (oldPath.startsWith(`${user.id}/`) && oldPath !== uploadedPath) await supabase.storage.from('profile-avatars').remove([oldPath]);
    }
    onProfileChange(data); setAvatar(null); setMessage('Profile saved.'); setSaving(false);
  }

  async function changePassword(event) {
    event.preventDefault(); setMessage('');
    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) return setMessage('Use at least 12 characters with uppercase, lowercase, and a number.');
    if (newPassword !== confirmPassword) return setMessage('The new passwords do not match.');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) return setMessage(error.message);
    setNewPassword(''); setConfirmPassword(''); setMessage('Password updated successfully.');
  }

  return <div className="settings-backdrop" role="presentation" onMouseDown={onClose}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Profile settings" onMouseDown={(event) => event.stopPropagation()}><button className="settings-close" aria-label="Close settings" onClick={onClose}>×</button><header><p className="eyebrow green">My account</p><h1>Profile settings</h1><p>Update your public profile and account security.</p></header><form onSubmit={save}><div className="avatar-editor"><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="Profile preview" /> : initials}</div><label>Profile picture <small>JPG, PNG, or WebP · maximum 2 MB</small><input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => setAvatar(event.target.files?.[0] || null)} /></label></div><div className="settings-name-fields"><label>First name<input maxLength="100" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label><label>Last name<input maxLength="100" value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label></div><label>Email address<input value={user.email} readOnly /></label><footer><button type="button" className="settings-cancel" onClick={onClose}>Cancel</button><button className="dark-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></footer></form><form onSubmit={changePassword} className="account-password-form"><h2>Change password</h2><p>Use a unique password you do not use elsewhere.</p><label>New password<input type="password" minLength="12" maxLength="128" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label>Confirm new password<input type="password" minLength="12" maxLength="128" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label><button className="dark-button" disabled={saving}>Update password</button></form>{message && <p className="settings-message" role="status">{message}</p>}</section></div>;
}
