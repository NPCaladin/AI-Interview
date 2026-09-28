'use client';

interface JsonDiffProps {
  before: unknown;
  after: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringify(v: unknown): string {
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

const OPEN_BRACE = '{\n';
const CLOSE_BRACE = '}';

function Column({
  label,
  value,
  changedKeys,
  tone,
}: {
  label: string;
  value: unknown;
  changedKeys: Set<string>;
  tone: 'before' | 'after';
}) {
  const hl = tone === 'before' ? 'bg-red-500/10 text-red-300' : 'bg-[#00D9A5]/10 text-[#00D9A5]';

  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-gray-400 mb-1.5">{label}</div>
      <pre className="text-xs font-mono bg-black/30 border border-white/10 rounded-lg p-3 overflow-x-auto text-gray-300 leading-relaxed">
        {value === null || value === undefined ? (
          <span className="text-gray-600">—</span>
        ) : isPlainObject(value) ? (
          <>
            {OPEN_BRACE}
            {Object.keys(value).map((k) => {
              const body = stringify(value[k]).replace(/\n/g, '\n  ');
              return (
                <span key={k} className={changedKeys.has(k) ? `block rounded ${hl}` : 'block'}>
                  {`  "${k}": ${body}`}
                </span>
              );
            })}
            {CLOSE_BRACE}
          </>
        ) : (
          stringify(value)
        )}
      </pre>
    </div>
  );
}

/** 좌(변경 전)/우(변경 후) JSON 비교. 최상위 키 단위로 값이 다르면 하이라이트 */
export default function JsonDiff({ before, after }: JsonDiffProps) {
  const changedKeys = new Set<string>();
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  Array.from(new Set(Object.keys(b).concat(Object.keys(a)))).forEach((k) => {
    if (stringify(b[k]) !== stringify(a[k])) changedKeys.add(k);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Column label="변경 전" value={before} changedKeys={changedKeys} tone="before" />
      <Column label="변경 후" value={after} changedKeys={changedKeys} tone="after" />
    </div>
  );
}
