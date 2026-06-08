/** Postgres DATABASE_URL 형식 검사 (Render 로그용 명확한 오류) */
export function assertValidDatabaseUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    throw new Error(
      'DATABASE_URL은 postgresql:// 로 시작해야 합니다. Supabase Database → URI 전체를 Render에 붙여넣으세요.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      'DATABASE_URL 파싱 실패. Supabase URI를 한 줄로 다시 복사하세요.',
    );
  }

  const host = parsed.hostname;
  if (!host || host.length < 4 || !host.includes('.')) {
    throw new Error(
      `DATABASE_URL 호스트가 "${host}"(으)로 잘못 파싱되었습니다. ` +
        'DB 비밀번호에 @ # : / ? % 등이 있으면 encodeURIComponent(비밀번호)로 URL 인코딩 후 URI에 넣으세요. ' +
        '예: postgresql://postgres.xxxx:인코딩된비번@aws-0-....pooler.supabase.com:6543/postgres',
    );
  }
}
