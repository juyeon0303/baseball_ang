import { Injectable, Logger } from '@nestjs/common';

const KBO_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-oracle-sync)';

export interface KboPlayerStatRow {
  playerName: string;
  team?: string;
  ops?: number;
  era?: number;
  source: 'kbo_official';
  fetchedAt: string;
}

@Injectable()
export class KboRecordProvider {
  private readonly logger = new Logger(KboRecordProvider.name);

  async fetchHitterOps(playerId: number): Promise<KboPlayerStatRow | null> {
    const html = await this.fetchHtml(
      `https://www.koreabaseball.com/Record/Player/HitterDetail/Basic.aspx?playerId=${playerId}`,
    );
    const ops = this.parseSeasonOps(html);
    if (ops == null) return null;
    return {
      playerName: this.parsePlayerName(html) ?? '',
      team: this.parseTeamCode(html),
      ops,
      source: 'kbo_official',
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchPitcherEra(playerId: number): Promise<KboPlayerStatRow | null> {
    const html = await this.fetchHtml(
      `https://www.koreabaseball.com/Record/Player/PitcherDetail/Basic.aspx?playerId=${playerId}`,
    );
    const era = this.parseSeasonEra(html);
    if (era == null) return null;
    return {
      playerName: this.parsePlayerName(html) ?? '',
      team: this.parseTeamCode(html),
      era,
      source: 'kbo_official',
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': KBO_UA },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(`KBO HTTP ${res.status}: ${url}`);
    }
    return res.text();
  }

  private parsePlayerName(html: string): string | undefined {
    const m = html.match(/선수명:\s*([^<\n]+)/);
    return m?.[1]?.trim();
  }

  private parseTeamCode(html: string): string | undefined {
    const m = html.match(
      /<th>(KIA|KT|LG|NC|SSG|두산|롯데|삼성|한화|키움)<\/th>/,
    );
    return m?.[1];
  }

  private parseSeasonOps(html: string): number | null {
    for (const table of this.extractTables(html)) {
      if (!table.includes('출루율+장타율') || table.includes('최근 10경기')) {
        continue;
      }
      const ths = this.extractThLabels(table);
      const opsIdx = ths.findIndex((h) => h === 'OPS');
      if (opsIdx < 0) continue;
      const cells = this.firstRowCells(table);
      if (cells && cells.length > opsIdx) {
        const v = parseFloat(cells[opsIdx]);
        return Number.isFinite(v) ? v : null;
      }
    }
    return null;
  }

  private parseSeasonEra(html: string): number | null {
    for (const table of this.extractTables(html)) {
      if (
        (!table.includes('평균자책') && !table.includes('>ERA<')) ||
        table.includes('최근 10경기')
      ) {
        continue;
      }
      const ths = this.extractThLabels(table);
      const eraIdx = ths.findIndex((h) => h === 'ERA');
      if (eraIdx < 0) continue;
      const cells = this.firstRowCells(table);
      if (cells && cells.length > eraIdx) {
        const v = parseFloat(cells[eraIdx]);
        return Number.isFinite(v) ? v : null;
      }
    }
    return null;
  }

  private extractTables(html: string): string[] {
    return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
  }

  private extractThLabels(table: string): string[] {
    return [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').trim(),
    );
  }

  private firstRowCells(table: string): string[] | null {
    const body = table.match(/<tbody>[\s\S]*?<\/tbody>/);
    if (!body) return null;
    const row = body[0].match(/<tr>[\s\S]*?<\/tr>/);
    if (!row) return null;
    return [...row[0].matchAll(/<td[^>]*>([^<]*)</g)].map((m) => m[1].trim());
  }
}
