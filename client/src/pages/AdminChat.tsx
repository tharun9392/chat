import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface Message {
  _id: string;
  sender: string;
  content: string;
  encrypted?: boolean;
  createdAt: string;
}

interface ChatData {
  _id: string;
  participants: any[];
  messages: Message[];
  status: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

const AdminChat: React.FC = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const { token } = useAuth();
  const [chat, setChat] = useState<ChatData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchChat = async () => {
      try {
        const response = await axios.get(`${API_URL}/chats/${chatId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setChat(response.data.chat);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching chat:', error);
        setLoading(false);
      }
    };

    fetchChat();
  }, [chatId, token]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-dark-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-dark-900 p-6">
        <p className="text-xl font-bold text-slate-800 dark:text-white">Chat not found</p>
        <Link to="/admin" className="btn-secondary mt-4">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-dark-900">
      {/* Audit Header */}
      <header className="glass-panel sticky top-0 z-10 m-4 p-4 flex items-center justify-between border-none shadow-lg">
        <div className="flex items-center space-x-4">
          <Link to="/admin" className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors">
            <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
              Audit Session
              <span className={`ml-3 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter rounded ${chat.status === 'active' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-500/20 text-slate-500'}`}>
                {chat.status}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {chat.participants.map(p => typeof p === 'object' ? `@${p.username}` : p).join(' ↔ ')}
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center space-x-2 text-xs font-bold text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>SECURE AUDIT VIEW</span>
        </div>
      </header>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">
          {chat.messages.length === 0 ? (
            <div className="text-center py-20 text-slate-500 italic">No messages found in this session.</div>
          ) : (
            chat.messages.map((msg, index) => {
              const isFirstInGroup = index === 0 || chat.messages[index-1].sender !== msg.sender;
              const sender = chat.participants.find(p => (p._id || p) === msg.sender);
              const senderName = typeof sender === 'object' ? sender.username : msg.sender;

              return (
                <div key={msg._id} className={`flex flex-col ${isFirstInGroup ? 'mt-4' : 'mt-1'}`}>
                  {isFirstInGroup && (
                    <span className="text-[10px] font-bold text-primary-500 uppercase tracking-widest pl-1 mb-1">
                      {senderName}
                    </span>
                  )}
                  <div className="group relative glass-card !p-3 !bg-white/50 dark:!bg-white/5 border-none shadow-sm max-w-[90%] md:max-w-[70%]">
                    {msg.encrypted ? (
                      <div className="flex items-center text-slate-400 dark:text-slate-500">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs italic">Encrypted E2E Payload (Readable by participants only)</span>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed break-words">{msg.content}</p>
                    )}
                    <div className="mt-1 flex justify-end items-center space-x-2">
                       <span className="text-[9px] text-slate-400 font-medium">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Info */}
      <footer className="p-4 text-center text-[10px] text-slate-400 font-bold tracking-widest uppercase">
        End of Audit Log — Confidential SecureChat Data
      </footer>
    </div>
  );
};

export default AdminChat;

