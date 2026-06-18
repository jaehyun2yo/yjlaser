'use client';

import { COMPANY_THEME, TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { ContactTimeline } from '@/components/ContactTimeline';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';

interface CompanyDrawingHistoryProps {
  contactId: string;
}

/**
 * 거래처 포탈 통합 타임라인 컴포넌트
 *
 * - 백엔드 GET /contacts/:id/timeline (forCompany=true) 응답을 그대로 노출
 * - 서버에서 isPublic=false 도면 수정 + 관리자 메타 마스킹 + note 제거 처리됨
 * - 읽기 전용 (삭제/수정/공개여부 토글 없음)
 */
export function CompanyDrawingHistory({ contactId }: CompanyDrawingHistoryProps) {
  const { entries, isLoading } = useContactTimeline(contactId, {
    externalExpanded: true,
  });

  if (isLoading) {
    return (
      <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
        <h3 className={`text-lg font-bold ${TEXT_COLOR.primary} mb-4`}>타임라인</h3>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`h-16 ${BG_COLOR.light} rounded`} />
          ))}
        </div>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
      <h3 className={`text-lg font-bold ${TEXT_COLOR.primary} mb-5`}>타임라인</h3>
      <ContactTimeline entries={entries} showActor />
    </div>
  );
}
