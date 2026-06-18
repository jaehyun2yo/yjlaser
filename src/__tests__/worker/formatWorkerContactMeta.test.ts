import {
  formatWorkerCreatedAt,
  formatWorkerDateTime,
} from '@/app/worker/_lib/formatWorkerContactMeta';

describe('formatWorkerContactMeta', () => {
  it('Worker 헤더 현재 시각을 오전/오후 포함 분 단위로 표시한다', () => {
    const date = new Date(2026, 4, 21, 18, 16, 30);

    expect(formatWorkerDateTime(date)).toBe('26년 5월 21일 오후 6시 16분');
  });

  it('기존 카드 생성일 표시 형식을 유지한다', () => {
    const date = new Date(2026, 4, 21, 9, 5, 0);

    expect(formatWorkerCreatedAt(date.toISOString())).toBe('26년 5월 21일 오전 9시 5분');
  });
});
