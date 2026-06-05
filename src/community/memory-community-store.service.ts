import { Injectable } from '@nestjs/common';
import { CommunityMessage } from './community.types';
import { ICommunityStore } from './community-store.interface';

const MAX_MESSAGES = 120;

@Injectable()
export class MemoryCommunityStoreService implements ICommunityStore {
  private messages: CommunityMessage[] = [];
  private seq = 0;
  private lastPostAt = new Map<string, number>();

  getFeed(limit: number): CommunityMessage[] {
    return this.messages.slice(0, Math.min(limit, MAX_MESSAGES));
  }

  push(
    input: Omit<CommunityMessage, 'id' | 'at'> & { at?: string },
  ): CommunityMessage {
    const msg: CommunityMessage = {
      id: `cz-${++this.seq}`,
      at: input.at ?? new Date().toISOString(),
      kind: input.kind,
      userId: input.userId,
      text: input.text,
      gameId: input.gameId,
      instrumentId: input.instrumentId,
      emoji: input.emoji,
    };
    this.messages.unshift(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(0, MAX_MESSAGES);
    }
    return msg;
  }

  getLastPostAt(userId: string): number | undefined {
    return this.lastPostAt.get(userId);
  }

  setLastPostAt(userId: string, at: number): void {
    this.lastPostAt.set(userId, at);
  }
}
