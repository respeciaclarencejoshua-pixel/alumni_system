import { useState } from 'react';
import { supabase } from './lib/supabase.js';

export default function Register({ onLogin, onClose }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    degree: '',
    course: '',
    department: '',
    graduationYear: '',
    honors: '',
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setMessage('');
    setError('');

    const {
      firstName,
      lastName,
      email,
      password,
      degree,
      course,
      department,
      graduationYear,
      honors,
    } = form;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          degree,
          course,
          department,
          graduation_year: graduationYear,
          honors,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setMessage(
      'Registration successful! Please check your email to confirm your account. Your alumni profile is now pending admin verification.'
    );

    setForm({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      degree: '',
      course: '',
      department: '',
      graduationYear: '',
      honors: '',
    });

    setLoading(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="register-header">
          <p className="eyebrow green">NDDU ALUMNI</p>

          <h1>Create your account</h1>

          <p>
            Join the NDDU Alumni Network and reconnect with your community.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <h2>Account Information</h2>

          <div>
            <label>
              First Name
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                autoComplete="given-name"
                required
              />
            </label>

            <label>
              Last Name
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                autoComplete="family-name"
                required
              />
            </label>
          </div>

          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          <h2>Education Information</h2>

          <label>
            Degree
            <input
              type="text"
              name="degree"
              value={form.degree}
              onChange={handleChange}
              placeholder="e.g. Bachelor of Science"
              required
            />
          </label>

          <label>
            Course / Program
            <input
              type="text"
              name="course"
              value={form.course}
              onChange={handleChange}
              placeholder="e.g. Information Technology"
              required
            />
          </label>

          <label>
            Department
            <input
              type="text"
              name="department"
              value={form.department}
              onChange={handleChange}
              placeholder="e.g. College of Engineering Architecture and Technology"
            />
          </label>

          <label>
            Graduation Year
            <input
              type="number"
              name="graduationYear"
              value={form.graduationYear}
              onChange={handleChange}
              min="1900"
              max="2100"
              placeholder="e.g. 2026"
              required
            />
          </label>

          <label>
            Honors
            <input
              type="text"
              name="honors"
              value={form.honors}
              onChange={handleChange}
              placeholder="e.g. Dean's List"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          {message && <p className="form-success">{message}</p>}

          <button
            type="submit"
            className="dark-button register-button"
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create Alumni Account'}
          </button>

          <p className="auth-switch">
            Already have an account?{' '}
            <button type="button" onClick={onLogin}>
              Log in
            </button>
          </p>
        </form>

        <button className="auth-back" type="button" onClick={onClose}>
          ← Back to website
        </button>
      </section>
    </main>
  );
}