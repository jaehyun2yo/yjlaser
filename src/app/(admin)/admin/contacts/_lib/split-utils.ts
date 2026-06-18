import type { Contact } from '@/lib/types';
import { PROCESS_STAGES_ARRAY } from '@/lib/utils/processStages';

/**
 * 분할 하위번호 생성
 * @example generateSplitNumber("260413-O-001", 2) → "260413-O-001-2"
 */
export function generateSplitNumber(baseNumber: string, index: number): string {
  return `${baseNumber}-${index}`;
}

/**
 * 그룹 진행률 계산
 */
export function calcGroupProgress(children: Contact[]): {
  completed: number;
  total: number;
  allCompleted: boolean;
} {
  const total = children.length;
  const completed = children.filter((c) => c.stage_completed === true).length;
  return { completed, total, allCompleted: total > 0 && completed === total };
}

/**
 * 그룹 일괄 이동 가능 여부
 */
export function canGroupAdvance(children: Contact[]): boolean {
  return children.length > 0 && children.every((c) => c.stage_completed === true);
}

/**
 * 다음 공정 단계 반환
 */
export function getNextProcessStage(currentStage: string): string | null {
  const currentIndex = PROCESS_STAGES_ARRAY.findIndex((s) => s.id === currentStage);
  if (currentIndex === -1 || currentIndex >= PROCESS_STAGES_ARRAY.length - 1) {
    return null;
  }
  return PROCESS_STAGES_ARRAY[currentIndex + 1].id;
}
