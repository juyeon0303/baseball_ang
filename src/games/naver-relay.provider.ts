import { Injectable, Logger } from '@nestjs/common';
import { GameSituation, PlayFeedItem, PlayRelayKind } from './games.types';

const NAVER_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-relay)';

interface NaverGameState {
  homeScore?: string;
  awayScore?: string;
  pitcher?: string;
  batter?: string;
  strike?: string;
  ball?: string;
  out?: string;
  base1?: string;
  base2?: string;
  base3?: string;
}

interface NaverTextOption {
  seqno?: number;
  text?: string;
  type?: number;
  currentGameState?: NaverGameState;
  batterRecord?: { name?: string };
  currentPlayersInfo?: {
    away?: { playerName?: string; name?: string };
    home?: { playerName?: string; name?: string };
  };
}

interface NaverTextRelay {
  title?: string;
  inn?: number;
  homeOrAway?: string;
  textOptions?: NaverTextOption[];
}

export interface NaverRelayParseResult {
  situation: GameSituation;
  batter?: string;
  pitcher?: string;
  inningLabel?: string;
  lastPitch?: string;
  recentPitches: string[];
  lastPlay?: string;
  lastPlayKind?: PlayRelayKind;
  lastPlayType?: string;
  maxSeqno: number;
  newPlays: PlayFeedItem[];
}

export interface NaverRelayArchiveResult extends NaverRelayParseResult {
  allPlays: PlayFeedItem[];
}

@Injectable()
export class NaverRelayProvider {
  private readonly logger = new Logger(NaverRelayProvider.name);

