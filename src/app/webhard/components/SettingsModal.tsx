'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaCog, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import { useWebhardSettingsStore, type FontSize } from '@/store/webhardSettingsStore';
import { logger } from '@/lib/utils/logger';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

const log = logger.createLogger('SettingsModal');

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Array<{ id: string; name: string; parent_id: string | null }>;
}

const fontSizeOptions: { value: FontSize; label: string; desc: string }[] = [
  { value: 'small', label: '소 (13px)', desc: '작음' },
  { value: 'medium', label: '중 (14px)', desc: '중간' },
  { value: 'large', label: '대 (16px)', desc: '큼' },
];

export function SettingsModal({ isOpen, onClose, folders }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'download' | 'display' | 'notification'>('display');
  const downloadFolder = useWebhardSettingsStore((state) => state.downloadFolder);
  const fontSize = useWebhardSettingsStore((state) => state.fontSize);
  const notificationsEnabled = useWebhardSettingsStore((state) => state.notificationsEnabled);
  const setDownloadFolder = useWebhardSettingsStore((state) => state.setDownloadFolder);
  const setFontSize = useWebhardSettingsStore((state) => state.setFontSize);
  const setNotificationsEnabled = useWebhardSettingsStore((state) => state.setNotificationsEnabled);

  const modalRef = useRef<HTMLDivElement>(null);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // 실제 웹하드 폴더만 필터링 (루트 폴더 제외, 리프 폴더만 표시)
  const webhardFolders = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const parentIds = new Set(folders.map((f) => f.parent_id).filter(Boolean));

    // 루트 폴더(parent_id가 null)를 제외하고 자식이 없는 폴더만 반환
    // "내리기", "완료함" 폴더 제외
    return folders.filter(
      (f) =>
        f.parent_id !== null && !parentIds.has(f.id) && f.name !== '내리기' && f.name !== '완료함'
    );
  }, [folders]);

  const selectedFolderName =
    webhardFolders.find((f) => f.id === downloadFolder)?.name ||
    (downloadFolder?.startsWith('LOCAL:') ? downloadFolder.replace('LOCAL:', '') : '지정하지 않음');

  const handleSelectLocalFolder = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if (typeof win.showDirectoryPicker === 'function') {
        const handle = await win.showDirectoryPicker();
        setDownloadFolder(`LOCAL:${handle.name}`, handle);
      } else {
        alert('이 브라우저는 폴더 선택을 지원하지 않습니다. (모바일 미지원)');
      }
    } catch (err) {
      log.error('Failed to select folder:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`relative w-full max-w-md ${BG_COLOR.card} rounded-xl shadow-2xl overflow-hidden`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default}`}
            >
              <div className="flex items-center gap-2">
                <FaCog className="text-[#ED6C00]" />
                <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>웹하드 설정</h2>
              </div>
              <button
                onClick={onClose}
                className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors text-gray-500`}
              >
                <FaTimes />
              </button>
            </div>

            {/* Tabs */}
            <div className={`flex border-b ${BORDER_COLOR.default}`}>
              {[
                { id: 'display' as const, label: '화면' },
                { id: 'download' as const, label: '다운로드' },
                { id: 'notification' as const, label: '알림' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? `text-[#ED6C00] border-[#ED6C00] ${BG_COLOR.orangeTabSelected}`
                      : `${TEXT_COLOR.secondary} border-transparent ${TEXT_COLOR.hoverPrimary}`
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Display Tab */}
              <AnimatePresence mode="wait">
                {activeTab === 'display' && (
                  <motion.div
                    key="display"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-3`}>
                        글자 크기
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {fontSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setFontSize(option.value)}
                            className={`py-3 px-2 rounded-lg border-2 transition-colors font-medium text-center ${
                              fontSize === option.value
                                ? `border-[#ED6C00] ${BG_COLOR.orangeWarm} ${TEXT_COLOR.brand}`
                                : `${BORDER_COLOR.default} ${BG_COLOR.muted} ${TEXT_COLOR.secondary} hover:border-brand`
                            }`}
                          >
                            <div className="text-lg">{option.label}</div>
                            <div className={`text-xs ${TEXT_COLOR.muted} mt-1`}>{option.desc}</div>
                          </button>
                        ))}
                      </div>
                      <div className={`mt-3 p-3 ${BG_COLOR.grayHalf} rounded-lg`}>
                        <p
                          className={`${
                            fontSize === 'small'
                              ? 'text-xs'
                              : fontSize === 'large'
                                ? 'text-base'
                                : 'text-sm'
                          } ${TEXT_COLOR.secondary}`}
                        >
                          미리보기: 이렇게 보입니다
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Download Tab */}
                {activeTab === 'download' && (
                  <motion.div
                    key="download"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-3`}>
                        기본 다운로드 폴더
                      </label>
                      <p className={`text-xs ${TEXT_COLOR.muted} mb-3`}>
                        파일을 다운로드하면 지정된 폴더로 이동합니다.
                      </p>
                      <div className="space-y-2">
                        <button
                          onClick={() => setDownloadFolder(null)}
                          className={`w-full py-2 px-3 rounded-lg border-2 text-sm transition-colors text-left ${
                            downloadFolder === null
                              ? `border-[#ED6C00] ${BG_COLOR.orangeWarm} ${TEXT_COLOR.brand} font-medium`
                              : `${BORDER_COLOR.default} ${BG_COLOR.muted} ${TEXT_COLOR.secondary} hover:border-brand`
                          }`}
                        >
                          지정하지 않음
                        </button>
                        <button
                          onClick={handleSelectLocalFolder}
                          className={`w-full py-2 px-3 rounded-lg border-2 text-sm transition-colors text-left ${
                            downloadFolder?.startsWith('LOCAL:')
                              ? `border-[#ED6C00] ${BG_COLOR.orangeWarm} ${TEXT_COLOR.brand} font-medium`
                              : `${BORDER_COLOR.default} ${BG_COLOR.muted} ${TEXT_COLOR.secondary} hover:border-brand`
                          }`}
                        >
                          내 컴퓨터에서 선택
                        </button>
                        {webhardFolders.length > 0 && (
                          <div
                            className={`border ${BORDER_COLOR.default} rounded-lg max-h-48 overflow-y-auto`}
                          >
                            {webhardFolders.map((folder) => (
                              <button
                                key={folder.id}
                                onClick={() => setDownloadFolder(folder.id)}
                                className={`w-full py-2 px-3 text-sm text-left border-b ${BORDER_COLOR.default} last:border-b-0 transition-colors ${
                                  downloadFolder === folder.id
                                    ? `${BG_COLOR.orangeWarm} ${TEXT_COLOR.brand} font-medium`
                                    : `${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary}`
                                }`}
                              >
                                {folder.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className={`text-xs ${TEXT_COLOR.muted} mt-3`}>
                        현재 선택:{' '}
                        <span className={`font-medium ${TEXT_COLOR.secondary}`}>
                          {selectedFolderName}
                        </span>
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Notification Tab */}
                {activeTab === 'notification' && (
                  <motion.div
                    key="notification"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div
                      className={`flex items-center justify-between p-4 rounded-lg ${BG_COLOR.grayHalf} border ${BORDER_COLOR.medium}`}
                    >
                      <div>
                        <p className={`font-medium ${TEXT_COLOR.primary}`}>파일 업로드 알림</p>
                        <p className={`text-xs ${TEXT_COLOR.muted} mt-1`}>
                          {notificationsEnabled
                            ? '새로운 파일이 업로드되면 알림을 받습니다'
                            : '알림이 비활성화되어 있습니다'}
                        </p>
                      </div>
                      <button
                        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                        className="text-2xl transition-colors"
                        title={notificationsEnabled ? '알림 끄기' : '알림 켜기'}
                      >
                        {notificationsEnabled ? (
                          <FaToggleOn className="text-[#ED6C00]" />
                        ) : (
                          <FaToggleOff className="text-gray-400" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
