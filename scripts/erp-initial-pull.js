/**
 * ERP 초기 이관 스크립트 (로컬 Node 전용)
 *
 * 용도: Vercel Cron 60초 제한을 우회하여 전체 학생 초기 pull 수행
 *
 * 사용법:
 *   1) Dry-run 3회 반복 (기본):
 *        node scripts/erp-initial-pull.js
 *   2) 실제 반영 (확인 후):
 *        node scripts/erp-initial-pull.js --confirm
 *
 * 참조: docs/ERP_연동_합의서_최종.md §6
 */

const fs = require('fs');
const path = require('path');

// .env 수동 파싱
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envLocalPath = path.join(__dirname, '..', '.env.local');
  const candidates = [envPath, envLocalPath];
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
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    loaded = true;
  }
  if (!loaded) {
    throw new Error('.env 또는 .env.local 파일이 없습니다. .env.example 참고');
  }
}

const STUDENT_CODE_RE = /^[A-Z0-9]{3,20}$/;
const REQUEST_TIMEOUT_MS = 10_000;

function validatePayload(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['not object'] };
  if (typeof obj.student_code !== 'string' || !STUDENT_CODE_RE.test(obj.student_code)) {
    errors.push(`student_code invalid: ${obj.student_code}`);
  }
  if (typeof obj.name !== 'string' || obj.name.trim().length < 1 || obj.name.trim().length > 50) {
    errors.push(`name invalid`);
  }
  if (typeof obj.is_active !== 'boolean') errors.push('is_active not boolean');
  if (typeof obj.updated_at !== 'string' || Number.isNaN(Date.parse(obj.updated_at))) {
    errors.push(`updated_at invalid`);
  }
  return errors.length ? { valid: false, errors } : {
    valid: true,
    value: {
      student_code: obj.student_code,
      name: obj.name.trim(),
      is_active: obj.is_active,
      updated_at: obj.updated_at,
    },
  };
}

async function fetchPage({ baseUrl, apiKey, updatedAfter, cursor, limit = 500 }) {
  const url = new URL(baseUrl.replace(/\/$/, '') + '/api/external/interview/students');
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  else if (updatedAfter) url.searchParams.set('updated_after', updatedAfter);

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
  };

  const backoff = [1000, 2000, 4000];
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(t);

      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      if (res.status >= 500) {
        const body = await res.text().catch(() => '');
        lastErr = new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, backoff[attempt]));
          continue;
        }
        throw lastErr;
      }

      const parsed = await res.json();
      if (!parsed || !Array.isArray(parsed.students)) {
        throw new Error('malformed response');
      }
      return {
        students: parsed.students,
        next_cursor: typeof parsed.next_cursor === 'string' ? parsed.next_cursor : null,
      };
    } catch (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') {
        lastErr = new Error('timeout');
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, backoff[attempt]));
          continue;
        }
        throw lastErr;
      }
      // 4xx 즉시 실패
      if (e.message && e.message.startsWith('HTTP 4')) throw e;
      lastErr = e;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, backoff[attempt]));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error('unknown');
}

