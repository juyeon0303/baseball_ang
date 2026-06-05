import {

  BadRequestException,

  Inject,

  Injectable,

  Logger,

  OnModuleInit,

} from '@nestjs/common';

import { ModuleRef } from '@nestjs/core';

import { StockStreamGateway } from '../amm/stock-stream.gateway';

import { COMMUNITY_STORE } from './community-store.interface';
import type { ICommunityStore } from './community-store.interface';

import { CommunityMessage } from './community.types';



const MAX_TEXT = 120;

const COOLDOWN_MS = 2_000;



@Injectable()

export class CommunityService implements OnModuleInit {

  private readonly logger = new Logger(CommunityService.name);



  constructor(

    private readonly moduleRef: ModuleRef,

    @Inject(COMMUNITY_STORE) private readonly store: ICommunityStore,

  ) {}



  async onModuleInit(): Promise<void> {

    const feed = await Promise.resolve(this.store.getFeed(1));

    if (feed.length === 0) {

      await this.push({

        kind: 'system',

        text: '가가존 오픈 — 경기 소식이 실시간으로 올라옵니다. 매너 채팅 부탁!',

      });

    }

  }



  async getFeed(limit = 40): Promise<CommunityMessage[]> {

    return Promise.resolve(this.store.getFeed(limit));

  }



  async postChat(userId: string, text: string, gameId?: string): Promise<CommunityMessage> {

    const safeUser = this.safeUserId(userId);

    const safeText = this.normalizeText(text);

    await this.assertCooldown(safeUser);

    return this.push({

      kind: 'chat',

      userId: safeUser,

      text: safeText,

      gameId,

    });

  }



  async postReaction(userId: string, emoji: string): Promise<CommunityMessage> {

    const safeUser = this.safeUserId(userId);

    const safeEmoji = this.normalizeEmoji(emoji);

    await this.assertCooldown(safeUser, 800);

    return this.push({

      kind: 'reaction',

      userId: safeUser,

      text: safeEmoji,

      emoji: safeEmoji,

    });

  }



  postPlay(text: string, gameId?: string, team?: string): Promise<CommunityMessage> {

    return this.push({

      kind: 'play',

      text: team ? `[${team}] ${text}` : text,

      gameId,

    });

  }



  postTrade(

    userId: string,

    text: string,

    instrumentId?: string,

  ): Promise<CommunityMessage> {

    return this.push({

      kind: 'trade',

      userId: this.safeUserId(userId),

      text,

      instrumentId,

    });

  }



  postSystem(text: string): Promise<CommunityMessage> {

    return this.push({ kind: 'system', text });

  }



  private async push(

    input: Omit<CommunityMessage, 'id' | 'at'> & { at?: string },

  ): Promise<CommunityMessage> {

    const msg = await Promise.resolve(this.store.push(input));

    this.broadcast(msg);

    return msg;

  }



  private broadcast(msg: CommunityMessage): void {

    try {

      const gateway = this.moduleRef.get(StockStreamGateway, {

        strict: false,

      });

      gateway?.broadcastCommunity(msg);

    } catch (e) {

      this.logger.debug(`가가존 브로드캐스트 생략: ${e}`);

    }

  }



  private safeUserId(userId: string): string {

    const trimmed = (userId ?? 'guest').trim().slice(0, 16);

    if (!trimmed) return 'guest';

    return trimmed;

  }



  private normalizeText(text: string): string {

    const t = (text ?? '').replace(/\s+/g, ' ').trim();

    if (!t) throw new BadRequestException('메시지를 입력하세요.');

    if (t.length > MAX_TEXT) {

      throw new BadRequestException(`최대 ${MAX_TEXT}자까지 가능합니다.`);

    }

    return t;

  }



  private normalizeEmoji(emoji: string): string {

    const allowed = ['🔥', '⚾', '😭', '👍', '💀', '😂', '🙏', '👏'];

    const e = (emoji ?? '').trim();

    if (!allowed.includes(e)) {

      throw new BadRequestException('지원하지 않는 반응입니다.');

    }

    return e;

  }



  private async assertCooldown(userId: string, ms = COOLDOWN_MS): Promise<void> {

    const now = Date.now();

    const last = (await Promise.resolve(this.store.getLastPostAt(userId))) ?? 0;

    if (now - last < ms) {

      throw new BadRequestException('잠깐만요 — 너무 빠릅니다.');

    }

    await Promise.resolve(this.store.setLastPostAt(userId, now));

  }

}

