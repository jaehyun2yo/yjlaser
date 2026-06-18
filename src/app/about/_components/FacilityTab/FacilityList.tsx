'use client';

import type { FC } from 'react';
import { FACILITY_DATA } from '@/app/about/_lib/data';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

// 시설 아이콘 컴포넌트
const FacilityIcon: FC<{ id: string }> = ({ id }) => {
  const iconClass = 'w-7 h-7';

  switch (id) {
    case 'laser':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      );
    case 'cad':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
          />
        </svg>
      );
    case 'sample':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      );
    case 'quality':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      );
  }
};

const FacilityList: FC = () => {
  return (
    <section>
      {/* 섹션 타이틀 */}
      <div className="text-center mb-16 md:mb-20">
        <p className="text-[#ED6C00] text-sm font-medium tracking-widest uppercase mb-3">
          Facilities
        </p>
        <h2 className={`text-3xl md:text-4xl font-bold ${TEXT_COLOR.strong}`}>생산 시설</h2>
      </div>

      {/* 메인 이미지 플레이스홀더 */}
      <div
        className={`relative rounded-2xl overflow-hidden mb-16 md:mb-20
        bg-gradient-to-br from-muted to-background border ${BORDER_COLOR.default}`}
      >
        <div className="aspect-video md:aspect-[21/9] flex items-center justify-center">
          <div className="text-center">
            <div
              className={`w-20 h-20 mx-auto mb-6 rounded-full ${BG_COLOR.grayTranslucentLight} flex items-center justify-center`}
            >
              <svg
                className={`w-10 h-10 ${TEXT_COLOR.dim}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className={`${TEXT_COLOR.dim} text-sm`}>작업장 전경 이미지</p>
          </div>
        </div>
        {/* 코너 장식 */}
        <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-[#ED6C00]/30" />
        <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-[#ED6C00]/30" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-[#ED6C00]/30" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-[#ED6C00]/30" />
      </div>

      {/* 시설 목록 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto mb-16 md:mb-20">
        {FACILITY_DATA.map((facility, index) => (
          <article
            key={facility.id}
            className={`group relative ${BG_COLOR.grayDark} border ${BORDER_COLOR.default} rounded-2xl p-6 md:p-8
              hover:border-[#ED6C00]/30 ${BG_COLOR.hoverWhite} hover:shadow-lg
              transition-all duration-300`}
          >
            {/* 넘버 + 아이콘 */}
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-12 h-12 rounded-xl bg-[#ED6C00]/10 border border-[#ED6C00]/20
                flex items-center justify-center text-[#ED6C00]
                group-hover:bg-[#ED6C00]/20 transition-colors duration-300"
              >
                <FacilityIcon id={facility.id} />
              </div>
              <span className={`text-xs ${TEXT_COLOR.dim} font-mono`}>
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>

            {/* 타이틀 */}
            <h3 className={`text-lg md:text-xl font-semibold ${TEXT_COLOR.strong} mb-3`}>
              {facility.title}
            </h3>

            {/* 구분선 */}
            <div
              className={`w-8 h-px ${BG_COLOR.strong} group-hover:w-12 group-hover:bg-[#ED6C00]/50 transition-all duration-300 mb-4`}
            />

            {/* 설명 */}
            <p className={`text-sm md:text-base ${TEXT_COLOR.subtle} leading-relaxed`}>
              {facility.description}
            </p>
          </article>
        ))}
      </div>

      {/* 하단 이미지 플레이스홀더 */}
      <div
        className={`relative rounded-2xl overflow-hidden
        bg-gradient-to-br from-muted to-background border ${BORDER_COLOR.default}`}
      >
        <div className="aspect-video md:aspect-[21/9] flex items-center justify-center">
          <div className="text-center">
            <div
              className={`w-20 h-20 mx-auto mb-6 rounded-full ${BG_COLOR.grayTranslucentLight} flex items-center justify-center`}
            >
              <svg
                className={`w-10 h-10 ${TEXT_COLOR.dim}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className={`${TEXT_COLOR.dim} text-sm`}>장비 또는 작업 과정 이미지</p>
          </div>
        </div>
        {/* 코너 장식 */}
        <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-[#ED6C00]/30" />
        <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-[#ED6C00]/30" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-[#ED6C00]/30" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-[#ED6C00]/30" />
      </div>
    </section>
  );
};

export default FacilityList;
