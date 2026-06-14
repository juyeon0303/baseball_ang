import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { findMemeByKeyword } from '../market/market-meme-lineup';
import { MarketService } from '../market/market.service';
import { CommunityService } from '../community/community.service';
import { formatBasesLabel } from './games-display.util';
import { GamesRecapService } from './games-recap.service';
import { GameLiveService } from './game-live.service';
import { GamesSyncService } from './games-sync.service';
import {
  GameRelayBundle,
  PlayFeedItem,
  ScoreboardSnapshot,
  TodayGame,
} from './games.types';
import { KboRawGame } from './kbo-score.provider';
import {
  buildNaverGameId,
  resolveNaverGameId,
} from './naver-game-id.util';
import {
  NaverRelayArchiveResult,
  NaverRelayProvider,
} from './naver-relay.provider';

const PLAY_SENTIMENT: Record<string, number> = {
  run: 0.012,
  game_end: 0.02,
  game_start: 0.004,
  inning: 0,
};

@Injectable()
export class RelaySyncService {
  private readonly logger = new Logger(RelaySyncService.name);
  private lastSeqByGame = new Map<string, number>();
  private playSeq = 10_000;
  private syncing = false;
  private bundleCache = new Map<string, GameRelayBundle>();

  constructor(
    private readonly config: ConfigService,
    private readonly naver: NaverRelayProvider,
    @Inject(forwardRef(() => GamesSyncService))
    private readonly gamesSync: GamesSyncService,
    private readonly recap: GamesRecapService,
    private readonly market: MarketService,
    private readonly stream: StockStreamGateway,
    private readonly community: CommunityService,
    private readonly live: GameLiveService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('NAVER_RELAY_ENABLED') !== 'false';
  }

  attachNaverIds(snapshot: ScoreboardSnapshot, rawGames: KboRawGame[]): void {
    if (!this.isEnabled()) return;
    const rawById = new Map(rawGames.map((r) => [r.G_ID, r]));
    for (const game of snapshot.games) {
      const raw = rawById.get(game.id);
      if (!raw) continue;
      game.naverGameId = buildNaverGameId(
        snapshot.date,
        raw.AWAY_ID,
        raw.HOME_ID,
      );
    }
  }

