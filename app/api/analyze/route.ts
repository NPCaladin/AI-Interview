/**
 * @deprecated 이 API는 /api/analyze/stream으로 대체되었습니다. 삭제 예정.
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logger } from '@/lib/logger';
import { ANALYSIS_SYSTEM_PROMPT } from '@/lib/prompts';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AnalyzeRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  selected_job: string;
}

interface AnalyzeResult {
  total_score: number;
  pass_prediction: string;
  summary_title: string;
  scores: {
    job_fit: number;
    logic: number;
    game_sense: number;
    attitude: number;
    communication: number;
  };
  feedback: {
    good_points: string[];
    bad_points: string[];
    improvement_guide: string;
  };
  best_answer: string;
  worst_answer: string;
  detailed_feedback_markdown: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { messages, selected_job } = body;

    // messages 유효성 검사
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages 필드가 필요하며 비어있지 않은 배열이어야 합니다.' },
        { status: 400 }
      );
    }

    if (!selected_job) {
      return NextResponse.json(
        { error: 'selected_job 필드가 필요합니다.' },
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

    // 대화 로그를 텍스트로 변환
    let conversationText = '';
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? '면접관' : '지원자';
      conversationText += `[${role}]: ${msg.content}\n\n`;
    }

    const systemPrompt = ANALYSIS_SYSTEM_PROMPT;

    const userPrompt = `다음은 '${selected_job}' 직군 지원자의 면접 대화 로그입니다. 이를 분석하여 상세한 피드백 리포트를 작성해주세요.

[면접 대화 로그]
${conversationText}

[🚨 중요 지시사항]
1. **할루시네이션 절대 금지:** 지원자가 실제로 한 말만 인용하고, 지어내지 마세요.
2. **복사 금지:** '개선 가이드'에 지원자가 이미 말한 내용을 그대로 쓰지 마세요. 새로운 관점이나 더 나은 표현만 제안하세요.
3. **3단계 구조 필수:** 각 문항 분석 시 반드시 "🗣️ 지원자 답변 요약" -> "⚖️ 평가" -> "💡 개선 가이드" 순서를 지키세요.

[요구사항]
- total_score는 5개 항목의 평균 점수로 계산하세요
- pass_prediction은 "합격", "합격 보류 (B+)", "불합격" 중 하나로 판단하세요
- summary_title은 종합 평가를 한 문장으로 요약한 제목을 작성하세요
- detailed_feedback_markdown은 A4 용지 2~3장 분량의 매우 상세한 마크다운 형식 리포트여야 합니다
- detailed_feedback_markdown에는 다음 섹션이 모두 포함되어야 합니다:
  1. 종합 평가 (긴 서술형)
  2. 문항별 정밀 분석 (각 질문마다 반드시 "🗣️ 지원자 답변 요약" -> "⚖️ 평가" -> "💡 개선 가이드" 구조로 작성)
  3. 역량별 심층 평가 (각 항목에 대한 근거와 설명)
- scores는 각 역량별 점수를 포함하세요
- feedback의 good_points와 bad_points는 각각 2-3개씩 구체적으로 작성하세요
- improvement_guide는 실용적인 조언을 제공하세요
- best_answer와 worst_answer는 실제 질문 내용을 참고하여 작성하세요

[문항별 분석 포맷 예시]
## Q1. 자기소개
- **🗣️ 지원자 답변 요약:** (지원자가 실제로 한 말을 1~2문장으로 요약)
- **⚖️ 평가:** (잘한 점과 아쉬운 점 분석)
- **💡 개선 가이드:** (지원자가 말하지 않은 새로운 관점이나 더 나은 표현 제안. 이미 잘했으면 칭찬)

반드시 다음 JSON 포맷으로만 응답하세요:
{
  "total_score": 75,
  "pass_prediction": "합격 보류 (B+)",
  "summary_title": "직무 이해도는 높으나, 자신감 있는 태도 보완이 시급함",
  "scores": {
    "job_fit": 80,
    "logic": 60,
    "game_sense": 70,
    "attitude": 90,
    "communication": 85
  },
  "feedback": {
    "good_points": ["두괄식 답변이 명확함", "넷마블 게임에 대한 이해도가 높음"],
    "bad_points": ["경험을 물을 때 추상적으로 대답함", "수치적인 근거(KPI 등) 언급이 부족함"],
    "improvement_guide": "직무 경험을 말할 때 STAR 기법(상황-과제-행동-결과)을 사용하여 구체성을 높이세요."
  },
  "best_answer": "BM 구조 개선안에 대한 답변",
  "worst_answer": "갈등 해결 경험에 대한 답변",
  "detailed_feedback_markdown": "# 1. 종합 평가\\n\\n(전체적인 강점, 약점, 합격 가능성을 서술형으로 작성)\\n\\n# 2. 문항별 정밀 분석\\n\\n## Q1. [질문 내용 요약]\\n- **🗣️ 지원자 답변 요약:** (지원자가 실제로 한 말을 1~2문장으로 요약)\\n- **⚖️ 평가:** (잘한 점과 아쉬운 점 분석)\\n- **💡 개선 가이드:** (지원자가 말하지 않은 더 좋은 표현이나 논리 보강 제안)\\n\\n## Q2. [질문 내용 요약]\\n(모든 문항 반복...)\\n\\n# 3. 역량별 심층 평가\\n(5대 역량에 대한 구체적 평가)"`;

    try {
      // response_format을 사용하여 JSON 응답 강제
      let response;
      try {
        response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 12000,
          response_format: { type: 'json_object' },
        });
      } catch (error) {
        // response_format이 지원되지 않는 경우 일반 요청으로 재시도
        response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 12000,
        });
      }

      if (response.choices[0].finish_reason === 'length') {
        logger.warn('[Analyze] 토큰 한도 도달 — 응답이 잘렸을 수 있음');
      }

      const resultText = response.choices[0].message.content;
      if (!resultText) {
        throw new Error('AI 응답이 비어있습니다.');
      }

      // JSON 파싱 시도
      let result: AnalyzeResult;
      try {
        result = JSON.parse(resultText) as AnalyzeResult;
      } catch (parseError) {
        // JSON 파싱 실패 시 텍스트에서 JSON 추출 시도
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('JSON 형식의 응답을 찾을 수 없습니다.');
        }
        try {
          result = JSON.parse(jsonMatch[0]) as AnalyzeResult;
        } catch {
          throw new Error('추출된 JSON 파싱에 실패했습니다. 다시 시도해주세요.');
        }
      }

      // 필수 필드 검증
      if (!result.total_score || !result.scores) {
        throw new Error('필수 필드가 누락되었습니다.');
      }

      return NextResponse.json(result, { status: 200 });
    } catch (error: any) {
      logger.error('면접 분석 오류:', error);
      return NextResponse.json(
        { error: `면접 분석 실패: ${error.message || '알 수 없는 오류'}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    logger.error('Analyze API 오류:', error);
    return NextResponse.json(
      { error: `서버 오류: ${error.message || '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}

