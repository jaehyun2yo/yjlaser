'use client';

import { createContext, useContext, ReactNode, RefObject } from 'react';
import type { FileListItem } from '@/app/webhard/_lib/types';

// ============================================
// 1. STATE CONTEXT (자주 변경되는 값)
// ============================================
export interface WebhardStateContextValue {
  files: FileListItem[];
  selectedFiles: Set<string>;
  editingFileId: string | null;
  editingFileName: string;
  draggedFileId: string | null;
  isDragSelecting: boolean;
  isNewFilesMode: boolean;
}

const WebhardStateContext = createContext<WebhardStateContextValue | null>(null);

export function useWebhardState() {
  const context = useContext(WebhardStateContext);
  if (!context) {
    throw new Error('useWebhardState must be used within WebhardProvider');
  }
  return context;
}

// ============================================
// 2. ACTIONS CONTEXT (정적 - useCallback으로 안정화)
// ============================================
export interface WebhardActionsContextValue {
  onDragStart: (e: React.DragEvent, fileId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onFileClick: (e: React.MouseEvent, file: FileListItem, index: number) => void;
  onFileDoubleClick: (file: FileListItem) => void;
  onContextMenu: (e: React.MouseEvent, file: FileListItem) => void;
  onMouseEnter: (e: React.MouseEvent, file: FileListItem) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onCheckboxChange: (fileId: string, checked: boolean) => void;
  onEditChange: (value: string) => void;
  onEditBlur: (fileId: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent, fileId: string) => void;
  onDownload: (file: FileListItem) => void;
  onDelete?: (fileId: string) => void;
  onFolderNavigate: (folderId: string) => void;
  isFileNew: (file: FileListItem) => boolean;
  canPreviewFile: (file: FileListItem) => boolean;
  editInputRef: RefObject<HTMLInputElement | null>;
}

const WebhardActionsContext = createContext<WebhardActionsContextValue | null>(null);

export function useWebhardActions() {
  const context = useContext(WebhardActionsContext);
  if (!context) {
    throw new Error('useWebhardActions must be used within WebhardProvider');
  }
  return context;
}

// ============================================
// 3. LAYOUT CONTEXT (가끔 변경)
// ============================================
export interface WebhardLayoutContextValue {
  fileNameColWidth: number;
  dateColWidth: number;
}

const WebhardLayoutContext = createContext<WebhardLayoutContextValue | null>(null);

export function useWebhardLayout() {
  const context = useContext(WebhardLayoutContext);
  if (!context) {
    throw new Error('useWebhardLayout must be used within WebhardProvider');
  }
  return context;
}

// ============================================
// PROVIDER (통합)
// ============================================
interface WebhardProviderProps {
  children: ReactNode;
  stateValue: WebhardStateContextValue;
  actionsValue: WebhardActionsContextValue;
  layoutValue: WebhardLayoutContextValue;
}

export function WebhardProvider({
  children,
  stateValue,
  actionsValue,
  layoutValue,
}: WebhardProviderProps) {
  return (
    <WebhardStateContext.Provider value={stateValue}>
      <WebhardActionsContext.Provider value={actionsValue}>
        <WebhardLayoutContext.Provider value={layoutValue}>
          {children}
        </WebhardLayoutContext.Provider>
      </WebhardActionsContext.Provider>
    </WebhardStateContext.Provider>
  );
}

// ============================================
// 편의를 위한 통합 훅
// ============================================
export function useWebhardContext() {
  return {
    ...useWebhardState(),
    ...useWebhardActions(),
    ...useWebhardLayout(),
  };
}
