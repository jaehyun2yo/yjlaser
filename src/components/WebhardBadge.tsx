'use client';

import { useTotalUndownloadedCount } from '@/lib/hooks/useUndownloadedCount';
import { Badge } from './Badge';

interface WebhardBadgeProps {
  /** 아이콘 버튼용 절대 위치 스타일 적용 */
  asIcon?: boolean;
  /** 인라인 스타일 (모바일 메뉴용) */
  inline?: boolean;
}

/**
 * 웹하드 미다운로드 파일 뱃지 컴포넌트
 * - 통합 훅을 사용하여 실시간 업데이트 지원
 * - Socket.IO를 통해 파일 변경 시 자동 갱신
 */
export function WebhardBadge({ asIcon = false, inline = false }: WebhardBadgeProps) {
  const { count } = useTotalUndownloadedCount();

  if (inline) {
    return <Badge count={count} variant="inline" size="lg" />;
  }

  if (asIcon) {
    return <Badge count={count} variant="absolute" size="md" />;
  }

  return <Badge count={count} variant="default" size="sm" />;
}
