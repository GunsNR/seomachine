import { describe, expect, it } from 'vitest';
import { exportFilename, toCsv } from '@/lib/csv';

const cols = [
  { key: 'a' as const, header: 'A' },
  { key: 'b' as const, header: 'B' },
];

describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    const csv = toCsv([{ a: '1', b: '2' }, { a: '3', b: '4' }], cols);
    expect(csv.split('\r\n')).toEqual(['A,B', '1,2', '3,4']);
  });

  it('quotes cells containing a comma, quote or newline', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"' }], cols);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"say ""hi"""');
  });

  it('preserves embedded newlines inside a quoted cell', () => {
    const csv = toCsv([{ a: 'line1\nline2', b: 'ok' }], cols);
    expect(csv).toContain('"line1\nline2"');
  });

  it('neutralises formula injection in text cells', () => {
    for (const dangerous of ['=SUM(A1)', '+1', '-1', '@cmd']) {
      expect(toCsv([{ a: dangerous, b: '' }], cols)).toContain(`'${dangerous}`);
    }
  });

  it('leaves real numbers numeric, including negatives', () => {
    // A negative number is data, not an injected formula; prefixing it would
    // make a spreadsheet read the whole column as text.
    expect(toCsv([{ a: -4, b: 12.5 }], cols)).toBe('A,B\r\n-4,12.5');
  });

  it('writes booleans without quoting', () => {
    expect(toCsv([{ a: true, b: false }], cols)).toBe('A,B\r\ntrue,false');
  });

  it('renders a non-finite number as empty rather than NaN', () => {
    expect(toCsv([{ a: NaN, b: Infinity }], cols)).toBe('A,B\r\n,');
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv([{ a: null, b: undefined }], cols)).toBe('A,B\r\n,');
  });

  it('serialises dates as ISO strings', () => {
    const csv = toCsv([{ a: new Date('2026-08-21T00:00:00Z'), b: '' }], cols);
    expect(csv).toContain('2026-08-21T00:00:00.000Z');
  });

  it('emits only a header for an empty set', () => {
    expect(toCsv([], cols)).toBe('A,B');
  });
});

describe('exportFilename', () => {
  it('slugifies the project and stamps the date', () => {
    expect(exportFilename('Acme Analytics!', 'keywords', 'csv'))
      .toMatch(/^acme-analytics-keywords-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('falls back when the name slugifies to nothing', () => {
    expect(exportFilename('!!!', 'leads', 'json')).toMatch(/^project-leads-/);
  });

  it('produces no characters that would break a Content-Disposition header', () => {
    expect(exportFilename('a"b;c\\d', 'audit', 'csv')).not.toMatch(/["\;]/);
  });
});
