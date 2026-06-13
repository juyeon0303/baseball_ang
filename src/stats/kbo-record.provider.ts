import { Injectable, Logger } from '@nestjs/common';
import {
  HitterSeasonStats,
  PitcherSeasonStats,
} from '../games/player-stats.types';

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

export interface KboPitcherSeasonLine {
  ip: number;
  bb: number;
  so: number;
}

export interface KboHitterSeasonLine {
  hr: number;
  games?: number;
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

  async fetchPitcherSeasonLine(
    playerId: number,
  ): Promise<KboPitcherSeasonLine | null> {
    const html = await this.fetchHtml(
      `https://www.koreabaseball.com/Record/Player/PitcherDetail/Basic.aspx?playerId=${playerId}`,
    );
    return this.parsePitcherSeasonLine(html);
  }

  async fetchHitterSeasonLine(
    playerId: number,
  ): Promise<KboHitterSeasonLine | null> {
    const html = await this.fetchHtml(
      `https://www.koreabaseball.com/Record/Player/HitterDetail/Basic.aspx?playerId=${playerId}`,
    );
    return this.parseHitterSeasonLine(html);
  }

  async fetchPitcherEra(playerId: number): Promise<KboPlayerStatRow | null> {
    const stats = await this.fetchPitcherSeasonStats(playerId);
    if (stats?.era == null) return null;
    return {
      playerName: stats.playerName ?? '',
      team: stats.team,
      era: stats.era,
      source: 'kbo_official',
      fetchedAt: stats.fetchedAt,
    };
  }

  async fetchHitterSeasonStats(
    playerId: number,
  ): Promise<(HitterSeasonStats & { playerName?: string; team?: string; fetchedAt: string }) | null> {
    const html = await this.fetchHtml(
      `https://www.koreabaseball.com/Record/Player/HitterDetail/Basic.aspx?playerId=${playerId}`,
    );
    const row = this.parseSeasonRow(html, '출루율+장타율');
    if (!row) return null;
    return {
      playerName: this.parsePlayerName(html),
      team: this.parseTeamCode(html),
      avg: this.num(row, 'AVG', 'HRA_RT'),
      ops: this.num(row, 'OPS'),
      hr: this.int(row, 'HR'),
      rbi: this.int(row, 'RBI'),
      sb: this.int(row, 'SB'),
      games: this.int(row, 'G', 'GAME_CN'),
      ab: this.int(row, 'AB'),
      hits: this.int(row, 'H'),
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchPitcherSeasonStats(
    playerId: number,
  ): Promise<(PitcherSeasonStats & { playerName?: string; team?: string; fetchedAt: string }) | null> {
    const html = await this.fetchHtml(
      `https://www.koreabaseball.com/Record/Player/PitcherDetail/Basic.aspx?playerId=${playerId}`,
    );
    const row = this.parseSeasonRow(html, '평균자책');
    if (!row) return null;
    const ip = this.parseInnings(row['IP'] ?? '0');
    const bb = this.int(row, 'BB') ?? 0;
    const so = this.int(row, 'SO', 'KK') ?? 0;
    const whip =
      ip > 0 && bb >= 0
        ? Math.round(((bb + (this.int(row, 'H') ?? 0)) / ip) * 1000) / 1000
        : undefined;
    return {
      playerName: this.parsePlayerName(html),
      team: this.parseTeamCode(html),
      era: this.num(row, 'ERA'),
      ip,
      w: this.int(row, 'W'),
      l: this.int(row, 'L'),
      so,
      bb,
      whip,
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
    const row = this.parseSeasonRow(html, '출루율+장타율');
    return row ? (this.num(row, 'OPS') ?? null) : null;
  }

  private parsePitcherSeasonLine(html: string): KboPitcherSeasonLine | null {
    for (const table of this.extractTables(html)) {
      if (
        (!table.includes('평균자책') && !table.includes('>ERA<')) ||
        table.includes('최근 10경기')
      ) {
        continue;
      }
      const ths = this.extractThLabels(table);
      const ipIdx = ths.findIndex((h) => h === 'IP');
      const bbIdx = ths.findIndex((h) => h === 'BB');
      const soIdx = ths.findIndex((h) => h === 'SO' || h === 'KK');
      if (ipIdx < 0) continue;
      const cells = this.firstRowCells(table);
      if (!cells) continue;
      const ip = this.parseInnings(cells[ipIdx]);
      const bb = parseInt(cells[bbIdx] ?? '0', 10) || 0;
      const so = parseInt(cells[soIdx] ?? '0', 10) || 0;
      if (ip > 0) return { ip, bb, so };
    }
    return null;
  }

  private parseHitterSeasonLine(html: string): KboHitterSeasonLine | null {
    for (const table of this.extractTables(html)) {
      if (!table.includes('출루율+장타율') || table.includes('최근 10경기')) {
        continue;
      }
      const ths = this.extractThLabels(table);
      const hrIdx = ths.findIndex((h) => h === 'HR');
      const gIdx = ths.findIndex((h) => h === 'G');
      if (hrIdx < 0) continue;
      const cells = this.firstRowCells(table);
      if (!cells) continue;
      const hr = parseInt(cells[hrIdx] ?? '0', 10) || 0;
      const games = gIdx >= 0 ? parseInt(cells[gIdx] ?? '0', 10) || 0 : undefined;
      return { hr, games };
    }
    return null;
  }

  private parseInnings(ipRaw: string): number {
    const s = (ipRaw ?? '').trim();
    if (!s) return 0;
    if (s.includes('.')) {
      const [whole, frac] = s.split('.');
      const outs = parseInt(frac, 10) || 0;
      return (parseInt(whole, 10) || 0) + outs / 3;
    }
    return parseFloat(s) || 0;
  }

  private parseSeasonEra(html: string): number | null {
    const row = this.parseSeasonRow(html, '평균자책');
    return row ? (this.num(row, 'ERA') ?? null) : null;
  }

  private parseSeasonRow(
    html: string,
    marker: string,
  ): Record<string, string> | null {
    for (const table of this.extractTables(html)) {
      if (!table.includes(marker) || table.includes('최근 10경기')) {
        continue;
      }
      const ths = this.extractThLabels(table);
      const cells = this.firstRowCells(table);
      if (!cells?.length || ths.length !== cells.length) continue;
      const row: Record<string, string> = {};
      ths.forEach((label, i) => {
        row[label] = cells[i];
      });
      return row;
    }
    return null;
  }

  private num(row: Record<string, string>, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const v = parseFloat(row[key] ?? '');
      if (Number.isFinite(v)) return v;
    }
    return undefined;
  }

  private int(row: Record<string, string>, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const v = parseInt(row[key] ?? '', 10);
      if (Number.isFinite(v)) return v;
    }
    return undefined;
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
