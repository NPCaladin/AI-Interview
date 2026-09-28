'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { 사무직군, 개발직군 } from '@/lib/constants';
import type { JobDetail } from './shared';

interface Mismatch {
  job: string;
  reason: string;
}

/**
 * UI 직군 목록(lib/constants 사무직군·개발직군) vs DB 직군 비교 경고.
 * (a) UI 에는 있는데 DB 에 없는 직군, (b) DB 에 있는데 활성 문항 0건인 직군. 표시만 한다.
 */
export function computeJobMismatches(jobs: JobDetail[]): Mismatch[] {
  const uiJobs = [...사무직군, ...개발직군];
  const dbNames = new Set(jobs.map((j) => j.job_name));
  const result: Mismatch[] = [];
  uiJobs.forEach((name) => {
    if (!dbNames.has(name)) result.push({ job: name, reason: 'DB 에 직군 없음' });
  });
  jobs.forEach((j) => {
    if (j.active_question_count === 0) {
      result.push({
        job: j.job_name,
        reason: j.question_count === 0 ? 'DB 문항 0건' : `활성 문항 0건 (비활성 ${j.question_count}건)`,
      });
    }
  });
  return result;
}

export default function JobMismatchBanner({ jobs, loaded }: { jobs: JobDetail[]; loaded: boolean }) {
  const mismatches = useMemo(() => computeJobMismatches(jobs), [jobs]);
  if (!loaded || mismatches.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-[#f59e0b] mt-0.5 flex-shrink-0" />
        <div className="min-w-0 font-sans">
          <p className="text-sm font-bold text-[#f59e0b] break-keep [text-wrap:balance]">
            면접 화면 직군 목록과 DB 문항 데이터가 맞지 않는 직군이 있습니다
          </p>
          <p className="text-xs text-gray-400 mt-1 break-keep [overflow-wrap:break-word] [text-wrap:pretty]">
            해당 직군을 선택한 학생은 기출 질문 없이 면접이 진행될 수 있습니다. 데이터 정정은 별도로 진행해 주세요.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {mismatches.map((m) => (
              <li key={`${m.job}-${m.reason}`} className="text-xs text-gray-200 break-keep">
                <span className="font-medium">{m.job}</span>
                <span className="text-gray-500"> — {m.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
