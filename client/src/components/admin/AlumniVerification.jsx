import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi.js';
import './AlumniVerification.css';

const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 14h8M8 17h5" /></svg>;

function personName(verification) {
  const profile = verification.profiles;
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || verification.graduation_name;
}

export default function AlumniVerification() {
  const [queue, setQueue] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const selected = queue.find((person) => person.id === selectedId);

  async function loadQueue() {
    setLoading(true);
    setError('');
    try {
      const { verifications } = await adminApi('/api/admin/verifications?status=pending');
      setQueue(verifications);
      setSelectedId((current) => verifications.some((item) => item.id === current) ? current : verifications[0]?.id || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQueue(); }, []);

  async function decide(status) {
    if (!selected) return;
    try {
      await adminApi(`/api/admin/verifications/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewerNote: note }) });
      await loadQueue();
      setNote('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function openEvidence() {
    try {
      const { url } = await adminApi(`/api/admin/verifications/${selected.id}/document`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading) return <div className="verification-empty"><p>Loading verification submissions…</p></div>;
  if (error && !selected) return <div className="verification-empty"><h1>Could not load verifications</h1><p>{error}</p><button className="verification-help" onClick={loadQueue}>Try again</button></div>;
  if (!selected) return <div className="verification-empty"><span>✓</span><h1>You are all caught up</h1><p>There are no alumni registrations waiting for review.</p></div>;

  return <div className="verification-page">
    <header className="verification-heading"><div><p className="admin-kicker">Member records</p><h1>Alumni verification</h1><p>Review graduation evidence carefully so the alumni community remains trusted and welcoming.</p></div><button className="verification-help" onClick={loadQueue}>Refresh queue</button></header>
    {error && <p className="admin-access-error">{error}</p>}
    <div className="verification-layout">
      <aside className="verification-queue"><div className="queue-title"><strong>Waiting for review</strong><span>{queue.length}</span></div><p>Select a person to check their submitted graduation details and evidence.</p>{queue.map((person) => <button className={`queue-card ${person.id === selectedId ? 'active' : ''}`} key={person.id} onClick={() => { setSelectedId(person.id); setNote(''); }}><b>{personName(person).split(' ').map((word) => word[0]).join('')}</b><span><strong>{personName(person)}</strong><small>Class of {person.graduation_year} · {person.program}</small><small>Submitted {new Date(person.created_at).toLocaleDateString()}</small></span><em>Ready to review</em></button>)}</aside>
      <section className="review-panel"><div className="applicant-summary"><span className="person-mark">◎</span><div><h2>{personName(selected)}</h2><p>{selected.profiles?.email}</p><p>Class of {selected.graduation_year} · {selected.program}</p></div><b>Under review</b></div><div className="review-tip">ⓘ <span><strong>Before approving:</strong> Confirm the graduate's name, programme, and graduation year from the submitted alumni record. Do not request government or personal identification.</span></div><div className="documents-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}><article className="document-card"><header><strong>Graduation evidence</strong><span>Ready to check</span></header><button className="document-preview" onClick={openEvidence}><FileIcon /><strong>{selected.document_filename}</strong><small>Open secure document</small></button><p><b>✓</b>Compare the document with the submitted graduation details.</p></article></div><label className="remarks">Reviewer notes <small>Saved with this decision</small><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a helpful note, or explain which graduation detail needs clarification…" /></label><div className="review-actions"><button className="request-btn" onClick={() => decide('needs_information')}>Request more information</button><button className="approve-btn" onClick={() => decide('verified')}>Approve & verify alumni</button></div></section>
    </div>
  </div>;
}
