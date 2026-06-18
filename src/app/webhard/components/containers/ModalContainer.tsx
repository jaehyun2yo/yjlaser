'use client';

/**
 * ModalContainer
 * 웹하드 모달 컨테이너 컴포넌트
 * 모든 모달들을 한 곳에서 관리
 */

import dynamic from 'next/dynamic';
import type { DownloadItem, ProgressItem } from '@/app/webhard/components/DownloadProgressModal';
import type { DeleteTarget } from '@/app/webhard/components/ConfirmDeleteModal';

// Lazy Loading 모달 컴포넌트들
const FolderSelectModal = dynamic(
  () => import('../FolderSelectModal').then((mod) => ({ default: mod.FolderSelectModal })),
  { ssr: false }
);

const DownloadProgressModal = dynamic(
  () => import('../DownloadProgressModal').then((mod) => ({ default: mod.DownloadProgressModal })),
  { ssr: false }
);

const ProgressModal = dynamic(
  () => import('../DownloadProgressModal').then((mod) => ({ default: mod.ProgressModal })),
  { ssr: false }
);

const WebhardSettings = dynamic(
  () => import('../WebhardSettings').then((mod) => ({ default: mod.WebhardSettings })),
  { ssr: false }
);

const SearchModal = dynamic(
  () => import('../SearchModal').then((mod) => ({ default: mod.SearchModal })),
  { ssr: false }
);

const TrashBin = dynamic(() => import('../TrashBin').then((mod) => ({ default: mod.TrashBin })), {
  ssr: false,
});

const ShareLinkModal = dynamic(
  () => import('../ShareLinkModal').then((mod) => ({ default: mod.ShareLinkModal })),
  { ssr: false }
);

const ConfirmDeleteModal = dynamic(
  () => import('../ConfirmDeleteModal').then((mod) => ({ default: mod.ConfirmDeleteModal })),
  { ssr: false }
);

// ============ Types ============
type ModalType =
  | 'settings'
  | 'search'
  | 'trash'
  | 'move'
  | 'download'
  | 'delete'
  | 'deleteConfirm'
  | 'moveProgress'
  | 'shareLink';

interface ModalContainerProps {
  /** 모달 열림 여부 확인 함수 */
  isModalOpen: (modal: ModalType) => boolean;
  /** 모달 닫기 핸들러 */
  closeModal: () => void;
  /** 사용자 타입 */
  userType: 'admin' | 'company';
  /** 현재 폴더 ID */
  currentFolderId: string | null;
  /** 선택된 파일 ID들 */
  selectedFileIds: string[];
  /** 파일 이동 핸들러 */
  onMoveFiles: (fileIds: string[], targetFolderId: string | null) => void;
  /** 다운로드 항목 */
  downloadItems: DownloadItem[];
  /** 다운로드 중 여부 */
  isDownloading: boolean;
  /** 삭제 항목 */
  deleteItems: ProgressItem[];
  /** 삭제 중 여부 */
  isDeleting: boolean;
  /** 이동 항목 */
  moveItems: ProgressItem[];
  /** 이동 중 여부 */
  isMoving: boolean;
  /** 공유 링크 생성할 파일 경로 */
  shareLinkFilePath?: string;
  /** 공유 링크 생성할 파일 이름 */
  shareLinkFileName?: string;
  /** 공유 링크 생성할 회사 ID */
  shareLinkCompanyId?: number | null;
  /** 삭제 확인 대상 항목들 */
  deleteTargets: DeleteTarget[];
  /** 삭제 확인 후 실행할 함수 (progress: 0-100) */
  onConfirmDelete: (
    onProgress: (percent: number) => void
  ) => Promise<{ success: boolean; message?: string }>;
}

// ============ Component ============
export function ModalContainer({
  isModalOpen,
  closeModal,
  userType,
  currentFolderId,
  selectedFileIds,
  onMoveFiles,
  downloadItems,
  isDownloading,
  deleteItems,
  isDeleting,
  moveItems,
  isMoving,
  shareLinkFilePath = '',
  shareLinkFileName = '',
  shareLinkCompanyId,
  deleteTargets,
  onConfirmDelete,
}: ModalContainerProps) {
  return (
    <>
      {/* 설정 모달 */}
      <WebhardSettings isOpen={isModalOpen('settings')} onClose={closeModal} />

      {/* 검색 모달 */}
      <SearchModal isOpen={isModalOpen('search')} onClose={closeModal} initialQuery="" />

      {/* 휴지통 모달 (관리자만) */}
      <TrashBin isOpen={isModalOpen('trash')} onClose={closeModal} userType={userType} />

      {/* 파일 이동 모달 */}
      <FolderSelectModal
        isOpen={isModalOpen('move')}
        onClose={closeModal}
        onSelect={(targetFolderId) => {
          if (selectedFileIds.length > 0) {
            onMoveFiles(selectedFileIds, targetFolderId);
            closeModal();
          }
        }}
        title="파일 이동할 폴더 선택"
        currentFolderId={currentFolderId}
      />

      {/* 다운로드 진행 모달 */}
      <DownloadProgressModal
        isOpen={isModalOpen('download')}
        onClose={closeModal}
        items={downloadItems}
        totalCount={downloadItems.length}
        completedCount={
          downloadItems.filter((item) => item.status === 'completed' || item.status === 'error')
            .length
        }
        isDownloading={isDownloading}
      />

      {/* 삭제 진행 모달 */}
      <ProgressModal
        isOpen={isModalOpen('delete')}
        onClose={closeModal}
        items={deleteItems}
        totalCount={deleteItems.length}
        completedCount={
          deleteItems.filter((item) => item.status === 'completed' || item.status === 'error')
            .length
        }
        isProcessing={isDeleting}
        operationType="delete"
      />

      {/* 이동 진행 모달 */}
      <ProgressModal
        isOpen={isModalOpen('moveProgress')}
        onClose={closeModal}
        items={moveItems}
        totalCount={moveItems.length}
        completedCount={
          moveItems.filter((item) => item.status === 'completed' || item.status === 'error').length
        }
        isProcessing={isMoving}
        operationType="move"
      />

      {/* 공유 링크 생성 모달 */}
      <ShareLinkModal
        isOpen={isModalOpen('shareLink')}
        onClose={closeModal}
        filePath={shareLinkFilePath}
        fileName={shareLinkFileName}
        companyId={shareLinkCompanyId}
      />

      {/* 삭제 확인 모달 */}
      <ConfirmDeleteModal
        isOpen={isModalOpen('deleteConfirm')}
        onClose={closeModal}
        targets={deleteTargets}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
