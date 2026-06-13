export function formatBasesLabel(bases: {
  first: boolean;
  second: boolean;
  third: boolean;
}): string {
  if (!bases.first && !bases.second && !bases.third) return '주자 없음';
  const parts: string[] = [];
  if (bases.first) parts.push('1');
  if (bases.second) parts.push('2');
  if (bases.third) parts.push('3');
  return `${parts.join('·')}루`;
}
