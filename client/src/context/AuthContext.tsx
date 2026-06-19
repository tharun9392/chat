import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import * as sodium from 'libsodium-wrappers';
import {
  generateKeypair,
  encryptPrivateKey,
  storeEncryptionKeys,
  retrieveEncryptionKeys,
  hasEncryptionKeys
} from '../utils/encryption';

// Define the shape of user data
interface User {
  id: string;
  _id?: string; // Add _id as optional for compatibility
  username: string;
  displayName: string;
  isAdmin: boolean;
  publicKey?: string;
  settings: {
    darkMode: boolean;
  };
  profilePic?: string;
}

// Define the shape of auth context
interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  encryptionKeys: {
    publicKey: Uint8Array | null;
    privateKey: Uint8Array | null;
  };
  isEncryptionReady: boolean;
  login: (username: string, password: string, privateKeyHex?: string, encryptionPassphrase?: string) => Promise<any>;
  register: (username: string, password: string, encryptionPassphrase?: string) => Promise<any>;
  logout: () => void;
  updateUserSettings: (settings: Partial<User['settings']>) => Promise<void>;
}

// Create the authentication context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Base API URL
const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

// Custom hook for using the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Authentication Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  
  const [encryptionKeys, setEncryptionKeys] = useState<{
    publicKey: Uint8Array | null;
    privateKey: Uint8Array | null;
  }>({
    publicKey: null,
    privateKey: null,
  });
  const [isEncryptionReady, setIsEncryptionReady] = useState(false);

  // Define logout early so it is available to interceptors and verifyToken
  const logout = async () => {
    const currentRefreshToken = localStorage.getItem('refreshToken');
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('theme');
    
    if (currentRefreshToken) {
      try {
        await axios.post(`${API_URL}/auth/logout`, { refreshToken: currentRefreshToken });
      } catch (err) {
        console.error('Failed to log out from server:', err);
      }
    }
  };
  
  // Set up axios interceptors for authentication and silent token refresh
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      config => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
          config.headers.Authorization = `Bearer ${storedToken}`;
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );
    
    const responseInterceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const currentRefreshToken = localStorage.getItem('refreshToken');
          
          if (currentRefreshToken) {
            try {
              console.log('Access token expired, attempting silent refresh...');
              const response = await axios.post(`${API_URL}/auth/refresh`, {
                refreshToken: currentRefreshToken
              });
              const { token: newAccessToken, refreshToken: newRefreshToken } = response.data;
              
              localStorage.setItem('token', newAccessToken);
              localStorage.setItem('refreshToken', newRefreshToken);
              setToken(newAccessToken);
              
              // Retry original request
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return axios(originalRequest);
            } catch (refreshError) {
              console.error('Silent refresh failed, logging out...', refreshError);
              logout();
              return Promise.reject(refreshError);
            }
          } else {
            logout();
          }
        }
        return Promise.reject(error);
      }
    );
    
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [token]);
  
  // Check if user is authenticated on initial load
  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('token');
      const storedRefreshToken = localStorage.getItem('refreshToken');
      
      if (!storedToken) {
        setIsLoading(false);
        return;
      }
      
      try {
        const response = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        
        setUser(response.data.user);
        await ensureKeypair(response.data.user.id, response.data.user.publicKey, response.data.user.privateKey);
      } catch (error) {
        // If access token is expired, try to refresh immediately during initial load
        if (storedRefreshToken) {
          try {
            console.log('Initial load: Access token invalid, attempting silent refresh...');
            const refreshResponse = await axios.post(`${API_URL}/auth/refresh`, {
              refreshToken: storedRefreshToken
            });
            const { token: newAccessToken, refreshToken: newRefreshToken } = refreshResponse.data;
            
            localStorage.setItem('token', newAccessToken);
            localStorage.setItem('refreshToken', newRefreshToken);
            setToken(newAccessToken);
            
            // Re-fetch user details with new access token
            const userResponse = await axios.get(`${API_URL}/auth/me`, {
              headers: { Authorization: `Bearer ${newAccessToken}` }
            });
            setUser(userResponse.data.user);
            await ensureKeypair(userResponse.data.user.id, userResponse.data.user.publicKey, userResponse.data.user.privateKey);
          } catch (refreshError) {
            console.error('Initial load refresh failed, logging out...');
            logout();
          }
        } else {
          logout();
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    verifyToken();
  }, [token]);
  
  // Helper to ensure keypair exists - AUTO GENERATES if missing
  const ensureKeypair = async (
    userId: string,
    serverPublicKey?: string,
    serverPrivateKey?: string,
    encryptionPassphrase?: string
  ) => {
    if (!userId) {
      console.error('ensureKeypair called without userId');
      return null;
    }
    
    await sodium.ready;
    
    // Check if we have local encrypted keys
    const hasLocalKeys = hasEncryptionKeys(userId);
    
    // CASE 0: Server provided both public and private key (from /auth/me or /auth/login)
    if (serverPrivateKey && serverPublicKey) {
      console.log('Case 0: Using server-provided keypair (ensures synchronization)');
      try {
        const keys = {
          publicKey: (sodium as any).from_hex(serverPublicKey),
          privateKey: (sodium as any).from_hex(serverPrivateKey),
        };
        setEncryptionKeys(keys);
        setIsEncryptionReady(true);
        
        // Also ensure it's saved locally for fallback
        if (!hasLocalKeys) {
          const tempPassphrase = Math.random().toString(36).substring(2, 15);
          await storeEncryptionKeys(userId, serverPublicKey, serverPrivateKey, tempPassphrase);
          localStorage.setItem(`chat_temp_passphrase_${userId}`, tempPassphrase);
        }
        
        return keys;
      } catch (e) {
        console.error('Failed to parse server keys:', e);
      }
    }
    
    // CASE 1: We have local keys and a passphrase - decrypt and use them
    if (hasLocalKeys && encryptionPassphrase) {
      console.log('Case 1: Decrypting existing local keypair for user', userId);
      try {
        const keys = await retrieveEncryptionKeys(userId, encryptionPassphrase);
        if (keys) {
          setEncryptionKeys(keys);
          setIsEncryptionReady(true);
          
          // Sync to server if server is missing the private key
          if (!serverPrivateKey) {
            try {
              await axios.put(`${API_URL}/users/keys`, {
                publicKey: (sodium as any).to_hex(keys.publicKey),
                privateKey: (sodium as any).to_hex(keys.privateKey)
              }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
              });
              console.log('Case 1: Synced existing local keys to server');
            } catch (e) {
              console.warn('Failed to sync existing keys to server', e);
            }
          }
          
          return keys;
        } else {
          throw new Error('Failed to retrieve encryption keys');
        }
      } catch (error) {
        console.error('Failed to decrypt private key:', error);
        throw new Error('Invalid encryption passphrase');
      }
    }
    
    // CASE 2: We have local encrypted keys but no passphrase yet
    if (hasLocalKeys && !encryptionPassphrase) {
      console.log('Case 2: Local encrypted keys found, trying stored temp passphrase');
      // Try to use stored temp passphrase if it exists
      const storedTempPassphrase = localStorage.getItem(`chat_temp_passphrase_${userId}`);
      if (storedTempPassphrase) {
        try {
          const keys = await retrieveEncryptionKeys(userId, storedTempPassphrase);
          if (keys) {
            setEncryptionKeys(keys);
            setIsEncryptionReady(true);
            
            // Sync to server if server is missing the private key
            if (!serverPrivateKey) {
              try {
                await axios.put(`${API_URL}/users/keys`, {
                  publicKey: (sodium as any).to_hex(keys.publicKey),
                  privateKey: (sodium as any).to_hex(keys.privateKey)
                }, {
                  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                console.log('Case 2: Synced local keys to server');
              } catch (e) {
                console.warn('Failed to sync local keys to server', e);
              }
            }
            
            return keys;
          }
        } catch (error) {
          console.warn('Failed to decrypt with stored temp passphrase');
        }
      }
      // If no temp passphrase or decryption failed, request passphrase
      throw new Error('PASSPHRASE_REQUIRED');
    }
    
    // CASE 3: New login with recovery code provided (new device)
    if (serverPrivateKey && serverPublicKey && encryptionPassphrase) {
      console.log('Case 3: Storing provided recovery code for recovery login');
      const encryptedKey = await encryptPrivateKey(serverPrivateKey, encryptionPassphrase);
      localStorage.setItem(`chat_pubkey_${userId}`, serverPublicKey);
      localStorage.setItem(`chat_privkey_encrypted_${userId}`, encryptedKey);
      
      const keys = {
        publicKey: (sodium as any).from_hex(serverPublicKey),
        privateKey: (sodium as any).from_hex(serverPrivateKey),
      };
      setEncryptionKeys(keys);
      setIsEncryptionReady(true);
      return keys;
    }
    
    // CASE 4: First login after registration - have server public key but user entered passphrase
    if (serverPublicKey && encryptionPassphrase && !serverPrivateKey && !hasLocalKeys) {
      console.log('Case 4: First login - generating new keypair');
      // Auto-generate keys if this is first login
      const generated = await generateKeypair();
      await storeEncryptionKeys(
        userId,
        generated.publicKeyHex,
        generated.privateKeyHex,
        encryptionPassphrase
      );
      
      const keys = {
        publicKey: generated.publicKeyBytes,
        privateKey: generated.privateKeyBytes,
      };
      setEncryptionKeys(keys);
      setIsEncryptionReady(true);
      
      try {
        await axios.put(`${API_URL}/users/keys`, {
          publicKey: generated.publicKeyHex,
          privateKey: generated.privateKeyHex
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        console.log('Case 4: Successfully synced new keys to server');
      } catch (err) {
        console.error('Failed to sync generated keys to server:', err);
      }
      return keys;
    }
    
    // CASE 5: Login without passphrase - AUTO-GENERATE keys with default passphrase
    if (!encryptionPassphrase && serverPublicKey && !hasLocalKeys) {
      console.log('Case 5: Auto-generating keys for first-time login');
      // Auto-generate a temporary passphrase for users who don't provide one
      // Users can update this later
      const tempPassphrase = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
      
      const generated = await generateKeypair();
      await storeEncryptionKeys(
        userId,
        generated.publicKeyHex,
        generated.privateKeyHex,
        tempPassphrase
      );
      
      // Store the temp passphrase securely (you might want to hash it or derive it from password)
      localStorage.setItem(`chat_temp_passphrase_${userId}`, tempPassphrase);
      
      const keys = {
        publicKey: generated.publicKeyBytes,
        privateKey: generated.privateKeyBytes,
      };
      setEncryptionKeys(keys);
      setIsEncryptionReady(true);
      
      try {
        await axios.put(`${API_URL}/users/keys`, {
          publicKey: generated.publicKeyHex,
          privateKey: generated.privateKeyHex
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        console.log('Case 5: Successfully synced new keys to server');
      } catch (err) {
        console.error('Failed to sync generated keys to server:', err);
      }
      return keys;
    }
    
    // If nothing worked, auto-generate keys as fallback
    console.warn('No keys found and unable to decrypt - auto-generating new keypair');
    const tempPassphrase = Math.random().toString(36).substring(2, 15) + 
                          Math.random().toString(36).substring(2, 15);
    
    const generated = await generateKeypair();
    await storeEncryptionKeys(
      userId,
      generated.publicKeyHex,
      generated.privateKeyHex,
      tempPassphrase
    );
    localStorage.setItem(`chat_temp_passphrase_${userId}`, tempPassphrase);
    
    const keys = {
      publicKey: generated.publicKeyBytes,
      privateKey: generated.privateKeyBytes,
    };
    setEncryptionKeys(keys);
    setIsEncryptionReady(true);
    
    try {
      await axios.put(`${API_URL}/users/keys`, {
        publicKey: generated.publicKeyHex,
        privateKey: generated.privateKeyHex
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      console.log('Fallback: Successfully synced new keys to server');
    } catch (err) {
      console.error('Failed to sync generated keys to server:', err);
    }
    return keys;
  };
  
  // Login function - SIMPLIFIED with auto key generation
  const login = async (username: string, password: string, privateKeyHex?: string, encryptionPassphrase?: string) => {
    try {
      console.log('Logging in user:', username);
      
      const response = await axios.post(`${API_URL}/auth/login`, {
        username,
        password
      });
      
      const { token, refreshToken, user } = response.data;
      
      console.log('Login successful! Setting token and user...');
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      setToken(token);
      setUser(user);
      
      console.log('Ensuring encryption keys for user:', user.id);
      
      // Attempt to recover keys from provided recovery code (new device scenario)
      if (privateKeyHex && encryptionPassphrase) {
        console.log('Recovery code provided - recovering keys from new device login');
        await ensureKeypair(user.id, user.publicKey, privateKeyHex, encryptionPassphrase);
      }
      // Try with passphrase if provided
      else if (encryptionPassphrase) {
        console.log('Passphrase provided - attempting to decrypt local keys or auto-generate');
        await ensureKeypair(user.id, user.publicKey, user.privateKey, encryptionPassphrase);
      }
      // No passphrase - try to use local keys or auto-generate
      else {
        console.log('No passphrase provided - checking for local keys or auto-generating');
        await ensureKeypair(user.id, user.publicKey, user.privateKey);
      }
      
      return response.data;
    } catch (error: any) {
      if (error.message === 'PASSPHRASE_REQUIRED') {
        console.log('Passphrase required for encrypted keys');
        throw error;
      }
      console.error('Login error:', error);
      throw error;
    }
  };
  
  // Register function
  const register = async (username: string, password: string, encryptionPassphrase?: string) => {
    try {
      console.log('Registering user:', username);
      
      const response = await axios.post(`${API_URL}/auth/register`, {
        username,
        password
      });
      
      const { token, refreshToken, user, privateKey } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      setToken(token);
      setUser(user);
      
      console.log('Registration successful. Processing encryption keys...');
      
      // Store and encrypt the keypair from registration
      if (encryptionPassphrase) {
        console.log('User provided encryption passphrase');
        await ensureKeypair(user.id, user.publicKey, privateKey, encryptionPassphrase);
      } else {
        // Auto-generate if not provided
        console.log('No encryption passphrase provided - auto-generating with temp passphrase');
        const tempPassphrase = Math.random().toString(36).substring(2, 15) + 
                              Math.random().toString(36).substring(2, 15);
        await ensureKeypair(user.id, user.publicKey, privateKey, tempPassphrase);
        localStorage.setItem(`chat_temp_passphrase_${user.id}`, tempPassphrase);
      }
      
      return {
        ...response.data,
        privateKey  // Return private key so RegisterForm can display recovery code
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };
  
  // Update user settings
  const updateUserSettings = async (settings: Partial<User['settings']>) => {
    try {
      // Ensure we have a valid token before making the request
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await axios.put(
        `${API_URL}/users/settings`, 
        settings,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      setUser(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          settings: {
            ...prev.settings,
            ...response.data.settings
          }
        };
      });
      
      return response.data;
    } catch (error) {
      throw error;
    }
  };
  
  // Context value
  const value = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    encryptionKeys,
    isEncryptionReady,
    login,
    register,
    logout,
    updateUserSettings
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;