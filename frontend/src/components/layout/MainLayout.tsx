import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '@components/layout/Navbar';

interface MainLayoutProps {
  children?: React.ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main>
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default MainLayout;