  async syncLiveRelays(
    snapshot: ScoreboardSnapshot,
    trigger: string,
    emitSnapshot = true,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.syncing) return;
    this.syncing = true;
    try {
      const targets = snapshot.games.filter(
        (g) =>
          g.status === 'live' ||
          (g.status === 'final' && !this.bundleCache.has(g.id)),
      );
      for (const game of targets) {
        if (!game.naverGameId) {
          game.naverGameId =
            resolveNaverGameId(game, snapshot.date) ?? undefined;
        }
        if (!game.naverGameId) continue;
        if (game.status === 'final') {
          await this.syncArchiveGame(game, snapshot.date, false);
        } else {
          await this.syncOneGame(game, snapshot.date);
        }
      }
      if (targets.length) {
        if (emitSnapshot) {
          this.gamesSync.patchSnapshotGames(snapshot.games);
          this.stream.broadcastGameUpdate(snapshot);
        }
        this.logger.debug(
          `문자중계 갱신 [${trigger}] ${targets.length}경기`,
        );
      }
    } catch (e) {
      this.logger.warn(`문자중계 동기화 실패 [${trigger}]: ${e}`);
    } finally {
      this.syncing = false;
    }
  }

  @Interval(10_000)
  async relayPoll(): Promise<void> {
    if (!this.isEnabled()) return;
    const snap = this.gamesSync.getSnapshot();
    if (!snap?.games.some((g) => g.status === 'live')) return;
    await this.syncLiveRelays(snap, 'relay-poll');
  }

  async getGameRelay(gameId: string): Promise<GameRelayBundle | null> {
    if (!this.isEnabled()) return null;

    const cached = this.bundleCache.get(gameId);
    if (cached) return cached;

    const ctx = await this.resolveGameContext(gameId);
    if (!ctx) return null;
    const { game, dateKey } = ctx;
    if (game.status === 'scheduled') return null;

    if (!game.naverGameId) {
      game.naverGameId = resolveNaverGameId(game, dateKey) ?? undefined;
    }
    if (!game.naverGameId) return null;

    const bundle = await this.syncArchiveGame(game, dateKey, true);
    return bundle;
  }

  private async resolveGameContext(
    gameId: string,
  ): Promise<{ game: TodayGame; dateKey: string } | null> {
    const snap = this.gamesSync.getSnapshot();
    if (snap) {
      const game = snap.games.find((g) => g.id === gameId);
      if (game) return { game, dateKey: snap.date };
    }

    const recapData = await this.recap.getRecap();
    if (recapData) {
      const game = recapData.games.find((g) => g.id === gameId);
      if (game) return { game, dateKey: recapData.date };
    }

    return null;
  }

  private async syncArchiveGame(
    game: TodayGame,
    _dateKey: string,
    storeOnly: boolean,
  ): Promise<GameRelayBundle | null> {
    const raw = await this.naver.fetchRelayFull(game.naverGameId!);
    if (!raw) return null;

    const parsed = this.naver.parseRelayArchive(
      game.id,
      game.naverGameId!,
      raw as Record<string, unknown>,
      { away: game.awayTeam, home: game.homeTeam },
      this.playSeq,
    );
    if (!parsed) return null;

    this.playSeq += parsed.allPlays.length;
    this.lastSeqByGame.set(game.id, parsed.maxSeqno);

    const bundle = this.applyArchiveToGame(game, parsed);
    this.bundleCache.set(game.id, bundle);

    if (!storeOnly) {
      this.stream.broadcastLiveEvent('relayUpdate', {
        gameId: game.id,
        situation: game.situation,
        batter: game.batter,
        pitcher: game.pitcher,
        inning: game.inning,
        relay: game.relay,
        archived: true,
        playCount: bundle.plays.length,
      });
    }

    return bundle;
  }

  private applyArchiveToGame(
    game: TodayGame,
    parsed: NaverRelayArchiveResult,
  ): GameRelayBundle {
    if (parsed.inningLabel) {
      game.inning = parsed.inningLabel;
    }
    if (parsed.batter) game.batter = parsed.batter;
    if (parsed.pitcher) game.pitcher = parsed.pitcher;

    parsed.situation.basesLabel = formatBasesLabel(parsed.situation.bases);
    parsed.situation.inning = parsed.inningLabel ?? game.inning;
    game.situation = parsed.situation;

    game.relay = {
      naverGameId: game.naverGameId,
      lastPitch: parsed.lastPitch,
      recentPitches: parsed.recentPitches,
      lastPlay: parsed.lastPlay,
      lastPlayKind: parsed.lastPlayKind,
      lastPlayType: parsed.lastPlayType,
      updatedAt: new Date().toISOString(),
      source: 'naver_relay',
      archived: true,
      playCount: parsed.allPlays.length,
    };

    return {
      gameId: game.id,
      situation: game.situation,
      relay: game.relay,
      batter: game.batter,
      pitcher: game.pitcher,
      inning: game.inning,
      plays: parsed.allPlays,
      archived: true,
    };
  }

  private async syncOneGame(game: TodayGame, _dateKey: string): Promise<void> {
    const raw = await this.naver.fetchRelay(game.naverGameId!);
    if (!raw || typeof raw !== 'object') return;

    const lastSeq = this.lastSeqByGame.get(game.id) ?? 0;
    const parsed = this.naver.parseRelay(
      game.id,
      game.naverGameId!,
      raw as Record<string, unknown>,
      lastSeq,
      { away: game.awayTeam, home: game.homeTeam },
      this.playSeq,
    );
    if (!parsed) return;

    this.playSeq += parsed.newPlays.length;
    const isFirstSync = lastSeq === 0 && parsed.maxSeqno > 0;
    this.lastSeqByGame.set(game.id, parsed.maxSeqno);

    if (parsed.inningLabel) {
      game.inning = parsed.inningLabel;
    }
    if (parsed.batter) game.batter = parsed.batter;
    if (parsed.pitcher) game.pitcher = parsed.pitcher;
    if (parsed.awayScore != null) game.awayScore = parsed.awayScore;
    if (parsed.homeScore != null) game.homeScore = parsed.homeScore;

    parsed.situation.basesLabel = formatBasesLabel(parsed.situation.bases);
    parsed.situation.inning = parsed.inningLabel ?? game.inning;
    game.situation = parsed.situation;

    const prevRelay = game.relay;
    let mergedPitches: string[];
    if (
      parsed.batter &&
      prevRelay?.pitchBatter &&
      parsed.batter !== prevRelay.pitchBatter
    ) {
      mergedPitches = [...parsed.recentPitches];
    } else {
      mergedPitches = [...(prevRelay?.recentPitches ?? [])];
      for (const p of parsed.recentPitches) {
        if (mergedPitches[mergedPitches.length - 1] !== p) {
          mergedPitches.push(p);
        }
      }
    }
    while (mergedPitches.length > 12) mergedPitches.shift();

    game.relay = {
      naverGameId: game.naverGameId,
      lastPitch: parsed.lastPitch,
      recentPitches: mergedPitches,
      lastPlay: parsed.lastPlay,
      lastPlayKind: parsed.lastPlayKind,
      lastPlayType: parsed.lastPlayType,
      pitchBatter: parsed.batter,
      updatedAt: new Date().toISOString(),
      source: 'naver_relay',
    };

    this.stream.broadcastLiveEvent('relayUpdate', {
      gameId: game.id,
      situation: game.situation,
      batter: game.batter,
      pitcher: game.pitcher,
      inning: game.inning,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      relay: game.relay,
    });

    for (const play of isFirstSync ? [] : parsed.newPlays) {
      await this.emitRelayPlay(game, play);
    }
  }

  private async emitRelayPlay(
    game: TodayGame,
    play: PlayFeedItem,
  ): Promise<void> {
    this.gamesSync.prependPlay(play);
    this.live.recordGameState(game, play);
    this.stream.broadcastPlayFeed(play);
    void this.community.postPlay(play.text, play.gameId, play.team);

    const impact = play.impact ?? 'inning';
    const base = PLAY_SENTIMENT[impact] ?? 0;
    const mult = impact === 'run' ? 1 : 1;
    const sentimentDelta = base * mult;

    if (game.linkedInstrumentId && sentimentDelta !== 0) {
      const inst = await this.market.applyPlaySentiment(
        game.linkedInstrumentId,
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

    const meme = findMemeByKeyword(play.text);
    if (meme && sentimentDelta !== 0) {
      await this.market.applyPlaySentiment(meme.id, sentimentDelta * 0.8);
    }
  }
}
