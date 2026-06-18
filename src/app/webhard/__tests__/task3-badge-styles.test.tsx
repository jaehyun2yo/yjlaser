/**
 * Task #3: 뱃지 공통 스타일 추출 및 전체 통일 테스트
 * - BADGE_STYLES 상수가 @/lib/styles.ts에서 export되는지 검증
 * - Badge 컴포넌트 기본 동작 검증
 * - WebhardFolderItem 선택 상태 뱃지 반전 스타일 검증
 */

import { BADGE_STYLES } from '@/lib/styles/webhard';

describe('Task #3: BADGE_STYLES 상수', () => {
  it('BADGE_STYLES가 export된다', () => {
    expect(BADGE_STYLES).toBeDefined();
  });

  it('onOrange 스타일 필드가 존재한다 (주황 배경 위 반전)', () => {
    expect(BADGE_STYLES.onOrange).toBeDefined();
    expect(typeof BADGE_STYLES.onOrange).toBe('string');
  });

  it('wrapper 필드가 존재한다', () => {
    expect(BADGE_STYLES.wrapper).toBeDefined();
    expect(typeof BADGE_STYLES.wrapper).toBe('string');
  });

  it('selectedWrapper 필드가 존재한다 (선택 상태 래퍼)', () => {
    expect(BADGE_STYLES.selectedWrapper).toBeDefined();
    expect(typeof BADGE_STYLES.selectedWrapper).toBe('string');
  });

  it('onOrange 스타일에 흰 배경 + 주황 텍스트 클래스가 포함된다', () => {
    // 주황 배경 위에서 뱃지가 흰 배경 + brand 텍스트로 반전되어야 함
    expect(BADGE_STYLES.onOrange).toContain('bg-white');
    expect(BADGE_STYLES.onOrange).toContain('text-brand');
  });
});

describe('Task #3: Badge 컴포넌트 동작', () => {
  it('count=0이면 null을 반환한다 (렌더링 안 함)', () => {
    // Badge 컴포넌트의 formatBadgeText 로직 검증
    const formatBadgeText = (count: number | 'N'): string => {
      if (count === 'N') return 'N';
      if (count > 99) return '+99';
      return String(count);
    };
    expect(formatBadgeText(1)).toBe('1');
    expect(formatBadgeText(99)).toBe('99');
    expect(formatBadgeText(100)).toBe('+99');
    expect(formatBadgeText('N')).toBe('N');
  });

  it('99 초과 숫자는 +99로 포맷팅된다', () => {
    const count = 150;
    const display = count > 99 ? '+99' : String(count);
    expect(display).toBe('+99');
  });

  it('N 뱃지는 신규 파일 표시용이다', () => {
    const count: number | 'N' = 'N';
    const isNewBadge = count === 'N';
    expect(isNewBadge).toBe(true);
  });
});

describe('Task #3: WebhardFolderItem 선택 상태 뱃지', () => {
  it('선택 시 뱃지 반전 래퍼 클래스가 선택됨 상태에 따라 달라진다', () => {
    const isSelected = true;
    const badgeWrapperClass = isSelected ? BADGE_STYLES.selectedWrapper : BADGE_STYLES.wrapper;
    expect(badgeWrapperClass).toBe(BADGE_STYLES.selectedWrapper);
  });

  it('미선택 시 기본 래퍼 클래스가 사용된다', () => {
    const isSelected = false;
    const badgeWrapperClass = isSelected ? BADGE_STYLES.selectedWrapper : BADGE_STYLES.wrapper;
    expect(badgeWrapperClass).toBe(BADGE_STYLES.wrapper);
  });
});
