/**
 * CSV → interview_data.json 정합성 검증 스크립트
 *
 * 실행: node scripts/validate-interview-data.mjs
 *
 * 검증 항목:
 * 1. CSV 파일의 질문 수와 JSON의 질문 수 비교 (10개 이상 차이 시 경고)
 * 2. JSON 내 비질문 항목 탐지 (프로세스 설명, 채용 절차 등)
 * 3. 직군별 최소 질문 수 (30개 미만 경고)
 * 4. 회사 태그 오염 탐지 (줄바꿈, 따옴표 등)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── CSV 파싱 ──────────────────────────────────────────────────
function parseCSVQuestions(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const questions = [];
  let currentCompany = '';
  const skipValues = new Set(['면접질문', '채용절차', '질문', '카테고리', '']);

  for (const line of lines) {
    const cols = line.split(',');
    const company = cols[1]?.trim().replace(/\r/g, '').replace(/\n/g, ' ');
    const question = cols[5]?.trim().replace(/\r/g, '');

    if (company && !skipValues.has(company) && !company.startsWith('<')) {
      currentCompany = company.replace(/\s+/g, ' ');
    }
    if (question && !skipValues.has(question) && currentCompany) {
      questions.push('[' + currentCompany + '] ' + question);
    }
  }
  return questions;
}

// ── 비질문 패턴 탐지 ──────────────────────────────────────────
const NON_QUESTION_PATTERNS = [
  /^(영어|한국어|일본어)\s*(면접|테스트|시험)/,
  /^채용\s*(절차|프로세스|과정)/,
  /필기\s*시험/,
  /PT\s*(면접|발표)/,
  /펜\s*사용/,
  /^(1차|2차|3차)\s*(면접|전형)/,
  /^\d+차\s/,
  /구두로\s*진행/,
  /시간\s*제한/,
  /수리\s*(문제|통계)/,
];

function isNonQuestion(q) {
  const text = q.replace(/^\[[^\]]+\]\s*/, '');
  return NON_QUESTION_PATTERNS.some(p => p.test(text));
}

// ── 회사 태그 오염 탐지 ───────────────────────────────────────
function hasCorruptTag(q) {
  const m = q.match(/^\[([^\]]+)\]/);
  if (!m) return false;
  const tag = m[1];
  return tag.includes('\n') || tag.startsWith('"') || tag.endsWith('"');
}

// ── CSV↔JSON 매핑 ─────────────────────────────────────────────
const CSV_MAP = {
  'QA':       'QA.csv',
  '개발PM':   '개발PM.csv',
  '게임마케팅': '게임마케팅.csv',
  '게임서비스': '게임서비스.csv',
  '게임운영': '게임운영.csv',
  '기획':     '기획.csv',
  '데이터분석': '데이터분석.csv',
  '사업PM':   '사업PM.csv',
  '서비스기획': '서비스기획.csv',
  '애니메이션': '애니메이션.csv',
  '엔지니어': '엔지니어.csv',
  '전략기획': '전략기획.csv',
  '프로그래머': '프로그래머.csv',
  '해외사업': '해외사업.csv',
};

// ── 메인 ─────────────────────────────────────────────────────
const jsonData = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/interview_data.json'), 'utf8'));
const jobs = jsonData['직군별_데이터'];

let totalWarnings = 0;
let totalErrors = 0;

console.log('=== interview_data.json 정합성 검증 ===\n');

for (const [job, jobData] of Object.entries(jobs)) {
  const questions = jobData.기출_질문 || [];
  const issues = [];

  // 1. 최소 질문 수
  if (questions.length < 30) {
    issues.push(`❌ 질문 수 부족: ${questions.length}개 (최소 30개 권장)`);
    totalErrors++;
  }

  // 2. CSV 비교
  const csvFile = CSV_MAP[job];
  if (csvFile) {
    const csvPath = path.join(ROOT, csvFile);
    const csvQs = parseCSVQuestions(csvPath);
    if (csvQs !== null) {
      const csvBase = csvQs.length;  // [공통] 추가 전 기준
      const jsonBase = questions.filter(q => !q.startsWith('[공통]')).length;
      const diff = csvBase - jsonBase;
      if (diff > 15) {
        issues.push(`⚠️  CSV(${csvBase}개) vs JSON 기출(${jsonBase}개): ${diff}개 차이 — CSV 데이터 미반영 의심`);
        totalWarnings++;
      }
    }
  }

  // 3. 비질문 항목
  const nonQs = questions.filter(isNonQuestion);
  if (nonQs.length > 0) {
    issues.push(`⚠️  비질문 항목 ${nonQs.length}개: ${nonQs.slice(0,2).map(q=>'"'+q.slice(0,40)+'"').join(', ')}...`);
    totalWarnings++;
  }

  // 4. 회사 태그 오염
  const corrupt = questions.filter(hasCorruptTag);
  if (corrupt.length > 0) {
    issues.push(`❌ 태그 오염 ${corrupt.length}개: ${corrupt.slice(0,2).map(q=>'"'+q.slice(0,50)+'"').join(', ')}`);
    totalErrors++;
  }

  if (issues.length > 0) {
    console.log(`[${job}] (${questions.length}개)`);
    issues.forEach(i => console.log('  ' + i));
    console.log('');
  } else {
    console.log(`[${job}] ✅ ${questions.length}개 — 이상 없음`);
  }
}

console.log('\n' + '='.repeat(50));
if (totalErrors === 0 && totalWarnings === 0) {
  console.log('✅ 모든 검증 통과');
} else {
  if (totalErrors > 0) console.log(`❌ 오류: ${totalErrors}개`);
  if (totalWarnings > 0) console.log(`⚠️  경고: ${totalWarnings}개`);
  console.log('\n데이터 수정 후 다시 실행하세요: node scripts/validate-interview-data.mjs');
}