async function runPull({ supabase, baseUrl, apiKey, startUpdatedAfter, dryRun, source, label }) {
  console.log(`\n=== ${label} (dryRun=${dryRun}, source=${source}) ===`);
  let cursor = null;
  let updatedAfter = startUpdatedAfter;
  let pages = 0;
  let totalFetched = 0;
  let totalUpserted = 0;
  let totalQueued = 0;
  let totalDeactivated = 0;
  const errors = [];

  const MAX_PAGES = 200; // 초기 이관용 여유값

  while (pages < MAX_PAGES) {
    let pageRes;
    try {
      pageRes = await fetchPage({ baseUrl, apiKey, updatedAfter, cursor, limit: 500 });
    } catch (e) {
      errors.push(`page ${pages}: ${e.message}`);
      break;
    }
    pages += 1;
    updatedAfter = undefined;
    totalFetched += pageRes.students.length;

    // 검증
    const valids = [];
    for (const raw of pageRes.students) {
      const v = validatePayload(raw);
      if (v.valid) valids.push(v.value);
      else errors.push(`validation: ${v.errors.join('; ')}`);
    }

    if (valids.length > 0) {
      // 기존 lookup
      const codes = valids.map(p => p.student_code);
      const { data: existing, error: lErr } = await supabase
        .from('students')
        .select('id, code, is_active')
        .in('code', codes);
      if (lErr) {
        errors.push(`lookup: ${lErr.message}`);
        break;
      }
      const existingMap = new Map();
      (existing || []).forEach(r => existingMap.set(r.code, r));

      const newActive = [];
      const newInactive = [];
      const reactivations = [];
      const deactivations = [];
      const updates = [];

      for (const p of valids) {
        const e = existingMap.get(p.student_code);
        if (!e) {
          if (p.is_active) newActive.push(p);
          else newInactive.push(p);
        } else if (e.is_active === p.is_active) {
          updates.push({ payload: p, existing: e });
        } else if (e.is_active === false && p.is_active === true) {
          reactivations.push({ payload: p, existing: e });
        } else {
          deactivations.push({ payload: p, existing: e });
        }
      }

      if (!dryRun) {
        // newActive: students (is_active=false) + case1 큐
        if (newActive.length > 0) {
          const rows = newActive.map(p => ({
            code: p.student_code,
            name: p.name,
            is_active: false,
            weekly_limit: 5,
            source,
            updated_at: p.updated_at,
          }));
          const { error } = await supabase.from('students').upsert(rows, { onConflict: 'code' });
          if (error) errors.push(`newActive upsert: ${error.message}`);
          else totalUpserted += rows.length;

          const qRows = newActive.map(p => ({
            student_code: p.student_code,
            student_id: null,
            source: 'case1_new_code',
            transition_at: p.updated_at,
          }));
          const { error: qErr } = await supabase.from('pending_reactivations').insert(qRows);
          if (qErr && qErr.code !== '23505') errors.push(`case1 queue: ${qErr.message}`);
          totalQueued += qRows.length;
        }
        // newInactive
        if (newInactive.length > 0) {
          const rows = newInactive.map(p => ({
            code: p.student_code,
            name: p.name,
            is_active: false,
            weekly_limit: 5,
            source,
            updated_at: p.updated_at,
          }));
          const { error } = await supabase.from('students').upsert(rows, { onConflict: 'code' });
          if (error) errors.push(`newInactive upsert: ${error.message}`);
          else totalUpserted += rows.length;
        }
        // reactivations: 큐만
        if (reactivations.length > 0) {
          const qRows = reactivations.map(x => ({
            student_code: x.payload.student_code,
            student_id: x.existing.id,
            source: 'case2_existing_code',
            transition_at: x.payload.updated_at,
          }));
          const { error } = await supabase.from('pending_reactivations').insert(qRows);
          if (error && error.code !== '23505') errors.push(`case2 queue: ${error.message}`);
          totalQueued += qRows.length;
        }
        // deactivations: 즉시
        for (const x of deactivations) {
          const { error } = await supabase
            .from('students')
            .update({ is_active: false, updated_at: x.payload.updated_at, name: x.payload.name })
            .eq('id', x.existing.id);
          if (error) errors.push(`deactivate ${x.existing.code}: ${error.message}`);
          else totalDeactivated += 1;
        }
        // updates
        for (const x of updates) {
          const { error } = await supabase
            .from('students')
            .update({ name: x.payload.name, updated_at: x.payload.updated_at })
            .eq('id', x.existing.id);
          if (error) errors.push(`update ${x.existing.code}: ${error.message}`);
          else totalUpserted += 1;
        }
      } else {
        totalUpserted += newActive.length + newInactive.length + updates.length;
        totalQueued += newActive.length + reactivations.length;
        totalDeactivated += deactivations.length;
      }
    }

    console.log(`  page ${pages}: fetched=${pageRes.students.length}, next_cursor=${pageRes.next_cursor ? 'yes' : 'null'}`);

    cursor = pageRes.next_cursor;
    if (!cursor) break;
  }

  console.log(`\n  결과: pages=${pages}, fetched=${totalFetched}, upserted=${totalUpserted}, queued=${totalQueued}, deactivated=${totalDeactivated}, errors=${errors.length}`);
  if (errors.length > 0) {
    console.log(`  에러 샘플(최대 5개):`);
    for (const e of errors.slice(0, 5)) console.log(`    - ${e}`);
  }
  return { pages, totalFetched, totalUpserted, totalQueued, totalDeactivated, errors };
}

async function main() {
  loadEnv();

  const baseUrl = process.env.ERP_BASE_URL;
  const apiKey = process.env.ERP_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const initialAfter = process.env.ERP_INITIAL_UPDATED_AFTER || '2020-01-01T00:00:00+09:00';

  if (!baseUrl || !apiKey) throw new Error('ERP_BASE_URL / ERP_API_KEY 필요');
  if (!supabaseUrl || !supabaseKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const confirm = process.argv.includes('--confirm');

  if (!confirm) {
    console.log('[Dry-run 모드] 3회 반복 실행 — DB 변경 없음\n');
    for (let i = 1; i <= 3; i++) {
      await runPull({
        supabase,
        baseUrl,
        apiKey,
        startUpdatedAfter: initialAfter,
        dryRun: true,
        source: 'erp_migration',
        label: `Dry-run ${i}/3`,
      });
    }
    console.log('\n✅ Dry-run 완료. 이상 없으면 다음 실행:');
    console.log('   node scripts/erp-initial-pull.js --confirm\n');
    return;
  }

  console.log('⚠️  --confirm 모드: 실제 DB 반영 (source=erp_migration)\n');
  await runPull({
    supabase,
    baseUrl,
    apiKey,
    startUpdatedAfter: initialAfter,
    dryRun: false,
    source: 'erp_migration',
    label: 'Full import',
  });

  console.log('\n✅ 초기 이관 완료. 이후 Vercel Cron 이 매일 increment pull.');
}

main().catch(err => {
  console.error('\n❌ 오류:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
