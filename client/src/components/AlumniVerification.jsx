import { useState } from 'react';
import './AlumniVerification.css';

const applications = [
  { id: 1, name: 'Alex Rivera', program: 'Class of 2021 · B.S. Computer Science', email: 'alex.rivera.21@alumni.edu', submitted: 'Submitted 2 hours ago', check: 'Name and graduation year match the registration.', alert: false },
  { id: 2, name: 'Jordan Smith', program: 'Class of 2018 · MBA', email: 'jordan.smith@alumni.edu', submitted: 'Submitted 5 hours ago', check: 'Name and graduation year match the registration.', alert: false },
  { id: 3, name: 'Samantha Lee', program: 'Class of 2022 · B.Arch', email: 'samantha.lee@alumni.edu', submitted: 'Submitted yesterday', check: 'Please check the photo clarity before approving.', alert: true },
];

const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 14h8M8 17h5"/></svg>;

export default function AlumniVerification() {
  const [queue, setQueue] = useState(applications);
  const [selectedId, setSelectedId] = useState(1);
  const [note, setNote] = useState('');
  const selected = queue.find(person => person.id === selectedId);
  const decide = (message) => { window.alert(`${selected.name}'s registration was ${message}.`); const remaining = queue.filter(person => person.id !== selected.id); setQueue(remaining); setSelectedId(remaining[0]?.id); setNote(''); };
  if (!selected) return <div className="verification-empty"><span>✓</span><h1>You are all caught up</h1><p>There are no alumni registrations waiting for review.</p></div>;
  return <div className="verification-page">
    <header className="verification-heading"><div><p className="admin-kicker">Member records</p><h1>Alumni verification</h1><p>Review registrations carefully so the alumni community remains trusted and welcoming.</p></div><button className="verification-help">How verification works</button></header>
    <div className="verification-layout">
      <aside className="verification-queue"><div className="queue-title"><strong>Waiting for review</strong><span>{queue.length}</span></div><p>Select a person to check their submitted details and documents.</p>{queue.map(person => <button className={`queue-card ${person.id === selectedId ? 'active' : ''}`} key={person.id} onClick={() => setSelectedId(person.id)}><b>{person.name.split(' ').map(word => word[0]).join('')}</b><span><strong>{person.name}</strong><small>{person.program}</small><small>{person.submitted}</small></span><em>Ready to review</em></button>)}</aside>
      <section className="review-panel"><div className="applicant-summary"><span className="person-mark">◉</span><div><h2>{selected.name}</h2><p>{selected.email}</p><p>{selected.program}</p></div><b>Under review</b></div><div className="review-tip">ⓘ <span><strong>Before approving:</strong> Confirm the graduate’s name and year on the degree document, then compare it with the ID.</span></div><div className="documents-grid"><Document title="Degree certificate" file="degree-certificate.pdf" text="Name and graduation details match the registration."/><Document title="Identity document" file="government-id.jpg" text={selected.check} alert={selected.alert}/></div><label className="remarks">Reviewer notes <small>Optional — saved with this decision</small><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Add a helpful note for the record, or explain what information is needed…"/></label><div className="review-actions"><button className="request-btn" onClick={() => decide('returned for more information')}>Request more information</button><button className="approve-btn" onClick={() => decide('approved and verified')}>Approve & verify alumni</button></div></section>
    </div>
  </div>;
}

function Document({ title, file, text, alert }) { return <article className="document-card"><header><strong>{title}</strong><span>{alert ? 'Needs a look' : '✓ Checked'}</span></header><button className="document-preview"><FileIcon/><strong>{file}</strong><small>Open document</small></button><p className={alert ? 'alert' : ''}><b>{alert ? '!' : '✓'}</b>{text}</p></article>; }
