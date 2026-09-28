'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Pencil, RotateCcw, Save, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adminFetch } from '@/lib/adminFetch';
import { formatKstDateTime, getPassTone } from '@/lib/reportUtils';
import {
  Badge,
  ConfirmModal,
  DataTable,
  EmptyState,
  JsonDiff,
  PageHeader,
  ScoreBadge,
  StatTile,
  type BadgeTone,
  type DataTableColumn,
} from '@/components/admin/ui';

// ─── 타입 ────────────────────────────────────────────────

interface StudentDetail {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  weekly_limit: number;
  source: string | null;
  sync_exempt: boolean | null;
  sync_exempt_reason: string | null;
  sync_exempt_until: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
}

interface UsageInfo {
  remaining: number | null;
  limit: number;
  used: number | null;
  weeks: Array<{ week_start: string; count: number }>;
}

interface SessionItem {
  id: string;
  job_name: string | null;
  company_name: string | null;
  status: string;
  question_count: number | null;
  started_at: string | null;
  analysis_completed_at: string | null;
  total_score: number | null;
  pass_prediction: string | null;
  summary_title: string | null;
  report_version: number | null;
  is_dev: boolean | null;
}

interface QueueItem {
  id: string;
  source: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  created_at: string;
}

interface AuditItem {
  id: string;
  actor: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface SessionStats {
  count: number;
  analyzed: number;
  avg_score: number | null;
  best: number | null;
  last_at: string | null;
}

interface DetailResponse {
  student: StudentDetail;
  usage: UsageInfo;
  sessions: SessionItem[];
  queue: QueueItem[];
  audit: AuditItem[];
  stats: SessionStats;
}

// ─── 표시용 매핑 ─────────────────────────────────────────

const SESSION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  in_progress: { label: '진행 중', tone: 'cyan' },
  ended: { label: '종료', tone: 'amber' },
  analyzed: { label: '분석 완료', tone: 'green' },
};

const QUEUE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: '대기', tone: 'amber' },
  approved: { label: '승인', tone: 'green' },
  rejected: { label: '거절', tone: 'red' },
  merged: { label: '병합', tone: 'purple' },
};

const QUEUE_SOURCE: Record<string, string> = {
  case1_new_code: '신규 코드',
  case2_existing_code: '기존 코드',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: '수동 등록',
  erp_sync: 'ERP 동기화',
  erp_migration: 'ERP 이관',
};

const ACTION_TONE: Record<string, BadgeTone> = {
  STUDENT_CREATE: 'green',
  STUDENT_UPDATE: 'cyan',
  STUDENT_TOGGLE: 'purple',
  STUDENT_DELETE: 'red',
  STUDENT_RESET_USAGE: 'amber',
  STUDENT_EXEMPT_SET: 'amber',
  STUDENT_NOTE_UPDATE: 'gray',
};

const PASS_TONE: Record<string, BadgeTone> = { pass: 'green', hold: 'amber', fail: 'red' };

const CARD = 'glass-card-dark rounded-xl border border-white/10 p-5';
const INPUT =
  'bg-dark-700/80 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[#00F2FF]/60 focus:outline-none transition-colors';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#00F2FF]/15 text-[#00F2FF] border border-[#00F2FF]/40 hover:bg-[#00F2FF]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-300 border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const TOOLTIP_STYLE = {
  background: '#12121a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  fontSize: 12,
  color: '#e5e7eb',
};

function fmtKst(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatKstDateTime(iso) || '—';
}

