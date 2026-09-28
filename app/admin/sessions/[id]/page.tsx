'use client';

import '@/app/report/print/print.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, FileDown, Loader2, MessageSquare } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { formatKstDateTime } from '@/lib/reportUtils';
import { buildPrintUrl, saveReportPrintPayload, type ReportPrintPayload } from '@/lib/reportPrint';
import type { GameInterviewReport } from '@/lib/types';
import ReportPrint from '@/components/print/ReportPrint';
import { PageHeader, Badge, ScoreBadge, EmptyState, type BadgeTone } from '@/components/admin/ui';

type DbStatus = 'in_progress' | 'ended' | 'analyzed';
type DisplayStatus = DbStatus | 'abandoned';

interface SessionDetail {
  id: string;
  student_id: string | null;
  student_code: string;
  student_name: string | null;
  job_name: string;
  company_name: string | null;
  status: DbStatus;
  question_count: number | null;
  started_at: string;
  last_activity_at: string | null;
  ended_at: string | null;
  analysis_completed_at: string | null;
  total_score: number | null;
  pass_prediction: string | null;
  summary_title: string | null;
  analyzed_questions: number | null;
  missing_questions: number[] | null;
  report: GameInterviewReport | null;
  report_version: string | number | null;
  chat_prompt_tokens: number | null;
  chat_completion_tokens: number | null;
  analysis_prompt_tokens: number | null;
  analysis_completion_tokens: number | null;
  model: string | null;
  is_dev: boolean;
}

interface SessionMessage {
  id: string;
  turn_index: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

type Tab = 'report' | 'chat' | 'json';

const ABANDON_MS = 2 * 60 * 60 * 1000;

const STATUS_META: Record<DisplayStatus, { label: string; tone: BadgeTone }> = {
  in_progress: { label: '진행 중', tone: 'cyan' },
  abandoned: { label: '중단', tone: 'gray' },
  ended: { label: '종료', tone: 'amber' },
  analyzed: { label: '분석 완료', tone: 'green' },
};

function displayStatusOf(s: SessionDetail): DisplayStatus {
  if (s.status !== 'in_progress' || !s.last_activity_at) return s.status;
  const last = Date.parse(s.last_activity_at);
  return Number.isFinite(last) && last < Date.now() - ABANDON_MS ? 'abandoned' : 'in_progress';
}

function kst(iso: string | null): string {
  return iso ? formatKstDateTime(iso) || '—' : '—';
}

function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('ko-KR');
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-200 [word-break:keep-all] [overflow-wrap:break-word]">{children}</dd>
    </div>
  );
}

const btnBase =
  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';

