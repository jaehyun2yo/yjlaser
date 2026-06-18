'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTrash, FaTimes, FaCheck, FaFolder, FaFile } from 'react-icons/fa';
import { BORDER_COLOR, MODAL, TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';

export interface DeleteTarget {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

type DeletePhase = 'confirm' | 'processing' | 'completed' | 'error';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  targets: DeleteTarget[];
  onConfirm: (
    onProgress: (percent: number) => void
  ) => Promise<{ success: boolean; message?: string }>;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  targets,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [phase, setPhase] = useState<DeletePhase>('confirm');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const autoCloseRef = useRef<NodeJS.Timeout | null>(null);

  const fileCount = targets.filter((t) => t.type === 'file').length;
  const folderCount = targets.filter((t) => t.type === 'folder').length;
  const totalCount = targets.length;

  useEffect(() => {
    if (isOpen) {
      setPhase('confirm');
      setErrorMessage('');
      setProgress(0);
    }
    return () => {
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
      }
    };
  }, [isOpen]);

  const handleConfirm = async () => {
    setPhase('processing');
    setProgress(0);
    try {
      const result = await onConfirm((p) => setProgress(Math.min(100, Math.round(p))));
      if (result.success) {
        setProgress(100);
        setPhase('completed');
        autoCloseRef.current = setTimeout(() => onClose(), 1200);
      } else {
        setPhase('error');
        setErrorMessage(result.message || '삭제에 실패했습니다.');
      }
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    }
  };

  const handleClose = () => {
    if (phase === 'processing') return;
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
    }
    onClose();
  };

  const getDescription = () => {
    const parts: string[] = [];
    if (folderCount > 0) parts.push(`폴더 ${folderCount}개`);
    if (fileCount > 0) parts.push(`파일 ${fileCount}개`);
    return parts.join(', ');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`${MODAL.overlay} p-4`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="webhard-delete-confirm-title"
            className={`${MODAL.container} relative !max-w-sm overflow-hidden`}
          >
            {phase === 'confirm' && (
              <>
                <div className={MODAL.body}>
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={`w-14 h-14 rounded-full ${BG_COLOR.error} flex items-center justify-center`}
                    >
                      <FaTrash className="text-red-500 text-xl" />
                    </div>
                    <h3
                      id="webhard-delete-confirm-title"
                      className={`text-lg font-semibold ${TEXT_COLOR.primary}`}
                    >
                      삭제하시겠습니까?
                    </h3>
                    <p className={`text-sm ${TEXT_COLOR.muted} text-center`}>
                      {getDescription()}를 삭제합니다.
                      {folderCount > 0 && (
                        <span className={`block mt-1 ${TEXT_COLOR.error} text-xs`}>
                          폴더 내 모든 파일이 함께 삭제됩니다.
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {totalCount <= 5 && (
                  <div
                    className={`mx-4 sm:mx-6 mb-4 border ${BORDER_COLOR.default} rounded-lg overflow-hidden`}
                  >
                    {targets.map((target) => (
                      <div
                        key={`${target.type}-${target.id}`}
                        className={`flex items-center gap-2 px-3 py-2 text-sm ${TEXT_COLOR.secondary} border-b ${BORDER_COLOR.default} last:border-b-0`}
                      >
                        {target.type === 'folder' ? (
                          <FaFolder className="text-amber-500 text-xs flex-shrink-0" />
                        ) : (
                          <FaFile className="text-gray-400 text-xs flex-shrink-0" />
                        )}
                        <span className="truncate">{target.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className={`${MODAL.footer} !justify-center`}>
                  <Button variant="ghost" onClick={handleClose} className="flex-1 !py-2.5 !px-4">
                    취소
                  </Button>
                  <Button variant="danger" onClick={handleConfirm} className="flex-1 !py-2.5 !px-4">
                    삭제
                  </Button>
                </div>
              </>
            )}

            {phase === 'processing' && (
              <div className={MODAL.body}>
                <div className="flex flex-col items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-full ${BG_COLOR.error} flex items-center justify-center`}
                  >
                    <FaTrash className="text-red-500 text-xl animate-pulse" />
                  </div>
                  <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>삭제 중...</h3>
                  <p className={`text-sm ${TEXT_COLOR.muted}`}>{getDescription()} 처리 중</p>

                  <div className="w-full max-w-[240px]">
                    <div className="flex justify-between mb-1">
                      <span className={`text-xs ${TEXT_COLOR.muted}`}>진행률</span>
                      <span className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                        {progress}%
                      </span>
                    </div>
                    <div className={`w-full ${BG_COLOR.muted} rounded-full h-2 overflow-hidden`}>
                      <motion.div
                        className="h-full bg-red-500 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === 'completed' && (
              <div className={MODAL.body}>
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={`w-14 h-14 rounded-full ${BG_COLOR.success} flex items-center justify-center`}
                  >
                    <FaCheck className="text-green-500 text-xl" />
                  </motion.div>
                  <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>삭제 완료</h3>
                  <p className={`text-sm ${TEXT_COLOR.muted}`}>
                    {getDescription()}가 삭제되었습니다.
                  </p>
                </div>
              </div>
            )}

            {phase === 'error' && (
              <>
                <div className={MODAL.body}>
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={`w-14 h-14 rounded-full ${BG_COLOR.error} flex items-center justify-center`}
                    >
                      <FaTimes className="text-red-500 text-xl" />
                    </div>
                    <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>삭제 실패</h3>
                    <p className={`text-sm ${TEXT_COLOR.muted} text-center`}>{errorMessage}</p>
                  </div>
                </div>
                <div className={`${MODAL.footer} !justify-center`}>
                  <Button variant="ghost" onClick={handleClose} className="!py-2.5 !px-6">
                    닫기
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
