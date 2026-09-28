'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  UserCheck,
  RefreshCw,
  ListChecks,
  Sparkles,
  ScrollText,
  LogOut,
  Menu,
  X,
  UserCircle2,
  type LucideIcon,
} from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: '대시보드', icon: LayoutDashboard },
  { href: '/admin/sessions', label: '면접 세션', icon: FileText },
  { href: '/admin/students', label: '학생', icon: Users },
  { href: '/admin/stats', label: '통계', icon: BarChart3 },
  { href: '/admin/reactivations', label: '재활성화 큐', icon: UserCheck },
  { href: '/admin/sync', label: 'ERP 동기화', icon: RefreshCw },
  { href: '/admin/questions', label: '문항 관리', icon: ListChecks },
  { href: '/admin/prompts', label: '프롬프트', icon: Sparkles },
  { href: '/admin/audit', label: '감사 로그', icon: ScrollText },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const { actor, isLoading, logout } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 라우트 이동 시 모바일 드로어 닫기
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-[#00F2FF]/10 text-[#00F2FF] border border-[#00F2FF]/30'
                : 'text-gray-400 border border-transparent hover:text-white hover:bg-white/5'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="[word-break:keep-all]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-[#0d0d14]/95 border-r border-white/10 z-30">
        <div className="h-14 flex items-center px-5 border-b border-white/10">
          <Link href="/admin" className="text-sm font-bold text-white tracking-tight">
            이븐아이 <span className="text-[#00F2FF]">면접 어드민</span>
          </Link>
        </div>
        {nav}
      </aside>

      {/* 모바일 드로어 */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-60 flex flex-col bg-[#0d0d14] border-r border-white/10">
            <div className="h-14 flex items-center justify-between px-5 border-b border-white/10">
              <span className="text-sm font-bold text-white">
                이븐아이 <span className="text-[#00F2FF]">면접 어드민</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                aria-label="메뉴 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="md:pl-60 min-w-0">
        {/* 상단 바 */}
        <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 md:px-8 bg-[#0a0a0f]/85 backdrop-blur border-b border-white/10">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
            aria-label="메뉴 열기"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="md:hidden text-xs font-semibold text-gray-300">이븐아이 면접 어드민</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs text-gray-300">
            <UserCircle2 className="w-4 h-4 text-gray-500" />
            <span className="max-w-[140px] truncate">{isLoading ? '…' : actor ?? '—'}</span>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </header>

        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
