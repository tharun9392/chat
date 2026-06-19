import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Link, useNavigate } from 'react-router-dom';

const RegisterForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      addNotification('All fields are required', 'error');
      return;
    }
    
    if (username.length < 3) {
      addNotification('Username must be at least 3 characters long', 'error');
      return;
    }
    
    if (password.length < 6) {
      addNotification('Password must be at least 6 characters long', 'error');
      return;
    }
    
    if (password !== confirmPassword) {
      addNotification('Passwords do not match', 'error');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Register without encryption passphrase - it will be auto-generated
      await register(username, password);
      addNotification('Account created successfully! Encryption keys generated automatically.', 'success');
      navigate('/login');
    } catch (error: any) {
      console.error('Registration error:', error);
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';
      const suggestions = error.response?.data?.suggestions;
      const fullMessage = suggestions 
        ? `${errorMessage} (Try: ${suggestions.join(' or ')})`
        : errorMessage;
      addNotification(fullMessage, 'error');
      setIsSubmitting(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  return (
    <>
      <div className="glass-panel p-8 w-full max-w-md mx-auto">
      <h2 className="text-3xl font-bold mb-8 text-center text-slate-800 dark:text-white">Create Account</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="username" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 bg-white/80 dark:bg-dark-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200 placeholder-slate-400 font-sans text-slate-800 dark:text-white"
            placeholder="Create a username"
            disabled={isSubmitting}
            minLength={3}
            required
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Must be at least 3 characters long.
          </p>
        </div>
        
        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/80 dark:bg-dark-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200 placeholder-slate-400 font-sans text-slate-800 dark:text-white pr-12"
              placeholder="Create a password"
              disabled={isSubmitting}
              minLength={6}
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
              onClick={togglePasswordVisibility}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Must be at least 6 characters long.
          </p>
        </div>
        
        <div className="mb-8">
          <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/80 dark:bg-dark-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200 placeholder-slate-400 font-sans text-slate-800 dark:text-white pr-12"
              placeholder="Confirm your password"
              disabled={isSubmitting}
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
              onClick={toggleConfirmPasswordVisibility}
            >
              {showConfirmPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none text-lg"
        >
          {isSubmitting ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating account...
            </div>
          ) : 'Register'}
        </button>
      </form>
      
      <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary-500 hover:text-primary-600 transition-colors duration-200">
          Login
        </Link>
      </div>
      </div>
    </>
  );
};

export default RegisterForm;
