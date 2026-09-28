import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { isUuid } from '@/lib/sessionStore';

export const dynamic = 'force-dynamic';

// GET /api/admin/sessions/[id] — 세션 상세(리포트 포함) + 대화 메시지
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: '세션 ID(UUID)가 올바르지 않습니다.' }, { status: 400 });
    }

    const [sessionRes, messagesRes] = await Promise.all([
      supabase.from('interview_sessions').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('interview_messages')
        .select('id, turn_index, role, content, created_at')
        .eq('session_id', id)
        .order('turn_index', { ascending: true }),
    ]);

    if (sessionRes.error) {
      logger.error('[Admin Session GET] Session query error:', sessionRes.error);
      return NextResponse.json({ error: '세션 조회 실패' }, { status: 500 });
    }
    if (!sessionRes.data) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (messagesRes.error) {
      logger.error('[Admin Session GET] Messages query error:', messagesRes.error);
      return NextResponse.json({ error: '대화 기록 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ session: sessionRes.data, messages: messagesRes.data || [] });
  } catch (error) {
    logger.error('[Admin Session GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
