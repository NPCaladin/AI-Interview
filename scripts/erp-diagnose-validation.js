/**
 * ERP 페이로드 검증 실패 진단 스크립트 (1회성)
 *
 * 목적: 초기 dry-run에서 errorsCount=18 로 감지된 규격 위반 레코드의
 *       구체 원인을 파악하여 ERP팀 노티 자료 작성.
 *
 * 실행: node scripts/erp-diagnose-validation.js
 *
 * 출력: 실패한 각 레코드의 원인(정규식/길이/타입 등) + 익명화 샘플
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '.env'),
  ];
  let loaded = false;
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
    loaded = true;
  }
  if (!loaded) throw new Error('.env.local 또는 .env 필요');
}

const STUDENT_CODE_RE = /^[A-Z0-9]{3,20}$/;

function validate(obj) {
  const reasons = [];
  if (!obj || typeof obj !== 'object') return ['not object'];

  // student_code
  if (typeof obj.student_code !== 'string') {
    reasons.push(`student_code type=${typeof obj.student_code}`);
  } else if (!STUDENT_CODE_RE.test(obj.student_code)) {
    const v = obj.student_code;
    if (v.length < 3) reasons.push(`student_code too short (${v.length}자)`);
    else if (v.length > 20) reasons.push(`student_code too long (${v.length}자)`);
    else if (/[a-z]/.test(v)) reasons.push(`student_code 소문자 포함`);
    else if (/[^A-Z0-9]/.test(v)) {
      const bad = v.match(/[^A-Z0-9]/g).join('');
      reasons.push(`student_code 허용불가 문자: "${bad}"`);
    } else reasons.push(`student_code 정규식 불일치`);
  }

  // name
  if (typeof obj.name !== 'string') {
    reasons.push(`name type=${typeof obj.name}`);
  } else {
    const n = obj.name.trim();
    if (n.length < 1) reasons.push(`name 빈값`);
    else if (n.length > 50) reasons.push(`name 51자+ (${n.length}자)`);
  }

  // is_active
  if (typeof obj.is_active !== 'boolean') {
    reasons.push(`is_active type=${typeof obj.is_active}`);
  }

  // updated_at
  if (typeof obj.updated_at !== 'string') {
    reasons.push(`updated_at type=${typeof obj.updated_at}`);
  } else if (Number.isNaN(Date.parse(obj.updated_at))) {
    reasons.push(`updated_at 파싱불가: "${obj.updated_at.slice(0, 30)}"`);
  }

  return reasons;
}

// student_code 마스킹 (앞 3자 + 뒤 2자만 노출)
function maskCode(code) {
  if (typeof code !== 'string' || code.length < 6) return String(code);
  return code.slice(0, 3) + '***' + code.slice(-2);
}
function maskName(name) {
  if (typeof name !== 'string' || !name) return '(빈값)';
  return name.charAt(0) + '*'.repeat(Math.max(1, name.length - 1));
}

async function fetchPage(baseUrl, apiKey, bypass, cursor, updatedAfter) {
  const url = new URL(baseUrl.replace(/\/$/, '') + '/api/external/interview/students');
  url.searchParams.set('limit', '500');
  if (cursor) url.searchParams.set('cursor', cursor);
  else if (updatedAfter) url.searchParams.set('updated_after', updatedAfter);

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
  };
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  loadEnv();
  const baseUrl = process.env.ERP_BASE_URL;
  const apiKey = process.env.ERP_API_KEY;
  const bypass = process.env.ERP_VERCEL_BYPASS_TOKEN;
  const startAfter = process.env.ERP_INITIAL_UPDATED_AFTER || '2020-01-01T00:00:00+09:00';

  if (!baseUrl || !apiKey) throw new Error('ERP_BASE_URL / ERP_API_KEY 필요');

  let cursor = null;
  let page = 0;
  let totalStudents = 0;
  const failures = [];
  const reasonCount = {};

  while (page < 20) {
    const data = await fetchPage(baseUrl, apiKey, bypass, cursor, cursor ? null : startAfter);
    if (!data || !Array.isArray(data.students)) break;
    totalStudents += data.students.length;
    for (const s of data.students) {
      const reasons = validate(s);
      if (reasons.length > 0) {
        failures.push({
          page,
          code: maskCode(s.student_code),
          name: maskName(s.name),
          updated_at: s.updated_at,
          reasons,
        });
        for (const r of reasons) {
          const key = r.replace(/\([^)]*\)/g, '(...)').replace(/"[^"]*"/g, '"..."');
          reasonCount[key] = (reasonCount[key] || 0) + 1;
        }
      }
    }
    cursor = data.next_cursor;
    page += 1;
    if (!cursor) break;
  }

  console.log(`\n=== ERP 검증 실패 진단 ===`);
  console.log(`총 페이지: ${page}`);
  console.log(`총 레코드: ${totalStudents}`);
  console.log(`검증 실패: ${failures.length}건\n`);

  console.log(`--- 실패 원인 분류 ---`);
  for (const [reason, count] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}건: ${reason}`);
  }

  console.log(`\n--- 실패 레코드 샘플 (최대 20건, 마스킹) ---`);
  for (const f of failures.slice(0, 20)) {
    console.log(`  [p${f.page}] ${f.code} / ${f.name} / updated_at=${f.updated_at}`);
    for (const r of f.reasons) console.log(`     → ${r}`);
  }

  if (failures.length > 20) {
    console.log(`  ... (${failures.length - 20}건 추가)`);
  }

  console.log(`\n✅ 진단 완료. ERP팀 노티에 원인 분류 + 샘플 공유 가능`);
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
