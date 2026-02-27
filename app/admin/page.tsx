'use client';

import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminLoginScreen from '@/components/admin/AdminLoginScreen';
import AdminDashboard from '@/components/admin/AdminDashboard';

export default function AdminPage() {
  const { isAuthenticated, isLoading } = useAdminAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <AdminLoginScreen />;
  }

  return <AdminDashboard />;
}
