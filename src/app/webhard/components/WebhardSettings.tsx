'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaCog,
  FaTimes,
  FaFolder,
  FaCheck,
  FaExclamationTriangle,
  FaSync,
  FaTrash,
} from 'react-icons/fa';
import { useWebhardFolder } from '@/store/webhard-folder';
import { useWebhardSettings, type WebhardSettingsState } from '@/lib/hooks/useWebhardSettings';
import { logger } from '@/lib/utils/logger';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

const log = logger.createLogger('WebhardSettings');

interface WebhardSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WebhardSettings({ isOpen, onClose }: WebhardSettingsProps) {
  // React Query 훅 사용 (캐싱으로 중복 API 호출 방지)
  const { settings: cachedSettings, isLoading, saveSettings: saveToServer } = useWebhardSettings();

  // 로컬 상태 (모달 내에서 수정 중인 설정)
  const [localSettings, setLocalSettings] = useState<WebhardSettingsState>(cachedSettings);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [isFolderPickerActive, setIsFolderPickerActive] = useState(false);
  const [isRestoringHandle, setIsRestoringHandle] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const {
    isDownloadFolderSupported,
    folderName,
    permissionStatus,
    isHandleLoaded,
    saveFolderHandleToStorage,
    clearFolderHandle,
    restoreFolderHandle,
    requestPermission,
  } = useWebhardFolder();

  // 캐시된 설정이 변경되면 로컬 상태 동기화
  useEffect(() => {
    setLocalSettings(cachedSettings);
  }, [cachedSettings]);

  // 모달 열릴 때 IndexedDB에서 폴더 핸들 복원 시도
  useEffect(() => {
    if (isOpen && !isHandleLoaded) {
      setIsRestoringHandle(true);
      restoreFolderHandle().finally(() => {
        setIsRestoringHandle(false);
      });
    }
  }, [isOpen, isHandleLoaded, restoreFolderHandle]);

  /**
   * 설정 저장 (React Query mutation 사용)
   */
  const saveSettings = async (newSettings: WebhardSettingsState) => {
    setSaveStatus('saving');
    setError(null);

    try {
      await saveToServer(newSettings);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setError('설정 저장 실패');
      setSaveStatus('idle');
    }
  };

  /**
   * 설정 변경 처리 (디바운스 저장)
   */
  const handleSettingChange = <K extends keyof WebhardSettingsState>(
    key: K,
    value: WebhardSettingsState[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);

    // 이전 타이머 취소
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 500ms 후 자동 저장 (서버에 저장)
    saveTimeoutRef.current = setTimeout(() => {
      saveSettings(newSettings);
    }, 500);
  };

  /**
   * 폴더 선택 (File System Access API)
   * Chrome, Edge, Opera 등 Chromium 기반 브라우저 지원
   */
  const handleFolderPicker = async () => {
    // 이미 폴더 선택 진행 중이면 return
    if (isFolderPickerActive) {
      return;
    }

    // 브라우저가 API를 지원하지 않는 경우
    if (!isDownloadFolderSupported) {
      setError(
        'File System Access API를 지원하지 않는 브라우저입니다.\n' +
          'Chrome, Edge, Opera 최신 버전을 사용해주세요.'
      );
      return;
    }

    setIsFolderPickerActive(true);
    setError(null);

    try {
      const dirHandle = await window.showDirectoryPicker();

      // ✅ Store + IndexedDB에 folderHandle 저장
      await saveFolderHandleToStorage(dirHandle);

      // 폴더 경로 업데이트
      const newSettings = { ...localSettings, downloadFolderPath: dirHandle.name };
      setLocalSettings(newSettings);

      // 자동 저장
      await saveSettings(newSettings);
    } catch (err) {
      // 사용자가 취소한 경우
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      log.error('Folder picker error:', err);
      setError('폴더 선택에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsFolderPickerActive(false);
    }
  };

  /**
   * 폴더 설정 초기화
   */
  const handleClearFolder = async () => {
    await clearFolderHandle();

    const newSettings = { ...localSettings, downloadFolderPath: '' };
    setLocalSettings(newSettings);
    await saveSettings(newSettings);
  };

  /**
   * 권한 재요청
   */
  const handleRequestPermission = async () => {
    setError(null);
    const granted = await requestPermission();

    if (!granted) {
      setError('폴더 접근 권한이 거부되었습니다. 폴더를 다시 선택해주세요.');
    }
  };

  /**
   * 폴더 경로 직접 입력
   */
  const handleFolderPathInput = (path: string) => {
    handleSettingChange('downloadFolderPath', path);
  };

  /**
   * 모달 닫기
   */
  const handleClose = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    onClose();
  };

