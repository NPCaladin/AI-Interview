import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // 요청 본문에서 text 추출
    const body = await request.json();
    const { text } = body;

    // text 유효성 검사
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'text 필드가 필요합니다.' },
        { status: 400 }
      );
    }

    // API Key 확인
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // OpenAI TTS API 호출
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'onyx', // Python 코드와 동일하게 'onyx' 사용
      input: text,
    });

    // 오디오 데이터를 Buffer로 변환
    const buffer = Buffer.from(await mp3.arrayBuffer());

    // MP3 오디오 데이터 반환
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('TTS API 오류:', error);
    
    // OpenAI API 오류 처리
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `TTS 생성 실패: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

