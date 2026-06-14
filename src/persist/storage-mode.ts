export function isPostgresConfigured(): boolean {
  return (
    process.env.STORAGE_MODE === 'postgres' &&
    !!process.env.DATABASE_URL?.trim()
  );
}

/** postgres = DB · file = JSON 디스크 · memory = 재시작 시 초기화 */
export function getEffectiveStorageMode(): 'postgres' | 'file' | 'memory' {
  if (isPostgresConfigured()) return 'postgres';
  if (process.env.DATA_PERSIST === 'false') return 'memory';
  return 'file';
}

export function isPersistentStorage(): boolean {
  return getEffectiveStorageMode() === 'postgres';
}
