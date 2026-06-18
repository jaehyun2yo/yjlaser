import { TEXT_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { serverGetCompanies } from '@/lib/api/nestjs-server-client';
import { CompaniesList } from './CompaniesList';

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

export default async function CompaniesPage() {
  const companiesLogger = logger.createLogger('COMPANIES');

  let companies: Company[] = [];
  const stats = {
    total: 0,
    active: 0,
    inactive: 0,
    pending: 0,
    deleted: 0,
  };

  try {
    // NestJS API 경유로 업체 목록 조회
    const result = await serverGetCompanies({
      limit: 1000,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });

    companies = (result.companies || []) as Company[];
    stats.total = companies.length;
    stats.active = companies.filter((c) => c.status === 'active').length;
    stats.inactive = companies.filter((c) => c.status === 'inactive').length;
    stats.pending = companies.filter((c) => c.status === 'pending').length;
    stats.deleted = companies.filter((c) => c.status === 'deleted').length;
  } catch (error) {
    companiesLogger.error('Error fetching companies', error);
  }

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className={`text-3xl font-bold mb-2 ${TEXT_COLOR.primary}`}>업체관리</h1>
        <p className={TEXT_COLOR.secondary}>등록된 업체들을 관리하고 모니터링하세요</p>
      </div>

      <CompaniesList companies={companies} stats={stats} />
    </div>
  );
}
