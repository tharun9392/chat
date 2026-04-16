import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';

interface User {
  _id: string;
  username: string;
  displayName: string;
  profilePic?: string;
}

interface UserSearchProps {
  onSelectUser?: (user: User) => void;
  compact?: boolean;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

const UserSearch: React.FC<UserSearchProps> = ({ onSelectUser, compact = false }) => {
  const { token } = useAuth();
  const { addNotification } = useNotification();
  const { socket, isConnected, isAuthenticated } = useSocket();
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setResults([]);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Load pending requests
  useEffect(() => {
    const fetchPendingRequests = async () => {
      if (!token) return;
      
      try {
        const response = await axios.get(`${API_URL}/chats/requests/sent`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Extract recipient IDs from pending requests
        const pendingIds = response.data.requests
          .filter((req: any) => req.status === 'pending')
          .map((req: any) => req.recipient._id);
        
        setPendingRequests(pendingIds);
      } catch (error) {
        console.error('Error fetching pending requests:', error);
      }
    };
    
    fetchPendingRequests();
  }, [token]);
  
  // Handle search
  const handleSearch = async () => {
    if (!query.trim() || !token) return;
    
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/users/search`, {
        params: { query: query.trim() },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setResults(response.data.users);
    } catch (error) {
      console.error('Error searching users:', error);
      addNotification('Failed to search users', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };
  
  // Send chat request or navigate to existing chat
  const sendChatRequest = async (userId: string, username: string) => {
    if (!token) {
      addNotification('Please log in to start a chat', 'error');
      return;
    }
    
    try {
      const response = await axios.post(
        `${API_URL}/chats/request`,
        { recipientId: userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const { chat, existing, pending } = response.data;
      
      if (existing && !pending && chat) {
        // Chat already exists and is active — navigate to it
        addNotification(`Opening chat with ${username}`, 'info');
        navigate(`/chat/${chat._id}`);
        setQuery('');
        setResults([]);
        return;
      }
      
      if (existing && pending) {
        // Request is already pending
        addNotification(`Chat request to ${username} is already pending`, 'info');
        setQuery('');
        setResults([]);
        return;
      }
      
      // New request sent successfully
      setPendingRequests(prev => [...prev, userId]);
      
      // Send socket notification
      if (socket && isConnected && isAuthenticated && chat) {
        socket.emit('chat_request', {
          receiverId: userId,
          senderId: chat.requestInfo?.senderId,
          senderName: 'You',
          requestId: chat._id
        });
      }
      
      addNotification(`Chat request sent to ${username}`, 'success');
      setQuery('');
      setResults([]);
    } catch (error: any) {
      console.error('Error sending chat request:', error);
      const message = error.response?.data?.message || 'Failed to send chat request';
      addNotification(message, 'error');
    }
  };
  
  if (compact) {
    return (
      <div className="relative w-full" ref={dropdownRef}>
        <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
          <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.length > 2) handleSearch();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search or start new chat"
            className="w-full bg-transparent border-none focus:outline-none text-sm dark:text-white placeholder:text-gray-400"
          />
          {isLoading && (
            <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
        </div>
        
        {results.length > 0 && query && (
          <div className="absolute top-full mt-2 left-0 right-0 bg-white dark:bg-gray-800 shadow-xl rounded-lg border dark:border-gray-700 z-50 max-h-64 overflow-y-auto">
            <ul className="divide-y dark:divide-gray-700">
              {results.map((user) => (
                <li key={user._id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" onClick={() => onSelectUser?.(user)}>
                  <div className="flex items-center overflow-hidden">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mr-2 flex-shrink-0">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-300">
                        {(user.displayName || user.username).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-medium dark:text-white truncate">{user.displayName || user.username}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">@{user.username}</p>
                    </div>
                  </div>
                  {!onSelectUser && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendChatRequest(user._id, user.displayName || user.username);
                      }}
                      className="ml-2 text-xs text-blue-500 hover:text-blue-600 font-bold"
                    >
                      Chat
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search users..."
          className="flex-grow p-2 border rounded-l dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600 disabled:bg-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>
      
      <div className="mt-4">
        {results.length === 0 ? (
          query && !isLoading && (
            <p className="text-gray-500 dark:text-gray-400">No users found</p>
          )
        ) : (
          <ul className="divide-y dark:divide-gray-700">
            {results.map((user) => (
              <li key={user._id} className="py-3 flex justify-between items-center">
                <div className="flex items-center">
                  {user.profilePic ? (
                    <img
                      src={user.profilePic}
                      alt={user.displayName || user.username}
                      className="w-10 h-10 rounded-full mr-3"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center mr-3 dark:bg-gray-600">
                      <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                        {(user.displayName || user.username).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium dark:text-white">
                      {user.displayName || user.username}
                    </h3>
                    {user.displayName && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                    )}
                  </div>
                </div>
                
                <div>
                  {onSelectUser ? (
                    <button
                      onClick={() => onSelectUser(user)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                    >
                      Select
                    </button>
                  ) : pendingRequests.includes(user._id) ? (
                    <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded dark:bg-gray-700 dark:text-gray-300">
                      Request Sent
                    </span>
                  ) : (
                    <button
                      onClick={() => sendChatRequest(user._id, user.displayName || user.username)}
                      className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
                    >
                      Chat
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default UserSearch; 