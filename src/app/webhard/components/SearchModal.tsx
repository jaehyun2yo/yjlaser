'use client';

import { useState, useEffect, useRef } from 'react';
import { FaSearch, FaTimes, FaFolder, FaFile, FaSpinner } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useWebhardHighlightStore } from '@/store/webhard/useWebhardHighlightStore';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { SearchResultDTO } from '@/app/webhard/_lib/types';
import {
  highlightText,
  mapSearchResponse,
  formatBreadcrumbPath,
  buildSearchNavigationUrl,
} from '@/app/webhard/_lib/searchUtils';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery: string;
  /** 폴더 클릭 시 직접 폴더 상태를 업데이트하는 콜백 */
  onFolderNavigate?: (folderId: string | null) => void;
}

export function SearchModal({ isOpen, onClose, initialQuery, onFolderNavigate }: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  // Search Query - uses combined search API (실시간 검색, debounce + caching 적용)
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150); // 150ms debounce (빠른 검색 반응)

    return () => clearTimeout(timer);
  }, [query]);

  // NestJS API 사용 - 파일 + 폴더 통합 검색 (단일 API 호출)
  const { data: searchResults = [], isLoading } = useQuery<SearchResultDTO[]>({
    queryKey: queryKeys.webhard.search.modal(debouncedQuery),
    queryFn: async () => {
      if (!debouncedQuery.trim() || debouncedQuery.length < 2) return [];

      const response = await fetch(
        `/api/webhard/search?q=${encodeURIComponent(debouncedQuery)}&limit=30`
      );

      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();

      return mapSearchResponse(data);
    },
    enabled: isOpen && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      // 모달이 열릴 때 input에 포커스
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialQuery]);

  // 검색 결과가 변경될 때 selectedIndex 초기화
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // selectedIndex 변경 시 해당 항목으로 자동 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleNavigate = (result: SearchResultDTO) => {
    if (result.type === 'folder') {
      // 폴더: onFolderNavigate 콜백으로 직접 상태 업데이트 (searchParams 가드 우회)
      // onClose 전에 호출하여 상태 업데이트 보장
      onFolderNavigate?.(result.id);
    } else {
      // 파일: 하이라이트 후 router.push로 해당 폴더로 이동
      const { setHighlight, clearHighlight } = useWebhardHighlightStore.getState();
      setHighlight(result.id, result.type as 'file' | 'folder');
      setTimeout(() => {
        clearHighlight();
      }, 3000);
      router.push(buildSearchNavigationUrl(result));
    }

    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 검색어가 있고 결과가 있으면 첫 번째 결과로 이동
    if (searchResults.length > 0) {
      handleNavigate(searchResults[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) {
      if (e.key === 'Escape') {
        onClose();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % searchResults.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev === 0 ? searchResults.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          handleNavigate(searchResults[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 완전 불투명 배경 레이어 - 배경 클릭 차단 */}
          <div
            className={`fixed inset-0 z-50 ${BG_COLOR.page}`}
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 px-4 pointer-events-none">
            {/* Modal Content */}
            <motion.div
              data-testid="webhard-search-modal"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`relative w-full max-w-2xl ${BG_COLOR.card} rounded-xl shadow-2xl overflow-hidden pointer-events-auto`}
            >
              <form onSubmit={handleSubmit} className="relative">
                <div className={`flex items-center px-4 py-4 border-b ${BORDER_COLOR.light}`}>
                  <FaSearch className="text-gray-400 text-lg mr-4" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="파일 또는 폴더 검색..."
                    className={`flex-1 bg-transparent text-lg ${TEXT_COLOR.primary} placeholder-gray-400 focus:outline-none`}
                  />
                  <button
                    type="button"
                    onClick={onClose}
                    className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors text-gray-500`}
                  >
                    <FaTimes />
                  </button>
                </div>
                {/* Search Results Section */}
                {query.trim() && (
                  <>
                    <div
                      className={`px-4 py-2 ${BG_COLOR.page} border-t ${BORDER_COLOR.light} flex justify-between items-center`}
                    >
                      <span className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>
                        {isLoading ? (
                          <span className="flex items-center gap-2">
                            <FaSpinner className="animate-spin text-xs" />
                            검색 중...
                          </span>
                        ) : searchResults.length > 0 ? (
                          <span>검색 결과: {searchResults.length}개</span>
                        ) : (
                          <span>검색 결과 없음</span>
                        )}
                      </span>
                      {searchResults.length > 0 && (
                        <div className={`flex gap-2 text-[10px] ${TEXT_COLOR.muted}`}>
                          <span className={`${BG_COLOR.muted} px-2 py-1 rounded`}>↑↓ 선택</span>
                          <span className={`${BG_COLOR.muted} px-2 py-1 rounded`}>Enter 입력</span>
                          <span className={`${BG_COLOR.muted} px-2 py-1 rounded`}>Esc 닫기</span>
                        </div>
                      )}
                    </div>

                    {/* Search Results List */}
                    <div className="max-h-[60vh] overflow-y-auto">
                      {isLoading ? (
                        <div className="flex justify-center items-center py-12 text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <FaSpinner className="animate-spin text-3xl text-[#ED6C00]" />
                            <span className="text-sm">검색 중...</span>
                          </div>
                        </div>
                      ) : searchResults.length > 0 ? (
                        <ul ref={listRef} className={`divide-y ${BORDER_COLOR.light}`}>
                          {searchResults.map((result: SearchResultDTO, index: number) => (
                            <li
                              key={`${result.type}-${result.id}`}
                              onClick={() => handleNavigate(result)}
                              className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 group ${
                                index === selectedIndex ? BG_COLOR.info : BG_COLOR.hoverMuted
                              }`}
                            >
                              <div className="text-gray-400 group-hover:text-[#ED6C00] flex-shrink-0">
                                {result.type === 'folder' ? <FaFolder /> : <FaFile />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm ${TEXT_COLOR.primary} truncate`}>
                                  {highlightText(result.original_name || result.name, query)}
                                </div>
                                <div
                                  className={`flex items-center gap-1 text-xs ${TEXT_COLOR.muted} truncate max-w-[200px]`}
                                  title={result.path || '루트'}
                                >
                                  <FaFolder className="shrink-0 text-[10px]" />
                                  <span className="truncate">
                                    {formatBreadcrumbPath(result.path)}
                                  </span>
                                </div>
                              </div>
                              {result.type === 'file' && result.size && (
                                <div className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                                  {(result.size / 1024 / 1024).toFixed(1)} MB
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="py-8 text-center text-gray-500 text-sm">
                          <div className="mb-2">검색 결과가 없습니다.</div>
                          <div className="text-xs">다른 검색어를 시도해보세요.</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
