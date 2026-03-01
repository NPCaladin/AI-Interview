/**
 * 면접 데이터 Supabase 마이그레이션 스크립트
 *
 * 실행 방법:
 *   node scripts/migrate-interview-data-to-supabase.mjs
 *
 * 사전 조건:
 *   - .env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   - supabase/schema.sql의 interview_* 테이블이 이미 생성되어 있어야 함
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// .env.local 로드 (dotenv 없이 직접 파싱)
function loadEnv() {
  try {
    const envFile = readFileSync(join(ROOT, '.env.local'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
    console.log('[env] .env.local 로드 완료');
  } catch {
    console.log('[env] .env.local 없음 — 환경변수는 시스템에서 직접 설정 필요');
  }
}

// 회사 태그 제거 (예: "[넥슨] 질문" → "질문")
function removeCompanyTag(raw) {
  return raw.replace(/\[([^\]]+)\]\s*/g, '').trim();
}

// 배열을 N개씩 나누어 배치 처리
function chunks(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('오류: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // interview_data.json 로드
  const jsonPath = join(ROOT, 'public', 'interview_data.json');
  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    console.log('[read] interview_data.json 로드 완료');
  } catch (e) {
    console.error('오류: interview_data.json을 읽을 수 없습니다.', e.message);
    process.exit(1);
  }

  // ─── 1. interview_eval_criteria ─────────────────────────────────────────
  console.log('\n[1/4] interview_eval_criteria 삽입...');
  const criteria = (data['공통_평가_기준'] || []).map((criterion, i) => ({
    criterion,
    sort_order: i,
  }));

  // 기존 데이터 삭제 후 재삽입 (criterion에 unique 제약 없음)
  await supabase
    .from('interview_eval_criteria')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  const { error: criteriaErr } = await supabase
    .from('interview_eval_criteria')
    .insert(criteria);

  if (criteriaErr) {
    console.error('  오류:', criteriaErr.message);
  } else {
    console.log(`  완료: ${criteria.length}개 삽입`);
  }

  // ─── 2. interview_personality_questions ─────────────────────────────────
  console.log('\n[2/4] interview_personality_questions 삽입...');
  const personalityData = data['공통_인성_질문'] || {};
  const personalityRows = [];
  for (const [category, questions] of Object.entries(personalityData)) {
    for (const question of questions) {
      personalityRows.push({ category, question });
    }
  }

  // 기존 데이터 전부 삭제 후 재삽입 (upsert 불가 — 복합 unique key 없음)
  const { error: delPersonErr } = await supabase
    .from('interview_personality_questions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // 전체 삭제

  if (delPersonErr) {
    console.warn('  경고: 기존 인성 질문 삭제 실패:', delPersonErr.message);
  }

  for (const batch of chunks(personalityRows, 100)) {
    const { error } = await supabase.from('interview_personality_questions').insert(batch);
    if (error) console.error('  배치 오류:', error.message);
  }
  console.log(`  완료: ${personalityRows.length}개 삽입`);

  // ─── 3. interview_jobs ──────────────────────────────────────────────────
  console.log('\n[3/4] interview_jobs 삽입...');
  const jobsData = data['직군별_데이터'] || {};
  const jobRows = Object.entries(jobsData).map(([job_name, jobInfo]) => ({
    job_name,
    keywords: jobInfo['필수_키워드'] || [],
  }));

  const { error: jobsErr } = await supabase
    .from('interview_jobs')
    .upsert(jobRows, { onConflict: 'job_name' });

  if (jobsErr) {
    console.error('  오류:', jobsErr.message);
  } else {
    console.log(`  완료: ${jobRows.length}개 직군 삽입`);
  }

  // ─── 4. interview_questions ─────────────────────────────────────────────
  console.log('\n[4/4] interview_questions 삽입...');

  // 기존 데이터 전부 삭제 후 재삽입
  const { error: delQErr } = await supabase
    .from('interview_questions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (delQErr) {
    console.warn('  경고: 기존 기출 질문 삭제 실패:', delQErr.message);
  }

  let totalQuestions = 0;
  let errorCount = 0;

  for (const [job_name, jobInfo] of Object.entries(jobsData)) {
    const rawQuestions = jobInfo['기출_질문'] || [];
    const rows = rawQuestions
      .filter(raw => typeof raw === 'string' && raw.trim().length > 0)
      .map(raw => ({
        job_name,
        question: removeCompanyTag(raw),
        raw_text: raw.trim(),
      }));

    for (const batch of chunks(rows, 200)) {
      const { error } = await supabase.from('interview_questions').insert(batch);
      if (error) {
        console.error(`  [${job_name}] 배치 오류:`, error.message);
        errorCount++;
      } else {
        totalQuestions += batch.length;
      }
    }
    process.stdout.write(`  [${job_name}] ${rows.length}개\n`);
  }

  // ─── 검증 ───────────────────────────────────────────────────────────────
  console.log('\n[검증] DB row count 확인...');

  const [{ count: dbJobs }, { count: dbQuestions }, { count: dbPersonality }, { count: dbCriteria }] =
    await Promise.all([
      supabase.from('interview_jobs').select('*', { count: 'exact', head: true }),
      supabase.from('interview_questions').select('*', { count: 'exact', head: true }),
      supabase.from('interview_personality_questions').select('*', { count: 'exact', head: true }),
      supabase.from('interview_eval_criteria').select('*', { count: 'exact', head: true }),
    ]);

  const jsonJobCount = Object.keys(jobsData).length;
  const jsonQuestionCount = Object.values(jobsData).reduce(
    (sum, j) => sum + (j['기출_질문'] || []).length, 0
  );
  const jsonPersonalityCount = Object.values(personalityData).reduce(
    (sum, arr) => sum + arr.length, 0
  );
  const jsonCriteriaCount = criteria.length;

  console.log('\n결과 요약:');
  console.log(`  직군:           JSON ${jsonJobCount} → DB ${dbJobs}`);
  console.log(`  기출 질문:       JSON ${jsonQuestionCount} → DB ${dbQuestions}`);
  console.log(`  인성 질문:       JSON ${jsonPersonalityCount} → DB ${dbPersonality}`);
  console.log(`  평가 기준:       JSON ${jsonCriteriaCount} → DB ${dbCriteria}`);

  if (errorCount > 0) {
    console.warn(`\n경고: ${errorCount}개 배치 오류 발생`);
  }

  const allMatch =
    dbJobs === jsonJobCount &&
    dbPersonality === jsonPersonalityCount &&
    dbCriteria === jsonCriteriaCount;

  if (allMatch) {
    console.log('\n마이그레이션 완료.');
  } else {
    console.warn('\n일부 row count가 불일치합니다. 확인 필요.');
  }
}

main().catch(e => {
  console.error('스크립트 오류:', e);
  process.exit(1);
});
