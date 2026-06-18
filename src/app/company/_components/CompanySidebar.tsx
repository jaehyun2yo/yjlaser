'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  FaClipboardList,
  FaFileInvoice,
  FaExclamationCircle,
  FaCloud,
  FaUserEdit,
  FaSignOutAlt,
  FaBoxOpen,
} from 'react-icons/fa';
import { logoutAction } from '@/app/actions/auth';
import { SIDEBAR, TEXT_COLOR, BORDER_COLOR, BG_COLOR } from '@/lib/styles';
import { WebhardBadge } from '@/components/WebhardBadge';
import { ThemeToggle } from '@/components/ThemeToggle';

interface CompanySidebarProps {
  companyName: string;
  width: number;
  onResize: (width: number) => void;
}

const primaryNavItems = [
  { href: '/company/dashboard', label: '진행상황', icon: <FaClipboardList /> },
  { href: '/company/orders', label: '주문 현황', icon: <FaBoxOpen /> },
  { href: '/company/billing', label: '청구서', icon: <FaFileInvoice /> },
  { href: '/company/feedback', label: '불편사항', icon: <FaExclamationCircle /> },
];

const secondaryNavItems = [
  { href: '/webhard', label: '웹하드', icon: <FaCloud />, hasBadge: true },
  { href: '/company/profile', label: '정보수정', icon: <FaUserEdit /> },
];

export function CompanySidebar({
  companyName: _companyName,
  width,
  onResize,
}: CompanySidebarProps) {
  const pathname = usePathname();

  const isActiveLink = (href: string) => {
    if (href === '/company/dashboard') {
      return pathname === '/company/dashboard' || pathname === '/company';
    }
    return pathname.startsWith(href);
  };

  // 리사이즈 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      // 최소 180px, 최대 400px
      const clampedWidth = Math.min(Math.max(newWidth, 180), 400);
      onResize(clampedWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <aside className={SIDEBAR.container} style={{ width: `${width}px` }}>
      {/* 로고 - 홈으로 이동 */}
      <div className="flex items-center justify-center px-4 pb-4">
        <Link href="/" className="flex items-center">
          <div className="h-10 w-auto overflow-hidden flex items-center">
            <Image
              src="/mainLogo.svg"
              alt="유진레이저목형 로고"
              width={120}
              height={40}
              className="max-h-full max-w-full object-contain hover:opacity-80 transition-opacity"
              priority
            />
          </div>
        </Link>
      </div>

      {/* Primary 네비게이션 */}
      <nav className={SIDEBAR.navSection}>
        <div className="space-y-1">
          {primaryNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${SIDEBAR.navItem} ${
                isActiveLink(item.href) ? SIDEBAR.navItemActive : SIDEBAR.navItemInactive
              }`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className={SIDEBAR.divider} />

        {/* Secondary 네비게이션 */}
        <div className="space-y-1">
          {secondaryNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${SIDEBAR.navItem} ${
                isActiveLink(item.href) ? SIDEBAR.navItemActive : SIDEBAR.navItemInactive
              } relative`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {item.hasBadge && <WebhardBadge />}
            </Link>
          ))}
        </div>
      </nav>

      {/* 푸터 - 테마 토글 + 로그아웃 */}
      <div className={SIDEBAR.footer}>
        {/* 테마 토글 */}
        <div className="flex items-center justify-between px-3 py-2 mb-2">
          <span className={`text-sm ${TEXT_COLOR.secondary}`}>테마</span>
          <ThemeToggle
            size="sm"
            variant="outline"
            className={`!w-auto !h-auto px-3 py-2 ${BORDER_COLOR.default} hover:border-[#ED6C00] hover:text-[#ED6C00]`}
          />
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className={`${SIDEBAR.navItem} ${SIDEBAR.navItemInactive} w-full ${TEXT_COLOR.error} hover:text-red-600 ${BG_COLOR.hoverError}`}
          >
            <FaSignOutAlt className="text-lg flex-shrink-0" />
            <span className="truncate">로그아웃</span>
          </button>
        </form>
      </div>

      {/* 리사이즈 핸들 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#ED6C00]/50 transition-colors group"
        onMouseDown={handleMouseDown}
      >
        <div
          className={`absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 ${BG_COLOR.muted} rounded-full opacity-0 group-hover:opacity-100 transition-opacity`}
        />
      </div>
    </aside>
  );
}
