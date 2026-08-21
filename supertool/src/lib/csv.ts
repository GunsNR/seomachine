/**
 * Minimal RFC 4180 CSV writer.
 *
 * Values are quoted whenever they contain a delimiter, quote or newline, and
 * embedded quotes are doubled. A leading =, +, - or @ is prefixed with a
 * single quote so spreadsheet software treats the cell as text rather than
 * executing it as a formula.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  // Numbers and booleans cannot carry a formula, and prefixing them would
  // make a spreadsheet read a negative number as text.
  if (typeof value === 'number' || typeof value === 'boolean') {
    return Number.isFinite(value) || typeof value === 'boolean' ? String(value) : '';
  }

  let text = value instanceof Date ? value.toISOString() : String(value);

  // Only user-supplied text can smuggle a formula into a spreadsheet.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T & string; header: string }>,
): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(','));
  // Excel needs CRLF to parse embedded newlines inside quoted cells reliably.
  return [head, ...body].join('\r\n');
}

/** Build a Content-Disposition-safe filename. */
export function exportFilename(project: string, resource: string, ext: string): string {
  const slug = project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${resource}-${date}.${ext}`;
}
