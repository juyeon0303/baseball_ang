import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';

export interface SessionRecord {
  accountId: string;
  token: string;
  deviceId: string;
  displayName: string;
  createdAt: string;
}

const TOKEN_BYTES = 32;

@Injectable()
export class SessionAuthService {
  private readonly byToken = new Map<string, SessionRecord>();
  private readonly byDevice = new Map<string, string>();
  private readonly byAccount = new Map<string, SessionRecord>();

  bootstrap(deviceId: string): SessionRecord {
    const safeDevice = deviceId.trim().slice(0, 128);
    if (!safeDevice) {
      throw new BadRequestException('deviceId가 필요합니다.');
    }

    const existingId = this.byDevice.get(safeDevice);
    if (existingId) {
      const existing = this.byAccount.get(existingId);
      if (existing) return existing;
    }

    const accountId = randomUUID();
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const displayName = `팬${accountId.replace(/-/g, '').slice(0, 4)}`;
    const record: SessionRecord = {
      accountId,
      token,
      deviceId: safeDevice,
      displayName,
      createdAt: new Date().toISOString(),
    };

    this.byToken.set(token, record);
    this.byDevice.set(safeDevice, accountId);
    this.byAccount.set(accountId, record);
    return record;
  }

  validateToken(token: string | undefined | null): SessionRecord | null {
    if (!token?.trim()) return null;
    return this.byToken.get(token.trim()) ?? null;
  }

  requireToken(token: string | undefined | null): SessionRecord {
    const session = this.validateToken(token);
    if (!session) {
      throw new UnauthorizedException(
        '유효한 세션이 필요합니다. 페이지를 새로고침해 주세요.',
      );
    }
    return session;
  }

  parseBearer(header: string | undefined): string | null {
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice(7).trim() || null;
  }

  fromBearer(header: string | undefined): SessionRecord | null {
    return this.validateToken(this.parseBearer(header));
  }

  requireBearer(header: string | undefined): SessionRecord {
    return this.requireToken(this.parseBearer(header));
  }

  updateDisplayName(accountId: string, displayName: string): SessionRecord {
    const record = this.byAccount.get(accountId);
    if (!record) {
      throw new UnauthorizedException('세션을 찾을 수 없습니다.');
    }
    const name = displayName.trim().slice(0, 24);
    if (!name || name.toLowerCase() === 'guest') {
      throw new BadRequestException('표시 이름을 입력해 주세요.');
    }
    record.displayName = name;
    return record;
  }

  getDisplayName(accountId: string): string {
    return this.byAccount.get(accountId)?.displayName ?? accountId.slice(0, 8);
  }

  toPublic(record: SessionRecord) {
    return {
      accountId: record.accountId,
      token: record.token,
      displayName: record.displayName,
      createdAt: record.createdAt,
    };
  }
}
