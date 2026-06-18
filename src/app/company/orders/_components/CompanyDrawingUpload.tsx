'use client';

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FaPaperclip, FaUpload, FaTimes } from 'react-icons/fa';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useToast } from '@/hooks/useToast';
import { COMPANY_THEME, TEXT_COLOR, BG_COLOR, BORDER_COLOR, INPUT_STYLES } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';
import { DRAWING_UPLOAD_ALLOWED_EXTENSIONS as ALLOWED_EXTENSIONS } from '@/lib/utils/file-upload-policy';

const log = logger.createLogger('CompanyDrawingUpload');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type Purpose = 'revision_submit' | 'mold_request' | 'other';

const PURPOSE_LABELS: Record<Purpose, string> = {
  revision_submit: '수정도면 제출',
  mold_request: '목형의뢰 도면',
  other: '기타',
};

interface CompanyDrawingUploadProps {
  contactId: string;
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
    return `${file.name}: 허용되지 않는 파일 형식입니다. (${ALLOWED_EXTENSIONS.join(', ')})`;
  }
  return null;
}

export function CompanyDrawingUpload({ contactId }: CompanyDrawingUploadProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [purpose, setPurpose] = useState<Purpose>('mold_request');
  const [note, setNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const errors: string[] = [];
      const valid: File[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
        } else {
          valid.push(file);
        }
      }

      if (errors.length > 0) {
        showError('파일 검증 실패', errors.join('\n'));
      }
      if (valid.length > 0) {
        setSelectedFiles((prev) => [...prev, ...valid]);
      }
    },
    [showError]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [handleFileSelect]
  );

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) {
      showError('파일 선택', '업로드할 파일을 선택해주세요.');
      return;
    }

    setIsUploading(true);
    try {
      // Step 1: presigned URL 발급
      const urlResponse = await fetch(`/api/contacts/${contactId}/drawing-revisions/upload-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles.map((f) => ({
            name: f.name,
            mimeType: f.type || 'application/octet-stream',
            size: f.size,
          })),
        }),
      });

      if (!urlResponse.ok) {
        throw new Error('presigned URL 발급 실패');
      }

      const uploadUrls = (await urlResponse.json()) as DrawingRevisionUploadUrl[];

      // Step 2: storage proxy에 직접 업로드
      const uploadedFiles: Array<{ url: string; name: string; size: number; mimeType: string }> =
        [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const { uploadUrl, key, uploadHeaders } = uploadUrls[i];

        const putResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            ...(uploadHeaders ?? {}),
          },
        });

        if (!putResponse.ok) {
          throw new Error(`파일 업로드 실패: ${file.name}`);
        }

        uploadedFiles.push({
          url: key,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
      }

      // Step 3: DrawingRevision 생성
      const createResponse = await fetch(`/api/contacts/${contactId}/company-drawing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          files: uploadedFiles,
          note: note.trim() || undefined,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error((errorData as Record<string, string>).message || '도면 등록 실패');
      }

      success('업로드 완료', '도면이 성공적으로 업로드되었습니다.');
      setSelectedFiles([]);
      setNote('');

      // 통합 타임라인 새로고침 (drawing_revision 항목이 인터리브 포함됨)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.timeline(contactId),
      });
    } catch (err) {
      log.error('도면 업로드 실패', err);
      showError(
        '업로드 실패',
        err instanceof Error ? err.message : '도면 업로드 중 오류가 발생했습니다.'
      );
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles, purpose, note, contactId, queryClient, success, showError]);

  return (
    <div className={`${COMPANY_THEME.card} ${COMPANY_THEME.cardPadding}`}>
      <h3 className={`text-lg font-bold ${TEXT_COLOR.primary} mb-5`}>도면 업로드</h3>

      {/* 파일 드래그 앤 드롭 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors
          ${
            isDragOver
              ? 'border-[#ED6C00] bg-orange-50 dark:bg-orange-950/20'
              : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-[#ED6C00]'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={(e) => {
            if (e.target.files) handleFileSelect(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
          aria-label="도면 파일 선택"
        />
        <FaPaperclip
          className={`mx-auto text-2xl mb-2 ${isDragOver ? 'text-[#ED6C00]' : TEXT_COLOR.muted}`}
          aria-hidden="true"
        />
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>파일 선택 또는 드래그하여 업로드</p>
        <p className={`text-xs ${TEXT_COLOR.muted} mt-1`}>
          PDF, DXF, AI, DWG, ZIP, JPG, PNG — 최대 50MB
        </p>
      </div>

      {/* 선택된 파일 목록 */}
      {selectedFiles.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${BORDER_COLOR.default} ${BG_COLOR.card}`}
            >
              <span className={`text-sm ${TEXT_COLOR.primary} truncate flex-1`}>{file.name}</span>
              <span className={`text-xs ${TEXT_COLOR.muted} flex-shrink-0`}>
                {(file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(idx);
                }}
                className={`${TEXT_COLOR.muted} hover:text-red-500 transition-colors flex-shrink-0`}
                aria-label={`${file.name} 제거`}
              >
                <FaTimes className="text-xs" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 용도 선택 */}
      <div className="mt-5">
        <p className={`text-sm font-medium ${TEXT_COLOR.primary} mb-2`}>용도</p>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((key) => (
            <label
              key={key}
              className={`flex items-center gap-2 cursor-pointer text-sm ${TEXT_COLOR.secondary}`}
            >
              <input
                type="radio"
                name="drawing-purpose"
                value={key}
                checked={purpose === key}
                onChange={() => setPurpose(key)}
                className="text-[#ED6C00] focus:ring-[#ED6C00]"
              />
              {PURPOSE_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      {/* 메모 */}
      <div className="mt-4">
        <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
          메모 <span className={`font-normal ${TEXT_COLOR.muted}`}>(선택)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="도면 관련 메모를 입력해주세요."
          rows={2}
          className={`${INPUT_STYLES.textarea} w-full`}
        />
      </div>

      {/* 업로드 버튼 */}
      <div className="mt-5">
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading || selectedFiles.length === 0}
          className={`
            inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg
            transition-colors
            ${
              selectedFiles.length === 0 || isUploading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                : 'bg-[#ED6C00] hover:bg-[#d15f00] text-white'
            }
          `}
        >
          <FaUpload className="text-xs" aria-hidden="true" />
          {isUploading ? '업로드 중...' : '업로드'}
        </button>
      </div>
    </div>
  );
}
