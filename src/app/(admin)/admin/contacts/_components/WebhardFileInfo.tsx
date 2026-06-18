/**
 * 웹하드 파일 정보 컴포넌트
 * - webhard source 문의 전용
 * - 디렉토리 경로 표시 (breadcrumb)
 * - "웹하드에서 보기" 버튼
 * - folderPath props 우선 사용, 없으면 API fallback
 */
'use client';

import { memo, useState, useEffect } from 'react';
import { FaFolder, FaExternalLinkAlt, FaSpinner } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import type { Contact } from '@/lib/types';

const log = logger.createLogger('WebhardFileInfo');

interface WebhardFileInfoProps {
  contact: Contact;
  folderPath?: string | null;
  onStopPropagation: (e: React.MouseEvent) => void;
}

interface WebhardInfo {
  folderId: string | null;
  folderPath: string | null;
  folderName: string | null;
  fileId: string | null;
}

function WebhardFileInfoComponent({
  contact,
  folderPath: propFolderPath,
  onStopPropagation,
}: WebhardFileInfoProps) {
  const [webhardInfo, setWebhardInfo] = useState<WebhardInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // folderPath가 props로 제공되면 API 호출 건너뜀
  const hasPropPath = !!propFolderPath;

  // 웹하드 정보 조회 (props에 path가 없을 때만)
  useEffect(() => {
    if (hasPropPath) return;
    if (contact.source !== 'webhard' || !contact.webhard_folder_id) return;

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/contacts/${contact.id}/webhard-info`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch webhard info');
        return res.json();
      })
      .then((data: WebhardInfo) => {
        if (!cancelled) setWebhardInfo(data);
      })
      .catch((err) => {
        log.error('Failed to load webhard info', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contact.id, contact.source, contact.webhard_folder_id, hasPropPath]);

  // webhard source가 아니면 미표시
  if (contact.source !== 'webhard') return null;

  // 최종 경로: props 우선, fallback으로 API 응답
  const finalPath = propFolderPath || webhardInfo?.folderPath;
  const folderId = contact.webhard_folder_id || webhardInfo?.folderId;

  // 폴더 경로를 breadcrumb 형태로 분할
  const pathSegments = finalPath ? finalPath.split('/').filter(Boolean) : [];

  return (
    <div className={`${BG_COLOR.light} rounded-lg p-3 mb-3`}>
      <h3
        className={`text-xs font-semibold ${TEXT_COLOR.primary} mb-2 border-b ${BORDER_COLOR.default} pb-1.5`}
      >
        웹하드 정보
      </h3>

      {isLoading && !hasPropPath ? (
        <div className="flex items-center gap-2 py-2">
          <FaSpinner className={`animate-spin text-xs ${TEXT_COLOR.muted}`} />
          <span className={`text-xs ${TEXT_COLOR.muted}`}>로딩 중...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 폴더 경로 (breadcrumb) */}
          {pathSegments.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <FaFolder className={`text-xs ${TEXT_COLOR.muted} flex-shrink-0`} />
              {pathSegments.map((segment, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <span className={`text-xs ${TEXT_COLOR.muted}`}>/</span>}
                  <span
                    className={`text-xs ${idx === pathSegments.length - 1 ? TEXT_COLOR.primary + ' font-medium' : TEXT_COLOR.tertiary}`}
                  >
                    {segment}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* 웹하드에서 보기 */}
          {folderId && (
            <div className="pt-1">
              <a
                href={`/webhard?folderId=${folderId}`}
                onClick={onStopPropagation}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.white} ${TEXT_COLOR.primary} hover:bg-gray-50 ${TRANSITION_STYLES.colors}`}
              >
                <FaExternalLinkAlt className="text-[10px]" />
                웹하드에서 보기
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const WebhardFileInfo = memo(WebhardFileInfoComponent);
