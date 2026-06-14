import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

export interface User {
  _id: string;
  username: string;
  displayName: string;
  profilePic?: string;
  lastSeen?: string;
}

export interface Message {
  _id: string;
  sender: string;
  content: string;
  createdAt: string;
  encrypted?: boolean;
}

export interface Chat {
  _id: string;
  participants: User[];
  lastActivity: string;
  messages: Message[];
}

export const useChats = () => {
  const { token } = useAuth();
  const { socket, isConnected, isAuthenticated } = useSocket();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchChats = useCallback(async (cancelToken?: any) => {
    if (!token) {
      setChats([]);
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/chats`, {
        headers: { Authorization: `Bearer ${token}` },
        cancelToken: cancelToken
      });

      const serverChats = response.data.chats || [];
      console.log('Fetched chats:', serverChats);
      // Replace state with server data (source of truth)
      setChats(serverChats);
    } catch (error: any) {
      if (axios.isCancel(error)) return;
      if (error.response?.status === 401) {
        // Token expired, don't show error
        setChats([]);
        return;
      }
      console.error('Error fetching chats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Fetch chats when token changes (login/logout)
  useEffect(() => {
    if (!token) {
      setChats([]);
      return;
    }

    const source = axios.CancelToken.source();
    fetchChats(source.token);

    return () => source.cancel('Token changed');
  }, [token, fetchChats]);

  // Append a single chat to state without replacing all chats
  // Safe: skips if chat already exists
  const appendChat = useCallback((newChat: Chat) => {
    setChats(prev => {
      const exists = prev.find(c => c._id === newChat._id);
      if (exists) return prev; // Already in list
      return [newChat, ...prev]; // Prepend so it appears at top
    });
  }, []);

  // Listen for real-time events that should refresh the chat list
  useEffect(() => {
    if (!socket || !isConnected || !isAuthenticated) return;

    const handleRefresh = () => {
      fetchChats();
    };

    // chat_request_accepted — instantly append the chat from socket payload
    const handleChatAccepted = (data: any) => {
      if (data.chat) {
        // Full chat provided — append instantly (no round-trip needed)
        appendChat(data.chat);
      } else {
        // Legacy: no chat in payload, do a full fetch
        fetchChats();
      }
    };

    socket.on('receive_message', handleRefresh);
    socket.on('chat_request_accepted', handleChatAccepted);
    socket.on('message_deleted', handleRefresh);

    return () => {
      socket.off('receive_message', handleRefresh);
      socket.off('chat_request_accepted', handleChatAccepted);
      socket.off('message_deleted', handleRefresh);
    };
  }, [socket, isConnected, isAuthenticated, fetchChats, appendChat]);

  return { chats, isLoading, fetchChats, appendChat };
};
