import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getInterviewData } from '@/lib/serverInterviewData';
import { buildSystemPrompt } from '@/lib/buildSystemPrompt';
import { SUMMARY_ANALYSIS_PROMPT, DETAIL_ANALYSIS_PROMPT } from '@/lib/prompts-stream';
import { buildSlotVars, isPromptSlot, renderSlot, validateSlotBody } from '@/lib/promptSlots';

export const dynamic = 'force-dynamic';

const SAMPLE_JOB = '게임기획';
const SAMPLE_COMPANY = '넥슨';
const SAMPLE_QUESTION_COUNT = 5;
const SAMPLE_QUESTION_NUMBERS = [1, 2, 3, 4, 5];

// POST /api/admin/prompts/preview — { slot, body } 샘플 변수로 렌더한 최종 전체 프롬프트 (저장하지 않음)
export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    const { slot, body } = (payload ?? {}) as { slot?: unknown; body?: unknown };
    if (!isPromptSlot(slot)) {
      return NextResponse.json({ error: '슬롯 값이 올바르지 않습니다.' }, { status: 400 });
    }
    if (typeof body !== 'string') {
      return NextResponse.json({ error: '본문(body)이 필요합니다.' }, { status: 400 });
    }
    const check = validateSlotBody(slot, body);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    let rendered: string;
    if (slot === 'interviewer_persona') {
      const data = await getInterviewData();
      if (!data) {
        return NextResponse.json({ error: '면접 데이터를 불러오지 못했습니다.' }, { status: 500 });
      }
      rendered = buildSystemPrompt(
        data,
        SAMPLE_JOB,
        SAMPLE_COMPANY,
        SAMPLE_QUESTION_COUNT,
        undefined,
        body,
        [],
        undefined
      );
    } else if (slot === 'analysis_summary_rules') {
      const block = renderSlot(
        body,
        buildSlotVars({ job: SAMPLE_JOB, company: SAMPLE_COMPANY, questionCount: SAMPLE_QUESTION_COUNT })
      );
      rendered = SUMMARY_ANALYSIS_PROMPT(SAMPLE_JOB, SAMPLE_QUESTION_COUNT, SAMPLE_COMPANY, block);
    } else {
      const block = renderSlot(
        body,
        buildSlotVars({ job: SAMPLE_JOB, company: SAMPLE_COMPANY, questionNumbers: SAMPLE_QUESTION_NUMBERS })
      );
      rendered = DETAIL_ANALYSIS_PROMPT(SAMPLE_JOB, SAMPLE_QUESTION_NUMBERS, SAMPLE_COMPANY, block);
    }

    return NextResponse.json({ rendered, char_count: rendered.length });
  } catch (error) {
    logger.error('[Admin Prompts Preview] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
