'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  AlertOctagon,
  SplitSquareVertical,
  Scissors,
  Hammer,
  FolderOpen,
  Info,
} from 'lucide-react';
import { buildWebhardUrl } from '@/lib/utils/webhard-url';
import type { InquiryType } from '@/lib/types';

interface WorkerContextMenuProps {
  x: number;
  y: number;
  isUrgent: boolean;
  canSplit: boolean;
  currentInquiryType?: InquiryType | null;
  canReclassify: boolean;
  /** 컨텍스트 메뉴 "웹하드에서 열기" 대상 폴더. null 이면 항목 disabled. */
  webhardFolderId?: string | null;
  /** 폴더 진입 시 하이라이트할 파일 ID. null 이면 folderId 만으로 이동. */
  webhardFileId?: string | null;
  onReclassify: (inquiryType: InquiryType) => void;
  onToggleUrgent: () => void;
  onSplit?: () => void;
  /** "정보 보기" 클릭 시 호출. 부모에서 `ContactInfoModal` open 처리. */
  onViewInfo?: () => void;
  onClose: () => void;
}

export function WorkerContextMenu({
  x,
  y,
  isUrgent,
  canSplit,
  currentInquiryType,
  canReclassify,
  webhardFolderId,
  webhardFileId,
  onReclassify,
  onToggleUrgent,
  onSplit,
  onViewInfo,
  onClose,
}: WorkerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // 메뉴 예상 높이: "웹하드에서 열기" (~48px) + "정보 보기" (~48px, onViewInfo 있을 때만)
  // + 구분선 + 재분류 섹션 (~140px) + 긴급/분할 버튼 (~48px each)
  const estimatedHeight =
    48 +
    (onViewInfo ? 48 : 0) +
    9 +
    (canReclassify ? 140 : 0) +
    48 +
    (canSplit && onSplit ? 48 : 0);
  const adjustedStyle = {
    top: Math.min(y, window.innerHeight - estimatedHeight),
    left: Math.min(x, window.innerWidth - 180),
  };

  const isCuttingDisabled = currentInquiryType === 'cutting_request';
  const isMoldDisabled = currentInquiryType === 'mold_request';
  const webhardUrl = buildWebhardUrl(webhardFolderId, webhardFileId);
  const isWebhardDisabled = !webhardUrl;

  const reclassifyItemBase =
    'w-full flex items-center gap-2 px-3 py-3 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  const handleOpenWebhard = () => {
    if (!webhardUrl) return;
    router.push(webhardUrl);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
      style={adjustedStyle}
    >
      <button
        type="button"
        role="menuitem"
        onClick={handleOpenWebhard}
        disabled={isWebhardDisabled}
        title={isWebhardDisabled ? '웹하드 폴더 미생성' : undefined}
        className={reclassifyItemBase}
        aria-label="웹하드에서 열기"
      >
        <FolderOpen className="w-4 h-4 text-brand" />
        <span className="text-gray-700">웹하드에서 열기</span>
      </button>
      {onViewInfo && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onViewInfo();
            onClose();
          }}
          className={reclassifyItemBase}
          aria-label="정보 보기"
        >
          <Info className="w-4 h-4 text-info" />
          <span className="text-gray-700">정보 보기</span>
        </button>
      )}
      <div className="border-t border-gray-100 my-1" />
      {canReclassify && (
        <>
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            재분류
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (isCuttingDisabled) return;
              onReclassify('cutting_request');
              onClose();
            }}
            disabled={isCuttingDisabled}
            className={reclassifyItemBase}
            aria-label="칼선의뢰로 변경"
          >
            <Scissors className="w-4 h-4 text-blue-500" />
            <span className="text-gray-700">칼선의뢰</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (isMoldDisabled) return;
              onReclassify('mold_request');
              onClose();
            }}
            disabled={isMoldDisabled}
            className={reclassifyItemBase}
            aria-label="목형의뢰로 변경"
          >
            <Hammer className="w-4 h-4 text-green-600" />
            <span className="text-gray-700">목형의뢰</span>
          </button>
          <div className="border-t border-gray-100 my-1" />
        </>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onToggleUrgent();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-3 text-sm hover:bg-gray-50 transition-colors"
      >
        {isUrgent ? (
          <>
            <AlertOctagon className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">긴급 해제</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-red-600 font-medium">긴급 배치</span>
          </>
        )}
      </button>
      {canSplit && onSplit && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onSplit();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-3 text-sm hover:bg-gray-50 transition-colors"
        >
          <SplitSquareVertical className="w-4 h-4 text-purple-500" />
          <span className="text-gray-700">도면 분할</span>
        </button>
      )}
    </div>
  );
}
