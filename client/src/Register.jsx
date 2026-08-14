import { useState } from 'react';
import { supabase } from './lib/supabase.js';

const Icon = ({ name, size = 18 }) => {
  const icons = {
    bell: (
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-3v-.09A1.7 1.7 0 0 0 10.68 18.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 14.7 1.7 1.7 0 0 0 5.47 13.67H5v-3h.47a1.7 1.7 0 0 0 1.55-1.03A1.7 1.7 0 0 0 6.68 7.76l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.71 4.43V4h3v.43a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03H21v3h-.05A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    chevronLeft: (
      <path d="m15 18-6-6 6-6" />
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
};

function Register({ onBack, onNavigate }) {
    const navItems = ['Home', 'Feed', 'Jobs', 'Opportunities', 'Events', 'Mentorship'];
    
    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password:'',
    });

    const [loading,setLoading] = useState(false);
    const [message,setMessage] = useState('');
    const [error,setError] = useState('');

    const handleChange = (e) => { 
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setLoading(true);
        setMessage('');
        setError('');

        const { data, error: signUpError } = await supabase.auth.signUp({
            email: form.email,
            password: form.password,
        });

        if (signUpError) {
            setError(signUpError.message);
            setLoading(false);
            return;
        }
        
        const user = data.user;

        if (!user) { 
            setError('Registration failed. Please try again.');
            setLoading(false);
            return;
        }

        const { error: profileError } = await supabase.from('profiles').insert({
            id:user.id,
            first_name: form.firstName,
            last_name: form.lastName,
            email: form.email,
            role: 'alumni',
        });
        
        if (profileError) { 
            setError(profileError.message);
            setLoading(false);
            return;
        }

        setMessage("Registration successful! Please check your email to confirm your account.");
        setForm({
            firstName: '',
            lastName: '',
            email: '', 
            password: '',
        });
        
        setLoading(false);
    };

    return ( 
        <div className="register-page-wrapper">
            <header className="topbar">
                <a
                    className="brand"
                    href="#top"
                    onClick={(e) => {
                        e.preventDefault();
                        onBack();
                    }}
                    aria-label="Notre Dame of Dadiangas University Alumni home"
                >
                    <img
                        src="https://www.nddu.edu.ph/wp-content/uploads/2021/06/cropped-NDDU-Site-Favicon.png"
                        alt="Notre Dame of Dadiangas University seal"
                    />
                    <span>
                        <em>Notre Dame of Dadiangas University</em>
                        <strong>ALUMNI</strong>
                    </span>
                </a>

                <nav className="main-nav" aria-label="Primary navigation">
                    {navItems.map((item) => (
                        <button
                            key={item}
                            onClick={() => onNavigate(item)}
                            aria-label={`Navigate to ${item}`}
                        >
                            {item}
                        </button>
                    ))}
                </nav>

                <div className="header-actions">
                    <button
                        aria-label="Notifications"
                        className="icon-button"
                    >
                        <Icon name="bell" />
                    </button>
                    <button
                        aria-label="Settings"
                        className="icon-button"
                    >
                        <Icon name="settings" />
                    </button>
                    <img
                        className="avatar"
                        src="https://i.pravatar.cc/80?img=12"
                        alt="Your profile"
                    />
                </div>
            </header>
            <div className="register-container">
                <div className="register-card">
                    <div className="register-card-header">
                        <button
                            className="back-button-inline"
                            onClick={onBack}
                            aria-label="Back to homepage"
                        >
                            <Icon name="chevronLeft" size={20} />
                            Back
                        </button>
                    </div>

                    <div className="register-header">
                        <p className="eyebrow green">CREATE YOUR PROFILE</p>
                        <h1>Join the Alumni Network</h1>
                        <p>Connect with fellow NDDU graduates and unlock exclusive opportunities.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="register-form"> 
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="firstName">First Name</label>
                                <input
                                    id="firstName"
                                    type="text"
                                    name="firstName"
                                    value={form.firstName}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="lastName">Last Name</label>
                                <input
                                    id="lastName"
                                    type="text"
                                    name="lastName"
                                    value={form.lastName}
                                    onChange={handleChange}
                                    required
                                />
                            </div>   
                        </div>
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input 
                                id="email"
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                minLength={6}
                                required
                            />
                        </div>

                        {error && (
                            <p className="form-error">
                                {error}
                            </p>
                        )}
                        {message && (
                            <p className="form-success">
                                {message}
                            </p>
                        )}
                        <button 
                            type="submit"
                            className="dark-button register-button"
                            disabled={loading}
                        >
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );

}

export default Register;