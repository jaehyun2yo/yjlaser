'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FaTimes,
  FaFolder,
  FaCheck,
  FaExclamationTriangle,
  FaSpinner,
  FaCloudUploadAlt,
  FaBuilding,
} from 'react-icons/fa';
import { createPortal } from 'react-dom';
import { createFolderStructureAction } from '@/app/actions/webhard-folder-upload';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { uploadFilesBatch } from '@/lib/utils/uploadQueue';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface Company {
  id: number;
  company_name: string;
}

interface FolderUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetFolderId: string | null;
  onUploadComplete: () => void;
  userType: 'admin' | 'company';
  /** 드래그 앤 드롭으로 전달된 초기 파일 목록 */
  initialFiles?: FileWithPath[];
}

export interface FileWithPath {
  file: File;
  relativePath: string;
}

interface UploadState {
  status: 'idle' | 'preparing' | 'creating-folders' | 'uploading' | 'completed' | 'error';
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  createdFolders: string[];
  failedFiles: string[];
  errorMessage?: string;
}

type FolderUploadGroup = {
  folderId: string;
  folderFiles: FileWithPath[];
};

const FOLDER_UPLOAD_GROUP_CONCURRENCY = 3;

async function runFolderUploadsWithConcurrency(
  groups: FolderUploadGroup[],
  concurrency: number,
  signal: AbortSignal | undefined,
  uploadGroup: (group: FolderUploadGroup) => Promise<void>
): Promise<void> {
  let nextGroupIndex = 0;
  const workerCount = Math.min(concurrency, groups.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextGroupIndex < groups.length) {
        if (signal?.aborted) {
          return;
        }

        const group = groups[nextGroupIndex];
        nextGroupIndex++;
        await uploadGroup(group);
      }
    })
  );
}

