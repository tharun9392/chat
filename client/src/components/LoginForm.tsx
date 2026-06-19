import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Link } from 'react-router-dom';

const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [encryptionPassphrase, setEncryptionPassphrase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showEncryptionPassphrase, setShowEncryptionPassphrase] = useState(false);
  const [needsRecoveryCode, setNeedsRecoveryCode] = useState(false);
  const [needsEncryptionPassphrase, setNeedsEncryptionPassphrase] = useState(false);
  const { login } = useAuth();
  const { addNotification } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      addNotification('Username and password are required', 'error');
      return;
    }
    
    // If we need recovery code, it must be provided
    if (needsRecoveryCode && !privateKey.trim()) {
      addNotification('Recovery code is required to log in on this device', 'error');
      return;
    }
    
    // If explicitly need recovery code, passphrase must be provided
    if (needsRecoveryCode && (!encryptionPassphrase || !encryptionPassphrase.trim())) {
      addNotification('Encryption passphrase is required for recovery code', 'error');
      return;
    }
    
    // If explicitly need passphrase (but not recovery), try without first
    // The system will retry with passphrase if needed
    
    setIsSubmitting(true);
    
    try {
      await login(
        username,
        password,
        needsRecoveryCode ? privateKey : undefined,
        (needsEncryptionPassphrase || needsRecoveryCode) ? encryptionPassphrase : undefined
      );
      addNotification('Login successful!', 'success');
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Check if this is a recovery code required error
      if (error.message === 'ENCRYPTION_RECOVERY_REQUIRED') {
        setNeedsRecoveryCode(true);
        addNotification('Please provide your recovery code and encryption passphrase to log in on this device', 'info');
        setIsSubmitting(false);
        return;
      }
      
      // Check if this is a passphrase required error
      if (error.message === 'PASSPHRASE_REQUIRED') {
        setNeedsEncryptionPassphrase(true);
        addNotification('Please provide your encryption passphrase to unlock your keys', 'info');
        setIsSubmitting(false);
        return;
      }
      
      // Check if passphrase is invalid
      if (error.message === 'Invalid passphrase') {
        addNotification('Invalid encryption passphrase. Please try again.', 'error');
        setIsSubmitting(false);
        return;
      }
      
      const errorMessage = error.response?.data?.message || 'Login failed. Please try again.';
      const errorHint = error.response?.data?.hint;
      const fullMessage = errorHint ? `${errorMessage} (${errorHint})` : errorMessage;
      addNotification(fullMessage, 'error');
    } finally {
      if (!needsRecoveryCode && !needsEncryptionPassphrase) {
        setIsSubmitting(false);
      }
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleEncryptionPassphraseVisibility = () => {
    setShowEncryptionPassphrase(!showEncryptionPassphrase);
  };

  return (
    <div className="glass-panel p-8 w-full max-w-md mx-auto">
      <h2 className="text-3xl font-bold mb-8 text-center text-slate-800 dark:text-white">Welcome Back</h2>
      
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
            placeholder="Enter your username"
            disabled={isSubmitting}
            required
          />
        </div>
        
        <div className="mb-8">
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
              placeholder="Enter your password"
              disabled={isSubmitting}
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
              onClick={togglePasswordVisibility}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        {needsRecoveryCode && (
          <div className="mb-8">
            <label htmlFor="recovery-code" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Recovery Code <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              This device doesn't have your encryption keys. Enter the recovery code from when you registered.
            </p>
            <div className="relative">
              <textarea
                id="recovery-code"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="w-full px-4 py-3 bg-white/80 dark:bg-dark-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200 placeholder-slate-400 font-sans text-slate-800 dark:text-white pr-12"
                placeholder="Paste your recovery code here"
                disabled={isSubmitting}
                rows={4}
              />
            </div>
          </div>
        )}
        
        {(needsEncryptionPassphrase || needsRecoveryCode) && (
          <div className="mb-8">
            <label htmlFor="encryption-passphrase-login" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Encryption Passphrase <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Enter the encryption passphrase you created during registration to unlock your keys.
            </p>
            <div className="relative">
              <input
                id="encryption-passphrase-login"
                type={showEncryptionPassphrase ? "text" : "password"}
                value={encryptionPassphrase}
                onChange={(e) => setEncryptionPassphrase(e.target.value)}
                className="w-full px-4 py-3 bg-white/80 dark:bg-dark-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200 placeholder-slate-400 font-sans text-slate-800 dark:text-white pr-12"
                placeholder="Enter your encryption passphrase"
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
                onClick={toggleEncryptionPassphraseVisibility}
              >
                {showEncryptionPassphrase ? (
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
        )}
        
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
              Logging in...
            </div>
          ) : 'Login'}
        </button>
      </form>
      
      <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-primary-500 hover:text-primary-600 transition-colors duration-200">
          Register
        </Link>
      </div>
    </div>
  );
};

export default LoginForm;
