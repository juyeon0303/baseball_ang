import { mkdirSync } from 'fs';
import { join } from 'path';

export function getDataDir(): string {
  const dir = process.env.DATA_DIR?.trim() || join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return dir;
}
