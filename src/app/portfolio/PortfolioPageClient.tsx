'use client';

import { useState, useCallback } from 'react';
import { PortfolioMagazineGallery, PortfolioLightFilter } from './_components';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

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

interface PortfolioPageClientProps {
  items: PortfolioItem[];
}

export function PortfolioPageClient({ items }: PortfolioPageClientProps) {
  const [filteredItems, setFilteredItems] = useState<PortfolioItem[]>(items);

  const handleFilterChange = useCallback((filtered: PortfolioItem[]) => {
    setFilteredItems(filtered);
  }, []);

  return (
    <div
      className={`min-h-screen ${BG_COLOR.darker} transition-colors duration-300`}
      data-header-theme="light"
    >
      {/* 히어로 섹션 */}
      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-white to-white" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand/5 via-transparent to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 md:px-8 text-center">
          <p className="text-brand text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            Portfolio
          </p>
          <h1
            className={`text-4xl md:text-5xl lg:text-6xl font-bold ${TEXT_COLOR.strong} mb-6 leading-tight`}
          >
            작업 갤러리
          </h1>
          <p
            className={`${TEXT_COLOR.subtle} text-lg md:text-xl max-w-2xl mx-auto leading-relaxed`}
          >
            유진레이저목형의 정밀한 기술력으로 완성된
            <br className="hidden md:block" />
            다양한 패키지 작업물을 소개합니다
          </p>
        </div>
      </section>

      {/* 메인 컨텐츠 */}
      <div className={`relative ${BG_COLOR.darker} transition-colors duration-300`}>
        <div className="w-full max-w-7xl mx-auto px-4 md:px-8 pb-20">
          {/* 필터 */}
          {items.length > 0 && (
            <PortfolioLightFilter items={items} onFilterChange={handleFilterChange} />
          )}

          {/* 매거진 그리드 갤러리 */}
          <PortfolioMagazineGallery items={filteredItems} />
        </div>
      </div>
    </div>
  );
}
