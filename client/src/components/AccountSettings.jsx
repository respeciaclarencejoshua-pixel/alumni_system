import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './AccountSettings.css';

export default function AccountSettings({ user, profile, onClose, onProfileChange }) {
  const [firstName, setFirstName] = useState(profile?.first_name || user.user_metadata?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || user.user_metadata?.last_name || '');
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const avatarUrl = avatar ? URL.createObjectURL(avatar) : profile?.avatar_url;
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'AU';

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    let newAvatarUrl = profile?.avatar_url || '';
    if (avatar) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatar.type) || avatar.size > 2 * 1024 * 1024) {
        setMessage('Use a JPG, PNG, or WebP image no larger than 2 MB.');
        setSaving(false);
        return;
      }
      const extension = avatar.name.split('.').pop().toLowerCase();
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, avatar, { contentType: avatar.type });
      if (uploadError) {
        setMessage(uploadError.message);
        setSaving(false);
        return;
      }
      newAvatarUrl = supabase.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase.rpc('update_own_profile', { p_first_name: firstName, p_last_name: lastName, p_avatar_url: newAvatarUrl });
    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }
    onProfileChange(data);
    setMessage('Profile saved.');
    setSaving(false);
  }

  return <div className="settings-backdrop" role="presentation" onMouseDown={onClose}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Profile settings" onMouseDown={(event) => event.stopPropagation()}><button className="settings-close" aria-label="Close settings" onClick={onClose}>×</button><header><p className="eyebrow green">My account</p><h1>Profile settings</h1><p>Update how you appear in the NDDU alumni community.</p></header><form onSubmit={save}><div className="avatar-editor"><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</div><label>Profile picture <small>JPG, PNG, or WebP · maximum 2 MB</small><input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => setAvatar(event.target.files?.[0] || null)} /></label></div><div className="settings-name-fields"><label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label><label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label></div><label>Email address<input value={user.email} readOnly /></label>{message && <p className="settings-message">{message}</p>}<footer><button type="button" className="settings-cancel" onClick={onClose}>Cancel</button><button className="dark-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></footer></form></section></div>;
}
