import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider, useAuth } from '@contexts/AuthContext';
import { NotificationProvider } from '@contexts/NotificationContext';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { DegradedModeBanner } from '@components/DegradedModeBanner';

function AppContent() {
  const { isHydrating } = useAuth();

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white p-4">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full text-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin"></div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-100 tracking-wide">Securing Session</h3>
            <p className="text-sm text-slate-400 mt-2 font-medium animate-pulse">Reconnecting to distributed services...</p>
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

function App() {
  return (
    <ErrorBoundary>
      <DegradedModeBanner />
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
          <Toaster position="top-right" />
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;