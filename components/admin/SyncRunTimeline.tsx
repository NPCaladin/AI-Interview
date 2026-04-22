'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, FlaskConical, FileText } from 'lucide-react';

interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  pages_fetched: number;
  records_upserted: number;
  records_queued: number;
  error_code: string | null;
  error_snippet: string | null;
  dry_run: boolean;
}

interface SyncRunTimelineProps {
  runs: SyncRun[];
}

function formatKst(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

function durationMs(started: string, finished: string | null): string {
  if (!finished) return '진행 중';
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const STATUS_CONFIG = {
  running: { icon: Loader2, color: '#f59e0b', label: '진행 중', spin: true },
  success: { icon: CheckCircle2, color: '#00D9A5', label: '성공', spin: false },
  partial: { icon: AlertTriangle, color: '#f59e0b', label: '부분 성공', spin: false },
  failed: { icon: XCircle, color: '#ef4444', label: '실패', spin: false },
} as const;

export default function SyncRunTimeline({ runs }: SyncRunTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="glass-card-dark rounded-xl p-5 border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">최근 실행 이력</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <FileText className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">아직 실행 이력이 없습니다</span>
          <span className="text-xs mt-1">수동 동기화로 첫 실행을 시작하거나 매일 03:00 KST Cron을 기다리세요</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card-dark rounded-xl p-5 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">최근 실행 이력</h2>
          <span className="text-xs text-gray-500">최근 {runs.length}건</span>
        </div>
      </div>

      <div className="space-y-2">
        {runs.map((run) => {
          const cfg = STATUS_CONFIG[run.status];
          const Icon = cfg.icon;
          const isExpanded = expandedId === run.id;
          const hasDetails = run.error_snippet || run.error_code;

          return (
            <div
              key={run.id}
              className={`
                rounded-xl border transition-colors
                ${isExpanded ? 'border-white/20 bg-white/[0.03]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.03]'}
              `}
            >
              <button
                onClick={() => hasDetails && setExpandedId(isExpanded ? null : run.id)}
                disabled={!hasDetails}
                className={`w-full flex items-center gap-3 p-3 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex-shrink-0">
                  <Icon
                    className={`w-5 h-5 ${cfg.spin ? 'animate-spin' : ''}`}
                    style={{ color: cfg.color }}
                  />
                </div>

                <div className="flex-shrink-0 w-32">
                  <div className="text-xs font-tech tabular-nums text-gray-300">{formatKst(run.started_at)}</div>
                  <div className="text-[10px] text-gray-500 font-tech tabular-nums">
                    {durationMs(run.started_at, run.finished_at)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-md"
                    style={{ color: cfg.color, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}
                  >
                    {cfg.label}
                  </span>
                  {run.dry_run && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30">
                      <FlaskConical className="w-2.5 h-2.5" />
                      dry-run
                    </span>
                  )}
                </div>

                <div className="flex-1 flex items-center gap-4 text-[11px] text-gray-400 font-tech tabular-nums">
                  <span>
                    <span className="text-gray-600">pages</span> <span className="text-white">{run.pages_fetched}</span>
                  </span>
                  <span>
                    <span className="text-gray-600">upsert</span> <span className="text-white">{run.records_upserted}</span>
                  </span>
                  <span>
                    <span className="text-gray-600">queue</span> <span className="text-white">{run.records_queued}</span>
                  </span>
                  {run.error_code && (
                    <span className="text-red-400">
                      <span className="text-red-600">err</span> {run.error_code}
                    </span>
                  )}
                </div>

                {hasDetails && (
                  <span className="text-xs text-gray-500">{isExpanded ? '접기' : '상세'}</span>
                )}
              </button>

              {isExpanded && hasDetails && (
                <div className="px-3 pb-3 pt-0">
                  <div className="p-3 rounded-lg bg-black/30 border border-white/5 text-xs">
                    {run.error_code && (
                      <div className="mb-2">
                        <span className="text-gray-500">error_code:</span>{' '}
                        <span className="text-red-400 font-mono">{run.error_code}</span>
                      </div>
                    )}
                    {run.error_snippet && (
                      <div>
                        <span className="text-gray-500">snippet:</span>
                        <pre className="mt-1 text-gray-300 font-mono whitespace-pre-wrap break-all">{run.error_snippet}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
