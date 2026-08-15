import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Profile.css';

const statusCopy = { pending: ['Under review', 'Your graduation evidence has been submitted and is awaiting review.'], needs_information: ['More information needed', 'Please submit a new graduation record with the details requested by the reviewer.'], verified: ['Verified alumnus', 'Your alumni status is confirmed. You can now use verified alumni features.'], rejected: ['Unable to verify', 'Your submission could not be confirmed. You may submit a new graduation record.'] };

function toIsoDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return Number.isNaN(date.getTime()) || date.getDate() !== Number(day) || date.getMonth() !== Number(month) - 1 ? null : `${year}-${month}-${day}`;
}

export default function Profile({ user, onStatusChange }) {
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ graduationName: '', graduationDate: '', batchName: '', program: '', document: null });

  async function loadVerification() {
    setLoading(true);
    const { data, error } = await supabase.from('alumni_verifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) setMessage('Verification setup is unavailable. Run the updated Supabase schema, then refresh this page.');
    else { setVerification(data); onStatusChange?.(data); }
    setLoading(false);
  }
  useEffect(() => { loadVerification(); }, [user.id]);

  function updateField(event) { const { name, value, files } = event.target; setForm((current) => ({ ...current, [name]: files ? files[0] : value })); }
  function formatGraduationDate(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
    setForm((current) => ({ ...current, graduationDate: [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/') }));
  }

  async function submit(event) {
    event.preventDefault();
    const graduationDate = toIsoDate(form.graduationDate);
    const file = form.document;
    if (!graduationDate) return setMessage('Enter a valid graduation date in DD/MM/YYYY format.');
    if (!file) return setMessage('Please attach a graduation certificate, transcript, or alumni record.');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) return setMessage('Use a PDF, JPG, or PNG file no larger than 10 MB.');
    setSubmitting(true); setMessage('');
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop().toLowerCase()}`;
    const { error: uploadError } = await supabase.storage.from('verification-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setMessage(uploadError.message); setSubmitting(false); return; }
    const { error: insertError } = await supabase.from('alumni_verifications').insert({ user_id: user.id, graduation_name: form.graduationName.trim(), graduation_date: graduationDate, graduation_year: Number(graduationDate.slice(0, 4)), batch_name: form.batchName.trim(), program: form.program.trim(), document_path: path, document_filename: file.name });
    if (insertError) { await supabase.storage.from('verification-documents').remove([path]); setMessage(insertError.message); setSubmitting(false); return; }
    setForm({ graduationName: '', graduationDate: '', batchName: '', program: '', document: null }); setMessage('Your graduation evidence was submitted for review.'); await loadVerification(); setSubmitting(false);
  }

  const currentStatus = verification ? statusCopy[verification.status] : null;
  const canSubmit = !verification || ['needs_information', 'rejected'].includes(verification.status);
  return <section className="profile-page">
    <header className="profile-heading"><p className="eyebrow green">My account</p><h1>My profile</h1><p>{user.email}</p></header>
    <section className={`verification-status ${verification?.status || 'not-started'}`}><div><p className="eyebrow green">Alumni verification</p><h2>{loading ? 'Checking verification status…' : currentStatus?.[0] || 'Verify your alumni status'}</h2><p>{loading ? '' : currentStatus?.[1] || 'Submit your graduation details to appear in the alumni directory and receive a verified alumni badge.'}</p>{verification?.reviewer_note && <p className="reviewer-feedback"><strong>Reviewer note:</strong> {verification.reviewer_note}</p>}</div><span className="verification-badge">{verification?.status === 'verified' ? '✓ Verified' : verification?.status?.replace('_', ' ') || 'Not started'}</span></section>
    {canSubmit && !loading && <form className="verification-form" onSubmit={submit}><div><p className="eyebrow green">Graduation details</p><h2>{verification ? 'Submit updated evidence' : 'Start verification'}</h2><p>We only use graduation evidence to verify alumni status. Do not upload any government or personal ID.</p></div><label>Name used while studying<input name="graduationName" value={form.graduationName} onChange={updateField} required /></label><div className="verification-fields"><label>Graduation date<input name="graduationDate" type="text" inputMode="numeric" placeholder="00/00/0000" value={form.graduationDate} onChange={formatGraduationDate} maxLength="10" required /></label><label>Batch name<input name="batchName" placeholder="e.g. Batch 2020" value={form.batchName} onChange={updateField} required /></label><label>Course or program<input name="program" value={form.program} onChange={updateField} required /></label></div><label>Graduation evidence <small>Degree certificate, transcript, or official alumni record · PDF, JPG, or PNG · maximum 10 MB</small><input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={updateField} required /></label>{message && <p className="verification-message">{message}</p>}<button className="dark-button" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for verification'}</button></form>}
    {message && !canSubmit && <p className="verification-message">{message}</p>}
  </section>;
}
