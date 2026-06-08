import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Cron, Interval } from '@nestjs/schedule';

import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { CommunityService } from '../community/community.service';

import { isKboGameDay, todayKey } from '../stats/game-day.util';

import { findMemeByKeyword } from '../market/market-meme-lineup';
import { MarketService } from '../market/market.service';

import {

  PlayFeedItem,

  PlayImpactKind,

  ScoreboardSnapshot,

  TodayGame,

} from './games.types';

import { KboRawGame, KboScoreProvider } from './kbo-score.provider';

import { GamesService } from './games.service';
import { GameLiveService } from './game-live.service';



const PLAY_SENTIMENT: Record<PlayImpactKind, number> = {

  run: 0.012,

  game_end: 0.02,

  game_start: 0.004,

  inning: 0,

};



@Injectable()

export class GamesSyncService implements OnModuleInit {

  private readonly logger = new Logger(GamesSyncService.name);

  private snapshot: ScoreboardSnapshot | null = null;

  private prevById = new Map<string, KboRawGame>();

  private plays: PlayFeedItem[] = [];

  private playSeq = 0;

  private syncing = false;



  constructor(

    private readonly config: ConfigService,

    private readonly kbo: KboScoreProvider,

    private readonly games: GamesService,

    private readonly market: MarketService,

    private readonly stream: StockStreamGateway,

    private readonly community: CommunityService,

    private readonly live: GameLiveService,

  ) {}



  onModuleInit(): void {

    if (!this.isEnabled()) return;

    const delay = Number(this.config.get('GAMES_BOOT_DELAY_MS') ?? 6_000);

    setTimeout(() => {

      void this.refresh('boot').catch((e) =>

        this.logger.error(`점수판 초기 동기화 실패: ${e}`),

      );

    }, delay);

  }



  isEnabled(): boolean {

    return this.config.get('GAMES_SYNC_ENABLED') !== 'false';

  }



  getSnapshot(): ScoreboardSnapshot | null {

    return this.snapshot;

  }



  getRecentPlays(limit = 15): PlayFeedItem[] {

    return this.plays.slice(0, limit);

  }



  /** 경기일 09:00 — 오늘 일정 선반영 */

  @Cron('0 9 * * 0,2-6', { timeZone: 'Asia/Seoul' })

  async morningSchedule(): Promise<void> {

    if (!this.isEnabled()) return;

    await this.refresh('cron-morning');

  }



  /** 경기 시간대 1분 폴링 (14~23시 KST, 월 제외) */

  @Cron('*/1 14-23 * * 0,2-6', { timeZone: 'Asia/Seoul' })

  async livePoll(): Promise<void> {

    if (!this.isEnabled()) return;

    await this.refresh('cron-live');

  }



  @Interval(60_000)

  async fallbackPoll(): Promise<void> {

    if (!this.isEnabled()) return;

    const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';

    if (!isKboGameDay(tz) || !this.isGameHour(tz)) return;

    if (this.snapshot) {

      const age = Date.now() - new Date(this.snapshot.updatedAt).getTime();

      if (age < 55_000) return;

    }

    await this.refresh('interval');

  }



