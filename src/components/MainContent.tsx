'use client';

import { usePathname } from 'next/navigation';
import { BG_COLOR } from '@/lib/styles';

export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortfolioPage = pathname === '/portfolio';
  const isHomePage = pathname === '/';
  const isAboutPage = pathname === '/about';
  const isNoticePage = pathname?.startsWith('/notice');
  const isWebhardPage = pathname?.startsWith('/webhard');
  const isAdminPage = pathname?.startsWith('/admin');
  const isCompanyPage = pathname?.startsWith('/company/');
  const isLoginPage = pathname?.startsWith('/login');
  const isRegisterPage = pathname?.startsWith('/register');

  // 로그인/회원가입 페이지는 전체 화면 원페이지 형식 (배경색 없이)
  const isFullScreenPage = isLoginPage || isRegisterPage;

  // 포트폴리오, 홈, 소개, 공지사항, 웹하드, 관리자, 업체 페이지는 자체 레이아웃을 사용하므로 padding 없이 렌더링
  const needsHeaderOffset =
    !isPortfolioPage &&
    !isHomePage &&
    !isAboutPage &&
    !isNoticePage &&
    !isWebhardPage &&
    !isAdminPage &&
    !isCompanyPage &&
    !isFullScreenPage;

  // 로그인/회원가입 페이지는 전체 화면으로 표시 (배경색 없이, 네비게이션/푸터 없음)
  if (isFullScreenPage) {
    return (
      <main
        className="fixed inset-0 z-[100] overflow-y-auto overflow-x-hidden"
        suppressHydrationWarning
      >
        <div className="min-h-full">{children}</div>
      </main>
    );
  }

  // 웹하드 페이지는 자체 layout.tsx에서 레이아웃을 처리하므로 children만 렌더링
  const isWorkerPage = pathname?.startsWith('/worker');

  if (isWebhardPage || isWorkerPage) {
    return <>{children}</>;
  }

  return (
    <main
      className={`flex-1 ${BG_COLOR.darker} transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        needsHeaderOffset
          ? 'pt-[56px] md:pt-[64px] lg:pt-[72px] min-h-[calc(100vh-56px)] md:min-h-[calc(100vh-64px)] lg:min-h-[calc(100vh-72px)]'
          : ''
      }`}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
