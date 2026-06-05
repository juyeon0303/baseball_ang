import { existsSync } from 'fs';
import { join } from 'path';

/**
 * 컴파일 후 __dirname = /app/dist (Docker/Render)
 * → dist/index.html 을 우선 사용 (src 폴더는 프로덕션에 없음)
 */
export function resolveStaticDir(): string {
  if (existsSync(join(__dirname, 'index.html'))) {
    return __dirname;
  }
  const dist = join(process.cwd(), 'dist');
  if (existsSync(join(dist, 'index.html'))) {
    return dist;
  }
  if (process.env.NODE_ENV === 'production') {
    return dist;
  }
  return join(process.cwd(), 'src');
}

export function resolveIndexHtml(): string {
  return join(resolveStaticDir(), 'index.html');
}
