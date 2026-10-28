/**
 * UNSPSC helpers. Pure and browser-safe: the admin's browser parses the codeset file
 * (downloaded by them from UNDP) and sends the rows to the server in chunks.
 *
 * Codes are 8 digits: SS FF CC XX = segment, family, class, commodity.
 * 43000000 segment · 43210000 family · 43211500 class · 43211503 commodity.
 */

export interface UnspscEntry {
  code: string;
  title: string;
}

export const UNSPSC_LEVEL_NAMES = ['', 'Segment', 'Family', 'Class', 'Commodity'] as const;

export function unspscLevel(code: string): 1 | 2 | 3 | 4 {
  if (code.endsWith('000000')) return 1;
  if (code.endsWith('0000')) return 2;
  if (code.endsWith('00')) return 3;
  return 4;
}

export function unspscParent(code: string): string | null {
  switch (unspscLevel(code)) {
    case 1:
      return null;
    case 2:
      return `${code.slice(0, 2)}000000`;
    case 3:
      return `${code.slice(0, 4)}0000`;
    default:
      return `${code.slice(0, 6)}00`;
  }
}

export const isUnspscCode = (s: string) => /^\d{8}$/.test(s) && !s.startsWith('00');

function asCode(cell: unknown): string | null {
  if (typeof cell === 'number' && Number.isInteger(cell)) return isUnspscCode(String(cell)) ? String(cell) : null;
  if (typeof cell !== 'string') return null;
  const s = cell.trim().replace(/\.0+$/, '');
  return isUnspscCode(s) ? s : null;
}

/**
 * Reads any spreadsheet layout that pairs an 8-digit code with its title in the next text cell.
 * Works for the flat layout (Segment, Segment Title, Family, Family Title, …, Commodity, Commodity Title)
 * and for the one-code-per-row layout (Code, Title, Definition …). Header and blank rows are skipped.
 */
export function parseUnspscRows(rows: unknown[][]): { entries: UnspscEntry[]; skippedRows: number } {
  const byCode = new Map<string, string>();
  let skippedRows = 0;
  for (const row of rows) {
    let found = false;
    for (let i = 0; i < row.length; i++) {
      const code = asCode(row[i]);
      if (!code) continue;
      const title = row
        .slice(i + 1)
        .find((c) => typeof c === 'string' && c.trim().length > 1 && !asCode(c)) as string | undefined;
      if (!title) continue;
      found = true;
      if (!byCode.has(code)) byCode.set(code, title.trim().replace(/\s+/g, ' ').slice(0, 300));
    }
    if (!found) skippedRows++;
  }
  // parents before children, so each chunk can resolve its paths from rows already stored
  const entries = [...byCode].map(([code, title]) => ({ code, title })).sort((a, b) => a.code.localeCompare(b.code));
  return { entries, skippedRows };
}

/** Minimal CSV/TSV reader (quoted fields, doubled quotes, CRLF). The delimiter is guessed from the first line. */
export function parseCsv(text: string): string[][] {
  const first = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = ['\t', ';', ','].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
