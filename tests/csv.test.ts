import { describe, it, expect } from 'vitest';
import { toCsv, escapeCsvCell } from '@/lib/csv';

interface Row {
  a: string | null | undefined;
  b?: number | null;
}

const cols = [
  { key: 'a', header: 'A' },
  { key: 'b', header: 'B' },
] as const;

describe('toCsv', () => {
  it('BOM 접두 + CRLF 줄바꿈', () => {
    const csv = toCsv<Row>([{ a: 'x', b: 1 }], [...cols]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿A,B\r\nx,1\r\n');
  });

  it('따옴표·쉼표·줄바꿈 셀은 따옴표로 감싸고 " 는 "" 로', () => {
    const csv = toCsv<Row>(
      [{ a: 'he said "hi"' }, { a: 'a,b' }, { a: 'line1\nline2' }, { a: 'cr\rhere' }],
      [{ key: 'a', header: 'A' }],
    );
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('"he said ""hi"""');
    expect(lines[2]).toBe('"a,b"');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"cr\rhere"');
  });

  it('CSV 인젝션 접두 (= + - @ \\t \\r)', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1+2')).toBe("'-1+2");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
    expect(escapeCsvCell('\tx')).toBe("'\tx");
    // \r 시작 → 접두 후 따옴표 감싸기
    expect(escapeCsvCell('\rx')).toBe('"\'\rx"');
    // 접두 + 쉼표 → 따옴표 감싸기
    expect(escapeCsvCell('=a,b')).toBe('"\'=a,b"');
    // 숫자 타입 음수는 수식이 아니므로 그대로
    expect(escapeCsvCell(-5)).toBe('-5');
    // 중간에 있는 = 는 그대로
    expect(escapeCsvCell('a=b')).toBe('a=b');
  });

  it('null/undefined 는 빈 셀', () => {
    const csv = toCsv<Row>([{ a: null, b: undefined }, { a: undefined, b: null }], [...cols]);
    expect(csv).toBe('﻿A,B\r\n,\r\n,\r\n');
  });

  it('format 함수 우선, boolean·객체 직렬화', () => {
    const csv = toCsv(
      [{ ok: true, obj: { k: 1 }, n: 2 }],
      [
        { key: 'ok', header: 'ok' },
        { key: 'obj', header: 'obj' },
        { key: 'double', header: 'double', format: (r: { n: number }) => r.n * 2 },
      ],
    );
    expect(csv).toBe('﻿ok,obj,double\r\ntrue,"{""k"":1}",4\r\n');
  });

  it('빈 행 목록이면 헤더만', () => {
    expect(toCsv<Row>([], [...cols])).toBe('﻿A,B\r\n');
  });
});
