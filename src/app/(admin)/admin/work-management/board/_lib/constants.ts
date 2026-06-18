import type { ProcessStage } from '@/lib/utils/processStages';

export type WorkCategory = 'unclassified' | 'office' | 'field';

export const WORK_CATEGORIES: Record<
  WorkCategory,
  {
    label: string;
    description: string;
    stages: ProcessStage[];
  }
> = {
  unclassified: {
    label: '미분류',
    description: '칼선의뢰/목형의뢰로 분류되지 않은 문의',
    stages: [],
  },
  office: {
    label: '사무실 작업',
    description: '문의 접수부터 샘플제작 및 확인까지',
    stages: [null, 'drawing', 'sample'],
  },
  field: {
    label: '현장 작업',
    description: '도면 확정 및 목형의뢰부터 납품까지',
    stages: ['drawing_confirmed', 'laser', 'cutting', 'creasing', 'delivery'],
  },
} as const;

export const UNCLASSIFIED_STAGE_FILTERS = [{ key: 'all', label: '전체' }] as const;

export const OFFICE_STAGE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'pre-process', label: '공정 시작 전' },
  { key: 'drawing', label: '도면작업' },
  { key: 'sample', label: '샘플제작 및 확인' },
] as const;

export const FIELD_STAGE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'drawing_confirmed', label: '도면 확정 및 목형의뢰' },
  { key: 'laser', label: '레이저 가공' },
  { key: 'cutting', label: '칼 작업' },
  { key: 'creasing', label: '오시작업' },
  { key: 'delivery', label: '납품' },
] as const;
