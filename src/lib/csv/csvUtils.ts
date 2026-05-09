/**
 * Minimal CSV parse/serialize (RFC 4180-style quoted fields, UTF-8 BOM tolerant).
 */

export function stripBom(text: string): string {
  if (!text) return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Escape a cell for CSV output */
function csvEscapeCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

/** Parse CSV text into rows (each row is an array of string cells). */
export function parseCsvRows(text: string): string[][] {
  const input = stripBom(text);
  if (!input.trim()) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += c;
    i++;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * Convert CSV text to objects using the first row as keys (trimmed).
 * Skips blank rows.
 */
export function csvTextToRecords(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const out: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const line = rows[r];
    if (!line.some(c => String(c).trim() !== '')) continue;
    const o: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      o[key] = line[j] ?? '';
    }
    out.push(o);
  }
  return out;
}

/** Build CSV string (with UTF-8 BOM prefix for Excel) from keys + plain records */
export function recordsToCsvString(keys: string[], records: Record<string, unknown>[]): string {
  const header = keys.map(csvEscapeCell).join(',');
  const lines = records.map(rec =>
    keys.map(k => csvEscapeCell(rec[k])).join(','),
  );
  return [header, ...lines].join('\n');
}

/** Trigger download of a CSV file in the browser */
export function downloadCsvUtf8(filename: string, csvBody: string): void {
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
