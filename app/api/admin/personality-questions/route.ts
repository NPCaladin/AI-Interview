import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, category, question, source, is_active, updated_at';
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const CATEGORY_MAX = 50;

// GET /api/admin/personality-questions — 인성 질문 목록 (+ distinct categories)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const category = (searchParams.get('category') || '').trim();
    const search = (searchParams.get('search') || '').trim();
    const includeInactive = searchParams.get('includeInactive') === '1';
    const offset = (page - 1) * limit;

    let query = supabase.from('interview_personality_questions').select(COLUMNS, { count: 'exact' });
    if (category) query = query.eq('category', category);
    if (!includeInactive) query = query.eq('is_active', true);
    if (search) {
      const safe = search.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
      query = query.ilike('question', `%${safe}%`);
    }

    const [listRes, catRes] = await Promise.all([
      query
        .order('category', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1),
      // 인성 질문은 수십 행 규모 — 전체 category 만 읽어 distinct 산출
      supabase.from('interview_personality_questions').select('category').range(0, 999),
    ]);

    if (listRes.error || catRes.error) {
      logger.error('[Admin Personality GET] Query error:', listRes.error || catRes.error);
      return NextResponse.json({ error: '인성 질문 목록 조회 실패' }, { status: 500 });
    }

    const categories = Array.from(
      new Set(((catRes.data || []) as Array<{ category: string }>).map((r) => r.category).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'ko'));

    return NextResponse.json({
      items: listRes.data || [],
      total: listRes.count || 0,
      page,
      limit,
      categories,
    });
  } catch (error) {
    logger.error('[Admin Personality GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST /api/admin/personality-questions — 인성 질문 추가
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

    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!category || category.length > CATEGORY_MAX) {
      return NextResponse.json({ error: `카테고리는 1~${CATEGORY_MAX}자여야 합니다.` }, { status: 400 });
    }
    if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
      return NextResponse.json(
        { error: `질문은 ${QUESTION_MIN}~${QUESTION_MAX}자여야 합니다.` },
        { status: 400 }
      );
    }

    const row = { category, question, source: 'manual', updated_at: new Date().toISOString() };
    const { data: inserted, error: insErr } = await supabase
      .from('interview_personality_questions')
      .insert(row)
      .select(COLUMNS)
      .single();
    if (insErr || !inserted) {
      logger.error('[Admin Personality POST] Insert error:', insErr);
      return NextResponse.json({ error: '인성 질문 추가에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    const item = inserted as unknown as { id: string };
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_CREATE',
      resource_type: 'personality_question',
      resource_id: item.id,
      new_values: row,
      request,
    });

    return NextResponse.json({ ok: true, item: inserted }, { status: 201 });
  } catch (error) {
    logger.error('[Admin Personality POST] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
