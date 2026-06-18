import { getSessionUser } from '@/lib/auth/session';
import { serverGetCompany } from '@/lib/api/nestjs-server-client';
import { redirect } from 'next/navigation';
import { CompanyProfileForm } from './CompanyProfileForm';
import { COMPANY_THEME } from '@/lib/styles';

interface Company {
  id: number;
  username: string;
  company_name: string;
  business_registration_number: string;
  representative_name: string;
  business_type: string | null;
  business_category: string | null;
  business_address: string;
  business_registration_file_url: string | null;
  business_registration_file_name: string | null;
  manager_name: string;
  manager_position: string;
  manager_phone: string;
  manager_email: string;
  accountant_name: string | null;
  accountant_phone: string | null;
  accountant_email: string | null;
  accountant_fax: string | null;
  quote_method_email: boolean;
  quote_method_fax: boolean;
  quote_method_sms: boolean;
  created_at: string;
  updated_at: string;
}

export default async function CompanyProfilePage() {
  const user = await getSessionUser();
  if (!user?.userId) {
    redirect('/login');
  }

  // NestJS API 경유로 업체 정보 조회
  const company = await serverGetCompany(Number(user.userId));

  if (!company) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div className={COMPANY_THEME.greeting.container}>
        <h1 className={COMPANY_THEME.greeting.title}>정보 수정</h1>
        <p className={COMPANY_THEME.greeting.subtitle}>업체 정보를 수정할 수 있습니다.</p>
      </div>

      <CompanyProfileForm company={company as Company} />
    </div>
  );
}
