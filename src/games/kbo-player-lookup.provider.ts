import { Injectable, Logger } from '@nestjs/common';
import { KBO_TEAM_STOCKS } from '../market/market-lineup';

const KBO_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-player-lookup)';

export interface KboPlayerLookupRow {
  kboPlayerId: number;
  name: string;
  team?: string;
  position?: string;
  role: 'hitter' | 'pitcher';
}

interface SearchPlayerHit {
  P_ID?: number;
  P_NM?: string;
  POS_NO?: string;
  T_NM?: string;
}

@Injectable()
export class KboPlayerLookupProvider {
  private readonly logger = new Logger(KboPlayerLookupProvider.name);
  private readonly byName = new Map<string, KboPlayerLookupRow>();
  private readonly cacheAt = new Map<string, number>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;
  private indexBootstrapped = false;

  constructor() {
    for (const seed of KBO_TEAM_STOCKS) {
      if (!seed.kboPlayerId) continue;
      this.remember(seed.playerName, {
        kboPlayerId: seed.kboPlayerId,
        name: seed.playerName,
        team: seed.teamShort,
        role: seed.metric === 'era' ? 'pitcher' : 'hitter',
      });
    }
  }

  async resolve(name: string): Promise<KboPlayerLookupRow | null> {
    const key = normalizePlayerName(name);
    if (!key) return null;

    const cached = this.byName.get(key);
    const at = this.cacheAt.get(key) ?? 0;
    if (cached && Date.now() - at < this.ttlMs) {
      return cached;
    }

    await this.bootstrapIndex();

    const seeded = this.byName.get(key);
    if (seeded && Date.now() - (this.cacheAt.get(key) ?? 0) < this.ttlMs) {
      return seeded;
    }

    try {
      const row = await this.searchPlayer(name);
      if (row) {
        this.remember(name, row);
        return row;
      }
    } catch (e) {
      this.logger.debug(`선수 검색 실패 (${name}): ${e}`);
    }
    return null;
  }

  private remember(name: string, row: KboPlayerLookupRow): void {
    const key = normalizePlayerName(name);
    if (!key) return;
    this.byName.set(key, row);
    this.cacheAt.set(key, Date.now());
  }

  private async bootstrapIndex(): Promise<void> {
    if (this.indexBootstrapped) return;
    this.indexBootstrapped = true;
    const pages = [
      'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx',
      'https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx',
    ];
    for (const url of pages) {
      try {
        const html = await this.fetchHtml(url);
        for (const m of html.matchAll(
          /playerId=(\d+)">([^<]+)</g,
        )) {
          const role = url.includes('Pitcher') ? 'pitcher' : 'hitter';
          this.remember(m[2].trim(), {
            kboPlayerId: parseInt(m[1], 10),
            name: m[2].trim(),
            role,
          });
        }
      } catch (e) {
        this.logger.debug(`기록실 목록 스킵 ${url}: ${e}`);
      }
    }
  }

  private async searchPlayer(name: string): Promise<KboPlayerLookupRow | null> {
    const form = new URLSearchParams({ name: name.trim() });
    const res = await fetch(
      'https://www.koreabaseball.com/ws/Controls.asmx/GetSearchPlayer',
      {
        method: 'POST',
        headers: {
          'User-Agent': KBO_UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          Referer:
            'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) {
      throw new Error(`GetSearchPlayer HTTP ${res.status}`);
    }
    const data = (await res.json()) as { now?: SearchPlayerHit[] };
    const hit = data.now?.[0];
    if (!hit?.P_ID || !hit.P_NM) return null;
    const pos = hit.POS_NO?.trim() ?? '';
    const role: 'hitter' | 'pitcher' = /투/.test(pos) ? 'pitcher' : 'hitter';
    return {
      kboPlayerId: hit.P_ID,
      name: hit.P_NM.trim(),
      team: hit.T_NM?.trim(),
      position: pos || undefined,
      role,
    };
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': KBO_UA },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`KBO HTTP ${res.status}`);
    return res.text();
  }
}

export function normalizePlayerName(name: string): string {
  return (name ?? '')
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
}
