'use client';

import { BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, Kanban, PackageCheck } from 'lucide-react';

interface NavTab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navTabs: NavTab[] = [
  {
    href: '/admin/work-management',
    label: '문의',
    icon: <Mail className="w-4 h-4" />,
  },
  {
    href: '/admin/work-management/board',
    label: '작업',
    icon: <Kanban className="w-4 h-4" />,
  },
  {
    href: '/admin/work-management/delivered',
    label: '납품 완료',
    icon: <PackageCheck className="w-4 h-4" />,
  },
];

export function WorkManagementNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin/work-management') {
      return pathname === '/admin/work-management';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className={`flex items-center gap-1 border-b ${BORDER_COLOR.default} mb-6 overflow-x-auto pb-0`}
    >
      {navTabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            isActive(tab.href)
              ? 'border-[#ED6C00] text-[#ED6C00]'
              : `border-transparent ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary} ${BORDER_COLOR.hoverGray}`
          }`}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
