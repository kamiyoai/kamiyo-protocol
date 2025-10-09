/**
 * Authentication Context
 * Provides authentication utilities and protected route wrapper
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/appStore';
import { apiClient } from '@/api/client';

interface AuthContextValue {
  isLoading: boolean;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const { token, user, login, logout } = useAuthStore();

  // Token refresh mechanism
  const refreshToken = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/refresh', { token });
      const { user: updatedUser, token: newToken } = response.data;
      login(updatedUser, newToken);
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  // Verify token on mount
  useEffect(() => {
    if (token && !user) {
      refreshToken();
    } else {
      setIsLoading(false);
    }
  }, []);

  // Refresh token periodically (every 30 minutes)
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      refreshToken();
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider value={{ isLoading, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route Component
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
}) => {
  const { isAuthenticated } = useAuthStore();
  const { isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && requireAuth && !isAuthenticated) {
      navigate('/login', { state: { from: window.location.pathname } });
    }
  }, [isLoading, isAuthenticated, requireAuth, navigate]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};

export default AuthContext;
