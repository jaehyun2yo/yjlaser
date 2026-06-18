import type { Metadata } from 'next';
import ContactForm from './ContactForm';
import { verifyAndGetUser } from '@/lib/auth/session';
import type { PortfolioProductInfo } from '@/types/contact';
import { ContactPointJsonLd } from '@/components/JsonLd';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

export const metadata: Metadata = {
  title: '견적 문의 | 유진레이저목형',
  description:
    '레이저 목형, 박스 지기구조 견적 문의. 빠른 상담과 정확한 견적을 제공합니다. 전화, 이메일, 온라인 문의 가능.',
  keywords: ['레이저목형 견적', '박스목형 문의', '패키징 상담', '견적요청'],
  alternates: {
    canonical: `${BASE_URL}/contact`,
  },
  openGraph: {
    title: '견적 문의 | 유진레이저목형',
    description: '레이저 목형, 박스 지기구조 견적 문의. 빠른 상담과 정확한 견적을 제공합니다.',
    url: `${BASE_URL}/contact`,
    siteName: '유진레이저목형',
    type: 'website',
    locale: 'ko_KR',
  },
};

// ISR: 30분마다 재검증 (정적 부분 캐싱)
export const revalidate = 1800;

export default async function ContactPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    error?: string;
    portfolioId?: string;
    portfolioTitle?: string;
    portfolioField?: string;
    portfolioType?: string;
    portfolioFormat?: string;
    portfolioSize?: string;
    portfolioPaper?: string;
    portfolioPrinting?: string;
    portfolioFinishing?: string;
    portfolioImage?: string;
  }>;
}) {
  const params = (await searchParams) || {};
  const success = params.success === '1';
  const error = params.error;

  // 포트폴리오 제품 정보 파싱
  let portfolioProduct: PortfolioProductInfo | null = null;
  if (params.portfolioId && params.portfolioTitle) {
    portfolioProduct = {
      id: params.portfolioId, // UUID 문자열 그대로 사용
      title: decodeURIComponent(params.portfolioTitle),
      field: params.portfolioField ? decodeURIComponent(params.portfolioField) : undefined,
      type: params.portfolioType ? decodeURIComponent(params.portfolioType) : undefined,
      format: params.portfolioFormat ? decodeURIComponent(params.portfolioFormat) : undefined,
      size: params.portfolioSize ? decodeURIComponent(params.portfolioSize) : undefined,
      paper: params.portfolioPaper ? decodeURIComponent(params.portfolioPaper) : undefined,
      printing: params.portfolioPrinting ? decodeURIComponent(params.portfolioPrinting) : undefined,
      finishing: params.portfolioFinishing
        ? decodeURIComponent(params.portfolioFinishing)
        : undefined,
      imageUrl: params.portfolioImage ? decodeURIComponent(params.portfolioImage) : undefined,
    };
  }

  // 업체 로그인 상태 확인 및 정보 가져오기
  let initialValues: {
    companyName?: string;
    name?: string;
    position?: string;
    phone?: string;
    email?: string;
  } | null = null;

  // verifyAndGetUser로 통합하여 쿠키 파싱 1회로 최적화
  const { isValid, user } = await verifyAndGetUser();
  if (isValid && user?.userType === 'company' && user?.userId) {
    try {
      const { serverGetCompany } = await import('@/lib/api/nestjs-server-client');
      const companyData = await serverGetCompany(Number(user.userId));

      if (companyData) {
        initialValues = {
          companyName: companyData.company_name || '',
          name: companyData.manager_name || '',
          position: companyData.manager_position || '',
          phone: companyData.manager_phone || '',
          email: companyData.manager_email || '',
        };
      }
    } catch (_error) {
      // Company data fetch failed, continue with null initialValues
    }
  }

  return (
    <>
      <ContactPointJsonLd
        telephone="010-3339-6689"
        email="ujin6689@naver.com"
        contactType="customer service"
      />
      <ContactForm
        success={success}
        error={error}
        initialValues={initialValues}
        portfolioProduct={portfolioProduct}
      />
    </>
  );
}
