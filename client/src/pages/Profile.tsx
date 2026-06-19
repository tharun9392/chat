import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Handle profile update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsUpdatingProfile(true);
      await axios.put(`${API_URL}/users/profile`, { displayName });
      addNotification('Profile updated successfully', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      addNotification('Failed to update profile', 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };
  
  // Handle password change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (newPassword !== confirmPassword) {
      addNotification('New passwords do not match', 'error');
      return;
    }
    
    if (newPassword.length < 6) {
      addNotification('Password must be at least 6 characters long', 'error');
      return;
    }
    
    try {
      setIsChangingPassword(true);
      await axios.post(`${API_URL}/auth/change-password`, {
        currentPassword,
        newPassword
      });
      
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      addNotification('Password changed successfully', 'success');
    } catch (error: any) {
      console.error('Error changing password:', error);
      const errorMessage = error.response?.data?.message || 'Failed to change password';
      addNotification(errorMessage, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 animate-fade-in">
      <div className="flex items-center mb-6">
        <button 
          onClick={() => navigate('/')} 
          className="mr-3 p-1.5 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 block md:hidden hover:bg-slate-100 dark:hover:bg-dark-850 focus:outline-none transition-colors duration-200"
          aria-label="Back to chats"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold dark:text-white">Your Profile</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Profile Information */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
          
          <form onSubmit={handleUpdateProfile}>
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                  id="username"
                  type="text"
                  value={user?.username || ''}
                  readOnly
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Username cannot be changed
              </p>
            </div>
            
            <div className="mb-6">
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Enter your display name"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingProfile ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>
        
        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Change Password</h2>
          
          <form onSubmit={handleChangePassword}>
            <div className="mb-4">
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Enter your current password"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Enter your new password"
                minLength={6}
                required
              />
            </div>
            
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Confirm your new password"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChangingPassword ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>
        </div>
        
        {/* Account Security */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Account Security</h2>
          
          <div className="mb-4">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-1">
              Blocked Users
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You can manage your blocked users from the chat screen
            </p>
          </div>
          
          <div className="mb-4">
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-1">
              End-to-End Encryption
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your messages are encrypted end-to-end, which means only you and the recipient can read them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile; 