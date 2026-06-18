'use client';

import { BaseModal } from './modals/BaseModal';
import { DownloadButton } from './DownloadButton';
import type { RevisionRequestHistory } from '@/types/database.types';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface RevisionRequestViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisionRequest: {
    title: string;
    content: string;
    requestedAt: string;
    fileUrl?: string | null;
    fileName?: string | null;
    history?: RevisionRequestHistory;
  } | null;
}

export function RevisionRequestViewModal({
  isOpen,
  onClose,
  revisionRequest,
}: RevisionRequestViewModalProps) {
  if (!isOpen || !revisionRequest) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="수정요청서"
      maxWidth="2xl"
      onConfirm={onClose}
      confirmLabel="닫기"
    >
      {/* 내용 */}
      <div className="space-y-4">
        {/* 최신 수정요청 */}
        <div>
          <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>최신 수정요청</h3>
          <div className={`p-4 ${BG_COLOR.muted} rounded-lg border ${BORDER_COLOR.default}`}>
            <div className="space-y-3">
              <div>
                <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>요청 제목</label>
                <p className={`mt-1 text-sm ${TEXT_COLOR.primary} font-medium`}>
                  {revisionRequest.title || '-'}
                </p>
              </div>
              <div>
                <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>요청 내용</label>
                <div className={`mt-1 p-3 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}>
                  <p className={`text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap`}>
                    {revisionRequest.content || '-'}
                  </p>
                </div>
              </div>
              {revisionRequest.requestedAt && (
                <div>
                  <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>요청 일시</label>
                  <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                    {new Date(revisionRequest.requestedAt).toLocaleString('ko-KR')}
                  </p>
                </div>
              )}
              {revisionRequest.fileUrl && (
                <div>
                  <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>첨부 파일</label>
                  <div
                    className={`mt-1 flex items-center justify-between p-2 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                  >
                    <p className={`text-xs ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                      {revisionRequest.fileName || '파일명 없음'}
                    </p>
                    <DownloadButton
                      url={revisionRequest.fileUrl}
                      fileName={revisionRequest.fileName}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 이전 수정요청 히스토리 */}
        {revisionRequest.history &&
          Array.isArray(revisionRequest.history) &&
          revisionRequest.history.length > 0 && (
            <div className={`mt-6 pt-6 border-t ${BORDER_COLOR.default}`}>
              <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>
                이전 수정요청 기록 ({revisionRequest.history.length}건)
              </h3>
              <div className="space-y-4">
                {revisionRequest.history
                  .slice()
                  .reverse()
                  .map((historyItem, index: number) => (
                    <div
                      key={index}
                      className={`p-4 ${BG_COLOR.muted} rounded-lg border ${BORDER_COLOR.default}`}
                    >
                      <div className="space-y-3">
                        <div>
                          <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                            요청 제목
                          </label>
                          <p className={`mt-1 text-sm ${TEXT_COLOR.primary} font-medium`}>
                            {historyItem.title || '-'}
                          </p>
                        </div>
                        <div>
                          <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                            요청 내용
                          </label>
                          <div
                            className={`mt-1 p-3 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                          >
                            <p className={`text-sm ${TEXT_COLOR.primary} whitespace-pre-wrap`}>
                              {historyItem.content || '-'}
                            </p>
                          </div>
                        </div>
                        {historyItem.requested_at && (
                          <div>
                            <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                              요청 일시
                            </label>
                            <p className={`mt-1 text-sm ${TEXT_COLOR.primary}`}>
                              {new Date(historyItem.requested_at).toLocaleString('ko-KR')}
                            </p>
                          </div>
                        )}
                        {historyItem.file_url && (
                          <div>
                            <label className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                              첨부 파일
                            </label>
                            <div
                              className={`mt-1 flex items-center justify-between p-2 ${BG_COLOR.card} rounded border ${BORDER_COLOR.default}`}
                            >
                              <p className={`text-xs ${TEXT_COLOR.primary} flex-1 truncate mr-2`}>
                                {historyItem.file_name || '파일명 없음'}
                              </p>
                              <DownloadButton
                                url={historyItem.file_url}
                                fileName={historyItem.file_name}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>
    </BaseModal>
  );
}
