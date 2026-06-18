'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
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

interface PortfolioDetailClientProps {
  item: PortfolioItem;
}

// 이미지 URL 추출 헬퍼
function getImageUrl(
  image: string | { original: string; thumbnail?: string; medium?: string },
  size: 'thumbnail' | 'medium' | 'original' = 'original'
): string {
  if (typeof image === 'string') return image;
  return image[size] || image.original;
}

export function PortfolioDetailClient({ item }: PortfolioDetailClientProps) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <div className={`min-h-screen ${BG_COLOR.darker}`} data-header-theme="light">
      {/* 메인 컨텐츠 */}
      <main className="pt-20 md:pt-24">
        {/* 사진 중심 레이아웃 */}
        <div className="flex flex-col lg:flex-row min-h-screen">
          {/* 이미지 갤러리 영역 */}
          <div className={`flex-1 lg:w-2/3 xl:w-3/4 ${BG_COLOR.darker}`}>
            {/* 포트폴리오 제목 */}
            <div className="px-4 md:px-8 pb-4">
              <h1 className={`text-2xl md:text-3xl ${TEXT_COLOR.strong}`}>{item.title}</h1>
              {item.field && (
                <span className="inline-block mt-2 px-3 py-1 bg-[#ED6C00]/10 text-[#ED6C00] text-sm rounded-full">
                  {item.field}
                </span>
              )}
            </div>

            {/* 모든 이미지 세로 스크롤 */}
            <div className="px-4 md:px-8 pb-8 lg:pb-24">
              <div className="space-y-6 md:space-y-8">
                {item.images && item.images.length > 0 ? (
                  item.images.map((image, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-100px' }}
                      transition={{ duration: 0.5 }}
                      className="relative w-full"
                    >
                      <div className={`relative ${BG_COLOR.gray} rounded-xl overflow-hidden`}>
                        <Image
                          src={getImageUrl(image, 'original')}
                          alt={`${item.title} - ${idx + 1}`}
                          width={1200}
                          height={800}
                          className="w-full h-auto"
                          sizes="(max-width: 1024px) 100vw, 66vw"
                          priority={idx === 0}
                        />
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className={`flex items-center justify-center h-[50vh] ${TEXT_COLOR.dim}`}>
                    이미지가 없습니다
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 정보 사이드바 - 데스크탑 */}
          <aside
            className={`hidden lg:block lg:w-1/3 xl:w-1/4 ${BG_COLOR.darker} border-l ${BORDER_COLOR.light}`}
          >
            <div className="sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto">
              <div className="p-6 xl:p-8">
                <ProductInfo item={item} />
              </div>
            </div>
          </aside>
        </div>

        {/* 모바일 정보 슬라이드업 */}
        <div
          className={`lg:hidden fixed inset-x-0 -bottom-4 z-40 ${BG_COLOR.darker} rounded-t-3xl
            shadow-[0_-4px_30px_rgba(0,0,0,0.15)]
            border-t ${BORDER_COLOR.default}
            transform transition-transform duration-300 ease-out pb-4
            ${isInfoOpen ? 'translate-y-0' : 'translate-y-[calc(100%-76px)]'}`}
        >
          {/* 핸들 */}
          <button
            onClick={() => setIsInfoOpen(!isInfoOpen)}
            className="w-full py-3 flex flex-col items-center bg-gradient-to-b from-[#ED6C00]/5 to-transparent"
          >
            <div className="w-10 h-1 rounded-full bg-[#ED6C00]/40 mb-3" />
            <span className={`text-sm ${TEXT_COLOR.secondary}`}>
              {isInfoOpen ? '정보 닫기' : '상세 정보 보기'}
            </span>
          </button>

          {/* 정보 컨텐츠 */}
          <div className={`px-6 pb-8 max-h-[70vh] overflow-y-auto ${isInfoOpen ? '' : 'hidden'}`}>
            <ProductInfo item={item} />
          </div>
        </div>
      </main>
    </div>
  );
}

// 제품 정보 컴포넌트
function ProductInfo({ item }: { item: PortfolioItem }) {
  // 문의하기 URL 생성 (제품 정보 포함)
  const getContactUrl = () => {
    const params = new URLSearchParams();
    params.set('portfolioId', String(item.id));
    params.set('portfolioTitle', item.title);
    if (item.field) params.set('portfolioField', item.field);
    if (item.type) params.set('portfolioType', item.type);
    if (item.format) params.set('portfolioFormat', item.format);
    if (item.size) params.set('portfolioSize', item.size);
    if (item.paper) params.set('portfolioPaper', item.paper);
    if (item.printing) params.set('portfolioPrinting', item.printing);
    if (item.finishing) params.set('portfolioFinishing', item.finishing);

    // 첫 번째 이미지 URL 추가
    if (item.images && item.images.length > 0) {
      const firstImage = item.images[0];
      const imageUrl =
        typeof firstImage === 'string' ? firstImage : firstImage.thumbnail || firstImage.original;
      params.set('portfolioImage', imageUrl);
    }

    return `/contact?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-2xl xl:text-3xl ${TEXT_COLOR.strong} leading-tight mb-3`}>
          {item.title}
        </h1>
        {item.description && (
          <p className={`${TEXT_COLOR.tertiary} leading-relaxed`}>{item.description}</p>
        )}
      </div>

      {/* 태그들 */}
      <div className="flex flex-wrap gap-2">
        {item.field && (
          <span className="px-3 py-1 bg-[#ED6C00]/10 text-[#ED6C00] text-sm rounded-full">
            {item.field}
          </span>
        )}
        {item.type && (
          <span
            className={`px-3 py-1 ${BG_COLOR.lightDark} ${TEXT_COLOR.tertiary} text-sm rounded-full`}
          >
            {item.type}
          </span>
        )}
      </div>

      {/* 스펙 정보 */}
      <div className={`${BG_COLOR.grayDark}/50 rounded-xl p-5 space-y-4`}>
        <h3 className={`text-sm ${TEXT_COLOR.subtle} uppercase tracking-wider`}>상세 사양</h3>
        <div className="space-y-3">
          {item.format && <InfoRow label="박스 형태" value={item.format} />}
          {item.size && <InfoRow label="크기" value={item.size} />}
          {item.paper && <InfoRow label="용지" value={item.paper} />}
          {item.printing && <InfoRow label="인쇄" value={item.printing} />}
          {item.finishing && <InfoRow label="후가공" value={item.finishing} />}
          {item.purpose && <InfoRow label="용도" value={item.purpose} />}
        </div>
      </div>

      {/* 문의 버튼 */}
      <Link
        href={getContactUrl()}
        className="block w-full py-4 px-6 bg-[#ED6C00] text-white text-center rounded-xl
          hover:bg-[#d45f00] transition-colors"
      >
        이 제품 문의하기
      </Link>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start">
      <span className={`${TEXT_COLOR.subtle} text-sm`}>{label}</span>
      <span className={`${TEXT_COLOR.strong} text-sm text-right max-w-[60%]`}>{value}</span>
    </div>
  );
}
