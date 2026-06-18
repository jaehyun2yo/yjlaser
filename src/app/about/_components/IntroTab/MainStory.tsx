'use client';

import type { FC } from 'react';
import { MAIN_STORY, CORE_VALUES } from '@/app/about/_lib/data';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

// 강조할 단어들을 메인색으로 변환하는 함수
const highlightKeywords = (text: string): React.ReactNode => {
  const keywords = ['정밀', '신뢰', '목형', '20년', '0.1mm'];
  const regex = new RegExp(`(${keywords.join('|')})`, 'g');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    keywords.includes(part) ? (
      <span key={index} className="text-brand">
        {part}
      </span>
    ) : (
      part
    )
  );
};

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

// 핵심 가치 인라인 컴포넌트
const InlineCoreValues: FC = () => {
  return (
    <div className="max-w-4xl mx-auto mt-16 md:mt-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {CORE_VALUES.map((value) => (
          <div
            key={value.id}
            className={`flex items-start gap-4 p-5 ${BG_COLOR.grayDark}/50 rounded-xl border ${BORDER_COLOR.lightMedium}`}
          >
            {/* 아이콘 */}
            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-brand/10 text-brand">
              <ValueIcon id={value.id} />
            </div>

            {/* 텍스트 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <h4 className={`text-base font-bold ${TEXT_COLOR.strong}`}>{value.title}</h4>
                <span className="text-xs text-brand font-medium">{value.titleEn}</span>
              </div>
              <p className={`text-sm ${TEXT_COLOR.subtle} leading-relaxed`}>{value.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MainStory: FC = () => {
  return (
    <section className="mb-20 md:mb-28">
      {/* 메인 타이틀 */}
      <div className="text-center mb-12 md:mb-16">
        <p className="text-brand text-sm font-medium tracking-widest uppercase mb-3">
          {MAIN_STORY.title}
        </p>
        <h2 className={`text-3xl md:text-4xl lg:text-5xl font-bold ${TEXT_COLOR.strong}`}>
          {MAIN_STORY.subtitle}
        </h2>
      </div>

      {/* 스토리 섹션들 */}
      <div className="space-y-16 md:space-y-20">
        {MAIN_STORY.sections.map((section, index) => (
          <article key={section.id} className="relative">
            {/* 첫 번째 섹션 - 인트로 (특별 스타일) */}
            {index === 0 ? (
              <div className="relative max-w-4xl mx-auto">
                {/* 인용구 스타일 */}
                <div className="relative pl-6 md:pl-8 border-l-2 border-brand/50">
                  {section.title && (
                    <h3 className={`text-xl md:text-2xl font-bold ${TEXT_COLOR.strong} mb-4`}>
                      {section.title}
                    </h3>
                  )}
                  <p
                    className={`max-w-3xl text-lg md:text-xl ${TEXT_COLOR.softMuted} leading-relaxed whitespace-pre-line`}
                  >
                    {section.content}
                  </p>
                </div>

                {/* 구분 장식 */}
                <div className="mt-16 md:mt-20 flex items-center justify-center gap-4">
                  <span className="w-12 h-px bg-gradient-to-r from-transparent to-border" />
                  <span className="w-2 h-2 rounded-full bg-brand/50" />
                  <span className="w-12 h-px bg-gradient-to-l from-transparent to-border" />
                </div>
              </div>
            ) : (
              /* 나머지 섹션들 */
              <div className="max-w-2xl mx-auto">
                {/* 섹션 제목 */}
                {section.title && (
                  <div className="mb-8">
                    {'titleSub' in section && section.titleSub ? (
                      <>
                        <p className="text-brand text-sm font-medium tracking-widest uppercase mb-2">
                          {section.title}
                        </p>
                        <h3 className={`text-2xl md:text-3xl font-bold ${TEXT_COLOR.strong}`}>
                          {section.titleSub}
                        </h3>
                      </>
                    ) : (
                      <h3 className={`text-2xl md:text-3xl font-bold ${TEXT_COLOR.strong}`}>
                        {highlightKeywords(section.title)}
                      </h3>
                    )}
                  </div>
                )}

                {/* 섹션 내용 */}
                <p
                  className={`text-base md:text-lg ${TEXT_COLOR.subtle} leading-loose whitespace-pre-line`}
                >
                  {section.content}
                </p>

                {/* "신뢰를 제조합니다" 섹션(index 3) 다음에 핵심 가치 배치 */}
                {index === 3 && <InlineCoreValues />}
              </div>
            )}
          </article>
        ))}

        {/* 클로징 섹션 */}
        {MAIN_STORY.closing && (
          <article className="relative max-w-2xl mx-auto text-center">
            {/* 구분 장식 */}
            <div className="mb-12 flex items-center justify-center gap-4">
              <span className="w-16 h-px bg-gradient-to-r from-transparent to-border" />
              <span className="w-2 h-2 rounded-full bg-brand" />
              <span className="w-16 h-px bg-gradient-to-l from-transparent to-border" />
            </div>

            {/* 인용문 */}
            <blockquote className="relative">
              <span className="absolute -top-4 -left-2 text-brand/20 text-6xl md:text-8xl font-serif leading-none">
                "
              </span>
              <p className="text-2xl md:text-3xl font-bold text-brand mb-6 leading-tight">
                {MAIN_STORY.closing.quote}
              </p>
              <p className={`text-base md:text-lg ${TEXT_COLOR.subtle} leading-relaxed`}>
                {MAIN_STORY.closing.description}
              </p>
            </blockquote>
          </article>
        )}
      </div>
    </section>
  );
};

export default MainStory;