export default function AdminSessionDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [tab, setTab] = useState<Tab>('report');
  const [jsonOpen, setJsonOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setIsLoading(true);
      setErrorText('');
      try {
        const res = await adminFetch(`/api/admin/sessions/${encodeURIComponent(id)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => null)) as
          | { session?: SessionDetail; messages?: SessionMessage[]; error?: string }
          | null;
        if (!res.ok || !json?.session) {
          const msg = json?.error ?? `세션 조회 실패 (${res.status})`;
          setErrorText(msg);
          toast.error(msg);
          return;
        }
        setSession(json.session);
        setMessages(json.messages ?? []);
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'AdminFetchError')) return;
        setErrorText('세션을 불러오지 못했습니다.');
        toast.error('세션을 불러오지 못했습니다.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id]);

  const payload = useMemo<ReportPrintPayload | null>(() => {
    if (!session?.report) return null;
    return {
      version: 1,
      report: session.report,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      selectedJob: session.job_name,
      selectedCompany: session.company_name ?? '',
      student: { name: session.student_name ?? '', code: session.student_code },
      generatedAt: session.analysis_completed_at ?? session.started_at,
      totalQuestions: session.question_count ?? 0,
    };
  }, [session, messages]);

  const handleReissuePdf = () => {
    if (!payload) return;
    if (!saveReportPrintPayload(payload)) {
      toast.error('PDF 데이터를 저장하지 못했습니다. 브라우저 저장소를 확인하세요.');
      return;
    }
    window.open(buildPrintUrl({ auto: true }), '_blank');
  };

  const actions = (
    <>
      <button
        type="button"
        onClick={handleReissuePdf}
        disabled={!payload}
        className={`${btnBase} bg-gradient-to-r from-[#00D9A5] to-[#00F2FF] text-dark-900 shadow-[0_0_20px_rgba(0,242,255,0.25)] hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]`}
      >
        <FileDown className="w-4 h-4" />
        <span>PDF 재발급</span>
      </button>
      <Link
        href="/admin/sessions"
        className={`${btnBase} bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10`}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>목록으로</span>
      </Link>
    </>
  );

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <PageHeader title="면접 세션 상세" actions={actions} />
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-7xl mx-auto">
        <PageHeader title="면접 세션 상세" actions={actions} />
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <EmptyState title={errorText || '세션을 찾을 수 없습니다.'} />
        </div>
      </div>
    );
  }

  const status = STATUS_META[displayStatusOf(session)];
  const missing = session.missing_questions ?? [];
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'report', label: '리포트' },
    { value: 'chat', label: `대화 (${messages.length})` },
    { value: 'json', label: '원본 JSON' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="면접 세션 상세"
        subtitle={session.summary_title ?? undefined}
        actions={actions}
      />

      {/* 헤더 카드 */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {session.student_id ? (
            <Link
              href={`/admin/students/${session.student_id}`}
              className="flex items-center gap-2 hover:text-[#00F2FF] hover:underline"
            >
              <span className="font-mono text-sm text-gray-300">{session.student_code}</span>
              <span className="text-lg font-semibold text-white">{session.student_name ?? ''}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-300">{session.student_code}</span>
              <span className="text-lg font-semibold text-white">{session.student_name ?? ''}</span>
            </span>
          )}
          <Badge tone={status.tone}>{status.label}</Badge>
          {session.is_dev && <Badge tone="purple">dev</Badge>}
          <ScoreBadge score={session.total_score} />
          {session.pass_prediction && <span className="text-sm text-gray-300">{session.pass_prediction}</span>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          <InfoItem label="직군">{session.job_name}</InfoItem>
          <InfoItem label="회사">{session.company_name || '—'}</InfoItem>
          <InfoItem label="시작">{kst(session.started_at)}</InfoItem>
          <InfoItem label="종료">{kst(session.ended_at)}</InfoItem>
          <InfoItem label="분석 완료">{kst(session.analysis_completed_at)}</InfoItem>
          <InfoItem label="질문 수">
            <span className="font-tech tabular-nums">{session.question_count ?? 0}</span>
          </InfoItem>
          <InfoItem label="분석된 질문">
            <span className="font-tech tabular-nums">{session.analyzed_questions ?? '—'}</span>
          </InfoItem>
          <InfoItem label="누락 질문">{missing.length > 0 ? missing.join(', ') : '—'}</InfoItem>
          <InfoItem label="모델">{session.model ?? '—'}</InfoItem>
          <InfoItem label="대화 토큰 (in/out)">
            <span className="font-tech tabular-nums">
              {num(session.chat_prompt_tokens)} / {num(session.chat_completion_tokens)}
            </span>
          </InfoItem>
          <InfoItem label="분석 토큰 (in/out)">
            <span className="font-tech tabular-nums">
              {num(session.analysis_prompt_tokens)} / {num(session.analysis_completion_tokens)}
            </span>
          </InfoItem>
          <InfoItem label="리포트 버전">{session.report_version ?? '—'}</InfoItem>
        </dl>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-white/10 mb-4">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.value
                ? 'border-[#00F2FF] text-[#00F2FF]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'report' &&
        (payload ? (
          <div className="bg-white rounded-xl overflow-x-auto p-4">
            <ReportPrint payload={payload} includeTranscript={false} />
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.02]">
            <EmptyState title="분석 리포트 없음" description="이 세션은 아직 분석이 완료되지 않았습니다." />
          </div>
        ))}

      {tab === 'chat' &&
        (messages.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02]">
            <EmptyState
              title="대화 기록 없음"
              icon={<MessageSquare className="w-8 h-8" />}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                    <span className="text-[11px] text-gray-500 mb-1">
                      {isUser ? '지원자' : '면접관'} · #{m.turn_index}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words [word-break:keep-all] [overflow-wrap:break-word] ${
                        isUser
                          ? 'bg-[#00F2FF]/10 border border-[#00F2FF]/20 text-gray-100 rounded-tr-sm'
                          : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {tab === 'json' &&
        (session.report ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <button
              type="button"
              onClick={() => setJsonOpen((v) => !v)}
              className="text-sm text-[#00F2FF] hover:underline"
            >
              {jsonOpen ? '접기' : '펼치기'}
            </button>
            {jsonOpen && (
              <pre className="mt-3 max-h-[70vh] overflow-auto rounded-lg bg-black/40 p-4 text-xs text-gray-300 font-mono">
                {JSON.stringify(session.report, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.02]">
            <EmptyState title="분석 리포트 없음" />
          </div>
        ))}
    </div>
  );
}
