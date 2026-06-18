import { serverGetPortfolio } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { notFound } from 'next/navigation';
import { PortfolioDetailClient } from './_components/PortfolioDetailClient';
import { ProductJsonLd } from '@/components/JsonLd';
import type { Metadata } from 'next';

// Build-time SSG/ISR 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음).
// 기존 revalidate=3600 (ISR) 는 force-dynamic 와 mutually exclusive — preview 통과 우선, ISR 복원은 별도 task.
export const dynamic = 'force-dynamic';

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

interface PageProps {
  params: Promise<{ id: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const data = await serverGetPortfolio(id);

    if (!data) {
      return {
        title: '포트폴리오 | 유진레이저목형',
      };
    }

    const images = data.images as string[] | Array<{ original: string }>;
    const firstImage =
      Array.isArray(images) && images.length > 0
        ? typeof images[0] === 'string'
          ? images[0]
          : images[0].original
        : undefined;

    const desc = data.description as string;
    const description = `${data.field} - ${desc?.slice(0, 150) || ''}`;

    return {
      title: `${data.title} | 포트폴리오`,
      description,
      openGraph: {
        title: `${data.title} | 포트폴리오`,
        description,
        type: 'article',
        url: `${BASE_URL}/portfolio/${id}`,
        ...(firstImage && {
          images: [{ url: firstImage, width: 1200, height: 630, alt: data.title as string }],
        }),
      },
      alternates: {
        canonical: `${BASE_URL}/portfolio/${id}`,
      },
    };
  } catch {
    return {
      title: '포트폴리오 | 유진레이저목형',
    };
  }
}

export default async function PortfolioDetailPage({ params }: PageProps) {
  const { id } = await params;
  const portfolioLogger = logger.createLogger('PORTFOLIO_DETAIL');

  let item: PortfolioItem | null = null;

  try {
    const data = await serverGetPortfolio(id);

    if (data) {
      item = data as unknown as PortfolioItem;
    }
  } catch (error) {
    portfolioLogger.error('Portfolio detail select exception', error);
  }

  if (!item) {
    notFound();
  }

  return (
    <>
      <ProductJsonLd
        name={item.title}
        description={item.description}
        image={
          Array.isArray(item.images) && item.images.length > 0
            ? typeof item.images[0] === 'string'
              ? item.images[0]
              : item.images[0].original
            : undefined
        }
        category={item.field}
      />
      <PortfolioDetailClient item={item} />
    </>
  );
}
