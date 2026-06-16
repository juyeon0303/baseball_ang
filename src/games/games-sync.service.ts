import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Cron, Interval } from '@nestjs/schedule';

import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { CommunityService } from '../community/community.service';

import { isKboGameDay, todayKey } from '../stats/game-day.util';

import { MarketService } from '../market/market.service';

import {

  PlayFeedItem,

  PlayImpactKind,

  ScoreboardSnapshot,

  TodayGame,

} from './games.types';

import { KboRawGame, KboScoreProvider, resolveKboGameStatus } from './kbo-score.provider';

import { GamesService } from './games.service';
import { GameLiveService } from './game-live.service';
import { RelaySyncService } from './relay-sync.service';
import {
  computeSentimentDelta,
  GAME_END_LOSS_SENTIMENT,
  GAME_END_WIN_SENTIMENT,
  playSentimentDelta,
  resolveInstrumentForPlay,
  SENTIMENT_DECAY_RATE,
} from './play-sentiment.util';

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

    @Inject(forwardRef(() => RelaySyncService))
    private readonly relay: RelaySyncService,

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

  prependPlay(play: PlayFeedItem): void {
    this.plays.unshift(play);
    this.plays = this.plays.slice(0, 40);
    if (this.snapshot) {
      this.snapshot.plays = this.getRecentPlays(15);
    }
  }

  patchSnapshotGames(games: TodayGame[]): void {
    if (this.snapshot) {
      this.snapshot.games = games;
      this.snapshot.updatedAt = new Date().toISOString();
    }
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

      this.preserveNaverLiveState(games);



      for (const raw of rawGames) {

        const prev = this.prevById.get(raw.G_ID);

        const mapped = games.find((g) => g.id === raw.G_ID);

        if (mapped) {

          await this.detectPlays(prev, raw, mapped);

        }

        this.prevById.set(raw.G_ID, raw);

      }



      const featuredGameId = this.pickFeaturedGameId(games);

      const draft: ScoreboardSnapshot = {
        date,
        updatedAt: new Date().toISOString(),
        source: 'kbo_gamecenter',
        featuredGameId,
        games,
        plays: this.getRecentPlays(15),
      };

      this.relay.attachNaverIds(draft, rawGames);
      await this.relay.syncLiveRelays(draft, trigger, false);

      this.snapshot = draft;

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

      const loser =

        winner === game.homeTeam

          ? game.awayTeam

          : winner === game.awayTeam

            ? game.homeTeam

            : null;

      void this.pushPlay({

        gameId: game.id,

        text: `경기 종료 ${game.awayTeam} ${game.awayScore}:${game.homeScore} ${game.homeTeam}`,

        team: winner ?? undefined,

        impact: 'game_end',

        skipMarket: true,

      });

      void this.applyGameEndMarket(game, winner, loser);

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

      skipMarket: this.relay.isEnabled(),

    });

  }



  /** 네이버 중계 플레이 → 선수/팀 종목 sentiment (relay-sync에서 호출) */
  async applyPlayPriceEffect(
    play: PlayFeedItem,
    game?: TodayGame,
  ): Promise<void> {
    const sentimentDelta = playSentimentDelta(play);
    if (!sentimentDelta) return;

    const instrumentId = resolveInstrumentForPlay({
      text: play.text,
      team: play.team,
      batter: game?.batter,
      explicitInstrumentId: play.instrumentId,
      resolveTeamInstrument: (t) => this.games.resolveInstrumentForTeam(t),
    });
    if (!instrumentId) return;

    await this.applyInstrumentSentiment(
      instrumentId,
      sentimentDelta,
      play.impact ?? 'inning',
    );
  }

  private async applyGameEndMarket(
    game: TodayGame,
    winner: string | null,
    loser: string | null,
  ): Promise<void> {
    if (winner) {
      await this.applyInstrumentSentiment(
        this.games.resolveInstrumentForTeam(winner),
        GAME_END_WIN_SENTIMENT,
        'game_end',
      );
    }
    if (loser) {
      await this.applyInstrumentSentiment(
        this.games.resolveInstrumentForTeam(loser),
        GAME_END_LOSS_SENTIMENT,
        'game_end',
      );
    }
    await this.market.decaySentimentTowardNeutral(
      this.games.resolveInstrumentForTeam(game.awayTeam),
      SENTIMENT_DECAY_RATE,
    );
    await this.market.decaySentimentTowardNeutral(
      this.games.resolveInstrumentForTeam(game.homeTeam),
      SENTIMENT_DECAY_RATE,
    );
  }

  private async applyInstrumentSentiment(
    instrumentId: string,
    sentimentDelta: number,
    playImpact?: string,
  ): Promise<void> {
    const inst = await this.market.applyPlaySentiment(
      instrumentId,
      sentimentDelta,
    );
    if (!inst) return;

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
      playImpact,
    });
  }

  private async pushPlay(input: {

    gameId: string;

    text: string;

    team?: string;

    instrumentId?: string;

    batter?: string;

    impact?: PlayImpactKind;

    playType?: string;

    sentimentMultiplier?: number;

    skipMarket?: boolean;

  }): Promise<void> {

    const impact = input.impact ?? 'inning';

    const sentimentDelta = computeSentimentDelta({

      impact,

      playType: input.playType,

      text: input.text,

      multiplier: input.sentimentMultiplier,

    });

    const instrumentId = resolveInstrumentForPlay({

      text: input.text,

      team: input.team,

      batter: input.batter,

      explicitInstrumentId: input.instrumentId,

      resolveTeamInstrument: (t) => this.games.resolveInstrumentForTeam(t),

    });

    const play: PlayFeedItem = {

      id: `play-${++this.playSeq}`,

      gameId: input.gameId,

      at: new Date().toISOString(),

      text: input.text,

      team: input.team,

      instrumentId,

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

    if (input.skipMarket || !instrumentId || sentimentDelta === 0) return;

    await this.applyInstrumentSentiment(instrumentId, sentimentDelta, impact);

  }



  private pickFeaturedGameId(games: TodayGame[]): string | null {

    const live = games.filter((g) => g.status === 'live');

    if (live.length) return live[0].id;

    const scheduled = games.filter((g) => g.status === 'scheduled');

    if (scheduled.length) return scheduled[0].id;

    return games[0]?.id ?? null;

  }



  private rawStatus(raw: KboRawGame): TodayGame['status'] {
    const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';
    return resolveKboGameStatus(raw, new Date(), tz);
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

  /** KBO 점수 갱신 시 네이버 중계 카운트·주자를 덮어쓰지 않음 */
  private preserveNaverLiveState(games: TodayGame[]): void {
    if (!this.relay.isEnabled()) return;
    const prevGames = this.snapshot?.games ?? [];
    for (const game of games) {
      if (game.status !== 'live') continue;
      const prev = prevGames.find((p) => p.id === game.id);
      if (!prev) {
        game.situation = undefined;
        continue;
      }
      if (prev.situation) game.situation = prev.situation;
      if (prev.batter) game.batter = prev.batter;
      if (prev.pitcher) game.pitcher = prev.pitcher;
      if (prev.relay) game.relay = prev.relay;
    }
  }

}