function shortDate(ymd: string): string {
  const [, m, d] = ymd.slice(0, 10).split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function todayKstYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function SectionTitle({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <h2 className="text-sm font-semibold text-white [word-break:keep-all] [text-wrap:balance]">{children}</h2>
      {extra}
    </div>
  );
}

// ─── 페이지 ──────────────────────────────────────────────

export default function AdminStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // 프로필 편집 상태
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [limitDraft, setLimitDraft] = useState('');

  // 예외 폼
  const [exemptDraft, setExemptDraft] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  const [untilDraft, setUntilDraft] = useState('');

  // 메모
  const [noteDraft, setNoteDraft] = useState('');

  // 모달
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // 감사 로그 펼침
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/students/${id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError((json as { error?: string }).error || '학생 정보를 불러오지 못했습니다.');
        return;
      }
      const d = json as DetailResponse;
      setData(d);
      setLoadError(null);
      setNameDraft(d.student.name);
      setLimitDraft(String(d.student.weekly_limit));
      setExemptDraft(!!d.student.sync_exempt);
      setReasonDraft(d.student.sync_exempt_reason ?? '');
      setUntilDraft(d.student.sync_exempt_until ? d.student.sync_exempt_until.slice(0, 10) : '');
      setNoteDraft(d.student.admin_note ?? '');
    } catch {
      setLoadError('학생 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const patchStudent = useCallback(
    async (key: string, body: Record<string, unknown>, successMsg: string): Promise<boolean> => {
      setSaving(key);
      try {
        const res = await adminFetch(`/api/admin/students/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error((json as { error?: string }).error || '저장에 실패했습니다.');
          return false;
        }
        toast.success(successMsg);
        await load();
        return true;
      } catch {
        toast.error('저장에 실패했습니다.');
        return false;
      } finally {
        setSaving(null);
      }
    },
    [id, load],
  );

  const handleSaveName = async () => {
    const v = nameDraft.trim();
    if (v.length < 1 || v.length > 50) {
      toast.error('이름은 1~50자여야 합니다.');
      return;
    }
    const ok = await patchStudent('name', { name: v }, '이름을 저장했습니다.');
    if (ok) setEditingName(false);
  };

  const handleSaveLimit = async () => {
    const n = Number(limitDraft);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      toast.error('주간 한도는 1~100 사이 정수여야 합니다.');
      return;
    }
    await patchStudent('limit', { weekly_limit: n }, '주간 한도를 저장했습니다.');
  };

  const handleToggleActive = async () => {
    if (!data) return;
    const next = !data.student.is_active;
    const ok = await patchStudent('active', { is_active: next }, next ? '활성화했습니다.' : '비활성화했습니다.');
    if (ok) setConfirmToggle(false);
  };

  const handleSaveExempt = async () => {
    const reason = reasonDraft.trim();
    if (reason.length > 200) {
      toast.error('예외 사유는 200자 이하여야 합니다.');
      return;
    }
    await patchStudent(
      'exempt',
      {
        sync_exempt: exemptDraft,
        sync_exempt_reason: reason || null,
        sync_exempt_until: untilDraft || null,
      },
      '동기화 예외 설정을 저장했습니다.',
    );
  };

  const handleSaveNote = async () => {
    if (noteDraft.length > 2000) {
      toast.error('관리자 메모는 2000자 이하여야 합니다.');
      return;
    }
    await patchStudent('note', { admin_note: noteDraft.trim() || null }, '관리자 메모를 저장했습니다.');
  };

  const handleResetUsage = async () => {
    setSaving('reset');
    try {
      const res = await adminFetch(`/api/admin/students/${id}/reset-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((json as { error?: string }).error || '사용량 초기화에 실패했습니다.');
        return;
      }
      toast.success(`이번 주 사용량을 초기화했습니다. (${(json as { deleted_count?: number }).deleted_count ?? 0}건 삭제)`);
      setConfirmReset(false);
      await load();
    } catch {
      toast.error('사용량 초기화에 실패했습니다.');
    } finally {
      setSaving(null);
    }
  };

  const toggleAudit = (auditId: string) => {
    setExpandedAudit((prev) => {
      const next = new Set(prev);
      if (next.has(auditId)) next.delete(auditId);
      else next.add(auditId);
      return next;
    });
  };

  // 차트 데이터
  const weekChart = useMemo(
    () => (data?.usage.weeks ?? []).map((w) => ({ label: shortDate(w.week_start), week_start: w.week_start, count: w.count })),
    [data],
  );

  const scoreChart = useMemo(
    () =>
      (data?.sessions ?? [])
        .filter((s) => s.status === 'analyzed' && typeof s.total_score === 'number' && s.started_at)
        .slice()
        .reverse()
        .map((s) => ({
          label: shortDate(
            new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Seoul',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(s.started_at as string)),
          ),
          score: Math.round(s.total_score as number),
        })),
    [data],
  );

  const sessionColumns: Array<DataTableColumn<SessionItem>> = [
    {
      key: 'started_at',
      header: '시작 (KST)',
      className: 'whitespace-nowrap text-xs',
      render: (s) => (
        <Link href={`/admin/sessions/${s.id}`} className="text-gray-300 hover:text-[#00F2FF] transition-colors">
          {fmtKst(s.started_at)}
        </Link>
      ),
    },
    { key: 'job', header: '직군', render: (s) => s.job_name || '—' },
    { key: 'company', header: '회사', render: (s) => s.company_name || '—' },
    {
      key: 'status',
      header: '상태',
      render: (s) => {
        const st = SESSION_STATUS[s.status] ?? { label: s.status, tone: 'gray' as BadgeTone };
        return <Badge tone={st.tone}>{st.label}</Badge>;
      },
    },
    {
      key: 'q',
      header: 'Q수',
      className: 'text-center tabular-nums',
      render: (s) => s.question_count ?? '—',
    },
    { key: 'score', header: '총점', render: (s) => <ScoreBadge score={s.total_score} /> },
    {
      key: 'pass',
      header: '합격예측',
      render: (s) =>
        s.pass_prediction ? (
          <Badge tone={PASS_TONE[getPassTone(s.pass_prediction)]}>{s.pass_prediction}</Badge>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
    {
      key: 'dev',
      header: 'dev',
      render: (s) => (s.is_dev ? <Badge tone="purple">dev</Badge> : <span className="text-gray-600">—</span>),
    },
  ];

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-[#00F2FF] animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <PageHeader
          title="학생 상세"
          actions={
            <button type="button" onClick={() => router.push('/admin/students')} className={BTN_GHOST}>
              <ArrowLeft className="w-3.5 h-3.5" />
              목록으로
            </button>
          }
        />
        <div className={CARD}>
          <EmptyState title={loadError || '학생을 찾을 수 없습니다.'} />
        </div>
      </div>
    );
  }

  const { student, usage, sessions, queue, audit, stats } = data;
  const today = todayKstYmd();
  const exemptUntil = student.sync_exempt_until ? student.sync_exempt_until.slice(0, 10) : null;
  const exemptExpired = !!student.sync_exempt && !!exemptUntil && exemptUntil < today;
  const limitChanged = limitDraft !== String(student.weekly_limit);
  const exemptChanged =
    exemptDraft !== !!student.sync_exempt ||
    reasonDraft.trim() !== (student.sync_exempt_reason ?? '') ||
    untilDraft !== (exemptUntil ?? '');
  const noteChanged = (noteDraft.trim() || null) !== (student.admin_note ?? null);

  return (
    <div className="max-w-7xl mx-auto space-y-5 [word-break:keep-all] [overflow-wrap:break-word]">
      <PageHeader
        title={`${student.code} · ${student.name}`}
        subtitle={`${SOURCE_LABEL[student.source ?? ''] ?? student.source ?? '출처 미상'} · 등록 ${fmtKst(student.created_at)}`}
        actions={
          <Link href="/admin/students" className={BTN_GHOST}>
            <ArrowLeft className="w-3.5 h-3.5" />
            목록으로
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 프로필 */}
        <section className={CARD}>
          <SectionTitle>프로필</SectionTitle>
          <dl className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-3 text-sm items-center">
            <dt className="text-xs text-gray-400">코드</dt>
            <dd className="font-mono text-[#00F2FF]">{student.code}</dd>

            <dt className="text-xs text-gray-400">이름</dt>
            <dd>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={50}
                    className={`${INPUT} flex-1 min-w-0`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') {
                        setEditingName(false);
                        setNameDraft(student.name);
                      }
                    }}
                  />
                  <button type="button" onClick={handleSaveName} disabled={saving === 'name'} className={BTN_PRIMARY}>
                    {saving === 'name' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(student.name);
                    }}
                    className={BTN_GHOST}
                    aria-label="취소"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-white">{student.name}</span>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="p-1 rounded text-gray-500 hover:text-[#00F2FF] hover:bg-[#00F2FF]/10 transition-colors"
                    title="이름 수정"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </dd>

            <dt className="text-xs text-gray-400">상태</dt>
            <dd className="flex items-center gap-3">
              <Badge tone={student.is_active ? 'green' : 'red'}>{student.is_active ? '활성' : '비활성'}</Badge>
              <button
                type="button"
                role="switch"
                aria-checked={student.is_active}
                onClick={() => setConfirmToggle(true)}
                disabled={saving === 'active'}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
                  student.is_active ? 'bg-[#00D9A5]/40 border-[#00D9A5]/60' : 'bg-white/10 border-white/20'
                }`}
                title={student.is_active ? '비활성화' : '활성화'}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    student.is_active ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </dd>

            <dt className="text-xs text-gray-400">주간 한도</dt>
            <dd className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
                className={`${INPUT} w-24 tabular-nums`}
              />
              <span className="text-xs text-gray-500">회 / 주</span>
              <button
                type="button"
                onClick={handleSaveLimit}
                disabled={!limitChanged || saving === 'limit'}
                className={BTN_PRIMARY}
              >
                {saving === 'limit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                저장
              </button>
            </dd>

            <dt className="text-xs text-gray-400">출처</dt>
            <dd>
              <Badge tone={student.source === 'manual' ? 'gray' : 'cyan'}>
                {SOURCE_LABEL[student.source ?? ''] ?? student.source ?? '—'}
              </Badge>
            </dd>

            <dt className="text-xs text-gray-400">등록</dt>
            <dd className="text-xs text-gray-300">{fmtKst(student.created_at)}</dd>

            <dt className="text-xs text-gray-400">수정</dt>
            <dd className="text-xs text-gray-300">{fmtKst(student.updated_at)}</dd>
          </dl>
        </section>

        {/* 사용량 */}
        <section className={CARD}>
          <SectionTitle
            extra={
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={saving === 'reset' || (usage.used ?? 0) === 0}
                className={BTN_GHOST}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                이번 주 사용량 초기화
              </button>
            }
          >
            사용량
          </SectionTitle>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatTile label="이번 주 사용" value={usage.used ?? '—'} tone="cyan" />
            <StatTile
              label="잔여"
              value={usage.remaining ?? '—'}
              tone={usage.remaining === 0 ? 'red' : 'green'}
            />
            <StatTile label="한도" value={usage.limit} tone="gray" />
          </div>
          <div className="text-xs text-gray-400 mb-2">최근 12주 사용 횟수 (KST 주 시작 기준)</div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekChart} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(v) => [`${v}회`, '사용']}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { week_start?: string } | undefined;
                    return p?.week_start ? `${p.week_start} 주` : '';
                  }}
                />
                <Bar dataKey="count" fill="#00F2FF" fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ERP 동기화 예외 */}
        <section className={CARD}>
          <SectionTitle
            extra={
              student.sync_exempt ? (
                exemptExpired ? (
                  <Badge tone="gray">예외 만료 ({exemptUntil})</Badge>
                ) : (
                  <Badge tone="amber">동기화 예외 중{exemptUntil ? ` ~${exemptUntil}` : ' (무기한)'}</Badge>
                )
              ) : (
                <Badge tone="gray">예외 없음</Badge>
              )
            }
          >
            ERP 동기화 예외
          </SectionTitle>

          {student.sync_exempt && (
            <div className="mb-4 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 px-3 py-2.5 text-xs text-gray-300 leading-relaxed [text-wrap:pretty]">
              현재 이 학생은 ERP에서 비활성으로 내려와도 면접앱 활성 상태가 유지됩니다.
              <br />
              사유: <span className="text-white">{student.sync_exempt_reason || '(미기재)'}</span>
              {' · '}
              해제일: <span className="text-white">{exemptUntil ?? '무기한'}</span>
              {exemptExpired && <span className="text-[#f59e0b]"> — 해제일이 지나 다음 동기화부터 예외가 적용되지 않습니다.</span>}
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-200">동기화 예외 사용</span>
              <button
                type="button"
                role="switch"
                aria-checked={exemptDraft}
                onClick={() => setExemptDraft((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                  exemptDraft ? 'bg-[#f59e0b]/40 border-[#f59e0b]/60' : 'bg-white/10 border-white/20'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    exemptDraft ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            <div>
              <label className="block text-xs text-gray-400 mb-1">사유</label>
              <input
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                maxLength={200}
                placeholder="예: 면접 일정 종료 시까지 예외 활성화"
                className={`${INPUT} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">해제일 (비우면 무기한)</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={untilDraft}
                  onChange={(e) => setUntilDraft(e.target.value)}
                  className={`${INPUT} [color-scheme:dark]`}
                />
                {untilDraft && (
                  <button type="button" onClick={() => setUntilDraft('')} className={BTN_GHOST}>
                    <X className="w-3.5 h-3.5" />
                    지우기
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed [text-wrap:pretty]">
              해제일이 지나면 다음 동기화부터 예외가 자동 해제됩니다(ERP 비활성이면 비활성화됨).
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveExempt}
                disabled={!exemptChanged || saving === 'exempt'}
                className={BTN_PRIMARY}
              >
                {saving === 'exempt' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                저장
              </button>
            </div>
          </div>
        </section>

        {/* 관리자 메모 */}
        <section className={CARD}>
          <SectionTitle extra={<span className="text-xs text-gray-500 tabular-nums">{noteDraft.length}/2000</span>}>
            관리자 메모
          </SectionTitle>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            maxLength={2000}
            rows={8}
            placeholder="학생 관련 내부 메모 (학생에게 노출되지 않음)"
            className={`${INPUT} w-full resize-y leading-relaxed`}
          />
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={!noteChanged || saving === 'note'}
              className={BTN_PRIMARY}
            >
              {saving === 'note' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              저장
            </button>
          </div>
        </section>
      </div>

      {/* 면접 세션 */}
      <section className={CARD}>
        <SectionTitle
          extra={
            <span className="text-xs text-gray-500">
              최근 {sessions.length}건{stats.last_at ? ` · 마지막 ${fmtKst(stats.last_at)}` : ''}
            </span>
          }
        >
          면접 세션
        </SectionTitle>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatTile label="세션 수" value={stats.count} hint={`분석 완료 ${stats.analyzed}건`} tone="cyan" />
          <StatTile label="평균 점수" value={stats.avg_score ?? '—'} tone="green" />
          <StatTile label="최고 점수" value={stats.best !== null ? Math.round(stats.best) : '—'} tone="purple" />
        </div>
        {scoreChart.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-2">총점 추이 (분석 완료 세션)</div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreChart} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}점`, '총점']} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#00D9A5"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#00D9A5' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="-mx-5 border-t border-white/5">
          <DataTable
            columns={sessionColumns}
            rows={sessions}
            rowKey={(s) => s.id}
            emptyText="면접 세션 기록이 없습니다."
            onRowClick={(s) => router.push(`/admin/sessions/${s.id}`)}
          />
        </div>
      </section>

      {/* 재활성화 큐 이력 */}
      <section className={CARD}>
        <SectionTitle>재활성화 큐 이력</SectionTitle>
        {queue.length === 0 ? (
          <EmptyState title="재활성화 큐 이력이 없습니다." />
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['유형', '상태', '처리자', '처리 시각', '메모', '적재 시각'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => {
                  const st = QUEUE_STATUS[q.status] ?? { label: q.status, tone: 'gray' as BadgeTone };
                  return (
                    <tr key={q.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{QUEUE_SOURCE[q.source] ?? q.source}</td>
                      <td className="px-4 py-3">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{q.reviewed_by || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtKst(q.reviewed_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 max-w-xs">{q.note || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtKst(q.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 감사 로그 */}
      <section className={CARD}>
        <SectionTitle extra={<span className="text-xs text-gray-500">최근 20건</span>}>감사 로그</SectionTitle>
        {audit.length === 0 ? (
          <EmptyState title="감사 로그가 없습니다." />
        ) : (
          <ul className="divide-y divide-white/5">
            {audit.map((a) => {
              const open = expandedAudit.has(a.id);
              const hasDetail = !!(a.old_values || a.new_values || a.details);
              return (
                  <li key={a.id} className="py-2.5">
                    <button
                      type="button"
                      onClick={() => hasDetail && toggleAudit(a.id)}
                      className={`w-full flex items-center gap-3 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className="text-gray-500 w-4 shrink-0">
                        {hasDetail ? open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" /> : null}
                      </span>
                      <Badge tone={ACTION_TONE[a.action] ?? 'gray'}>{a.action}</Badge>
                      <span className="text-xs text-gray-300">{a.actor}</span>
                      <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">{fmtKst(a.created_at)}</span>
                    </button>
                    {open && (
                      <div className="mt-3 pl-7 space-y-3">
                        {(a.old_values || a.new_values) && <JsonDiff before={a.old_values} after={a.new_values} />}
                        {a.details && (
                          <pre className="text-xs font-mono bg-black/30 border border-white/10 rounded-lg p-3 overflow-x-auto text-gray-300">
                            {JSON.stringify(a.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirmToggle}
        title={student.is_active ? '학생 비활성화' : '학생 활성화'}
        message={
          student.is_active
            ? `${student.name}(${student.code})을 비활성화할까요?\n비활성 학생은 로그인할 수 없습니다.`
            : `${student.name}(${student.code})을 활성화할까요?`
        }
        confirmLabel={student.is_active ? '비활성화' : '활성화'}
        tone={student.is_active ? 'danger' : 'primary'}
        busy={saving === 'active'}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmToggle(false)}
      />

      <ConfirmModal
        open={confirmReset}
        title="이번 주 사용량 초기화"
        message={`${student.name}(${student.code})의 이번 주 사용 기록(${usage.used ?? 0}건)을 삭제할까요?`}
        confirmLabel="초기화"
        tone="danger"
        busy={saving === 'reset'}
        onConfirm={handleResetUsage}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
