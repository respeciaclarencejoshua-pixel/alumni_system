import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { adminApi } from '../../lib/adminApi.js';
import AdminDashboard from './AdminDashboard.jsx';
import './AdminPortal.css';

export default function AdminPortal() {
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return mounted && setState('signed-out');
      try {
        await adminApi('/api/admin/me');
        if (mounted) setState('authorized');
      } catch (error) {
        if (mounted) {
          setMessage(error.message);
          setState(error.message.includes('Administrator access') ? 'forbidden' : 'signed-out');
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setState('signed-out');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessage('You have been signed out.');
    setState('signed-out');
  }

  if (state === 'authorized') return <AdminDashboard onSignOut={signOut} />;
  if (state === 'loading') return <div className="admin-access"><p>Checking administrator access…</p></div>;
  if (state === 'forbidden') return <div className="admin-access"><section><p className="admin-access-kicker">Access restricted</p><h1>Administrator access required</h1><p>Your sign-in worked, but this account has not been approved for the admin portal. Ask an existing administrator to assign it the <strong>admin</strong> or <strong>staff</strong> role.</p><p className="admin-access-error">{message}</p><button onClick={signOut}>Sign out</button></section></div>;

  return <div className="admin-access"><form onSubmit={signIn}><p className="admin-access-kicker">AlumniConnect</p><h1>Admin sign in</h1><p>Use an approved administrator or staff account.</p>{message && <p className="admin-access-error">{message}</p>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button type="submit">Sign in securely</button></form></div>;
}
