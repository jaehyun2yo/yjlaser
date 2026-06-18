import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { COMPANY_THEME, TEXT_COLOR } from '@/lib/styles';
import { FaTools } from 'react-icons/fa';

/**
 * 거래처 주문 목록 페이지 (Server Component)
 * 현재 준비중 — 추후 개발 완료 시 OrdersClient 복원
 */
export default async function OrdersPage() {
  const user = await getSessionUser();

  if (!user?.userId || user.userType !== 'company') {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className={COMPANY_THEME.greeting.container}>
        <h1 className={COMPANY_THEME.greeting.title}>주문 현황</h1>
        <p className={`text-sm ${TEXT_COLOR.tertiary}`}>
          진행 중인 주문의 상태를 실시간으로 확인하실 수 있습니다.
        </p>
      </div>

      {/* 준비중 안내 */}
      <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
        <div className="flex flex-col items-center justify-center py-16">
          <FaTools className={`text-4xl ${TEXT_COLOR.tertiary} mb-4`} />
          <p className={`text-lg font-medium ${TEXT_COLOR.strong}`}>아직 준비중입니다</p>
          <p className={`text-sm ${TEXT_COLOR.tertiary} mt-2`}>
            서비스 준비가 완료되면 안내드리겠습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
