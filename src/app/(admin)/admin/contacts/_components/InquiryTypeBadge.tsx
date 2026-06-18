/**
 * 문의 유형 배지 컴포넌트
 * - mode='inline-action' (기본): 미분류 시 [칼선의뢰][목형의뢰] 2버튼 (1-click 분류)
 * - mode='label-only': 미분류 시 주황 "미분류" 단일 뱃지 (클릭 핸들러 없음, 별도 CTA 에서 분류)
 * - cutting_request: 파란색 "칼선의뢰" 라벨 (읽기 전용, mode 무관)
 * - mold_request: 초록색 "목형의뢰" 라벨 (읽기 전용, mode 무관)
 * - laser_cutting: 회색 "레이저가공" 라벨 (읽기 전용, mode 무관)
 * - website 문의: 초록색 "문의접수" 라벨 (읽기 전용, mode 무관)
 */
'use client';

import { memo } from 'react';
import { FaSpinner } from 'react-icons/fa';
import { Badge } from '@/components/ui/badge';
import { TRANSITION_STYLES } from '@/lib/styles';
import { useClassifyInquiryType } from '@/lib/hooks/useClassifyInquiryType';
import type { Contact, InquiryType } from '@/lib/types';

// 카드 헤더 뱃지 공통 사이즈 (긴급·상태·분류 뱃지와 통일)
const CARD_BADGE_SIZE = 'xs' as const;

interface InquiryTypeBadgeProps {
  contact: Contact;
  onStopPropagation?: (e: React.MouseEvent) => void;
  /** 미분류 상태에서의 렌더 방식
   * - 'inline-action' (기본): 기존 [칼선의뢰][목형의뢰] 인라인 2버튼 (하위호환)
   * - 'label-only': 주황 "미분류" 단일 뱃지, 클릭 핸들러 없음 */
  mode?: 'inline-action' | 'label-only';
}

function InquiryTypeBadgeComponent({
  contact,
  onStopPropagation,
  mode = 'inline-action',
}: InquiryTypeBadgeProps) {
  const { classify, isPending, pendingType } = useClassifyInquiryType(contact);

  const isUnclassified = !contact.inquiry_type && contact.source === 'webhard';
  const isWebsiteInquiry = !contact.inquiry_type && contact.source !== 'webhard';
  const isCuttingRequest = contact.inquiry_type === 'cutting_request';
  const isMoldRequest = contact.inquiry_type === 'mold_request';
  const isLaserCutting = contact.inquiry_type === 'laser_cutting';

  if (
    !isUnclassified &&
    !isWebsiteInquiry &&
    !isCuttingRequest &&
    !isMoldRequest &&
    !isLaserCutting
  ) {
    return null;
  }

  if (isWebsiteInquiry) {
    return (
      <Badge
        variant="success"
        size={CARD_BADGE_SIZE}
        className={`shrink-0 ${TRANSITION_STYLES.colors}`}
      >
        문의접수
      </Badge>
    );
  }

  if (isCuttingRequest) {
    return (
      <Badge
        variant="info"
        size={CARD_BADGE_SIZE}
        className={`shrink-0 ${TRANSITION_STYLES.colors}`}
      >
        칼선의뢰
      </Badge>
    );
  }

  if (isMoldRequest) {
    return (
      <Badge
        variant="success"
        size={CARD_BADGE_SIZE}
        className={`shrink-0 ${TRANSITION_STYLES.colors}`}
      >
        목형의뢰
      </Badge>
    );
  }

  if (isLaserCutting) {
    return (
      <Badge
        variant="gray"
        size={CARD_BADGE_SIZE}
        className={`shrink-0 ${TRANSITION_STYLES.colors}`}
      >
        레이저가공
      </Badge>
    );
  }

  if (mode === 'label-only') {
    return (
      <Badge
        variant="warning"
        size={CARD_BADGE_SIZE}
        className={`shrink-0 ${TRANSITION_STYLES.colors}`}
        aria-label="미분류 문의"
      >
        미분류
      </Badge>
    );
  }

  const handleClassify = (inquiryType: InquiryType) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onStopPropagation?.(e);
    void classify(inquiryType);
  };

  return (
    <div className="flex gap-1 shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <Badge
        asChild
        variant="info"
        size={CARD_BADGE_SIZE}
        className={`cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${TRANSITION_STYLES.colors}`}
      >
        <button
          type="button"
          onClick={handleClassify('cutting_request')}
          disabled={isPending}
          title="칼선의뢰로 분류"
          aria-label="칼선의뢰로 분류"
        >
          {isPending && pendingType === 'cutting_request' ? (
            <FaSpinner className="animate-spin text-[10px]" />
          ) : (
            '칼선의뢰'
          )}
        </button>
      </Badge>
      <Badge
        asChild
        variant="success"
        size={CARD_BADGE_SIZE}
        className={`cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${TRANSITION_STYLES.colors}`}
      >
        <button
          type="button"
          onClick={handleClassify('mold_request')}
          disabled={isPending}
          title="목형의뢰로 분류"
          aria-label="목형의뢰로 분류"
        >
          {isPending && pendingType === 'mold_request' ? (
            <FaSpinner className="animate-spin text-[10px]" />
          ) : (
            '목형의뢰'
          )}
        </button>
      </Badge>
    </div>
  );
}

export const InquiryTypeBadge = memo(InquiryTypeBadgeComponent);
