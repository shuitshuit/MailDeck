import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/auth/LoginPage';
import SignUpPage from './pages/auth/SignUpPage';
import ConfirmSignUpPage from './pages/auth/ConfirmSignUpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import SettingsPage from './pages/SettingsPage';
import Logo from './components/Logo';

import { useEffect, useMemo, useState } from 'react';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { ConsentProvider } from './contexts/ConsentContext';
import { LabelProvider, useLabels } from './contexts/LabelContext';
import { ToastProvider } from './contexts/ToastContext';
import ConsentModal from './components/ConsentModal';
import { getFolders, getServerConfigs, syncUser } from './lib/api';

interface MailFolder {
  name: string;
  fullName: string;
  totalMessages: number;
  unreadMessages: number;
}

interface ServerConfig {
  id: string;
  accountName: string;
}

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
  const { labels } = useLabels();
  const [isLabelsExpanded, setIsLabelsExpanded] = useState(true);
  const [isFoldersExpanded, setIsFoldersExpanded] = useState(false);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [accounts, setAccounts] = useState<ServerConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Extract accountId and folderType from URL path (e.g., /inbox/abc-123 -> { folder: 'inbox', accountId: 'abc-123' })
  const { currentFolderType, currentAccountId } = useMemo(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const folderTypes = ['inbox', 'drafts', 'spam', 'trash'];

    if (pathParts.length >= 1 && folderTypes.includes(pathParts[0])) {
      return {
        currentFolderType: pathParts[0],
        currentAccountId: pathParts.length >= 2 ? pathParts[1] : null
      };
    }
    return { currentFolderType: 'inbox', currentAccountId: null };
  }, [location.pathname]);

  // Helper function to build folder path with current accountId and optional label
  const getFolderPath = (folderName: string, keepLabel: boolean = false) => {
    let path = `/${folderName}`;
    if (currentAccountId) {
      path = `/${folderName}/${currentAccountId}`;
    }
    if (keepLabel && selectedLabelId) {
      path += `?label=${selectedLabelId}`;
    }
    return path;
  };

  // Helper function to build label path for current folder
  const getLabelPath = (labelId: string) => {
    let path = `/${currentFolderType}`;
    if (currentAccountId) {
      path += `/${currentAccountId}`;
    }
    return `${path}?label=${labelId}`;
  };

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const configs = await getServerConfigs();
        setAccounts(configs);
        if (configs.length > 0 && !selectedConfigId) {
          setSelectedConfigId(configs[0].id);
        }
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }
    };
    loadAccounts();
  }, []);

  // Extract accountId from URL path
  useEffect(() => {
    const match = location.pathname.match(/\/inbox\/([^/]+)/);
    if (match && match[1]) {
      setSelectedConfigId(match[1]);
    }
  }, [location.pathname]);

  // Load folders when config changes or folders section is expanded
  useEffect(() => {
    const loadFolders = async () => {
      if (!selectedConfigId || !isFoldersExpanded) return;

      setFoldersLoading(true);
      try {
        const response = await getFolders(selectedConfigId);
        setFolders(response.folders || []);
      } catch (error) {
        console.error('Failed to load folders:', error);
        setFolders([]);
      } finally {
        setFoldersLoading(false);
      }
    };
    loadFolders();
  }, [selectedConfigId, isFoldersExpanded]);

  // Check if a label is currently selected
  const selectedLabelId = searchParams.get('label');
  const selectedFolder = searchParams.get('folder');

  // Filter out standard folders for "Other Folders" section
  const standardFolderNames = ['inbox', 'drafts', 'spam', 'trash', 'sent', 'junk', 'deleted items'];
  const customFolders = folders.filter(f =>
    !standardFolderNames.includes(f.name.toLowerCase()) &&
    !standardFolderNames.includes(f.fullName.toLowerCase().split('/').pop() || '')
  );

  const SidebarContent = () => (
    <>
      <div className="p-6">
        <Logo size="md" />
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {/* Inbox section */}
        <div>
          {/* Inbox - clickable to show all mail */}
          <Link
            to={getFolderPath('inbox')}
            className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${!selectedLabelId && (location.pathname === '/' || location.pathname.startsWith('/inbox'))
              ? 'bg-gray-100 text-brand-600'
              : 'text-gray-700'
              }`}
          >
            <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            Inbox
          </Link>

          {/* Drafts */}
          <Link
            to={getFolderPath('drafts')}
            className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/drafts')
              ? 'bg-gray-100 text-brand-600'
              : 'text-gray-700'
              }`}
          >
            <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Drafts
          </Link>

          {/* Spam */}
          <Link
            to={getFolderPath('spam')}
            className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/spam')
              ? 'bg-gray-100 text-brand-600'
              : 'text-gray-700'
              }`}
          >
            <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Spam
          </Link>

          {/* Trash */}
          <Link
            to={getFolderPath('trash')}
            className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/trash')
              ? 'bg-gray-100 text-brand-600'
              : 'text-gray-700'
              }`}
          >
            <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Trash
          </Link>

          {/* Labels subsection */}
          {labels.length > 0 && (
            <div className="ml-4 mt-1 space-y-0.5">
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
                ラベル
              </button>

              {isLabelsExpanded && (
                <div className="ml-2 mt-1 space-y-0.5">
                  {labels.map(label => (
                    <Link
                      key={label.id}
                      to={selectedLabelId === label.id ? getFolderPath(currentFolderType) : getLabelPath(label.id)}
                      className={`flex items-center px-4 py-1.5 text-sm rounded-md transition-colors ${selectedLabelId === label.id
                        ? 'bg-gray-100 font-medium text-brand-600'
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

          {/* Folders subsection */}
          {accounts.length > 0 && (
            <div className="ml-4 mt-1 space-y-0.5">
              <button
                onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
                className="flex items-center w-full px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
              >
                <svg
                  className={`w-4 h-4 mr-2 transition-transform ${isFoldersExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                フォルダ
              </button>

              {isFoldersExpanded && (
                <div className="ml-2 mt-1 space-y-0.5">
                  {foldersLoading ? (
                    <div className="px-4 py-2 text-sm text-gray-500">読み込み中...</div>
                  ) : customFolders.length > 0 ? (
                    customFolders.map(folder => (
                      <Link
                        key={folder.fullName}
                        to={`/inbox?folder=${encodeURIComponent(folder.fullName)}`}
                        className={`flex items-center px-4 py-1.5 text-sm rounded-md transition-colors ${selectedFolder === folder.fullName
                          ? 'bg-gray-100 font-medium text-brand-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                      >
                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="truncate">{folder.name}</span>
                      </Link>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-500">カスタムフォルダなし</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <Link
          to="/contacts"
          className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/contacts')
            ? 'bg-gray-100 text-brand-600'
            : 'text-gray-700'
            }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Contacts
        </Link>
        <Link
          to="/auto-labeling"
          className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/auto-labeling')
            ? 'bg-gray-100 text-brand-600'
            : 'text-gray-700'
            }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          自動ラベリング
        </Link>
        <Link
          to="/custom-actions"
          className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/custom-actions')
            ? 'bg-gray-100 text-brand-600'
            : 'text-gray-700'
            }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          カスタムアクション
        </Link>
        <Link
          to="/settings"
          className={`flex items-center px-4 py-2 rounded-md hover:bg-gray-100 font-medium ${location.pathname.startsWith('/settings')
            ? 'bg-gray-100 text-brand-600'
            : 'text-gray-700'
            }`}
        >
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
        <Logo size="sm" />
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

import NotificationListener from './components/Notification ';
import AutoLabelingPage from './pages/AutoLabelingPage';
import ContactsPage from './pages/ContactsPage';
import CustomActionsPage from './pages/CustomActionsPage';
import LandingPage from './pages/LandingPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

function App() {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const isAuthenticated = authStatus === 'authenticated';

  return (
    <ToastProvider>
      <NotificationListener />
      <ConfirmProvider>
        <ConsentProvider isAuthenticated={isAuthenticated}>
          <ConsentModal />
          <LabelProvider>
            <Routes>
            <Route path="/welcome" element={<LandingPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/confirm-signup" element={<ConfirmSignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/" element={
              isAuthenticated ? (
                <ProtectedRoute>
                  <Layout>
                    <DashboardPage />
                  </Layout>
                </ProtectedRoute>
              ) : (
                <LandingPage />
              )
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
            <Route path="/drafts" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage folderType="drafts" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/drafts/:accountId" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage folderType="drafts" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/spam" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage folderType="spam" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/spam/:accountId" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage folderType="spam" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/trash" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage folderType="trash" />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/trash/:accountId" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage folderType="trash" />
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
            <Route path="/auto-labeling" element={
              <ProtectedRoute>
                <Layout>
                  <AutoLabelingPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/custom-actions" element={
              <ProtectedRoute>
                <Layout>
                  <CustomActionsPage />
                </Layout>
              </ProtectedRoute>
            } />
            </Routes>
          </LabelProvider>
        </ConsentProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
