/**
 * 재활성화 승인 큐 관리 API
 * GET  /api/admin/reactivations?status=pending&search=&page=1&limit=20
 * PATCH /api/admin/reactivations  body: {id, action, linked_student_code?, note?}
 *
 * 권한: middleware 의 admin 라우트 JWT 검증에 의존 (기존 admin API 관례)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ReactivationRow {
  id: string;
  student_code: string;
  student_id: string | null;
  source: 'case1_new_code' | 'case2_existing_code';
  transition_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  linked_student_code: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  created_at: string;
}

function escapeIlike(s: string): string {
  return s.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
}

// GET — 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = (searchParams.get('status') || 'pending').trim();
    const search = (searchParams.get('search') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    const allowedStatuses = ['pending', 'approved', 'rejected', 'merged', 'all'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: '잘못된 status 값' }, { status: 400 });
    }

    let query = supabase
      .from('pending_reactivations')
      .select(
        'id, student_code, student_id, source, transition_at, status, linked_student_code, reviewed_by, reviewed_at, note, created_at',
        { count: 'exact' },
      );

    if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      const safe = escapeIlike(search);
      query = query.ilike('student_code', `%${safe}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[Admin Reactivations GET] query error:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    const rows = (data || []) as ReactivationRow[];

    // student 정보 배치 조회 (code 기준)
    const codes = Array.from(new Set(rows.map(r => r.student_code)));
    const linkedCodes = Array.from(
      new Set(rows.map(r => r.linked_student_code).filter((v): v is string => !!v)),
    );
    const allCodes = Array.from(new Set([...codes, ...linkedCodes]));

    const studentMap = new Map<string, {
      id: string;
      code: string;
      name: string;
      is_active: boolean;
      created_at: string;
    }>();

    if (allCodes.length > 0) {
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, code, name, is_active, created_at')
        .in('code', allCodes);
      if (sErr) {
        logger.error('[Admin Reactivations GET] students lookup error:', sErr);
      } else {
        (students || []).forEach((s) => {
          const row = s as { id: string; code: string; name: string; is_active: boolean; created_at: string };
          studentMap.set(row.code, row);
        });
      }
    }

    const enriched = rows.map(r => ({
      ...r,
      student: studentMap.get(r.student_code) ?? null,
      linked_student: r.linked_student_code
        ? studentMap.get(r.linked_student_code) ?? null
        : null,
    }));

    return NextResponse.json({
      items: enriched,
      total: count || 0,
      page,
      limit,
    });
  } catch (e) {
    logger.error('[Admin Reactivations GET] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH — 승인/거부/병합
export async function PATCH(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
    }

    const { id, action, linked_student_code, note } = body as {
      id?: string;
      action?: string;
      linked_student_code?: string;
      note?: string;
    };

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id 필요' }, { status: 400 });
    }
    if (!action || !['approve', 'reject', 'merge'].includes(action)) {
      return NextResponse.json({ error: 'action은 approve/reject/merge' }, { status: 400 });
    }

    // 대상 큐 row 조회
    const { data: row, error: rowErr } = await supabase
      .from('pending_reactivations')
      .select('id, student_code, student_id, source, status')
      .eq('id', id)
      .maybeSingle();

    if (rowErr) {
      logger.error('[Admin Reactivations PATCH] row lookup error:', rowErr);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: '큐 항목을 찾을 수 없음' }, { status: 404 });
    }

    const queueRow = row as {
      id: string;
      student_code: string;
      student_id: string | null;
      source: 'case1_new_code' | 'case2_existing_code';
      status: string;
    };

    if (queueRow.status !== 'pending') {
      return NextResponse.json(
        { error: `이미 처리됨 (status=${queueRow.status})` },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();

    // approve: 해당 code 의 students.is_active=true + status=approved
    if (action === 'approve') {
      // student id 해결: case2 면 student_id 존재, case1 이면 code 로 lookup
      let targetId = queueRow.student_id;
      if (!targetId) {
        const { data: s, error: sErr } = await supabase
          .from('students')
          .select('id')
          .eq('code', queueRow.student_code)
          .maybeSingle();
        if (sErr || !s) {
          return NextResponse.json(
            { error: `학생(${queueRow.student_code}) 조회 실패` },
            { status: 500 },
          );
        }
        targetId = (s as { id: string }).id;
      }

      const { error: uErr } = await supabase
        .from('students')
        .update({ is_active: true })
        .eq('id', targetId);
      if (uErr) {
        logger.error('[Admin Reactivations PATCH] activate error:', uErr);
        return NextResponse.json({ error: '학생 활성화 실패' }, { status: 500 });
      }

      const { error: qErr } = await supabase
        .from('pending_reactivations')
        .update({
          status: 'approved',
          reviewed_at: nowIso,
          note: note ?? null,
          student_id: targetId, // case1 보강
        })
        .eq('id', id);
      if (qErr) {
        logger.error('[Admin Reactivations PATCH] queue update error:', qErr);
        return NextResponse.json({ error: '큐 상태 갱신 실패' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, action: 'approve', student_id: targetId });
    }

    // reject: 큐 상태만
    if (action === 'reject') {
      const { error: qErr } = await supabase
        .from('pending_reactivations')
        .update({
          status: 'rejected',
          reviewed_at: nowIso,
          note: note ?? null,
        })
        .eq('id', id);
      if (qErr) {
        logger.error('[Admin Reactivations PATCH] reject error:', qErr);
        return NextResponse.json({ error: '거부 처리 실패' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: 'reject' });
    }

    // merge: case1 전용 — linked_student_code 로 과거 학생 지정
    if (action === 'merge') {
      if (queueRow.source !== 'case1_new_code') {
        return NextResponse.json(
          { error: 'merge는 case1_new_code 만 가능' },
          { status: 400 },
        );
      }
      if (!linked_student_code || typeof linked_student_code !== 'string') {
        return NextResponse.json(
          { error: 'linked_student_code 필요' },
          { status: 400 },
        );
      }
      const linkCode = linked_student_code.trim().toUpperCase();

      // 링크 대상 학생 lookup
      const { data: linked, error: lErr } = await supabase
        .from('students')
        .select('id, code, is_active')
        .eq('code', linkCode)
        .maybeSingle();
      if (lErr || !linked) {
        return NextResponse.json(
          { error: `연결 대상 학생(${linkCode}) 을 찾을 수 없음` },
          { status: 404 },
        );
      }

      // 현재 코드(신규 V) 학생 활성화
      const { data: current, error: cErr } = await supabase
        .from('students')
        .select('id')
        .eq('code', queueRow.student_code)
        .maybeSingle();
      if (cErr || !current) {
        return NextResponse.json(
          { error: `현재 학생(${queueRow.student_code}) 조회 실패` },
          { status: 500 },
        );
      }
      const currentId = (current as { id: string }).id;

      const { error: actErr } = await supabase
        .from('students')
        .update({ is_active: true })
        .eq('id', currentId);
      if (actErr) {
        logger.error('[Admin Reactivations PATCH] merge activate error:', actErr);
        return NextResponse.json({ error: '현재 학생 활성화 실패' }, { status: 500 });
      }

      // 큐 상태 merged 로 + linked_student_code 저장
      const { error: qErr } = await supabase
        .from('pending_reactivations')
        .update({
          status: 'merged',
          linked_student_code: linkCode,
          reviewed_at: nowIso,
          student_id: currentId,
          note: note ?? null,
        })
        .eq('id', id);
      if (qErr) {
        logger.error('[Admin Reactivations PATCH] merge queue update error:', qErr);
        return NextResponse.json({ error: '큐 상태 갱신 실패' }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        action: 'merge',
        current_student_id: currentId,
        linked_student_id: (linked as { id: string }).id,
        note: 'usage_logs 이관은 이번 스코프 외 — 수기 SQL 처리',
      });
    }

    return NextResponse.json({ error: 'unreachable' }, { status: 500 });
  } catch (e) {
    logger.error('[Admin Reactivations PATCH] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
