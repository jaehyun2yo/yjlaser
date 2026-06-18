'use client';

/**
 * SidebarResizer
 * 사이드바 리사이즈 바 컴포넌트
 * - 드래그로 너비 조절
 * - 클릭으로 토글
 */

import { useCallback, useEffect, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

// ============ Types ============
interface SidebarResizerProps {
  /** 사이드바 접힘 여부 */
  isSidebarCollapsed: boolean;
  /** 현재 사이드바 너비 */
  sidebarWidth: number;
  /** 사이드바 너비 변경 핸들러 */
  onWidthChange: (width: number) => void;
  /** 사이드바 토글 핸들러 */
  onToggle: () => void;
  /** 접힘 상태 변경 핸들러 */
  onCollapsedChange: (collapsed: boolean) => void;
  /** 최소 너비 */
  minWidth?: number;
  /** 최대 너비 */
  maxWidth?: number;
  /** 접힘 임계값 */
  collapseThreshold?: number;
}

// ============ Hook ============
function useSidebarResize({
  sidebarWidth,
  onWidthChange,
  onCollapsedChange,
  minWidth = 180,
  maxWidth = 400,
  collapseThreshold = 100,
}: Pick<
  SidebarResizerProps,
  | 'sidebarWidth'
  | 'onWidthChange'
  | 'onCollapsedChange'
  | 'minWidth'
  | 'maxWidth'
  | 'collapseThreshold'
>) {
  const [isResizing, setIsResizing] = useState(false);

  // 리사이즈 중 마우스 이동 및 해제 처리
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      onWidthChange(clampedWidth);

      // 너비가 접힘 임계값 이하이면 접기
      if (newWidth < collapseThreshold) {
        onCollapsedChange(true);
      } else {
        onCollapsedChange(false);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth, collapseThreshold, onWidthChange, onCollapsedChange]);

  const startResize = useCallback(() => {
    setIsResizing(true);
  }, []);

  return { isResizing, startResize };
}

// ============ Component ============
export function SidebarResizer({
  isSidebarCollapsed,
  sidebarWidth,
  onWidthChange,
  onToggle,
  onCollapsedChange,
  minWidth = 180,
  maxWidth = 400,
  collapseThreshold = 100,
}: SidebarResizerProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 드래그 시작 지점 저장
      const startX = e.clientX;
      let dragging = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging) {
          // 일정 거리 이상 움직이면 드래그로 판단
          if (Math.abs(moveEvent.clientX - startX) > 5) {
            dragging = true;
            setIsDragging(true);
          }
        }

        if (dragging) {
          const newWidth = moveEvent.clientX;
          const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
          onWidthChange(clampedWidth);

          // 너비가 접힘 임계값 이하이면 접기
          if (newWidth < collapseThreshold) {
            onCollapsedChange(true);
          } else {
            onCollapsedChange(false);
          }
        }
      };

      const handleMouseUp = () => {
        if (!dragging) {
          // 드래그 없이 클릭만 했으면 토글
          onToggle();
        }
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [minWidth, maxWidth, collapseThreshold, onWidthChange, onCollapsedChange, onToggle]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`hidden lg:flex absolute top-0 bottom-0 z-20 items-center justify-center group ${
        isDragging ? 'cursor-grabbing' : 'cursor-col-resize'
      } ${isSidebarCollapsed ? 'w-8 ml-0' : 'w-4 -ml-2'}`}
      style={{ left: isSidebarCollapsed ? '0px' : `${sidebarWidth}px` }}
      title={isSidebarCollapsed ? '클릭: 사이드바 열기' : '클릭: 사이드바 닫기 | 드래그: 너비 조절'}
    >
      {/* 리사이즈 힌트 라인 (열린 상태에서만 표시) */}
      {!isSidebarCollapsed && (
        <div
          className={`absolute top-0 bottom-0 w-[2px] rounded-full transition-all duration-200 ${
            isDragging
              ? 'bg-[#ED6C00] shadow-[0_0_8px_rgba(237,108,0,0.5)]'
              : `${BG_COLOR.muted} group-hover:bg-[#ED6C00]/70`
          }`}
        />
      )}

      {/* 토글 버튼 */}
      <div
        className={`relative w-6 h-8 flex items-center justify-center rounded-full border transition-all duration-200 ${
          isSidebarCollapsed
            ? `${BG_COLOR.card} border-[#ED6C00] shadow-md hover:shadow-lg hover:scale-105`
            : isDragging
              ? `${BG_COLOR.card} border-[#ED6C00] shadow-lg shadow-[#ED6C00]/20 scale-110`
              : `${BG_COLOR.card} ${BORDER_COLOR.default} shadow-md hover:shadow-lg hover:border-[#ED6C00]/50 hover:scale-105`
        }`}
      >
        {isSidebarCollapsed ? (
          <FaChevronRight className="text-[10px] text-[#ED6C00] transition-colors duration-200" />
        ) : (
          <FaChevronLeft
            className={`text-[10px] transition-colors duration-200 ${
              isDragging ? 'text-[#ED6C00]' : `${TEXT_COLOR.disabled} group-hover:text-[#ED6C00]`
            }`}
          />
        )}
      </div>
    </div>
  );
}
