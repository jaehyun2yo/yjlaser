'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { transparentBlurDataURL } from '@/lib/images/placeholder';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';

interface PortfolioItem {
  id: string; // UUID
  title: string;
  field: string;
  purpose: string;
  type: string;
  format: string;
  size: string;
  paper: string;
  printing: string;
  finishing: string;
  description: string;
  images: string[] | Array<{ original: string; thumbnail?: string; medium?: string }>;
  created_at: string;
}

interface PortfolioCardProps {
  item: PortfolioItem;
  isHovered?: boolean;
  hasHoveredCard?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function PortfolioCard({
  item,
  isHovered = false,
  hasHoveredCard = false,
  onMouseEnter,
  onMouseLeave,
}: PortfolioCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const firstImage =
    Array.isArray(item.images) && item.images[0]
      ? typeof item.images[0] === 'string'
        ? item.images[0]
        : item.images[0].medium || item.images[0].thumbnail || item.images[0].original
      : null;

  const allImages = Array.isArray(item.images)
    ? item.images.map((img) =>
        typeof img === 'string' ? img : img.medium || img.original || img.thumbnail
      )
    : [];

  useEffect(() => {
    if (isOpen) {
      // 스크롤바 너비 계산
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      // body에 padding-right를 추가하여 스크롤바 공간 확보
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
    } else {
      // 원래대로 복원
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '0px';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.paddingRight = '0px';
    };
  }, [isOpen]);

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`group relative ${BG_COLOR.card} overflow-hidden transition-all duration-300 shadow-md cursor-pointer ${
          isHovered ? 'z-10' : hasHoveredCard ? 'opacity-40' : ''
        }`}
      >
        {/* 이미지 */}
        {firstImage && (
          <div className={`relative w-full aspect-[4/3] ${BG_COLOR.light} overflow-hidden`}>
            <Image
              src={firstImage}
              alt={item.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              placeholder="blur"
              blurDataURL={transparentBlurDataURL}
            />
          </div>
        )}

        {/* 호버 시 나타나는 텍스트 콘텐츠 - 오른쪽 하단에서 왼쪽으로 슬라이드 (리본 모양) */}
        <div
          className={`absolute bottom-0 right-0 transition-all duration-300 ${
            isHovered ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}
        >
          <div className="relative bg-black px-4 py-2 pr-6">
            <h2 className="text-lg font-semibold text-white line-clamp-1 whitespace-nowrap">
              {item.title}
            </h2>
            {/* 리본 끝 모양 (오른쪽 삼각형) */}
            <div className="absolute right-0 top-0 w-0 h-0 border-l-[12px] border-l-black border-t-[20px] border-t-transparent border-b-[20px] border-b-transparent"></div>
          </div>
        </div>
      </div>

      {/* 모달 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 animate-fadeIn overflow-y-auto"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`${BG_COLOR.card} rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto modal-scrollbar-hide`}
            >
              {/* 첫 번째 이미지 - 확대되면서 나타남 */}
              {allImages.length > 0 && (
                <div className="animate-expandFromCard">
                  <div
                    className={`relative w-full ${BG_COLOR.light} rounded-t-lg overflow-hidden flex items-center justify-center max-h-[60vh]`}
                  >
                    {allImages[0] && (
                      <Image
                        src={allImages[0]}
                        alt={item.title}
                        width={800}
                        height={600}
                        className="w-full h-auto max-w-full object-contain"
                        unoptimized
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 헤더 */}
              <div
                className={`sticky top-0 ${BG_COLOR.card} border-b ${BORDER_COLOR.default} p-4 flex justify-between items-center z-10 animate-fadeInContent`}
              >
                <h2 className={`text-xl font-bold ${TEXT_COLOR.primary}`}>{item.title}</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className={`p-2 rounded-lg ${BG_COLOR.hoverGray} transition-colors`}
                >
                  <svg
                    className={`w-6 h-6 ${TEXT_COLOR.muted}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* 내용 */}
              <div className="p-6 animate-fadeInContent">
                {/* 나머지 이미지들 (첫 번째 이미지 제외) */}
                {allImages.length > 1 && (
                  <div className="mb-6 space-y-4">
                    {allImages.slice(1).map(
                      (img, idx) =>
                        img && (
                          <div
                            key={idx + 1}
                            className={`relative w-full ${BG_COLOR.light} rounded-lg overflow-hidden flex items-center justify-center`}
                          >
                            <Image
                              src={img}
                              width={800}
                              height={600}
                              alt={`${item.title} - 이미지 ${idx + 2}`}
                              className="w-full h-auto object-contain"
                              unoptimized
                            />
                          </div>
                        )
                    )}
                  </div>
                )}

                {/* 상세 정보 */}
                <div className="space-y-6">
                  {/* 기본 정보 */}
                  <div className={`${BG_COLOR.gray}/50 rounded-lg p-4`}>
                    <h3
                      className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                    >
                      기본 정보
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>분야</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.field}</p>
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>목적</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.purpose}</p>
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>종류</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.type}</p>
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>형태</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.format}</p>
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>규격</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.size}</p>
                      </div>
                    </div>
                  </div>

                  {/* 제작 정보 */}
                  <div className={`${BG_COLOR.gray}/50 rounded-lg p-4`}>
                    <h3
                      className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                    >
                      제작 정보
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>지류</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.paper}</p>
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>인쇄</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.printing}</p>
                      </div>
                      <div>
                        <label className={`text-sm font-medium ${TEXT_COLOR.muted}`}>후가공</label>
                        <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>{item.finishing}</p>
                      </div>
                    </div>
                  </div>

                  {/* 설명 */}
                  {item.description && (
                    <div className={`${BG_COLOR.gray}/50 rounded-lg p-4`}>
                      <h3
                        className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                      >
                        설명
                      </h3>
                      <p className={`text-sm ${TEXT_COLOR.primary} whitespace-pre-line`}>
                        {item.description}
                      </p>
                    </div>
                  )}

                  {/* 등록일 */}
                  <div className={`${BG_COLOR.gray}/50 rounded-lg p-4`}>
                    <h3
                      className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3 border-b ${BORDER_COLOR.default} pb-2`}
                    >
                      등록 정보
                    </h3>
                    <p className={`text-sm ${TEXT_COLOR.muted}`}>
                      {new Date(item.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
