/**
 * 학생 코드 일괄 등록 스크립트
 *
 * 사용법: node scripts/import-students.js
 * .env 파일에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요
 */

const fs = require('fs');
const path = require('path');

// .env 파일 수동 파싱 (dotenv 미설치 대비)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env 파일이 없습니다. .env.example을 참고하여 생성하세요.');
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnv();

  const { createClient } = require('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 .env에 설정되어야 합니다.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // CSV 읽기
  const csvPath = path.join(__dirname, '..', '학생코드.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split('\n').slice(1); // 헤더 제거

  // 유효한 코드만 필터링
  const codes = lines
    .map(l => l.trim().replace(/\r/g, ''))
    .filter(code => code && code !== '-' && /^[A-Za-z0-9]+$/.test(code));

  console.log(`총 ${codes.length}개 학생 코드 발견\n`);

  // 기존 등록된 코드 조회
  const { data: existing, error: fetchErr } = await supabase
    .from('students')
    .select('code');

  if (fetchErr) throw new Error(`기존 데이터 조회 실패: ${fetchErr.message}`);

  const existingCodes = new Set((existing || []).map(s => s.code));
  const newCodes = codes.filter(c => !existingCodes.has(c));

  console.log(`기존 등록: ${existingCodes.size}개`);
  console.log(`신규 등록 대상: ${newCodes.length}개`);

  if (newCodes.length === 0) {
    console.log('\n추가할 학생이 없습니다.');
    return;
  }

  // Supabase 일괄 INSERT (1000개씩 배치)
  const BATCH_SIZE = 500;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < newCodes.length; i += BATCH_SIZE) {
    const batch = newCodes.slice(i, i + BATCH_SIZE).map(code => ({
      code,
      name: code,        // 이름 없으므로 코드와 동일
      is_active: true,
      weekly_limit: 5,
    }));

    const { error } = await supabase.from('students').insert(batch);

    if (error) {
      console.error(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 실패:`, error.message);
      failed += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length}개 등록 완료`);
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${inserted}개`);
  if (failed > 0) console.log(`실패: ${failed}개`);
  console.log(`전체 등록 학생 수: ${existingCodes.size + inserted}개`);
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
