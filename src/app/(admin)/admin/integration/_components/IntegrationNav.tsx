'use client';

import { BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Monitor,
  Settings,
  Building,
  Calendar,
  Wrench,
  Users,
  HardDrive,
  Activity,
  Gauge,
} from 'lucide-react';

interface NavTab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navTabs: NavTab[] = [
  {
    href: '/admin/integration/programs',
    label: '프로그램',
    icon: <Monitor className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/operations',
    label: '운영현황',
    icon: <Gauge className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/companies',
    label: '업체관리',
    icon: <Building className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/webhard',
    label: '웹하드관리',
    icon: <HardDrive className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/bookings',
    label: '예약관리',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/workers',
    label: '작업자관리',
    icon: <Users className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/health',
    label: '시스템상태',
    icon: <Activity className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/system',
    label: '시스템관리',
    icon: <Wrench className="w-4 h-4" />,
  },
  {
    href: '/admin/integration/settings',
    label: '일반설정',
    icon: <Settings className="w-4 h-4" />,
  },
];

export function IntegrationNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname.startsWith(href);
  };

  return (
    <nav className={`flex flex-wrap items-center gap-1 border-b ${BORDER_COLOR.default} mb-6 pb-0`}>
      {navTabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
            isActive(tab.href)
              ? 'border-brand text-brand'
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
