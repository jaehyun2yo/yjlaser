'use client';

import { useState } from 'react';
import { FaFile, FaTimes, FaCheck, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import { UploadProgress, formatUploadProgress } from '@/lib/utils/chunkedUpload';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface UploadProgressBarProps {
  progress: UploadProgress;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * 업로드 진행률 표시 컴포넌트
 */
export function UploadProgressBar({
  progress,
  onCancel,
  onRetry,
  onDismiss,
}: UploadProgressBarProps) {
  const { percentage, fileName, status, error } = progress;

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-[#ED6C00]';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'preparing':
      case 'uploading':
      case 'completing':
        return <FaSpinner className="animate-spin text-[#ED6C00]" />;
      case 'completed':
        return <FaCheck className="text-green-500" />;
      case 'error':
        return <FaExclamationTriangle className="text-red-500" />;
      default:
        return <FaFile className="text-gray-500" />;
    }
  };

  return (
    <div className={`${BG_COLOR.card} rounded-lg shadow-lg border ${BORDER_COLOR.default} p-4`}>
      <div className="flex items-center gap-3">
        {/* 상태 아이콘 */}
        <div className="flex-shrink-0">{getStatusIcon()}</div>

        {/* 파일 정보 */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${TEXT_COLOR.primary} truncate`}>{fileName}</p>
          <p className={`text-xs ${TEXT_COLOR.muted}`}>{formatUploadProgress(progress)}</p>
        </div>

        {/* 액션 버튼 */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* 취소 버튼 (업로드 중일 때만) */}
          {(status === 'preparing' || status === 'uploading' || status === 'completing') &&
            onCancel && (
              <button
                onClick={onCancel}
                className={`p-1.5 text-gray-400 ${TEXT_COLOR.hoverTertiary} transition-colors`}
                title="업로드 취소"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            )}

          {/* 재시도 버튼 (에러 시) */}
          {status === 'error' && onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-xs bg-[#ED6C00] text-white rounded hover:bg-[#d45f00] transition-colors"
            >
              재시도
            </button>
          )}

          {/* 닫기 버튼 (완료 또는 에러 시) */}
          {(status === 'completed' || status === 'error') && onDismiss && (
            <button
              onClick={onDismiss}
              className={`p-1.5 text-gray-400 ${TEXT_COLOR.hoverTertiary} transition-colors`}
              title="닫기"
            >
              <FaTimes className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 진행률 바 */}
      <div className={`mt-3 h-2 ${BG_COLOR.light} rounded-full overflow-hidden`}>
        <div
          className={`h-full transition-all duration-300 ${getStatusColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* 에러 메시지 */}
      {status === 'error' && error && (
        <p className={`mt-2 text-xs ${TEXT_COLOR.errorMid}`}>{error}</p>
      )}
    </div>
  );
}

/**
 * 다중 파일 업로드 진행률 관리 컴포넌트
 */
interface MultiUploadProgressProps {
  uploads: Map<string, UploadProgress>;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onDismissAll?: () => void;
}

export function MultiUploadProgress({
  uploads,
  onCancel,
  onRetry,
  onDismiss,
  onDismissAll,
}: MultiUploadProgressProps) {
  const uploadArray = Array.from(uploads.entries());

  if (uploadArray.length === 0) return null;

  const completedCount = uploadArray.filter(([, p]) => p.status === 'completed').length;
  const errorCount = uploadArray.filter(([, p]) => p.status === 'error').length;
  const uploadingCount = uploadArray.filter(
    ([, p]) => p.status === 'preparing' || p.status === 'uploading' || p.status === 'completing'
  ).length;

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50 space-y-2">
      {/* 요약 헤더 */}
      {uploadArray.length > 1 && (
        <div
          className={`${BG_COLOR.card} rounded-lg shadow-lg border ${BORDER_COLOR.default} p-3 flex items-center justify-between`}
        >
          <div className={`text-sm ${TEXT_COLOR.secondary}`}>
            <span className="font-medium">{uploadArray.length}개 파일</span>
            {uploadingCount > 0 && (
              <span className="ml-2 text-[#ED6C00]">({uploadingCount}개 업로드 중)</span>
            )}
            {completedCount > 0 && (
              <span className="ml-2 text-green-500">({completedCount}개 완료)</span>
            )}
            {errorCount > 0 && <span className="ml-2 text-red-500">({errorCount}개 실패)</span>}
          </div>
          {uploadingCount === 0 && onDismissAll && (
            <button
              onClick={onDismissAll}
              className={`text-xs text-gray-500 ${TEXT_COLOR.hoverSecondary}`}
            >
              모두 닫기
            </button>
          )}
        </div>
      )}

      {/* 개별 업로드 진행률 */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {uploadArray.map(([id, progress]) => (
          <UploadProgressBar
            key={id}
            progress={progress}
            onCancel={onCancel ? () => onCancel(id) : undefined}
            onRetry={onRetry ? () => onRetry(id) : undefined}
            onDismiss={onDismiss ? () => onDismiss(id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 업로드 상태 관리 훅
 */
export function useUploadProgress() {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());

  const addUpload = (id: string, progress: UploadProgress) => {
    setUploads((prev) => {
      const next = new Map(prev);
      next.set(id, progress);
      return next;
    });
  };

  const updateUpload = (id: string, progress: Partial<UploadProgress>) => {
    setUploads((prev) => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, ...progress });
      }
      return next;
    });
  };

  const removeUpload = (id: string) => {
    setUploads((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const clearCompleted = () => {
    setUploads((prev) => {
      const next = new Map(prev);
      for (const [id, progress] of next.entries()) {
        if (progress.status === 'completed' || progress.status === 'error') {
          next.delete(id);
        }
      }
      return next;
    });
  };

  return {
    uploads,
    addUpload,
    updateUpload,
    removeUpload,
    clearCompleted,
  };
}
