import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { BillingList } from './BillingList';
import { COMPANY_THEME, TEXT_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { serverGetCompany, serverGetContactsByCompany } from '@/lib/api/nestjs-server-client';

const billingLogger = logger.createLogger('BILLING_PAGE');

export default async function BillingPage() {
  const user = await getSessionUser();
  if (!user?.userId) {
    redirect('/login');
  }

  // NestJS API 경유로 업체 정보 조회
  const company = await serverGetCompany(Number(user.userId));

  if (!company) {
    redirect('/login');
  }

  // 해당 업체의 완료된 문의사항 가져오기 (NestJS API)
  let contacts: Record<string, unknown>[] = [];
  try {
    contacts = await serverGetContactsByCompany(company.company_name, { status: 'delivered' });
  } catch (error) {
    billingLogger.error('Error fetching contacts', error);
  }

  return (
    <div className="space-y-6">
      <div className={COMPANY_THEME.greeting.container}>
        <h1 className={COMPANY_THEME.greeting.title}>청구서 / 전자세금계산서</h1>
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>
          발행된 청구서를 확인하고, 완료된 주문 내역을 조회할 수 있습니다.
        </p>
      </div>

      <BillingList
        contacts={contacts as unknown as React.ComponentProps<typeof BillingList>['contacts']}
      />
    </div>
  );
}
