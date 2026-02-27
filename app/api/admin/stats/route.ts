import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 이번 주 시작일 계산 (월요일 기준)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=일, 1=월...
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);

    // 총 학생 수
    const { count: totalStudents, error: totalError } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      logger.error('[Admin Stats] Total students error:', totalError);
    }

    // 활성 학생 수
    const { count: activeStudents, error: activeError } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (activeError) {
      logger.error('[Admin Stats] Active students error:', activeError);
    }

    // 이번 주 usage_logs 조회 (student_id 포함)
    const { data: weeklyLogs, error: weeklyError } = await supabase
      .from('usage_logs')
      .select('student_id')
      .gte('created_at', weekStart.toISOString());

    if (weeklyError) {
      logger.error('[Admin Stats] Weekly usage error:', weeklyError);
    }

    const weeklyUsageCount = weeklyLogs?.length || 0;

    // 이번 주 활성 사용자 수 (distinct student_id)
    const distinctStudentIds = new Set<string>();
    if (weeklyLogs) {
      weeklyLogs.forEach((log: { student_id: string }) => {
        distinctStudentIds.add(log.student_id);
      });
    }
    const weeklyActiveUsers = distinctStudentIds.size;

    return NextResponse.json({
      totalStudents: totalStudents || 0,
      activeStudents: activeStudents || 0,
      weeklyUsageCount,
      weeklyActiveUsers,
    });
  } catch (error) {
    logger.error('[Admin Stats] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
