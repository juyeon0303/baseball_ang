import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LocalJsonStore } from '../persist/local-json-store';
import { KBO_FETCH_UA } from './kbo-html.util';

export interface KboRosterEntry {
  kboPlayerId: number;
  name: string;
  team?: string;
  position?: string;
  role: 'hitter' | 'pitcher';
  backNo?: string;
}

interface RosterFile {
  updatedAt: string;
  season: number;
  players: KboRosterEntry[];
}

const KBO_TEAMS = ['LG', 'KT', 'SSG', 'NC', '두산', 'KIA', '롯데', '삼성', '한화', '키움'];

const SURNAME_SEEDS = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권',
  '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남',
  '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민', '나', '진', '지', '엄', '원',
  '천', '방', '공', '현', '함',
];

const HITTER_SORTS = ['HRA_RT', 'HIT_CN', 'HR_CN', 'RBI_CN', 'SB_CN', 'OPS', 'GAME_CN'];
const PITCHER_SORTS = ['ERA', 'WIN_CN', 'SAVE_CN', 'GAME_CN'];

interface SearchPlayerHit {
  P_ID?: number;
  P_NM?: string;
  POS_NO?: string;
  T_NM?: string;
  BACK_NO?: string;
  P_LINK?: string;
}

@Injectable()
export class KboRosterProvider implements OnModuleInit {
  private readonly logger = new Logger(KboRosterProvider.name);
  private readonly store = new LocalJsonStore<RosterFile>('kbo-roster.json');
  private readonly byId = new Map<number, KboRosterEntry>();
  private readonly byName = new Map<string, KboRosterEntry>();
  private rosterUpdatedAt = '';
  private syncPromise: Promise<void> | null = null;
  private readonly season = parseInt(process.env.KBO_STATS_SEASON ?? '2026', 10);

  async onModuleInit(): Promise<void> {
    this.loadFromDisk();
    if (this.byId.size === 0) {
      void this.ensureRoster(false);
    }
  }

  getRosterUpdatedAt(): string {
    return this.rosterUpdatedAt;
  }

  getAll(): KboRosterEntry[] {
    return [...this.byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ko'),
    );
  }

  findById(id: number): KboRosterEntry | undefined {
    return this.byId.get(id);
  }

  findByName(name: string): KboRosterEntry | undefined {
    const key = normalizeName(name);
    return this.byName.get(key);
  }

