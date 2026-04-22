/**
 * 병합(merge) 대상 과거 학생 검색
 * GET /api/admin/reactivations/search?name=홍길동
 *
 * - students WHERE name ILIKE '%{name}%' AND is_active=false
 * - 각 학생의 usage_logs 최대 created_at 을 last_used_at 으로 반환
 * - 결과 상한: 50건 (admin 수기 대조용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function escapeIlike(s: string): string {
  return s.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const name = (searchParams.get('name') || '').trim();

    if (!name || name.length < 1) {
      return NextResponse.json({ error: 'name 파라미터 필요' }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: 'name 최대 50자' }, { status: 400 });
    }

    const safe = escapeIlike(name);

    const { data: students, error } = await supabase
      .from('students')
      .select('id, code, name, is_active, created_at')
      .eq('is_active', false)
      .ilike('name', `%${safe}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('[Admin Reactivations Search] students error:', error);
      return NextResponse.json({ error: '검색 실패' }, { status: 500 });
    }

    const rows = (students || []) as Array<{
      id: string;
      code: string;
      name: string;
      is_active: boolean;
      created_at: string;
    }>;

    if (rows.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // usage_logs 최대 created_at 일괄 조회
    const ids = rows.map(r => r.id);
    const { data: logs, error: logErr } = await supabase
      .from('usage_logs')
      .select('student_id, created_at')
      .in('student_id', ids)
      .order('created_at', { ascending: false });

    if (logErr) {
      logger.error('[Admin Reactivations Search] usage_logs error:', logErr);
    }

    const lastUsedMap = new Map<string, string>();
    (logs || []).forEach((log) => {
      const l = log as { student_id: string; created_at: string };
      if (!lastUsedMap.has(l.student_id)) {
        lastUsedMap.set(l.student_id, l.created_at);
      }
    });

    const items = rows.map(r => ({
      code: r.code,
      name: r.name,
      created_at: r.created_at,
      last_used_at: lastUsedMap.get(r.id) ?? null,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    logger.error('[Admin Reactivations Search] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
