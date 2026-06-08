import { TodayGame } from './games.types';

export function parseInningLabel(label: string): {
  inning: number;
  isTop: boolean;
} {
  const m = label.match(/(\d+)/);
  const inning = m ? parseInt(m[1], 10) : 1;
  const isTop = label.includes('▲') || label.includes('초');
  return { inning, isTop };
}

/** 간이 WPA — 점수차·이닝 진행도 기반 홈팀 승률 (0~1) */
export function estimateHomeWinPct(game: TodayGame): number {
  if (game.status === 'final') {
    if (game.homeScore > game.awayScore) return 1;
    if (game.awayScore > game.homeScore) return 0;
    return 0.5;
  }
  if (game.status === 'scheduled') return 0.5;

  const margin = game.homeScore - game.awayScore;
  const { inning, isTop } = parseInningLabel(game.inning);
  const progress = Math.min(1, Math.max(0, (inning - 1 + (isTop ? 0 : 0.5)) / 9));
  const leverage = 0.12 + progress * 0.88;
  const logit = margin * leverage * 0.38;
  let p = 1 / (1 + Math.exp(-logit));
  p = p * 0.94 + 0.03;
  return Math.round(Math.max(0.02, Math.min(0.98, p)) * 1000) / 1000;
}
