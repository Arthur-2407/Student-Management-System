import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '@components/layout/MainLayout';

const LoginPage = lazy(() => import('@pages/LoginPage'));
const DashboardPage = lazy(() => import('@pages/DashboardPage'));
const AttendancePage = lazy(() => import('@pages/AttendancePage'));
const LeavePage = lazy(() => import('@pages/LeavePage'));
const ReportsPage = lazy(() => import('@pages/ReportsPage'));
const SupervisorDashboard = lazy(() => import('@pages/SupervisorDashboard'));
const SecurityDashboard = lazy(() => import('@pages/SecurityDashboard'));
const SystemStatusDashboard = lazy(() => import('@pages/SystemStatusDashboard'));
const FaceLogin = lazy(() => import('@components/FaceLogin'));

const routeFallback = (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="h-10 w-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
  </div>
);

function withSuspense(element: ReactElement) {
  return <Suspense fallback={routeFallback}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/face-login',
    element: withSuspense(<FaceLogin />),
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: withSuspense(<DashboardPage />),
      },
      {
        path: 'attendance',
        element: withSuspense(<AttendancePage />),
      },
      {
        path: 'leave',
        element: withSuspense(<LeavePage />),
      },
      {
        path: 'reports',
        element: withSuspense(<ReportsPage />),
      },
      {
        path: 'supervisor',
        element: withSuspense(<SupervisorDashboard />),
      },
      {
        path: 'security',
        element: withSuspense(<SecurityDashboard />),
      },
      {
        path: 'system-status',
        element: withSuspense(<SystemStatusDashboard />),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);
