import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { BG_COLOR } from '@/lib/styles';

export default async function WebhardLayout({ children }: { children: React.ReactNode }) {
  // 세션 검증 + 사용자 정보 한 번에 가져오기 (중복 호출 제거)
  const user = await getSessionUser();

  if (!user) {
    redirect('/login?next=%2Fwebhard');
  }

  // 관리자 또는 업체 사용자만 접근 가능
  if (user.userType !== 'admin' && user.userType !== 'company') {
    redirect('/');
  }

  return (
    <ToastProvider placement="top-center" maxVisibleToasts={10}>
      <div
        className={`webhard-page flex h-screen overflow-hidden ${BG_COLOR.page} transition-colors duration-300`}
      >
        {children}
      </div>
    </ToastProvider>
  );
}
