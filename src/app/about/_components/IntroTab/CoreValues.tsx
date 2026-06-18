'use client';

import type { FC } from 'react';
import { CORE_VALUES } from '@/app/about/_lib/data';
import { TEXT_COLOR } from '@/lib/styles';

// 아이콘 컴포넌트
const ValueIcon: FC<{ id: string }> = ({ id }) => {
  const iconClass = 'w-6 h-6';

  switch (id) {
    case 'precision':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      );
    case 'trust':
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
    case 'expertise':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6M2 12l10 6 10-6"
          />
        </svg>
      );
    default:
      return null;
  }
};

const CoreValues: FC = () => {
  return (
    <section className="mb-16 md:mb-20">
      {/* 섹션 타이틀 */}
      <div className="text-center mb-12 md:mb-16">
        <p className="text-[#ED6C00] text-sm font-medium tracking-widest uppercase mb-3">
          Core Values
        </p>
        <h2 className={`text-2xl md:text-3xl font-bold ${TEXT_COLOR.strong}`}>핵심 가치</h2>
      </div>

      {/* 핵심 가치 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto">
        {CORE_VALUES.map((value) => (
          <article key={value.id} className="group relative text-center">
            {/* 아이콘 서클 */}
            <div
              className="w-16 h-16 mx-auto mb-6 flex items-center justify-center
              rounded-full bg-[#ED6C00]/10 border border-[#ED6C00]/20
              group-hover:bg-[#ED6C00]/20 group-hover:border-[#ED6C00]/40
              transition-all duration-300"
            >
              <span className="text-[#ED6C00]">
                <ValueIcon id={value.id} />
              </span>
            </div>

            {/* 타이틀 */}
            <h3 className={`text-xl md:text-2xl font-bold ${TEXT_COLOR.strong} mb-2`}>
              {value.title}
            </h3>
            <p className={`text-sm ${TEXT_COLOR.dim} mb-4`}>{value.titleEn}</p>

            {/* 설명 */}
            <p className={`text-sm md:text-base ${TEXT_COLOR.subtle} leading-relaxed`}>
              {value.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default CoreValues;
