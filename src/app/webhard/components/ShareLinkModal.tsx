'use client';

/**
 * ShareLinkModal
 * 웹하드 파일 공유 링크 생성 모달
 * - 만료 시간 선택 (1시간, 24시간, 7일, 30일)
 * - 최대 다운로드 횟수 설정 (선택)
 * - 생성된 링크 복사 기능
 * - 다크 모드 지원
 */

import { useState, useCallback } from 'react';
import { FaTimes, FaLink, FaCopy, FaCheck, FaClock, FaDownload } from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR, TYPOGRAPHY } from '@/lib/styles';
import type { CreateShareLinkDTO, ShareLinkDTO } from '@/app/webhard/_lib/types';

interface ShareLinkModalProps {
  /** 모달 열림 여부 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 파일 경로 */
  filePath: string;
  /** 파일 이름 */
  fileName: string;
  /** 회사 ID (선택) */
  companyId?: number | null;
}

/**
 * 공유 링크 생성 모달
 */
export function ShareLinkModal({
  isOpen,
  onClose,
  filePath,
  fileName,
  companyId,
}: ShareLinkModalProps) {
  const [expiresInHours, setExpiresInHours] = useState<number>(24); // 기본: 24시간
  const [maxDownloads, setMaxDownloads] = useState<number | null>(null); // 기본: 무제한
  const [isUnlimited, setIsUnlimited] = useState<boolean>(true); // 무제한 다운로드 여부
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [shareLink, setShareLink] = useState<ShareLinkDTO | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // 만료 시간 옵션
  const expiryOptions = [
    { label: '1시간', value: 1 },
    { label: '24시간', value: 24 },
    { label: '7일', value: 24 * 7 },
    { label: '30일', value: 24 * 30 },
  ];

  // 공유 링크 생성
  const handleCreateShareLink = useCallback(async () => {
    setIsCreating(true);
    setError('');

    try {
      const body: CreateShareLinkDTO = {
        file_path: filePath,
        file_name: fileName,
        company_id: companyId || null,
        expires_in_hours: expiresInHours,
        max_downloads: isUnlimited ? null : maxDownloads,
      };

      const response = await fetch('/api/webhard/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '공유 링크 생성에 실패했습니다.');
      }

      const data: ShareLinkDTO = await response.json();
      setShareLink(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }, [filePath, fileName, companyId, expiresInHours, isUnlimited, maxDownloads]);

  // 링크 복사
  const handleCopyLink = useCallback(async () => {
    if (!shareLink) return;

    const shareUrl = `${window.location.origin}/api/webhard/share/${shareLink.token}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      setError('링크 복사에 실패했습니다.');
    }
  }, [shareLink]);

  // 모달 닫기 및 초기화
  const handleClose = useCallback(() => {
    setShareLink(null);
    setIsCopied(false);
    setError('');
    setExpiresInHours(24);
    setMaxDownloads(null);
    setIsUnlimited(true);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className={`${BG_COLOR.card} rounded-lg shadow-xl max-w-md w-full p-6`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${TYPOGRAPHY.h4} ${TEXT_COLOR.primary}`}>
            <FaLink className="inline mr-2" />
            공유 링크 생성
          </h2>
          <button
            onClick={handleClose}
            className={`p-2 rounded-full ${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary}`}
          >
            <FaTimes />
          </button>
        </div>

        {/* 파일 이름 */}
        <div className="mb-6">
          <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.secondary} mb-1`}>공유할 파일</p>
          <p className={`${TYPOGRAPHY.body.base} ${TEXT_COLOR.primary} truncate`}>{fileName}</p>
        </div>

        {shareLink ? (
          /* 생성된 링크 표시 */
          <div className="space-y-4">
            <div>
              <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.secondary} mb-2`}>공유 링크</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/api/webhard/share/${shareLink.token}`}
                  className={`flex-1 px-3 py-2 border ${BORDER_COLOR.default} rounded ${BG_COLOR.muted} text-sm ${TEXT_COLOR.primary}`}
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-4 py-2 rounded ${
                    isCopied
                      ? 'bg-green-500 text-white'
                      : 'bg-[#ED6C00] hover:bg-[#d15f00] text-white'
                  } transition-colors`}
                >
                  {isCopied ? <FaCheck /> : <FaCopy />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className={`${TEXT_COLOR.secondary} mb-1`}>
                  <FaClock className="inline mr-1" />
                  만료 시간
                </p>
                <p className={TEXT_COLOR.primary}>
                  {new Date(shareLink.expires_at).toLocaleString('ko-KR')}
                </p>
              </div>
              <div>
                <p className={`${TEXT_COLOR.secondary} mb-1`}>
                  <FaDownload className="inline mr-1" />
                  다운로드 제한
                </p>
                <p className={TEXT_COLOR.primary}>
                  {shareLink.max_downloads ? `${shareLink.max_downloads}회` : '무제한'}
                </p>
              </div>
            </div>

            {isCopied && (
              <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.success} text-center`}>
                링크가 클립보드에 복사되었습니다!
              </p>
            )}
          </div>
        ) : (
          /* 공유 링크 설정 */
          <div className="space-y-4">
            {/* 만료 시간 선택 */}
            <div>
              <label className={`${TYPOGRAPHY.label.base} ${TEXT_COLOR.primary} mb-2 block`}>
                만료 시간
              </label>
              <div className="grid grid-cols-2 gap-2">
                {expiryOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setExpiresInHours(option.value)}
                    className={`px-4 py-2 rounded border transition-colors ${
                      expiresInHours === option.value
                        ? 'bg-[#ED6C00] text-white border-[#ED6C00]'
                        : `${BG_COLOR.muted} ${TEXT_COLOR.primary} ${BORDER_COLOR.default} hover:border-[#ED6C00]`
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 다운로드 횟수 제한 */}
            <div>
              <label className={`${TYPOGRAPHY.label.base} ${TEXT_COLOR.primary} mb-2 block`}>
                최대 다운로드 횟수
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="unlimited"
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className="w-4 h-4"
                />
                <label
                  htmlFor="unlimited"
                  className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.secondary}`}
                >
                  무제한
                </label>
              </div>
              {!isUnlimited && (
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxDownloads || ''}
                  onChange={(e) => setMaxDownloads(parseInt(e.target.value, 10) || null)}
                  placeholder="다운로드 횟수 입력"
                  className={`w-full px-3 py-2 border ${BORDER_COLOR.default} rounded ${BG_COLOR.card} ${TEXT_COLOR.primary}`}
                />
              )}
            </div>

            {/* 에러 메시지 */}
            {error && (
              <p className={`${TYPOGRAPHY.body.small} ${TEXT_COLOR.error} text-center`}>{error}</p>
            )}

            {/* 생성 버튼 */}
            <button
              onClick={handleCreateShareLink}
              disabled={isCreating}
              className={`w-full px-4 py-3 rounded bg-[#ED6C00] hover:bg-[#d15f00] text-white font-medium transition-colors ${
                isCreating ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isCreating ? '생성 중...' : '공유 링크 생성'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
