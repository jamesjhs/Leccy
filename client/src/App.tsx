import React, { createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import CookieNotice from './components/CookieNotice';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import PushNotificationPrompt from './components/PushNotificationPrompt';
import Seo from './components/Seo';
import Login from './pages/Login';
import Register from './pages/Register';
import AccountSettings from './pages/AccountSettings';
import Dashboard from './pages/Dashboard';
import DataEntry from './pages/DataEntry';
import QuickDataEntry from './pages/QuickDataEntry';
import Maintenance from './pages/Maintenance';
import Tariff from './pages/Tariff';
import Analytics from './pages/Analytics';
import Vehicles from './pages/Vehicles';
import Admin from './pages/Admin';
import Landing from './pages/Landing';
import { UserInfo } from './utils/api';

const DEFAULT_AUTH_ROUTE = '/quick-data-entry';

interface AuthContextType {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ requires_2fa?: boolean; temp_token?: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  setAuth: (token: string, user: UserInfo) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, isAdmin } = useAuthContext();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to={DEFAULT_AUTH_ROUTE} replace />;
  return <>{children}</>;
}

export default function App() {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <Seo />
        <CookieNotice />
        <PwaInstallPrompt />
        <PushNotificationPrompt />
        <Routes>
          <Route path="/login" element={auth.user && !auth.isLoading ? <Navigate to={DEFAULT_AUTH_ROUTE} replace /> : <Login />} />
          <Route path="/register" element={auth.user && !auth.isLoading ? <Navigate to={DEFAULT_AUTH_ROUTE} replace /> : <Register />} />
          <Route path="/" element={auth.user && !auth.isLoading ? <Navigate to={DEFAULT_AUTH_ROUTE} replace /> : <Landing />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout><Dashboard /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Layout><AccountSettings /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quick-data-entry"
            element={
              <ProtectedRoute>
                <Layout><QuickDataEntry /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/data-entry"
            element={
              <ProtectedRoute>
                <Layout><DataEntry /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/charger-costs" element={<Navigate to="/data-entry" replace />} />
          <Route
            path="/maintenance"
            element={
              <ProtectedRoute>
                <Layout><Maintenance /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tariff"
            element={
              <ProtectedRoute>
                <Layout><Tariff /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/vehicles"
            element={
              <ProtectedRoute>
                <Layout><Vehicles /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Layout><Analytics /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <Layout><Admin /></Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={DEFAULT_AUTH_ROUTE} replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
