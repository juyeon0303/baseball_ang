import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { PlayFeedItem, TodayGame } from './games.types';
import {
  FanRatingRow,
  SentimentSnapshot,
  SentimentVoteKind,
  SENTIMENT_VOTE_META,
  WinPickSide,
  WinPickSnapshot,
  WpaNote,
  WpaPoint,
} from './game-live.types';
import { estimateHomeWinPct } from './wpa.util';

const VOTE_KINDS = Object.keys(SENTIMENT_VOTE_META) as SentimentVoteKind[];

@Injectable()
export class GameLiveService {
  private wpaSeq = 0;
  private noteSeq = 0;
  private lastWpaPct = new Map<string, number>();
  private wpaByGame = new Map<string, WpaPoint[]>();
  private wpaNotes = new Map<string, WpaNote[]>();
  private votesByGame = new Map<string, Map<string, SentimentVoteKind>>();
  private ratingsByGame = new Map<
    string,
    Map<string, { sum: number; count: number }>
  >();
  private userRatings = new Map<string, number>();
  private winPicksByGame = new Map<string, Map<string, WinPickSide>>();

  constructor(private readonly moduleRef: ModuleRef) {}

  recordGameState(game: TodayGame, play?: PlayFeedItem): WpaPoint | null {
    const homeWinPct = estimateHomeWinPct(game);
    const prev = this.lastWpaPct.get(game.id);
    const delta =
      prev != null ? Math.round((homeWinPct - prev) * 1000) / 10 : undefined;
    const changed =
      prev == null ||
      play != null ||
      Math.abs(homeWinPct - prev) >= 0.003;

    if (!changed) return null;

    this.lastWpaPct.set(game.id, homeWinPct);
    const point: WpaPoint = {
      id: `wpa-${++this.wpaSeq}`,
      gameId: game.id,
      at: play?.at ?? new Date().toISOString(),
      inning: game.inning,
      homeWinPct,
      awayWinPct: Math.round((1 - homeWinPct) * 1000) / 1000,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      playId: play?.id,
      label: play?.text,
      delta,
    };
    const list = this.wpaByGame.get(game.id) ?? [];
    list.push(point);
    this.wpaByGame.set(game.id, list.slice(-80));
    this.broadcast('wpaUpdate', { gameId: game.id, point, timeline: list });
    return point;
  }

  getWpaTimeline(gameId: string): WpaPoint[] {
    return this.wpaByGame.get(gameId) ?? [];
  }

  getWpaNotes(gameId: string, playId: string): WpaNote[] {
    return (this.wpaNotes.get(`${gameId}:${playId}`) ?? []).slice(-20);
  }

