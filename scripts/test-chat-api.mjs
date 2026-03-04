/**
 * chat API 직접 테스트 스크립트
 * 실행: node scripts/test-chat-api.mjs
 */
import { readFileSync } from 'fs';
import { SignJWT } from 'jose';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 파싱
function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

const envLocal = loadEnv(resolve(__dirname, '../.env.local'));
const envBase = loadEnv(resolve(__dirname, '../.env'));
const env = { ...envBase, ...envLocal };

const JWT_SECRET = env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET을 .env.local에서 찾을 수 없습니다.');
  process.exit(1);
}

const BASE_URL = 'http://localhost:3001';

async function makeJwt(studentId = 'test-student-id') {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({ studentId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

async function callChat(jwt, payload) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

// ─────────────────────────────────────────────
// 테스트 케이스 정의
// ─────────────────────────────────────────────
const TESTS = [
  {
    name: '[Issue1] Q0 신입 자기소개 요청 — 게임 개발 경험 전제 없어야 함',
    payload: {
      messages: [],
      selected_job: '게임기획',
      selected_company: '공통(회사선택X)',
      question_count: 0,
      is_first: false,
      session_id: 'test-session-001',
    },
    check: (resp) => {
      const msg = resp.message || '';
      const bad = ['게임을 개발', '게임 개발 경험', '만들어보신', '출시해보신', '라이브 서비스 경험'];
      const found = bad.filter(b => msg.includes(b));
      return { pass: found.length === 0, detail: found.length ? `금지 표현 발견: ${found.join(', ')}` : '신입 가정 OK' };
    },
  },
  {
    name: '[Issue1] Q5 직무 검증 단계 — 신입 기준 질문이어야 함',
    payload: {
      messages: [
        { role: 'assistant', content: '반갑습니다. 1분 자기소개 부탁드립니다.' },
        { role: 'user', content: '안녕하세요. 저는 게임기획 직군에 지원한 김철수입니다. 게임을 정말 좋아하고, 관련 공부를 해왔습니다.' },
        { role: 'assistant', content: '알겠습니다. 게임업계를 희망하는 동기를 말씀해주세요.' },
        { role: 'user', content: '게임이 사람들에게 즐거움을 주는 콘텐츠라 생각하고, 이 분야에서 일하고 싶었습니다.' },
        { role: 'assistant', content: '왜 게임기획 직무를 선택하셨나요?' },
        { role: 'user', content: '기획이 게임의 방향을 결정하는 핵심이라 생각하고, 창의적으로 기여하고 싶어서입니다.' },
        { role: 'assistant', content: '이 직무의 핵심 역량은 무엇이라 생각합니까?' },
        { role: 'user', content: '분석력과 창의성, 그리고 유저 관점의 사고라고 생각합니다.' },
        { role: 'assistant', content: '그 역량을 기르기 위해 어떤 준비를 하셨나요?' },
        { role: 'user', content: '게임 분석 글을 쓰고, 개인 게임 기획서를 작성해봤습니다.' },
      ],
      selected_job: '게임기획',
      selected_company: '공통(회사선택X)',
      question_count: 5,
      is_first: false,
      session_id: 'test-session-001',
    },
    check: (resp) => {
      const msg = resp.message || '';
      const bad = ['실무에서', '재직', '이전 직장', '라이브 서비스 경험', '출시해보신', '게임을 개발해보신'];
      const found = bad.filter(b => msg.includes(b));
      return { pass: found.length === 0, detail: found.length ? `경력 가정 표현 발견: ${found.join(', ')}` : '신입 기준 질문 OK' };
    },
  },
  {
    name: '[Issue2] Q11 마지막 질문 — "다음 질문" 전환 문구 없어야 함',
    payload: {
      messages: [
        { role: 'assistant', content: '반갑습니다. 1분 자기소개 부탁드립니다.' },
        { role: 'user', content: '안녕하세요. 저는 게임기획 직군 지원자 김철수입니다.' },
        { role: 'assistant', content: '지원 동기를 말씀해주세요.' },
        { role: 'user', content: '게임을 통해 사람들에게 재미를 주고 싶어 지원했습니다.' },
        { role: 'assistant', content: '직무를 선택한 이유는?' },
        { role: 'user', content: '기획이 게임의 핵심이라 생각했습니다.' },
        { role: 'assistant', content: '핵심 역량은?' },
        { role: 'user', content: '분석력과 창의성입니다.' },
        { role: 'assistant', content: '준비 과정을 말씀해주세요.' },
        { role: 'user', content: '게임 기획서를 작성하고 분석 글을 써왔습니다.' },
        { role: 'assistant', content: '그럼 게임 BM에 대해 어떻게 생각하시나요?' },
        { role: 'user', content: '유저 경험을 해치지 않는 선에서 수익화가 중요하다고 생각합니다.' },
        { role: 'assistant', content: '인성 관련 질문입니다. 팀에서 갈등이 생겼을 때 어떻게 해결하시나요?' },
        { role: 'user', content: '대화로 해결하려 합니다. 서로의 입장을 이해하고 조율합니다.' },
        { role: 'assistant', content: '마지막 인성 질문입니다. 어떤 유형의 사람과 일하기 어려우신가요?' },
        { role: 'user', content: '소통을 거부하는 분과는 일하기 어렵습니다.' },
      ],
      selected_job: '게임기획',
      selected_company: '공통(회사선택X)',
      question_count: 11,
      is_first: false,
      session_id: 'test-session-001',
    },
    check: (resp) => {
      const msg = resp.message || '';
      const bad = ['다음 질문', '넘어가겠습니다', '다음으로', '다른 주제'];
      const found = bad.filter(b => msg.includes(b));
      const hasEnding = msg.includes('마지막') || msg.includes('하고 싶은 말') || msg.includes('질문이 있');
      return {
        pass: found.length === 0 && hasEnding,
        detail: found.length ? `전환 문구 발견: ${found.join(', ')}` : hasEnding ? '마지막 질문 OK' : '마지막 질문 문구 없음'
      };
    },
  },
  {
    name: '[Issue2] Q12 마무리 — 전환 문구 없고 종료 인사만 있어야 함',
    payload: {
      messages: [
        { role: 'assistant', content: '마지막으로 하고 싶은 말이나 질문이 있나요?' },
        { role: 'user', content: '열심히 하겠습니다. 감사합니다.' },
      ],
      selected_job: '게임기획',
      selected_company: '공통(회사선택X)',
      question_count: 12,
      is_first: false,
      session_id: 'test-session-001',
    },
    check: (resp) => {
      const msg = resp.message || '';
      const bad = ['다음 질문', '넘어가겠습니다', '다른 주제', '다음으로'];
      const found = bad.filter(b => msg.includes(b));
      const hasClose = msg.includes('감사') || msg.includes('수고') || msg.includes('면접') || resp.interview_ended;
      return {
        pass: found.length === 0 && hasClose,
        detail: [
          found.length ? `전환 문구 발견: ${found.join(', ')}` : '전환 문구 없음 OK',
          hasClose ? `종료 인사 OK (interview_ended=${resp.interview_ended})` : '종료 인사 없음'
        ].join(' | ')
      };
    },
  },
];

// ─────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────
async function run() {
  const jwt = await makeJwt();
  console.log(`\n${'='.repeat(60)}`);
  console.log('  Chat API 테스트 시작');
  console.log(`${'='.repeat(60)}\n`);

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    process.stdout.write(`테스트: ${test.name}\n`);
    try {
      const resp = await callChat(jwt, test.payload);

      if (resp.status && resp.status !== 200) {
        console.log(`  결과: FAIL — HTTP ${resp.status}: ${resp.error || JSON.stringify(resp)}\n`);
        failed++;
        continue;
      }

      const { pass, detail } = test.check(resp);
      if (pass) {
        console.log(`  결과: PASS — ${detail}`);
        passed++;
      } else {
        console.log(`  결과: FAIL — ${detail}`);
        failed++;
      }

      const preview = (resp.message || '').slice(0, 120).replace(/\n/g, ' ');
      console.log(`  AI 응답: "${preview}${resp.message?.length > 120 ? '...' : ''}"\n`);

    } catch (e) {
      console.log(`  결과: ERROR — ${e.message}\n`);
      failed++;
    }
  }

  console.log(`${'='.repeat(60)}`);
  console.log(`  결과: ${passed} PASS / ${failed} FAIL`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
