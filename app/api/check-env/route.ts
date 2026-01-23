import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'key 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    // 환경 변수 존재 여부만 확인 (값은 반환하지 않음)
    const exists = !!process.env[key];
    
    return NextResponse.json(
      {
        key,
        exists,
        message: exists 
          ? `${key} 환경 변수가 설정되어 있습니다.` 
          : `${key} 환경 변수가 설정되지 않았습니다.`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('환경 변수 확인 오류:', error);
    return NextResponse.json(
      { error: `환경 변수 확인 실패: ${error.message || '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}


