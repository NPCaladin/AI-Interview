import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/admin/students — 학생 목록 (서버 페이지네이션 + 검색 + 필터)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = (searchParams.get('search') || '').trim();
    const filter = searchParams.get('filter') || 'all'; // all | active | inactive
    const offset = (page - 1) * limit;

    // 쿼리 빌더
    let query = supabase
      .from('students')
      .select('id, code, name, weekly_limit, is_active, created_at', { count: 'exact' });

    // 필터
    if (filter === 'active') query = query.eq('is_active', true);
    else if (filter === 'inactive') query = query.eq('is_active', false);

    // 검색 (code 또는 name) — PostgREST 특수문자 이스케이프
    if (search) {
      const safe = search.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
      query = query.or(`code.ilike.%${safe}%,name.ilike.%${safe}%`);
    }

    // 정렬 + 페이지네이션
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: students, error: studentsError, count } = await query;

    if (studentsError) {
      logger.error('[Admin Students GET] Students query error:', studentsError);
      return NextResponse.json({ error: '학생 목록 조회 실패' }, { status: 500 });
    }

    // 현재 페이지 학생들의 usage만 조회
    const studentIds = (students || []).map((s: { id: string }) => s.id);

    let weeklyMap = new Map<string, number>();
    let totalMap = new Map<string, number>();

    if (studentIds.length > 0) {
      // 이번 주 시작일 계산 (월요일 기준)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysFromMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartTime = weekStart.getTime();

      // 현재 페이지 학생의 로그만 조회
      const { data: logs, error: usageError } = await supabase
        .from('usage_logs')
        .select('student_id, created_at')
        .in('student_id', studentIds);

      if (usageError) {
        logger.error('[Admin Students GET] Usage query error:', usageError);
      }

      const logRows = logs || [];
      for (let i = 0; i < logRows.length; i++) {
        const log = logRows[i] as { student_id: string; created_at: string };
        const sid = log.student_id;
        totalMap.set(sid, (totalMap.get(sid) || 0) + 1);
        if (Date.parse(log.created_at) >= weekStartTime) {
          weeklyMap.set(sid, (weeklyMap.get(sid) || 0) + 1);
        }
      }
    }

    const result = (students || []).map((s: {
      id: string;
      code: string;
      name: string;
      weekly_limit: number;
      is_active: boolean;
      created_at: string;
    }) => ({
      ...s,
      weekly_usage: weeklyMap.get(s.id) || 0,
      total_usage: totalMap.get(s.id) || 0,
    }));

    return NextResponse.json({
      students: result,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    logger.error('[Admin Students GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST /api/admin/students — 학생 추가
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }

    const { code, name, weekly_limit } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '학생 코드를 입력해주세요.' }, { status: 400 });
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: '학생 이름을 입력해주세요.' }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9\-]{3,30}$/.test(normalizedCode)) {
      return NextResponse.json({ error: '코드는 영문 대문자·숫자·하이픈, 3~30자여야 합니다.' }, { status: 400 });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      return NextResponse.json({ error: '이름은 1~50자여야 합니다.' }, { status: 400 });
    }

    const limit = typeof weekly_limit === 'number' ? weekly_limit : 3;
    if (limit < 1 || limit > 100) {
      return NextResponse.json({ error: '주간 제한은 1~100 사이여야 합니다.' }, { status: 400 });
    }

    const { data: student, error } = await supabase
      .from('students')
      .insert({ code: normalizedCode, name: trimmedName, weekly_limit: limit })
      .select('id, code, name, weekly_limit, is_active, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 존재하는 학생 코드입니다.' }, { status: 409 });
      }
      logger.error('[Admin Students POST] Insert error:', error);
      return NextResponse.json({ error: '학생 추가에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    logger.error('[Admin Students POST] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE /api/admin/students — 학생 삭제
export async function DELETE(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }

    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('[Admin Students DELETE] Delete error:', error);
      return NextResponse.json({ error: '학생 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Admin Students DELETE] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PATCH /api/admin/students — 학생 수정
export async function PATCH(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }

    const { id, name, weekly_limit, is_active } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
        return NextResponse.json({ error: '이름은 1~50자여야 합니다.' }, { status: 400 });
      }
      updates.name = name.trim();
    }

    if (weekly_limit !== undefined) {
      if (typeof weekly_limit !== 'number' || weekly_limit < 1 || weekly_limit > 100) {
        return NextResponse.json({ error: '주간 제한은 1~100 사이여야 합니다.' }, { status: 400 });
      }
      updates.weekly_limit = weekly_limit;
    }

    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active는 boolean이어야 합니다.' }, { status: 400 });
      }
      updates.is_active = is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
    }

    const { data: student, error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', id)
      .select('id, code, name, weekly_limit, is_active, created_at')
      .single();

    if (error) {
      logger.error('[Admin Students PATCH] Update error:', error);
      return NextResponse.json({ error: '학생 수정에 실패했습니다.' }, { status: 500 });
    }

    if (!student) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ student });
  } catch (error) {
    logger.error('[Admin Students PATCH] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