  // Body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // ESC 키 처리
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`relative w-full max-w-md ${BG_COLOR.card} rounded-xl shadow-2xl overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default}`}
            >
              <div className="flex items-center gap-3">
                <FaCog className="text-[#ED6C00] text-xl" />
                <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>웹하드 설정</h2>
              </div>
              <button
                onClick={handleClose}
                className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors ${TEXT_COLOR.muted}`}
              >
                <FaTimes />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* 로딩 상태 */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#ED6C00] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!isLoading && (
                <>
                  {/* 에러 메시지 */}
                  {error && (
                    <div
                      className={`p-3 ${BG_COLOR.error} border ${BORDER_COLOR.error} rounded-lg flex gap-3`}
                    >
                      <FaExclamationTriangle
                        className={`${TEXT_COLOR.error} flex-shrink-0 mt-0.5`}
                      />
                      <p className={`text-sm ${TEXT_COLOR.errorStrong} whitespace-pre-line`}>
                        {error}
                      </p>
                    </div>
                  )}

                  {/* 다운로드 폴더 설정 */}
                  <div className="space-y-3">
                    <label className={`block text-sm font-semibold ${TEXT_COLOR.primary}`}>
                      다운로드 폴더
                    </label>

                    <div className="space-y-2">
                      {/* 복원 중 로딩 */}
                      {isRestoringHandle && (
                        <div className={`flex items-center gap-2 p-2 ${BG_COLOR.info} rounded-lg`}>
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span className={`text-sm ${TEXT_COLOR.info}`}>
                            저장된 폴더 설정 복원 중...
                          </span>
                        </div>
                      )}

                      {/* 폴더 경로 표시 및 버튼 */}
                      <div className="flex gap-2">
                        <div
                          className={`flex-1 px-3 py-2 ${BG_COLOR.muted} border ${BORDER_COLOR.default} rounded-lg flex items-center gap-2`}
                        >
                          <FaFolder className="text-[#ED6C00] text-sm flex-shrink-0" />
                          <span className={`flex-1 text-sm ${TEXT_COLOR.primary} truncate`}>
                            {folderName ||
                              localSettings.downloadFolderPath ||
                              '폴더를 선택해주세요'}
                          </span>

                          {/* 권한 상태 표시 */}
                          {folderName && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                permissionStatus === 'granted'
                                  ? `${BG_COLOR.success} ${TEXT_COLOR.success}`
                                  : permissionStatus === 'prompt'
                                    ? `${BG_COLOR.warning} ${TEXT_COLOR.warning}`
                                    : `${BG_COLOR.muted} ${TEXT_COLOR.secondary}`
                              }`}
                            >
                              {permissionStatus === 'granted'
                                ? '권한 있음'
                                : permissionStatus === 'prompt'
                                  ? '권한 필요'
                                  : ''}
                            </span>
                          )}
                        </div>

                        {/* 폴더 선택 버튼 */}
                        <button
                          onClick={handleFolderPicker}
                          disabled={isFolderPickerActive || !isDownloadFolderSupported}
                          title={
                            !isDownloadFolderSupported
                              ? 'File System Access API를 지원하지 않는 브라우저'
                              : '컴퓨터에서 폴더 선택'
                          }
                          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 flex-shrink-0 ${
                            isFolderPickerActive || !isDownloadFolderSupported
                              ? `${BG_COLOR.muted} ${TEXT_COLOR.secondary} cursor-not-allowed`
                              : 'bg-[#ED6C00] hover:bg-[#d15f00] text-white'
                          }`}
                        >
                          {isFolderPickerActive ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>선택 중...</span>
                            </>
                          ) : (
                            <>
                              <FaFolder className="text-sm" />
                              <span>선택</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 권한 필요 시 재요청 버튼 */}
                      {folderName && permissionStatus === 'prompt' && (
                        <div
                          className={`flex items-center gap-2 p-2 ${BG_COLOR.amberWarm} border ${BORDER_COLOR.amber} rounded-lg`}
                        >
                          <FaExclamationTriangle
                            className={`${TEXT_COLOR.warning} flex-shrink-0`}
                          />
                          <span className={`flex-1 text-xs ${TEXT_COLOR.warning}`}>
                            폴더 접근 권한이 필요합니다. 다운로드 시 권한을 요청합니다.
                          </span>
                          <button
                            onClick={handleRequestPermission}
                            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                          >
                            <FaSync className="text-xs" />
                            권한 요청
                          </button>
                        </div>
                      )}

                      {/* 폴더 초기화 버튼 */}
                      {folderName && (
                        <button
                          onClick={handleClearFolder}
                          className={`flex items-center gap-2 text-xs ${TEXT_COLOR.muted} ${TEXT_COLOR.hoverErrorSoft} transition-colors`}
                        >
                          <FaTrash className="text-xs" />
                          <span>폴더 설정 초기화</span>
                        </button>
                      )}

                      {/* 브라우저 호환성 정보 */}
                      <div className="text-xs space-y-1">
                        {isDownloadFolderSupported ? (
                          <div className={`flex items-center gap-2 ${TEXT_COLOR.success}`}>
                            <FaCheck className="text-xs" />
                            <span>이 브라우저는 폴더 선택을 지원합니다.</span>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-2 ${TEXT_COLOR.warning}`}>
                            <FaExclamationTriangle className="text-xs" />
                            <span>
                              이 브라우저는 폴더 선택을 지원하지 않습니다.
                              <br />
                              Chrome/Edge 최신 버전을 사용해주세요.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 설명 */}
                      <p className={`text-xs ${TEXT_COLOR.secondary}`}>
                        선택한 폴더에 웹하드 파일이 다운로드됩니다. 브라우저 새로고침 후에도 폴더
                        설정이 유지되며, 첫 다운로드 시 권한 확인이 필요합니다.
                      </p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`h-px ${BG_COLOR.muted}`} />

                  {/* 알림 설정 */}
                  <div className="space-y-3">
                    <label className={`block text-sm font-semibold ${TEXT_COLOR.primary}`}>
                      알림 설정
                    </label>

                    <div className="space-y-2">
                      {/* 다운로드 완료 */}
                      <label
                        className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg ${BG_COLOR.hoverLighter} transition-colors`}
                      >
                        <input
                          type="checkbox"
                          checked={localSettings.notifyOnDownloadComplete}
                          onChange={(e) =>
                            handleSettingChange('notifyOnDownloadComplete', e.target.checked)
                          }
                          className="w-4 h-4 rounded border-gray-300 text-[#ED6C00] cursor-pointer accent-[#ED6C00]"
                        />
                        <span className={`text-sm ${TEXT_COLOR.secondary}`}>
                          다운로드 완료 시 알림
                        </span>
                      </label>

                      {/* 업로드 완료 */}
                      <label
                        className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg ${BG_COLOR.hoverLighter} transition-colors`}
                      >
                        <input
                          type="checkbox"
                          checked={localSettings.notifyOnUploadComplete}
                          onChange={(e) =>
                            handleSettingChange('notifyOnUploadComplete', e.target.checked)
                          }
                          className="w-4 h-4 rounded border-gray-300 text-[#ED6C00] cursor-pointer accent-[#ED6C00]"
                        />
                        <span className={`text-sm ${TEXT_COLOR.secondary}`}>
                          업로드 완료 시 알림
                        </span>
                      </label>

                      {/* 에러 알림 */}
                      <label
                        className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg ${BG_COLOR.hoverLighter} transition-colors`}
                      >
                        <input
                          type="checkbox"
                          checked={localSettings.notifyOnError}
                          onChange={(e) => handleSettingChange('notifyOnError', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[#ED6C00] cursor-pointer accent-[#ED6C00]"
                        />
                        <span className={`text-sm ${TEXT_COLOR.secondary}`}>오류 발생 시 알림</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              className={`flex gap-2 px-6 py-4 border-t ${BORDER_COLOR.default} ${BG_COLOR.page} items-center justify-between`}
            >
              <div className="flex items-center gap-2 text-xs">
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-3 h-3 border-2 border-[#ED6C00] border-t-transparent rounded-full animate-spin" />
                    <span className={TEXT_COLOR.secondary}>저장 중...</span>
                  </>
                )}
                {saveStatus === 'success' && (
                  <>
                    <FaCheck className={`${TEXT_COLOR.success} text-xs`} />
                    <span className={TEXT_COLOR.success}>저장 완료</span>
                  </>
                )}
              </div>
              <button
                onClick={handleClose}
                className={`px-4 py-2 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} transition-colors`}
              >
                닫기
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
