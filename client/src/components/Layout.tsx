import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import { useSocket } from '../context/SocketContext';
import { useNotification } from '../context/NotificationContext';

const Layout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const { socket } = useSocket();
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!socket) return;

    const handleAnnouncement = (data: any) => {
      console.log('Received admin announcement:', data);
      addNotification(`📢 Announcement: ${data.message}`, 'warning', 10000);
    };

    socket.on('admin_announcement', handleAnnouncement);

    return () => {
      socket.off('admin_announcement', handleAnnouncement);
    };
  }, [socket, addNotification]);

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || (!user && !isLoading);

  if (isLoading && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (isAuthPage) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-dark-900 font-sans text-slate-800 dark:text-slate-200 selection:bg-primary-500 selection:text-white">
      {/* Dynamic animated abstract background (subtle) */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 dark:opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="z-10 flex w-full h-full shadow-2xl overflow-hidden backdrop-blur-sm bg-white/30 dark:bg-dark-900/40">
        {/* WhatsApp Style Sidebar */}
        <Sidebar />
        
        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden relative border-l border-white/20 dark:border-white/5 bg-slate-50/50 dark:bg-dark-900/60">
          <main className="flex-1 overflow-y-auto w-full h-full">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;