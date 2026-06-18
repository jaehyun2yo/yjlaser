'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FaSpinner, FaTimes } from 'react-icons/fa';
import { BaseModal } from './BaseModal';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, INPUT_STYLES } from '@/lib/styles';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('DrawingRevisionModal');

const REASON_OPTIONS = [
  { value: 'domuson_fit', label: '도무송 맞춤' },
  { value: 'sample_revision', label: '샘플 수정' },
  { value: 'field_correction', label: '현장 보정' },
  { value: 'laser_processing', label: '레이저 가공' },
  { value: 'other', label: '기타' },
] as const;

type ReasonValue = (typeof REASON_OPTIONS)[number]['value'];

interface DrawingRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  processStage?: string | null;
  source?: 'stage_change' | 'manual';
  onComplete?: () => void;
}

interface SelectedFile {
  file: File;
  id: string;
}

interface DrawingRevisionUploadUrl {
  uploadUrl: string;
  key: string;
  fileName: string;
  uploadHeaders?: Record<string, string>;
}

export function DrawingRevisionModal({
  isOpen,
  onClose,
  contactId,
  processStage,
  source = 'manual',
  onComplete,
}: DrawingRevisionModalProps) {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [reason, setReason] = useState<ReasonValue>('domuson_fit');
  const [reasonDetail, setReasonDetail] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSelectedFiles([]);
      setReason('domuson_fit');
      setReasonDetail('');
      setNote('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles: SelectedFile[] = files.map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    }));
    setSelectedFiles((prev) => [...prev, ...newFiles]);
    // input 초기화 (동일 파일 재선택 허용)
    e.target.value = '';
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (selectedFiles.length === 0) {
      setErrorMessage('파일을 하나 이상 선택해주세요.');
      return;
    }
    if (reason === 'other' && !reasonDetail.trim()) {
      setErrorMessage('기타 사유를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. presigned URL 획득
      const uploadUrlsRes = await fetch(
        `/api/contacts/${contactId}/drawing-revisions/upload-urls`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: selectedFiles.map((sf) => ({
              name: sf.file.name,
              mimeType: sf.file.type || 'application/octet-stream',
              size: sf.file.size,
            })),
          }),
        }
      );

      if (!uploadUrlsRes.ok) {
        throw new Error('업로드 URL 생성 실패');
      }

      const uploadUrls = (await uploadUrlsRes.json()) as DrawingRevisionUploadUrl[];

      // 2. storage proxy에 직접 PUT 업로드
      await Promise.all(
        selectedFiles.map(async (sf, idx) => {
          const { uploadUrl, uploadHeaders } = uploadUrls[idx];
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            body: sf.file,
            headers: {
              'Content-Type': sf.file.type || 'application/octet-stream',
              ...(uploadHeaders ?? {}),
            },
          });
          if (!res.ok) {
            throw new Error(`파일 업로드 실패: ${sf.file.name}`);
          }
        })
      );

      // 3. 도면 수정 등록
      const createRes = await fetch(`/api/contacts/${contactId}/drawing-revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          reasonDetail: reason === 'other' ? reasonDetail.trim() : undefined,
          files: uploadUrls.map((u, idx) => ({
            url: u.key,
            name: selectedFiles[idx].file.name,
            size: selectedFiles[idx].file.size,
            mimeType: selectedFiles[idx].file.type || 'application/octet-stream',
          })),
          processStage: processStage ?? undefined,
          note: note.trim() || undefined,
          source,
        }),
      });

      if (!createRes.ok) {
        throw new Error('도면 수정 등록 실패');
      }

      // 4. React Query 캐시 무효화 (통합 타임라인 + 상세)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.timeline(contactId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.detail(contactId),
          refetchType: 'active',
        }),
      ]);

      onComplete?.();
      onClose();
    } catch (err) {
      log.error('도면 수정 등록 오류', err);
      setErrorMessage(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    selectedFiles,
    reason,
    reasonDetail,
    note,
    contactId,
    processStage,
    source,
    queryClient,
    onComplete,
    onClose,
  ]);

  const cancelLabel = source === 'stage_change' ? '건너뛰기' : '취소';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleSubmit}
      title="도면 수정 등록"
      confirmLabel="등록"
      cancelLabel={cancelLabel}
      isSubmitting={isSubmitting}
      maxWidth="lg"
    >
      {/* 부제 (stage_change 모드) */}
      {source === 'stage_change' && (
        <p className={`text-sm ${TEXT_COLOR.secondary} -mt-2`}>도면이 수정되었나요?</p>
      )}

      {/* 에러 메시지 */}
      {errorMessage && (
        <div className={`text-sm ${TEXT_COLOR.error} p-2 rounded ${BG_COLOR.error}`}>
          {errorMessage}
        </div>
      )}

      {/* 파일 선택 */}
      <div>
        <label className={`block text-xs font-medium ${TEXT_COLOR.muted} mb-1`}>
          파일 선택 <span className="text-red-500">*</span>
        </label>
        <label
          className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed ${BORDER_COLOR.default} rounded-lg cursor-pointer ${BG_COLOR.muted} ${BG_COLOR.hoverMuted} transition-colors`}
        >
          <span className={`text-xs ${TEXT_COLOR.muted}`}>클릭하여 파일 선택</span>
          <span className={`text-[10px] ${TEXT_COLOR.dim} mt-1`}>
            PDF, AI, DXF, DWG, CDR, EPS, SVG, PNG, JPG 지원
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.ai,.dxf,.dwg,.cdr,.eps,.svg,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileChange}
            disabled={isSubmitting}
          />
        </label>

        {/* 선택된 파일 목록 */}
        {selectedFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {selectedFiles.map((sf) => (
              <li
                key={sf.id}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border ${BORDER_COLOR.default} ${BG_COLOR.card}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`text-xs ${TEXT_COLOR.primary} truncate`}>{sf.file.name}</span>
                  <span className={`text-[10px] ${TEXT_COLOR.dim} flex-shrink-0`}>
                    {formatFileSize(sf.file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(sf.id)}
                  disabled={isSubmitting}
                  className={`flex-shrink-0 ${TEXT_COLOR.muted} hover:text-red-500 transition-colors disabled:opacity-50`}
                >
                  <FaTimes className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 수정 사유 */}
      <div>
        <label className={`block text-xs font-medium ${TEXT_COLOR.muted} mb-1`}>
          수정 사유 <span className="text-red-500">*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as ReasonValue)}
          disabled={isSubmitting}
          className={`w-full ${INPUT_STYLES.base} text-sm disabled:opacity-50`}
        >
          {REASON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* 기타 자유입력 */}
        {reason === 'other' && (
          <input
            type="text"
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            placeholder="사유를 입력해주세요"
            disabled={isSubmitting}
            maxLength={200}
            className={`w-full ${INPUT_STYLES.base} text-sm mt-2 disabled:opacity-50`}
          />
        )}
      </div>

      {/* 메모 */}
      <div>
        <label className={`block text-xs font-medium ${TEXT_COLOR.muted} mb-1`}>메모 (선택)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="추가 메모를 입력해주세요"
          disabled={isSubmitting}
          maxLength={500}
          rows={3}
          className={`w-full ${INPUT_STYLES.base} text-sm resize-none disabled:opacity-50`}
        />
        <p className={`text-[10px] ${TEXT_COLOR.dim} text-right mt-0.5`}>{note.length}/500</p>
      </div>

      {/* 업로드 중 표시 */}
      {isSubmitting && (
        <div className={`flex items-center gap-2 ${TEXT_COLOR.muted}`}>
          <FaSpinner className="animate-spin text-sm" />
          <span className="text-xs">업로드 중...</span>
        </div>
      )}
    </BaseModal>
  );
}
