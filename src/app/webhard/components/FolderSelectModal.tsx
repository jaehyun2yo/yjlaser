'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { FaFolder, FaFolderOpen, FaTimes, FaChevronRight, FaChevronDown } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface FolderSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
  title?: string;
  currentFolderId?: string | null;
}

// 재귀적 폴더 트리 컴포넌트
function FolderTreeItem({
  folder,
  folders,
  selectedFolderId,
  onSelect,
  level = 0,
}: {
  folder: Folder;
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string) => void;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const children = folders.filter((f) => f.parent_id === folder.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedFolderId === folder.id;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg transition-colors ${
          isSelected ? 'bg-[#ED6C00] text-white' : `${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary}`
        }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={`p-0.5 ${BG_COLOR.hoverMuted} rounded transition-colors`}
          >
            {isExpanded ? (
              <FaChevronDown className="text-[10px]" />
            ) : (
              <FaChevronRight className="text-[10px]" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {isExpanded && hasChildren ? (
          <FaFolderOpen className={`text-sm ${isSelected ? 'text-white' : 'text-[#ED6C00]'}`} />
        ) : (
          <FaFolder className={`text-sm ${isSelected ? 'text-white' : 'text-[#ED6C00]'}`} />
        )}
        <span className="text-sm truncate">{folder.name}</span>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderSelectModal({
  isOpen,
  onClose,
  onSelect,
  title = '업로드할 폴더 선택',
  currentFolderId = null,
}: FolderSelectModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);

  // 모달이 열릴 때 현재 폴더로 초기화
  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(currentFolderId);
    }
  }, [isOpen, currentFolderId]);

  // 폴더 목록 조회
  const { data: folders = [], isLoading } = useQuery<Folder[]>({
    queryKey: queryKeys.webhard.folders.all(),
    queryFn: async () => {
      const response = await fetch('/api/webhard/folders');
      if (!response.ok) throw new Error('Failed to fetch folders');
      const data = await response.json();
      return data.folders || [];
    },
    enabled: isOpen,
    staleTime: 30 * 1000,
  });

  // 루트 폴더들 (parent_id가 null인 폴더)
  const rootFolders = folders.filter((f) => f.parent_id === null);

  const handleConfirm = () => {
    onSelect(selectedFolderId);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            data-testid="folder-select-modal"
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
              <h3 className={`text-base font-semibold ${TEXT_COLOR.primary}`}>{title}</h3>
              <button
                onClick={onClose}
                className={`p-1.5 ${BG_COLOR.hoverMuted} rounded-lg transition-colors text-gray-500`}
              >
                <FaTimes className="text-sm" />
              </button>
            </div>

            {/* Folder Tree */}
            <div className="p-4 max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#ED6C00] border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* 루트 (최상위) 선택 옵션 */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg transition-colors mb-1 ${
                      selectedFolderId === null
                        ? 'bg-[#ED6C00] text-white'
                        : `${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary}`
                    }`}
                    onClick={() => setSelectedFolderId(null)}
                  >
                    <FaFolder
                      className={`text-sm ${selectedFolderId === null ? 'text-white' : 'text-gray-400'}`}
                    />
                    <span className="text-sm">최상위 폴더</span>
                  </div>

                  {/* 폴더 트리 */}
                  {rootFolders.length > 0 ? (
                    <div className="space-y-0.5">
                      {rootFolders.map((folder) => (
                        <FolderTreeItem
                          key={folder.id}
                          folder={folder}
                          folders={folders}
                          selectedFolderId={selectedFolderId}
                          onSelect={setSelectedFolderId}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={`text-center py-6 ${TEXT_COLOR.muted} text-sm`}>
                      생성된 폴더가 없습니다
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div
              className={`flex items-center justify-end gap-2 px-4 py-3 border-t ${BORDER_COLOR.default} ${BG_COLOR.page}`}
            >
              <button
                onClick={onClose}
                className={`px-4 py-2 text-sm ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors font-medium"
              >
                선택 완료
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
