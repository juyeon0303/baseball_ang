import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunityMessageEntity } from '../entities/community-message.entity';
import { CommunityMessage } from './community.types';
import { ICommunityStore } from './community-store.interface';

const MAX_MESSAGES = 120;
const COOLDOWN_CACHE_MAX = 500;

@Injectable()
export class PostgresCommunityStoreService
  implements ICommunityStore, OnModuleInit
{
  private seq = 0;
  private lastPostAt = new Map<string, number>();

  constructor(
    @InjectRepository(CommunityMessageEntity)
    private readonly repo: Repository<CommunityMessageEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.repo.count();
    if (count === 0) return;
    const latest = await this.repo.find({
      order: { id: 'DESC' },
      take: 1,
    });
    const lastId = latest[0]?.id ?? '';
    const n = parseInt(lastId.replace('cz-', ''), 10);
    if (!Number.isNaN(n)) this.seq = n;
  }

  async getFeed(limit: number): Promise<CommunityMessage[]> {
    const rows = await this.repo.find({
      order: { at: 'DESC' },
      take: Math.min(limit, MAX_MESSAGES),
    });
    return rows.map(toMessage);
  }

  async push(
    input: Omit<CommunityMessage, 'id' | 'at'> & { at?: string },
  ): Promise<CommunityMessage> {
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
    await this.repo.save({
      id: msg.id,
      at: new Date(msg.at),
      kind: msg.kind,
      userId: msg.userId,
      text: msg.text,
      gameId: msg.gameId,
      instrumentId: msg.instrumentId,
      emoji: msg.emoji,
    });
    await this.pruneOld();
    return msg;
  }

  getLastPostAt(userId: string): number | undefined {
    return this.lastPostAt.get(userId);
  }

  setLastPostAt(userId: string, at: number): void {
    this.lastPostAt.set(userId, at);
    if (this.lastPostAt.size > COOLDOWN_CACHE_MAX) {
      const first = this.lastPostAt.keys().next().value;
      if (first) this.lastPostAt.delete(first);
    }
  }

  private async pruneOld(): Promise<void> {
    const total = await this.repo.count();
    if (total <= MAX_MESSAGES) return;
    const oldest = await this.repo.find({
      order: { at: 'ASC' },
      take: total - MAX_MESSAGES,
    });
    if (oldest.length) await this.repo.remove(oldest);
  }
}

function toMessage(row: CommunityMessageEntity): CommunityMessage {
  return {
    id: row.id,
    at: row.at.toISOString(),
    kind: row.kind as CommunityMessage['kind'],
    userId: row.userId,
    text: row.text,
    gameId: row.gameId,
    instrumentId: row.instrumentId,
    emoji: row.emoji,
  };
}
