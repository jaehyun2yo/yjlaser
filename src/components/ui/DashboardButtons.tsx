'use client';

import { type ReactNode } from 'react';
import { FaEdit, FaExchangeAlt, FaTimes, FaPen, FaFolderOpen } from 'react-icons/fa';
import { DASHBOARD_ACTION_BUTTON } from '@/lib/styles';

interface BaseButtonProps {
  onClick: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * 카드 액션 버튼 — 흰색 배경 공통 스타일
 * 디자인시스템: DASHBOARD_ACTION_BUTTON.cardAction
 */
interface CardActionButtonProps {
  onClick: (e: React.MouseEvent) => void;
  icon?: ReactNode;
  label: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

export function CardActionButton({
  onClick,
  icon,
  label,
  className = '',
  disabled = false,
  title,
  ariaLabel,
}: CardActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick(e);
      }}
      className={`${DASHBOARD_ACTION_BUTTON.cardAction} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * 메모 버튼
 */
export function MemoButton({ onClick }: BaseButtonProps) {
  return (
    <CardActionButton onClick={onClick} icon={<FaPen className="text-[10px]" />} label="메모" />
  );
}

/**
 * 웹하드 이동 버튼
 */
export function WebhardMoveButton({ onClick, disabled, title }: BaseButtonProps) {
  return (
    <CardActionButton
      onClick={onClick}
      disabled={disabled}
      title={title}
      ariaLabel="웹하드로 이동"
      icon={<FaFolderOpen className="text-[10px]" />}
      label="웹하드"
    />
  );
}

/**
 * 수정요청 버튼
 */
interface RevisionButtonProps extends BaseButtonProps {
  isAdditional?: boolean;
}

export function RevisionButton({ onClick, isAdditional = false }: RevisionButtonProps) {
  return (
    <CardActionButton
      onClick={onClick}
      icon={<FaEdit className="text-[10px]" />}
      label={isAdditional ? '추가 수정요청' : '수정요청'}
    />
  );
}

/**
 * 예약변경 버튼
 */
export function BookingChangeButton({ onClick }: BaseButtonProps) {
  return (
    <CardActionButton
      onClick={onClick}
      icon={<FaExchangeAlt className="text-[10px]" />}
      label="예약변경"
    />
  );
}

/**
 * 예약취소 버튼
 */
export function BookingCancelButton({ onClick }: BaseButtonProps) {
  return (
    <CardActionButton
      onClick={onClick}
      icon={<FaTimes className="text-[10px]" />}
      label="예약취소"
    />
  );
}

/**
 * 액션 버튼 그룹 컨테이너
 */
interface ActionButtonGroupProps {
  children: React.ReactNode;
}

export function ActionButtonGroup({ children }: ActionButtonGroupProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
