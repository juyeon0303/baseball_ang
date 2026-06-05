import { CommunityMessage } from './community.types';

export const COMMUNITY_STORE = Symbol('COMMUNITY_STORE');

export interface ICommunityStore {
  getFeed(limit: number): Promise<CommunityMessage[]> | CommunityMessage[];
  push(
    input: Omit<CommunityMessage, 'id' | 'at'> & { at?: string },
  ): Promise<CommunityMessage> | CommunityMessage;
  getLastPostAt(userId: string): Promise<number | undefined> | number | undefined;
  setLastPostAt(userId: string, at: number): Promise<void> | void;
}
