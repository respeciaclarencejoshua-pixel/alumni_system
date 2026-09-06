import { useCallback, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { ACADEMIC_PROGRAMS, DEPARTMENTS, GRADUATION_YEARS, degreeForCourse } from './data/academics.js';
import TurnstileCaptcha from './components/TurnstileCaptcha.jsx';

export default function Register({ onLogin, onClose }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    roles: ['alumni'],
    degree: '',
    course: '',
    department: '',
    graduationYear: '',
    batchName: '',
    organization: '',
    jobTitle: '',
    companyEmail: '',
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const handleCaptchaToken = useCallback((token) => setCaptchaToken(token), []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name === 'department') return { ...current, department: value, course: '', degree: '' };
      if (name === 'course') return { ...current, course: value, degree: degreeForCourse(value) };
      if (name === 'graduationYear') return { ...current, graduationYear: value, batchName: '' };
      return { ...current, [name]: value };
    });
  }

  function toggleRole(role) {
    setForm((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }));
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
      confirmPassword,
      acceptTerms,
      roles,
      degree,
      course,
      department,
      graduationYear,
      batchName,
      organization,
      jobTitle,
      companyEmail,
    } = form;

    if (!roles.length) {
      setError('Select at least one account role.');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      setLoading(false);
      return;
    }
    if (!(password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password))) {
      setError('Your password does not meet all requirements.');
      setLoading(false);
      return;
    }
    if (!acceptTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy.');
      setLoading(false);
      return;
    }
    if (!captchaToken) {
      setError('Complete the bot-protection check before creating your account.');
      setLoading(false);
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        data: {
          first_name: firstName,
          last_name: lastName,
          roles,
          degree,
          course,
          department,
          graduation_year: graduationYear,
          batch_name: batchName,
          organization,
          job_title: jobTitle,
          company_email: companyEmail,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
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
      confirmPassword: '',
      acceptTerms: false,
      roles: ['alumni'],
      degree: '',
      course: '',
      department: '',
      graduationYear: '',
      batchName: '',
      organization: '',
      jobTitle: '',
      companyEmail: '',
    });
    setCaptchaToken('');
    setCaptchaResetKey((key) => key + 1);

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
            <span className="password-input-wrap"><input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={12}
              required
            /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button></span>
          </label>

          <label>
            Confirm Password
            <span className="password-input-wrap"><input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" minLength={12} required /><button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword}>{showConfirmPassword ? 'Hide' : 'Show'}</button></span>
            {form.confirmPassword && <small aria-live="polite" className={form.password === form.confirmPassword ? 'password-match good' : 'password-match'}>{form.password === form.confirmPassword ? 'Passwords match' : 'Passwords do not match'}</small>}
          </label>

            <div className="password-requirements" aria-label="Password requirements"><strong>Password requirements</strong><ul><li className={form.password.length >= 12 ? 'met' : ''}>At least 12 characters</li><li className={/[A-Z]/.test(form.password) ? 'met' : ''}>One uppercase letter</li><li className={/[a-z]/.test(form.password) ? 'met' : ''}>One lowercase letter</li><li className={/\d/.test(form.password) ? 'met' : ''}>One number</li></ul></div>

          <fieldset className="registration-roles">
            <legend>How will you use AlumniConnect?</legend>
            <p>Select all that apply. Administrative roles are assigned separately.</p>
            <div>
              <label className={form.roles.includes('alumni') ? 'selected' : ''}><input type="checkbox" checked={form.roles.includes('alumni')} onChange={() => toggleRole('alumni')} /><span><strong>Alumni</strong><small>Connect with classmates, join events, and share updates.</small></span></label>
              <label className={form.roles.includes('employer') ? 'selected' : ''}><input type="checkbox" checked={form.roles.includes('employer')} onChange={() => toggleRole('employer')} /><span><strong>Employer / Recruiter</strong><small>Represent an organization and share opportunities.</small></span></label>
            </div>
          </fieldset>

          {form.roles.includes('alumni') && <>
          <h2>Education Information</h2>

          <label>
            Department / College
            <select
              name="department"
              value={form.department}
              onChange={handleChange}
              required
            >
              <option value="">Select your college</option>
              {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>

          <label>
            Course / Program
            <select
              name="course"
              value={form.course}
              onChange={handleChange}
              disabled={!form.department}
              required
            >
              <option value="">{form.department ? 'Select your course' : 'Select a college first'}</option>
              {(ACADEMIC_PROGRAMS[form.department] || []).map((course) => <option key={course} value={course}>{course}</option>)}
            </select>
          </label>

          <label>
            Degree
            <input
              type="text"
              name="degree"
              value={form.degree}
              placeholder="Filled automatically from your course"
              readOnly
              required
            />
          </label>

          <label>
            Graduation Year
            <select
              name="graduationYear"
              value={form.graduationYear}
              onChange={handleChange}
              required
            >
              <option value="">Select graduation year</option>
              {GRADUATION_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>

          <label>
            Batch Name
            <input
              type="text"
              name="batchName"
              value={form.batchName}
              onChange={handleChange}
              placeholder="Enter your batch name (if known)"
              maxLength={100}
            />
          </label>
          </>}

          {form.roles.includes('employer') && <>
            <h2>Employer Information</h2>
            <label>Organization / Company<input name="organization" value={form.organization} onChange={handleChange} placeholder="Enter the organization name" required /></label>
            <label>Job Title<input name="jobTitle" value={form.jobTitle} onChange={handleChange} placeholder="e.g. Recruitment Manager" required /></label>
            <label>Company Email<input type="email" name="companyEmail" value={form.companyEmail} onChange={handleChange} placeholder="name@company.com" required /></label>
          </>}

          <label className="terms-consent"><input type="checkbox" name="acceptTerms" checked={form.acceptTerms} onChange={(event) => setForm((current) => ({ ...current, acceptTerms: event.target.checked }))} required /><span>I agree to the <a href="/#terms" target="_blank" rel="noreferrer">Terms of Service</a> and acknowledge the <a href="/#privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>

          <TurnstileCaptcha onToken={handleCaptchaToken} resetKey={captchaResetKey} />

          {error && <p className="form-error">{error}</p>}

          {message && <p className="form-success">{message}</p>}

          <button
            type="submit"
            className="dark-button register-button"
            disabled={loading}
          >
            {loading ? 'Creating account…' : form.roles.includes('alumni') && form.roles.includes('employer') ? 'Create Alumni & Employer Account' : form.roles.includes('employer') ? 'Create Employer Account' : 'Create Alumni Account'}
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
