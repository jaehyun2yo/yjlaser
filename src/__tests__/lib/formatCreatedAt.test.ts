/**
 * formatCreatedAt 유틸 테스트
 * - 한국어 형식 (예: 3/23 오전 9시 3분)
 * - hours === 0 → "오전 12시"
 * - hours === 12 → "오후 12시"
 * - minutes === 0 → "~시"만 출력
 */

import { formatCreatedAt } from '@/app/(admin)/admin/contacts/_lib/utils';

describe('formatCreatedAt', () => {
  it('일반 오전 시각을 "M/D 오전 H시 m분"으로 포맷한다', () => {
    expect(formatCreatedAt('2026-04-17T09:03:00')).toBe('4/17 오전 9시 3분');
  });

  it('일반 오후 시각을 "M/D 오후 H시 m분"으로 포맷한다 (12시간제 변환)', () => {
    expect(formatCreatedAt('2026-03-23T15:30:00')).toBe('3/23 오후 3시 30분');
  });

  it('hours === 0 (자정)은 "오전 12시"로 표시한다', () => {
    expect(formatCreatedAt('2026-04-17T00:25:00')).toBe('4/17 오전 12시 25분');
  });

  it('hours === 12 (정오)은 "오후 12시"로 표시한다', () => {
    expect(formatCreatedAt('2026-04-17T12:45:00')).toBe('4/17 오후 12시 45분');
  });

  it('minutes === 0이면 분을 생략하고 "~시"로 종료한다', () => {
    expect(formatCreatedAt('2026-04-17T09:00:00')).toBe('4/17 오전 9시');
  });

  it('minutes === 0 + hours === 12 (정오)은 "오후 12시"로 표시한다', () => {
    expect(formatCreatedAt('2026-04-17T12:00:00')).toBe('4/17 오후 12시');
  });

  it('minutes === 0 + hours === 0 (자정)은 "오전 12시"로 표시한다', () => {
    expect(formatCreatedAt('2026-04-17T00:00:00')).toBe('4/17 오전 12시');
  });
});
