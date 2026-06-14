import { Injectable, Logger } from '@nestjs/common';
import {
  HitterSeasonStats,
  KboPlayerProfile,
  PitcherSeasonStats,
  StatMetricGroup,
  StatTable,
} from '../games/player-stats.types';
import {
  fetchKboHtml,
  intFromRow,
  numFromRow,
  parseHtmlTables,
  parseInnings,
  parsePlayerName,
  parseTeamCode,
  parseSingleTable,
  extractTables,
  extractThLabels,
  cleanCell,
} from './kbo-html.util';

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

const HITTER_PAGES = ['Basic', 'Daily', 'Situation', 'Total'] as const;
const PITCHER_PAGES = ['Basic', 'Daily', 'Situation', 'Total'] as const;

@Injectable()
export class KboRecordProvider {
  private readonly logger = new Logger(KboRecordProvider.name);
  private readonly season = parseInt(process.env.KBO_STATS_SEASON ?? '2026', 10);

  async fetchFullPlayerProfile(
    playerId: number,
    role: 'hitter' | 'pitcher',
  ): Promise<KboPlayerProfile | null> {
    const pages = role === 'pitcher' ? PITCHER_PAGES : HITTER_PAGES;
    const base = role === 'pitcher' ? 'PitcherDetail' : 'HitterDetail';
    const tables: StatTable[] = [];
    let playerName: string | undefined;
    let team: string | undefined;

    for (const page of pages) {
      try {
        const url = `https://www.koreabaseball.com/Record/Player/${base}/${page}.aspx?playerId=${playerId}`;
        const html = await fetchKboHtml(url);
        playerName = playerName ?? parsePlayerName(html);
        team = team ?? parseTeamCode(html);
        for (const t of parseHtmlTables(html)) {
          tables.push({
            source: 'kbo_official',
            page,
            title: t.title,
            headers: t.headers,
            rows: t.rows,
          });
        }
      } catch (e) {
        this.logger.debug(`KBO ${page} 스킵 playerId=${playerId}: ${e}`);
      }
    }

    if (!tables.length) return null;

    const groups = this.buildMetricGroups(tables, role);
    const summary = this.buildSummaryFromTables(tables, role);

    return {
      kboPlayerId: playerId,
      name: playerName ?? '',
      team,
      role,
      season: this.season,
      tables,
      groups,
      summary,
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchHitterOps(playerId: number): Promise<KboPlayerStatRow | null> {
    const html = await fetchKboHtml(
      `https://www.koreabaseball.com/Record/Player/HitterDetail/Basic.aspx?playerId=${playerId}`,
    );
    const ops = this.parseSeasonOps(html);
    if (ops == null) return null;
    return {
      playerName: parsePlayerName(html) ?? '',
      team: parseTeamCode(html),
      ops,
      source: 'kbo_official',
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchPitcherSeasonLine(
    playerId: number,
  ): Promise<KboPitcherSeasonLine | null> {
    const html = await fetchKboHtml(
      `https://www.koreabaseball.com/Record/Player/PitcherDetail/Basic.aspx?playerId=${playerId}`,
    );
    return this.parsePitcherSeasonLine(html);
  }

  async fetchHitterSeasonLine(
    playerId: number,
  ): Promise<KboHitterSeasonLine | null> {
    const html = await fetchKboHtml(
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
    const profile = await this.fetchFullPlayerProfile(playerId, 'hitter');
    if (!profile?.summary || profile.role !== 'hitter') return null;
    const s = profile.summary as HitterSeasonStats;
    return {
      playerName: profile.name,
      team: profile.team,
      ...s,
      fetchedAt: profile.fetchedAt,
    };
  }

  async fetchPitcherSeasonStats(
    playerId: number,
  ): Promise<(PitcherSeasonStats & { playerName?: string; team?: string; fetchedAt: string }) | null> {
    const profile = await this.fetchFullPlayerProfile(playerId, 'pitcher');
    if (!profile?.summary || profile.role !== 'pitcher') return null;
    const s = profile.summary as PitcherSeasonStats;
    return {
      playerName: profile.name,
      team: profile.team,
      ...s,
      fetchedAt: profile.fetchedAt,
    };
  }

  private buildMetricGroups(
    tables: StatTable[],
    role: 'hitter' | 'pitcher',
  ): StatMetricGroup[] {
    const groups: StatMetricGroup[] = [];
    for (const table of tables) {
      const label = [table.page, table.title].filter(Boolean).join(' · ');
      const metrics: Record<string, string | number> = {};
      const row = table.rows[0];
      if (!row) continue;
      for (const h of table.headers) {
        const v = row[h];
        if (v == null || v === '' || v === '-') continue;
        const n = parseFloat(v.replace(/,/g, ''));
        metrics[h] = Number.isFinite(n) && !/^0\d/.test(v) ? n : v;
      }
      if (Object.keys(metrics).length) {
        groups.push({
          id: `${table.source}_${table.page}_${groups.length}`,
          label: label || table.page,
          source: table.source,
          metrics,
        });
      }
    }

    if (role === 'hitter') {
      const adv = this.computeHitterAdvanced(tables);
      if (Object.keys(adv).length) {
        groups.push({
          id: 'computed_advanced',
          label: '고급 · KBO 기반 추정',
          source: 'computed',
          metrics: adv,
        });
      }
    } else {
      const adv = this.computePitcherAdvanced(tables);
      if (Object.keys(adv).length) {
        groups.push({
          id: 'computed_advanced',
          label: '고급 · KBO 기반 추정',
          source: 'computed',
          metrics: adv,
        });
      }
    }
    return groups;
  }

  private buildSummaryFromTables(
    tables: StatTable[],
    role: 'hitter' | 'pitcher',
  ): HitterSeasonStats | PitcherSeasonStats | undefined {
    const basic = tables.find(
      (t) =>
        t.page === 'Basic' &&
        (t.headers.includes('OPS') || t.headers.includes('ERA')),
    );
    const row = basic?.rows[0];
    if (!row) return undefined;

    if (role === 'pitcher') {
      const ip = parseInnings(row['IP'] ?? '0');
      const bb = intFromRow(row, 'BB') ?? 0;
      const h = intFromRow(row, 'H') ?? 0;
      const whip = ip > 0 ? Math.round(((bb + h) / ip) * 1000) / 1000 : undefined;
      return {
        era: numFromRow(row, 'ERA'),
        ip,
        w: intFromRow(row, 'W'),
        l: intFromRow(row, 'L'),
        so: intFromRow(row, 'SO', 'KK'),
        bb,
        whip,
      };
    }

    return {
      avg: numFromRow(row, 'AVG', 'HRA_RT'),
      ops: numFromRow(row, 'OPS'),
      hr: intFromRow(row, 'HR'),
      rbi: intFromRow(row, 'RBI'),
      sb: intFromRow(row, 'SB'),
      games: intFromRow(row, 'G', 'GAME_CN'),
      ab: intFromRow(row, 'AB'),
      hits: intFromRow(row, 'H'),
      obp: numFromRow(row, 'OBP'),
      slg: numFromRow(row, 'SLG'),
      pa: intFromRow(row, 'PA'),
    };
  }

  private computeHitterAdvanced(
    tables: StatTable[],
  ): Record<string, number | string> {
    const basic = tables.find((t) => t.page === 'Basic' && t.headers.includes('OPS'));
    const row = basic?.rows[0];
    if (!row) return {};
    const avg = numFromRow(row, 'AVG', 'HRA_RT');
    const slg = numFromRow(row, 'SLG');
    const obp = numFromRow(row, 'OBP');
    const ab = intFromRow(row, 'AB');
    const h = intFromRow(row, 'H');
    const hr = intFromRow(row, 'HR');
    const so = intFromRow(row, 'SO', 'KK');
    const bb = intFromRow(row, 'BB');
    const out: Record<string, number | string> = {};
    if (avg != null && slg != null) {
      out['ISO'] = Math.round((slg - avg) * 1000) / 1000;
    }
    if (ab && h != null && hr != null && so != null) {
      const denom = ab - hr - so + (so > 0 ? 0 : 0);
      if (denom > 0) {
        out['BABIP_est'] = Math.round(((h - hr) / denom) * 1000) / 1000;
      }
    }
    if (so != null && ab) out['K%'] = Math.round((so / ab) * 1000) / 10;
    if (bb != null && ab) out['BB%'] = Math.round((bb / ab) * 1000) / 10;
    if (obp != null && slg != null) {
      out['OPS'] = numFromRow(row, 'OPS') ?? Math.round((obp + slg) * 1000) / 1000;
    }
    return out;
  }

  private computePitcherAdvanced(
    tables: StatTable[],
  ): Record<string, number | string> {
    const basic = tables.find((t) => t.page === 'Basic' && t.headers.includes('ERA'));
    const row = basic?.rows[0];
    if (!row) return {};
    const ip = parseInnings(row['IP'] ?? '0');
    const so = intFromRow(row, 'SO', 'KK') ?? 0;
    const bb = intFromRow(row, 'BB') ?? 0;
    const h = intFromRow(row, 'H') ?? 0;
    const hr = intFromRow(row, 'HR') ?? 0;
    const out: Record<string, number | string> = {};
    if (ip > 0) {
      out['K/9'] = Math.round((so / ip) * 9 * 10) / 10;
      out['BB/9'] = Math.round((bb / ip) * 9 * 10) / 10;
      out['WHIP'] = Math.round(((bb + h) / ip) * 1000) / 1000;
      out['HR/9'] = Math.round((hr / ip) * 9 * 100) / 100;
      if (bb > 0) out['K/BB'] = Math.round((so / bb) * 100) / 100;
    }
    return out;
  }

  private parseSeasonOps(html: string): number | null {
    const row = this.parseSeasonRow(html, '출루율+장타율');
    return row ? (numFromRow(row, 'OPS') ?? null) : null;
  }

  private parsePitcherSeasonLine(html: string): KboPitcherSeasonLine | null {
    for (const table of extractTables(html)) {
      if (
        (!table.includes('평균자책') && !table.includes('>ERA<')) ||
        table.includes('최근 10경기')
      ) {
        continue;
      }
      const ths = extractThLabels(table);
      const ipIdx = ths.findIndex((h) => h === 'IP');
      const bbIdx = ths.findIndex((h) => h === 'BB');
      const soIdx = ths.findIndex((h) => h === 'SO' || h === 'KK');
      if (ipIdx < 0) continue;
      const cells = this.firstRowCells(table);
      if (!cells) continue;
      const ip = parseInnings(cells[ipIdx]);
      const bb = parseInt(cells[bbIdx] ?? '0', 10) || 0;
      const so = parseInt(cells[soIdx] ?? '0', 10) || 0;
      if (ip > 0) return { ip, bb, so };
    }
    return null;
  }

  private parseHitterSeasonLine(html: string): KboHitterSeasonLine | null {
    for (const table of extractTables(html)) {
      if (!table.includes('출루율+장타율') || table.includes('최근 10경기')) {
        continue;
      }
      const ths = extractThLabels(table);
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

  private parseSeasonRow(
    html: string,
    marker: string,
  ): Record<string, string> | null {
    for (const table of extractTables(html)) {
      if (!table.includes(marker) || table.includes('최근 10경기')) {
        continue;
      }
      const parsed = parseSingleTable(table);
      return parsed?.rows[0] ?? null;
    }
    return null;
  }

  private firstRowCells(table: string): string[] | null {
    const body = table.match(/<tbody>[\s\S]*?<\/tbody>/);
    if (!body) return null;
    const row = body[0].match(/<tr>[\s\S]*?<\/tr>/);
    if (!row) return null;
    return [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      cleanCell(m[1]),
    );
  }
}
