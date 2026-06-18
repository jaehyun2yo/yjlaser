// src/app/(admin)/layout.tsx

import { BG_COLOR } from '@/lib/styles';
import { verifyAndGetUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AdminToastProvider } from './AdminToastProvider';
import { AdminNav } from './components/AdminNav';
import { AdminPrefetch } from './AdminPrefetch';

// Build-time SSG 시 NestJS API 호출 회피 — 모든 admin 서브페이지 일괄 적용 (Vercel preview 환경 대응)
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 세션 검증 + 사용자 정보를 1회 호출로 통합
  const { isValid, user } = await verifyAndGetUser();

  if (!isValid) {
    redirect('/login?next=%2Fadmin');
  }

  // 관리자만 접근 가능
  if (user?.userType === 'company') {
    redirect('/company/dashboard');
  }

  return (
    <div className={`admin-page min-h-screen ${BG_COLOR.page} transition-colors duration-300`}>
      {/* 독립적인 네비게이션 바 */}
      <AdminNav />

      {/* 메인 콘텐츠 */}
      <main className={`min-h-screen ${BG_COLOR.page} transition-colors duration-300`}>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
      </main>
      <AdminToastProvider />
      <AdminPrefetch />
    </div>
  );
}
