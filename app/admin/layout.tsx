import type { Metadata } from 'next';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Admin — EvenI 면접 연습',
  robots: 'noindex, nofollow',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      {children}
    </AdminAuthProvider>
  );
}
