/**
 * CSV 직렬화 (엑셀 호환)
 * - UTF-8 BOM 접두, CRLF 줄바꿈
 * - `"` `,` `\r` `\n` 포함 셀은 따옴표로 감싸고 `"` → `""`
 * - CSV 인젝션 방지: 문자열 셀이 `=` `+` `-` `@` `\t` `\r` 로 시작하면 `'` 접두
 *   (number 타입 값은 수식이 될 수 없으므로 음수도 그대로 둔다)
 * - null/undefined → 빈 셀
 */

export interface CsvColumn<T> {
  key: keyof T | string;
  header: string;
  format?: (row: T) => string | number | null | undefined;
}

const INJECTION_PREFIX_RE = /^[=+\-@\t\r]/;
const NEEDS_QUOTE_RE = /[",\r\n]/;

function toCellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function escapeCsvCell(v: unknown): string {
  const text = toCellText(v);
  if (text === null) return '';
  let s = text;
  if (typeof v !== 'number' && INJECTION_PREFIX_RE.test(s)) s = `'${s}`;
  if (NEEDS_QUOTE_RE.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((c) => escapeCsvCell(c.header)).join(',')];
  for (const row of rows) {
    const cells = columns.map((c) => {
      const raw = c.format ? c.format(row) : (row as unknown as Record<string, unknown>)[String(c.key)];
      return escapeCsvCell(raw);
    });
    lines.push(cells.join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
