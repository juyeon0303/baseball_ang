export type CommunityMessageKind =
  | 'chat'
  | 'play'
  | 'trade'
  | 'reaction'
  | 'system';

export interface CommunityMessage {
  id: string;
  at: string;
  kind: CommunityMessageKind;
  userId?: string;
  displayName?: string;
  text: string;
  gameId?: string;
  instrumentId?: string;
  emoji?: string;
}
