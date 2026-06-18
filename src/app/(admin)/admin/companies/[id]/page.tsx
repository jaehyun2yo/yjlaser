import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  FaBuilding,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaFileAlt,
  FaCheckCircle,
  FaTimesCircle,
  FaLock,
  FaBolt,
  FaHistory,
  FaTrash,
} from 'react-icons/fa';
import { ApproveButton } from './approve-button';
import { WebhardAccessToggle } from './webhard-access-toggle';
import { LaserOnlyToggle } from './laser-only-toggle';
import { CompanyDeleteActions } from './company-delete-actions';
import { logger } from '@/lib/utils/logger';
import { ACTIVITY_LOG_BADGE, BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { serverGetCompany } from '@/lib/api/nestjs-server-client';

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
  status: 'active' | 'inactive' | 'pending' | 'deleted';
  webhard_access: boolean;
  laser_only: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_previous_status?: string | null;
  deleted_previous_webhard_access?: boolean | null;
  restore_deadline_at?: string | null;
  days_until_permanent_delete?: number | null;
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companiesLogger = logger.createLogger('COMPANIES');

  let company: Company | null = null;

  try {
    const data = await serverGetCompany(Number(id));

    if (!data) {
      companiesLogger.error('Company not found', { id });
      redirect('/admin/companies');
    }

    company = data as unknown as Company;
  } catch (error) {
    companiesLogger.error('Error', error);
    redirect('/admin/companies');
  }

  if (!company) {
    redirect('/admin/companies');
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.login}`}
          >
            <FaCheckCircle className="text-xs" />
            활성
          </span>
        );
      case 'inactive':
        return (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.delete}`}
          >
            <FaTimesCircle className="text-xs" />
            비활성
          </span>
        );
      case 'pending':
        return (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.update}`}
          >
            대기중
          </span>
        );
      case 'deleted':
        return (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.delete}`}
          >
            <FaTrash className="text-xs" />
            삭제대기
          </span>
        );
      default:
        return (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.default}`}
          >
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/admin/companies"
            className="text-sm text-[#ED6C00] hover:text-[#d15f00] mb-2 inline-block"
          >
            ← 업체 목록으로 돌아가기
          </Link>
          <h1 className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>업체 상세정보</h1>{' '}
        </div>{' '}
        <div className="flex items-center gap-3 flex-wrap">
          {' '}
          {/* 상태 뱃지들 */} {getStatusBadge(company.status)}{' '}
          {/* 웹하드 접근 상태 뱃지 - 차단일 때만 표시 */}{' '}
          {company.webhard_access === false && (
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.permissionChange}`}
            >
              {' '}
              <FaLock className="text-xs" /> 웹하드 차단{' '}
            </span>
          )}{' '}
          {/* 레이저 전용 배지 - 설정일 때만 표시 */}{' '}
          {company.laser_only && (
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.permissionChange}`}
            >
              <FaBolt className="text-xs" /> 레이저 전용
            </span>
          )}{' '}
          {/* 액션 버튼들 */}{' '}
          {company.status !== 'deleted' && (
            <>
              <ApproveButton companyId={company.id} currentStatus={company.status} />{' '}
              <WebhardAccessToggle
                companyId={company.id}
                currentAccess={company.webhard_access ?? true}
              />{' '}
              <LaserOnlyToggle
                companyId={company.id}
                currentLaserOnly={company.laser_only ?? false}
              />{' '}
            </>
          )}
          <CompanyDeleteActions
            companyId={company.id}
            companyName={company.company_name}
            status={company.status}
            deletedAt={company.deleted_at}
            restoreDeadlineAt={company.restore_deadline_at}
          />{' '}
          <Button variant="ghost" size="sm" className="!py-2 !px-4" asChild>
            <Link
              href={`/admin/webhard/activity?companyId=${company.id}`}
              className="flex items-center gap-2"
            >
              <FaHistory />
              활동 로그
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 로그인 정보 */}
        <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
          <h2
            className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
          >
            로그인 정보
          </h2>
          <div className="space-y-3">
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>아이디</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.username}</p>
            </div>
            {company.status === 'deleted' && (
              <div className={`rounded-lg border ${BORDER_COLOR.default} p-3`}>
                <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>삭제 상태</p>
                <p className={`text-base ${TEXT_COLOR.primary}`}>
                  {company.deleted_at
                    ? new Date(company.deleted_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : '삭제일 미상'}
                  에 삭제 처리됨
                </p>
                {company.restore_deadline_at && (
                  <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
                    복구 가능 기한:{' '}
                    {new Date(company.restore_deadline_at).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 업체 정보 */}
        <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
          <h2
            className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2 flex items-center gap-2`}
          >
            <FaBuilding />
            업체 정보
          </h2>
          <div className="space-y-3">
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>업체명</p>
              <p className={`text-base ${TEXT_COLOR.primary} font-medium`}>
                {company.company_name}
              </p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>사업자등록번호</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>
                {company.business_registration_number}
              </p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>대표자명</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.representative_name}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>업태</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.business_type || '-'}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>업종</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>
                {company.business_category || '-'}
              </p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>사업자주소</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.business_address}</p>
            </div>
            {company.business_registration_file_url && (
              <div>
                <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>사업자등록증</p>
                <a
                  href={company.business_registration_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[#ED6C00] hover:text-[#d15f00] font-medium"
                >
                  <FaFileAlt />
                  {company.business_registration_file_name || '파일 보기'}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* 실무담당자 정보 */}
        <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
          <h2
            className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2 flex items-center gap-2`}
          >
            <FaUser />
            실무담당자
          </h2>
          <div className="space-y-3">
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>성함</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.manager_name}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>직함</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.manager_position}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1 flex items-center gap-2`}>
                <FaPhone />
                연락처
              </p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.manager_phone}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1 flex items-center gap-2`}>
                <FaEnvelope />
                이메일
              </p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.manager_email}</p>
            </div>
          </div>
        </div>

        {/* 회계담당자 정보 */}
        <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
          <h2
            className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2 flex items-center gap-2`}
          >
            <FaUser />
            회계담당자
          </h2>
          <div className="space-y-3">
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>성함</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.accountant_name || '-'}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1 flex items-center gap-2`}>
                <FaPhone />
                연락처
              </p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.accountant_phone || '-'}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1 flex items-center gap-2`}>
                <FaEnvelope />
                이메일 (세금계산서)
              </p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.accountant_email || '-'}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>팩스번호</p>
              <p className={`text-base ${TEXT_COLOR.primary}`}>{company.accountant_fax || '-'}</p>
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>견적서 제공 방법</p>{' '}
              <div className="flex flex-wrap gap-2 mt-1">
                {' '}
                {company.quote_method_email && (
                  <span
                    className={`px-2 py-1 ${BG_COLOR.infoLighter} ${TEXT_COLOR.infoDark} rounded text-xs`}
                  >
                    {' '}
                    이메일{' '}
                  </span>
                )}{' '}
                {company.quote_method_fax && (
                  <span
                    className={`px-2 py-1 ${BG_COLOR.infoLighter} ${TEXT_COLOR.infoDark} rounded text-xs`}
                  >
                    {' '}
                    팩스{' '}
                  </span>
                )}{' '}
                {company.quote_method_sms && (
                  <span
                    className={`px-2 py-1 ${BG_COLOR.infoLighter} ${TEXT_COLOR.infoDark} rounded text-xs`}
                  >
                    {' '}
                    휴대폰 문자{' '}
                  </span>
                )}{' '}
                {!company.quote_method_email &&
                  !company.quote_method_fax &&
                  !company.quote_method_sms && (
                    <span className={`${TEXT_COLOR.secondary} text-xs`}>-</span>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 등록 정보 */}
      <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
        <h2
          className={`text-xl font-semibold ${TEXT_COLOR.primary} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          등록 정보
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>등록일</p>
            <p className={`text-base ${TEXT_COLOR.primary}`}>
              {new Date(company.created_at).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <div>
            <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>최종 수정일</p>
            <p className={`text-base ${TEXT_COLOR.primary}`}>
              {new Date(company.updated_at).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
