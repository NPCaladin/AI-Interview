'use client';

import { useState } from 'react';
import { ChevronDown, CheckCircle2, XCircle, GitMerge, Loader2, User, UserCheck, UserX, Clock, ShieldCheck } from 'lucide-react';
import type { ReactivationItem } from './ReactivationQueue';
import MergeSearchPanel from './MergeSearchPanel';
import { Badge } from './ui';
import { isRegularCode } from '@/lib/erp/eligibility';

interface Props {
  item: ReactivationItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAction: (
    id: string,
    action: 'approve' | 'reject' | 'merge',
    extra?: { linked_student_code?: string; note?: string },
  ) => Promise<{ ok: boolean; error?: string; note?: string }>;
  onCheckEligibility: (id: string) => Promise<void>;
  isCheckingEligibility: boolean;
}

type CheckState = 'pass' | 'fail' | 'unknown';

const CHECK_MARK: Record<CheckState, string> = { pass: '✅', fail: '❌', unknown: '⏳' };

/** 4조건 체크 상태 — 자격 미확인이면 정규 V 학번만 로컬 판정, 나머지는 ⏳ */
function eligibilityChecks(item: ReactivationItem): Array<{ label: string; state: CheckState }> {
  const e = item.eligibility;
  const bool = (v: boolean | null | undefined, passWhen: boolean): CheckState =>
    v === null || v === undefined ? 'unknown' : v === passWhen ? 'pass' : 'fail';
  const codeRegular = e ? e.code_regular : isRegularCode(item.student_code);
  const dup = e?.phone_dup_count;
  return [
    { label: '정규 V 학번', state: codeRegular ? 'pass' : 'fail' },
    { label: 'ERP 미삭제', state: bool(e?.is_deleted, false) },
    { label: '활성 수강', state: bool(e?.enrollment_active, true) },
    {
      label: '전화번호 중복 없음',
      state: dup === null || dup === undefined ? 'unknown' : dup === 0 ? 'pass' : 'fail',
    },
  ];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3600_000);
  const day = Math.floor(diff / 86400_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  return `${day}일 전`;
}

