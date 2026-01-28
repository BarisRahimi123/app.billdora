import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import { Capacitor } from '@capacitor/core';
import { isLandingDomain, isAppDomain, DOMAINS, LANDING_ROUTES } from './lib/domains';

// EAGERLY load the most frequently used pages for instant navigation
// This prevents delays when resuming from iOS background
import DashboardPage from './pages/DashboardPage';
import SalesPage from './pages/SalesPage';
import ProjectsPage from './pages/ProjectsPage';
import LoginPage from './pages/LoginPage';

// Lazy load less frequently used pages
const TimeExpensePage = lazy(() => import('./pages/TimeExpensePage'));
const InvoicingPage = lazy(() => import('./pages/InvoicingPage'));
const ResourcingPage = lazy(() => import('./pages/ResourcingPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const QuoteDocumentPage = lazy(() => import('./pages/QuoteDocumentPage'));
const ProposalPortalPage = lazy(() => import('./pages/ProposalPortalPage'));
const InvoiceViewPage = lazy(() => import('./pages/InvoiceViewPage'));
const ClientPortalPage = lazy(() => import('./pages/ClientPortalPage'));
const CompanyExpensesPage = lazy(() => import('./pages/CompanyExpensesPage'));
const BankStatementsPage = lazy(() => import('./pages/BankStatementsPage'));
const FinancialsPage = lazy(() => import('./pages/FinancialsPage'));
const ReceiptsPage = lazy(() => import('./pages/ReceiptsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const CheckEmailPage = lazy(() => import('./pages/CheckEmailPage'));
const CollaboratorAcceptPage = lazy(() => import('./pages/CollaboratorAcceptPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const LeadFormPage = lazy(() => import('./pages/LeadFormPage'));

import CookieConsent from './components/CookieConsent';

// Coming Soon placeholder for features in development
function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 mb-6 rounded-full bg-[#476E66]/10 flex items-center justify-center">
        <svg className="w-8 h-8 text-[#476E66]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold text-neutral-900 mb-2">{title}</h1>
      <p className="text-neutral-500 mb-1">Coming Soon</p>
      <p className="text-sm text-neutral-400">We're working on something great. Stay tuned!</p>
    </div>
  );
}

// Loading spinner component for Suspense fallback - compact and fast with timeout recovery
function PageLoader() {
  const [showRetry, setShowRetry] = useState(false);
  
  useEffect(() => {
    // If loading takes more than 5 seconds, show retry button
    const timer = setTimeout(() => setShowRetry(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  
  if (showRetry) {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center gap-3">
        <div className="animate-spin w-6 h-6 border-2 border-[#476E66] border-t-transparent rounded-full" />
        <button 
          onClick={() => window.location.reload()} 
          className="px-3 py-1.5 text-xs text-[#476E66] border border-[#476E66] rounded-lg hover:bg-[#476E66]/5"
        >
          Taking too long? Tap to refresh
        </button>
      </div>
    );
  }
  
  return (
    <div className="min-h-[200px] flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-[#476E66] border-t-transparent rounded-full" />
    </div>
  );
}

// App Lifecycle logging (no forced re-renders - let WebView resume naturally)
function useAppLifecycleLogging() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let listener: any = null;
    import('@capacitor/app').then(({ App }) => {
      listener = App.addListener('appStateChange', ({ isActive }) => {
        console.log('[App] State:', isActive ? 'FOREGROUND' : 'BACKGROUND');
      });
    }).catch(console.error);
    
    return () => { listener?.remove(); };
  }, []);
}

// Dashboard, Sales, Projects, Login are now eagerly loaded - no prefetch needed

// Domain-based redirect component (client-side fallback)
function DomainRedirect({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  useEffect(() => {
    // Skip in dev/Capacitor - handled by domains.ts
    if (Capacitor.isNativePlatform()) return;
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return;
    
    const isLanding = hostname === 'billdora.com' || hostname === 'www.billdora.com';
    const isApp = hostname === 'app.billdora.com';
    const path = location.pathname;
    
    // On landing domain, redirect app routes to app domain
    if (isLanding && !LANDING_ROUTES.includes(path) && path !== '/') {
      window.location.href = `${DOMAINS.APP}${path}${location.search}`;
      return;
    }
    
    // On app domain, redirect landing page to dashboard (for logged in) or login
    if (isApp && path === '/') {
      // Let the route handler decide (it will check auth)
      return;
    }
  }, [location]);
  
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <PageLoader />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Component to handle root route based on domain
function RootRoute() {
  const { user, loading } = useAuth();
  
  // In production on app.billdora.com, redirect to dashboard or login
  if (typeof window !== 'undefined' && window.location.hostname === 'app.billdora.com') {
    if (loading) return <PageLoader />;
    return user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
  }
  
  // On landing domain or dev, show landing page
  return <LandingPage />;
}

function AppRoutes() {
  const { user, loading, passwordRecoveryMode } = useAuth();
  
  // Just log app lifecycle, don't force re-renders
  useAppLifecycleLogging();

  return (
    <DomainRedirect>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={loading ? <PageLoader /> : (user && !passwordRecoveryMode ? <Navigate to="/dashboard" replace /> : <LoginPage />)} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/quotes/:quoteId/document" element={<ProtectedRoute><QuoteDocumentPage /></ProtectedRoute>} />
          <Route path="/proposal/:token" element={<ErrorBoundary><ProposalPortalPage /></ErrorBoundary>} />
          <Route path="/invoice-view/:invoiceId" element={<InvoiceViewPage />} />
          <Route path="/portal/:token" element={<ClientPortalPage />} />
          <Route path="/lead/:formId" element={<LeadFormPage />} />
          <Route path="/collaborate/:id" element={<CollaboratorAcceptPage />} />
          
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
            <Route path="/sales" element={<ErrorBoundary><SalesPage /></ErrorBoundary>} />
            <Route path="/projects" element={<ErrorBoundary><ProjectsPage /></ErrorBoundary>} />
            <Route path="/projects/:projectId" element={<ErrorBoundary><ProjectsPage /></ErrorBoundary>} />
            <Route path="/time-expense" element={<ErrorBoundary><TimeExpensePage /></ErrorBoundary>} />
            <Route path="/invoicing" element={<ErrorBoundary><InvoicingPage /></ErrorBoundary>} />
            <Route path="/resourcing" element={<ErrorBoundary><ResourcingPage /></ErrorBoundary>} />
            <Route path="/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
            <Route path="/reports" element={<ErrorBoundary><ReportsPage /></ErrorBoundary>} />
            <Route path="/financials" element={<ErrorBoundary><FinancialsPage /></ErrorBoundary>} />
            <Route path="/company-expenses" element={<ErrorBoundary><CompanyExpensesPage /></ErrorBoundary>} />
            <Route path="/bank-statements" element={<Navigate to="/financials" replace />} />
            <Route path="/receipts" element={<ErrorBoundary><ReceiptsPage /></ErrorBoundary>} />
            <Route path="/notifications" element={<ErrorBoundary><NotificationsPage /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </DomainRedirect>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <SubscriptionProvider>
              <ToastProvider>
                <AppRoutes />
                <CookieConsent />
              </ToastProvider>
            </SubscriptionProvider>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
