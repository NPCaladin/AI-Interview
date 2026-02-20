const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const { data, error } = await supabase.from('students').upsert({
    code: 'DEV-ADMIN',
    name: '관리자테스트',
    is_active: true,
    weekly_limit: 99999,
  }, { onConflict: 'code' }).select();

  if (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
  console.log('등록 완료:', JSON.stringify(data[0], null, 2));
})();
