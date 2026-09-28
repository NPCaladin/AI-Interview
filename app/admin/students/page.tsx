'use client';

import { useState, useCallback } from 'react';
import { FileDown, UserPlus } from 'lucide-react';
import StudentTable from '@/components/admin/StudentTable';
import StudentFormModal from '@/components/admin/StudentFormModal';
import { PageHeader } from '@/components/admin/ui';

export default function AdminStudentsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tableFilters, setTableFilters] = useState<{ search: string; filter: string }>({ search: '', filter: 'all' });

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="학생 관리"
        subtitle="수강생 코드 조회 · 추가 · 수정 · 활성화 관리"
        actions={
          <>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams({ type: 'students' });
              if (tableFilters.search) params.set('search', tableFilters.search);
              if (tableFilters.filter !== 'all') params.set('filter', tableFilters.filter);
              window.location.href = `/api/admin/export?${params}`;
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span>CSV 내보내기</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="
              flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
              bg-gradient-to-r from-[#00D9A5] to-[#00F2FF]
              text-dark-900
              shadow-[0_0_20px_rgba(0,242,255,0.25)]
              hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]
              transition-all duration-200
            "
          >
            <UserPlus className="w-4 h-4" />
            <span>학생 추가</span>
          </button>
          </>
        }
      />

      <StudentTable onRefresh={handleRefresh} refreshKey={refreshKey} onFiltersChange={setTableFilters} />

      {showAddModal && (
        <StudentFormModal onClose={() => setShowAddModal(false)} onSuccess={handleRefresh} />
      )}
    </div>
  );
}
