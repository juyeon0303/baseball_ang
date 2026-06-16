import { ForbiddenException } from '@nestjs/common';

/** When ADMIN_API_KEY is set, mutating admin routes require x-admin-key or Bearer match. */
export function assertAdminKey(
  headers: Record<string, string | undefined>,
): void {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) return;

  const headerKey = headers['x-admin-key']?.trim();
  const bearer = headers['authorization']?.startsWith('Bearer ')
    ? headers['authorization']!.slice(7).trim()
    : '';
  const provided = headerKey || bearer;
  if (provided !== expected) {
    throw new ForbiddenException('관리자 API 키가 필요합니다.');
  }
}
