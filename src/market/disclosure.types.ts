export type DisclosureKind =
  | 'starter'
  | 'injury'
  | 'lineup'
  | 'coach'
  | 'rumor';

export interface DisclosureItem {
  id: string;
  at: string;
  session: string;
  kind: DisclosureKind;
  headline: string;
  teamShort?: string;
  playerName?: string;
  instrumentId?: string;
  priceDeltaPct: number;
  source: 'kbo_official' | 'team_feed' | 'market_pulse';
}
