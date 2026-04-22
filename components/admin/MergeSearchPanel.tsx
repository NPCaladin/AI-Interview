'use client';

import { useState } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Search, Loader2, GitMerge, User, AlertTriangle } from 'lucide-react';

interface SearchResult {
  code: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface Props {
  currentName: string;
  currentCode: string;
  onMerge: (linkedCode: string) => Promise<void>;
  disabled: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '없음';
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')}`;
}

export default function MergeSearchPanel({ currentName, currentCode, onMerge, disabled }: Props) {
  const { authHeaders, logout } = useAdminAuth();
  const [query, setQuery] = useState(currentName);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [confirmingCode, setConfirmingCode] = useState<string | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setError('이름을 입력해주세요');
      return;
    }
    setError('');
    setIsSearching(true);
    setResults(null);
    try {
      const res = await fetch(`/api/admin/reactivations/search?name=${encodeURIComponent(q)}`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `검색 실패 (${res.status})`);
        return;
      }
      const json = await res.json();
      setResults(json.items || json.students || []);
    } catch {
      setError('네트워크 오류');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-[#8b5cf6]/5 border border-[#8b5cf6]/20">
      <div className="flex items-center gap-2 mb-3">
        <GitMerge className="w-4 h-4 text-[#8b5cf6]" />
        <h4 className="text-sm font-semibold text-white">과거 동명 학생 검색 · 병합</h4>
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
        동일인이 이전 수강 후 재결제로 새 V-번호를 발급받은 경우, 과거 학생과 연결하여 이력을 통합할 수 있습니다.
        병합 후 <span className="text-gray-300">usage_logs 이관은 수기 SQL</span>로 처리됩니다.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="과거 학생 이름..."
            disabled={disabled || isSearching}
            className="
              w-full pl-10 pr-3 py-2 rounded-lg text-xs
              bg-white/[0.02] border border-white/10
              text-white placeholder-gray-500
              focus:outline-none focus:border-[#8b5cf6]/50
              disabled:opacity-50
            "
          />
        </div>
        <button
          onClick={runSearch}
          disabled={disabled || isSearching || !query.trim()}
          className="
            flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium
            bg-[#8b5cf6]/20 border border-[#8b5cf6]/40 text-[#8b5cf6]
            hover:bg-[#8b5cf6]/30 hover:border-[#8b5cf6]/60
            disabled:opacity-50 transition-all
          "
        >
          {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          <span>검색</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      )}

      {results !== null && (
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">검색 결과 없음</div>
          ) : (
            results.map(r => {
              const isSelf = r.code === currentCode;
              const isConfirming = confirmingCode === r.code;
              return (
                <div
                  key={r.code}
                  className={`
                    p-3 rounded-lg border transition-all
                    ${isSelf
                      ? 'border-gray-700 bg-gray-900/30 opacity-60'
                      : isConfirming
                        ? 'border-[#8b5cf6]/60 bg-[#8b5cf6]/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                    }
                  `}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span className="font-mono text-xs text-[#00F2FF]">{r.code}</span>
                      <span className="text-xs text-gray-300 truncate">{r.name}</span>
                      {isSelf && <span className="text-[10px] text-gray-600">(자기 자신)</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-[10px] text-gray-500 font-tech tabular-nums">
                      <span>등록 {formatDate(r.created_at)}</span>
                      <span>최근 {formatDate(r.last_used_at)}</span>
                    </div>
                  </div>
                  {!isSelf && (
                    <div className="mt-2">
                      {isConfirming ? (
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-[#8b5cf6]">이 학생과 병합하시겠습니까?</span>
                          <button
                            onClick={async () => {
                              setConfirmingCode(null);
                              await onMerge(r.code);
                            }}
                            disabled={disabled}
                            className="px-2.5 py-1 rounded-md bg-[#8b5cf6] text-white font-medium hover:bg-[#7c4fd8] disabled:opacity-50 transition-colors"
                          >
                            확인
                          </button>
                          <button
                            onClick={() => setConfirmingCode(null)}
                            disabled={disabled}
                            className="px-2.5 py-1 rounded-md border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingCode(r.code)}
                          disabled={disabled}
                          className="flex items-center gap-1.5 text-[11px] text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
                        >
                          <GitMerge className="w-3 h-3" />
                          <span>이 학생과 병합</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
