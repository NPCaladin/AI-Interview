'use client';

import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminLoginScreen from '@/components/admin/AdminLoginScreen';
import SyncStatusPanel from '@/components/admin/SyncStatusPanel';

export default function AdminSyncPage() {
  const { isAuthenticated, isLoading } = useAdminAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <AdminLoginScreen />;

  return <SyncStatusPanel />;
}
