/**
 * Main App Component
 * Handles routing, layout, and global providers
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from '@/contexts/AuthContext';
import { ToastContainer } from '@/components/common/Toast';
import { useNotifications } from '@/store/appStore';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MobileNav from '@/components/layout/MobileNav';
import '@/styles/responsive.css';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const APIDocsPage = lazy(() => import('@/pages/APIDocsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

// Loading component
const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh'
  }}>
    <LoadingSpinner size="lg" text="Loading..." />
  </div>
);

function App() {
  const { notifications, removeNotification } = useNotifications();

  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app">
          <MobileNav />

          <main className="app-main">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/docs" element={<APIDocsPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />

                {/* Protected routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>

          {/* Toast notifications */}
          <ToastContainer
            notifications={notifications}
            onDismiss={removeNotification}
          />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
