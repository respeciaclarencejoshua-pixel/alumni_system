import { useState } from 'react';
import { supabase } from './lib/supabase.js';

export default function Login({ onRegister, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    onClose();
  }

  return <main className="auth-page"><section className="auth-card"><div className="register-header"><p className="eyebrow green">NDDU ALUMNI</p><h1>Welcome back</h1><p>Log in to reconnect with the NDDU alumni community.</p></div><form onSubmit={handleSubmit} className="register-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <p className="form-error">{error}</p>}<button type="submit" className="dark-button register-button" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button><p className="auth-switch">New to NDDU Alumni? <button type="button" onClick={onRegister}>Create an account</button></p></form><button className="auth-back" type="button" onClick={onClose}>← Back to website</button></section></main>;
}
