import type { Metadata } from 'next';
import { serverGetPortfolios } from '@/lib/api/nestjs-server-client';
import { PortfolioPageClient } from './PortfolioPageClient';
import { logger } from '@/lib/utils/logger';
import { CollectionPageJsonLd } from '@/components/JsonLd';

// Build-time SSG 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음)
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

export const metadata: Metadata = {
  title: '포트폴리오 | 유진레이저목형',
  description:
    '유진레이저목형의 다양한 박스 지기구조 작업 사례를 확인하세요. 화장품, 식품, 전자제품 등 다양한 분야의 패키징 포트폴리오.',
  keywords: ['레이저목형 포트폴리오', '박스 샘플', '패키징 사례', '지기구조 작업'],
  alternates: {
    canonical: `${BASE_URL}/portfolio`,
  },
  openGraph: {
    title: '포트폴리오 | 유진레이저목형',
    description:
      '유진레이저목형의 다양한 박스 지기구조 작업 사례를 확인하세요. 화장품, 식품, 전자제품 등 다양한 분야의 패키징 포트폴리오.',
    url: `${BASE_URL}/portfolio`,
    siteName: '유진레이저목형',
    type: 'website',
    locale: 'ko_KR',
  },
};

// ISR: 1시간마다 재검증 (Next.js가 자동으로 페이지를 캐싱)
export const revalidate = 3600;

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
  images: string[];
  created_at: string;
}

async function getPortfolioItems(): Promise<PortfolioItem[]> {
  const portfolioLogger = logger.createLogger('PORTFOLIO');
  try {
    const data = await serverGetPortfolios();
    return (data || []) as unknown as PortfolioItem[];
  } catch (error) {
    portfolioLogger.error('Portfolio page select exception', error);
    return [];
  }
}

export default async function PortfolioPage() {
  const items = await getPortfolioItems();
  return (
    <>
      <CollectionPageJsonLd
        name="포트폴리오"
        description="유진레이저목형의 다양한 박스 지기구조 작업 사례"
        url={`${BASE_URL}/portfolio`}
        itemCount={items.length}
      />
      <PortfolioPageClient items={items} />
    </>
  );
}