  search(query: string, opts?: { team?: string; role?: 'hitter' | 'pitcher' | 'all'; limit?: number }): KboRosterEntry[] {
    const q = normalizeName(query);
    const team = opts?.team?.trim();
    const role = opts?.role ?? 'all';
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 80));
    const out: KboRosterEntry[] = [];

    for (const p of this.byId.values()) {
      if (team && team !== 'all' && p.team !== team) continue;
      if (role !== 'all' && p.role !== role) continue;
      if (q) {
        const nk = normalizeName(p.name);
        if (!nk.includes(q) && !q.includes(nk)) continue;
      }
      out.push(p);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  remember(entry: KboRosterEntry): void {
    this.byId.set(entry.kboPlayerId, entry);
    this.byName.set(normalizeName(entry.name), entry);
  }

  /** wait=true → refresh API 등에서 동기화 완료까지 대기 */
  async ensureRoster(force = false, wait = false): Promise<void> {
    const cached = this.store.load();
    const maxAgeMs = 24 * 60 * 60 * 1000;
    const cacheFresh =
      cached?.players?.length &&
      Date.now() - Date.parse(cached.updatedAt) < maxAgeMs;

    if (cached?.players?.length && this.byId.size === 0) {
      this.applyFile(cached);
    }

    if (!force && cacheFresh) {
      return;
    }

    if (!force && this.byId.size > 0) {
      if (!cacheFresh) void this.startBackgroundSync();
      return;
    }

    if (this.syncPromise) {
      if (wait || force) return this.syncPromise;
      return;
    }

    this.syncPromise = this.syncRoster(force).finally(() => {
      this.syncPromise = null;
    });
    if (wait || force) return this.syncPromise;
  }

  private startBackgroundSync(): void {
    if (this.syncPromise) return;
    void this.ensureRoster(false, true).catch((e) =>
      this.logger.warn(`KBO 로스터 백그라운드 동기화 실패: ${e}`),
    );
  }

  async lookupRemote(name: string): Promise<KboRosterEntry | null> {
    const hits = await this.searchRemote(name);
    const key = normalizeName(name);
    const exact = hits.find((h) => normalizeName(h.name) === key);
    const row = exact ?? hits[0];
    if (row) this.remember(row);
    return row ?? null;
  }

  private loadFromDisk(): void {
    const cached = this.store.load();
    if (cached?.players?.length) this.applyFile(cached);
  }

  private applyFile(file: RosterFile): void {
    this.byId.clear();
    this.byName.clear();
    for (const p of file.players) this.remember(p);
    this.rosterUpdatedAt = file.updatedAt;
  }

  private async syncRoster(full = false): Promise<void> {
    this.logger.log(
      `KBO 로스터 동기화 시작 (${this.season}${full ? ', full' : ', fast'})`,
    );
    const merged = new Map<number, KboRosterEntry>();

    const add = (entry: KboRosterEntry) => merged.set(entry.kboPlayerId, entry);

    for (const sort of HITTER_SORTS) {
      for (let page = 1; page <= 3; page++) {
        const url = `https://www.koreabaseball.com/Record/Player/HitterBasic/Basic${page}.aspx?sort=${sort}`;
        for (const row of await this.scrapeListing(url, 'hitter')) add(row);
      }
    }
    for (const sort of PITCHER_SORTS) {
      for (let page = 1; page <= 3; page++) {
        const url = `https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic${page}.aspx?sort=${sort}`;
        for (const row of await this.scrapeListing(url, 'pitcher')) add(row);
      }
    }

    for (const surname of SURNAME_SEEDS) {
      for (const row of await this.searchRemote(surname)) add(row);
    }

    if (full || process.env.KBO_ROSTER_FULL_SYNC === 'true') {
      for (const surname of SURNAME_SEEDS) {
        for (let code = 0xac00; code <= 0xd7a3; code += 28) {
          const q = surname + String.fromCharCode(code);
          for (const row of await this.searchRemote(q)) add(row);
        }
      }
    }

    for (const p of merged.values()) this.remember(p);
    const file: RosterFile = {
      updatedAt: new Date().toISOString(),
      season: this.season,
      players: [...merged.values()],
    };
    this.store.save(file);
    this.rosterUpdatedAt = file.updatedAt;
    this.logger.log(`KBO 로스터 ${file.players.length}명 저장`);
  }

  private async scrapeListing(
    url: string,
    role: 'hitter' | 'pitcher',
  ): Promise<KboRosterEntry[]> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': KBO_FETCH_UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      const out: KboRosterEntry[] = [];
      for (const m of html.matchAll(/playerId=(\d+)">([^<]+)</g)) {
        out.push({
          kboPlayerId: parseInt(m[1], 10),
          name: m[2].trim(),
          role,
        });
      }
      return out;
    } catch (e) {
      this.logger.debug(`목록 스킵 ${url}: ${e}`);
      return [];
    }
  }

  private async searchRemote(name: string): Promise<KboRosterEntry[]> {
    try {
      const form = new URLSearchParams({ name: name.trim() });
      const res = await fetch(
        'https://www.koreabaseball.com/ws/Controls.asmx/GetSearchPlayer',
        {
          method: 'POST',
          headers: {
            'User-Agent': KBO_FETCH_UA,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json',
            Referer:
              'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { now?: SearchPlayerHit[] };
      return (data.now ?? [])
        .filter((h) => h.P_ID && h.P_NM)
        .map((h) => this.fromSearchHit(h));
    } catch {
      return [];
    }
  }

  private fromSearchHit(hit: SearchPlayerHit): KboRosterEntry {
    const pos = hit.POS_NO?.trim() ?? '';
    const link = hit.P_LINK ?? '';
    const role: 'hitter' | 'pitcher' =
      /PitcherDetail|투/.test(link + pos) ? 'pitcher' : 'hitter';
    return {
      kboPlayerId: hit.P_ID!,
      name: hit.P_NM!.trim(),
      team: hit.T_NM?.trim(),
      position: pos || undefined,
      role,
      backNo: hit.BACK_NO?.trim(),
    };
  }
}

export function normalizeName(name: string): string {
  return (name ?? '')
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
}

export { KBO_TEAMS };
