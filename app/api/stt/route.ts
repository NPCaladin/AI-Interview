import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  DAGLO_API_BASE_URL,
  DAGLO_MAX_WAIT_TIME,
  DAGLO_INITIAL_POLL_INTERVAL,
  DAGLO_MAX_POLL_INTERVAL,
  DAGLO_BACKOFF_MULTIPLIER,
} from '@/lib/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface STTRequest {
  audio: string; // base64 encoded audio
  stt_model?: 'OpenAI Whisper' | 'Daglo';
}

async function transcribeWithWhisper(audioBuffer: Buffer): Promise<{ text: string; raw_data: any }> {
  try {
    // Create a File-like object from buffer
    const file = new File([new Uint8Array(audioBuffer)], 'audio.wav', { type: 'audio/wav' });
    
    const transcript = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: file as any,
      language: 'ko',
    });

    const rawData = {
      stt_model: 'OpenAI Whisper',
      model: 'whisper-1',
      text: transcript.text,
      language: 'ko',
      timestamp: Date.now(),
    };

    return { text: transcript.text, raw_data: rawData };
  } catch (error: any) {
    console.error('Whisper STT 오류:', error);
    throw new Error(`음성 인식 오류: ${error.message || '알 수 없는 오류'}`);
  }
}

async function transcribeWithDaglo(audioBuffer: Buffer): Promise<{ text: string; raw_data: any }> {
  const dagloApiKey = process.env.DAGLO_API_KEY;
  console.log('[Daglo STT] 환경 변수 확인:', dagloApiKey ? '설정됨 (길이: ' + dagloApiKey.length + ')' : '설정되지 않음');
  
  if (!dagloApiKey) {
    throw new Error('DAGLO_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일에 DAGLO_API_KEY를 추가하고 개발 서버를 재시작해주세요.');
  }

  const baseUrl = DAGLO_API_BASE_URL;
  const headers = {
    Authorization: `Bearer ${dagloApiKey}`,
  };

  const rawData: any = {
    step1_request: null,
    step1_response: null,
    step2_polling: [],
    step3_final_response: null,
  };

  try {
    // Step 1: 작업 요청 (POST) - rid 추출
    console.log(`[Daglo STT] Step 1: 작업 요청 시작 - ${baseUrl}`);

    // Node.js fetch 내장 FormData/Blob 사용
    const formData = new FormData();
    const fileBlob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', fileBlob, 'audio.wav');

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: formData,
    });

    rawData.step1_request = {
      url: baseUrl,
      method: 'POST',
      has_file: true,
    };

    let responseData;
    try {
      responseData = await response.json();
    } catch (parseError) {
      const text = await response.text();
      console.error('[Daglo STT] JSON 파싱 실패:', text);
      throw new Error(`API 응답 파싱 실패 (상태 코드: ${response.status}): ${text.substring(0, 200)}`);
    }
    
    rawData.step1_response = {
      status_code: response.status,
      response: responseData,
    };

    if (response.status !== 200 && response.status !== 201) {
      const errorMsg = responseData?.error || responseData?.message || `작업 요청 실패 (상태 코드: ${response.status})`;
      console.error('[Daglo STT] API 오류 응답:', responseData);
      throw new Error(`Daglo API 오류: ${errorMsg}`);
    }

    const rid = responseData.rid;
    if (!rid) {
      throw new Error('rid (Request ID)를 받지 못했습니다.');
    }

    console.log(`[Daglo STT] Step 1 완료 - rid: ${rid}`);

    // Step 2: 상태 확인 루프 (GET & Loop) - Smart Backoff
    const MAX_POLL_ATTEMPTS = 60;
    const statusUrl = `${baseUrl}/${rid}`;
    const maxWaitTime = DAGLO_MAX_WAIT_TIME * 1000; // ms로 변환
    let pollInterval = DAGLO_INITIAL_POLL_INTERVAL * 1000; // ms로 변환
    const startTime = Date.now();
    let pollCount = 0;

    console.log(`[Daglo STT] Step 2: 상태 확인 시작 - ${statusUrl}`);

    while (pollCount < MAX_POLL_ATTEMPTS) {
      const elapsedTime = Date.now() - startTime;
      pollCount += 1;

      if (elapsedTime > maxWaitTime) {
        throw new Error(
          `최대 대기 시간(${DAGLO_MAX_WAIT_TIME}초)을 초과했습니다. (총 ${pollCount}회 폴링 시도)`
        );
      }

      const pollResponse = await fetch(statusUrl, {
        method: 'GET',
        headers,
      });

      const pollData = await pollResponse.json().catch(() => ({}));

      const pollLog = {
        poll_count: pollCount,
        elapsed_time: Math.round(elapsedTime / 100) / 10,
        status_code: pollResponse.status,
        response: pollData,
      };
      rawData.step2_polling.push(pollLog);

      const status = (pollData.status || '').toLowerCase();
      console.log(
        `[Daglo STT] Step 2 폴링 #${pollCount} - 경과 시간: ${Math.round(elapsedTime / 100) / 10}초, 상태: ${status}, 간격: ${pollInterval / 1000}초`
      );

      if (status === 'transcribed') {
        console.log(`[Daglo STT] Step 2 완료 - 상태: ${status}`);
        rawData.step3_final_response = pollData;
        break;
      } else if (status === 'processing' || status === 'analysis') {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        pollInterval = Math.min(
          DAGLO_MAX_POLL_INTERVAL * 1000,
          pollInterval * DAGLO_BACKOFF_MULTIPLIER
        );
        continue;
      } else if (status === 'failed' || status === 'error') {
        throw new Error(pollData.error || `상태: ${status}`);
      } else {
        // 알 수 없는 상태 — 계속 폴링하되 최대 횟수 제한으로 보호
        console.warn(`[Daglo STT] 알 수 없는 상태: ${status}, 폴링 계속...`);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        pollInterval = Math.min(
          DAGLO_MAX_POLL_INTERVAL * 1000,
          pollInterval * DAGLO_BACKOFF_MULTIPLIER
        );
        continue;
      }
    }

    if (pollCount >= MAX_POLL_ATTEMPTS) {
      throw new Error(`최대 폴링 횟수(${MAX_POLL_ATTEMPTS}회)를 초과했습니다.`);
    }

    // Step 3: 결과 파싱
    console.log(`[Daglo STT] Step 3: 결과 파싱 시작`);

    const finalResponse = rawData.step3_final_response;
    if (!finalResponse) {
      throw new Error('최종 응답 데이터가 없습니다.');
    }

    const sttResults = finalResponse.sttResults || [];
    if (sttResults.length === 0) {
      throw new Error('sttResults 배열이 없습니다.');
    }

    const transcriptParts: string[] = [];
    for (const result of sttResults) {
      const transcript = result.transcript || '';
      if (transcript) {
        transcriptParts.push(transcript);
      }
    }

    if (transcriptParts.length === 0) {
      throw new Error('음성이 인식되지 않았습니다. 마이크에 대고 더 크고 명확하게 말씀해주세요.');
    }

    const transcribedText = transcriptParts.join(' ');
    console.log(`[Daglo STT] Step 3 완료 - 변환된 텍스트 길이: ${transcribedText.length}자`);

    return { text: transcribedText, raw_data: rawData };
  } catch (error: any) {
    console.error('[Daglo STT] 예외 발생:', error);
    throw new Error(`Daglo STT 오류: ${error.message || '알 수 없는 오류'}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    let audioBuffer: Buffer;
    let stt_model: 'OpenAI Whisper' | 'Daglo' = 'OpenAI Whisper';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // FormData 바이너리 전송 (효율적)
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File | null;
      if (!audioFile) {
        return NextResponse.json({ error: 'audio 파일이 필요합니다.' }, { status: 400 });
      }
      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      stt_model = (formData.get('stt_model') as string as typeof stt_model) || 'OpenAI Whisper';
    } else {
      // JSON base64 전송 (레거시 호환)
      const body: STTRequest = await request.json();
      const { audio, stt_model: model = 'OpenAI Whisper' } = body;
      if (!audio) {
        return NextResponse.json({ error: 'audio 필드가 필요합니다.' }, { status: 400 });
      }
      audioBuffer = Buffer.from(audio, 'base64');
      stt_model = model;
    }

    let result: { text: string; raw_data: any };

    if (stt_model === 'Daglo') {
      // Daglo 사용 시 DAGLO_API_KEY 확인
      if (!process.env.DAGLO_API_KEY) {
        return NextResponse.json(
          { 
            error: 'DAGLO_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일에 DAGLO_API_KEY를 추가하고 개발 서버를 재시작해주세요.' 
          },
          { status: 500 }
        );
      }
      result = await transcribeWithDaglo(audioBuffer);
    } else {
      // Whisper 사용 시 OPENAI_API_KEY 확인
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }
      result = await transcribeWithWhisper(audioBuffer);
    }

    return NextResponse.json(
      {
        text: result.text,
        raw_data: result.raw_data,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('STT API 오류:', error);
    return NextResponse.json(
      { error: `STT 생성 실패: ${error.message || '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}