  async fetchRelay(naverGameId: string): Promise<unknown | null> {
    try {
      const res = await fetch(
        `https://api-gw.sports.naver.com/schedule/games/${encodeURIComponent(naverGameId)}/relay`,
        {
          headers: {
            'User-Agent': NAVER_UA,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) {
        this.logger.debug(`Naver relay HTTP ${res.status} ${naverGameId}`);
        return null;
      }
      const body = (await res.json()) as {
        success?: boolean;
        result?: { textRelayData?: Record<string, unknown> };
      };
      if (!body.success || !body.result?.textRelayData) return null;
      return body.result.textRelayData;
    } catch (e) {
      this.logger.debug(`Naver relay fetch failed ${naverGameId}: ${e}`);
      return null;
    }
  }

  parseRelay(
    gameId: string,
    naverGameId: string,
    data: Record<string, unknown>,
    lastSeqno: number,
    teamNames: { away: string; home: string },
    playSeqStart: number,
  ): NaverRelayParseResult | null {
    const current = data.currentGameState as NaverGameState | undefined;
    const relays = (data.textRelays as NaverTextRelay[]) ?? [];
    const inn = Number(data.inn) || current ? undefined : undefined;
    const homeOrAway = String(data.homeOrAway ?? '');
    const inningLabel = this.formatInningLabel(
      Number(data.inn ?? inn ?? 0),
      homeOrAway,
      teamNames,
    );

    const situation = this.parseSituation(current, inningLabel);
    if (!situation) return null;

    let batter = this.findActiveName(data, 'batter');
    let pitcher = this.findActiveName(data, 'pitcher');
    let lastPitch: string | undefined;
    const recentPitches: string[] = [];
    let lastPlay: string | undefined;
    let lastPlayKind: PlayRelayKind | undefined;
    let lastPlayType: string | undefined;
    let maxSeqno = lastSeqno;
    const newPlays: PlayFeedItem[] = [];
    let seq = playSeqStart;

    for (const relay of relays) {
      for (const opt of relay.textOptions ?? []) {
        const sn = opt.seqno ?? 0;
        if (sn <= lastSeqno) continue;
        maxSeqno = Math.max(maxSeqno, sn);

        const text = (opt.text ?? relay.title ?? '').trim();
        if (!text) continue;

        const kind = this.mapRelayKind(opt.type);
        const classified = this.classifyPlayText(text, kind);

        if (opt.type === 1) {
          lastPitch = text;
          recentPitches.push(text);
          continue;
        }

        if (opt.type === 8) {
          batter = text.replace(/^\d+번타자\s*/, '').replace(/^대타\s*/, '').trim() || batter;
          continue;
        }

        if (kind === 'pitch' || kind === 'info') continue;

        lastPlay = text;
        lastPlayKind = classified.kind;
        lastPlayType = classified.type;

        if (opt.currentGameState) {
          const gs = this.parseSituation(opt.currentGameState, inningLabel);
          if (gs) Object.assign(situation, gs);
        }

        const impact = this.mapImpact(classified.kind);
        newPlays.push({
          id: `relay-${++seq}`,
          gameId,
          at: new Date().toISOString(),
          text,
          team: this.inferTeam(text, teamNames, homeOrAway),
          impact,
          relayKind: classified.kind,
          playType: classified.type,
          inning: inningLabel,
          balls: situation.balls,
          strikes: situation.strikes,
          outs: situation.outs,
          bases: { ...situation.bases },
          seqno: sn,
          source: 'naver_relay',
        });
      }
    }

    while (recentPitches.length > 8) recentPitches.shift();

    return {
      situation,
      batter,
      pitcher,
      inningLabel,
      lastPitch,
      recentPitches,
      lastPlay,
      lastPlayKind,
      lastPlayType,
      maxSeqno,
      newPlays,
    };
  }

  parseRelayArchive(
    gameId: string,
    naverGameId: string,
    data: Record<string, unknown>,
    teamNames: { away: string; home: string },
    playSeqStart: number,
  ): NaverRelayArchiveResult | null {
    const current = data.currentGameState as NaverGameState | undefined;
    const relays = (data.textRelays as NaverTextRelay[]) ?? [];
    const topInningLabel = this.formatInningLabel(
      Number(data.inn ?? 0),
      String(data.homeOrAway ?? ''),
      teamNames,
    );

    let situation = this.parseSituation(current, topInningLabel);
    if (!situation) return null;

    let batter = this.findActiveName(data, 'batter');
    let pitcher = this.findActiveName(data, 'pitcher');
    let lastPitch: string | undefined;
    const recentPitches: string[] = [];
    let lastPlay: string | undefined;
    let lastPlayKind: PlayRelayKind | undefined;
    let lastPlayType: string | undefined;
    let maxSeqno = 0;
    let inningLabel = topInningLabel;
    const allPlays: PlayFeedItem[] = [];
    let seq = playSeqStart;

    for (const relay of relays) {
      const relayInning = this.formatInningLabel(
        Number(relay.inn ?? 0),
        String(relay.homeOrAway ?? ''),
        teamNames,
      );
      if (relayInning) inningLabel = relayInning;

      for (const opt of relay.textOptions ?? []) {
        const sn = opt.seqno ?? 0;
        maxSeqno = Math.max(maxSeqno, sn);

        const text = (opt.text ?? relay.title ?? '').trim();
        if (!text) continue;

        const kind = this.mapRelayKind(opt.type);
        const classified = this.classifyPlayText(text, kind);

        if (opt.type === 1) {
          lastPitch = text;
          recentPitches.push(text);
          allPlays.push({
            id: `relay-${++seq}`,
            gameId,
            at: new Date().toISOString(),
            text,
            relayKind: 'pitch',
            playType: '투구',
            inning: inningLabel,
            balls: situation.balls,
            strikes: situation.strikes,
            outs: situation.outs,
            bases: { ...situation.bases },
            seqno: sn,
            source: 'naver_relay',
          });
          continue;
        }

        if (opt.type === 8) {
          batter =
            text.replace(/^\d+번타자\s*/, '').replace(/^대타\s*/, '').trim() ||
            batter;
          continue;
        }

        if (opt.currentGameState) {
          const gs = this.parseSituation(opt.currentGameState, inningLabel);
          if (gs) {
            situation = gs;
            situation.inning = inningLabel;
          }
        }

        if (kind === 'info') continue;

        lastPlay = text;
        lastPlayKind = classified.kind;
        lastPlayType = classified.type;

        const impact = this.mapImpact(classified.kind);
        allPlays.push({
          id: `relay-${++seq}`,
          gameId,
          at: new Date().toISOString(),
          text,
          team: this.inferTeam(
            text,
            teamNames,
            String(relay.homeOrAway ?? ''),
          ),
          impact,
          relayKind: classified.kind,
          playType: classified.type,
          inning: inningLabel,
          balls: situation.balls,
          strikes: situation.strikes,
          outs: situation.outs,
          bases: { ...situation.bases },
          seqno: sn,
          source: 'naver_relay',
        });
      }
    }

    while (recentPitches.length > 8) recentPitches.shift();
    situation.inning = inningLabel ?? topInningLabel;

    return {
      situation,
      batter,
      pitcher,
      inningLabel: inningLabel ?? topInningLabel,
      lastPitch,
      recentPitches,
      lastPlay,
      lastPlayKind,
      lastPlayType,
      maxSeqno,
      newPlays: allPlays,
      allPlays,
    };
  }

  private parseSituation(
    raw: NaverGameState | undefined,
    inning?: string,
  ): GameSituation | null {
    if (!raw) return null;
    const balls = this.clamp(raw.ball, 0, 3);
    const strikes = this.clamp(raw.strike, 0, 2);
    const outs = this.clamp(raw.out, 0, 3);
    return {
      balls,
      strikes,
      outs: Math.min(outs, 2),
      bases: {
        first: this.baseOccupied(raw.base1),
        second: this.baseOccupied(raw.base2),
        third: this.baseOccupied(raw.base3),
      },
      countText: `${balls}-${strikes}`,
      inning,
    };
  }

  private baseOccupied(v: string | undefined): boolean {
    if (!v || v === '0') return false;
    return true;
  }

  private clamp(v: string | undefined, min: number, max: number): number {
    const n = parseInt(String(v ?? '0'), 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  private formatInningLabel(
    inn: number,
    homeOrAway: string,
    teams: { away: string; home: string },
  ): string | undefined {
    if (!inn) return undefined;
    const half = homeOrAway === '1' ? '▼' : '▲';
    return `${half}${inn}`;
  }

  private findActiveName(
    data: Record<string, unknown>,
    role: 'batter' | 'pitcher',
  ): string | undefined {
    const entryKey = role === 'batter' ? 'awayEntry' : 'homeEntry';
    const entry = data[entryKey] as
      | { batter?: Array<{ name?: string }>; pitcher?: Array<{ name?: string }> }
      | undefined;
    const list = role === 'batter' ? entry?.batter : entry?.pitcher;
    return list?.[0]?.name?.trim();
  }

  private mapRelayKind(type?: number): PlayRelayKind {
    switch (type) {
      case 0:
        return 'inning';
      case 1:
        return 'pitch';
      case 2:
        return 'sub';
      case 7:
        return 'visit';
      case 8:
        return 'info';
      case 13:
        return 'result';
      case 14:
        return 'advance';
      case 23:
        return 'hbp';
      case 24:
        return 'run';
      case 99:
        return 'game_end';
      default:
        return 'info';
    }
  }

  private classifyPlayText(
    text: string,
    kind: PlayRelayKind,
  ): { kind: PlayRelayKind; type?: string } {
    if (kind === 'run' || /홈인/.test(text)) return { kind: 'run', type: '득점' };
    if (/홈런/.test(text)) return { kind: 'result', type: '홈런' };
    if (/삼진/.test(text)) return { kind: 'result', type: '삼진' };
    if (/볼넷|4구/.test(text)) return { kind: 'result', type: '볼넷' };
    if (/몸에\s*맞/.test(text)) return { kind: 'hbp', type: '사구' };
    if (/2루타/.test(text)) return { kind: 'result', type: '2루타' };
    if (/3루타/.test(text)) return { kind: 'result', type: '3루타' };
    if (/1루타|안타/.test(text)) return { kind: 'result', type: '안타' };
    if (/땅볼|플라이|파울|실책|희생/.test(text)) return { kind: 'result', type: text.split(':').pop()?.trim()?.slice(0, 12) };
    if (/도루|진루|포스아웃|아웃/.test(text)) return { kind: 'advance', type: '주자' };
    if (/^\d+구/.test(text)) return { kind: 'pitch', type: '투구' };
    if (/회초|회말/.test(text)) return { kind: 'inning', type: '이닝' };
    return { kind, type: kind === 'sub' ? '교체' : undefined };
  }

  private mapImpact(kind: PlayRelayKind): PlayFeedItem['impact'] {
    if (kind === 'run') return 'run';
    if (kind === 'game_end') return 'game_end';
    if (kind === 'inning') return 'inning';
    return 'inning';
  }

  private inferTeam(
    text: string,
    teams: { away: string; home: string },
    homeOrAway: string,
  ): string | undefined {
    if (text.includes(teams.away)) return teams.away;
    if (text.includes(teams.home)) return teams.home;
    return homeOrAway === '1' ? teams.home : teams.away;
  }
}
