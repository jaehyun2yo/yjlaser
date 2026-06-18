'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FaBell } from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface CompanyTopBarProps {
  companyName: string;
  notificationCount?: number;
  onNotificationClick?: () => void;
}

export function CompanyTopBar({
  companyName: _companyName,
  notificationCount = 0,
  onNotificationClick,
}: CompanyTopBarProps) {
  return (
    <header
      className={`sticky top-0 z-40 ${BG_COLOR.page} border-b ${BORDER_COLOR.default} lg:hidden print:hidden`}
    >
      <div className="flex items-center justify-between h-14 px-4">
        {/* 좌측: 로고 */}
        <Link href="/" className="flex items-center">
          <Image src="/mainLogo.svg" alt="Logo" width={120} height={18.403} priority />
        </Link>

        {/* 우측: 알림 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onNotificationClick}
            className={`relative p-2 ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary} rounded-lg ${BG_COLOR.hoverMuted} transition-colors`}
            aria-label="알림"
          >
            <FaBell className="text-lg" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
