'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/adminFetch';
import { PageHeader } from '@/components/admin/ui';
import JobMismatchBanner from '@/components/admin/questions/JobMismatchBanner';
import JobQuestionsTab from '@/components/admin/questions/JobQuestionsTab';
import PersonalityTab from '@/components/admin/questions/PersonalityTab';
import CriteriaTab from '@/components/admin/questions/CriteriaTab';
import JobKeywordsTab from '@/components/admin/questions/JobKeywordsTab';
import { isSilentError, readError, type JobDetail } from '@/components/admin/questions/shared';

type TabKey = 'job' | 'personality' | 'criteria' | 'keywords';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'job', label: '직군 기출' },
  { key: 'personality', label: '인성 질문' },
  { key: 'criteria', label: '평가 기준' },
  { key: 'keywords', label: '직군 키워드' },
];

export default function AdminQuestionsPage() {
  const [tab, setTab] = useState<TabKey>('job');
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await adminFetch('/api/admin/jobs?detail=1', { cache: 'no-store' });
      if (!res.ok) {
        toast.error(await readError(res, '직군 목록 조회 실패'));
        return;
      }
      const json = (await res.json()) as { items?: JobDetail[] };
      setJobs(json.items ?? []);
      setJobsLoaded(true);
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('직군 목록을 불러오지 못했습니다.');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <div className="max-w-7xl mx-auto font-sans">
      <PageHeader
        title="문항 관리"
        subtitle="직군 기출·인성 질문·평가 기준·직군 키워드 관리 · 변경 사항은 새로 시작하는 면접부터 반영됩니다"
      />

      <JobMismatchBanner jobs={jobs} loaded={jobsLoaded} />

      <div className="flex flex-wrap gap-1 mb-5 border-b border-white/10" role="tablist">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors break-keep ${
                active
                  ? 'border-[#00F2FF] text-[#00F2FF]'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="glass-card-dark rounded-2xl border border-white/10 p-4 sm:p-5">
        {tab === 'job' && <JobQuestionsTab jobs={jobs} onChanged={loadJobs} />}
        {tab === 'personality' && <PersonalityTab />}
        {tab === 'criteria' && <CriteriaTab />}
        {tab === 'keywords' && <JobKeywordsTab jobs={jobs} loading={jobsLoading} onChanged={loadJobs} />}
      </div>
    </div>
  );
}
