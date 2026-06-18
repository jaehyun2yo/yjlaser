import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { FeedbackForm } from './FeedbackForm';
import { COMPANY_THEME } from '@/lib/styles';

export default async function CompanyFeedbackPage() {
  const user = await getSessionUser();
  if (!user?.userId || user?.userType !== 'company') {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div className={COMPANY_THEME.greeting.container}>
        <h1 className={COMPANY_THEME.greeting.title}>불편사항 접수</h1>
        <p className={COMPANY_THEME.greeting.subtitle}>
          불편하신 사항을 접수해주시면 빠르게 개선하겠습니다.
        </p>
      </div>

      <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
        <FeedbackForm />
      </div>
    </div>
  );
}