export function FolderUploadModal({
  isOpen,
  onClose,
  targetFolderId,
  onUploadComplete,
  userType,
  initialFiles,
}: FolderUploadModalProps) {
  const [files, setFiles] = useState<FileWithPath[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    createdFolders: [],
    failedFiles: [],
  });

  const folderInputRef = useRef<HTMLInputElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 관리자일 때 업체 목록 가져오기
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: queryKeys.companies.lists(),
    queryFn: async () => {
      const response = await fetch('/api/companies');
      if (!response.ok) throw new Error('Failed to fetch companies');
      const result = await response.json();
      return result.data || [];
    },
    enabled: isOpen && userType === 'admin' && !targetFolderId,
  });

  // 모달 닫기 시 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setSelectedCompanyId(null);
      setUploadState({
        status: 'idle',
        totalFiles: 0,
        processedFiles: 0,
        currentFile: '',
        createdFolders: [],
        failedFiles: [],
      });
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen]);

  // 드래그 앤 드롭으로 전달된 initialFiles 설정
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      setFiles(initialFiles);
    }
  }, [isOpen, initialFiles]);

  // 폴더 선택 핸들러
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesWithPaths: FileWithPath[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // webkitRelativePath는 폴더 선택 시 제공되는 상대 경로
      const relativePath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

      // 빈 파일은 제외하지만 경고는 나중에 표시
      filesWithPaths.push({
        file,
        relativePath,
      });
    }

    setFiles(filesWithPaths);

    // input 초기화
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  }, []);

  // 업로드 시작
  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;

    // 빈 파일 필터링
    const validFiles = files.filter((f) => f.file.size > 0);
    const emptyFiles = files.filter((f) => f.file.size === 0);

    if (validFiles.length === 0) {
      setUploadState({
        status: 'error',
        totalFiles: files.length,
        processedFiles: 0,
        currentFile: '',
        createdFolders: [],
        failedFiles: emptyFiles.map((f) => `${f.relativePath} (빈 파일)`),
        errorMessage: '업로드할 수 있는 파일이 없습니다.',
      });
      return;
    }

    abortControllerRef.current = new AbortController();

    setUploadState({
      status: 'preparing',
      totalFiles: validFiles.length,
      processedFiles: 0,
      currentFile: '파일 준비 중...',
      createdFolders: [],
      failedFiles: emptyFiles.map((f) => `${f.relativePath} (빈 파일)`),
    });

    try {
      // 1. 폴더 구조 추출
      const folderPaths = new Set<string>();
      for (const { relativePath } of validFiles) {
        const parts = relativePath.split('/');
        let path = '';
        for (let i = 0; i < parts.length - 1; i++) {
          path = path ? `${path}/${parts[i]}` : parts[i];
          folderPaths.add(path);
        }
      }

      // 2. 폴더 구조 생성
      setUploadState((prev) => ({
        ...prev,
        status: 'creating-folders',
        currentFile: '폴더 구조 생성 중...',
      }));

      const folderFormData = new FormData();
      folderFormData.append('folderPaths', JSON.stringify(Array.from(folderPaths)));
      if (targetFolderId) {
        folderFormData.append('targetFolderId', targetFolderId);
      }
      // 관리자가 업체를 선택한 경우 companyId 추가
      if (selectedCompanyId) {
        folderFormData.append('companyId', String(selectedCompanyId));
      }

      const folderResult = await createFolderStructureAction(folderFormData);

      if (!folderResult.success) {
        setUploadState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: folderResult.error || '폴더 구조 생성 실패',
        }));
        return;
      }

      setUploadState((prev) => ({
        ...prev,
        createdFolders: Object.keys(folderResult.folderMap),
      }));

      // 3. 파일 업로드: 브라우저에서 R2로 직접 전송하고 서버에는 메타데이터만 확정
      setUploadState((prev) => ({
        ...prev,
        status: 'uploading',
        currentFile: '',
      }));

      const failedFiles: string[] = [...emptyFiles.map((f) => `${f.relativePath} (빈 파일)`)];
      let processedCount = 0;
      const relativePathsByFolderAndName = new Map<string, Map<string, string[]>>();
      const completedRelativePaths = new Set<string>();
      const filesByFolderId = new Map<string, FileWithPath[]>();

      for (const fileWithPath of validFiles) {
        const { file, relativePath } = fileWithPath;
        const pathParts = relativePath.split('/');
        const folderPath = pathParts.slice(0, -1).join('/');
        const folderId = folderPath ? folderResult.folderMap[folderPath] : targetFolderId;

        if (!folderId) {
          processedCount++;
          failedFiles.push(`${relativePath} (업로드 대상 폴더를 찾을 수 없습니다.)`);
          continue;
        }

        const folderRelativePaths = relativePathsByFolderAndName.get(folderId) ?? new Map();
        const relativePaths = folderRelativePaths.get(file.name) ?? [];
        relativePaths.push(relativePath);
        folderRelativePaths.set(file.name, relativePaths);
        relativePathsByFolderAndName.set(folderId, folderRelativePaths);

        const folderFiles = filesByFolderId.get(folderId) ?? [];
        folderFiles.push(fileWithPath);
        filesByFolderId.set(folderId, folderFiles);
      }

      const takeRelativePath = (folderId: string, fileName: string): string => {
        const paths = relativePathsByFolderAndName.get(folderId)?.get(fileName);
        if (!paths || paths.length === 0) {
          return fileName;
        }
        const [relativePath, ...rest] = paths;
        relativePathsByFolderAndName.get(folderId)?.set(fileName, rest);
        return relativePath;
      };

      const recordFileComplete = (
        folderId: string,
        fileName: string,
        success: boolean,
        errorMessage?: string
      ): void => {
        const relativePath = takeRelativePath(folderId, fileName);
        completedRelativePaths.add(relativePath);
        processedCount++;
        if (!success) {
          failedFiles.push(`${relativePath} (${errorMessage || '업로드 실패'})`);
        }
        setUploadState((prev) => ({
          ...prev,
          processedFiles: processedCount,
          currentFile: relativePath,
        }));
      };

      if (processedCount > 0) {
        setUploadState((prev) => ({
          ...prev,
          processedFiles: processedCount,
          failedFiles,
        }));
      }

      const folderUploadGroups: FolderUploadGroup[] = Array.from(
        filesByFolderId,
        ([folderId, folderFiles]) => ({
          folderId,
          folderFiles,
        })
      );

      await runFolderUploadsWithConcurrency(
        folderUploadGroups,
        FOLDER_UPLOAD_GROUP_CONCURRENCY,
        abortControllerRef.current?.signal,
        async ({ folderId, folderFiles }) => {
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }

          try {
            const result = await uploadFilesBatch(
              folderFiles.map((item) => item.file),
              {
                folderId,
                signal: abortControllerRef.current?.signal,
                onProgress: (fileName) => {
                  setUploadState((prev) => ({
                    ...prev,
                    currentFile: fileName,
                  }));
                },
                onFileComplete: (fileName, success, errorMessage) =>
                  recordFileComplete(folderId, fileName, success, errorMessage),
              }
            );

            for (const batchError of result.errors) {
              const remainingPaths = relativePathsByFolderAndName
                .get(folderId)
                ?.get(batchError.fileName);
              if (remainingPaths && remainingPaths.length > 0) {
                recordFileComplete(folderId, batchError.fileName, false, batchError.error);
              }
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '업로드 실패';
            for (const { relativePath } of folderFiles) {
              if (completedRelativePaths.has(relativePath)) continue;
              completedRelativePaths.add(relativePath);
              processedCount++;
              failedFiles.push(`${relativePath} (${errorMessage})`);
            }
            setUploadState((prev) => ({
              ...prev,
              processedFiles: processedCount,
              failedFiles,
            }));
          }
        }
      );

      // 4. 완료
      setUploadState((prev) => ({
        ...prev,
        status: 'completed',
        failedFiles,
        currentFile: '',
      }));

      // 파일 목록 새로고침
      onUploadComplete();
    } catch (error) {
      setUploadState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.',
      }));
    }
  }, [files, targetFolderId, selectedCompanyId, onUploadComplete]);

  // 취소 핸들러
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || uploadState.status !== 'idle') return;

    const getFocusableElements = (): HTMLElement[] => {
      const panel = modalPanelRef.current;
      if (!panel) return [];

      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])',
          ].join(',')
        )
      ).filter((element) => !element.classList.contains('hidden'));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const focusTimer = window.setTimeout(() => {
      getFocusableElements()[0]?.focus();
    }, 0);

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCancel, isOpen, uploadState.status]);

  if (!isOpen) return null;

  const progressPercentage =
    uploadState.totalFiles > 0
      ? Math.round((uploadState.processedFiles / uploadState.totalFiles) * 100)
      : 0;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={uploadState.status === 'idle' ? handleCancel : undefined}
      />

      {/* 모달 컨텐츠 */}
      <div
        ref={modalPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-upload-title"
        className={`relative ${BG_COLOR.card} rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col`}
      >
        {/* 헤더 */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.default}`}
        >
          <h3
            id="folder-upload-title"
            className={`text-lg font-semibold ${TEXT_COLOR.primary} flex items-center gap-2`}
          >
            <FaFolder className="text-brand" />
            폴더 업로드
          </h3>
          {uploadState.status === 'idle' && (
            <button
              onClick={handleCancel}
              aria-label="폴더 업로드 닫기"
              className={`p-1.5 ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} rounded-lg`}
            >
              <FaTimes />
            </button>
          )}
        </div>

        {/* 본문 */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* 관리자이고 대상 폴더가 선택되지 않은 경우 업체 선택 드롭다운 표시 (필수) */}
          {userType === 'admin' && !targetFolderId && uploadState.status === 'idle' && (
            <div className="mb-4">
              <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                <FaBuilding className="inline mr-2 text-brand" />
                업로드할 업체 선택 <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCompanyId || ''}
                onChange={(e) =>
                  setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)
                }
                className={`w-full px-3 py-2 border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:ring-2 focus:ring-brand focus:border-transparent`}
              >
                <option value="">업체를 선택하세요</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.company_name}
                  </option>
                ))}
              </select>
              <p className={`mt-2 text-xs ${TEXT_COLOR.muted}`}>
                선택한 업체의 루트 폴더에 업로드됩니다.
              </p>
            </div>
          )}

          {uploadState.status === 'idle' && (
            <>
              {files.length === 0 ? (
                <div className="text-center py-8">
                  <label className="cursor-pointer">
                    <div
                      className={`border-2 border-dashed ${BORDER_COLOR.default} rounded-lg p-8 hover:border-brand transition-colors`}
                    >
                      <FaCloudUploadAlt
                        className={`mx-auto text-4xl ${TEXT_COLOR.disabled} mb-3`}
                      />
                      <p className={`${TEXT_COLOR.secondary} mb-1`}>폴더를 선택하세요</p>
                      <p className={`text-sm ${TEXT_COLOR.muted}`}>폴더 구조가 그대로 유지됩니다</p>
                    </div>
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-expect-error - webkitdirectory는 표준 속성이 아니지만 대부분 브라우저에서 지원
                      webkitdirectory="true"
                      directory=""
                      multiple
                      onChange={handleFolderSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div>
                  <div className={`mb-4 p-3 ${BG_COLOR.muted} rounded-lg`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                        선택된 파일
                      </span>
                      <span className="text-sm text-brand font-semibold">{files.length}개</span>
                    </div>
                    <div className={`text-xs ${TEXT_COLOR.muted}`}>
                      총 크기:{' '}
                      {(files.reduce((sum, f) => sum + f.file.size, 0) / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>

                  {/* 파일 목록 미리보기 (최대 10개) */}
                  <div className="max-h-40 overflow-y-auto mb-4 text-sm">
                    {files.slice(0, 10).map((f, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 py-1 ${TEXT_COLOR.secondary}`}
                      >
                        <FaFolder className="text-xs text-gray-400" />
                        <span className="truncate">{f.relativePath}</span>
                      </div>
                    ))}
                    {files.length > 10 && (
                      <div className={`${TEXT_COLOR.muted} py-1`}>
                        ... 외 {files.length - 10}개 파일
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setFiles([])}
                    className={`text-sm ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} px-2 py-1 rounded`}
                  >
                    다른 폴더 선택
                  </button>
                </div>
              )}
            </>
          )}

          {/* 진행 상태 */}
          {(uploadState.status === 'preparing' ||
            uploadState.status === 'creating-folders' ||
            uploadState.status === 'uploading') && (
            <div className="py-4">
              <div className="flex items-center gap-3 mb-4">
                <FaSpinner className="text-brand animate-spin" />
                <span className={TEXT_COLOR.secondary}>
                  {uploadState.status === 'preparing' && '파일 준비 중...'}
                  {uploadState.status === 'creating-folders' && '폴더 구조 생성 중...'}
                  {uploadState.status === 'uploading' && '파일 업로드 중...'}
                </span>
              </div>

              {uploadState.status === 'uploading' && (
                <>
                  <div className={`w-full ${BG_COLOR.muted} rounded-full h-2 mb-2`}>
                    <div
                      className="bg-brand h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                  <div className={`flex justify-between text-sm ${TEXT_COLOR.muted}`}>
                    <span>
                      {uploadState.processedFiles} / {uploadState.totalFiles} 파일
                    </span>
                    <span>{progressPercentage}%</span>
                  </div>
                  {uploadState.currentFile && (
                    <div className={`mt-2 text-xs ${TEXT_COLOR.muted} truncate`}>
                      현재: {uploadState.currentFile}
                    </div>
                  )}
                </>
              )}

              {uploadState.createdFolders.length > 0 && (
                <div className={`mt-4 text-xs ${TEXT_COLOR.muted}`}>
                  생성된 폴더: {uploadState.createdFolders.length}개
                </div>
              )}
            </div>
          )}

          {/* 완료 상태 */}
          {uploadState.status === 'completed' && (
            <div className="py-4">
              <div className={`flex items-center gap-3 mb-4 ${TEXT_COLOR.success}`}>
                <FaCheck className="text-lg" />
                <span className="font-medium">업로드 완료!</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className={TEXT_COLOR.secondary}>
                  총 {uploadState.processedFiles}개 파일 업로드
                </div>
                {uploadState.createdFolders.length > 0 && (
                  <div className={TEXT_COLOR.secondary}>
                    {uploadState.createdFolders.length}개 폴더 생성
                  </div>
                )}
              </div>

              {uploadState.failedFiles.length > 0 && (
                <div className={`mt-4 p-3 ${BG_COLOR.error} rounded-lg`}>
                  <div className={`flex items-center gap-2 ${TEXT_COLOR.error} mb-2`}>
                    <FaExclamationTriangle />
                    <span className="font-medium">
                      실패한 파일 ({uploadState.failedFiles.length}개)
                    </span>
                  </div>
                  <div className={`max-h-32 overflow-y-auto text-xs ${TEXT_COLOR.error}`}>
                    {uploadState.failedFiles.map((file, i) => (
                      <div key={i} className="py-0.5 truncate">
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 에러 상태 */}
          {uploadState.status === 'error' && (
            <div className="py-4">
              <div className={`flex items-center gap-3 mb-4 ${TEXT_COLOR.error}`}>
                <FaExclamationTriangle className="text-lg" />
                <span className="font-medium">오류 발생</span>
              </div>
              <p className={`text-sm ${TEXT_COLOR.secondary}`}>
                {uploadState.errorMessage || '업로드 중 오류가 발생했습니다.'}
              </p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div
          className={`flex justify-end gap-2 px-4 py-3 border-t ${BORDER_COLOR.default} ${BG_COLOR.card}`}
        >
          {uploadState.status === 'idle' && (
            <>
              <button
                onClick={handleCancel}
                className={`px-4 py-2 text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.hoverMuted}`}
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={
                  files.length === 0 ||
                  (userType === 'admin' && !targetFolderId && !selectedCompanyId)
                }
                className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover disabled:bg-muted disabled:cursor-not-allowed"
              >
                업로드 시작
              </button>
            </>
          )}

          {(uploadState.status === 'preparing' ||
            uploadState.status === 'creating-folders' ||
            uploadState.status === 'uploading') && (
            <button
              onClick={handleCancel}
              className={`px-4 py-2 text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.hoverMuted}`}
            >
              취소
            </button>
          )}

          {(uploadState.status === 'completed' || uploadState.status === 'error') && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (!portalMounted) return null;
  return createPortal(modalContent, document.body);
}
