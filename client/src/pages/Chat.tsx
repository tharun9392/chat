import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useSocket } from '../context/SocketContext';
import LoadingSpinner from '../components/LoadingSpinner';
import axios from 'axios';
import * as sodium from 'libsodium-wrappers';
import { decryptMessage as decryptMessageUtil } from '../utils/encryption';
import VoiceRecorder from '../components/VoiceRecorder';
import { useCall } from '../context/CallContext';

// Types
interface Message {
  _id: string;
  sender: string;
  content: string;
  encrypted?: boolean;
  createdAt: string;
  readAt?: string | null;
  deliveredAt?: string | null;
  isVoiceMessage?: boolean;
  isCallLog?: boolean;
  plainContent?: string; // Store plaintext for sent encrypted messages
  timestamp?: string; // Legacy field
}

interface User {
  _id: string;
  username: string;
  displayName: string;
  profilePic?: string;
  lastSeen?: string;
  publicKey?: string;
}

interface ChatData {
  _id: string;
  participants: User[];
  messages: Message[];
  encryptionKeys: Record<string, string>;
  lastActivity: string;
  status?: 'pending' | 'active' | 'blocked';
}

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

const Chat: React.FC = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const { user, token, encryptionKeys, isEncryptionReady } = useAuth();
  const { addNotification } = useNotification();
  const { socket, isConnected, isAuthenticated } = useSocket();
  const navigate = useNavigate();

  const [chat, setChat] = useState<ChatData | null>(null);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isMoreOptionsMenuOpen, setIsMoreOptionsMenuOpen] = useState(false);
  const { initiateCall } = useCall();
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Socket listener tracking - to prevent duplicates
  const socketListenersAttachedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const moreOptionsMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const currentRoomRef = useRef<{ roomId: string | null; status: string | null }>({ roomId: null, status: null });

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreOptionsMenuRef.current && !moreOptionsMenuRef.current.contains(event.target as Node)) {
        setIsMoreOptionsMenuOpen(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };


    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Memoized decryption function - uses new encryption utilities
  const decryptMessage = useCallback(async (encryptedText: string, senderPublicKey?: string): Promise<string> => {
    if (!isEncryptionReady || !encryptionKeys.privateKey || !senderPublicKey) {
      return '[Encrypted Message - Decryption Key Missing]';
    }

    try {
      return await decryptMessageUtil(encryptedText, senderPublicKey, (sodium as any).to_hex(encryptionKeys.privateKey));
    } catch (error: any) {
      if (error.message?.includes('incorrect')) {
        return '[Decryption Error: Key mismatch]';
      }
      return '[Decryption Error]';
    }
  }, [isEncryptionReady, encryptionKeys.privateKey]);

  // Improved socket listener management - prevent duplicates
  useEffect(() => {
    if (!socket || !isConnected || !isAuthenticated || !chatId) {
      return;
    }

    const shouldBeInRoom = chat?.status === 'active';
    const isCurrentlyInRoom = currentRoomRef.current.roomId === chatId;

    // Leave room if we should not be in it anymore
    if (isCurrentlyInRoom && !shouldBeInRoom) {
      socket.emit('leave_room', chatId);
      socketListenersAttachedRef.current = false;
      currentRoomRef.current = { roomId: null, status: null };
      return;
    }

    // Join room if we should be in it but aren't
    if (!isCurrentlyInRoom && shouldBeInRoom && !socketListenersAttachedRef.current) {
      // Always remove old listeners first to prevent duplicates
      socket.off('receive_message');
      socket.off('messages_read');

      socket.emit('join_room', chatId);
      currentRoomRef.current = { roomId: chatId, status: 'active' };

      // Create a stable handler for messages
      const handleReceiveMessage = async (data: Message) => {
        let displayContent = data.content;

        if (data.encrypted && chat) {
          const currentUserId = user?.id || user?._id;
          const isOwnMessage = String(data.sender) === String(currentUserId);

          if (isOwnMessage) {
            if ((data as any).plainContent) {
              displayContent = (data as any).plainContent;
            } else {
              const otherPersonPublicKey = chat.participants.find(p => {
                const pId = String(p._id || (p as any).id);
                const currentId = String(user?.id || user?._id);
                return pId !== currentId;
              })?.publicKey;
              if (otherPersonPublicKey && isEncryptionReady && encryptionKeys.privateKey) {
                try {
                  displayContent = await decryptMessage(data.content, otherPersonPublicKey);
                } catch (error) {
                  console.error('Failed to decrypt own message:', error);
                  displayContent = '[Decryption Failed]';
                }
              }
            }
          } else {
            const sender = chat.participants.find((p: User) => p._id === data.sender);
            const senderPublicKey = sender?.publicKey;
            if (senderPublicKey && isEncryptionReady && encryptionKeys.privateKey) {
              try {
                displayContent = await decryptMessage(data.content, senderPublicKey);
              } catch (error) {
                console.error('Failed to decrypt received message:', error);
                displayContent = '[Decryption Failed]';
              }
            } else {
              console.warn('Cannot decrypt message: missing key');
              displayContent = '[Encrypted - Key Missing]';
            }
          }
        }

        setChat((prevChat) => {
          if (!prevChat) return null;
          return {
            ...prevChat,
            messages: [...prevChat.messages, { ...data, content: displayContent }],
            lastActivity: new Date().toISOString(),
          };
        });

        // Mark as delivered immediately upon receipt
        if (String(data.sender) !== String(user?.id || user?._id)) {
          if (socket && isConnected) {
            socket.emit('mark_delivered', { chatId, receiverId: user?.id || user?._id });
          }
          // Use the /read endpoint (delivered is handled via socket only)
          axios.put(`${API_URL}/chats/${chatId}/read`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(e => console.error('Failed to mark read', e));
        }

        // If we received a message from the other person while the chat is open, immediately mark it as read
        if (String(data.sender) !== String(user?.id || user?._id)) {
          if (socket && isConnected) {
            socket.emit('mark_read', { chatId, readerId: user?.id || user?._id });
          }

          try {
            axios.put(`${API_URL}/chats/${chatId}/read`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            }).catch(e => console.error('Failed to mark read in background', e));
          } catch (e) {
            // Ignore error
          }
        }
      };

      // Attach listeners exactly once
      socket.on('receive_message', handleReceiveMessage);
      socketListenersAttachedRef.current = true;
    }

    return () => {
      // Cleanup on unmount or when dependencies change
      if (socket && currentRoomRef.current.roomId === chatId) {
        socket.emit('leave_room', chatId);
        socket.off('message_deleted');
        socketListenersAttachedRef.current = false;
        currentRoomRef.current = { roomId: null, status: null };
      }
    };
  }, [socket, isConnected, isAuthenticated, chatId, chat?.status, decryptMessage, isEncryptionReady, encryptionKeys.privateKey, chat, user, token]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    const markAsRead = async () => {
      if (!token || !chatId || !chat || chat.status !== 'active' || !user) return;

      try {
        // Only mark as read if there are unread messages from the other user
        const hasUnread = chat.messages.some(msg =>
          String(msg.sender) !== String(user.id || user._id) && !msg.readAt
        );

        if (hasUnread) {
          await axios.put(`${API_URL}/chats/${chatId}/read`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (socket && isConnected) {
            socket.emit('mark_read', { chatId, readerId: user.id || user._id });
          }

          // Update local state to show as read
          setChat(prevChat => {
            if (!prevChat) return null;
            const now = new Date().toISOString();
            return {
              ...prevChat,
              messages: prevChat.messages.map(msg => {
                if (String(msg.sender) !== String(user.id || user._id) && !msg.readAt) {
                  return { ...msg, readAt: now };
                }
                return msg;
              })
            };
          });
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    };

    markAsRead();
  }, [chatId, token, chat, user, isConnected, socket]);

  // Mark messages as delivered when chat list is updated or chat opened
  useEffect(() => {
    const markAsDelivered = async () => {
      if (!token || !chatId || !chat || chat.status !== 'active' || !user) return;

      try {
        const hasUndelivered = chat.messages.some(msg =>
          String(msg.sender) !== String(user.id || user._id) && !msg.deliveredAt && !msg.readAt
        );

        if (hasUndelivered) {
          await axios.put(`${API_URL}/chats/${chatId}/delivered`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (socket && isConnected) {
            socket.emit('mark_delivered', { chatId, receiverId: user.id || user._id });
          }

          setChat(prevChat => {
            if (!prevChat) return null;
            const now = new Date().toISOString();
            return {
              ...prevChat,
              messages: prevChat.messages.map(msg => {
                if (String(msg.sender) !== String(user.id || user._id) && !msg.deliveredAt && !msg.readAt) {
                  return { ...msg, deliveredAt: now };
                }
                return msg;
              })
            };
          });
        }
      } catch (error) {
        console.error('Error marking messages as delivered:', error);
      }
    };

    markAsDelivered();
  }, [chatId, token, chat, user, isConnected, socket]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages]);

  // Focus input on load, chat switch, or after sending
  useEffect(() => {
    if (!isLoading && chat?.status === 'active' && !isSending) {
      // Small timeout to ensure the DOM is ready after loading spinner disappears
      // or after a message finishes sending (isSending transitions to false)
      const timer = setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [chatId, isLoading, chat?.status, isSending]);

  // Load chat data
  useEffect(() => {
    if (!token || !user) {
      setChat(null);
      setOtherUser(null);
      return;
    }

    const source = axios.CancelToken.source();

    const fetchChat = async () => {
      if (!chatId) return;

      try {
        setIsLoading(true);
        // Only clear chat data if the ID changed
        setChat(null);
        setOtherUser(null);

        const response = await axios.get(`${API_URL}/chats/${chatId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cancelToken: source.token
        });

        const chatData = response.data.chat;

        // Check if chat is pending - user must accept request first
        if (chatData.status === 'pending') {
          // console.warn('Chat request is still pending, not loading messages');
          setChat(chatData);
          setOtherUser(null); // Don't show other user until accepted
          setIsLoading(false);
          return;
        }

        // Find the other user
        let foundOtherUser: User | null = null;
        if (chatData.participants) {
          foundOtherUser = chatData.participants.find((p: User) => {
            const pId = String(p._id || (p as any).id);
            const currentId = String(user.id || user._id);
            return pId !== currentId;
          }) || null;

          if (foundOtherUser) {
            setOtherUser(foundOtherUser);
          }
        }

        // Only decrypt and show messages if chat is active
        if (isEncryptionReady && chatData.status === 'active') {
          const decryptedMessages = await Promise.all(
            chatData.messages.map(async (msg: Message) => {
              if (msg.encrypted) {
                const currentUserId = user?.id || user?._id;
                const isOwnMessage = String(msg.sender) === String(currentUserId);

                if (isOwnMessage) {
                  // For own messages, use the plainContent field if available
                  if ((msg as any).plainContent) {
                    return { ...msg, content: (msg as any).plainContent };
                  }

                  // If no plainContent, we can still decrypt it using our private key and the OTHER person's public key
                  const otherPersonPublicKey = foundOtherUser?.publicKey;
                  if (otherPersonPublicKey) {
                    try {
                      const decryptedContent = await decryptMessage(msg.content, otherPersonPublicKey);
                      return { ...msg, content: decryptedContent };
                    } catch (e) {
                      return { ...msg, content: '[Decryption Error: Key mismatch. This message was encrypted with a different key than your current one.]' };
                    }
                  }
                  return msg;
                }

                // For received messages, use our private key and the sender's public key
                const sender = chatData.participants.find((p: User) => p._id === msg.sender);
                const senderPublicKey = sender?.publicKey;

                if (senderPublicKey) {
                  try {
                    const decryptedContent = await decryptMessage(msg.content, senderPublicKey);
                    return { ...msg, content: decryptedContent };
                  } catch (e) {
                    return { ...msg, content: '[Decryption Error: This message was encrypted for a different keypair. It may have been sent before you regenerated your keys or from another device.]' };
                  }
                } else {
                  return { ...msg, content: '[Sender Key Missing]' };
                }
              }
              return msg;
            })
          );
          chatData.messages = decryptedMessages;
        }

        setChat(chatData);
      } catch (error: any) {
        if (axios.isCancel(error)) return;

        console.error('Error fetching chat:', error);
        if (error.response?.status === 403) {
          // If 403, user doesn't have access.
          if (token && user) {
            return (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 mb-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Access Denied</h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-md">
                  You are not authorized to view this chat. This can sometimes happen if your session data is out of sync.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-slate-200 dark:bg-dark-700 text-slate-700 dark:text-white rounded-xl hover:bg-slate-300 transition-colors"
                  >
                    Go Back Home
                  </button>
                  <button 
                    onClick={() => {
                      localStorage.clear();
                      window.location.href = '/login';
                    }}
                    className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20"
                  >
                    Repair & Re-login
                  </button>
                </div>
              </div>
            );
          }
        }
        
        addNotification('Failed to load chat. It may have been deleted.', 'error');
        navigate('/', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    fetchChat();

    return () => {
      source.cancel('Chat changed or unmounted');
    };
  }, [chatId, token, user, addNotification, navigate, decryptMessage, isEncryptionReady]);

  // Format date for display
  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date for message grouping
  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  // Handle encryption
  const encryptMessage = useCallback(async (text: string): Promise<string> => {
    if (!isEncryptionReady || !otherUser?.publicKey || !encryptionKeys.privateKey) {
      console.warn('Encryption not ready or other user public key missing');
      // Do not send unencrypted message if encryption is expected
      throw new Error('Encryption not available');
    }

    try {
      const otherPublicKey = (sodium as any).from_hex(otherUser.publicKey);
      const nonce = (sodium as any).randombytes_buf((sodium as any).crypto_box_NONCEBYTES);
      const ciphertext = (sodium as any).crypto_box_easy(text, nonce, otherPublicKey, encryptionKeys.privateKey);

      // Combine nonce and ciphertext
      const result = new Uint8Array(nonce.length + ciphertext.length);
      result.set(nonce);
      result.set(ciphertext, nonce.length);

      return (sodium as any).to_base64(result, (sodium as any).base64_variants.ORIGINAL);
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error; // Re-throw to be caught by handleSubmit
    }
  }, [isEncryptionReady, otherUser?.publicKey, encryptionKeys.privateKey]);



  // Handle voice recording complete
  const handleVoiceMessage = async (blob: Blob) => {
    if (!socket || !isConnected || !isAuthenticated) return;

    try {
      setIsSending(true);

      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;

        let content = base64data;
        let encrypted = false;

        if (otherUser?.publicKey) {
          content = await encryptMessage(base64data);
          encrypted = true;
        }

        const newMessage: Message = {
          _id: Date.now().toString(),
          sender: user?.id || '',
          content,
          encrypted,
          isVoiceMessage: true,
          createdAt: new Date().toISOString(),
          // Store plaintext for sent messages so sender can view them
          plainContent: encrypted ? base64data : undefined
        };

        // console.log('Sending voice message:', newMessage);

        // Send message via socket immediately
        socket.emit('send_message', {
          ...newMessage,
          room: chatId
        });

        // Update local state instantly (Optimistic UI)
        setChat(prevChat => {
          if (!prevChat) return null;

          return {
            ...prevChat,
            messages: [...prevChat.messages, { ...newMessage, content: base64data }],
            lastActivity: new Date().toISOString()
          };
        });

        // Run the async save in the background
        axios.post(
          `${API_URL}/chats/${chatId}/messages`,
          { ...newMessage },
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(err => {
          console.error('Failed to save voice message to DB:', err);
        });
      };
    } catch (error) {
      console.error('Error sending voice message:', error);
      addNotification('Failed to send voice message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Send message
  // Helper to insert emoji at cursor
  const insertEmoji = (emoji: string) => {
    const input = messageInputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = message;
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    setMessage(before + emoji + after);
    setIsEmojiPickerOpen(false);
    
    // Set focus back and move cursor after emoji
    setTimeout(() => {
      input.focus();
      const newPos = start + emoji.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const commonEmojis = [
    '😊', '😂', '🥰', '😍', '😒', '😭', '😩', '😘', '☺️', '😎',
    '👍', '🙌', '👏', '🤝', '🔥', '✨', '💯', '❤️', '💙', '✅',
    '👋', '🙏', '🤷', '🤦', '🤔', '👀', '🤫', '🍕', '💡', '🎉'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only allow sending messages if chat is active (accepted)
    if ((!message.trim() && !pendingFile) || !socket || !isConnected || !isAuthenticated || chat?.status !== 'active') {
      if (chat?.status === 'pending') {
        addNotification('Please accept the chat request first', 'warning');
      }
      return;
    }

    try {
      setIsSending(true);

      let originalContent = message.trim();
      
      // Handle file if present
      if (pendingFile) {
        const reader = new FileReader();
        const filePromise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
        });
        reader.readAsDataURL(pendingFile);
        originalContent = await filePromise;
      }

      let content = originalContent;
      let encrypted = false;

      if (otherUser?.publicKey) {
        content = await encryptMessage(originalContent);
        encrypted = true;
      }

      const newMessage: Message = {
        _id: Date.now().toString(),
        sender: user?.id || '',
        content,
        encrypted,
        createdAt: new Date().toISOString(),
        // Store plaintext for sent messages so sender can view them
        plainContent: encrypted ? originalContent : undefined
      };

      // Send message via socket immediately
      socket.emit('send_message', {
        ...newMessage,
        room: chatId
      });

      // Update local state instantly (Optimistic UI)
      setChat(prevChat => {
        if (!prevChat) return null;
        return {
          ...prevChat,
          messages: [...prevChat.messages, { ...newMessage, content: originalContent }],
          lastActivity: new Date().toISOString()
        };
      });

      setMessage('');
      setPendingFile(null);
      setFilePreview(null);
      setIsSending(false); // Reset loading state instantly so user can keep typing

      // Run the async save in the background (fire and forget)
      axios.post(
        `${API_URL}/chats/${chatId}/messages`,
        { ...newMessage },
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(err => {
         console.error('Failed to save message to DB:', err);
      });

      setMessage('');
      setPendingFile(null);
      setFilePreview(null);
      
      // Focus is now handled by the isSending useEffect for stability
    } catch (error: any) {
      console.error('Error sending message:', error);
      addNotification('Failed to send message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Group messages by date
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {};

    messages.forEach(msg => {
      // Guard: createdAt may be undefined for messages from older DB entries
      const date = formatMessageDate(msg.createdAt || msg.timestamp || new Date().toISOString());
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(msg);
    });

    return Object.entries(groups).map(([date, msgs]) => ({
      date,
      messages: msgs
    }));
  };

  // Delete message
  const handleDeleteMessage = async (messageId: string) => {
    if (!chatId || !token) return;

    if (!window.confirm('Delete this message?')) return;

    try {
      await axios.delete(`${API_URL}/chats/${chatId}/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Remove from local state
      setChat(prevChat => {
        if (!prevChat) return null;
        return {
          ...prevChat,
          messages: prevChat.messages.filter(msg => msg._id !== messageId)
        };
      });

      // Sync with other tabs/users
      if (socket && isConnected) {
        socket.emit('delete_message', { chatId, messageId });
      }

      addNotification('Message deleted', 'success');
    } catch (error) {
      console.error('Error deleting message:', error);
      addNotification('Failed to delete message', 'error');
    }
  };

  // Block user
  const handleBlockUser = async () => {
    if (!otherUser || !token) return;

    if (window.confirm(`Are you sure you want to block ${otherUser.displayName || otherUser.username}?`)) {
      try {
        await axios.post(`${API_URL}/users/block/${otherUser._id}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        addNotification(`${otherUser.displayName || otherUser.username} has been blocked`, 'success');
        navigate('/');
      } catch (error) {
        console.error('Error blocking user:', error);
        addNotification('Failed to block user', 'error');
      }
    }
  };

  // Delete chat
  const handleDeleteChat = async () => {
    if (!chatId || !token) return;

    if (window.confirm('Are you sure you want to delete this chat? This action cannot be undone.')) {
      try {
        await axios.delete(`${API_URL}/chats/${chatId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        addNotification('Chat deleted successfully', 'success');
        navigate('/');
      } catch (error) {
        console.error('Error deleting chat:', error);
        addNotification('Failed to delete chat', 'error');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-500">Loading chat...</p>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-xl text-gray-600 dark:text-gray-400">Chat not found</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go back to chats
        </button>
      </div>
    );
  }

  if (chat.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center">
          <p className="text-2xl text-gray-600 dark:text-gray-400 mb-2">⏳ Chat Request Pending</p>
          <p className="text-lg text-gray-500 dark:text-gray-500 mb-6">The request is not accepted yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-600 mb-6">Wait for the user to accept your chat request to continue messaging</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go back to chats
          </button>
        </div>
      </div>
    );
  }

  if (!otherUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-xl text-gray-600 dark:text-gray-400">Unable to load chat details</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go back to chats
        </button>
      </div>
    );
  }

  // Helper function to generate a persistent color based on a string
  const getAvatarColor = (name: string) => {
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

  return (
    <div className="flex flex-col h-full bg-slate-50/10 dark:bg-dark-900/10 backdrop-blur-sm relative transition-colors duration-300">
      {/* Chat header */}
      <div className="flex items-center justify-between px-6 py-4 glass-panel rounded-none border-t-0 border-l-0 border-r-0 z-30 shadow-sm transition-colors duration-300">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/')} 
            className="mr-3 p-1.5 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 block md:hidden hover:bg-slate-100 dark:hover:bg-dark-800 focus:outline-none transition-colors duration-200"
            aria-label="Back to chats"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(otherUser.username)} flex items-center justify-center text-white font-bold overflow-hidden shadow-md ring-2 ring-white/50 dark:ring-dark-700 flex-shrink-0`}>
            {otherUser.profilePic ? (
              <img src={otherUser.profilePic} alt={otherUser.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg">{otherUser.username.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="ml-3 overflow-hidden">
            <h2 className="font-medium dark:text-white truncate">{otherUser.displayName || otherUser.username}</h2>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {otherUser.lastSeen
                ? `Last seen ${new Date(otherUser.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <div className="flex items-center space-x-1 mr-2 border-r border-slate-100 dark:border-slate-700/50 pr-2">
            <button
              onClick={() => otherUser && initiateCall(otherUser._id, 'audio', otherUser)}
              className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-dark-700/50 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 transition-all duration-200 focus:outline-none"
              title="Audio Call"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </button>
            <button
              onClick={() => otherUser && initiateCall(otherUser._id, 'video', otherUser)}
              className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-dark-700/50 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 transition-all duration-200 focus:outline-none"
              title="Video Call"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
          </div>

          <div className="relative" ref={moreOptionsMenuRef}>
            <button
              onClick={() => setIsMoreOptionsMenuOpen(!isMoreOptionsMenuOpen)}
              className="p-2.5 rounded-full hover:bg-slate-200/50 dark:hover:bg-dark-700/50 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 transition-colors duration-200 focus:outline-none ml-2"
              aria-label="More options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {isMoreOptionsMenuOpen && (
              <div className="absolute right-0 top-14 w-56 dropdown-menu z-[100] transform opacity-100 scale-100 transition-all duration-200 origin-top-right">
                <div className="p-3 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-dark-700/30">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Chat Options</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      handleBlockUser();
                      setIsMoreOptionsMenuOpen(false);
                    }}
                    className="flex items-center w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Block User
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteChat();
                      setIsMoreOptionsMenuOpen(false);
                    }}
                    className="flex items-center w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors border-t border-slate-100 dark:border-slate-700/30 mt-1"
                  >
                    <svg className="w-4 h-4 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete Chat
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 relative">
        {/* Subtle pattern background overlay - replaced broken GitHub image with CSS pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] dark:bg-[radial-gradient(#334155_1px,transparent_1px)]"></div>

        <div className="relative z-10">
          {chat.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">No messages yet. Send a message to start the conversation!</p>
            </div>
          ) : (
            <>
              {groupMessagesByDate(chat.messages).map(({ date, messages }) => (
                <div key={date}>
                  <div className="flex justify-center mb-4 sticky top-0 z-10">
                    <div className="px-4 py-1.5 glass-card !rounded-full text-[11px] font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-widest shadow-sm">
                      {date}
                    </div>
                  </div>

                  {messages.map((msg, index) => {
                    const isOwnMessage = msg.sender === user?.id || msg.sender === user?._id;
                    const uniqueKey = msg._id ? `${msg._id}-${index}` : `msg-${index}`;

                    // Guard clause: do not render messages that are completely empty (e.g. from decryption failures or empty sends)
                    const contentStr = msg.content || '';
                    const hasMedia = msg.isVoiceMessage || contentStr.startsWith('data:audio/') || contentStr.startsWith('data:image/');
                    if (!msg.isCallLog && !hasMedia && !contentStr.trim()) {
                      return null;
                    }

                    if (msg.isCallLog) {
                      return (
                        <div key={uniqueKey} className="flex justify-center my-4 group/log relative">
                          <div className="px-4 py-1.5 glass-card bg-black/10 dark:bg-white/5 rounded-full text-[12px] font-medium text-slate-600 dark:text-slate-300 flex items-center space-x-2 border border-white/10 relative">
                            <span>{msg.content}</span>
                            <span className="opacity-60 text-[10px]">{formatMessageTime(msg.createdAt)}</span>
                            
                            <button 
                              onClick={() => handleDeleteMessage(msg._id)}
                              className="opacity-0 group-hover/log:opacity-100 ml-2 p-1 hover:text-red-500 transition-opacity"
                              title="Delete call history entry"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={uniqueKey}
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-1`}
                      >
                        <div
                          className={`group animate-slide-up ${isOwnMessage ? 'out-msg-bubble' : 'in-msg-bubble'
                            }`}
                        >
                          <div className="break-words text-sm pr-12">
                            {msg.isVoiceMessage || (msg.content ?? '').startsWith('data:audio/') ? (
                              <audio controls src={msg.content || ''} className="max-w-[200px] h-10 mt-1" />
                            ) : (msg.content ?? '').startsWith('data:image/') ? (
                              <div className="mt-1 relative group">
                                <img 
                                  src={msg.content} 
                                  alt="Sent" 
                                  className="max-w-full rounded-lg shadow-sm border border-black/5 hover:opacity-90 transition-opacity cursor-pointer" 
                                  onClick={() => window.open(msg.content, '_blank')}
                                />
                              </div>
                            ) : (
                              <div className="relative">
                                {msg.encrypted && (
                                  <span className="inline-block mr-1 text-gray-400 opacity-50" title="End-to-end encrypted">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                                <span className={msg.content === 'This message was deleted' ? 'italic text-slate-400 dark:text-slate-500' : ''}>
                                  {msg.content}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="absolute right-1.5 bottom-1 flex items-center space-x-1 opacity-60">
                            <span className="text-[9px]">{formatMessageTime(msg.createdAt || msg.timestamp || new Date().toISOString())}</span>
                            {isOwnMessage && (
                              <span className="flex">
                                {msg.readAt ? (
                                  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                                    <title>{`Read at ${new Date(msg.readAt).toLocaleString()}`}</title>
                                    <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41zM.41 13.41L5.66 18.66l1.41-1.41L1.83 12 .41 13.41z" />
                                  </svg>
                                ) : msg.deliveredAt ? (
                                  <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                                    <title>{`Delivered at ${new Date(msg.deliveredAt).toLocaleString()}`}</title>
                                    <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41zM.41 13.41L5.66 18.66l1.41-1.41L1.83 12 .41 13.41z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                                    <title>Sent</title>
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                  </svg>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Message input */}
      <div className="p-4 glass-panel rounded-none border-b-0 border-l-0 border-r-0 z-30 transition-colors duration-300">
        {filePreview && (
          <div className="mb-3 relative inline-block group">
            <div className="relative rounded-2xl overflow-hidden border-2 border-primary-500/30 shadow-xl max-w-[200px] animate-slide-up">
              <img src={filePreview} alt="Preview" className="w-full h-auto max-h-40 object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-[10px] font-bold uppercase tracking-wider">Ready to send</p>
              </div>
            </div>
            <button
              onClick={() => {
                setPendingFile(null);
                setFilePreview(null);
              }}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-colors z-10"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
          <div className="flex items-center">
            <div className="relative" ref={emojiPickerRef}>
              <button
                type="button"
                onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                className={`p-2.5 rounded-full transition-all duration-200 ${isEmojiPickerOpen ? 'bg-primary-500/10 text-primary-600' : 'text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 hover:bg-slate-200/50 dark:hover:bg-dark-700/50'}`}
                aria-label="Emoji picker"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              {isEmojiPickerOpen && (
                <div className="absolute bottom-full left-0 mb-4 dropdown-menu p-3 w-72 animate-slide-up origin-bottom-left z-[100]">
                  <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-3 ml-1 tracking-wider">Quick Emojis</p>
                  <div className="grid grid-cols-6 gap-2">
                    {commonEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="text-2xl p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-dark-700/50 transform hover:scale-125 transition-all duration-200 active:scale-95"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-full text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 hover:bg-slate-200/50 dark:hover:bg-dark-700/50 transition-colors duration-200"
                aria-label="Attach"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPendingFile(file);
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onloadend = () => setFilePreview(reader.result as string);
                      reader.readAsDataURL(file);
                    } else {
                      setFilePreview(null);
                    }
                    // Return focus after file selection
                    setTimeout(() => messageInputRef.current?.focus(), 0);
                  }
                }}
              />
            </div>
          </div>

          <div className="flex-1 relative">
            <input
              type="text"
              ref={messageInputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={(pendingFile && !filePreview) ? `Selected: ${pendingFile.name}` : "Type a message..."}
              className="input-field py-2.5"
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />
          </div>

          <div className="flex items-center space-x-1">
            <VoiceRecorder onRecordingComplete={handleVoiceMessage} />

            <button
              type="submit"
              disabled={(!message.trim() && !pendingFile) || isSending || chat?.status !== 'active'}
              className={`p-2.5 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95 ${(!message.trim() && !pendingFile) || isSending || chat?.status !== 'active'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
                }`}
            >
              {isSending ? (
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Chat;
