import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole 
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  
  // Wait for loading to finish (e.g. restoring session) before checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  
  // Check if user is authenticated
  if (!isAuthenticated) {
    // Redirect to login page with the return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Check for role-based access (admin)
  if (requiredRole === 'admin' && !user?.isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  // User is authenticated and has the required role, render the component
  return <>{children}</>;
};

export default ProtectedRoute; 