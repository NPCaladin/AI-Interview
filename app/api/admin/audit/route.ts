/**
 * 감사 로그 조회 API
 * GET /api/admin/audit?action&actor&resource_type&resource_id&from&to&page&limit
 *  - from/to: YYYY-MM-DD (KST 자정 경계, to 는 당일 포함)
 *  - action: AdminAction 값만 허용 (그 외 400)
 *  - 응답: { items, total, page, limit, actions }
 * 권한: middleware 의 /api/admin/* 보호
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ADMIN_ACTIONS, buildAuditQuery, parseAuditFilters } from '@/lib/adminListQueries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const offset = (page - 1) * limit;

    const parsed = parseAuditFilters(searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data, error, count } = await buildAuditQuery(parsed.value, true).range(offset, offset + limit - 1);
    if (error) {
      logger.error('[Admin Audit GET] query error:', error);
      return NextResponse.json({ error: '감사 로그 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({
      items: data ?? [],
      total: count || 0,
      page,
      limit,
      actions: ADMIN_ACTIONS,
    });
  } catch (e) {
    logger.error('[Admin Audit GET] Error:', e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
