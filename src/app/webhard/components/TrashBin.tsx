'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTrash,
  FaUndo,
  FaFile,
  FaClock,
  FaExclamationTriangle,
  FaSpinner,
  FaTimes,
} from 'react-icons/fa';
import { useToast } from '@/hooks/useToast';
import { emptyTrashBatch, batchPermanentDeleteFiles } from '@/app/actions/webhard-batch-delete';
import { invalidateStorageUsage } from '@/app/webhard/_lib/cacheHelpers';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { PERMANENT_DELETE_APPROVAL } from '@/lib/api/permanent-delete-approval';

interface TrashFile {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number;
  uploaded_by: number | null;
  inquiry_number: string | null;
  is_downloaded: boolean;
  created_at: string;
  deleted_at: string;
  deleted_by: number | null;
  days_until_delete: number;
  company_name: string | null;
}

interface TrashBinProps {
  isOpen: boolean;
  onClose: () => void;
  userType: 'admin' | 'company';
}

// 파일 크기 포맷
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 날짜 포맷
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 파일 아이콘 색상
function getFileIconColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'text-purple-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-500';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'text-green-500';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return 'text-yellow-500';
  return 'text-gray-500';
}

export function TrashBin({ isOpen, onClose, userType }: TrashBinProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // 휴지통 파일 목록 조회 (관리자만 활성화)
  const { data: trashData, isLoading } = useQuery({
    queryKey: queryKeys.webhard.trash.all(),
    queryFn: async () => {
      const response = await fetch('/api/webhard/trash');
      if (!response.ok) throw new Error('Failed to fetch trash');
      return response.json() as Promise<{
        files: TrashFile[];
        pagination: { total: number };
      }>;
    },
    enabled: isOpen && userType === 'admin',
  });

  // 파일 복원 mutation
  const restoreMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/webhard/trash/${fileId}/restore`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to restore file');
      return response.json();
    },
    onSuccess: () => {
      success('성공', '파일이 복원되었습니다.');
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.trash.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.files.all() });
      invalidateStorageUsage(queryClient);
    },
    onError: () => {
      showError('오류', '파일 복원에 실패했습니다.');
    },
  });

  // 파일 영구 삭제 mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/webhard/trash/${fileId}/permanent-delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PERMANENT_DELETE_APPROVAL),
      });
      if (!response.ok) throw new Error('Failed to permanently delete file');
      return response.json();
    },
    onSuccess: () => {
      success('성공', '파일이 영구 삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.trash.all() });
    },
    onError: () => {
      showError('오류', '파일 영구 삭제에 실패했습니다.');
    },
  });

  // 휴지통 비우기 mutation (Server Action 사용 - 성능 최적화)
  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      return emptyTrashBatch();
    },
    onSuccess: (result) => {
      if (result.success) {
        const message = `${result.filesDeleted}개 파일이 영구 삭제되었습니다. (${result.durationMs}ms)`;
        success('성공', message);
        queryClient.invalidateQueries({ queryKey: queryKeys.webhard.trash.all() });
      } else {
        showError('오류', result.errors?.join(', ') || '휴지통 비우기에 실패했습니다.');
      }
    },
    onError: () => {
      showError('오류', '휴지통 비우기에 실패했습니다.');
    },
  });

  // 선택된 파일 일괄 복원
  const handleBulkRestore = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    for (const fileId of selectedFiles) {
      await restoreMutation.mutateAsync(fileId);
    }
    setSelectedFiles(new Set());
  }, [selectedFiles, restoreMutation]);

  // 선택된 파일 일괄 영구 삭제 (Server Action 사용 - 성능 최적화)
  const bulkDeleteMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      return batchPermanentDeleteFiles(fileIds);
    },
    onSuccess: (result) => {
      if (result.success) {
        const message = `${result.filesDeleted}개 파일이 영구 삭제되었습니다. (${result.durationMs}ms)`;
        success('성공', message);
        queryClient.invalidateQueries({ queryKey: queryKeys.webhard.trash.all() });
        setSelectedFiles(new Set());
      } else {
        showError('오류', result.errors?.join(', ') || '일괄 삭제에 실패했습니다.');
      }
    },
    onError: () => {
      showError('오류', '일괄 삭제에 실패했습니다.');
    },
  });

  const handleBulkDelete = useCallback(() => {
    if (selectedFiles.size === 0) return;

    if (
      !confirm(
        `선택한 ${selectedFiles.size}개 파일을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    bulkDeleteMutation.mutate(Array.from(selectedFiles));
  }, [selectedFiles, bulkDeleteMutation]);

  // 휴지통 비우기
  const handleEmptyTrash = useCallback(() => {
    if (
      !confirm(
        '휴지통을 비우시겠습니까? 모든 파일이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.'
      )
    ) {
      return;
    }
    emptyTrashMutation.mutate();
  }, [emptyTrashMutation]);

  // 파일 선택 토글
  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  }, []);

  // 전체 선택/해제
  const toggleSelectAll = useCallback(() => {
    if (!trashData?.files) return;

    if (selectedFiles.size === trashData.files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(trashData.files.map((f) => f.id)));
    }
  }, [trashData?.files, selectedFiles.size]);

  // 관리자만 휴지통 접근 가능
  if (userType !== 'admin') {
    return null;
  }

  const files = trashData?.files || [];
  const totalCount = trashData?.pagination?.total || 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* 모달 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed inset-4 md:inset-10 lg:inset-20 ${BG_COLOR.page} rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden`}
          >
            {/* 헤더 */}
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default}`}
            >
              <div className="flex items-center gap-3">
                <FaTrash className="text-xl text-red-500" />
                <div>
                  <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>휴지통</h2>
                  <p className={`text-xs ${TEXT_COLOR.muted}`}>
                    영구 삭제는 승인 후 휴지통 항목에만 실행됩니다
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
                aria-label="닫기"
              >
                <FaTimes className="text-gray-500" />
              </button>
            </div>

            {/* 툴바 */}
            <div
              className={`flex items-center justify-between px-6 py-3 ${BG_COLOR.page} border-b ${BORDER_COLOR.default}`}
            >
              <div className="flex items-center gap-4">
                <label className={`flex items-center gap-2 text-sm ${TEXT_COLOR.secondary}`}>
                  <input
                    type="checkbox"
                    checked={files.length > 0 && selectedFiles.size === files.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#ED6C00] focus:ring-[#ED6C00]"
                  />
                  전체 선택
                </label>
                <span className="text-sm text-gray-500">
                  {selectedFiles.size > 0 ? `${selectedFiles.size}개 선택됨` : `총 ${totalCount}개`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedFiles.size > 0 && (
                  <>
                    <button
                      onClick={handleBulkRestore}
                      disabled={restoreMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                    >
                      {restoreMutation.isPending ? (
                        <FaSpinner className="animate-spin" />
                      ) : (
                        <FaUndo />
                      )}
                      복원
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                    >
                      {bulkDeleteMutation.isPending ? (
                        <FaSpinner className="animate-spin" />
                      ) : (
                        <FaTrash />
                      )}
                      영구 삭제
                    </button>
                  </>
                )}
                <button
                  onClick={handleEmptyTrash}
                  disabled={files.length === 0 || emptyTrashMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                >
                  {emptyTrashMutation.isPending ? (
                    <FaSpinner className="animate-spin" />
                  ) : (
                    <FaTrash />
                  )}
                  휴지통 비우기
                </button>
              </div>
            </div>

            {/* 파일 목록 */}
            <div className="flex-1 overflow-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <FaSpinner className="text-2xl text-gray-400 animate-spin" />
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <FaTrash className="text-4xl mb-3 opacity-30" />
                  <p className="text-lg font-medium">휴지통이 비어 있습니다</p>
                  <p className="text-sm mt-1">삭제된 파일이 여기에 표시됩니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className={`flex items-center gap-4 p-4 ${BG_COLOR.card} border rounded-lg transition-colors ${
                        selectedFiles.has(file.id)
                          ? `border-[#ED6C00] ${BG_COLOR.brandLight}`
                          : `${BORDER_COLOR.default} hover:border-brand`
                      }`}
                    >
                      {/* 체크박스 */}
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="w-4 h-4 rounded border-gray-300 text-[#ED6C00] focus:ring-[#ED6C00]"
                      />

                      {/* 파일 아이콘 */}
                      <FaFile className={`text-lg ${getFileIconColor(file.mime_type)}`} />

                      {/* 파일 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`${TEXT_COLOR.primary} truncate`}>
                            {file.original_name}
                          </span>
                          {file.days_until_delete === 0 && (
                            <span
                              className={`flex items-center gap-1 px-2 py-0.5 text-xs ${BG_COLOR.error} ${TEXT_COLOR.error} rounded-full`}
                            >
                              <FaExclamationTriangle />
                              30일 이상 보관
                            </span>
                          )}
                        </div>
                        <div className={`flex items-center gap-4 mt-1 text-xs ${TEXT_COLOR.muted}`}>
                          <span>{formatFileSize(file.size)}</span>
                          {file.company_name && (
                            <span className="text-[#ED6C00]">{file.company_name}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <FaClock />
                            삭제: {formatDate(file.deleted_at)}
                          </span>
                          <span className="flex items-center gap-1 text-orange-500">
                            <FaClock />
                            30일 보관 기준 {file.days_until_delete}일 남음
                          </span>
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => restoreMutation.mutate(file.id)}
                          disabled={restoreMutation.isPending}
                          className={`p-2 ${BG_COLOR.hoverMuted} ${TEXT_COLOR.success} rounded-lg transition-colors`}
                          title="복원"
                        >
                          <FaUndo />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                '이 파일을 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
                              )
                            ) {
                              permanentDeleteMutation.mutate(file.id);
                            }
                          }}
                          disabled={permanentDeleteMutation.isPending}
                          className={`p-2 ${BG_COLOR.hoverError} ${TEXT_COLOR.error} rounded-lg transition-colors`}
                          title="영구 삭제"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
