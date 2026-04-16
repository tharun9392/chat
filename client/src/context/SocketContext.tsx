import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  reauthenticate: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://127.0.0.1:5002';

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated: userIsAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Function to manually trigger re-authentication
  const reauthenticate = useCallback(() => {
    const s = socketRef.current;
    const currentToken = token || localStorage.getItem('token');
    if (s && s.connected && currentToken) {
      console.log('Socket: Authenticating...');
      s.emit('authenticate', { token: currentToken });
    }
  }, [token]);

  // Initialize socket connection — only once
  useEffect(() => {
    console.log('Socket: Initializing connection to', SOCKET_URL);
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('Socket: Connected to server');
      setIsConnected(true);
      // Auto-authenticate on connect/reconnect
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        newSocket.emit('authenticate', { token: storedToken });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket: Disconnected (Reason:', reason, ')');
      setIsConnected(false);
      setIsAuthenticated(false);
      // Auto-reconnect if the server disconnected us (not user-initiated)
      if (reason === 'io server disconnect') {
        newSocket.connect();
      }
    });

    newSocket.on('reconnect', (attemptNumber: number) => {
      console.log('Socket: Reconnected after', attemptNumber, 'attempts');
    });

    newSocket.on('reconnect_error', (error: Error) => {
      console.warn('Socket: Reconnection error:', error.message);
    });

    newSocket.on('authenticated', (data: any) => {
      console.log('Socket: Authenticated for user:', data.userId);
      setIsAuthenticated(true);
    });

    newSocket.on('authentication_error', (error: any) => {
      console.error('Socket: Authentication failed:', error.message);
      setIsAuthenticated(false);
    });

    setSocket(newSocket);

    return () => {
      console.log('Socket: Cleaning up connection');
      newSocket.removeAllListeners();
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Sync authentication when user auth state changes
  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    if (s.connected && userIsAuthenticated && token && !isAuthenticated) {
      // User just logged in, authenticate socket
      s.emit('authenticate', { token });
    } else if (isAuthenticated && !userIsAuthenticated) {
      // User logged out, reset socket auth state
      console.log('Socket: User logged out, resetting auth state');
      setIsAuthenticated(false);
      s.disconnect();
      setTimeout(() => s.connect(), 300);
    }
  }, [token, userIsAuthenticated, isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthenticated, reauthenticate }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;