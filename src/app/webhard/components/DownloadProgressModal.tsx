'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaDownload, FaCheck, FaTimes, FaSpinner, FaExchangeAlt, FaTrash } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

// ============================================================
// 공통 Progress Item 타입
// ============================================================
export interface ProgressItem {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

// 기존 호환성을 위한 DownloadItem 타입 (downloading status 포함)
export interface DownloadItem {
  id: string;
  name: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  error?: string;
}

// ============================================================
// 작업 타입별 설정
// ============================================================
export type OperationType = 'download' | 'move' | 'delete';

interface OperationConfig {
  icon: ReactNode;
  title: string;
  processingText: string;
  completedText: string;
  buttonProcessingText: string;
  accentColor: string;
}

const OPERATION_CONFIGS: Record<OperationType, OperationConfig> = {
  download: {
    icon: <FaDownload className="text-[#ED6C00]" />,
    title: '파일 다운로드',
    processingText: '다운로드 중...',
    completedText: '다운로드 완료',
    buttonProcessingText: '다운로드 중...',
    accentColor: 'bg-[#ED6C00]',
  },
  move: {
    icon: <FaExchangeAlt className="text-blue-500" />,
    title: '파일 이동',
    processingText: '이동 중...',
    completedText: '이동 완료',
    buttonProcessingText: '이동 중...',
    accentColor: 'bg-blue-500',
  },
  delete: {
    icon: <FaTrash className="text-red-500" />,
    title: '파일 삭제',
    processingText: '삭제 중...',
    completedText: '삭제 완료',
    buttonProcessingText: '삭제 중...',
    accentColor: 'bg-red-500',
  },
};

// ============================================================
// 공통 Progress Modal 컴포넌트
// ============================================================
interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ProgressItem[];
  totalCount: number;
  completedCount: number;
  isProcessing: boolean;
  operationType: OperationType;
  autoCloseDelay?: number; // ms, 기본값 500
}

export function ProgressModal({
  isOpen,
  onClose,
  items,
  totalCount,
  completedCount,
  isProcessing,
  operationType,
  autoCloseDelay = 500,
}: ProgressModalProps) {
  const config = OPERATION_CONFIGS[operationType];
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const canClose = !isProcessing;
  const autoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsProcessingRef = useRef(isProcessing);

  // 작업 완료 시 자동으로 모달 닫기
  useEffect(() => {
    // 처리 중 -> 완료 상태로 변경되었을 때만 자동 닫기
    if (prevIsProcessingRef.current && !isProcessing && isOpen && totalCount > 0) {
      autoCloseTimeoutRef.current = setTimeout(() => {
        onClose();
      }, autoCloseDelay);
    }

    prevIsProcessingRef.current = isProcessing;

    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
      }
    };
  }, [isProcessing, isOpen, totalCount, onClose, autoCloseDelay]);

  // 모달이 닫힐 때 타이머 정리
  useEffect(() => {
    if (!isOpen && autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
      autoCloseTimeoutRef.current = null;
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={canClose ? onClose : undefined}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            data-progress-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={`relative w-full max-w-md ${BG_COLOR.card} rounded-xl shadow-2xl overflow-hidden`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${BORDER_COLOR.default}`}
            >
              <div className="flex items-center gap-2">
                {config.icon}
                <h3 className={`text-base font-semibold ${TEXT_COLOR.primary}`}>{config.title}</h3>
              </div>
              {canClose && (
                <button
                  onClick={onClose}
                  className={`p-1.5 ${BG_COLOR.hoverMuted} rounded-lg transition-colors text-gray-500`}
                >
                  <FaTimes className="text-sm" />
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div className={`px-4 py-3 border-b ${BORDER_COLOR.default}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm ${TEXT_COLOR.secondary}`}>
                  {isProcessing ? config.processingText : config.completedText}
                </span>
                <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                  {completedCount} / {totalCount}
                </span>
              </div>
              <div className={`w-full ${BG_COLOR.muted} rounded-full h-2 overflow-hidden`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                  className={`h-full ${config.accentColor} rounded-full`}
                />
              </div>
            </div>

            {/* File List */}
            <div className="max-h-[300px] overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2 border-b ${BORDER_COLOR.light} last:border-b-0`}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {item.status === 'pending' && (
                      <div className={`w-5 h-5 rounded-full ${BG_COLOR.muted}`} />
                    )}
                    {item.status === 'processing' && (
                      <FaSpinner
                        className={`w-5 h-5 animate-spin ${
                          operationType === 'download'
                            ? 'text-[#ED6C00]'
                            : operationType === 'move'
                              ? 'text-blue-500'
                              : 'text-red-500'
                        }`}
                      />
                    )}
                    {item.status === 'completed' && (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <FaCheck className="text-white text-[10px]" />
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                        <FaTimes className="text-white text-[10px]" />
                      </div>
                    )}
                  </div>

                  {/* File Name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${
                        item.status === 'error'
                          ? 'text-red-500'
                          : item.status === 'completed'
                            ? TEXT_COLOR.success
                            : TEXT_COLOR.secondary
                      }`}
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    {item.error && <p className="text-xs text-red-400 truncate">{item.error}</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className={`flex items-center justify-end px-4 py-3 border-t ${BORDER_COLOR.default} ${BG_COLOR.page}`}
            >
              <button
                onClick={onClose}
                disabled={isProcessing}
                className={`px-4 py-2 text-sm rounded-lg transition-colors font-medium ${
                  isProcessing
                    ? `${BG_COLOR.muted} text-gray-500 cursor-not-allowed`
                    : `${config.accentColor} hover:opacity-90 text-white`
                }`}
              >
                {isProcessing ? config.buttonProcessingText : '닫기'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// 기존 호환성을 위한 DownloadProgressModal (ProgressModal 래퍼)
// ============================================================
interface DownloadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: DownloadItem[];
  totalCount: number;
  completedCount: number;
  isDownloading: boolean;
}

export function DownloadProgressModal({
  isOpen,
  onClose,
  items,
  totalCount,
  completedCount,
  isDownloading,
}: DownloadProgressModalProps) {
  // 기존 'downloading' status를 'processing'으로 변환
  const convertedItems: ProgressItem[] = items.map((item) => ({
    ...item,
    status: item.status === 'downloading' ? 'processing' : (item.status as ProgressItem['status']),
  }));

  return (
    <ProgressModal
      isOpen={isOpen}
      onClose={onClose}
      items={convertedItems}
      totalCount={totalCount}
      completedCount={completedCount}
      isProcessing={isDownloading}
      operationType="download"
    />
  );
}
