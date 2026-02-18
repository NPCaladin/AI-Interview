import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MAX_TTS_TEXT_LENGTH, TTS_API_TIMEOUT } from '@/lib/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: TTS_API_TIMEOUT,
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

    // 텍스트 길이 초과 시 truncate (이미 표시된 텍스트의 음성이므로 reject 아닌 잘라서 재생)
    const isTruncated = text.length > MAX_TTS_TEXT_LENGTH;
    const ttsInput = isTruncated ? text.slice(0, MAX_TTS_TEXT_LENGTH) : text;
    if (isTruncated) {
      console.warn(`[TTS API] 텍스트 잘림: ${text.length}자 → ${MAX_TTS_TEXT_LENGTH}자`);
    }

    // OpenAI TTS API 호출
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'onyx', // Python 코드와 동일하게 'onyx' 사용
      input: ttsInput,
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
      if (error.message.includes('timeout') || error.message.includes('Timeout') || error.message.includes('ETIMEDOUT')) {
        return NextResponse.json(
          { error: 'TTS 응답 시간이 초과되었습니다.' },
          { status: 504 }
        );
      }
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

