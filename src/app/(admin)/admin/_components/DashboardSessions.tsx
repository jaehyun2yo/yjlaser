import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { getActiveSessionsCount, getActiveSessionsList } from '@/lib/api/activeSessions';
import { logger } from '@/lib/utils/logger';
import { FaUsers, FaCircle } from 'react-icons/fa';

interface ActiveSession {
  id: number;
  user_type: 'admin' | 'company';
  user_id: number;
  username: string;
  company_name: string | null;
  last_activity: string;
}

interface ActiveSessionsCount {
  total_count: number;
  admin_count: number;
  company_count: number;
}

// 상대 활동 시간 포맷팅
function formatLastActivity(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 5) return `${diffMinutes}분 전`;
  return '5분 이상 전';
}

/**
 * 대시보드 접속자 목록 - 비동기 서버 컴포넌트
 * Suspense 경계 내에서 사용하여 점진적 로딩 지원
 */
export async function DashboardSessions() {
  const adminLogger = logger.createLogger('DASHBOARD_SESSIONS');

  let activeSessions: ActiveSession[] = [];
  let activeSessionsCount: ActiveSessionsCount = {
    total_count: 0,
    admin_count: 0,
    company_count: 0,
  };

  try {
    // 병렬로 세션 데이터 가져오기
    const [sessionsCount, sessionsList] = await Promise.all([
      getActiveSessionsCount(),
      getActiveSessionsList(),
    ]);
    activeSessionsCount = sessionsCount;
    activeSessions = sessionsList as ActiveSession[];
  } catch (error) {
    adminLogger.error('Error in DashboardSessions', error);
  }

  return (
    <div
      className={`${BG_COLOR.card} rounded-xl shadow-sm border ${BORDER_COLOR.default} overflow-hidden`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.light} ${BG_COLOR.info}`}
      >
        <div className="flex items-center gap-2">
          <FaUsers className={TEXT_COLOR.info} />
          <span className={`font-medium ${TEXT_COLOR.primary}`}>현재 접속자</span>
          <span className={`text-sm ${TEXT_COLOR.info} font-bold`}>
            {activeSessionsCount.total_count}명
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={TEXT_COLOR.secondary}>
            관리자 {activeSessionsCount.admin_count} · 업체 {activeSessionsCount.company_count}
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-60 overflow-y-auto">
        {activeSessions.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            <FaUsers className="mx-auto text-2xl mb-2 opacity-30" />
            <p className="text-sm">현재 접속자가 없습니다</p>
          </div>
        ) : (
          activeSessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-3 px-4 py-3 ${BG_COLOR.hoverMuted}/30`}
            >
              <FaCircle
                className={`text-[8px] flex-shrink-0 ${
                  session.user_type === 'admin' ? 'text-orange-500' : 'text-green-500'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${TEXT_COLOR.secondary} truncate`}>
                  {session.user_type === 'admin' ? (
                    <span className={`font-medium ${TEXT_COLOR.brand}`}>관리자</span>
                  ) : (
                    session.company_name || `업체 #${session.user_id}`
                  )}
                </p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatLastActivity(session.last_activity)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
