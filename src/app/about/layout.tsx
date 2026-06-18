import type { Metadata } from 'next';
import { AboutPageJsonLd } from '@/components/JsonLd';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

export const metadata: Metadata = {
  title: '회사 소개 | 유진레이저목형',
  description:
    '2004년 설립 이래 20년간 축적된 기술력으로 패키징 산업의 든든한 기반이 되어온 유진레이저목형입니다. 연혁, 공정, 회사 소개.',
  keywords: ['유진레이저목형', '회사소개', '레이저목형 업체', '패키징 전문'],
  alternates: {
    canonical: `${BASE_URL}/about`,
  },
  openGraph: {
    title: '회사 소개 | 유진레이저목형',
    description:
      '2004년 설립 이래 20년간 축적된 기술력으로 패키징 산업의 든든한 기반이 되어온 유진레이저목형입니다.',
    url: `${BASE_URL}/about`,
    siteName: '유진레이저목형',
    type: 'website',
    locale: 'ko_KR',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AboutPageJsonLd
        name="회사 소개"
        description="2004년 설립 이래 20년간 축적된 기술력으로 패키징 산업의 든든한 기반이 되어온 유진레이저목형입니다."
        url={`${BASE_URL}/about`}
      />
      {children}
    </>
  );
}
