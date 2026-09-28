import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const DEFAULT_TAG = '공통';
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const TAG_MAX = 30;
const MAX_LINES = 200;
const PAGE_SIZE = 1000;
const SKIPPED_SAMPLES = 5;

function normalizeTag(v: unknown): string | null {
  if (v === undefined || v === null) return DEFAULT_TAG;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return DEFAULT_TAG;
  if (t.length > TAG_MAX || /[[\]]/.test(t)) return null;
  return t;
}

/** 해당 직군의 기존 질문 텍스트 전량 (활성·비활성 포함, 1000행 캡 회피 루프) */
async function loadExistingQuestions(jobName: string): Promise<Set<string> | null> {
  const set = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('interview_questions')
      .select('question')
      .eq('job_name', jobName)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      logger.error('[Admin Questions BULK] Existing load error:', error);
      return null;
    }
    const rows = (data || []) as Array<{ question: string }>;
    rows.forEach((r) => set.add(r.question));
    if (rows.length < PAGE_SIZE) break;
  }
  return set;
}

// POST /api/admin/questions/bulk — 여러 줄 일괄 추가 (기존 중복 skip)
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }

    const jobName = typeof body.job_name === 'string' ? body.job_name.trim() : '';
    const tag = normalizeTag(body.company_tag);
    if (!jobName) return NextResponse.json({ error: '직군(job_name)이 필요합니다.' }, { status: 400 });
    if (tag === null) {
      return NextResponse.json(
        { error: `회사 태그는 ${TAG_MAX}자 이하이며 대괄호를 포함할 수 없습니다.` },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.lines) || !body.lines.every((l) => typeof l === 'string')) {
      return NextResponse.json({ error: 'lines 는 문자열 배열이어야 합니다.' }, { status: 400 });
    }

    const lines = (body.lines as string[]).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) {
      return NextResponse.json({ error: '추가할 질문이 없습니다.' }, { status: 400 });
    }
    if (lines.length > MAX_LINES) {
      return NextResponse.json({ error: `한 번에 최대 ${MAX_LINES}줄까지 추가할 수 있습니다.` }, { status: 400 });
    }
    const badIndex = lines.findIndex((l) => l.length < QUESTION_MIN || l.length > QUESTION_MAX);
    if (badIndex >= 0) {
      return NextResponse.json(
        {
          error: `${badIndex + 1}번째 줄이 ${QUESTION_MIN}~${QUESTION_MAX}자 범위를 벗어났습니다: "${lines[badIndex].slice(0, 40)}"`,
        },
        { status: 400 }
      );
    }

    const { data: jobRow, error: jobErr } = await supabase
      .from('interview_jobs')
      .select('job_name')
      .eq('job_name', jobName)
      .maybeSingle();
    if (jobErr) {
      logger.error('[Admin Questions BULK] Job lookup error:', jobErr);
      return NextResponse.json({ error: '직군 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!jobRow) return NextResponse.json({ error: '존재하지 않는 직군입니다.' }, { status: 404 });

    const existing = await loadExistingQuestions(jobName);
    if (!existing) return NextResponse.json({ error: '중복 확인에 실패했습니다.' }, { status: 500 });

    const now = new Date().toISOString();
    const toInsert: Array<Record<string, unknown>> = [];
    const skippedLines: string[] = [];
    for (const q of lines) {
      if (existing.has(q)) {
        skippedLines.push(q);
        continue;
      }
      existing.add(q); // 입력 내 중복도 skip
      toInsert.push({
        job_name: jobName,
        question: q,
        raw_text: `[${tag}] ${q}`,
        company_tag: tag,
        source: 'manual',
        updated_at: now,
      });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('interview_questions').insert(toInsert);
      if (insErr) {
        logger.error('[Admin Questions BULK] Insert error:', insErr);
        return NextResponse.json({ error: '일괄 추가에 실패했습니다.' }, { status: 500 });
      }
      invalidateInterviewDataCache();
    }

    const result = {
      inserted: toInsert.length,
      skipped: skippedLines.length,
      skipped_samples: skippedLines.slice(0, SKIPPED_SAMPLES),
    };

    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_BULK_CREATE',
      resource_type: 'question',
      resource_id: jobName,
      details: {
        job_name: jobName,
        company_tag: tag,
        requested: lines.length,
        inserted: result.inserted,
        skipped: result.skipped,
      },
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[Admin Questions BULK] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