  async refresh(trigger: string): Promise<ScoreboardSnapshot> {

    if (this.syncing) {

      return (

        this.snapshot ?? {

          date: todayKey(),

          updatedAt: new Date().toISOString(),

          source: 'kbo_gamecenter',

          featuredGameId: null,

          games: [],

          plays: [],

        }

      );

    }

    this.syncing = true;

    try {

      const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';

      const date = todayKey(tz);

      const rawGames = await this.kbo.fetchTodayGames(date);

      const games = rawGames.map((raw) =>

        this.kbo.mapRawGame(raw, (team) => this.games.resolveInstrumentForTeam(team)),

      );



      for (const raw of rawGames) {

        const prev = this.prevById.get(raw.G_ID);

        const mapped = games.find((g) => g.id === raw.G_ID);

        if (mapped) {

          await this.detectPlays(prev, raw, mapped);

        }

        this.prevById.set(raw.G_ID, raw);

      }



      const featuredGameId = this.pickFeaturedGameId(games);

      this.snapshot = {

        date,

        updatedAt: new Date().toISOString(),

        source: 'kbo_gamecenter',

        featuredGameId,

        games,

        plays: this.getRecentPlays(15),

      };

      this.games.setSnapshot(this.snapshot);

      for (const g of games) {
        this.live.recordGameState(g);
      }

      this.stream.broadcastGameUpdate(this.snapshot);

      this.logger.debug(

        `점수판 갱신 [${trigger}] 경기 ${games.length} · 플레이 ${this.plays.length}`,

      );

      return this.snapshot;

    } catch (e) {

      this.logger.warn(`점수판 수집 실패 [${trigger}]: ${e}`);

      if (!this.snapshot) {

        this.snapshot = this.games.buildFallbackSnapshot();

        this.games.setSnapshot(this.snapshot);

      }

      return this.snapshot;

    } finally {

      this.syncing = false;

    }

  }



  private async detectPlays(

    prev: KboRawGame | undefined,

    raw: KboRawGame,

    game: TodayGame,

  ): Promise<void> {

    const status = game.status;



    if (!prev) {

      if (status === 'live') {

        this.pushPlay({

          gameId: game.id,

          text: `경기 시작 ${game.awayTeam} vs ${game.homeTeam}`,

          team: game.homeTeam,

          instrumentId: game.linkedInstrumentId,

          impact: 'game_start',

        });

      }

      return;

    }



    const prevAway = parseInt(prev.T_SCORE_CN, 10) || 0;

    const prevHome = parseInt(prev.B_SCORE_CN, 10) || 0;

    const awayDiff = game.awayScore - prevAway;

    const homeDiff = game.homeScore - prevHome;



    if (awayDiff > 0) {

      await this.pushScoringPlay(game, game.awayTeam, awayDiff, prevAway, prevHome);

    }

    if (homeDiff > 0) {

      await this.pushScoringPlay(game, game.homeTeam, homeDiff, prevAway, prevHome);

    }



    const prevStatus = this.rawStatus(prev);

    if (prevStatus !== 'live' && status === 'live') {

      this.pushPlay({

        gameId: game.id,

        text: `경기 시작 ${game.awayTeam} vs ${game.homeTeam}`,

        team: game.homeTeam,

        instrumentId: game.linkedInstrumentId,

        impact: 'game_start',

      });

    }



    if (prevStatus === 'live' && status === 'final') {

      const winner =

        game.homeScore > game.awayScore

          ? game.homeTeam

          : game.awayScore > game.homeScore

            ? game.awayTeam

            : null;

      const instrumentId = winner

        ? this.games.resolveInstrumentForTeam(winner)

        : game.linkedInstrumentId;

      this.pushPlay({

        gameId: game.id,

        text: `경기 종료 ${game.awayTeam} ${game.awayScore}:${game.homeScore} ${game.homeTeam}`,

        team: winner ?? undefined,

        instrumentId,

        impact: 'game_end',

      });

    }



    const innChanged =

      prev.GAME_INN_NO !== raw.GAME_INN_NO ||

      prev.GAME_TB_SC_NM !== raw.GAME_TB_SC_NM;

    const batterChanged = prev.T_P_NM !== raw.T_P_NM && raw.T_P_NM?.trim();

    if (status === 'live' && (innChanged || batterChanged) && awayDiff === 0 && homeDiff === 0) {

      const batter = raw.T_P_NM?.trim();

      const pitcher = raw.B_P_NM?.trim();

      const vs = batter && pitcher ? ` ${batter} vs ${pitcher}` : batter ? ` ${batter}` : '';

      this.pushPlay({

        gameId: game.id,

        text: `${game.inning}${vs}`,

        team: game.homeTeam,

        instrumentId: game.linkedInstrumentId,

        impact: 'inning',

      });

    }

  }



