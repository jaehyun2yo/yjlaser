import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { nestjsFetch, serverGetCompany } from '@/lib/api/nestjs-server-client';
import { LogsTable } from './LogsTable';
import { logger } from '@/lib/utils/logger';

const logsLogger = logger.createLogger('WEBHARD_LOGS_PAGE');

interface ActivityLog {
  id: string;
  actor_type: 'admin' | 'company';
  actor_id: string;
  actor_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface PageProps {
  searchParams: Promise<{
    page?: string;
    action?: string;
    actor?: string;
    companyId?: string;
  }>;
}

export default async function WebhardLogsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const actionFilter = params.action;
  const actorFilter = params.actor;
  const companyIdFilter = params.companyId;
  const limit = 20;

  // 업체 정보 조회 (companyId 필터가 있는 경우)
  let companyName: string | null = null;
  if (companyIdFilter) {
    const companyData = await serverGetCompany(Number(companyIdFilter));
    companyName = companyData?.company_name || null;
  }

  // NestJS API를 통해 활동 로그 조회
  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (actionFilter) queryParams.set('action', actionFilter);
  if (actorFilter) queryParams.set('actor', actorFilter);
  if (companyIdFilter) {
    queryParams.set('actorType', 'company');
    queryParams.set('actorId', companyIdFilter);
  }

  const response = await nestjsFetch<{
    logs: ActivityLog[];
    total: number;
    totalPages: number;
    page: number;
    limit: number;
  }>(`/activity-logs?${queryParams.toString()}`, { useApiKey: true });

  if (!response.ok) {
    logsLogger.error('Error fetching logs', { status: response.status });
    return <div className="p-4 text-red-500">로그를 불러오는 중 오류가 발생했습니다.</div>;
  }

  const { logs: fetchedLogs, total } = response.data;
  const logs = fetchedLogs || [];
  const totalCount = total || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>
            활동 로그
            {companyName && (
              <span className={`text-lg font-normal ${TEXT_COLOR.secondary} ml-2`}>
                - {companyName}
              </span>
            )}
          </h1>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            총 {totalCount.toLocaleString()} 건
            {companyIdFilter && (
              <a href="/admin/webhard/activity" className="ml-2 text-[#ED6C00] hover:text-[#d15f00]">
                (필터 해제)
              </a>
            )}
          </p>
        </div>

        <div className="flex gap-2">
          <form className="flex gap-2">
            {/* companyId 필터 유지 */}
            {companyIdFilter && <input type="hidden" name="companyId" value={companyIdFilter} />}
            <select
              name="action"
              defaultValue={actionFilter}
              className={`rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm`}
            >
              <option value="">모든 활동</option>
              <option value="LOGIN">로그인</option>
              <option value="LOGOUT">로그아웃</option>
              <option value="UPLOAD">업로드</option>
              <option value="DOWNLOAD">다운로드</option>
              <option value="DELETE">삭제</option>
              <option value="RESTORE">복구</option>
              <option value="CREATE_FOLDER">폴더 생성</option>
            </select>
            <input
              type="text"
              name="actor"
              placeholder="사용자 검색"
              defaultValue={actorFilter}
              className={`rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm`}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#ED6C00] text-white rounded-md text-sm hover:bg-[#d15f00] transition-colors"
            >
              검색
            </button>
          </form>
        </div>
      </div>

      <div
        className={`${BG_COLOR.card} rounded-lg shadow overflow-hidden border ${BORDER_COLOR.default}`}
      >
        <div className="overflow-x-auto">
          <LogsTable logs={(logs as ActivityLog[]) || []} />
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div
            className={`px-6 py-4 border-t ${BORDER_COLOR.default} flex items-center justify-center gap-2`}
          >
            <a
              href={`?page=${page - 1}&action=${actionFilter || ''}&actor=${actorFilter || ''}${companyIdFilter ? `&companyId=${companyIdFilter}` : ''}`}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                page === 1
                  ? 'text-gray-300 cursor-not-allowed'
                  : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
              }`}
              aria-disabled={page === 1}
            >
              이전
            </a>
            <span className={`text-sm ${TEXT_COLOR.secondary}`}>
              {page} / {totalPages}
            </span>
            <a
              href={`?page=${page + 1}&action=${actionFilter || ''}&actor=${actorFilter || ''}${companyIdFilter ? `&companyId=${companyIdFilter}` : ''}`}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                page === totalPages
                  ? 'text-gray-300 cursor-not-allowed'
                  : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
              }`}
              aria-disabled={page === totalPages}
            >
              다음
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
