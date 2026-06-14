export const KBO_FETCH_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-stats)';

export interface ParsedStatTable {
  title?: string;
  headers: string[];
  rows: Record<string, string>[];
}

export function extractTables(html: string): string[] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
}

export function extractThLabels(table: string): string[] {
  return [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    cleanCell(m[1]),
  );
}

export function extractTdCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    cleanCell(m[1]),
  );
}

export function cleanCell(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tableTitle(table: string): string | undefined {
  const caption = table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  if (caption) {
    const t = cleanCell(caption[1]);
    if (t) return t;
  }
  const prev = table.match(
    /<(?:h[2-4]|strong|dt)[^>]*>([\s\S]*?)<\/(?:h[2-4]|strong|dt)>/i,
  );
  if (prev) {
    const t = cleanCell(prev[1]);
    if (t && t.length < 40) return t;
  }
  return undefined;
}

export function parseHtmlTables(html: string): ParsedStatTable[] {
  const out: ParsedStatTable[] = [];
  for (const table of extractTables(html)) {
    const parsed = parseSingleTable(table);
    if (parsed && parsed.headers.length && parsed.rows.length) {
      out.push(parsed);
    }
  }
  return out;
}

export function parseSingleTable(table: string): ParsedStatTable | null {
  const headers = extractThLabels(table);
  if (!headers.length) return null;

  const body = table.match(/<tbody>[\s\S]*?<\/tbody>/i)?.[0] ?? table;
  const rowMatches = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows: Record<string, string>[] = [];

  for (const row of rowMatches) {
    const cells = extractTdCells(row[1]);
    if (!cells.length) continue;
    if (cells.length !== headers.length) continue;
    const record: Record<string, string> = {};
    headers.forEach((label, i) => {
      const key = label || `col${i}`;
      record[key] = cells[i];
    });
    rows.push(record);
  }

  if (!rows.length) return null;
  return {
    title: tableTitle(table),
    headers,
    rows,
  };
}

export function parseInnings(ipRaw: string): number {
  const s = (ipRaw ?? '').trim();
  if (!s) return 0;
  if (s.includes('.')) {
    const [whole, frac] = s.split('.');
    const outs = parseInt(frac, 10) || 0;
    return (parseInt(whole, 10) || 0) + outs / 3;
  }
  return parseFloat(s) || 0;
}

export function parsePlayerName(html: string): string | undefined {
  const m = html.match(/선수명:\s*([^<\n]+)/);
  return m?.[1]?.trim();
}

export function parseTeamCode(html: string): string | undefined {
  const m = html.match(
    /<th>(KIA|KT|LG|NC|SSG|두산|롯데|삼성|한화|키움)<\/th>/,
  );
  return m?.[1];
}

export function numFromRow(
  row: Record<string, string>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = parseFloat((row[key] ?? '').replace(/,/g, ''));
    if (Number.isFinite(v)) return v;
  }
  return undefined;
}

export function intFromRow(
  row: Record<string, string>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = parseInt((row[key] ?? '').replace(/,/g, ''), 10);
    if (Number.isFinite(v)) return v;
  }
  return undefined;
}

export async function fetchKboHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': KBO_FETCH_UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`KBO HTTP ${res.status}: ${url}`);
  }
  return res.text();
}
