import fs from 'fs';
import path from 'path';
import type { InterviewData } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// 5분 TTL 캐시
let cachedData: InterviewData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchFromSupabase(): Promise<InterviewData | null> {
  const [jobsRes, questionsRes, personalityRes, criteriaRes] = await Promise.all([
    supabase.from('interview_jobs').select('job_name, keywords'),
    supabase.from('interview_questions').select('job_name, raw_text'),
    supabase.from('interview_personality_questions').select('category, question'),
    supabase.from('interview_eval_criteria').select('criterion').order('sort_order'),
  ]);

  if (jobsRes.error || questionsRes.error || personalityRes.error || criteriaRes.error) {
    logger.error('[serverInterviewData] Supabase fetch 오류');
    return null;
  }

  if (!jobsRes.data?.length) return null;

  // 직군별_데이터 재조립
  const 직군별_데이터: NonNullable<InterviewData['직군별_데이터']> = {};
  for (const job of jobsRes.data) {
    직군별_데이터[job.job_name] = {
      필수_키워드: job.keywords || [],
      기출_질문: [],
    };
  }
  for (const q of questionsRes.data) {
    const job = 직군별_데이터[q.job_name];
    if (job) {
      job.기출_질문!.push(q.raw_text);
    }
  }

  // 공통_인성_질문 재조립
  const 공통_인성_질문: NonNullable<InterviewData['공통_인성_질문']> = {};
  for (const pq of personalityRes.data) {
    const cat = pq.category as keyof NonNullable<InterviewData['공통_인성_질문']>;
    if (!공통_인성_질문[cat]) {
      (공통_인성_질문 as Record<string, string[]>)[cat] = [];
    }
    ((공통_인성_질문 as Record<string, string[]>)[cat]).push(pq.question);
  }

  return {
    공통_평가_기준: criteriaRes.data.map((c) => c.criterion),
    직군별_데이터,
    공통_인성_질문,
  };
}

function loadFromFile(): InterviewData | null {
  try {
    const filePath = path.join(process.cwd(), 'public', 'interview_data.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as InterviewData;
  } catch {
    return null;
  }
}

export async function getInterviewData(): Promise<InterviewData | null> {
  // 캐시 유효하면 즉시 반환
  if (cachedData && Date.now() < cacheExpiry) return cachedData;

  // Supabase에서 로드 시도
  try {
    const dbData = await fetchFromSupabase();
    if (dbData) {
      cachedData = dbData;
      cacheExpiry = Date.now() + CACHE_TTL_MS;
      logger.debug('[serverInterviewData] Supabase에서 로드 완료');
      return cachedData;
    }
  } catch {
    logger.error('[serverInterviewData] Supabase 로드 실패, JSON 폴백 사용');
  }

  // JSON 파일 폴백
  const fileData = loadFromFile();
  if (fileData) {
    cachedData = fileData;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    logger.debug('[serverInterviewData] JSON 파일에서 로드 완료 (폴백)');
  }
  return cachedData;
}
