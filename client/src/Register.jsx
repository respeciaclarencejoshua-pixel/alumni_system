import { useState } from 'react';
import { supabase } from './lib/supabase.js';

function Register() { 
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
            [event.target.name]: event.target.value,
        });
    };

    const handleSubmit = async (e) => {
        event.preventDefault();

        setLoading(true);
        setMessage('');
        setError('');

        const { data, error: signUpErrir } = await supabase.auth.signUp({
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
        setform({
            firstName: '',
            lastName: '',
            email: '', 
            password: '',
        });
        
        setLoading(false);
    };

    return ( 
        <div className = "register-page">
            <div className = "register-card">
                <div className = "register-header">
                    <p className= "eyebrow green"> NDDU ALUMNI </p>
                    <h1> Create your account ! </h1>
                    <p> Join the NDDU Alumni Network and reconnect  with your community. </p>
                </div>
                <form onSubmit = {handleSubmit} className="register-form"> 
                    <div className = "form-group">
                        <label>First Name
                            <input
                            type= "text"
                            name = "firstName"
                            value = {form.firstName}
                            onChange = {handleChange}
                            required
                            />
                            </label>
                         <label>
                            <input
                            Last Name 
                            type ="text"
                            name ="lastName"
                            value = {form.lastName}
                            onChange = { handleChange}
                            required
                            />
                             </label>   
                            </div> 
                        <label>
                            Email 
                            <input 
                            type ="email"
                            name = "email"
                            value = {form.email}
                            onChange = {handleChange}
                            required
                            />
                        </label>
                        <label>
                            Password 
                            <input
                            type ="password"
                            name ="password"
                            value = {form.password}
                            onChange = {handleChange}
                            minLength ={6}
                            required
                            />
                        </label>

                        {error && (
                            <p className = "form-error">
                                {error}
                            </p>
                        )}
                        {message && (
                            <p className ="form-success">
                                {message}
                            </p>
                        )}
                    <button 
                    type ="submit"
                    className = "dark-button register-button"
                    disabled = {loading}
                        >
                            {loading ? 'Creating account.....': 'Create Account'}
                        </button>
                </form>
            </div>
        </div>
    );

}

export default Register;