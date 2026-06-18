import { TEXT_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { CompaniesList } from '@/app/(admin)/admin/companies/CompaniesList';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { serverGetCompanies } from '@/lib/api/nestjs-server-client';
import { FolderMappingSection } from './_components/FolderMappingSection';

interface Company {
  id: number;
  company_name: string;
  business_registration_number: string;
  representative_name: string;
  username: string;
  status: 'active' | 'inactive' | 'pending' | 'deleted';
  webhard_access: boolean;
  laser_only: boolean;
  created_at: string;
}

export default async function IntegrationCompaniesPage() {
  const companiesLogger = logger.createLogger('INTEGRATION_COMPANIES');

  let companies: Company[] = [];
  const stats = {
    total: 0,
    active: 0,
    inactive: 0,
    pending: 0,
    deleted: 0,
  };

  try {
    const result = await serverGetCompanies({
      limit: 10000,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    companies = (result.companies || []) as unknown as Company[];
    stats.total = companies.length;
    stats.active = companies.filter((c) => c.status === 'active').length;
    stats.inactive = companies.filter((c) => c.status === 'inactive').length;
    stats.pending = companies.filter((c) => c.status === 'pending').length;
    stats.deleted = companies.filter((c) => c.status === 'deleted').length;
  } catch (error) {
    companiesLogger.error('Error fetching companies', error);
  }

  return (
    <div className="space-y-6">
      <IntegrationNav />

      <div>
        <h1 className={`text-2xl font-bold mb-2 ${TEXT_COLOR.primary}`}>업체관리</h1>
        <p className={TEXT_COLOR.secondary}>등록된 업체들을 관리하고 모니터링하세요</p>
      </div>

      <CompaniesList companies={companies} stats={stats} />

      <FolderMappingSection />
    </div>
  );
}
