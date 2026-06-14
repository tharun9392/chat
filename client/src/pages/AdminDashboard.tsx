import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { useNotification } from '../context/NotificationContext';

interface User {
  _id: string;
  username: string;
  displayName?: string;
  isAdmin: boolean;
  createdAt: string;
}

interface Chat {
  _id: string;
  participants: any[];
  lastActivity: string;
  status: string;
  messages: any[];
  createdAt?: string;
}

interface Stats {
  users: number;
  chats: number;
  messages: number;
  upTime: number;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [broadcastMessage, setBroadcastMessage] = useState<string>('');
  const [broadcasting, setBroadcasting] = useState<boolean>(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    setBroadcasting(true);
    try {
      await axios.post(
        `${API_URL}/admin/broadcast`,
        { message: broadcastMessage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      addNotification('Announcement broadcasted successfully!', 'success');
      setBroadcastMessage('');
    } catch (error) {
      console.error('Error broadcasting message:', error);
      addNotification('Failed to broadcast announcement', 'error');
    } finally {
      setBroadcasting(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [usersResponse, chatsResponse, statsResponse] = await Promise.all([
        axios.get(`${API_URL}/users/all`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/chats/all`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setUsers(usersResponse.data.users || usersResponse.data);
      setChats(chatsResponse.data.chats);
      setStats(statsResponse.data.stats);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      addNotification('Failed to load administrative data', 'error');
      setLoading(false);
    }
  }, [token, addNotification]);

  useEffect(() => {
    if (!user?.isAdmin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, navigate, fetchData]);

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    
    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      addNotification('User deleted successfully', 'success');
      fetchData(); // Refresh list
    } catch (error) {
      addNotification('Failed to delete user', 'error');
    }
  };

  const handleStartChat = async (userId: string, username: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/chats/request`,
        { recipientId: userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const { chat, existing, pending } = response.data;
      
      if (existing && !pending && chat) {
        addNotification(`Opened chat with ${username}`, 'info');
        navigate(`/chat/${chat._id}`);
      } else if (existing && pending) {
        addNotification(`Chat request to ${username} is already pending.`, 'info');
        if (response.data.chatId) navigate(`/chat/${response.data.chatId}`);
      } else {
        addNotification(`Chat request sent to ${username}`, 'success');
        if (chat) navigate(`/chat/${chat._id}`);
      }
    } catch (error: any) {
      console.error('Error starting chat:', error);
      addNotification(error.response?.data?.message || 'Failed to start chat', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-dark-900">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-slate-500 font-medium">Loading administrative console...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-900 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 space-y-4 md:space-y-0 text-slate-800 dark:text-white">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary-600 to-indigo-500 bg-clip-text text-transparent">
              Admin Console
            </h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400 font-medium flex items-center">
              System overview and management for SecureChat
            </p>
          </div>
          <Link to="/" className="btn-secondary flex items-center w-fit">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Chat
          </Link>
        </div>

        {/* Privacy Info & Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { label: 'Total Users', value: stats?.users || 0, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', color: 'bg-blue-500' },
              { label: 'Total Chats', value: stats?.chats || 0, icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', color: 'bg-emerald-500' },
              { label: 'Messages', value: stats?.messages || 0, icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', color: 'bg-amber-500' },
            ].map((stat, i) => (
              <div key={i} className="glass-panel p-6 transform hover:scale-105 transition-transform duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} text-white shadow-lg`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={stat.icon} />
                    </svg>
                  </div>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm uppercase tracking-wider">{stat.label}</p>
                <h3 className="text-3xl font-bold mt-1 text-slate-800 dark:text-white">{stat.value}</h3>
              </div>
            ))}
          </div>

          {/* Privacy Notice */}
          <div className="glass-panel p-6 border-primary-500/20 bg-primary-500/5 flex flex-col justify-center">
            <div className="flex items-center mb-3">
              <div className="p-2 bg-primary-500 rounded-lg text-white mr-3">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="font-bold text-sm dark:text-white uppercase tracking-tight">Privacy Status</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              End-of-End Encryption is **ACTIVE**. Admin audit view shows metadata only. Message content remains private to participants.
            </p>
          </div>
        </div>

        {/* Content Tabs/Sections */}
        <div className="space-y-12">
          {/* Broadcast Announcement Section */}
          <div className="glass-panel overflow-hidden border-none shadow-2xl p-6">
            <h2 className="text-xl font-bold flex items-center mb-4 text-slate-800 dark:text-white">
              <svg className="w-5 h-5 mr-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              Broadcast System Announcement
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 font-medium">
              Send a real-time notification to all connected users. This announcement will appear immediately on their screens.
            </p>
            <form onSubmit={handleBroadcast} className="space-y-4">
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Type your system announcement here..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-dark-800/50 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none font-medium text-sm transition-all"
                required
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={broadcasting || !broadcastMessage.trim()}
                  className="btn-primary flex items-center justify-center font-bold px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-500 hover:from-primary-700 hover:to-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-primary-500/20"
                >
                  {broadcasting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Broadcasting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send Broadcast
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Users Section */}
          <div className="glass-panel overflow-hidden border-none shadow-2xl">
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white/40 dark:bg-white/5">
              <h2 className="text-xl font-bold flex items-center">
                <svg className="w-5 h-5 mr-3 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                User Management
              </h2>
              <span className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-xs font-bold uppercase">
                {users.length} Total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-dark-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Registered</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-800 dark:text-slate-200">
                  {users.map(u => (
                    <tr key={u._id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white font-bold mr-3 shadow-inner">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-sm">@{u.username}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">{u.displayName || 'No display name'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${u.isAdmin ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {u.isAdmin ? 'ADMIN' : 'USER'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button 
                          onClick={() => handleStartChat(u._id, u.username)}
                          disabled={u._id === user?._id}
                          className="mr-2 p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all disabled:opacity-20 inline-block"
                          title="Message User"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u._id)}
                          disabled={u._id === user?._id}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-20 inline-block"
                          title="Delete User"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chats Section */}
          <div className="glass-panel overflow-hidden border-none shadow-2xl">
            <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-white/40 dark:bg-white/5">
              <h2 className="text-xl font-bold flex items-center">
                <svg className="w-5 h-5 mr-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat Activity
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-dark-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Participants</th>
                    <th className="px-6 py-4 text-center">Messages</th>
                    <th className="px-6 py-4">Last Activity</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-800 dark:text-slate-200">
                  {chats.map(chat => (
                    <tr key={chat._id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          {chat.participants.map((p: any, i: number) => (
                            <div key={i} className="flex items-center px-2 py-1 bg-white/50 dark:bg-white/10 rounded-md border border-slate-200 dark:border-white/5">
                              <span className="text-xs font-bold">@{typeof p === 'object' ? p.username : p}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-mono bg-slate-100 dark:bg-dark-700 px-2 py-1 rounded text-sm font-bold">
                          {chat.messages?.length || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">
                        {new Date(chat.lastActivity || (chat as any).createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          className="btn-primary text-xs !py-1.5 !px-3"
                          onClick={() => navigate(`/admin/chat/${chat._id}`)}
                        >
                          View Audit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 