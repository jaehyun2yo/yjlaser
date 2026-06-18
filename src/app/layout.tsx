import type { Metadata } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import { cache } from 'react';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import { verifyAndGetUser } from '@/lib/auth/session';
import { serverGetCompany } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SiteShell } from '@/components/SiteShell';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

const layoutLogger = logger.createLogger('LAYOUT');

// React cache()를 사용하여 요청 단위 중복 호출 방지
const getCachedUser = cache(async () => {
  return verifyAndGetUser();
});

const getCachedCompanyName = cache(async (companyId: string | number) => {
  try {
    const company = await serverGetCompany(Number(companyId));
    return company?.company_name || null;
  } catch (error) {
    layoutLogger.error('Error fetching company name', error);
    return null;
  }
});

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const shouldEnableReactGrab =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_REACT_GRAB === 'true';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net'),
  title: {
    default: '유진레이저목형 | YJ Laser | 박스 지기구조 전문업체',
    template: '%s | 유진레이저목형',
  },
  description:
    '박스 지기구조 전문업체 유진레이저목형입니다. 레이저 목형, 칼선, 박스 설계 등 전문 서비스를 제공합니다.',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net',
    siteName: '유진레이저목형',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: '유진레이저목형 - 박스 지기구조 전문업체',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '유진레이저목형 | YJ Laser',
    description: '박스 지기구조 전문업체',
    images: ['/og-image.jpg'],
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 세션 확인 - getCachedUser로 캐싱된 데이터 사용
  const { isValid: isAuthenticated, user } = await getCachedUser();

  // 업체 정보 가져오기 (업체 로그인인 경우에만)
  // getCachedCompanyName으로 캐싱된 쿼리 사용
  let companyName: string | null = null;
  if (isAuthenticated && user?.userType === 'company' && user?.userId) {
    companyName = await getCachedCompanyName(user.userId);
  }

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Font preloads for critical weights */}
        <link
          rel="preload"
          href="/fonts/NanumSquareR.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/NanumSquareB.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {shouldEnableReactGrab && (
          <Script
            src="https://unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        {shouldEnableReactGrab && (
          <Script
            src="https://unpkg.com/@react-grab/claude-code/dist/client.global.js"
            strategy="lazyOnload"
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased ${BG_COLOR.darker} ${TEXT_COLOR.primary} transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col min-h-screen`}
        suppressHydrationWarning
      >
        <Providers>
          <ErrorBoundary>
            <SiteShell
              isAuthenticated={isAuthenticated}
              userType={user?.userType || null}
              companyName={companyName}
            >
              {children}
            </SiteShell>
            <Toaster position="top-right" richColors />
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
