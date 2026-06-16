import {
  computeSentimentDelta,
  extractBatterName,
  resolveInstrumentForPlay,
} from './play-sentiment.util';

describe('play-sentiment.util', () => {
  const teamResolver = (team: string) =>
    team === 'KIA' ? 'kia-kim' : 'kiwoom-joo';

  it('extracts batter from relay text', () => {
    expect(extractBatterName('김도영 : 1루타')).toBe('김도영');
    expect(extractBatterName('1번타자 이주형 : 삼진')).toBe('이주형');
  });

  it('maps positive and negative play outcomes', () => {
    expect(
      computeSentimentDelta({ text: '김도영 : 홈런', playType: '홈런' }),
    ).toBeGreaterThan(0);
    expect(
      computeSentimentDelta({ text: '김도영 : 삼진', playType: '삼진' }),
    ).toBeLessThan(0);
    expect(computeSentimentDelta({ impact: 'run', multiplier: 2 })).toBe(
      0.024,
    );
  });

  it('resolves listed player before team fallback', () => {
    expect(
      resolveInstrumentForPlay({
        text: '김도영 : 2루타',
        team: 'KIA',
        resolveTeamInstrument: teamResolver,
      }),
    ).toBe('kia-kim');
    expect(
      resolveInstrumentForPlay({
        text: '득점',
        team: '키움',
        resolveTeamInstrument: teamResolver,
      }),
    ).toBe('kiwoom-joo');
  });
});
