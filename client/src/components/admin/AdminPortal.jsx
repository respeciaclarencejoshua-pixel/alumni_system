import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { adminApi } from '../../lib/adminApi.js';
import AdminDashboard from './AdminDashboard.jsx';
import './AdminPortal.css';
import TurnstileCaptcha from '../TurnstileCaptcha.jsx';
import { useCaptchaEnabled } from '../../hooks/usePublicConfig.js';

export default function AdminPortal() {
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const captchaEnabled = useCaptchaEnabled();
  const [access, setAccess] = useState(null);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const handleCaptchaToken = useCallback((token) => setCaptchaToken(token), []);

  useEffect(() => {
    let mounted = true;
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return mounted && setState('signed-out');
      try {
        const result = await adminApi('/api/admin/me');
        if (mounted) { setAccess(result); setState('authorized'); }
      } catch (error) {
        if (mounted) {
          setMessage(error.message);
          if (error.code === 'MFA_REQUIRED') {
            const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
            const factor = factors?.totp?.find((item) => item.status === 'verified');
            if (factorsError || !factor) {
              setMessage(factorsError?.message || 'MFA is required, but this account has no verified authenticator. Ask a super administrator to temporarily disable enforcement so you can enroll.');
              setState('forbidden');
            } else {
              const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
              if (challengeError) { setMessage(challengeError.message); setState('forbidden'); }
              else { setMfaChallenge({ factorId: factor.id, challengeId: challenge.id }); setMessage('Enter the code from your authenticator app.'); setState('mfa-required'); }
            }
          } else {
            setState(['ADMIN_REQUIRED', 'ADMIN_NOT_VERIFIED'].includes(error.code) ? 'forbidden' : 'signed-out');
          }
        }
      }
    }
    checkAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => checkAccess());
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setState('loading');
    setMessage('');
    if (captchaEnabled && !captchaToken) {
      setMessage('Complete the bot-protection check before signing in.');
      setState('signed-out');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: captchaEnabled ? { captchaToken } : {} });
    if (error) {
      setMessage(error.message);
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
      setState('signed-out');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessage('You have been signed out.');
    setState('signed-out');
  }

  async function verifyMfa(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(mfaCode) || !mfaChallenge) return setMessage('Enter a valid six-digit authenticator code.');
    setState('loading');
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaChallenge.factorId, challengeId: mfaChallenge.challengeId, code: mfaCode });
    if (error) { setMessage(error.message); setMfaCode(''); setState('mfa-required'); return; }
    try { const result = await adminApi('/api/admin/me'); setAccess(result); setState('authorized'); }
    catch (accessError) { setMessage(accessError.message); setState('forbidden'); }
  }

  if (state === 'authorized') return <AdminDashboard onSignOut={signOut} access={access} />;
  if (state === 'mfa-required') return <div className="admin-access"><form onSubmit={verifyMfa}><p className="admin-access-kicker">Additional verification</p><h1>Authenticator code</h1><p>{message}</p><label>Six-digit code<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))} required /></label><button type="submit" disabled={mfaCode.length !== 6}>Verify and continue</button><button type="button" onClick={signOut}>Cancel and sign out</button></form></div>;
  if (state === 'loading') return <div className="admin-access"><p>Checking administrator access…</p></div>;
  if (state === 'forbidden') return <div className="admin-access"><section><p className="admin-access-kicker">Access restricted</p><h1>Administrator access required</h1><p>Your sign-in worked, but this account has not been approved for the admin portal. Ask an existing administrator to assign it the <strong>admin</strong> or <strong>staff</strong> role.</p><p className="admin-access-error">{message}</p><button onClick={signOut}>Sign out</button></section></div>;

  return <div className="admin-access"><form onSubmit={signIn}><p className="admin-access-kicker">AlumniConnect</p><h1>Admin sign in</h1><p>Use an approved administrator or staff account.</p>{message && <p className="admin-access-error">{message}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><TurnstileCaptcha enabled={captchaEnabled} onToken={handleCaptchaToken} resetKey={captchaResetKey} /><button type="submit">Sign in securely</button></form></div>;
}
