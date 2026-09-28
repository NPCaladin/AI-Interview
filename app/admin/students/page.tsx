'use client';

import { useState, useCallback } from 'react';
import { UserPlus } from 'lucide-react';
import StudentTable from '@/components/admin/StudentTable';
import StudentFormModal from '@/components/admin/StudentFormModal';
import { PageHeader } from '@/components/admin/ui';

export default function AdminStudentsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="학생 관리"
        subtitle="수강생 코드 조회 · 추가 · 수정 · 활성화 관리"
        actions={
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
        }
      />

      <StudentTable onRefresh={handleRefresh} refreshKey={refreshKey} />

      {showAddModal && (
        <StudentFormModal onClose={() => setShowAddModal(false)} onSuccess={handleRefresh} />
      )}
    </div>
  );
}
