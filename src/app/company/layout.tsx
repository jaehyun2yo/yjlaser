import { verifySession, getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/utils/logger';
import { CompanyLayoutClient } from './_components';
import { CompanyPrefetch } from './CompanyPrefetch';
import { serverGetCompany, serverGetContactsByCompany } from '@/lib/api/nestjs-server-client';

interface Company {
  id: number;
  company_name: string;
}

interface Contact {
  id: number;
  inquiry_title?: string;
  name?: string;
  status?: string;
  created_at?: string;
  process_stage?: string;
}

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  // 세션 검증
  const isAuthenticated = await verifySession();

  if (!isAuthenticated) {
    redirect('/login?next=%2Fcompany%2Fdashboard');
  }

  const user = await getSessionUser();
  if (user?.userType !== 'company' || !user?.userId) {
    redirect('/login?next=%2Fcompany%2Fdashboard');
  }

  // 업체 정보 가져오기 (NestJS API 경유)
  const layoutLogger = logger.createLogger('COMPANY_LAYOUT');
  let company: Company | null = null;
  let contacts: Contact[] = [];

  try {
    const companyData = await serverGetCompany(Number(user.userId));

    if (!companyData) {
      layoutLogger.error('Error fetching company');
      redirect('/login?next=%2Fcompany%2Fdashboard');
    }

    company = { id: companyData.id, company_name: companyData.company_name };

    // 검색용 contacts 데이터 조회 (NestJS API)
    const contactsData = await serverGetContactsByCompany(company.company_name, { limit: 100 });
    contacts = contactsData as unknown as Contact[];
  } catch (error) {
    layoutLogger.error('Error', error);
    redirect('/login?next=%2Fcompany%2Fdashboard');
  }

  return (
    <>
      <CompanyLayoutClient companyName={company.company_name} contacts={contacts}>
        {children}
      </CompanyLayoutClient>

      {/* 웹하드 데이터 프리페치 */}
      <CompanyPrefetch />
    </>
  );
}
