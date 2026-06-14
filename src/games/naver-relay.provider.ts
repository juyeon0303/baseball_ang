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
  awayScore?: number;
  homeScore?: number;
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
    return this.fetchRelayInning(naverGameId);
  }

  /** Fetch relay for every inning (Naver default returns only the latest inning). */
  async fetchRelayFull(naverGameId: string): Promise<Record<string, unknown> | null> {
    const latest = await this.fetchRelayInning(naverGameId);
    if (!latest) return null;

    const maxInning = this.resolveMaxInning(latest);
    const inningData = await Promise.all(
      Array.from({ length: maxInning }, (_, i) =>
        this.fetchRelayInning(naverGameId, i + 1),
      ),
    );

    const relayChunks = inningData
      .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
      .map((d) => (d.textRelays as NaverTextRelay[]) ?? []);

    return {
      ...latest,
      textRelays: this.mergeTextRelays(relayChunks),
    };
  }

  private async fetchRelayInning(
    naverGameId: string,
    inning?: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const qs =
        inning != null && inning > 0
          ? `?inning=${encodeURIComponent(String(inning))}`
          : '';
      const res = await fetch(
        `https://api-gw.sports.naver.com/schedule/games/${encodeURIComponent(naverGameId)}/relay${qs}`,
        {
          headers: {
            'User-Agent': NAVER_UA,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(35_000),
        },
      );
      if (!res.ok) {
        this.logger.debug(`Naver relay HTTP ${res.status} ${naverGameId}${qs}`);
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

  private resolveMaxInning(data: Record<string, unknown>): number {
    let max = Math.max(9, Number(data.inn) || 0);
    const inningScore = data.inningScore as
      | { home?: Record<string, string>; away?: Record<string, string> }
      | undefined;
    for (const side of [inningScore?.home, inningScore?.away]) {
      if (!side) continue;
      for (const key of Object.keys(side)) {
        const n = parseInt(key, 10);
        if (Number.isFinite(n)) max = Math.max(max, n);
      }
    }
    return Math.min(max, 15);
  }

  private mergeTextRelays(relayChunks: NaverTextRelay[][]): NaverTextRelay[] {
    const relayKey = (r: NaverTextRelay) =>
      `${r.inn ?? 0}:${r.homeOrAway ?? ''}:${r.title ?? ''}`;
    const relayMap = new Map<string, NaverTextRelay>();

    for (const relays of relayChunks) {
      for (const relay of relays) {
        const key = relayKey(relay);
        let merged = relayMap.get(key);
        if (!merged) {
          merged = { ...relay, textOptions: [] };
          relayMap.set(key, merged);
        }
        const seen = new Set((merged.textOptions ?? []).map((o) => o.seqno));
        for (const opt of relay.textOptions ?? []) {
          if (opt.seqno == null || seen.has(opt.seqno)) continue;
          merged.textOptions!.push(opt);
          seen.add(opt.seqno);
        }
      }
    }

    return Array.from(relayMap.values())
      .sort((a, b) => {
        const innDiff = (a.inn ?? 0) - (b.inn ?? 0);
        if (innDiff) return innDiff;
        return String(a.homeOrAway ?? '').localeCompare(String(b.homeOrAway ?? ''));
      })
      .map((relay) => ({
        ...relay,
        textOptions: [...(relay.textOptions ?? [])].sort(
          (a, b) => (a.seqno ?? 0) - (b.seqno ?? 0),
        ),
      }));
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

    let awayScore = this.parseScores(current).awayScore;
    let homeScore = this.parseScores(current).homeScore;

    let { batter, pitcher } = this.resolveActivePlayers(data);
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
          if (opt.currentGameState) {
            const gs = this.parseSituation(opt.currentGameState, inningLabel);
            if (gs) Object.assign(situation, gs);
            const scores = this.parseScores(opt.currentGameState);
            if (scores.awayScore != null) awayScore = scores.awayScore;
            if (scores.homeScore != null) homeScore = scores.homeScore;
          }
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
          const scores = this.parseScores(opt.currentGameState);
          if (scores.awayScore != null) awayScore = scores.awayScore;
          if (scores.homeScore != null) homeScore = scores.homeScore;
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

    const latestSituation = this.parseSituation(current, inningLabel);
    if (latestSituation) Object.assign(situation, latestSituation);

    const relayBatter = this.resolveLatestBatterFromRelays(relays);
    if (relayBatter) batter = relayBatter;

    const latestPitch = this.resolveLatestPitchFromRelays(relays);
    if (latestPitch) lastPitch = latestPitch;

    const atBatPitches = this.resolveCurrentAtBatPitches(relays, inningLabel);
    if (atBatPitches.length) {
      recentPitches.length = 0;
      recentPitches.push(...atBatPitches);
      while (recentPitches.length > 12) recentPitches.shift();
    }

    const active = this.resolveActivePlayers(data);
    if (active.batter) batter = active.batter;
    if (active.pitcher) pitcher = active.pitcher;

    return {
      situation,
      batter,
      pitcher,
      awayScore,
      homeScore,
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

    let { batter, pitcher } = this.resolveActivePlayers(data);
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
          if (opt.currentGameState) {
            const gs = this.parseSituation(opt.currentGameState, inningLabel);
            if (gs) {
              situation = gs;
              situation.inning = inningLabel;
            }
          }
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

    const latestSituation = this.parseSituation(current, inningLabel ?? topInningLabel);
    if (latestSituation) Object.assign(situation, latestSituation);

    const relayBatter = this.resolveLatestBatterFromRelays(relays);
    if (relayBatter) batter = relayBatter;

    const latestPitch = this.resolveLatestPitchFromRelays(relays);
    if (latestPitch) lastPitch = latestPitch;

    const atBatPitches = this.resolveCurrentAtBatPitches(relays, inningLabel);
    if (atBatPitches.length) {
      recentPitches.length = 0;
      recentPitches.push(...atBatPitches);
      while (recentPitches.length > 12) recentPitches.shift();
    }

    const active = this.resolveActivePlayers(data);
    if (active.batter) batter = active.batter;
    if (active.pitcher) pitcher = active.pitcher;

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

  private parseScores(raw: NaverGameState | undefined): {
    awayScore?: number;
    homeScore?: number;
  } {
    if (!raw) return {};
    const away = parseInt(String(raw.awayScore ?? ''), 10);
    const home = parseInt(String(raw.homeScore ?? ''), 10);
    return {
      awayScore: Number.isFinite(away) ? away : undefined,
      homeScore: Number.isFinite(home) ? home : undefined,
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

  private resolveActivePlayers(data: Record<string, unknown>): {
    batter?: string;
    pitcher?: string;
  } {
    const current = data.currentGameState as NaverGameState | undefined;
    const homeOrAway = String(data.homeOrAway ?? '');
    const isHomeBatting = homeOrAway === '1';

    let batter = current?.batter?.trim();
    let pitcher = current?.pitcher?.trim();

    type Entry = {
      batter?: Array<{ name?: string }>;
      pitcher?: Array<{ name?: string }>;
    };

    if (!batter) {
      const entryKey = isHomeBatting ? 'homeEntry' : 'awayEntry';
      const entry = data[entryKey] as Entry | undefined;
      batter = entry?.batter?.[0]?.name?.trim();
    }
    if (!pitcher) {
      const entryKey = isHomeBatting ? 'awayEntry' : 'homeEntry';
      const entry = data[entryKey] as Entry | undefined;
      pitcher = entry?.pitcher?.[0]?.name?.trim();
    }

    return { batter, pitcher };
  }

  private resolveLatestBatterFromRelays(
    relays: NaverTextRelay[],
  ): string | undefined {
    let latest: string | undefined;
    let latestSeq = -1;
    for (const relay of relays) {
      for (const opt of relay.textOptions ?? []) {
        if (opt.type !== 8) continue;
        const text = (opt.text ?? relay.title ?? '').trim();
        if (!text) continue;
        const name = text
          .replace(/^\d+번타자\s*/, '')
          .replace(/^대타\s*/, '')
          .trim();
        if (!name) continue;
        const sn = opt.seqno ?? 0;
        if (sn >= latestSeq) {
          latestSeq = sn;
          latest = name;
        }
      }
    }
    return latest;
  }

  private resolveLatestPitchFromRelays(
    relays: NaverTextRelay[],
  ): string | undefined {
    let latest: string | undefined;
    let latestSeq = -1;
    for (const relay of relays) {
      for (const opt of relay.textOptions ?? []) {
        if (opt.type !== 1) continue;
        const text = (opt.text ?? relay.title ?? '').trim();
        if (!text) continue;
        const sn = opt.seqno ?? 0;
        if (sn >= latestSeq) {
          latestSeq = sn;
          latest = text;
        }
      }
    }
    return latest;
  }

  private resolveCurrentAtBatPitches(
    relays: NaverTextRelay[],
    inningLabel?: string,
  ): string[] {
    const flattened: Array<{ sn: number; text: string; type: number; inning?: number; half?: string }> = [];
    for (const relay of relays) {
      const relayInning = Number(relay.inn ?? 0);
      const half = String(relay.homeOrAway ?? '');
      for (const opt of relay.textOptions ?? []) {
        const text = (opt.text ?? relay.title ?? '').trim();
        if (!text) continue;
        flattened.push({
          sn: opt.seqno ?? 0,
          text,
          type: opt.type ?? -1,
          inning: relayInning,
          half,
        });
      }
    }
    flattened.sort((a, b) => a.sn - b.sn);

    let lastAtBatStart = -1;
    for (const item of flattened) {
      if (item.type === 8) lastAtBatStart = item.sn;
    }

    const pitches: string[] = [];
    for (const item of flattened) {
      if (lastAtBatStart >= 0 && item.sn <= lastAtBatStart) continue;
      if (item.type === 1) {
        if (pitches[pitches.length - 1] !== item.text) pitches.push(item.text);
        continue;
      }
      if (lastAtBatStart >= 0 && item.type !== 7 && item.type !== 2) break;
    }

    if (!pitches.length) {
      for (const item of flattened) {
        if (item.type !== 1) continue;
        if (pitches[pitches.length - 1] !== item.text) pitches.push(item.text);
      }
    }

    return pitches.slice(-12);
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
