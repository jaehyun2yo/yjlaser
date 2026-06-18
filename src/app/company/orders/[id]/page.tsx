import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { COMPANY_THEME, TEXT_COLOR } from '@/lib/styles';
import { OrderDetailClient } from './OrderDetailClient';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * 주문 상세 페이지 (Server Component)
 * 세션 검증 후 클라이언트 컴포넌트에 orderId와 companyId 전달
 * 내부 정보(가격, 네스팅 효율 등)는 절대 표시하지 않음
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await getSessionUser();

  if (!user?.userId || user.userType !== 'company') {
    redirect('/login');
  }

  const companyId = Number(user.userId);

  if (isNaN(companyId) || companyId <= 0) {
    redirect('/login');
  }

  const { id } = await params;

  if (!id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className={COMPANY_THEME.greeting.container}>
        <h1 className={COMPANY_THEME.greeting.title}>주문 상세</h1>
        <p className={`text-sm ${TEXT_COLOR.tertiary}`}>주문 진행 상황을 확인하실 수 있습니다.</p>
      </div>

      {/* 주문 상세 클라이언트 컴포넌트 */}
      <OrderDetailClient orderId={id} companyId={companyId} />
    </div>
  );
}
