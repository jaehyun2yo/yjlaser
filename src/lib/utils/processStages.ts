// 공정 단계 상수 및 유틸리티
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';

export type ProcessStage =
  | 'drawing' // 도면작업
  | 'sample' // 샘플제작 및 확인
  | 'drawing_confirmed' // 도면 확정 및 목형의뢰
  | 'laser' // 레이저 가공
  | 'cutting' // 칼 작업
  | 'creasing' // 오시작업
  | 'delivery' // 납품
  | null; // 공정 시작 전

export interface ProcessStageInfo {
  id: ProcessStage;
  label: string;
  order: number;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const PROCESS_STAGES: Record<NonNullable<ProcessStage>, ProcessStageInfo> = {
  drawing: {
    id: 'drawing',
    label: '도면작업',
    order: 1,
    color: TEXT_COLOR.info,
    bgColor: BG_COLOR.infoLighter,
    borderColor: 'border-blue-500',
  },
  sample: {
    id: 'sample',
    label: '샘플제작 및 확인',
    order: 2,
    color: TEXT_COLOR.purple,
    bgColor: BG_COLOR.purpleLight,
    borderColor: 'border-purple-500',
  },
  drawing_confirmed: {
    id: 'drawing_confirmed',
    label: '도면 확정 및 목형의뢰',
    order: 3,
    color: TEXT_COLOR.indigoLight,
    bgColor: BG_COLOR.indigoLight,
    borderColor: 'border-indigo-500',
  },
  laser: {
    id: 'laser',
    label: '레이저 가공',
    order: 4,
    color: TEXT_COLOR.orange,
    bgColor: BG_COLOR.orangeLight,
    borderColor: 'border-orange-500',
  },
  cutting: {
    id: 'cutting',
    label: '칼 작업',
    order: 5,
    color: TEXT_COLOR.warning,
    bgColor: BG_COLOR.yellowLight,
    borderColor: 'border-yellow-500',
  },
  creasing: {
    id: 'creasing',
    label: '오시작업',
    order: 6,
    color: TEXT_COLOR.tealLight,
    bgColor: BG_COLOR.teal,
    borderColor: 'border-teal-500',
  },
  delivery: {
    id: 'delivery',
    label: '납품',
    order: 7,
    color: TEXT_COLOR.success,
    bgColor: BG_COLOR.successLight,
    borderColor: 'border-green-500',
  },
};

export const PROCESS_STAGES_ARRAY = Object.values(PROCESS_STAGES).sort((a, b) => a.order - b.order);

/**
 * 레이저 전용 업체용 3단계 배열
 * 접수(레이저 대기) → 레이저가공(진행중) → 완료
 */
export const LASER_ONLY_STAGES: ProcessStageInfo[] = [
  {
    id: 'laser',
    label: '접수',
    order: 1,
    color: TEXT_COLOR.info,
    bgColor: BG_COLOR.infoLighter,
    borderColor: 'border-blue-500',
  },
  {
    id: 'laser',
    label: '레이저가공',
    order: 2,
    color: TEXT_COLOR.orange,
    bgColor: BG_COLOR.orangeLight,
    borderColor: 'border-orange-500',
  },
  {
    id: null,
    label: '완료',
    order: 3,
    color: TEXT_COLOR.success,
    bgColor: BG_COLOR.successLight,
    borderColor: 'border-green-500',
  },
];

/**
 * 레이저 전용 문의 여부 확인
 */
export function isLaserOnlyInquiry(inquiryType: string | null | undefined): boolean {
  return inquiryType === 'laser_cutting';
}

/**
 * 공정 단계 정보 가져오기
 */
export function getProcessStageInfo(stage: ProcessStage): ProcessStageInfo | null {
  if (!stage) return null;
  return PROCESS_STAGES[stage] || null;
}

/**
 * 공정 단계가 시작되었는지 확인 (status가 'read' 이상이면 공정 시작)
 */
export function isProcessStarted(status: string): boolean {
  return status !== 'received';
}

/**
 * 현재 공정 단계의 진행률 계산 (0-100)
 */
export function getProcessProgress(stage: ProcessStage): number {
  if (!stage) return 0;
  const stageInfo = PROCESS_STAGES[stage];
  if (!stageInfo) return 0;
  return Math.round((stageInfo.order / PROCESS_STAGES_ARRAY.length) * 100);
}
