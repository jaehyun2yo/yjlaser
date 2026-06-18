'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminBadge } from '@/components/AdminBadge';

interface AdminNavLinkProps {
  href: string;
  children: React.ReactNode;
  showBadge?: boolean;
  badgeType?: 'contacts' | 'feedback';
}

export function AdminNavLink({
  href,
  children,
  showBadge = false,
  badgeType = 'contacts',
}: AdminNavLinkProps) {
  const pathname = usePathname();

  const isActive = () => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-semibold rounded-md transition-colors text-center ${
        isActive()
          ? 'bg-brand text-white'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted bg-muted'
      }`}
    >
      <span className="leading-tight">{children}</span>
      {showBadge && <AdminBadge userType="admin" type={badgeType} />}
    </Link>
  );
}
