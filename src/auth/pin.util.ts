import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LEN = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, KEY_LEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(pin, salt, KEY_LEN);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function normalizeNickname(raw: string): string {
  return raw.trim().slice(0, 12);
}

export function validateNickname(nickname: string): string | null {
  if (!nickname) return '닉네임을 입력해 주세요.';
  if (nickname.length < 2) return '닉네임은 2자 이상이어야 해요.';
  if (!/^[\uAC00-\uD7A3a-zA-Z0-9_]+$/.test(nickname)) {
    return '닉네임은 한글·영문·숫자·_(언더바)만 가능해요.';
  }
  return null;
}

export function validatePin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'PIN은 숫자 4자리예요.';
  return null;
}
