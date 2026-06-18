'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { FaSpinner, FaFolder, FaCog, FaCloudUploadAlt, FaFolderPlus } from 'react-icons/fa';
import { SearchDropdown } from './SearchDropdown';
import { SearchModal } from './SearchModal';
import { WebhardSettings } from './WebhardSettings';
import { FolderSelectModal } from './FolderSelectModal';
import { InquiryTypeSelectModal } from './InquiryTypeSelectModal';
import { FolderUploadModal } from './FolderUploadModal';
import { useToast } from '@/hooks/useToast';
import { WEBHARD_STYLES, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { ThemeToggle } from '@/components/ThemeToggle';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';
import type { SearchResultDTO } from '@/app/webhard/_lib/types';
import { mapSearchResponse } from '@/app/webhard/_lib/searchUtils';

const MAX_FILE_UPLOAD_COUNT = 100;
const MAX_FILE_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

interface WebhardNavProps {
  userType: 'admin' | 'company';
  userId: string;
  onMobileSidebarOpen: () => void;
  onFileUpload: (files: FileList | File[], targetFolderId: string | null) => void;
  isUploading: boolean;
  selectedFolderId: string | null;
  onFolderUploadComplete: () => void;
  /** 검색 결과에서 폴더 선택 시 직접 폴더 상태를 업데이트하는 콜백 */
  onFolderNavigate: (folderId: string | null) => void;
}

export function WebhardNav({
  userType,
  userId,
  onMobileSidebarOpen,
  onFileUpload,
  isUploading,
  selectedFolderId,
  onFolderUploadComplete,
  onFolderNavigate,
}: WebhardNavProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [searchDropdownSelectedIndex, setSearchDropdownSelectedIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [isFolderSelectOpen, setIsFolderSelectOpen] = useState(false);
  const [isInquiryTypeSelectOpen, setIsInquiryTypeSelectOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | File[] | null>(null);
  const [isFolderUploadOpen, setIsFolderUploadOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error: showError } = useToast();

  // 검색 debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 검색 모달 상태
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // 검색 결과 쿼리 - NestJS API 사용 (파일 + 폴더 통합 검색)
  const { data: searchResults = [], isFetching: isSearching } = useQuery<SearchResultDTO[]>({
    queryKey: queryKeys.webhard.search.dropdown(debouncedSearchQuery),
    queryFn: async () => {
      if (!debouncedSearchQuery.trim() || debouncedSearchQuery.length < 2) return [];
      const response = await fetch(
        `/api/webhard/search?q=${encodeURIComponent(debouncedSearchQuery)}&limit=20`
      );
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();

      return mapSearchResponse(data);
    },
    enabled: debouncedSearchQuery.length >= 2,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // 검색 결과 변경 시 selectedIndex 초기화
  useEffect(() => {
    setSearchDropdownSelectedIndex(0);
  }, [searchResults]);

  // Ctrl+Shift+F 단축키로 검색 모달 열기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 파일 선택 핸들러
  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 파일 input 변경 핸들러
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const fileArray = Array.from(e.target.files);

        // 최대 파일 개수 검증
        if (fileArray.length > MAX_FILE_UPLOAD_COUNT) {
          showError('오류', `최대 ${MAX_FILE_UPLOAD_COUNT}개까지 업로드할 수 있습니다.`);
          return;
        }

        // 클라이언트 파일 크기 검증
        const oversizedFiles = fileArray.filter((file) => file.size > MAX_FILE_UPLOAD_SIZE);
        if (oversizedFiles.length > 0) {
          const fileNames = oversizedFiles.map((f) => f.name).join(', ');
          showError(
            '파일 크기 초과',
            `다음 파일이 2GB를 초과합니다: ${fileNames.length > 50 ? fileNames.slice(0, 50) + '...' : fileNames}`
          );
          return;
        }

        // 빈 파일 검증
        const emptyFiles = fileArray.filter((file) => file.size === 0);
        if (emptyFiles.length > 0) {
          showError('오류', '빈 파일(0바이트)은 업로드할 수 없습니다.');
          return;
        }

        // 파일을 임시 저장하고 모달 열기
        setPendingFiles(fileArray);
        if (userType === 'company') {
          setIsInquiryTypeSelectOpen(true);
        } else {
          setIsFolderSelectOpen(true);
        }

        // input 초기화
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [showError]
  );

  // 폴더 선택 완료 핸들러
  const handleFolderSelect = useCallback(
    (targetFolderId: string | null) => {
      if (pendingFiles) {
        onFileUpload(pendingFiles, targetFolderId);
        setPendingFiles(null);
      }
    },
    [pendingFiles, onFileUpload]
  );

  // 관리 페이지 링크
  const managementLink = userType === 'admin' ? '/admin' : '/company/dashboard';
  const managementLabel = userType === 'admin' ? '관리자페이지' : '공정관리페이지';

  return (
    <>
      <WebhardSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* 네비게이션 바 */}
      <header
        className={`flex-shrink-0 sticky top-0 z-40 ${BG_COLOR.page} border-b ${BORDER_COLOR.light}`}
      >
        <div className="px-4 md:px-4 lg:px-8">
          <div className="flex items-center h-14 md:h-16 lg:h-[72px] gap-3 sm:gap-4">
            {/* 좌측: 폴더 버튼 + 로고 + 웹하드 */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 폴더 트리 열기 버튼 (모바일/태블릿) */}
              <button
                onClick={onMobileSidebarOpen}
                className={`lg:hidden p-1.5 text-[#ED6C00] hover:text-[#d15f00] ${BG_COLOR.hoverOrange} rounded-lg transition-colors`}
                aria-label="폴더 열기"
              >
                <FaFolder className="text-base" />
              </button>

              {/* 로고 - 메인색 유지 */}
              <Link href="/" className="hidden sm:flex items-center">
                <div className="h-7 md:h-8 lg:h-10 w-auto overflow-hidden flex items-center">
                  <Image
                    src="/mainLogo.svg"
                    alt="로고"
                    width={120}
                    height={40}
                    className="max-h-full max-w-full object-contain"
                    priority
                  />
                </div>
              </Link>

              {/* 구분선 */}
              <div className={`hidden sm:block w-px h-5 md:h-6 lg:h-7 ${BG_COLOR.strong}`} />

              {/* 웹하드 타이틀 */}
              <span
                className={`text-sm md:text-base lg:text-lg font-semibold ${TEXT_COLOR.primary} leading-none`}
              >
                웹하드
              </span>
            </div>

            {/* 중앙: 검색바 + 테마 토글 */}
            <div className="flex-1 flex justify-center items-center gap-2 min-w-0">
              <div className="relative w-full max-w-sm lg:max-w-md">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="파일 검색..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchDropdownOpen(true);
                    setSearchDropdownSelectedIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (isSearchDropdownOpen && searchQuery.length > 0) {
                        setSearchDropdownSelectedIndex((prev) => prev + 1);
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (isSearchDropdownOpen && searchQuery.length > 0) {
                        setSearchDropdownSelectedIndex((prev) => Math.max(0, prev - 1));
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsSearchDropdownOpen(false);
                    } else if (e.key === 'Enter') {
                      if (e.nativeEvent.isComposing) return;
                      if (isSearchDropdownOpen && searchResults.length > 0) {
                        e.preventDefault();
                        const selectedResult = searchResults[searchDropdownSelectedIndex];
                        if (selectedResult) {
                          setIsSearchDropdownOpen(false);

                          if (selectedResult.type === 'folder') {
                            // 폴더: 해당 폴더 안으로 이동
                            onFolderNavigate(selectedResult.id);
                          } else {
                            // 파일: 하이라이트 후 해당 폴더로 이동
                            const { setHighlight, clearHighlight } =
                              useWebhardHighlightStore.getState();
                            setHighlight(selectedResult.id, selectedResult.type);
                            setTimeout(() => clearHighlight(), 3000);

                            const params = new URLSearchParams();
                            if (selectedResult.folder_id) {
                              params.set('folderId', selectedResult.folder_id);
                            }
                            router.push(`/webhard?${params.toString()}`);
                          }
                        }
                      }
                    }
                  }}
                  onFocus={() => {
                    if (searchQuery.length > 0) {
                      setIsSearchDropdownOpen(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setIsSearchDropdownOpen(false);
                    }, 100);
                  }}
                  className={`w-full px-4 py-1.5 text-sm ${BG_COLOR.muted} border ${BORDER_COLOR.default} rounded-lg ${TEXT_COLOR.primary} placeholder:text-gray-500 focus:outline-none focus:border-[#ED6C00] focus:ring-1 focus:ring-[#ED6C00] transition-colors`}
                />
                <SearchDropdown
                  query={searchQuery}
                  isOpen={isSearchDropdownOpen && searchQuery.length > 0}
                  onSelectResult={() => {}}
                  onClose={() => setIsSearchDropdownOpen(false)}
                  selectedIndex={searchDropdownSelectedIndex}
                  onSelectedIndexChange={setSearchDropdownSelectedIndex}
                  searchResults={searchResults}
                  isLoading={isSearching && debouncedSearchQuery.length > 0}
                  onFolderNavigate={onFolderNavigate}
                />
              </div>
            </div>

            {/* 우측: 액션 버튼들 */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 테마 토글 */}
              <ThemeToggle size="sm" />

              {/* 설정 (데스크톱만 표시 - 모바일은 하단 메뉴에서 접근) */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className={`hidden lg:block ${WEBHARD_STYLES.iconButton}`}
                aria-label="설정"
              >
                <FaCog className="text-sm" />
              </button>

              {/* 구분선 (데스크톱만 표시) */}
              <div className={`hidden lg:block w-px h-4 ${BG_COLOR.strong}`} />

              {/* 관리 페이지 링크 - 업로드 버튼과 높이 통일 (h-8) */}
              <Link
                href={managementLink}
                className={`hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-transparent ${TEXT_COLOR.muted} border ${BORDER_COLOR.default} hover:border-[#ED6C00] hover:text-[#ED6C00] transition-colors`}
              >
                {managementLabel}
              </Link>

              {/* 폴더 업로드 버튼 (관리자만 표시) */}
              {userType === 'admin' && (
                <button
                  onClick={() => setIsFolderUploadOpen(true)}
                  disabled={isUploading}
                  className={`hidden sm:flex items-center gap-1 h-8 px-2.5 sm:px-3 bg-white border border-[#ED6C00] text-[#ED6C00] hover:bg-[#FFF2E6] disabled:bg-gray-100 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed rounded-md transition-colors text-xs font-medium`}
                  title="폴더 통째로 업로드"
                >
                  <FaFolderPlus className="text-sm" />
                  <span className="hidden lg:inline">폴더 업로드</span>
                </button>
              )}

              {/* 파일 업로드 버튼 - 관리 페이지 버튼과 높이 통일 (h-8) */}
              <button
                onClick={handleFileSelect}
                disabled={isUploading}
                className="flex items-center gap-1 h-8 px-2.5 sm:px-3 bg-[#ED6C00] hover:bg-[#d15f00] disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors text-xs font-medium"
              >
                {isUploading ? (
                  <>
                    <FaSpinner className="text-xs animate-spin" />
                    <span className="hidden sm:inline">업로드 중</span>
                  </>
                ) : (
                  <>
                    <FaCloudUploadAlt className="text-sm" />
                    <span className="hidden sm:inline">파일 업로드</span>
                  </>
                )}
              </button>

              {/* 숨겨진 파일 input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".dxf,.ai,.pdf,.jpg,.jpeg,.png,.eps,.psd,.cdr,.dwg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                onChange={handleFileInputChange}
                className="sr-only"
                data-testid="file-upload-input"
              />
            </div>
          </div>
        </div>
      </header>

      {/* 검색 모달 (Ctrl+Shift+F) */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        initialQuery={searchQuery}
        onFolderNavigate={onFolderNavigate}
      />

      {/* 폴더 선택 모달 */}
      <FolderSelectModal
        isOpen={isFolderSelectOpen}
        onClose={() => {
          setIsFolderSelectOpen(false);
          setPendingFiles(null);
        }}
        onSelect={handleFolderSelect}
        currentFolderId={selectedFolderId}
        title="업로드할 폴더 선택"
      />

      {/* 의뢰 유형 선택 모달 (업체 사용자 전용) */}
      <InquiryTypeSelectModal
        isOpen={isInquiryTypeSelectOpen}
        onClose={() => {
          setIsInquiryTypeSelectOpen(false);
          setPendingFiles(null);
        }}
        onSelect={(folderId) => {
          if (pendingFiles) {
            onFileUpload(pendingFiles, folderId);
            setPendingFiles(null);
          }
          setIsInquiryTypeSelectOpen(false);
        }}
        onOtherSelect={() => {
          setIsFolderSelectOpen(true);
        }}
        isLaserOnly={false}
      />

      {/* 폴더 업로드 모달 */}
      <FolderUploadModal
        isOpen={isFolderUploadOpen}
        onClose={() => setIsFolderUploadOpen(false)}
        targetFolderId={selectedFolderId}
        onUploadComplete={onFolderUploadComplete}
        userType={userType}
      />
    </>
  );
}
