'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from '@/components/home/SpringSummerHome.module.css';

interface HomeHeaderProps {
  isAuthenticated?: boolean;
  userType?: 'admin' | 'company' | null;
  companyName?: string | null;
}

const navItems = [
  { href: '#what-we-do', label: 'What we do' },
  { href: '#our-work', label: 'Our work' },
  { href: '#about-us', label: 'About us' },
];

export default function HomeHeader({
  isAuthenticated = false,
  userType = null,
  companyName = null,
}: HomeHeaderProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [time, setTime] = useState('--:--:--');

  const isHomePage = pathname === '/';
  const accountHref = userType === 'company' ? '/company/dashboard' : '/admin';
  const accountLabel = userType === 'company' && companyName ? companyName : 'Admin';

  const timeFormatter = useMemo(() => {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    });
  }, []);

  useEffect(() => {
    if (!isHomePage) return;

    const updateTime = () => {
      setTime(timeFormatter.format(new Date()));
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(intervalId);
  }, [isHomePage, timeFormatter]);

  useEffect(() => {
    if (!isHomePage) return;

    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset';

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isHomePage, isMobileMenuOpen]);

  if (!isHomePage) {
    return null;
  }

  return (
    <>
      <header
        className={`${styles.homeHeader} fixed inset-x-0 top-0 z-50 px-5 py-4 text-[#44394c] sm:px-8 lg:px-10`}
      >
        <div className="mx-auto grid h-10 max-w-[1440px] grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="홈으로 이동">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#44394c]">
              <Image
                src="/mainLogo.svg"
                alt="YJ Laser"
                width={25}
                height={25}
                className="h-6 w-6 object-contain"
              />
            </span>
            <span className="truncate text-sm tracking-[0.023em]">YJ Laser™</span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm tracking-[0.023em] md:flex" aria-label="홈 섹션">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:opacity-65">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center justify-end gap-8 text-sm tracking-[0.023em] md:flex">
            <span className="inline-flex items-center gap-2 text-[13px]">
              <span className="h-2 w-2 rounded-full border border-[#44394c]" aria-hidden="true" />
              {time}
            </span>
            <span>Seoul</span>
            {isAuthenticated && (
              <>
                <Link href="/webhard" className="transition hover:opacity-65">
                  Webhard
                </Link>
                <Link href={accountHref} className="max-w-28 truncate transition hover:opacity-65">
                  {accountLabel}
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            className="inline-flex items-center justify-end text-sm tracking-[0.023em] underline underline-offset-4 md:hidden"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
          >
            {isMobileMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-[#e5ebda] px-5 pb-8 pt-24 text-[#44394c] md:hidden"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
          >
            <nav className={`${styles.mobileMenuDisplay} mt-20 grid gap-4`}>
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-12 grid gap-3 border-t border-[#c0c3b6] pt-6 text-xs tracking-[0.02em]">
              <span>Seoul / {time}</span>
              <Link href="/contact" onClick={() => setIsMobileMenuOpen(false)}>
                Contact
              </Link>
              {isAuthenticated && (
                <>
                  <Link href="/webhard" onClick={() => setIsMobileMenuOpen(false)}>
                    Webhard
                  </Link>
                  <Link href={accountHref} onClick={() => setIsMobileMenuOpen(false)}>
                    {accountLabel}
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
