import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import {
  hashPin,
  normalizeNickname,
  validateNickname,
  validatePin,
  verifyPin,
} from './pin.util';

export interface AuthAccount {
  accountId: string;
  nickname: string;
  displayName: string;
  createdAt: string;
}

interface MemoryAccount extends AuthAccount {
  pinHash: string;
}

@Injectable()
export class AuthAccountService {
  private readonly memoryByNick = new Map<string, MemoryAccount>();
  private readonly memoryById = new Map<string, MemoryAccount>();
  private readonly displayCache = new Map<string, string>();

  constructor(private readonly userRepo?: Repository<UserEntity>) {}

  async register(nicknameRaw: string, pin: string): Promise<AuthAccount> {
    const nickname = normalizeNickname(nicknameRaw);
    const nickErr = validateNickname(nickname);
    if (nickErr) throw new BadRequestException(nickErr);
    const pinErr = validatePin(pin);
    if (pinErr) throw new BadRequestException(pinErr);

    if (await this.nicknameTaken(nickname)) {
      throw new ConflictException('이미 사용 중인 닉네임이에요.');
    }

    const accountId = randomUUID();
    const pinHash = hashPin(pin);
    const createdAt = new Date().toISOString();
    const account: MemoryAccount = {
      accountId,
      nickname,
      displayName: nickname,
      pinHash,
      createdAt,
    };

    if (this.userRepo) {
      await this.userRepo.save({
        externalId: accountId,
        nickname,
        pinHash,
        displayName: nickname,
        points: 100_000,
      });
    } else {
      this.memoryByNick.set(nickname.toLowerCase(), account);
      this.memoryById.set(accountId, account);
    }
    this.displayCache.set(accountId, nickname);
    return this.toPublic(account);
  }

  async login(nicknameRaw: string, pin: string): Promise<AuthAccount> {
    const nickname = normalizeNickname(nicknameRaw);
    const nickErr = validateNickname(nickname);
    if (nickErr) throw new BadRequestException(nickErr);
    const pinErr = validatePin(pin);
    if (pinErr) throw new BadRequestException(pinErr);

    const account = await this.findByNickname(nickname);
    if (!account || !verifyPin(pin, account.pinHash)) {
      throw new UnauthorizedException('닉네임 또는 PIN이 맞지 않아요.');
    }
    this.displayCache.set(account.accountId, account.displayName);
    return this.toPublic(account);
  }

  async updateDisplayName(
    accountId: string,
    displayNameRaw: string,
  ): Promise<string> {
    const name = displayNameRaw.trim().slice(0, 24);
    if (!name || name.toLowerCase() === 'guest') {
      throw new BadRequestException('표시 이름을 입력해 주세요.');
    }
    if (this.userRepo) {
      const row = await this.userRepo.findOne({ where: { externalId: accountId } });
      if (!row) throw new UnauthorizedException('계정을 찾을 수 없어요.');
      row.displayName = name;
      await this.userRepo.save(row);
    } else {
      const mem = this.memoryById.get(accountId);
      if (!mem) throw new UnauthorizedException('계정을 찾을 수 없어요.');
      mem.displayName = name;
    }
    this.displayCache.set(accountId, name);
    return name;
  }

  getDisplayName(accountId: string): string {
    return (
      this.displayCache.get(accountId) ??
      this.memoryById.get(accountId)?.displayName ??
      accountId.slice(0, 8)
    );
  }

  async warmDisplayName(accountId: string): Promise<void> {
    if (this.displayCache.has(accountId)) return;
    if (this.userRepo) {
      const row = await this.userRepo.findOne({ where: { externalId: accountId } });
      if (row?.displayName) {
        this.displayCache.set(accountId, row.displayName);
        return;
      }
      if (row?.nickname) {
        this.displayCache.set(accountId, row.nickname);
      }
      return;
    }
    const mem = this.memoryById.get(accountId);
    if (mem) this.displayCache.set(accountId, mem.displayName);
  }

  private async nicknameTaken(nickname: string): Promise<boolean> {
    const key = nickname.toLowerCase();
    if (this.memoryByNick.has(key)) return true;
    if (this.userRepo) {
      const row = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.nickname) = LOWER(:nickname)', { nickname })
        .getOne();
      return !!row;
    }
    return false;
  }

  private async findByNickname(nickname: string): Promise<MemoryAccount | null> {
    const key = nickname.toLowerCase();
    const mem = this.memoryByNick.get(key);
    if (mem) return mem;
    if (this.userRepo) {
      const row = await this.userRepo
        .createQueryBuilder('u')
        .addSelect('u.pinHash')
        .where('LOWER(u.nickname) = LOWER(:nickname)', { nickname })
        .getOne();
      if (!row?.pinHash) return null;
      return {
        accountId: row.externalId,
        nickname: row.nickname!,
        displayName: row.displayName ?? row.nickname!,
        pinHash: row.pinHash,
        createdAt: row.createdAt.toISOString(),
      };
    }
    return null;
  }

  private toPublic(account: MemoryAccount | AuthAccount): AuthAccount {
    return {
      accountId: account.accountId,
      nickname: account.nickname,
      displayName: account.displayName,
      createdAt: account.createdAt,
    };
  }
}
