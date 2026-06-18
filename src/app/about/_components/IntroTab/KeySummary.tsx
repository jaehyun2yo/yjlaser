'use client';

import type { FC } from 'react';
import { SUMMARY_BLOCKS } from '@/app/about/_lib/data';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const KeySummary: FC = () => {
  return (
    <section className="mb-20 md:mb-28">
      {/* 섹션 타이틀 */}
      <div className="text-center mb-12 md:mb-16">
        <p className="text-[#ED6C00] text-sm font-medium tracking-widest uppercase mb-3">
          Key Points
        </p>
        <h2 className={`text-2xl md:text-3xl font-bold ${TEXT_COLOR.strong}`}>핵심 요약</h2>
      </div>

      {/* 요약 블록 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {SUMMARY_BLOCKS.map((block, index) => (
          <article
            key={block.id}
            className={`group relative ${BG_COLOR.grayDark} border ${BORDER_COLOR.default} rounded-2xl p-6 md:p-8
              hover:border-[#ED6C00]/30 ${BG_COLOR.hoverWhite} hover:shadow-lg
              transition-all duration-300`}
          >
            {/* 넘버링 */}
            <span
              className="absolute -top-3 -left-3 w-8 h-8 flex items-center justify-center
              bg-[#ED6C00] text-white text-sm font-bold rounded-lg
              group-hover:scale-110 transition-transform duration-300"
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            {/* 블록 타이틀 */}
            <h3 className={`text-lg md:text-xl font-semibold ${TEXT_COLOR.strong} mb-4 mt-2`}>
              {block.title}
            </h3>

            {/* 구분선 */}
            <div
              className={`w-8 h-0.5 ${BG_COLOR.strong} group-hover:bg-[#ED6C00]/50 group-hover:w-12 transition-all duration-300 mb-4`}
            />

            {/* 블록 내용 */}
            <p className={`text-sm md:text-base ${TEXT_COLOR.subtle} leading-relaxed`}>
              {block.content}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default KeySummary;
