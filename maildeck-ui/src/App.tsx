import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';

import { useEffect, useState } from 'react';
import { syncUser, getLabels } from './lib/api';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import type { Label } from './types/label';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      syncUser();
    }
  }, [authStatus]);

  if (authStatus === 'configuring') {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (authStatus !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Layout component
function Layout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator(context => [context.user]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLabelsExpanded, setIsLabelsExpanded] = useState(true);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Load labels
  useEffect(() => {
    const loadLabels = async () => {
      try {
        const labelList = await getLabels();
        setLabels(labelList);
      } catch (error) {
        console.error('Failed to load labels', error);
      }
    };

    loadLabels();
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Check if a label is currently selected
  const selectedLabelId = searchParams.get('label');

  const SidebarContent = () => (
    <>
      <div className="p-6">
        <div className="font-bold text-xl text-brand-600 flex items-center gap-2">
          MailDeck
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {/* Inbox section */}
        <div>
          <Link
            to="/"
            className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${
              location.pathname === '/' || location.pathname.startsWith('/inbox')
                ? 'bg-gray-100 text-brand-600'
                : 'text-gray-700'
            }`}
          >
            <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            Inbox
          </Link>

          {/* Labels subsection */}
          {labels.length > 0 && (
            <div className="ml-4 mt-1">
              <button
                onClick={() => setIsLabelsExpanded(!isLabelsExpanded)}
                className="flex items-center w-full px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
              >
                <svg
                  className={`w-4 h-4 mr-2 transition-transform ${isLabelsExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Labels
              </button>

              {isLabelsExpanded && (
                <div className="ml-2 mt-1 space-y-0.5">
                  {labels.map(label => (
                    <Link
                      key={label.id}
                      to={`/inbox?label=${label.id}`}
                      className={`flex items-center px-4 py-1.5 text-sm rounded-md transition-colors ${
                        selectedLabelId === label.id
                          ? 'bg-gray-100 font-medium'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="truncate">{label.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Link to="/contacts" className="flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-gray-100 font-medium">
          <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Contacts
        </Link>
        <Link to="/settings" className="flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-gray-100 font-medium">
          <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </Link>
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-medium truncate">{user?.username}</div>
          </div>
        </div>
        <button onClick={signOut} className="w-full text-sm text-red-600 hover:text-red-700 text-left px-2">
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b z-30 flex items-center justify-between px-4">
        <div className="font-bold text-xl text-brand-600">MailDeck</div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-md"
        >
          {isMobileMenuOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col z-50 animate-in slide-in-from-left duration-200">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-16 w-full">
        {children}
      </main>
    </div>
  );
}

import ContactsPage from './pages/ContactsPage';

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/inbox" element={
        <ProtectedRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/inbox/:accountId" element={
        <ProtectedRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/contacts" element={
        <ProtectedRoute>
          <Layout>
            <ContactsPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Layout>
            <SettingsPage />
          </Layout>
        </ProtectedRoute>
      } />
        </Routes>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
