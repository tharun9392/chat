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

  // Dynamic mobile viewport height calculation (safeguards layout against soft keyboard resizing issues)
  useEffect(() => {
    const handleViewportResize = () => {
      const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const vh = height * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      
      // If layout viewport is scrolled/offset due to keyboard open (especially iOS Safari), reset it
      if (window.visualViewport && window.visualViewport.offsetTop > 0) {
        window.scrollTo(0, 0);
      }
    };

    handleViewportResize();
    window.addEventListener('resize', handleViewportResize);
    
    // Also listen to visualViewport resize and scroll events (iOS Safari and Android Chrome keyboard helper)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    return () => {
      window.removeEventListener('resize', handleViewportResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
    };
  }, []);

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || (!user && !isLoading);

  if (isLoading && !user) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (isAuthPage) {
    return <Outlet />;
  }

  const pathname = location.pathname;
  const isChatRoute = pathname.startsWith('/chat/');
  const isHomeRoute = pathname === '/';
  
  // Responsive sidebar classes: full-screen on mobile home, hidden on mobile chat, visible on desktop
  let sidebarClassName = "w-full md:w-80 lg:w-96 ";
  if (isHomeRoute) {
    sidebarClassName += "flex";
  } else if (isChatRoute) {
    sidebarClassName += "hidden md:flex";
  } else {
    // Hide sidebar on /profile, /admin, etc., on both mobile and desktop
    sidebarClassName += "hidden";
  }

  // Responsive main container classes: hidden on mobile home, full-screen on mobile chat, flex-1 on desktop
  let mainContainerClassName = "flex-col overflow-hidden relative border-l border-white/20 dark:border-white/5 bg-slate-50/50 dark:bg-dark-900/60 ";
  if (isHomeRoute) {
    mainContainerClassName += "hidden md:flex md:flex-1";
  } else if (isChatRoute) {
    mainContainerClassName += "flex w-full md:flex-1";
  } else {
    // Full width for /profile, /admin
    mainContainerClassName += "flex w-full";
  }

  return (
    <div 
      className="flex bg-slate-100 dark:bg-dark-900 font-sans text-slate-800 dark:text-slate-200 selection:bg-primary-500 selection:text-white w-full overflow-hidden"
      style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
    >
      {/* Dynamic animated abstract background (subtle) */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 dark:opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="z-10 flex w-full h-full shadow-2xl overflow-hidden backdrop-blur-sm bg-white/30 dark:bg-dark-900/40">
        {/* WhatsApp Style Sidebar */}
        <Sidebar className={sidebarClassName} />
        
        {/* Main content area */}
        <div className={mainContainerClassName}>
          <main className={isChatRoute ? "flex-1 flex flex-col min-h-0 w-full overflow-hidden" : "flex-1 overflow-y-auto w-full"}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;