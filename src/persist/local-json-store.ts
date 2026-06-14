import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDataDir } from './data-path';

export class LocalJsonStore<T> {
  constructor(private readonly filename: string) {}

  private filePath(): string {
    return join(getDataDir(), this.filename);
  }

  load(): T | null {
    try {
      const path = this.filePath();
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  save(data: T): void {
    const path = this.filePath();
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, path);
  }
}
