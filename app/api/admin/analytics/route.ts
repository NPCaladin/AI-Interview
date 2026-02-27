import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '14'), 7), 30);

    // N일 전 시작일 (KST 기준 오늘 포함 N일)
    const now = new Date();
    const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const startKst = new Date(kstNow);
    startKst.setDate(kstNow.getDate() - days + 1);
    startKst.setHours(0, 0, 0, 0);
    // KST → UTC로 변환 (KST = UTC+9)
    const startUtc = new Date(startKst.getTime() - 9 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('usage_logs')
      .select('student_id, created_at')
      .gte('created_at', startUtc.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('[Admin Analytics] Query error:', error);
      return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
    }

    // 날짜별 Map 초기화 (데이터 없는 날도 0으로 채움)
    const dailyMap = new Map<string, { count: number; users: Set<string> }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(startKst);
      d.setDate(startKst.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyMap.set(dateStr, { count: 0, users: new Set() });
    }

    // 집계
    (data || []).forEach((log: { student_id: string; created_at: string }) => {
      const kst = new Date(new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const dateStr = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
      const entry = dailyMap.get(dateStr);
      if (entry) {
        entry.count++;
        entry.users.add(log.student_id);
      }
    });

    const daily = Array.from(dailyMap.entries()).map(([date, { count, users }]) => ({
      date,
      count,
      uniqueUsers: users.size,
    }));

    return NextResponse.json({ daily, days });
  } catch (error) {
    logger.error('[Admin Analytics] Error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
