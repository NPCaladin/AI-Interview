import fs from 'fs';
import path from 'path';
import type { InterviewData } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// 5분 TTL 캐시
let cachedData: InterviewData | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** PostgREST 기본 max-rows(1000) 캡 회피용 페이지 크기 */
const PAGE_SIZE = 1000;

/**
 * 활성 행 전량 로드 (1000행 단위 .range() 루프).
 * id 로 안정 정렬해 페이지 경계에서 누락·중복이 없도록 한다.
 */
async function fetchAllActive<T>(table: string, columns: string): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: [], error };
    const rows = (data || []) as unknown as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

/** 어드민 문항 쓰기 후 호출 — 다음 요청에서 DB 를 다시 읽게 한다 */
export function invalidateInterviewDataCache(): void {
  cachedData = null;
  cacheExpiry = 0;
}

async function fetchFromSupabase(): Promise<InterviewData | null> {
  const [jobsRes, questionsRes, personalityRes, criteriaRes] = await Promise.all([
    supabase.from('interview_jobs').select('job_name, keywords').eq('is_active', true),
    fetchAllActive<{ job_name: string; raw_text: string }>('interview_questions', 'job_name, raw_text'),
    fetchAllActive<{ category: string; question: string }>('interview_personality_questions', 'category, question'),
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
