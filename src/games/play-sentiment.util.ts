import {
  ALL_INSTRUMENT_SEEDS,
  findSeedByPlayerName,
} from '../market/market-lineup';
import { PlayFeedItem, PlayImpactKind } from './games.types';

/** 경기 종료 · 득점 등 이벤트별 sentiment delta */
export const RUN_SENTIMENT = 0.012;
export const GAME_START_SENTIMENT = 0.003;
export const GAME_END_WIN_SENTIMENT = 0.015;
export const GAME_END_LOSS_SENTIMENT = -0.008;
/** 경기 종료 후 sentiment가 1.0 쪽으로 당겨지는 비율 */
export const SENTIMENT_DECAY_RATE = 0.06;

export function extractBatterName(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const colon = trimmed.match(/^([^\s:：]+)\s*[:：]/);
  if (colon?.[1]) return colon[1].trim();

  const numbered = trimmed.match(/^\d+번타자\s*(.+?)(?:\s*[:：]|\s|$)/);
  if (numbered?.[1]) return numbered[1].trim();

  const pinch = trimmed.match(/^대타\s*(.+?)(?:\s*[:：]|\s|$)/);
  if (pinch?.[1]) return pinch[1].trim();

  for (const seed of ALL_INSTRUMENT_SEEDS) {
    if (trimmed.includes(seed.playerName)) return seed.playerName;
  }
  return undefined;
}

export function resolveInstrumentForPlay(input: {
  text: string;
  team?: string;
  batter?: string;
  explicitInstrumentId?: string;
  resolveTeamInstrument: (teamShort: string) => string;
}): string | undefined {
  if (input.explicitInstrumentId) return input.explicitInstrumentId;

  const name = input.batter?.trim() || extractBatterName(input.text);
  if (name) {
    const seed = findSeedByPlayerName(name);
    if (seed) return seed.id;
  }
  if (input.team) {
    return input.resolveTeamInstrument(input.team);
  }
  return undefined;
}

/** 중계/스코어보드 텍스트 → sentiment delta (음수 = 못함) */
export function computeSentimentDelta(input: {
  impact?: PlayImpactKind;
  playType?: string;
  relayKind?: string;
  text?: string;
  multiplier?: number;
}): number {
  const mult = input.multiplier ?? 1;
  const text = input.text ?? '';
  const playType = input.playType ?? '';

  if (/삼진/.test(text) || playType === '삼진') return -0.009 * mult;
  if (/병살|더블플레이/.test(text)) return -0.012 * mult;
  if (/실책/.test(text)) return -0.007 * mult;
  if (/홈런/.test(text) || playType === '홈런') return 0.018 * mult;
  if (/3루타/.test(text) || playType === '3루타') return 0.014 * mult;
  if (/2루타/.test(text) || playType === '2루타') return 0.01 * mult;
  if (/1루타|안타/.test(text) || playType === '안타' || playType === '1루타') {
    return 0.006 * mult;
  }
  if (/볼넷|4구/.test(text) || playType === '볼넷') return 0.003 * mult;
  if (/사구|몸에\s*맞/.test(text) || playType === '사구') return 0.002 * mult;
  if (
    (/땅볼|플라이|아웃|포스아웃/.test(text) || input.relayKind === 'advance') &&
    !/홈런/.test(text)
  ) {
    return -0.004 * mult;
  }

  switch (input.impact) {
    case 'run':
      return RUN_SENTIMENT * mult;
    case 'game_end':
      return GAME_END_WIN_SENTIMENT * mult;
    case 'game_start':
      return GAME_START_SENTIMENT * mult;
    default:
      return 0;
  }
}

export function playSentimentDelta(play: PlayFeedItem, multiplier = 1): number {
  if (play.sentimentDelta != null && Number.isFinite(play.sentimentDelta)) {
    return play.sentimentDelta * multiplier;
  }
  return computeSentimentDelta({
    impact: play.impact,
    playType: play.playType,
    relayKind: play.relayKind,
    text: play.text,
    multiplier,
  });
}