  addWpaNote(
    gameId: string,
    playId: string,
    userId: string,
    text: string,
  ): WpaNote {
    const safeUser = (userId ?? 'guest').trim().slice(0, 64) || 'guest';
    const safeText = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!safeText) throw new BadRequestException('한 줄을 입력하세요.');
    if (safeText.length > 80) {
      throw new BadRequestException('최대 80자까지 가능합니다.');
    }
    const note: WpaNote = {
      id: `wn-${++this.noteSeq}`,
      gameId,
      playId,
      userId: safeUser,
      text: safeText,
      at: new Date().toISOString(),
    };
    const key = `${gameId}:${playId}`;
    const list = this.wpaNotes.get(key) ?? [];
    list.push(note);
    this.wpaNotes.set(key, list.slice(-30));
    this.broadcast('wpaNote', note);
    return note;
  }

  voteSentiment(
    gameId: string,
    userId: string,
    vote: SentimentVoteKind,
  ): SentimentSnapshot {
    if (!VOTE_KINDS.includes(vote)) {
      throw new BadRequestException('지원하지 않는 투표입니다.');
    }
    const safeUser = (userId ?? 'guest').trim().slice(0, 64) || 'guest';
    const map = this.votesByGame.get(gameId) ?? new Map();
    map.set(safeUser, vote);
    this.votesByGame.set(gameId, map);
    const snap = this.buildSentiment(gameId, safeUser);
    this.broadcast('sentimentUpdate', snap);
    return snap;
  }

  getSentiment(gameId: string, userId?: string): SentimentSnapshot {
    const safeUser = userId?.trim().slice(0, 64) || undefined;
    return this.buildSentiment(gameId, safeUser);
  }

  pickWinner(
    gameId: string,
    userId: string,
    side: WinPickSide,
  ): WinPickSnapshot {
    if (side !== 'away' && side !== 'home') {
      throw new BadRequestException('away 또는 home을 선택하세요.');
    }
    const safeUser = (userId ?? 'guest').trim().slice(0, 64) || 'guest';
    const map = this.winPicksByGame.get(gameId) ?? new Map();
    map.set(safeUser, side);
    this.winPicksByGame.set(gameId, map);
    const snap = this.buildWinPick(gameId, safeUser);
    this.broadcast('winPickUpdate', snap);
    return snap;
  }

  getWinPick(gameId: string, userId?: string): WinPickSnapshot {
    const safeUser = userId?.trim().slice(0, 64) || undefined;
    return this.buildWinPick(gameId, safeUser);
  }

  private buildWinPick(gameId: string, userId?: string): WinPickSnapshot {
    const map = this.winPicksByGame.get(gameId);
    let awayPicks = 0;
    let homePicks = 0;
    let myPick: WinPickSide | null = null;
    if (map) {
      for (const [uid, side] of map.entries()) {
        if (side === 'away') awayPicks += 1;
        else homePicks += 1;
        if (userId && uid === userId) myPick = side;
      }
    }
    const totalPicks = awayPicks + homePicks;
    const awayPct = totalPicks
      ? Math.round((awayPicks / totalPicks) * 1000) / 10
      : 50;
    const homePct = totalPicks
      ? Math.round((homePicks / totalPicks) * 1000) / 10
      : 50;
    return {
      gameId,
      awayPicks,
      homePicks,
      totalPicks,
      awayPct,
      homePct,
      myPick,
    };
  }

  ratePlayer(
    gameId: string,
    userId: string,
    playerName: string,
    rating: number,
  ): FanRatingRow {
    const safeUser = (userId ?? 'guest').trim().slice(0, 64) || 'guest';
    const name = (playerName ?? '').trim().slice(0, 24);
    if (!name) throw new BadRequestException('선수 이름이 필요합니다.');
    const r = Math.round(Number(rating));
    if (!Number.isFinite(r) || r < 1 || r > 10) {
      throw new BadRequestException('1~10점 사이로 매겨 주세요.');
    }
    const key = `${gameId}:${safeUser}:${name}`;
    const prev = this.userRatings.get(key);
    const byGame = this.ratingsByGame.get(gameId) ?? new Map();
    const row = byGame.get(name) ?? { sum: 0, count: 0 };
    if (prev != null) {
      row.sum -= prev;
    } else {
      row.count += 1;
    }
    row.sum += r;
    byGame.set(name, row);
    this.ratingsByGame.set(gameId, byGame);
    this.userRatings.set(key, r);
    const result: FanRatingRow = {
      playerName: name,
      avg: Math.round((row.sum / row.count) * 10) / 10,
      count: row.count,
    };
    this.broadcast('fanRating', { gameId, ratings: this.getFanRatings(gameId) });
    return result;
  }

  getFanRatings(gameId: string): FanRatingRow[] {
    const byGame = this.ratingsByGame.get(gameId);
    if (!byGame) return [];
    return [...byGame.entries()]
      .map(([playerName, { sum, count }]) => ({
        playerName,
        avg: Math.round((sum / count) * 10) / 10,
        count,
      }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
  }

  private buildSentiment(
    gameId: string,
    userId?: string,
  ): SentimentSnapshot {
    const map = this.votesByGame.get(gameId);
    const counts = Object.fromEntries(
      VOTE_KINDS.map((k) => [k, 0]),
    ) as Record<SentimentVoteKind, number>;
    let myVote: SentimentVoteKind | null = null;
    if (map) {
      for (const [uid, vote] of map.entries()) {
        counts[vote] += 1;
        if (userId && uid === userId) myVote = vote;
      }
    }
    const total = VOTE_KINDS.reduce((s, k) => s + counts[k], 0);
    const pct = Object.fromEntries(
      VOTE_KINDS.map((k) => [
        k,
        total ? Math.round((counts[k] / total) * 1000) / 10 : 0,
      ]),
    ) as Record<SentimentVoteKind, number>;
    let dominant: SentimentVoteKind | null = null;
    let dominantPct = 0;
    for (const k of VOTE_KINDS) {
      if (counts[k] > 0 && pct[k] >= dominantPct) {
        dominant = k;
        dominantPct = pct[k];
      }
    }
    return {
      gameId,
      totalVotes: total,
      counts,
      pct,
      dominant,
      dominantPct,
      myVote,
    };
  }

  private broadcast(event: string, payload: unknown): void {
    try {
      const gateway = this.moduleRef.get(StockStreamGateway, { strict: false });
      gateway?.broadcastLiveEvent(event, payload);
    } catch {
      /* optional */
    }
  }
}
