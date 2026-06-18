'use client';

/**
 * WebhardDragSelection
 * 웹하드 드래그 선택 박스 오버레이
 * - 마우스 드래그로 여러 파일 선택 시 표시
 */
import { memo } from 'react';

export interface BoundingRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface WebhardDragSelectionProps {
  /** 드래그 선택 중 여부 */
  isDragSelecting: boolean;
  /** 선택 박스 영역 (null이면 렌더링 안함) */
  boundingRect: BoundingRect | null;
}

/**
 * 웹하드 드래그 선택 박스 컴포넌트
 * 마우스 드래그 시 선택 영역 표시
 */
export const WebhardDragSelection = memo(function WebhardDragSelection({
  isDragSelecting,
  boundingRect,
}: WebhardDragSelectionProps) {
  // 드래그 선택 중이 아니거나 영역이 없으면 렌더링 안함
  if (!isDragSelecting || !boundingRect) {
    return null;
  }

  return (
    <div
      className="absolute border-2 border-[#ED6C00] bg-[#ED6C00]/10 pointer-events-none z-40"
      style={{
        left: `${boundingRect.left}px`,
        top: `${boundingRect.top}px`,
        width: `${boundingRect.width}px`,
        height: `${boundingRect.height}px`,
      }}
    />
  );
});

export default WebhardDragSelection;
