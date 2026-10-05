import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoadingScreen } from './components/UI';
import { AdminLayout } from './layouts/AdminLayout';
import { EngineerLayout } from './layouts/EngineerLayout';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { EngineerDashboard } from './pages/engineer/EngineerDashboard';
import { EngineersList } from './pages/admin/EngineersList';
import { CreateEngineer } from './pages/admin/CreateEngineer';
import { EngineerDetail } from './pages/admin/EngineerDetail';
import { AuditLogs } from './pages/admin/AuditLogs';
import { AdminReports } from './pages/admin/AdminReports';
import { EngineerReports } from './pages/engineer/EngineerReports';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { GlobalRecords } from './pages/engineer/GlobalRecords';
import { AllSites } from './pages/admin/AllSites';
import { SitesList } from './pages/engineer/SitesList';
import { CreateSite } from './pages/engineer/CreateSite';
import { SiteDashboard } from './pages/engineer/SiteDashboard';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsAndConditions } from './pages/legal/TermsAndConditions';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { isAuthenticated, isAdmin, loading, mustChangePassword, mustAcceptTerms } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Engineers provisioned by the Super Admin must read and accept the current
  // Terms & Conditions before they can use the system. The terms page is the
  // one route they are allowed to reach, otherwise the gate would trap them in
  // a redirect loop. This runs BEFORE the password gate so the flow is
  // read the terms -> set the temporary password -> use the app.
  if (mustAcceptTerms && window.location.pathname !== '/terms-and-conditions') {
    return <Navigate to="/terms-and-conditions" replace />;
  }

  // First login with a temporary password must be changed before anything else.
  if (mustChangePassword && !window.location.pathname.endsWith('/settings')) {
    return <Navigate to={isAdmin ? '/admin/settings' : '/settings'} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={isAuthenticated ? <Navigate to={isAdmin ? "/admin/dashboard" : "/dashboard"} replace /> : <LoginPage />} />
      {/* Unauthenticated legal page - must be declared before the "/" and "*" routes. */}
      <Route path="/terms-and-conditions" element={<TermsAndConditions />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="engineers" element={<EngineersList />} />
        <Route path="engineers/create" element={<CreateEngineer />} />
        <Route path="engineers/:id/edit" element={<CreateEngineer />} />
        <Route path="engineers/:id" element={<EngineerDetail />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="sites" element={<AllSites />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Engineer routes */}
      <Route path="/" element={<ProtectedRoute><EngineerLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<EngineerDashboard />} />
        <Route path="sites" element={<SitesList />} />
        <Route path="sites/create" element={<CreateSite />} />
        <Route path="sites/:id/edit" element={<CreateSite />} />
        <Route path="sites/:id" element={<SiteDashboard />} />
        <Route path="reports" element={<EngineerReports />} />
        <Route path="workers" element={<GlobalRecords module="workers" />} />
        <Route path="materials" element={<GlobalRecords module="materials" />} />
        <Route path="vendors" element={<GlobalRecords module="vendors" />} />
        <Route path="expenses" element={<GlobalRecords module="expenses" />} />
        <Route path="activities" element={<GlobalRecords module="activities" />} />
        <Route path="documents" element={<GlobalRecords module="documents" />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to={isAuthenticated ? (isAdmin ? "/admin/dashboard" : "/dashboard") : "/login"} replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
