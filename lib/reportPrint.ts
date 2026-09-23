/**
 * 인쇄 전용 라우트(/report/print)로 리포트를 넘기기 위한 localStorage 페이로드.
 * PDF 버튼 클릭마다 덮어쓰고 유지 → 인쇄 탭 새로고침·재인쇄 가능. 로그아웃 시 삭제.
 */
import type { GameInterviewReport } from '@/lib/types';

export const REPORT_PRINT_STORAGE_KEY = 'eveni.reportPrint.v1';
export const REPORT_PRINT_PATH = '/report/print';

export interface PrintMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PrintStudent {
  name: string;
  code: string;
}

export interface ReportPrintPayload {
  version: 1;
  report: GameInterviewReport;
  messages: PrintMessage[];
  selectedJob: string;
  selectedCompany: string;
  student: PrintStudent | null;
  /** ISO 8601 */
  generatedAt: string;
  totalQuestions: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 얕은 타입가드 */
function isReportPrintPayload(x: unknown): x is ReportPrintPayload {
  if (!isRecord(x)) return false;
  if (x.version !== 1) return false;
  const report = x.report;
  if (!isRecord(report)) return false;
  if (report.detailed_feedback !== undefined && !Array.isArray(report.detailed_feedback)) return false;
  if (!Array.isArray(x.messages)) return false;
  return true;
}

/** 저장 성공 여부 반환 (QuotaExceeded / SecurityError 등 → false) */
export function saveReportPrintPayload(p: ReportPrintPayload): boolean {
  try {
    window.localStorage.setItem(REPORT_PRINT_STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function loadReportPrintPayload(): ReportPrintPayload | null {
  try {
    const raw = window.localStorage.getItem(REPORT_PRINT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isReportPrintPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearReportPrintPayload(): void {
  try {
    window.localStorage.removeItem(REPORT_PRINT_STORAGE_KEY);
  } catch {
    // localStorage 접근 실패 시 무시
  }
}

export function buildPrintUrl(opts: { auto?: boolean }): string {
  return REPORT_PRINT_PATH + (opts.auto ? '?auto=1' : '');
}
