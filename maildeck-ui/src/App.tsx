import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';

import { useEffect, useState } from 'react';
import { syncUser } from './lib/api';

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
  const location = useLocation();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const SidebarContent = () => (
    <>
      <div className="p-6">
        <div className="font-bold text-xl text-brand-600 flex items-center gap-2">
          MailDeck
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        <Link to="/" className="flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-gray-100 font-medium">
          Inbox
        </Link>
        <Link to="/contacts" className="flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-gray-100 font-medium">
          Contacts
        </Link>
        <Link to="/settings" className="flex items-center px-4 py-2 text-gray-700 rounded-md hover:bg-gray-100 font-medium">
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
  );
}

export default App;