function absoluteKst(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

const STATUS_CONFIG = {
  pending:  { label: '대기중', color: '#f59e0b' },
  approved: { label: '승인됨', color: '#00D9A5' },
  rejected: { label: '거부됨', color: '#ef4444' },
  merged:   { label: '병합됨', color: '#8b5cf6' },
} as const;

const SOURCE_CONFIG = {
  case1_new_code: {
    label: '신규 V-번호',
    color: '#f59e0b',
    icon: User,
    hint: '이전 수강 이력과 동일인일 가능성 — 병합 검토 필요',
  },
  case2_existing_code: {
    label: '재수강 (기존 코드)',
    color: '#00F2FF',
    icon: UserCheck,
    hint: 'ERP에서 재활성화됨 — 승인 시 즉시 로그인 가능',
  },
} as const;

export default function ReactivationRow({
  item,
  isExpanded,
  onToggleExpand,
  onAction,
  onCheckEligibility,
  isCheckingEligibility,
}: Props) {
  const [isWorking, setIsWorking] = useState(false);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');

  const statusCfg = STATUS_CONFIG[item.status];
  const sourceCfg = SOURCE_CONFIG[item.source];
  const SourceIcon = sourceCfg.icon;
  const isPending = item.status === 'pending';
  const eligibility = item.eligibility;
  const checks = eligibilityChecks(item);

  const performAction = async (action: 'approve' | 'reject' | 'merge', extra?: { linked_student_code?: string }) => {
    setActionError('');
    setIsWorking(true);
    const result = await onAction(item.id, action, { ...extra, note: note.trim() || undefined });
    setIsWorking(false);
    if (!result.ok) {
      setActionError(result.error || '처리 실패');
    }
  };

  return (
    <div className={isExpanded ? 'bg-white/[0.02]' : ''}>
      {/* 헤더 행 */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-shrink-0 p-2 rounded-lg" style={{ background: `${sourceCfg.color}15`, border: `1px solid ${sourceCfg.color}30` }}>
          <SourceIcon className="w-4 h-4" style={{ color: sourceCfg.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-sm text-[#00F2FF]">{item.student_code}</span>
            <span className="text-sm text-gray-300">{item.student?.name || '(이름 미상)'}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{ color: sourceCfg.color, background: `${sourceCfg.color}15`, border: `1px solid ${sourceCfg.color}30` }}>
              {sourceCfg.label}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{ color: statusCfg.color, background: `${statusCfg.color}15`, border: `1px solid ${statusCfg.color}30` }}>
              {statusCfg.label}
            </span>
            {eligibility?.all_pass && <Badge tone="green">4조건 충족</Badge>}
            {eligibility?.source === 'unavailable' && (
              <Badge tone="amber">ERP 미확인 — 자격 조회 API 준비 전, 수동 판단</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 font-tech">
            <span className="flex items-center gap-1" title={absoluteKst(item.transition_at)}>
              <Clock className="w-3 h-3" />
              <span className="tabular-nums">{relativeTime(item.transition_at)}</span>
            </span>
            {item.linked_student_code && (
              <span className="flex items-center gap-1">
                <GitMerge className="w-3 h-3" />
                <span className="font-mono">{item.linked_student_code}</span>
              </span>
            )}
            {item.reviewed_at && (
              <span>처리 {relativeTime(item.reviewed_at)}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-400 [word-break:keep-all]">
            {checks.map((c) => (
              <span key={c.label} className="whitespace-nowrap">
                {CHECK_MARK[c.state]} {c.label}
              </span>
            ))}
            {eligibility?.enrollment_status && (
              <span className="text-gray-500">ERP 상태: {eligibility.enrollment_status}</span>
            )}
            {item.eligibility_checked_at ? (
              <span className="text-gray-500" title={absoluteKst(item.eligibility_checked_at)}>
                확인 {absoluteKst(item.eligibility_checked_at)}
              </span>
            ) : (
              <span className="text-gray-600">자격 미확인</span>
            )}
          </div>
        </div>

        <ChevronDown className={`flex-shrink-0 w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* 확장 패널 */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-4">
          {/* 컨텍스트 정보 */}
          <div className="p-3 rounded-lg bg-black/20 border border-white/5">
            <div className="flex items-start gap-2 text-xs text-gray-400">
              <span className="mt-0.5" style={{ color: sourceCfg.color }}>●</span>
              <span>{sourceCfg.hint}</span>
            </div>
            {item.student && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">현재 is_active:</span>{' '}
                  {item.student.is_active
                    ? <span className="text-[#00D9A5]">✓ 활성</span>
                    : <span className="text-gray-500"><UserX className="w-3 h-3 inline" /> 비활성</span>
                  }
                </div>
                <div>
                  <span className="text-gray-500">등록일:</span>{' '}
                  <span className="text-gray-300 font-tech tabular-nums">{absoluteKst(item.student.created_at)}</span>
                </div>
              </div>
            )}
            {item.linked_student && (
              <div className="mt-3 p-2 rounded bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 text-xs">
                <div className="text-[#8b5cf6] mb-1">병합 대상</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#00F2FF]">{item.linked_student.code}</span>
                  <span className="text-gray-300">{item.linked_student.name}</span>
                </div>
              </div>
            )}
            {item.note && (
              <div className="mt-3 text-xs">
                <span className="text-gray-500">메모:</span>{' '}
                <span className="text-gray-300">{item.note}</span>
              </div>
            )}
            {eligibility?.error && (
              <div className="mt-3 text-xs text-[#f59e0b] [word-break:keep-all] [overflow-wrap:break-word]">
                ERP 조회 결과: {eligibility.error}
              </div>
            )}
            {eligibility?.same_name_count !== null && eligibility?.same_name_count !== undefined && (
              <div className="mt-2 text-xs text-gray-500">
                동명 학번 수(참고): <span className="font-tech tabular-nums">{eligibility.same_name_count}</span>
              </div>
            )}
            {isPending && (
              <button
                type="button"
                onClick={() => onCheckEligibility(item.id)}
                disabled={isCheckingEligibility || isWorking}
                className="
                  mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-white/5 border border-white/10 text-gray-300
                  hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors
                "
              >
                {isCheckingEligibility ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>{isCheckingEligibility ? '자격 확인 중…' : '자격 확인'}</span>
              </button>
            )}
          </div>

          {/* 케이스 1: 병합 검색 패널 */}
          {isPending && item.source === 'case1_new_code' && (
            <MergeSearchPanel
              currentName={item.student?.name || ''}
              currentCode={item.student_code}
              onMerge={async (linkedCode) => {
                await performAction('merge', { linked_student_code: linkedCode });
              }}
              disabled={isWorking}
            />
          )}

          {/* 액션 (pending일 때만) */}
          {isPending && (
            <div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="메모 (선택) — 판단 근거나 특이사항"
                rows={2}
                className="
                  w-full px-3 py-2 rounded-lg text-xs
                  bg-white/[0.02] border border-white/10
                  text-white placeholder-gray-600
                  focus:outline-none focus:border-white/20
                  resize-none
                "
              />
              {actionError && (
                <div className="mt-2 text-xs text-red-400">{actionError}</div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => performAction('approve')}
                  disabled={isWorking}
                  className="
                    flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
                    bg-gradient-to-r from-[#00D9A5] to-[#00F2FF] text-dark-900
                    hover:shadow-[0_0_16px_rgba(0,242,255,0.3)]
                    disabled:opacity-50 transition-all
                  "
                >
                  {isWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{item.source === 'case1_new_code' ? '신규로 승인' : '승인'}</span>
                </button>
                <button
                  onClick={() => performAction('reject')}
                  disabled={isWorking}
                  className="
                    flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
                    bg-red-500/10 border border-red-500/30 text-red-400
                    hover:bg-red-500/20 hover:border-red-500/50
                    disabled:opacity-50 transition-all
                  "
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>거부</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
