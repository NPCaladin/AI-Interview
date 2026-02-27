'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { X, Loader2, AlertCircle } from 'lucide-react';

interface Student {
  id: string;
  code: string;
  name: string;
  weekly_limit: number;
  is_active: boolean;
  created_at: string;
  weekly_usage: number;
}

interface StudentFormModalProps {
  student?: Student;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StudentFormModal({ student, onClose, onSuccess }: StudentFormModalProps) {
  const { authHeaders } = useAdminAuth();
  const isEdit = !!student;

  const [code, setCode] = useState(student?.code || '');
  const [name, setName] = useState(student?.name || '');
  const [weeklyLimit, setWeeklyLimit] = useState(student?.weekly_limit ?? 3);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      let response: Response;

      if (isEdit) {
        response = await fetch('/api/admin/students', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ id: student.id, name, weekly_limit: weeklyLimit }),
        });
      } else {
        response = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ code, name, weekly_limit: weeklyLimit }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '저장에 실패했습니다.');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card-dark rounded-2xl border border-white/10 w-full max-w-md p-6 relative">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-white mb-6">
          {isEdit ? '학생 수정' : '학생 추가'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 코드 (추가 모드에서만 편집 가능) */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">학생 코드</label>
            <input
              type="text"
              value={isEdit ? student.code : code}
              onChange={(e) => !isEdit && setCode(e.target.value.toUpperCase())}
              disabled={isEdit || isSubmitting}
              maxLength={30}
              placeholder="STU-001"
              className="w-full px-4 py-3 bg-dark-700/80 border border-dark-500 rounded-xl text-white font-mono tracking-widest placeholder:text-gray-500 focus:border-[#00F2FF]/60 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              maxLength={50}
              placeholder="홍길동"
              className="w-full px-4 py-3 bg-dark-700/80 border border-dark-500 rounded-xl text-white placeholder:text-gray-500 focus:border-[#00F2FF]/60 focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>

          {/* 주간 제한 */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              주간 제한 횟수
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={weeklyLimit}
                onChange={(e) => setWeeklyLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                disabled={isSubmitting}
                min={1}
                max={100}
                className="w-24 px-4 py-3 bg-dark-700/80 border border-dark-500 rounded-xl text-white text-center focus:border-[#00F2FF]/60 focus:outline-none transition-colors disabled:opacity-50"
              />
              <span className="text-sm text-gray-400">회/주</span>
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl text-sm text-gray-300 border border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!isEdit && !code.trim()) || !name.trim()}
              className="
                flex-1 py-3 rounded-xl text-sm font-bold
                bg-gradient-to-r from-[#00D9A5] to-[#00F2FF]
                text-dark-900
                shadow-[0_0_20px_rgba(0,242,255,0.3)]
                hover:shadow-[0_0_30px_rgba(0,242,255,0.5)]
                transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
              "
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>저장 중...</span></>
              ) : (
                <span>{isEdit ? '수정' : '추가'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
