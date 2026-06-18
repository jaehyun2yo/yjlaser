'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

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

interface PortfolioMagazineGalleryProps {
  items: PortfolioItem[];
}

// 이미지 URL 추출 헬퍼
function getImageUrl(
  image: string | { original: string; thumbnail?: string; medium?: string },
  size: 'thumbnail' | 'medium' | 'original' = 'medium'
): string {
  if (typeof image === 'string') return image;
  return image[size] || image.original;
}

export function PortfolioMagazineGallery({ items }: PortfolioMagazineGalleryProps) {
  // 매거진 스타일 레이아웃을 위한 높이 패턴 (불규칙적)
  const heightPatterns = useMemo(() => {
    return items.map((_, index) => {
      const patterns = ['tall', 'normal', 'normal', 'tall', 'normal', 'short', 'normal', 'tall'];
      return patterns[index % patterns.length];
    });
  }, [items]);

  return (
    <>
      {/* 매거진 그리드 */}
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="break-inside-avoid animate-stagger-item"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <Link
              href={`/portfolio/${item.id}`}
              className={`group relative block ${BG_COLOR.white} rounded-2xl overflow-hidden
                border ${BORDER_COLOR.lightMedium} hover:border-brand/30
                shadow-sm hover:shadow-xl
                transition-all duration-300`}
            >
              {/* 이미지 */}
              <div
                className={`relative overflow-hidden ${
                  heightPatterns[index] === 'tall'
                    ? 'aspect-[3/4]'
                    : heightPatterns[index] === 'short'
                      ? 'aspect-[4/3]'
                      : 'aspect-square'
                }`}
              >
                {item.images && item.images.length > 0 ? (
                  <Image
                    src={getImageUrl(item.images[0], 'medium')}
                    alt={item.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <div
                    className={`w-full h-full ${BG_COLOR.light} flex items-center justify-center`}
                  >
                    <span className={TEXT_COLOR.dim}>No Image</span>
                  </div>
                )}

                {/* 호버 오버레이 */}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent
                  opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                />

                {/* 호버 시 제목 표시 */}
                <div
                  className="absolute bottom-0 left-0 right-0 p-4
                  translate-y-full group-hover:translate-y-0 transition-transform duration-300"
                >
                  <h3 className="text-white font-semibold text-lg leading-tight line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="text-white/70 text-sm mt-1">{item.field}</p>
                </div>
              </div>

              {/* 카드 하단 정보 */}
              <div className="p-4">
                <h3
                  className={`font-semibold ${TEXT_COLOR.strong} line-clamp-1 group-hover:text-brand transition-colors`}
                >
                  {item.title}
                </h3>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`px-2 py-0.5 ${BG_COLOR.light} ${TEXT_COLOR.tertiary} text-xs rounded-full`}
                  >
                    {item.field}
                  </span>
                  {item.format && (
                    <span
                      className={`px-2 py-0.5 ${BG_COLOR.brandAlphaSoft} text-brand text-xs rounded-full`}
                    >
                      {item.format}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {/* 빈 상태 */}
      {items.length === 0 && (
        <div className="mx-auto max-w-xl text-center py-20">
          <div
            className={`w-20 h-20 mx-auto mb-6 rounded-full ${BG_COLOR.lightDark} flex items-center justify-center`}
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
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className={`text-2xl font-bold ${TEXT_COLOR.strong}`}>실제 작업 사례 준비 중</h2>
          <p className={`${TEXT_COLOR.subtle} mt-3 text-base leading-relaxed`}>
            공개 가능한 작업 사례는 선별 정리 중입니다. 먼저 대표 제작 유형으로 구조 방향을
            확인하시거나, 제작 조건을 보내주시면 맞춤 상담으로 안내해드립니다.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/#package-types"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand px-6 py-3 text-sm font-semibold text-brand transition-colors hover:bg-brand-light"
            >
              대표 제작 유형 보기
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              제작 상담하기
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
