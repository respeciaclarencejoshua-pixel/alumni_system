import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';
import { supabase } from '../../lib/supabase.js';

const editableFields = [
  'institution_name', 'contact_email', 'allow_open_signups', 'verify_domain',
  'approved_email_domains', 'session_timeout_minutes', 'require_admin_mfa',
  'content_retention_days', 'maintenance_mode', 'captcha_provider',
  'captcha_enabled', 'upload_max_mb', 'allowed_file_types',
  'verification_document_retention_days', 'moderation_reasons',
  'rate_limit_per_minute', 'email_templates',
];

function editableSettings(settings) {
  return Object.fromEntries(editableFields.filter((key) => key in settings && settings[key] != null).map((key) => [key, settings[key]]));
}

export default function SystemSettings() {
  const [tab, setTab] = useState('Configuration');
  const [settings, setSettings] = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState('');
  const [mfaFactors, setMfaFactors] = useState([]);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  async function loadMfa() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const factors = data?.all || [...(data?.totp || []), ...(data?.phone || [])];
    setMfaFactors(factors);
    return factors;
  }

  async function load() {
    try {
      const [settingsResult, logsResult] = await Promise.all([adminApi('/api/admin/settings'), adminApi('/api/admin/audit-logs')]);
      setSettings(settingsResult.settings);
      setSavedSettings(settingsResult.settings);
      setLogs(logsResult.logs || []);
      await loadMfa();
      setMessage('');
    } catch (error) { setMessage(error.message); }
  }

  useEffect(() => { load(); }, []);
  const dirty = Boolean(settings && savedSettings && JSON.stringify(settings) !== JSON.stringify(savedSettings));
  const verifiedFactor = mfaFactors.find((factor) => factor.factor_type === 'totp' && factor.status === 'verified');

  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function beginMfaSetup() {
    setMfaBusy(true); setMessage('');
    try {
      let factors = await loadMfa();
      let factor = factors.find((item) => item.factor_type === 'totp' && item.status === 'verified');
      let qrCode = null;
      if (!factor) {
        const staleFactors = factors.filter((item) => item.factor_type === 'totp' && item.status !== 'verified');
        for (const staleFactor of staleFactors) {
          const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: staleFactor.id });
          if (removeError) throw removeError;
        }
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'NDDU Admin Portal' });
        if (error) throw error;
        factor = { id: data.id };
        qrCode = data.totp.qr_code;
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;
      setMfaSetup({ factorId: factor.id, challengeId: challenge.id, qrCode });
      setMessage(qrCode ? 'Scan the QR code, then enter the six-digit code.' : 'Enter a fresh code from your authenticator to confirm this session.');
    } catch (error) { setMessage(error.message); }
    finally { setMfaBusy(false); }
  }

  async function verifyMfa() {
    if (!/^\d{6}$/.test(mfaCode)) return setMessage('Enter the six-digit code from your authenticator app.');
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId: mfaSetup.factorId, challengeId: mfaSetup.challengeId, code: mfaCode });
      if (error) throw error;
      await loadMfa();
      setMfaSetup(null); setMfaCode('');
      setSettings((current) => ({ ...current, require_admin_mfa: true }));
      setMessage('Authenticator verified. Save configuration to require MFA for every administrator.');
    } catch (error) { setMessage(error.message); }
    finally { setMfaBusy(false); }
  }

  function toggleMfa(checked) {
    if (checked && !verifiedFactor) {
      setMessage('Set up and verify an authenticator before enabling mandatory MFA.');
      beginMfaSetup();
      return;
    }
    setSettings({ ...settings, require_admin_mfa: checked });
  }

  async function save(event) {
    event.preventDefault();
    try {
      const result = await adminApi('/api/admin/settings', { method: 'PUT', body: JSON.stringify(editableSettings(settings)) });
      setSettings(result.settings); setSavedSettings(result.settings);
      setMessage('Settings saved and recorded in the audit log.');
    } catch (error) {
      const detail = error.fields ? Object.values(error.fields).flat().join(' ') : '';
      setMessage(detail || error.message);
    }
  }

  if (!settings) return <section className="admin-panel admin-live-loading" role="status">Loading settings…</section>;

  return <div className="settings-page">
    <header className="admin-page-header settings-header"><div><p>Connected administration</p><h1>System Settings</h1><span>Configuration changes are saved to Supabase and audited.</span></div><button onClick={load}>↻ Refresh</button></header>
    {message && <p className="admin-resource-message" role="status">{message}</p>}
    <nav className="settings-tabs" aria-label="Settings sections">{['Configuration', 'Activity Logs', 'Recommendations'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
    {tab === 'Configuration' && <form className="settings-grid" onSubmit={save}>
      <article className="admin-panel setting-card"><header><h2>School information</h2></header><label>Institution name<input required maxLength="150" value={settings.institution_name || ''} onChange={(e) => setSettings({ ...settings, institution_name: e.target.value })} /></label><label>Contact email<input required type="email" value={settings.contact_email || ''} onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })} /></label></article>
      <article className="admin-panel setting-card"><header><h2>Registration &amp; access</h2></header><label className="setting-toggle"><span><strong>Allow open signups</strong><p>New users can create accounts.</p></span><input type="checkbox" checked={settings.allow_open_signups} onChange={(e) => setSettings({ ...settings, allow_open_signups: e.target.checked })} /></label><label className="setting-toggle"><span><strong>Verify domain</strong><p>Require an approved email domain.</p></span><input type="checkbox" checked={settings.verify_domain} onChange={(e) => setSettings({ ...settings, verify_domain: e.target.checked })} /></label><label>Approved domains<input placeholder="nddu.edu.ph, example.edu" value={(settings.approved_email_domains || []).join(', ')} onChange={(e) => setSettings({ ...settings, approved_email_domains: e.target.value.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) })} /></label><label>Admin session timeout <span className="field-unit">minutes</span><input type="number" min="15" max="1440" value={settings.session_timeout_minutes || 60} onChange={(e) => setSettings({ ...settings, session_timeout_minutes: Number(e.target.value) })} /></label></article>
      <article className="admin-panel setting-card"><header><h2>Security &amp; retention</h2></header><label className="setting-toggle"><span><strong>Require admin MFA</strong><p>{verifiedFactor ? 'Authenticator enrolled for this account.' : 'Set up an authenticator before enabling.'}</p></span><input type="checkbox" checked={Boolean(settings.require_admin_mfa)} onChange={(e) => toggleMfa(e.target.checked)} /></label><button type="button" className="settings-secondary" disabled={mfaBusy} onClick={beginMfaSetup}>{verifiedFactor ? 'Verify authenticator now' : 'Set up authenticator'}</button>{mfaSetup && <div className="mfa-setup" role="group" aria-label="Authenticator verification">{mfaSetup.qrCode && <><img src={mfaSetup.qrCode} alt="QR code for authenticator enrollment" /><p>Scan with Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</p></>}<label>Six-digit verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} /></label><button type="button" disabled={mfaBusy || mfaCode.length !== 6} onClick={verifyMfa}>Verify authenticator</button></div>}<label className="setting-toggle"><span><strong>Maintenance mode</strong><p>Temporarily restrict community APIs.</p></span><input type="checkbox" checked={Boolean(settings.maintenance_mode)} onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })} /></label><div className="setting-number-grid"><label>Requests per minute<input type="number" min="10" max="1000" value={settings.rate_limit_per_minute || 60} onChange={(e) => setSettings({ ...settings, rate_limit_per_minute: Number(e.target.value) })} /></label><label>Upload limit <span className="field-unit">MB</span><input type="number" min="1" max="50" value={settings.upload_max_mb || 10} onChange={(e) => setSettings({ ...settings, upload_max_mb: Number(e.target.value) })} /></label><label>Content retention <span className="field-unit">days</span><input type="number" min="1" max="365" value={settings.content_retention_days || 30} onChange={(e) => setSettings({ ...settings, content_retention_days: Number(e.target.value) })} /></label></div></article>
      <footer className="settings-save-bar"><span>{dirty ? 'You have unsaved changes.' : 'All changes are saved.'}</span><button className="settings-submit" disabled={!dirty}>Save configuration</button></footer>
    </form>}
    {tab === 'Activity Logs' && <section className="admin-panel admin-audit-table">{logs.length ? logs.map((log) => <article key={log.id}><strong>{log.action}</strong><span>{log.target_type}{log.target_id ? ` · ${log.target_id}` : ''}</span><time>{new Date(log.created_at).toLocaleString()}</time></article>) : <p>No administrative activity recorded.</p>}</section>}
    {tab === 'Recommendations' && <section className="admin-panel admin-recommendations"><h2>Operational safeguards</h2><ol><li>Test database restoration quarterly.</li><li>Review administrator access monthly.</li><li>Connect malware scanning before accepting high-risk attachments.</li><li>Review security and audit logs after every deployment.</li></ol></section>}
  </div>;
}
