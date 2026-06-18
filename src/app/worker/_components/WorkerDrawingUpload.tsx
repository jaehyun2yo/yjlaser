'use client';

import { useState, useCallback, useRef } from 'react';
import { X, Paperclip, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useErpMobileStore } from '@/app/worker/_lib/store';
import { ConfirmModal } from './ConfirmModal';
import { BaseModal } from '@/components/modals/BaseModal';
import { logger } from '@/lib/utils/logger';
import { DRAWING_UPLOAD_ALLOWED_EXTENSIONS as ALLOWED_EXTENSIONS } from '@/lib/utils/file-upload-policy';

const log = logger.createLogger('WorkerDrawingUpload');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type Reason = 'domuson_fit' | 'sample_revision' | 'field_correction' | 'other';

const REASON_LABELS: Record<Reason, string> = {
  domuson_fit: '도무송 가공용',
  sample_revision: '칼선 수정',
  field_correction: '현장 가공용',
  other: '기타',
};

interface WorkerDrawingUploadProps {
  contactId: string;
  companyName: string;
  onClose: () => void;
  /**
   * 업로드 성공 시 부모 컴포넌트가 결과 UI (성공 모달 등) 를 관리한다.
   * WorkerDrawingUpload 가 재마운트되어도 성공 메시지가 살아남도록 state 를 부모로 끌어올린 구조.
   */
  onSuccess?: (warning?: { code: string; message: string }) => void;
}

interface DrawingRevisionUploadUrl {
  uploadUrl: string;
  key: string;
  fileName: string;
  uploadHeaders?: Record<string, string>;
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `${file.name}: 파일 크기가 50MB를 초과합니다.`;
  }
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `${file.name}: 허용되지 않는 형식입니다. (${ALLOWED_EXTENSIONS.join(', ')})`;
  }
  return null;
}

export function WorkerDrawingUpload({
  contactId,
  companyName,
  onClose,
  onSuccess,
}: WorkerDrawingUploadProps) {
  const queryClient = useQueryClient();
  const workerSession = useErpMobileStore((s) => s.workerSession);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reason, setReason] = useState<Reason>('domuson_fit');
  const [isUploading, setIsUploading] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      setErrorModal(error);
      return;
    }

    setSelectedFile(file);
    e.target.value = '';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      setErrorModal(error);
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Step 1: presigned URL 발급
      const urlResponse = await fetch('/api/worker/drawing-revisions/upload-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          files: [
            {
              name: selectedFile.name,
              mimeType: selectedFile.type || 'application/octet-stream',
              size: selectedFile.size,
            },
          ],
        }),
      });

      if (!urlResponse.ok) {
        const errData = await urlResponse.json().catch(() => ({}));
        throw new Error((errData as Record<string, string>).error || 'Upload URL 발급 실패');
      }

      const uploadUrls = (await urlResponse.json()) as DrawingRevisionUploadUrl[];
      const { uploadUrl, key, uploadHeaders } = uploadUrls[0];

      // Step 2: storage proxy에 직접 업로드
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type || 'application/octet-stream',
          ...(uploadHeaders ?? {}),
        },
      });

      if (!putResponse.ok) {
        throw new Error('파일 업로드 실패');
      }

      // Step 3: DrawingRevision 생성
      const createResponse = await fetch('/api/worker/drawing-revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          reason,
          files: [
            {
              url: key,
              name: selectedFile.name,
              size: selectedFile.size,
              mimeType: selectedFile.type || 'application/octet-stream',
            },
          ],
          source: 'manual',
          actorType: 'worker',
          actorName: workerSession?.name || 'worker',
        }),
      });

      if (!createResponse.ok) {
        const errData = await createResponse.json().catch(() => ({}));
        throw new Error((errData as Record<string, string>).error || '도면 등록 실패');
      }

      const createData: { webhardWarning?: { code: string; message: string } } =
        await createResponse.json();

      setSelectedFile(null);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.timeline(contactId),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.detail(contactId),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.all,
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.all,
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.webhard.files.all(),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.webhard.folders.all(),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.webhard.badgeCounts(),
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.webhard.newFilesAll(),
          refetchType: 'all',
        }),
      ]);

      // 성공 UI 는 부모 컴포넌트가 관리 — WorkerDrawingUpload 재마운트와 무관하게 살아남음.
      onSuccess?.(createData.webhardWarning);
    } catch (err) {
      log.error('도면 업로드 실패', err);
      setErrorModal(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, reason, contactId, workerSession, queryClient, onSuccess]);

  return (
    <>
      <BaseModal
        isOpen
        onClose={onClose}
        title="도면 업로드"
        subtitle={companyName}
        showCancelButton={false}
      >
        <div className="space-y-4">
          {/* 파일 선택 / 드롭존 */}
          <div
            role="button"
            tabIndex={0}
            data-drag-active={isDragActive || undefined}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              isDragActive
                ? 'border-[#ED6C00] bg-orange-50 text-[#ED6C00]'
                : 'border-gray-300 text-gray-600'
            }`}
          >
            <Paperclip className="w-5 h-5" />
            <span className="text-sm font-medium">
              {isDragActive ? '여기에 놓으세요' : '파일 선택 또는 드래그'}
            </span>
          </div>

          {/* Hidden input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={handleFileChange}
            className="hidden"
            aria-label="파일 선택"
          />

          {/* 선택된 파일 표시 */}
          {selectedFile && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
              <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-900 truncate flex-1">{selectedFile.name}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {(selectedFile.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-gray-400 hover:text-red-500 shrink-0"
                aria-label="파일 제거"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 사유 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">사유</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#ED6C00] focus:border-transparent"
            >
              {(Object.keys(REASON_LABELS) as Reason[]).map((key) => (
                <option key={key} value={key}>
                  {REASON_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {/* 업로드 버튼 */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold text-white transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed bg-[#ED6C00] active:bg-[#d15f00]"
          >
            {isUploading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <>
                <Upload className="w-4 h-4" />
                업로드
              </>
            )}
          </button>
        </div>
      </BaseModal>

      {/* 에러 모달 */}
      <ConfirmModal
        isOpen={!!errorModal}
        title="오류"
        message={errorModal || ''}
        type="error"
        confirmText="확인"
        onConfirm={() => setErrorModal(null)}
        onCancel={() => setErrorModal(null)}
      />
    </>
  );
}
