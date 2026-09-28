/**
 * 재활성화 큐 단건 자격 확인 (ERP 합의 2026-09-23 4조건)
 * POST /api/admin/reactivations/{id}/eligibility
 *  → ERP 자격 조회 → pending_reactivations.eligibility/eligibility_checked_at 캐시 → 감사 로그
 *  응답: { ok: true, eligibility }
 * ERP 미구현·장애 시에도 200 + eligibility.source='unavailable' (수동 판단 대상)
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { fetchEligibility } from '@/lib/erp/eligibility';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // ERP 자격 조회 10s 타임아웃 기준

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'id(UUID) 필요' }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabase
      .from('pending_reactivations')
      .select('id, student_code, status')
      .eq('id', id)
      .maybeSingle();
    if (rowErr) {
      logger.error('[Admin Reactivation Eligibility] row lookup error:', rowErr);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: '큐 항목을 찾을 수 없음' }, { status: 404 });
    }
    const queueRow = row as { id: string; student_code: string; status: string };

    const eligibility = await fetchEligibility(queueRow.student_code);

    const { error: uErr } = await supabase
      .from('pending_reactivations')
      .update({ eligibility, eligibility_checked_at: eligibility.checked_at })
      .eq('id', id);
    if (uErr) {
      // 캐시 저장 실패는 판정 결과 반환을 막지 않는다
      logger.warn('[Admin Reactivation Eligibility] cache update failed:', uErr.message);
    }

    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUEUE_ELIGIBILITY_CHECK',
      resource_type: 'reactivation',
      resource_id: id,
      details: {
        student_code: queueRow.student_code,
        source: eligibility.source,
        all_pass: eligibility.all_pass,
        ...(eligibility.error ? { error: eligibility.error } : {}),
      },
      request,
    });

    return NextResponse.json({ ok: true, eligibility });
  } catch (e) {
    logger.error('[Admin Reactivation Eligibility] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
