/**
 * 관리자 문의 카드 우클릭 컨텍스트 메뉴
 * - 분류된 카드에서만 노출 (미분류 카드는 인라인 버튼과 중복 방지)
 * - 2개 재분류 항목: 칼선의뢰, 목형의뢰
 * - 현재 타입과 동일한 항목은 disabled
 * - 외부 클릭 / ESC → onClose 호출
 */
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, Hammer, FolderOpen } from 'lucide-react';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { buildWebhardUrl } from '@/lib/utils/webhard-url';
import type { Contact, InquiryType } from '@/lib/types';

interface ContactContextMenuProps {
  contact: Contact;
  x: number;
  y: number;
  onSelectInquiryType: (inquiryType: InquiryType) => void;
  onClose: () => void;
}

const MENU_WIDTH = 180;
// 재분류 2개 + 구분선 + "웹하드에서 열기" 1개 ≒ 140px
const MENU_HEIGHT = 140;

export function ContactContextMenu({
  contact,
  x,
  y,
  onSelectInquiryType,
  onClose,
}: ContactContextMenuProps) {
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

  const adjustedStyle = {
    top: Math.min(y, window.innerHeight - MENU_HEIGHT),
    left: Math.min(x, window.innerWidth - MENU_WIDTH),
  };

  const isCuttingDisabled = contact.inquiry_type === 'cutting_request';
  const isMoldDisabled = contact.inquiry_type === 'mold_request';
  const webhardUrl = buildWebhardUrl(contact.webhard_folder_id, contact.webhard_file_id);
  const isWebhardDisabled = !webhardUrl;

  const handleSelect = (inquiryType: InquiryType) => {
    onSelectInquiryType(inquiryType);
    onClose();
  };

  const handleOpenWebhard = () => {
    if (!webhardUrl) return;
    router.push(webhardUrl);
    onClose();
  };

  const itemBase = `w-full flex items-center gap-2 px-3 py-2.5 text-sm ${TRANSITION_STYLES.colors}`;

  return (
    <div
      ref={menuRef}
      role="menu"
      className={`fixed z-50 ${BG_COLOR.card} rounded-lg shadow-lg border ${BORDER_COLOR.default} py-1 min-w-[180px]`}
      style={adjustedStyle}
    >
      <button
        type="button"
        role="menuitem"
        onClick={handleOpenWebhard}
        disabled={isWebhardDisabled}
        title={isWebhardDisabled ? '웹하드 폴더 미생성' : undefined}
        className={`${itemBase} ${BG_COLOR.hoverMuted} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        aria-label="웹하드에서 열기"
      >
        <FolderOpen className="w-4 h-4 text-brand" />
        <span className={TEXT_COLOR.primary}>웹하드에서 열기</span>
      </button>
      <hr className={`my-1 border-t ${BORDER_COLOR.default}`} />
      <button
        type="button"
        role="menuitem"
        onClick={() => handleSelect('cutting_request')}
        disabled={isCuttingDisabled}
        className={`${itemBase} ${BG_COLOR.hoverMuted} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        aria-label="칼선의뢰로 변경"
      >
        <Scissors className="w-4 h-4 text-info" />
        <span className={TEXT_COLOR.primary}>칼선의뢰로 변경</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => handleSelect('mold_request')}
        disabled={isMoldDisabled}
        className={`${itemBase} ${BG_COLOR.hoverMuted} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        aria-label="목형의뢰로 변경"
      >
        <Hammer className="w-4 h-4 text-success" />
        <span className={TEXT_COLOR.primary}>목형의뢰로 변경</span>
      </button>
    </div>
  );
}
