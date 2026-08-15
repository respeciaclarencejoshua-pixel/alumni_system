import { useState } from 'react';
import { supabase } from './lib/supabase.js';

export default function Register({ onLogin, onClose }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { first_name: form.firstName, last_name: form.lastName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setMessage('Registration successful! You can now log in.');
    setForm({ firstName: '', lastName: '', email: '', password: '' });
    setLoading(false);
  }

  return <main className="auth-page"><section className="auth-card"><div className="register-header"><p className="eyebrow green">NDDU ALUMNI</p><h1>Create your account</h1><p>Join the NDDU Alumni Network and reconnect with your community.</p></div><form onSubmit={handleSubmit} className="register-form"><div><label>First Name<input type="text" name="firstName" value={form.firstName} onChange={handleChange} autoComplete="given-name" required /></label><label>Last Name<input type="text" name="lastName" value={form.lastName} onChange={handleChange} autoComplete="family-name" required /></label></div><label>Email<input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" required /></label><label>Password<input type="password" name="password" value={form.password} onChange={handleChange} autoComplete="new-password" minLength={6} required /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button type="submit" className="dark-button register-button" disabled={loading}>{loading ? 'Creating account…' : 'Create Account'}</button><p className="auth-switch">Already have an account? <button type="button" onClick={onLogin}>Log in</button></p></form><button className="auth-back" type="button" onClick={onClose}>← Back to website</button></section></main>;
}
