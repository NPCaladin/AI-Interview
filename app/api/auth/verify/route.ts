import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: '학생 코드를 입력해주세요.' },
        { status: 400 }
      );
    }

    const normalizedCode = code.trim().toUpperCase();

    // students 테이블에서 조회
    const { data: student, error: queryError } = await supabase
      .from('students')
      .select('id, code, name, is_active')
      .eq('code', normalizedCode)
      .single();

    if (queryError || !student) {
      return NextResponse.json(
        { error: '유효하지 않은 학생 코드입니다.' },
        { status: 401 }
      );
    }

    if (!student.is_active) {
      return NextResponse.json(
        { error: '비활성화된 계정입니다. 관리자에게 문의하세요.' },
        { status: 403 }
      );
    }

    // 주간 사용량 조회
    const { data: usageData, error: rpcError } = await supabase
      .rpc('get_weekly_remaining', { p_student_id: student.id });

    if (rpcError || !usageData?.success) {
      console.error('[Auth Verify] Usage RPC error:', rpcError || usageData);
      return NextResponse.json(
        { error: '사용량 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    // JWT 발급
    const token = await signToken({
      studentId: student.id,
      studentCode: student.code,
      studentName: student.name,
    });

    return NextResponse.json({
      token,
      student: {
        id: student.id,
        code: student.code,
        name: student.name,
      },
      usage: {
        remaining: usageData.remaining,
        limit: usageData.limit,
        used: usageData.used,
      },
    });
  } catch (error) {
    console.error('[Auth Verify] Error:', error);
    return NextResponse.json(
      { error: '인증 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
