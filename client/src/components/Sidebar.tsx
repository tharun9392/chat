import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usePendingRequests } from '../hooks/usePendingRequests';
import { useChats } from '../hooks/useChats';
import UserSearch from './UserSearch';
import axios from 'axios';
import { useNotification } from '../context/NotificationContext';
import { useCall } from '../context/CallContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

const Sidebar: React.FC = () => {
  const { user, logout, token } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { chats, isLoading, fetchChats, appendChat } = useChats();
  const { addNotification } = useNotification();
  const { initiateCall, callActive } = useCall();
  const pendingRequests = usePendingRequests(user?._id || user?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'chats' | 'calls'>('chats');
  const [calls, setCalls] = useState<any[]>([]);
  const [isCallsLoading, setIsCallsLoading] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const respondToChatRequest = async (requestId: string, status: 'accepted' | 'rejected') => {
    if (!token) return;
    try {
      const response = await axios.put(
        `${API_URL}/chats/request/${requestId}`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (status === 'accepted') {
        const newChat = response.data.chat;

        if (newChat) {
          // Instantly append to sidebar — no waiting for re-fetch
          appendChat(newChat);
          // Navigate to the chat immediately
          navigate(`/chat/${newChat._id}`);
          addNotification('✓ Chat accepted! You can now message this user.', 'success');
        } else {
          // Fallback: re-fetch if no chat returned
          await fetchChats();
          addNotification('✓ Chat request accepted!', 'success');
        }
      } else {
        addNotification('Chat request declined', 'info');
      }

      setIsNotificationsOpen(false);
    } catch (error) {
      console.error('Error responding to chat request:', error);
      addNotification('Failed to process chat request', 'error');
    }
  };


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCallHistory = useCallback(async () => {
    if (!token) return;
    setIsCallsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/calls`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCalls(response.data);
    } catch (error) {
      console.error('Error fetching call history:', error);
    } finally {
      setIsCallsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'calls') {
      fetchCallHistory();
    }
  }, [activeTab, callActive, location.pathname, fetchCallHistory]);

  const handleDeleteCall = async (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    if (!token) return;
    
    if (!window.confirm('Delete this call record for both participants?')) return;
    
    // Optimistic UI update: Remove it immediately from the screen
    const originalCalls = [...calls];
    setCalls(prev => prev.filter(c => c._id !== callId));

    try {
      await axios.delete(`${API_URL}/calls/${callId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      addNotification('Call record deleted', 'success');
      // No need to fetchCallHistory() since we already updated the state optimistically, 
      // but we could if we want to be 100% sure. 
    } catch (error) {
      console.error('Error deleting call:', error);
      addNotification('Failed to delete call record', 'error');
      // Rollback on error
      setCalls(originalCalls);
    }
  };

  // Helper function to generate a persistent color based on a string
  const getAvatarColor = (name: string) => {
    if (!name) return 'from-slate-400 to-slate-600';
    const colors = [
      'from-blue-400 to-blue-600',
      'from-emerald-400 to-emerald-600',
      'from-purple-400 to-purple-600',
      'from-rose-400 to-rose-600',
      'from-amber-400 to-amber-600',
      'from-indigo-400 to-indigo-600',
      'from-pink-400 to-pink-600',
      'from-teal-400 to-teal-600'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="flex flex-col w-80 md:w-96 h-full bg-white/60 dark:bg-dark-900/60 backdrop-blur-md border-r border-slate-200/50 dark:border-white/5 transition-colors duration-300">
      {/* Sidebar Header */}
      <div className="relative z-[100] p-4 bg-white/40 dark:bg-dark-800/40 backdrop-blur-sm flex items-center justify-between border-b border-slate-200/50 dark:border-white/5 shadow-sm">
        <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <img src="/logo123.png" alt="Logo" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">SecureChat</h1>
        </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Notification Button */}
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2 text-slate-500 hover:text-primary-500 dark:text-slate-400 dark:hover:text-primary-400 focus:outline-none rounded-full hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {pendingRequests.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-red-500 rounded-full border border-white dark:border-dark-800 animate-pulse"></span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute top-full mt-2 right-0 w-72 bg-white dark:bg-dark-800 rounded-xl border border-slate-200 dark:border-white/10 z-[200] overflow-hidden"
                   style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 2px 10px rgba(0,0,0,0.08)' }}>
                {/* Arrow indicator */}
                <div className="absolute -top-2 right-4 w-4 h-4 bg-white dark:bg-dark-800 border-l border-t border-slate-200 dark:border-white/10 transform rotate-45"></div>
                
                {/* Header */}
                <div className="px-4 py-3 bg-slate-50 dark:bg-dark-700/50 border-b border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800 dark:text-white text-sm">Chat Requests</p>
                    {pendingRequests.length > 0 && (
                      <span className="text-[10px] font-bold bg-primary-500 text-white px-2 py-0.5 rounded-full">
                        {pendingRequests.length}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {pendingRequests.length === 0 ? (
                    <div className="py-4 text-center">
                      <svg className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-xs text-slate-400 dark:text-slate-500">No pending requests</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {pendingRequests.map((req: any) => (
                        <li key={req._id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-700/30 border border-slate-100 dark:border-white/5">
                          <div className="flex items-center mb-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0">
                              {(req.sender?.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">
                                {req.sender?.displayName || req.sender?.username || 'User'}
                              </p>
                              <p className="text-[10px] text-slate-400">wants to chat with you</p>
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => respondToChatRequest(req._id, 'accepted')}
                              className="flex-1 py-1.5 text-xs font-semibold bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors shadow-sm"
                            >
                              Accept
                            </button>
                            <button 
                              onClick={() => respondToChatRequest(req._id, 'rejected')}
                              className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-dark-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-dark-500 transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Theme Toggle */}
          <button onClick={toggleTheme} className="p-2 text-slate-500 hover:text-primary-500 dark:text-slate-400 dark:hover:text-primary-400 rounded-full hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors duration-200">
            {isDark ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            )}
          </button>
        </div>
      </div>

      <div className="p-2 bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <UserSearch compact={true} />
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-white/50 dark:bg-dark-800/50 p-1 border-b border-slate-200/50 dark:border-white/5">
        <button 
          onClick={() => setActiveTab('chats')}
          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold transition-all duration-200 rounded-lg ${activeTab === 'chats' ? 'bg-white dark:bg-white/10 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          CHATS
        </button>
        <button 
          onClick={() => setActiveTab('calls')}
          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold transition-all duration-200 rounded-lg ${activeTab === 'calls' ? 'bg-white dark:bg-white/10 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 5z" /></svg>
          CALLS
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white/40 dark:bg-dark-800/40 custom-scrollbar">
        {activeTab === 'chats' ? (
          <>
            {isLoading ? (
              <div className="p-4 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
            ) : chats.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm italic">No chats yet. Use search to find people to talk to!</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {chats.map((chat) => {
                  const otherUser = chat.participants.find(p => p._id !== user?.id && p._id !== user?._id);
                  const lastMessage = chat.messages?.[chat.messages.length - 1];
                  const isSelected = location.pathname === `/chat/${chat._id}`;
                  
                  return (
                    <li key={chat._id}>
                      <Link 
                        to={`/chat/${chat._id}`}
                        className={`flex items-center p-3.5 hover:bg-white/50 dark:hover:bg-white/5 transition-all duration-200 ${isSelected ? 'bg-white/80 dark:bg-white/10 shadow-sm z-10' : ''}`}
                      >
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(otherUser?.username || '')} flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden shadow-sm ring-2 ring-white/50 dark:ring-dark-700`}>
                          {otherUser?.profilePic ? (
                            <img src={otherUser.profilePic} alt={otherUser?.username} className="w-full h-full object-cover" />
                          ) : (
                            otherUser?.username?.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="ml-3 flex-1 overflow-hidden">
                          <div className="flex justify-between items-baseline">
                            <h3 className="font-semibold truncate text-slate-800 dark:text-white text-sm">{otherUser?.displayName || otherUser?.username || 'Unknown User'}</h3>
                            {lastMessage && <span className="text-[10px] text-slate-400 ml-2 font-medium">{formatDate(lastMessage.createdAt)}</span>}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5 dark:text-slate-400 font-medium">
                            {lastMessage ? (
                              <>
                                {lastMessage.sender === user?.id || lastMessage.sender === user?._id ? 'You: ' : ''}
                                {lastMessage.encrypted ? (
                                  <span className="flex items-center italic opacity-70">
                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                    Encrypted
                                  </span>
                                ) : lastMessage.content}
                              </>
                            ) : 'Start a conversation'}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          /* Call History Tab */
          <>
            {isCallsLoading ? (
              <div className="p-4 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div></div>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm italic">No call history found.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {calls.map((call) => {
                  const isOutgoing = call.callerId === (user?.id || user?._id);
                  const otherUserId = isOutgoing ? call.receiverId : call.callerId;
                  
                  // Try to find the user in active chats to get their name/pic
                  const matchedChat = chats.find(c => c.participants.some(p => p._id === otherUserId));
                  const matchedUser = matchedChat?.participants.find(p => p._id === otherUserId);
                  const displayName = matchedUser?.displayName || matchedUser?.username || (isOutgoing ? 'Outgoing Call' : 'Incoming Call');
                  
                  return (
                    <li key={call._id} className="group relative flex items-center p-3.5 hover:bg-white/50 dark:hover:bg-white/5 transition-all duration-200">
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${matchedUser ? getAvatarColor(matchedUser.username) : 'from-slate-400 to-slate-600'} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm ring-2 ring-white/50 dark:ring-dark-700`}>
                        {matchedUser?.profilePic ? (
                          <img src={matchedUser.profilePic} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        )}
                      </div>
                      <div className="ml-3 flex-1">
                        <div className="flex justify-between items-baseline">
                          <h3 className="font-semibold text-slate-800 dark:text-white text-sm truncate max-w-[120px]">
                            {displayName}
                          </h3>
                          <span className="text-[10px] text-slate-400 font-medium">{formatDate(call.createdAt)}</span>
                        </div>
                        <div className="flex items-center mt-1 space-x-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                            call.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            call.status === 'missed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {call.status}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">
                            {call.type === 'video' ? (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 5z" /></svg>
                            )}
                          </span>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="absolute right-4 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => handleDeleteCall(e, call._id)}
                          className="p-2 rounded-full bg-slate-100 dark:bg-dark-700 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-all duration-200 transform scale-0 group-hover:scale-100"
                          title="Delete call history record"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => initiateCall(otherUserId, call.type || 'audio', matchedUser || { username: 'User' })}
                          className="p-2 rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/30 hover:bg-primary-600 focus:outline-none transform scale-0 group-hover:scale-100 transition-transform duration-200"
                          title={`Call back (${call.type})`}
                        >
                          {call.type === 'video' ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 5z" /></svg>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Sidebar Footer with Profile */}
      <div className="p-3 border-t border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-dark-800/40 backdrop-blur-sm">
        <div className="relative" ref={profileRef}>
          <button 
            onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
            className="flex items-center w-full p-2 rounded-xl hover:bg-white/50 dark:hover:bg-white/5 transition-all duration-200 group focus:outline-none"
          >
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(user?.username || '')} flex items-center justify-center text-white font-bold overflow-hidden shadow-md ring-2 ring-white/50 dark:ring-dark-700 group-hover:scale-105 transition-transform duration-200`}>
              {user?.profilePic ? (
                <img src={user.profilePic} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user?.username?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="ml-3 text-left overflow-hidden">
              <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user?.displayName || user?.username}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">@{user?.username}</p>
            </div>
            <svg className={`ml-auto w-4 h-4 text-slate-400 transition-transform duration-200 ${isProfileDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          
          {isProfileDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 dropdown-menu z-[100] transform opacity-100 scale-100 transition-all duration-200 origin-bottom-left">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-dark-700/30">
                <p className="font-bold text-slate-800 dark:text-white truncate">Accounts</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Settings & options</p>
              </div>
              <div className="py-1">
                <Link to="/profile" className="flex items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700/50 text-slate-700 dark:text-slate-200 text-sm transition-colors">
                  <svg className="w-4 h-4 mr-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  My Profile
                </Link>
                {user?.isAdmin && (
                  <Link to="/admin" className="flex items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700/50 text-slate-700 dark:text-slate-200 text-sm transition-colors">
                    <svg className="w-4 h-4 mr-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    Admin Dashboard
                  </Link>
                )}
                <button onClick={logout} className="w-full flex items-center px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-sm transition-colors border-t border-slate-100 dark:border-slate-700/50 mt-1">
                  <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
