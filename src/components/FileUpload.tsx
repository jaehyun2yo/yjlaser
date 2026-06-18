'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FaPaperclip, FaTrash } from 'react-icons/fa';
import { TRANSITION_STYLES, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

export interface FileUploadProps {
  /** 파일 input의 name 속성 */
  name: string;
  /** 파일 input의 id 속성 */
  id?: string;
  /** 단일 파일 또는 다중 파일 선택 */
  multiple?: boolean;
  /** 허용된 파일 타입 (accept 속성) */
  accept?: string;
  /**
   * 차단할 확장자 목록 (점 포함, 소문자).
   * accept 화이트리스트 대신 블랙리스트로 검증할 때 사용.
   * accept 와 동시에 지정하면 둘 다 적용 (먼저 blockedExtensions 검사).
   */
  blockedExtensions?: readonly string[];
  /** 최대 파일 크기 (바이트 단위, 기본값: 10MB) */
  maxSize?: number;
  /** 최대 파일 개수 (multiple일 때만 적용) */
  maxFiles?: number;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 필수 여부 */
  required?: boolean;
  /** 선택된 파일들 */
  files?: File[];
  /** 파일 변경 핸들러 */
  onChange?: (files: File[]) => void;
  /** 에러 핸들러 */
  onError?: (error: string) => void;
  /** 라벨 텍스트 */
  label?: string;
  /** 도움말 텍스트 */
  helpText?: string;
  /** 드래그 앤 드롭 활성화 여부 (기본값: true) */
  enableDragDrop?: boolean;
  /** 커스텀 클래스명 */
  className?: string;
}

export function FileUpload({
  name,
  id,
  multiple = false,
  accept,
  blockedExtensions,
  maxSize = 10 * 1024 * 1024, // 10MB
  maxFiles,
  disabled = false,
  required = false,
  files: controlledFiles,
  onChange,
  onError,
  label,
  helpText,
  enableDragDrop = true,
  className = '',
}: FileUploadProps) {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 모바일 감지
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  // controlled 또는 uncontrolled 모드
  const files = controlledFiles !== undefined ? controlledFiles : internalFiles;
  const setFiles = useCallback(
    (newFiles: File[]) => {
      if (controlledFiles === undefined) {
        setInternalFiles(newFiles);
      }
      onChange?.(newFiles);
    },
    [controlledFiles, onChange]
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      // 파일 크기 검증
      if (file.size > maxSize) {
        return `파일 크기는 ${(maxSize / 1024 / 1024).toFixed(0)}MB 이하여야 합니다.`;
      }

      const fileExtension = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');

      // 차단 확장자 검증 (블랙리스트 우선)
      if (blockedExtensions && blockedExtensions.length > 0) {
        const normalized = blockedExtensions.map((e) => e.toLowerCase());
        if (normalized.includes(fileExtension)) {
          return `${fileExtension} 확장자는 업로드할 수 없습니다.`;
        }
      }

      // 파일 타입 검증 (accept 화이트리스트가 있는 경우만)
      if (accept) {
        const acceptedTypes = accept
          .split(',')
          .map((type) => type.trim())
          .filter(Boolean);
        if (acceptedTypes.length > 0) {
          const fileType = file.type;

          const isAccepted =
            acceptedTypes.some((type) => {
              if (type.startsWith('.')) {
                return fileExtension === type.toLowerCase();
              }
              if (type.includes('/*')) {
                const baseType = type.split('/')[0];
                return fileType.startsWith(baseType + '/');
              }
              return fileType === type;
            }) || acceptedTypes.some((type) => type === fileType);

          if (!isAccepted) {
            return `허용되지 않은 파일 형식입니다. (${accept})`;
          }
        }
      }

      return null;
    },
    [maxSize, accept, blockedExtensions]
  );

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const validFiles: File[] = [];
      const errors: string[] = [];

      // 최대 파일 개수 검증
      if (multiple && maxFiles && files.length + fileArray.length > maxFiles) {
        const error = `최대 ${maxFiles}개의 파일만 업로드할 수 있습니다.`;
        onError?.(error);
        return;
      }

      fileArray.forEach((file) => {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          validFiles.push(file);
        }
      });

      if (errors.length > 0) {
        onError?.(errors.join('\n'));
      }

      if (validFiles.length > 0) {
        if (multiple) {
          setFiles([...files, ...validFiles]);
        } else {
          setFiles([validFiles[0]]);
        }
      }
    },
    [files, multiple, maxFiles, validateFile, setFiles, onError]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        addFiles(selectedFiles);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!enableDragDrop || disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    [enableDragDrop, disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!enableDragDrop || disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    },
    [enableDragDrop, disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!enableDragDrop || disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles && droppedFiles.length > 0) {
        addFiles(droppedFiles);
        // 파일 input도 업데이트
        if (fileInputRef.current) {
          const dataTransfer = new DataTransfer();
          Array.from(droppedFiles).forEach((file) => {
            const error = validateFile(file);
            if (!error) {
              dataTransfer.items.add(file);
            }
          });
          fileInputRef.current.files = dataTransfer.files;
        }
      }
    },
    [enableDragDrop, disabled, addFiles, validateFile]
  );

  const handleRemoveFile = useCallback(
    (index: number) => {
      const newFiles = files.filter((_, i) => i !== index);
      setFiles(newFiles);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [files, setFiles]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const inputId = id || name;
  const displayFiles = multiple ? files : files.slice(0, 1);

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className={`block ${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.secondary} mb-3`}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="space-y-3">
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          name={name}
          multiple={multiple}
          accept={accept}
          required={required}
          disabled={disabled}
          onChange={handleFileSelect}
          className="hidden"
        />

        {enableDragDrop ? (
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full ${isMobile ? 'px-3 py-4' : 'px-6 py-8'} border-2 border-dashed rounded-lg ${TRANSITION_STYLES.all} ${
              isDragging
                ? `border-brand ${BG_COLOR.brandLight}`
                : `${BORDER_COLOR.default} ${BG_COLOR.card} ${BG_COLOR.hoverMuted}`
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <button
              type="button"
              onClick={handleClick}
              disabled={disabled}
              className={`w-full flex flex-col items-center justify-center gap-2 ${TEXT_COLOR.secondary} disabled:opacity-50`}
            >
              <FaPaperclip
                className={`${isMobile ? 'text-xl' : 'text-2xl'} ${isDragging ? TEXT_COLOR.brand : ''}`}
              />
              <div className="flex flex-col items-center gap-1">
                <span className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium`}>
                  {isDragging
                    ? '파일을 여기에 놓으세요'
                    : `파일 선택 또는 드래그 앤 드롭${multiple ? ' (다중 선택 가능)' : ''} (최대 ${(maxSize / 1024 / 1024).toFixed(0)}MB)`}
                </span>
                {!isDragging && helpText && (
                  <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.muted}`}>
                    {helpText}
                  </span>
                )}
              </div>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={disabled}
            className={`w-full ${isMobile ? 'px-3 py-3' : 'px-6 py-4'} border-2 border-dashed ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary} ${TRANSITION_STYLES.colors} disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            <FaPaperclip className={isMobile ? 'text-sm' : 'text-base'} />
            <span className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium`}>
              파일 선택{multiple ? ' (다중 선택 가능)' : ''} (최대{' '}
              {(maxSize / 1024 / 1024).toFixed(0)}MB)
            </span>
          </button>
        )}

        {/* 선택된 파일 목록 */}
        {displayFiles.length > 0 && (
          <div className="space-y-2">
            {displayFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className={`flex items-center justify-between ${isMobile ? 'p-2' : 'p-4'} ${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default} ${TRANSITION_STYLES.colors}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FaPaperclip
                    className={`${TEXT_COLOR.muted} flex-shrink-0 ${isMobile ? 'text-sm' : 'text-base'}`}
                  />
                  <span
                    className={`${isMobile ? 'text-[12px]' : 'text-sm'} ${TEXT_COLOR.primary} truncate font-medium`}
                  >
                    {file.name}
                  </span>
                  <span
                    className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.muted} flex-shrink-0`}
                  >
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  disabled={disabled}
                  className={`${isMobile ? 'p-1.5' : 'p-2'} ${TEXT_COLOR.error} ${BG_COLOR.hoverError} rounded transition-colors disabled:opacity-50`}
                >
                  <FaTrash className={isMobile ? 'text-xs' : 'text-sm'} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
