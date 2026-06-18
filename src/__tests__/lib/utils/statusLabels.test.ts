/**
 * 상태 레이블 유틸리티 테스트
 */

import {
  getStatusLabel,
  getStageLabel,
  getChangeTypeLabel,
  getActorTypeLabel,
  STATUS_LABELS,
  STAGE_LABELS,
} from '@/lib/utils/statusLabels';

describe('getStatusLabel', () => {
  it('received 상태에 "접수"를 반환한다', () => {
    expect(getStatusLabel('received')).toBe('접수');
  });

  it('drawing 상태에 "도면작업"을 반환한다', () => {
    expect(getStatusLabel('drawing')).toBe('도면작업');
  });

  it('confirmed 상태에 "컨펌"을 반환한다', () => {
    expect(getStatusLabel('confirmed')).toBe('컨펌');
  });

  it('delivered 상태에 "납품"을 반환한다', () => {
    expect(getStatusLabel('delivered')).toBe('납품');
  });

  it('알 수 없는 상태는 원래 값을 그대로 반환한다', () => {
    expect(getStatusLabel('unknown_status')).toBe('unknown_status');
  });

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(getStatusLabel('')).toBe('');
  });

  it('STATUS_LABELS의 모든 키에 대해 한글 레이블을 반환한다', () => {
    Object.keys(STATUS_LABELS).forEach((key) => {
      const label = getStatusLabel(key);
      expect(label).toBe(STATUS_LABELS[key]);
      // 모든 레이블이 비어있지 않은지 확인
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

describe('getStageLabel', () => {
  it('drawing 단계에 "도면작업"을 반환한다', () => {
    expect(getStageLabel('drawing')).toBe('도면작업');
  });

  it('laser 단계에 "레이저 가공"을 반환한다', () => {
    expect(getStageLabel('laser')).toBe('레이저 가공');
  });

  it('delivery 단계에 "납품"을 반환한다', () => {
    expect(getStageLabel('delivery')).toBe('납품');
  });

  it('알 수 없는 단계는 원래 값을 반환한다', () => {
    expect(getStageLabel('unknown_stage')).toBe('unknown_stage');
  });

  it('STAGE_LABELS의 모든 키에 대해 레이블을 반환한다', () => {
    Object.keys(STAGE_LABELS).forEach((key) => {
      expect(getStageLabel(key)).toBe(STAGE_LABELS[key]);
    });
  });
});

describe('getChangeTypeLabel', () => {
  it('created 변경 유형에 "문의 접수"를 반환한다', () => {
    expect(getChangeTypeLabel('created')).toBe('문의 접수');
  });

  it('status_change 변경 유형에 "상태 변경"을 반환한다', () => {
    expect(getChangeTypeLabel('status_change')).toBe('상태 변경');
  });

  it('deleted 변경 유형에 "삭제"를 반환한다', () => {
    expect(getChangeTypeLabel('deleted')).toBe('삭제');
  });

  it('알 수 없는 변경 유형은 원래 값을 반환한다', () => {
    expect(getChangeTypeLabel('custom_type')).toBe('custom_type');
  });
});

describe('getActorTypeLabel', () => {
  it('admin 액터에 "관리자"를 반환한다', () => {
    expect(getActorTypeLabel('admin')).toBe('관리자');
  });

  it('company 액터에 "거래처"를 반환한다', () => {
    expect(getActorTypeLabel('company')).toBe('거래처');
  });

  it('system 액터에 "시스템"을 반환한다', () => {
    expect(getActorTypeLabel('system')).toBe('시스템');
  });

  it('worker 액터에 "작업자"를 반환한다', () => {
    expect(getActorTypeLabel('worker')).toBe('작업자');
  });

  it('알 수 없는 액터 유형은 원래 값을 반환한다', () => {
    expect(getActorTypeLabel('unknown')).toBe('unknown');
  });
});
