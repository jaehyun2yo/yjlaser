'use client';

import { ACTIVITY_LOG_BADGE, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getActivityLogs, ActivityLog } from '@/app/actions/activity-logs';
import { FaSearch, FaChevronDown, FaTimes } from 'react-icons/fa';
import { socketManager } from '@/lib/socket/socket-manager';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

const _log = logger.createLogger('ActivityLogsClient');

// 상세 내역 모달 컴포넌트
function LogDetailModal({ log, onClose }: { log: ActivityLog; onClose: () => void }) {
  // ESC 키로 닫기
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // 활동 유형별 한글 라벨
  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      LOGIN: '로그인',
      LOGOUT: '로그아웃',
      UPLOAD: '파일 업로드',
      DOWNLOAD: '파일 다운로드',
      DELETE: '삭제',
      RESTORE: '복구',
      CREATE_FOLDER: '폴더 생성',
      REGISTER_COMPANY: '업체 등록',
      PERMISSION_CHANGE: '권한 변경',
    };
    return labels[action] || action;
  };

  // details 객체의 각 필드를 보기 좋게 표시
  const renderDetailField = (key: string, value: unknown) => {
    const fieldLabels: Record<string, string> = {
      fileName: '파일명',
      fileSize: '파일 크기',
      folderId: '폴더 ID',
      folderName: '폴더명',
      filePath: '파일 경로',
      fileType: '파일 유형',
      companyId: '업체 ID',
      companyName: '업체명',
      targetCompanyId: '대상 업체 ID',
      previousAccess: '이전 상태',
      newAccess: '변경 상태',
      reason: '사유',
      username: '아이디',
      email: '이메일',
    };

    const label = fieldLabels[key] || key;

    // 파일 크기 포맷팅
    if (key === 'fileSize' && typeof value === 'number') {
      const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };
      return { label, value: formatFileSize(value) };
    }

    // 불린 값 처리
    if (typeof value === 'boolean') {
      return { label, value: value ? '허용' : '차단' };
    }

    return { label, value: String(value) };
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`${BG_COLOR.card} rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className={`flex items-center justify-between p-4 border-b ${BORDER_COLOR.default}`}>
          <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>활동 로그 상세</h2>
          <button
            onClick={onClose}
            className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
          >
            <FaTimes className={TEXT_COLOR.secondary} />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>일시</p>
              <p className={`text-sm ${TEXT_COLOR.primary}`}>
                {format(new Date(log.created_at), 'yyyy년 MM월 dd일 HH:mm:ss', { locale: ko })}
              </p>
            </div>
            <div className="space-y-1">
              <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>활동 유형</p>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  log.action === 'LOGIN'
                    ? ACTIVITY_LOG_BADGE.login
                    : log.action === 'LOGOUT'
                      ? ACTIVITY_LOG_BADGE.logout
                      : log.action === 'UPLOAD'
                        ? ACTIVITY_LOG_BADGE.upload
                        : log.action === 'DOWNLOAD'
                          ? ACTIVITY_LOG_BADGE.download
                          : log.action === 'DELETE'
                            ? ACTIVITY_LOG_BADGE.delete
                            : log.action === 'PERMISSION_CHANGE'
                              ? ACTIVITY_LOG_BADGE.permissionChange
                              : ACTIVITY_LOG_BADGE.default
                }`}
              >
                {getActionLabel(log.action)}
              </span>
            </div>
          </div>

          {/* 사용자 정보 */}
          <div className={`${BG_COLOR.gray}/50 rounded-lg p-4 space-y-3`}>
            <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>사용자 정보</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>이름</p>
                <p className={`text-sm ${TEXT_COLOR.primary}`}>{log.actor_name || '알 수 없음'}</p>
              </div>
              <div className="space-y-1">
                <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>유형</p>
                <p className={`text-sm ${TEXT_COLOR.primary}`}>
                  {log.actor_type === 'admin' ? '관리자' : '업체'}
                </p>
              </div>
              <div className="space-y-1">
                <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>IP 주소</p>
                <p className={`text-sm ${TEXT_COLOR.primary} font-mono`}>{log.ip_address || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>접속 환경</p>
                <p
                  className={`text-sm ${TEXT_COLOR.primary} truncate`}
                  title={log.user_agent || ''}
                >
                  {log.user_agent
                    ? log.user_agent.includes('Mozilla')
                      ? 'Web Browser'
                      : log.user_agent
                    : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* 상세 정보 (details 객체) */}
          {log.details && Object.keys(log.details).length > 0 && (
            <div className={`${BG_COLOR.gray}/50 rounded-lg p-4 space-y-3`}>
              <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>상세 정보</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(log.details).map(([key, value]) => {
                  const { label, value: displayValue } = renderDetailField(key, value);
                  return (
                    <div key={key} className="space-y-1">
                      <p className={`text-xs ${TEXT_COLOR.secondary} font-medium`}>{label}</p>
                      <p className={`text-sm ${TEXT_COLOR.primary} break-all`}>{displayValue}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw JSON (개발자용) */}
          {log.details && (
            <details className="group">
              <summary
                className={`cursor-pointer text-xs ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary} flex items-center gap-1`}
              >
                <FaChevronDown className="group-open:rotate-180 transition-transform text-[10px]" />
                원본 데이터 보기
              </summary>
              <pre
                className={`mt-2 text-xs overflow-x-auto whitespace-pre-wrap font-mono ${BG_COLOR.codeBlock} p-3 rounded-lg border ${BORDER_COLOR.default} ${TEXT_COLOR.secondary}`}
              >
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {/* 푸터 */}
        <div className={`p-4 border-t ${BORDER_COLOR.default} flex justify-end`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 ${BG_COLOR.light} ${TEXT_COLOR.secondary} rounded-lg ${BG_COLOR.hoverDark} transition-colors text-sm font-medium`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActivityLogsClient() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // Filters
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Debounce for text search
  const [debouncedActor, setDebouncedActor] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedActor(actor);
    }, 500);
    return () => clearTimeout(timer);
  }, [actor]);

  // Observer for infinite scroll
  const observerTarget = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(
    async (pageNum: number, isNewFilter: boolean = false) => {
      if (loading) return;
      setLoading(true);

      try {
        const result = await getActivityLogs({
          page: pageNum,
          limit: 20,
          action: action || undefined,
          actor: debouncedActor || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });

        if (isNewFilter) {
          setLogs(result.data);
        } else {
          setLogs((prev) => [...prev, ...result.data]);
        }

        setHasMore(result.hasMore);
        setTotalCount(result.count);
      } catch (error) {
        _log.error('Failed to fetch logs', error);
      } finally {
        setLoading(false);
      }
    },
    [action, debouncedActor, startDate, endDate]
  );

  // Reset and fetch when filters change
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchLogs(1, true);
  }, [action, debouncedActor, startDate, endDate]);

  // Socket.IO Realtime Subscription
  useEffect(() => {
    const socket = socketManager.connect('activity');

    const handleActivityCreated = (data: Record<string, unknown>) => {
      const newLog = data as unknown as ActivityLog;

      // 현재 필터 조건에 맞는지 확인 (간단한 클라이언트 사이드 필터링)
      const matchesAction = !action || newLog.action === action;
      const matchesActor =
        !debouncedActor ||
        (newLog.actor_name &&
          newLog.actor_name.toLowerCase().includes(debouncedActor.toLowerCase()));

      if (matchesAction && matchesActor) {
        setLogs((prev) => [newLog, ...prev]);
        setTotalCount((prev) => prev + 1);
        toast.info('새로운 활동 로그가 감지되었습니다.');
      }
    };

    socket.on('activity:created', handleActivityCreated);

    return () => {
      socket.off('activity:created', handleActivityCreated);
      socketManager.disconnect('activity');
    };
  }, [action, debouncedActor]);

  // Infinite scroll trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage((prev) => {
            const nextPage = prev + 1;
            fetchLogs(nextPage, false);
            return nextPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>활동 로그</h1>
            <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
              총 {totalCount.toLocaleString()} 건 (실시간 업데이트 중)
            </p>
          </div>
        </div>

        {/* Filters */}
        <div
          className={`${BG_COLOR.card} p-4 rounded-lg shadow-sm border ${BORDER_COLOR.default} flex flex-col gap-4`}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between">
            <div className="flex flex-col gap-2 w-full lg:w-auto">
              <span className={`text-xs ${TEXT_COLOR.secondary} font-medium ml-1`}>활동 유형</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '전체', value: '' },
                  { label: '로그인', value: 'LOGIN' },
                  { label: '로그아웃', value: 'LOGOUT' },
                  { label: '업로드', value: 'UPLOAD' },
                  { label: '다운로드', value: 'DOWNLOAD' },
                  { label: '업체 등록', value: 'REGISTER_COMPANY' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setAction(filter.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      action === filter.value
                        ? 'bg-orange-500 text-white'
                        : `bg-gray-100 ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="flex flex-col gap-1 w-full sm:w-auto flex-1">
                <span className={`text-xs ${TEXT_COLOR.secondary} font-medium ml-1`}>
                  사용자 검색
                </span>
                <div className="relative">
                  <input
                    type="text"
                    value={actor}
                    onChange={(e) => setActor(e.target.value)}
                    placeholder="이름 입력"
                    className={`w-full rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm py-2 pl-3 pr-10 focus:ring-orange-500 focus:border-orange-500`}
                  />
                  <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto items-center">
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <span className={`text-xs ${TEXT_COLOR.secondary} font-medium ml-1`}>시작일</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`w-full rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm py-2 px-3 focus:ring-orange-500 focus:border-orange-500`}
                  />
                </div>
                <span className="text-gray-500 mb-2 sm:mb-0">~</span>
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <span className={`text-xs ${TEXT_COLOR.secondary} font-medium ml-1`}>종료일</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`w-full rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm py-2 px-3 focus:ring-orange-500 focus:border-orange-500`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => {
                setAction('');
                setActor('');
                setStartDate('');
                setEndDate('');
              }}
              className={`text-sm text-gray-500 ${TEXT_COLOR.hoverPrimary} underline`}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${BG_COLOR.card} rounded-lg shadow overflow-hidden border ${BORDER_COLOR.default}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead
              className={`text-xs uppercase ${BG_COLOR.grayLighter} ${TEXT_COLOR.mediumBright} border-b ${BORDER_COLOR.medium}`}
            >
              <tr>
                <th className="px-6 py-3 font-medium">일시</th>
                <th className="px-6 py-3 font-medium">사용자</th>
                <th className="px-6 py-3 font-medium">활동</th>
                <th className="px-6 py-3 font-medium">IP / 환경</th>
                <th className="px-6 py-3 font-medium">상세 정보</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${DIVIDE_COLOR.default}`}>
              {logs.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className={`px-6 py-8 text-center ${TEXT_COLOR.secondary}`}>
                    기록된 활동 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`${BG_COLOR.card} ${BG_COLOR.hoverMuted} transition-colors cursor-pointer`}
                  >
                    <td className={`px-6 py-4 whitespace-nowrap ${TEXT_COLOR.secondary}`}>
                      {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className={`font-medium ${TEXT_COLOR.primary}`}>
                          {log.actor_name || '알 수 없음'}
                        </span>
                        <span className={`text-xs ${TEXT_COLOR.secondary}`}>
                          {log.actor_type === 'admin' ? '관리자' : '업체'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.action === 'LOGIN'
                            ? ACTIVITY_LOG_BADGE.login
                            : log.action === 'LOGOUT'
                              ? ACTIVITY_LOG_BADGE.logout
                              : log.action === 'UPLOAD'
                                ? ACTIVITY_LOG_BADGE.upload
                                : log.action === 'DOWNLOAD'
                                  ? ACTIVITY_LOG_BADGE.download
                                  : log.action === 'REGISTER_COMPANY'
                                    ? ACTIVITY_LOG_BADGE.teal
                                    : ACTIVITY_LOG_BADGE.default
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap ${TEXT_COLOR.secondary}`}>
                      <div className="flex flex-col text-xs">
                        <span>{log.ip_address || '-'}</span>
                        <span className="truncate max-w-[150px]" title={log.user_agent || ''}>
                          {log.user_agent
                            ? log.user_agent.includes('Mozilla')
                              ? 'Web Browser'
                              : log.user_agent
                            : '-'}
                        </span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${TEXT_COLOR.secondary}`}>
                      {log.details ? (
                        <div className={`text-xs ${TEXT_COLOR.secondary}`}>
                          <span
                            className={`${TEXT_COLOR.orangeSolid} ${TEXT_COLOR.hoverOrangeMid}`}
                          >
                            상세 보기 →
                          </span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Loading Indicator / Infinite Scroll Trigger */}
        <div ref={observerTarget} className="h-10 flex items-center justify-center p-4">
          {loading && (
            <div className={`flex items-center gap-2 ${TEXT_COLOR.secondary}`}>
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm">로딩 중...</span>
            </div>
          )}
        </div>
      </div>

      {/* 상세 내역 모달 */}
      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
