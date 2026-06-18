'use client';

import { ACTIVITY_LOG_BADGE, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { logger } from '@/lib/utils/logger';

const _log = logger.createLogger('LogsTable');
import { ko } from 'date-fns/locale';
import { FaChevronDown, FaTimes } from 'react-icons/fa';

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
      UPDATE: '수정',
      COMPANY_STATUS_CHANGE: '업체 상태 변경',
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
      previousValue: '이전 값',
      newValue: '변경 값',
      previousStatus: '이전 상태',
      newStatus: '변경 상태',
      permissionType: '권한 유형',
      reason: '사유',
      username: '아이디',
      email: '이메일',
      status: '상태',
      parentPath: '부모 경로',
      newName: '새 이름',
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

    // 상태 값 한글 변환
    if (key === 'newStatus' || key === 'previousStatus') {
      const statusLabels: Record<string, string> = {
        active: '활성',
        inactive: '비활성',
        pending: '대기중',
      };
      return { label, value: statusLabels[String(value)] || String(value) };
    }

    // 권한 유형 한글 변환
    if (key === 'permissionType') {
      const permissionLabels: Record<string, string> = {
        webhard_access: '웹하드 접근',
      };
      return { label, value: permissionLabels[String(value)] || String(value) };
    }

    return { label, value: String(value) };
  };

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'LOGIN':
        return ACTIVITY_LOG_BADGE.login;
      case 'LOGOUT':
        return ACTIVITY_LOG_BADGE.logout;
      case 'UPLOAD':
        return ACTIVITY_LOG_BADGE.upload;
      case 'DOWNLOAD':
        return ACTIVITY_LOG_BADGE.download;
      case 'DELETE':
        return ACTIVITY_LOG_BADGE.delete;
      case 'PERMISSION_CHANGE':
      case 'COMPANY_STATUS_CHANGE':
        return ACTIVITY_LOG_BADGE.permissionChange;
      case 'UPDATE':
        return ACTIVITY_LOG_BADGE.update;
      default:
        return ACTIVITY_LOG_BADGE.default;
    }
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
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeClass(log.action)}`}
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

interface LogsTableProps {
  logs: ActivityLog[];
}

export function LogsTable({ logs }: LogsTableProps) {
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'LOGIN':
        return ACTIVITY_LOG_BADGE.login;
      case 'LOGOUT':
        return ACTIVITY_LOG_BADGE.logout;
      case 'UPLOAD':
        return ACTIVITY_LOG_BADGE.upload;
      case 'DOWNLOAD':
        return ACTIVITY_LOG_BADGE.download;
      case 'DELETE':
        return ACTIVITY_LOG_BADGE.delete;
      case 'PERMISSION_CHANGE':
      case 'COMPANY_STATUS_CHANGE':
        return ACTIVITY_LOG_BADGE.permissionChange;
      case 'UPDATE':
        return ACTIVITY_LOG_BADGE.update;
      default:
        return ACTIVITY_LOG_BADGE.default;
    }
  };

  // 상세 정보 요약 표시
  const getDetailsSummary = (details: Record<string, unknown> | null) => {
    if (!details) return '-';

    // 주요 정보만 추출해서 표시
    const summaryParts: string[] = [];

    if (details.fileName) summaryParts.push(String(details.fileName));
    if (details.companyName) summaryParts.push(String(details.companyName));
    if (details.newName) summaryParts.push(String(details.newName));
    if (details.newStatus) {
      const statusLabels: Record<string, string> = {
        active: '활성',
        inactive: '비활성',
        pending: '대기중',
      };
      summaryParts.push(statusLabels[String(details.newStatus)] || String(details.newStatus));
    }
    if (details.newValue !== undefined) {
      summaryParts.push(details.newValue ? '허용' : '차단');
    }

    if (summaryParts.length === 0) {
      // 첫 번째 필드값만 표시
      const firstValue = Object.values(details)[0];
      if (firstValue !== undefined) {
        const strValue = String(firstValue);
        return strValue.length > 30 ? strValue.slice(0, 30) + '...' : strValue;
      }
      return '-';
    }

    const summary = summaryParts.join(' / ');
    return summary.length > 40 ? summary.slice(0, 40) + '...' : summary;
  };

  const handleRowClick = (activityLog: ActivityLog) => {
    _log.info('Row clicked:', activityLog.id);
    setSelectedLog(activityLog);
  };

  return (
    <>
      <table className="w-full text-sm text-left">
        <thead
          className={`text-xs uppercase border-b ${BORDER_COLOR.medium} ${BG_COLOR.grayLighter} ${TEXT_COLOR.mediumBright}`}
        >
          <tr>
            <th className="px-6 py-3 font-medium">일시</th>
            <th className="px-6 py-3 font-medium">사용자</th>
            <th className="px-6 py-3 font-medium">활동</th>
            <th className="px-6 py-3 font-medium">IP</th>
            <th className="px-6 py-3 font-medium">상세</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${DIVIDE_COLOR.default}`}>
          {logs.length === 0 ? (
            <tr>
              <td colSpan={5} className={`px-6 py-8 text-center ${TEXT_COLOR.secondary}`}>
                기록된 활동 로그가 없습니다.
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr
                key={log.id}
                onClick={() => handleRowClick(log)}
                className={`${BG_COLOR.card} ${BG_COLOR.hoverOrangeRow} transition-colors cursor-pointer`}
              >
                <td className={`px-6 py-4 whitespace-nowrap ${TEXT_COLOR.secondary}`}>
                  {format(new Date(log.created_at), 'MM-dd HH:mm:ss', { locale: ko })}
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
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeClass(log.action)}`}
                  >
                    {log.action}
                  </span>
                </td>
                <td
                  className={`px-6 py-4 whitespace-nowrap ${TEXT_COLOR.secondary} text-xs font-mono`}
                >
                  {log.ip_address || '-'}
                </td>
                <td className={`px-6 py-4 ${TEXT_COLOR.secondary} text-sm`}>
                  <span className={`${TEXT_COLOR.hoverOrangeSolid} transition-colors`}>
                    {getDetailsSummary(log.details)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 상세 내역 모달 */}
      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </>
  );
}