  private async pushScoringPlay(

    game: TodayGame,

    team: string,

    runs: number,

    prevAway: number,

    prevHome: number,

  ): Promise<void> {

    const instrumentId = this.games.resolveInstrumentForTeam(team);

    const batter = game.batter ? ` ${game.batter}` : '';

    const scoreLine = `${game.awayTeam} ${prevAway + (team === game.awayTeam ? runs : 0)}:${prevHome + (team === game.homeTeam ? runs : 0)} ${game.homeTeam}`;

    const runKo = runs > 1 ? `${runs}점` : '득점';

    await this.pushPlay({

      gameId: game.id,

      text: `${game.inning} ${team} ${runKo}!${batter} · ${scoreLine}`,

      team,

      instrumentId,

      impact: 'run',

      sentimentMultiplier: runs,

    });

  }



  private async pushPlay(input: {

    gameId: string;

    text: string;

    team?: string;

    instrumentId?: string;

    impact?: PlayImpactKind;

    sentimentMultiplier?: number;

  }): Promise<void> {

    const impact = input.impact ?? 'inning';

    const base = PLAY_SENTIMENT[impact];

    const mult = input.sentimentMultiplier ?? 1;

    const sentimentDelta = base * mult;



    const play: PlayFeedItem = {

      id: `play-${++this.playSeq}`,

      gameId: input.gameId,

      at: new Date().toISOString(),

      text: input.text,

      team: input.team,

      instrumentId: input.instrumentId,

      impact,

      sentimentDelta: sentimentDelta || undefined,

    };

    this.plays.unshift(play);

    this.plays = this.plays.slice(0, 40);

    const game = this.snapshot?.games.find((g) => g.id === input.gameId);
    if (game) {
      this.live.recordGameState(game, play);
    }

    this.stream.broadcastPlayFeed(play);

    void this.community.postPlay(input.text, input.gameId, input.team);

    if (input.instrumentId && sentimentDelta !== 0) {

      const inst = await this.market.applyPlaySentiment(

        input.instrumentId,

        sentimentDelta,

      );

      if (inst) {

        this.stream.broadcastPriceUpdate({

          id: inst.id,

          name: inst.name,

          teamShort: inst.teamShort,

          playerName: inst.playerName,

          price: inst.price,

          fairPrice: inst.fairPrice,

          oracleValue: inst.oracleValue,

          sentiment: inst.sentiment,

          metricLabel: inst.metricLabel,

          playImpact: impact,

        });

      }

    }

    const meme = findMemeByKeyword(input.text);
    if (meme && sentimentDelta !== 0) {
      const memeDelta =
        impact === 'run' ? sentimentDelta * 1.4 : sentimentDelta * 0.8;
      await this.market.applyPlaySentiment(meme.id, memeDelta);
    }

  }



  private pickFeaturedGameId(games: TodayGame[]): string | null {

    const live = games.filter((g) => g.status === 'live');

    if (live.length) return live[0].id;

    const scheduled = games.filter((g) => g.status === 'scheduled');

    if (scheduled.length) return scheduled[0].id;

    return games[0]?.id ?? null;

  }



  private rawStatus(raw: KboRawGame): TodayGame['status'] {
    if (raw.GAME_RESULT_CK === 1 || raw.GAME_STATE_SC === '3') return 'final';
    if (raw.GAME_STATE_SC === '1' && raw.SCORE_CK === '0') return 'scheduled';
    if (
      raw.GAME_INN_NO != null ||
      (raw.T_P_NM && raw.T_P_NM.trim()) ||
      raw.GAME_STATE_SC === '2' ||
      raw.SCORE_CK === '1'
    ) {
      return 'live';
    }
    return 'scheduled';
  }

  private isGameHour(timeZone: string): boolean {

    const hour = Number(

      new Intl.DateTimeFormat('en-US', {

        timeZone,

        hour: 'numeric',

        hour12: false,

      }).format(new Date()),

    );

    return hour >= 14 && hour <= 23;

  }

}


