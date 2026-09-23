'use client';

import './print.css';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReportPrint from '@/components/print/ReportPrint';
import {
  REPORT_PRINT_PATH,
  loadReportPrintPayload,
  type ReportPrintPayload,
} from '@/lib/reportPrint';
import { sanitizeFilePart } from '@/lib/reportUtils';

type Status = 'loading' | 'ready' | 'empty';

/** ISO → KST yyyy-MM-dd (크로미움 PDF 기본 파일명용) */
function toKstDateStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function ReportPrintPage() {
  const [payload, setPayload] = useState<ReportPrintPayload | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const autoRef = useRef(false);
  const printedRef = useRef(false);

  // 마운트: 라우트 클래스 + 페이로드 로드 (useSearchParams 대신 window.location.search)
  useEffect(() => {
    document.body.classList.add('rp-route');
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    autoRef.current = params.get('auto') === '1';
    if (params.get('transcript') === '1') setIncludeTranscript(true);

    const load = async () => {
      let data: ReportPrintPayload | null = null;
      if (process.env.NODE_ENV !== 'production') {
        if (params.get('fixture') === '1') {
          const mod = await import('@/lib/fixtures/sampleReport');
          data = mod.SAMPLE_PRINT_PAYLOAD;
        }
      }
      if (!data) data = loadReportPrintPayload();
      if (cancelled) return;

      if (!data) {
        setStatus('empty');
        return;
      }
      setPayload(data);
      setStatus('ready');
      document.title = `면접결과_${sanitizeFilePart(data.selectedCompany)}_${toKstDateStamp(data.generatedAt)}`;
    };
    void load();

    return () => {
      cancelled = true;
      document.body.classList.remove('rp-route');
    };
  }, []);

  // 자동 인쇄 (?auto=1): 폰트 로드 + 레이아웃 2프레임 대기 후 1회만
  useEffect(() => {
    if (status !== 'ready' || !autoRef.current || printedRef.current) return;
    printedRef.current = true;
    window.history.replaceState(null, '', REPORT_PRINT_PATH);

    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) window.print();
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.href = '/';
    }, 150);
  };

  if (status === 'loading') {
    return (
      <div className="rp-screen">
        <div className="mx-auto h-[60vh] w-full max-w-[210mm] animate-pulse rounded bg-gray-300/60" />
      </div>
    );
  }

  if (status === 'empty' || !payload) {
    return (
      <div className="rp-screen flex items-center justify-center">
        <div className="max-w-md rounded-lg bg-white p-8 text-center text-gray-800 shadow">
          <p className="mb-6 leading-relaxed break-keep text-pretty">
            출력할 리포트가 없습니다. 면접 결과 화면에서 PDF 버튼을 눌러주세요.
          </p>
          <Link
            href="/"
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            처음으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rp-screen">
      <div className="rp-toolbar print:hidden mx-auto mb-4 w-full max-w-[210mm] rounded-lg bg-white p-3 text-gray-800 shadow">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            PDF 저장 / 인쇄
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeTranscript}
              onChange={(e) => setIncludeTranscript(e.target.checked)}
              className="h-4 w-4"
            />
            대화 기록 포함
          </label>
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            닫기
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500 break-keep text-pretty">
          인쇄 대화상자에서 대상 &lsquo;PDF로 저장&rsquo;, 용지 A4, 배경 그래픽 켜기. 페이지 번호가 필요하면
          &lsquo;머리글 및 바닥글&rsquo;을 켜세요.
        </p>
      </div>
      <ReportPrint payload={payload} includeTranscript={includeTranscript} />
    </div>
  );
}
