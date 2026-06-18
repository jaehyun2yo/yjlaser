'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import HomeHeader from '@/components/HomeHeader';
import Footer from '@/components/Footer';
import { MainContent } from '@/components/MainContent';
import SmoothScroll from '@/components/SmoothScroll';
import FloatingButtons from '@/components/FloatingButtons';
import { OrganizationJsonLd } from '@/components/JsonLd';

interface SiteShellProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  userType: 'admin' | 'company' | null;
  companyName: string | null;
}

export function SiteShell({ children, isAuthenticated, userType, companyName }: SiteShellProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  // /worker 경로는 공통 레이아웃 없이 children만 렌더링
  if (pathname?.startsWith('/worker') || pathname === '/test') {
    return <>{children}</>;
  }

  const organizationJsonLd = (
    <OrganizationJsonLd
      name="유진레이저목형"
      url={process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net'}
      logo={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net'}/mainLogo.svg`}
      description="박스 지기구조 전문업체 유진레이저목형입니다. 레이저 목형, 칼선, 박스 설계 등 전문 서비스를 제공합니다."
      address={{
        streetAddress: '퇴계로39길 20, 2층',
        addressLocality: '중구',
        addressRegion: '서울특별시',
        postalCode: '04627',
        addressCountry: 'KR',
      }}
      telephone="+82-2-2264-8070"
    />
  );

  if (isHomePage) {
    return (
      <>
        <SmoothScroll>
          <HomeHeader
            isAuthenticated={isAuthenticated}
            userType={userType}
            companyName={companyName}
          />
          {children}
        </SmoothScroll>
        {organizationJsonLd}
      </>
    );
  }

  return (
    <>
      <SmoothScroll>
        <Header isAuthenticated={isAuthenticated} userType={userType} companyName={companyName} />
        <MainContent>{children}</MainContent>
        <Footer />
      </SmoothScroll>
      <FloatingButtons isAuthenticated={isAuthenticated} />
      {organizationJsonLd}
    </>
  );
}
