'use client';

import { memo } from 'react';
import { FaSpinner } from 'react-icons/fa';
import { useClassifyInquiryType } from '@/lib/hooks/useClassifyInquiryType';
import { Button } from '@/components/ui/button';
import type { Contact } from '@/lib/types';

export interface InquiryClassifyButtonsProps {
  contact: Contact;
  /** 버튼 크기 — 'md' 기본, 'sm' 은 Worker 카드 헤더용 컴팩트 */
  size?: 'sm' | 'md';
  /** 버튼 클릭 시 이벤트 버블링 차단 — 카드 토글 방지 */
  onStopPropagation?: (e: React.MouseEvent) => void;
}

function InquiryClassifyButtonsComponent({
  contact,
  size = 'md',
  onStopPropagation,
}: InquiryClassifyButtonsProps) {
  const { classify, isPending, pendingType } = useClassifyInquiryType(contact);

  const handleClick = (type: 'cutting_request' | 'mold_request') => (e: React.MouseEvent) => {
    e.stopPropagation();
    onStopPropagation?.(e);
    void classify(type);
  };

  return (
    <div
      className="flex gap-2 flex-shrink-0 flex-wrap"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="문의 유형 분류"
    >
      <Button
        type="button"
        variant="primary"
        size={size}
        onClick={handleClick('cutting_request')}
        disabled={isPending}
        className="bg-info hover:bg-info/90 text-sm text-white font-bold whitespace-nowrap shadow-none hover:shadow-none"
        title="칼선의뢰로 분류"
        aria-label="칼선의뢰로 분류"
      >
        {isPending && pendingType === 'cutting_request' ? (
          <FaSpinner className="animate-spin" />
        ) : (
          '칼선의뢰'
        )}
      </Button>
      <Button
        type="button"
        variant="primary"
        size={size}
        onClick={handleClick('mold_request')}
        disabled={isPending}
        className="bg-brand hover:bg-brand-hover text-sm text-white font-bold whitespace-nowrap shadow-none hover:shadow-none"
        title="목형의뢰로 분류"
        aria-label="목형의뢰로 분류"
      >
        {isPending && pendingType === 'mold_request' ? (
          <FaSpinner className="animate-spin" />
        ) : (
          '목형의뢰'
        )}
      </Button>
    </div>
  );
}

export const InquiryClassifyButtons = memo(InquiryClassifyButtonsComponent);
