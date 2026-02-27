'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { TrendingUp, Loader2 } from 'lucide-react';

interface DailyData {
  date: string;
  count: number;
  uniqueUsers: number;
}

export default function UsageChart() {
  const { authHeaders } = useAdminAuth();
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [data, setData] = useState<DailyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { headers: authHeaders() });
      const json = await res.json();
      setData(json.daily || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [days, authHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const totalUsers = new Set(data.flatMap((d) => Array(d.uniqueUsers).fill(0))).size;

  const formatDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    return `${parseInt(m)}/${parseInt(d)}`;
  };

  const isToday = (dateStr: string) => {
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const today = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
    return dateStr === today;
  };

  return (
    <div className="glass-card-dark rounded-xl border border-white/10 p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#00F2FF]" />
          <h2 className="text-sm font-semibold text-white">일별 이용 현황</h2>
          {!isLoading && (
            <span className="text-xs text-gray-500">총 {totalCount}회</span>
          )}
        </div>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                days === d
                  ? 'bg-[#00F2FF]/20 text-[#00F2FF] border border-[#00F2FF]/40'
                  : 'text-gray-400 border border-white/10 hover:border-white/20 hover:text-gray-300'
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 text-[#00F2FF] animate-spin" />
        </div>
      ) : totalCount === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          해당 기간에 이용 기록이 없습니다.
        </div>
      ) : (
        <>
          {/* 차트 */}
          <div className="flex items-end gap-[3px] h-40 mb-1">
            {data.map(({ date, count, uniqueUsers }) => {
              const heightPct = count > 0 ? Math.max((count / maxCount) * 100, 6) : 0;
              const today = isToday(date);
              return (
                <div
                  key={date}
                  className="flex-1 flex flex-col items-center justify-end gap-0 group relative"
                  style={{ height: '100%' }}
                >
                  {/* 툴팁 */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-20 pointer-events-none">
                    <div className="bg-dark-800/95 border border-[#00F2FF]/30 rounded-lg px-3 py-2 text-center whitespace-nowrap shadow-lg">
                      <p className="text-[10px] font-tech text-gray-400 mb-0.5">{date}</p>
                      <p className="text-sm text-white font-bold">{count}회</p>
                      <p className="text-[10px] text-gray-400">{uniqueUsers}명 이용</p>
                    </div>
                    <div className="flex justify-center">
                      <div className="w-2 h-2 bg-dark-800 border-r border-b border-[#00F2FF]/30 rotate-45 -mt-1" />
                    </div>
                  </div>

                  {/* 막대 */}
                  <div
                    className="w-full rounded-t-sm transition-all duration-500 relative overflow-hidden"
                    style={{
                      height: `${heightPct}%`,
                      background: today
                        ? 'linear-gradient(to top, #f59e0b, #fbbf24)'
                        : count === 0
                        ? 'transparent'
                        : 'linear-gradient(to top, #00D9A5, #00F2FF)',
                      boxShadow: count > 0
                        ? today
                          ? '0 0 10px rgba(245,158,11,0.5)'
                          : '0 0 10px rgba(0,242,255,0.3)'
                        : 'none',
                      minHeight: count === 0 ? '2px' : undefined,
                      backgroundColor: count === 0 ? 'rgba(255,255,255,0.05)' : undefined,
                    }}
                  >
                    {count > 0 && (
                      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X축 날짜 */}
          <div className="flex gap-[3px] mb-4">
            {data.map(({ date }) => (
              <div key={date} className="flex-1 text-center">
                <span
                  className={`text-[9px] font-tech ${
                    isToday(date) ? 'text-[#f59e0b]' : 'text-gray-600'
                  }`}
                >
                  {formatDate(date)}
                </span>
              </div>
            ))}
          </div>

          {/* 범례 */}
          <div className="flex items-center gap-5 pt-3 border-t border-white/5 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(to top, #00D9A5, #00F2FF)' }} />
              <span>면접 횟수</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#f59e0b]" />
              <span>오늘</span>
            </div>
            <div className="ml-auto text-gray-500">
              기간 내 연인원 {data.reduce((sum, d) => sum + d.uniqueUsers, 0)}명
            </div>
          </div>
        </>
      )}
    </div>
  );
}
