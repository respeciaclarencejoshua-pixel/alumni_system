
import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function AlumniVerificationForm({ onComplete }) {
  const [form, setForm] = useState({
    graduationName: '',
    graduationYear: '',
    graduationDate: '',
    batchName: '',
    program: '',
  });

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setDocument(file);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        throw new Error('Please sign in before submitting your alumni verification.');
      }

      if (!document) {
        throw new Error('Please upload your graduation document.');
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ];

      if (!allowedTypes.includes(document.type)) {
        throw new Error('Please upload a PDF, JPG, or PNG file.');
      }

      const maxSize = 5 * 1024 * 1024;

      if (document.size > maxSize) {
        throw new Error('The graduation document must be 5 MB or smaller.');
      }

      const fileExtension =
        document.name.split('.').pop()?.toLowerCase() || 'pdf';

      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('verification-documents')
        .upload(filePath, document, {
          contentType: document.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: verificationError } = await supabase
        .from('alumni_verifications')
        .insert({
          user_id: user.id,
          graduation_name: form.graduationName.trim(),
          graduation_year: Number(form.graduationYear),
          graduation_date: form.graduationDate || null,
          batch_name: form.batchName.trim() || null,
          program: form.program.trim(),
          document_path: filePath,
          document_filename: document.name,
          status: 'pending',
        });

      if (verificationError) {
        await supabase.storage
          .from('verification-documents')
          .remove([filePath]);

        throw verificationError;
      }

      setMessage(
        'Your alumni verification has been submitted successfully. An administrator will review your information.'
      );

      setForm({
        graduationName: '',
        graduationYear: '',
        graduationDate: '',
        batchName: '',
        program: '',
      });

      setDocument(null);

      if (onComplete) {
        onComplete();
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit verification.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="register-header">
          <p className="eyebrow green">NDDU ALUMNI</p>

          <h1>Complete your alumni profile</h1>

          <p>
            Provide your graduation information and supporting document.
            An administrator will review your submission before your alumni
            account is verified.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <label>
            Name on Graduation Record
            <input
              type="text"
              name="graduationName"
              value={form.graduationName}
              onChange={handleChange}
              placeholder="Juan Dela Cruz"
              required
            />
          </label>

          <label>
            Program / Course
            <input
              type="text"
              name="program"
              value={form.program}
              onChange={handleChange}
              placeholder="Bachelor of Science in Information Technology"
              required
            />
          </label>

          <div>
            <label>
              Graduation Year
              <input
                type="number"
                name="graduationYear"
                value={form.graduationYear}
                onChange={handleChange}
                min="1900"
                max="2100"
                placeholder="2026"
                required
              />
            </label>

            <label>
              Graduation Date
              <input
                type="date"
                name="graduationDate"
                value={form.graduationDate}
                onChange={handleChange}
              />
            </label>
          </div>

          <label>
            Batch Name
            <input
              type="text"
              name="batchName"
              value={form.batchName}
              onChange={handleChange}
              placeholder="Batch 2026"
            />
          </label>

          <label>
            Graduation Evidence
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              required
            />

            <small>
              Upload your diploma, certificate of graduation, or other
              approved graduation evidence. Maximum 5 MB.
            </small>
          </label>

          {error && <p className="form-error">{error}</p>}

          {message && <p className="form-success">{message}</p>}

          <button
            type="submit"
            className="dark-button register-button"
            disabled={loading}
          >
            {loading
              ? 'Submitting verification…'
              : 'Submit for Verification'}
          </button>
        </form>
      </section>
    </main>
  );
}
