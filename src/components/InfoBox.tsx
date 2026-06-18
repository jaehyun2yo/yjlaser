'use client';

import React from 'react';
import { TRANSITION_STYLES, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface InfoBoxProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
  labelInside?: boolean; // 레이블을 박스 내부에 표시할지 여부
}

/**
 * 공통 정보 박스 컴포넌트
 * 회사위치, 샘플 발송 주소 등 정보를 표시하는 통일된 디자인
 */
export function InfoBox({ label, children, className = '', labelInside = false }: InfoBoxProps) {
  // 모바일 감지 (클라이언트 사이드에서만 작동)
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  return (
    <div className={className}>
      {label && !labelInside && (
        <label
          className={`block ${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary} mb-2`}
        >
          {label}
        </label>
      )}
      <div
        className={`${isMobile ? 'px-2 py-2' : 'px-4 py-3'} border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary} ${TRANSITION_STYLES.colors}`}
      >
        {label && labelInside && (
          <h4
            className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary} mb-2`}
          >
            {label}
          </h4>
        )}
        {children}
      </div>
    </div>
  );
}
