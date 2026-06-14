import { Injectable } from '@nestjs/common';
import { StatMetricGroup } from '../games/player-stats.types';

/** 네이버 스포츠는 API 403·SPA라 서버 스크래핑 불가. KBO 테이블 기반 그룹만 노출. */
@Injectable()
export class NaverKboRecordProvider {
  getStatus(): { available: boolean; note: string } {
    return {
      available: false,
      note: '네이버 스포츠 기록 API는 서버에서 접근이 차단됩니다. KBO 공식·추정 고급 지표를 대신 표시합니다.',
    };
  }

  getPlayerMetrics(): StatMetricGroup | null {
    return null;
  }
}
