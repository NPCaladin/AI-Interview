'use client';

import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminLoginScreen from '@/components/admin/AdminLoginScreen';
import ReactivationQueue from '@/components/admin/ReactivationQueue';

export default function AdminReactivationsPage() {
  const { isAuthenticated, isLoading } = useAdminAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <AdminLoginScreen />;

  return <ReactivationQueue />;
}
