import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';

import { useEffect } from 'react';
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
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
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
      </aside>

      <main className="flex-1 overflow-auto">
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
