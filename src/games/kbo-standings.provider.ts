import { Injectable, Logger } from '@nestjs/common';
import { TeamStandingRow } from './games.types';

const KBO_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-standings)';

const KNOWN_TEAMS = new Set([
  'LG',
  'KT',
  '삼성',
  'KIA',
  '한화',
  '두산',
  'NC',
  'SSG',
  '롯데',
  '키움',
]);

const TEAM_ALIASES: Record<string, string> = {
  SK: 'SSG',
  SSG: 'SSG',
  Wiz: '키움',
  WO: '키움',
};

export interface KboStandingsSnapshot {
  seasonLabel: string;
  updatedAt: string;
  source: 'kbo_official';
  rows: TeamStandingRow[];
}

@Injectable()
export class KboStandingsProvider {
  private readonly logger = new Logger(KboStandingsProvider.name);
  private cache: KboStandingsSnapshot | null = null;
  private cacheAt = 0;
  private readonly ttlMs = 5 * 60 * 1000;

  async getStandings(force = false): Promise<KboStandingsSnapshot> {
    if (
      !force &&
      this.cache &&
      Date.now() - this.cacheAt < this.ttlMs
    ) {
      return this.cache;
    }
    const html = await this.fetchHtml(
      'https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx',
    );
    const rows = this.parseStandingsHtml(html);
    if (!rows.length) {
      throw new Error('KBO team standings parse failed');
    }
    const snap: KboStandingsSnapshot = {
      seasonLabel: this.parseSeasonLabel(html),
      updatedAt: new Date().toISOString(),
      source: 'kbo_official',
      rows,
    };
    this.cache = snap;
    this.cacheAt = Date.now();
    return snap;
  }

  private parseSeasonLabel(html: string): string {
    const m = html.match(/(\d{4})\s*시즌/);
    if (m) return `${m[1]} KBO 정규시즌`;
    return 'KBO 정규시즌';
  }

  private parseStandingsHtml(html: string): TeamStandingRow[] {
    const rows: TeamStandingRow[] = [];
    for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => c[1].replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
      if (cells.length < 7) continue;

      const rank = parseInt(cells[0], 10);
      const team = this.normalizeTeam(cells[1]);
      if (!Number.isFinite(rank) || rank < 1 || rank > 10) continue;
      if (!KNOWN_TEAMS.has(team)) continue;

      rows.push({
        rank,
        team,
        games: parseInt(cells[2], 10) || 0,
        wins: parseInt(cells[3], 10) || 0,
        losses: parseInt(cells[4], 10) || 0,
        draws: parseInt(cells[5], 10) || 0,
        pct: parseFloat(cells[6]) || 0,
        gb: parseFloat(cells[7] ?? '0') || 0,
        streak: cells[8],
      });
    }
    return rows.sort((a, b) => a.rank - b.rank);
  }

  private normalizeTeam(raw: string): string {
    const t = raw.trim();
    return TEAM_ALIASES[t] ?? t;
  }

  private async fetchHtml(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': KBO_UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`KBO standings HTTP ${res.status}`);
      }
      return res.text();
    } catch (e) {
      this.logger.warn(`KBO standings fetch failed: ${e}`);
      throw e;
    }
  }
}
