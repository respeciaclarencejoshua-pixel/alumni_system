import { useCallback, useState } from 'react';
import { supabase } from './lib/supabase.js';
import TurnstileCaptcha from './components/TurnstileCaptcha.jsx';

export default function Login({ onRegister, onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const handleCaptchaToken = useCallback((token) => setCaptchaToken(token), []);

  async function submit(event) {
    event.preventDefault(); setLoading(true); setMessage('');
    if (!captchaToken) { setMessage('Complete the bot-protection check first.'); setLoading(false); return; }
    if (mode === 'recovery') {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/` });
      setMessage(error ? error.message : 'If an account matches that email, a password-reset link has been sent.');
      setLoading(false); setCaptchaToken(''); setCaptchaResetKey((key) => key + 1); return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password, options: { captchaToken } });
    if (error) { setMessage(error.message); setCaptchaToken(''); setCaptchaResetKey((key) => key + 1); setLoading(false); return; }
    onClose();
  }

  return <main className="auth-page"><section className="auth-card"><div className="register-header"><p className="eyebrow green">NDDU ALUMNI</p><h1>{mode === 'login' ? 'Welcome back' : 'Reset your password'}</h1><p>{mode === 'login' ? 'Log in to reconnect with the NDDU alumni community.' : 'We will email a secure password-reset link to your account.'}</p></div><form onSubmit={submit} className="register-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>{mode === 'login' && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>}<TurnstileCaptcha onToken={handleCaptchaToken} resetKey={captchaResetKey} />{message && <p className={message.includes('sent') ? 'form-success' : 'form-error'} role="status">{message}</p>}<button type="submit" className="dark-button register-button" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Send reset link'}</button>{mode === 'login' ? <><button type="button" className="auth-inline-action" onClick={() => { setMode('recovery'); setMessage(''); }}>Forgot password?</button><p className="auth-switch">New to NDDU Alumni? <button type="button" onClick={onRegister}>Create an account</button></p></> : <button type="button" className="auth-inline-action" onClick={() => { setMode('login'); setMessage(''); }}>Back to login</button>}</form><button className="auth-back" type="button" onClick={onClose}>← Back to website</button></section></main>;
}
