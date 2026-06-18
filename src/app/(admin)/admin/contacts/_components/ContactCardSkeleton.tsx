/**
 * 문의 카드 스켈레톤 컴포넌트
 * 로딩 중 표시되는 플레이스홀더
 * ContactCard와 동일한 레이아웃으로 구성
 */
'use client';

import { memo } from 'react';
import { CARD_STYLES } from '@/app/(admin)/admin/contacts/_lib/constants';
import { BG_COLOR, BORDER_COLOR } from '@/lib/styles';

function ContactCardSkeletonComponent() {
  return (
    <div className={`${CARD_STYLES.container} animate-pulse`}>
      {/* 헤더 영역 - ContactCard.header와 동일한 패딩 */}
      <div className="p-3 md:p-4">
        {/* 1순위: 상태 배지, 업체명, 문의번호, 토글 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 상태 배지 */}
            <div className={`h-5 w-14 ${BG_COLOR.light} rounded`} />
            {/* 업체명 */}
            <div className={`h-5 w-32 ${BG_COLOR.light} rounded`} />
            {/* 문의번호 */}
            <div className={`h-4 w-20 ${BG_COLOR.light} rounded`} />
          </div>
          {/* 토글 아이콘 */}
          <div className={`h-5 w-5 ${BG_COLOR.light} rounded`} />
        </div>

        {/* 2순위: 요약 정보 - ContactCardSummary와 동일 구조 */}
        <div className="space-y-2">
          {/* 작업현황 (공정 단계) */}
          <div className="mb-2">
            <div className={`h-3 w-12 ${BG_COLOR.light} rounded mb-1`} />
            <div className="flex items-center gap-0.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center">
                  <div className={`h-6 w-12 ${BG_COLOR.light} rounded`} />
                  {i < 6 && <div className={`w-1.5 h-0.5 ${BG_COLOR.light} mx-0.5`} />}
                </div>
              ))}
            </div>
          </div>

          {/* 담당자, 연락처, 이메일 - 인라인 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className={`h-3 w-24 ${BG_COLOR.light} rounded`} />
            <div className={`h-3 w-28 ${BG_COLOR.light} rounded`} />
            <div className={`h-3 w-36 ${BG_COLOR.light} rounded`} />
          </div>

          {/* 도면/샘플 정보 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className={`h-3 w-16 ${BG_COLOR.light} rounded`} />
            <div className={`h-5 w-14 ${BG_COLOR.light} rounded`} />
            <div className={`h-3 w-20 ${BG_COLOR.light} rounded`} />
          </div>

          {/* 수령방법 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className={`h-3 w-16 ${BG_COLOR.light} rounded`} />
            <div className={`h-5 w-10 ${BG_COLOR.light} rounded`} />
            <div className={`h-3 w-28 ${BG_COLOR.light} rounded`} />
          </div>
        </div>

        {/* 액션 버튼 영역 - CARD_STYLES.actions와 동일 */}
        <div className={`flex justify-end gap-1.5 pt-3 border-t mt-3 ${BORDER_COLOR.light}`}>
          <div className={`h-7 w-16 ${BG_COLOR.light} rounded`} />
          <div className={`h-7 w-16 ${BG_COLOR.light} rounded`} />
        </div>
      </div>
    </div>
  );
}

export const ContactCardSkeleton = memo(ContactCardSkeletonComponent);

/**
 * 여러 개의 스켈레톤을 표시하는 컴포넌트
 */
interface ContactCardSkeletonListProps {
  count?: number;
}

function ContactCardSkeletonListComponent({ count = 5 }: ContactCardSkeletonListProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <ContactCardSkeleton key={index} />
      ))}
    </div>
  );
}

export const ContactCardSkeletonList = memo(ContactCardSkeletonListComponent);
