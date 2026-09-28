import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { isUuid } from '@/lib/sessionStore';
import { PROMPT_VERSION_COLUMNS } from '@/lib/promptVersionAdmin';

export const dynamic = 'force-dynamic';

// GET /api/admin/prompts/[id] — 버전 단건 (본문 포함)
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: '버전 ID(UUID)가 올바르지 않습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('prompt_versions')
      .select(PROMPT_VERSION_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('[Admin Prompt Version GET] Query error:', error);
      return NextResponse.json({ error: '버전 조회 실패' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: '버전을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ version: data });
  } catch (error) {
    logger.error('[Admin Prompt Version GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
