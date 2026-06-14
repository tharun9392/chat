import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export type ChatRequest = {
  _id: string;
  sender: { username: string };
  recipient: string;
  status: string;
  createdAt: string;
};

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

export function usePendingRequests(userId: string | undefined) {
  const [pendingRequests, setPendingRequests] = useState<ChatRequest[]>([]);
  const { socket, isConnected } = useSocket();
  const { token } = useAuth();

  const fetchRequestsData = useCallback(() => {
    const currentToken = token || localStorage.getItem('token');
    if (!currentToken || !userId) return;

    fetch(`${API_URL}/chats/requests/received`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    })
      .then(res => {
        if (res.status === 401) return;
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        if (data) {
          setPendingRequests(data.requests || []);
        }
      })
      .catch(err => {
        console.error('Error fetching requests:', err);
      });
  }, [userId, token]);

  // Initial fetch
  useEffect(() => {
    if (!userId) {
      setPendingRequests([]);
      return;
    }

    fetchRequestsData();

    // Poll for new requests every 10 seconds as a fallback
    const interval = setInterval(() => {
      fetchRequestsData();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [userId, fetchRequestsData]);

  // Listen for real-time socket events
  useEffect(() => {
    if (!socket || !isConnected || !userId) return;

    // When a new chat request arrives for this user
    const handleNewRequest = (data: any) => {
      console.log('Received chat_request_notification:', data);
      if (String(data.recipientId) === String(userId)) {
        console.log('New chat request from:', data.senderName);
        // Immediately refetch to get the full request data
        fetchRequestsData();
        
        // Play notification sound
        try {
          const audio = new Audio('/notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {}); // Ignore autoplay errors
        } catch (e) {
          // Sound file may not exist, that's fine
        }
      }
    };

    // When a chat request is accepted (remove from pending list)
    const handleRequestAccepted = (data: any) => {
      console.log('Chat request accepted:', data);
      fetchRequestsData();
    };

    // When a chat request is rejected
    const handleRequestRejected = (data: any) => {
      console.log('Chat request rejected:', data);
      fetchRequestsData();
    };

    socket.on('chat_request_notification', handleNewRequest);
    socket.on('chat_request_accepted', handleRequestAccepted);
    socket.on('chat_request_rejected', handleRequestRejected);
    // Also listen for the legacy event name
    socket.on('chat_request_received', handleNewRequest);

    return () => {
      socket.off('chat_request_notification', handleNewRequest);
      socket.off('chat_request_accepted', handleRequestAccepted);
      socket.off('chat_request_rejected', handleRequestRejected);
      socket.off('chat_request_received', handleNewRequest);
    };
  }, [socket, isConnected, userId, fetchRequestsData]);

  return pendingRequests;
}
