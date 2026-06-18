'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { FaPhone, FaFax, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const pathname = usePathname();

  // 관리자 페이지, 업체 페이지, 웹하드 페이지, 로그인 페이지에서는 Footer 숨김
  if (
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/company/') ||
    pathname?.startsWith('/webhard') ||
    pathname?.startsWith('/worker') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/register')
  ) {
    return null;
  }

  // 홈페이지는 항상 다크 테마, 다른 페이지는 다크/라이트 모드 지원
  const isHomePage = pathname === '/';

  return (
    <footer
      className={`border-t mt-auto relative z-20 transition-colors duration-300 ${
        isHomePage ? 'bg-[#0a0a0a] border-gray-800' : `${BG_COLOR.page} ${BORDER_COLOR.default}`
      }`}
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* 로고 및 회사 소개 */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block mb-6" aria-label="홈으로 이동">
              <div className="h-10 w-auto overflow-hidden flex items-center">
                <Image
                  src="/mainLogo.svg"
                  alt="회사 로고"
                  width={140}
                  height={45}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </Link>
            <p
              className={`text-sm leading-relaxed max-w-md mb-6 ${
                isHomePage ? 'text-gray-400' : TEXT_COLOR.secondary
              }`}
            >
              유진레이저목형은 고객 맞춤형 박스 솔루션을 제공하는 전문 기업입니다. 정밀한 설계와
              품질 관리로 최상의 패키지를 제작합니다.
            </p>
            <div
              className={`flex items-center gap-2 text-sm ${
                isHomePage ? 'text-gray-500' : TEXT_COLOR.muted
              }`}
            >
              <FaMapMarkerAlt className="text-[#ED6C00]" aria-hidden="true" />
              <span>서울 중구 퇴계로39길 20, 2층</span>
            </div>
          </div>

          {/* 연락처 정보 */}
          <div>
            <h3 className={`font-semibold mb-4 ${isHomePage ? 'text-white' : TEXT_COLOR.primary}`}>
              연락처
            </h3>
            <div
              className={`space-y-3 text-sm ${isHomePage ? 'text-gray-400' : TEXT_COLOR.secondary}`}
            >
              <p className="flex items-center gap-3">
                <FaPhone className="text-[#ED6C00] text-xs" aria-hidden="true" />
                <a
                  href="tel:02-2264-8070"
                  className="hover:text-[#ED6C00] transition-colors duration-200"
                >
                  02-2264-8070
                </a>
              </p>
              <p className="flex items-center gap-3">
                <FaFax className="text-[#ED6C00] text-xs" aria-hidden="true" />
                <span>02-2264-8310</span>
              </p>
              <p className="flex items-center gap-3">
                <FaEnvelope className="text-[#ED6C00] text-xs" aria-hidden="true" />
                <a
                  href="mailto:aone8070@korea.com"
                  className="hover:text-[#ED6C00] transition-colors duration-200"
                >
                  aone8070@korea.com
                </a>
              </p>
              <p className={`text-xs mt-4 ${isHomePage ? 'text-gray-500' : TEXT_COLOR.muted}`}>
                평일 9:00 ~ 19:00
                <br />
                주말 및 공휴일 휴무
              </p>
            </div>
          </div>

          {/* 빠른 링크 */}
          <div>
            <h3 className={`font-semibold mb-4 ${isHomePage ? 'text-white' : TEXT_COLOR.primary}`}>
              바로가기
            </h3>
            <nav
              className={`space-y-3 text-sm ${isHomePage ? 'text-gray-400' : TEXT_COLOR.secondary}`}
              aria-label="바로가기"
            >
              <Link
                href="/portfolio"
                className="block hover:text-[#ED6C00] transition-colors duration-200"
              >
                포트폴리오
              </Link>
              <Link
                href="/notice"
                className="block hover:text-[#ED6C00] transition-colors duration-200"
              >
                공지사항
              </Link>
              <Link
                href="/blog"
                className="block hover:text-[#ED6C00] transition-colors duration-200"
              >
                블로그
              </Link>
              <Link
                href="/contact"
                className="block hover:text-[#ED6C00] transition-colors duration-200"
              >
                문의하기
              </Link>
            </nav>
          </div>
        </div>

        {/* 저작권 정보 */}
        <div
          className={`border-t pt-8 mt-12 ${isHomePage ? 'border-gray-800' : BORDER_COLOR.default}`}
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p
              className={`text-sm text-center md:text-left ${
                isHomePage ? 'text-gray-500' : TEXT_COLOR.muted
              }`}
              suppressHydrationWarning
            >
              © {currentYear} YJ Laser. All rights reserved.
            </p>
            <div
              className={`flex gap-6 text-sm ${isHomePage ? 'text-gray-500' : TEXT_COLOR.muted}`}
            >
              <Link
                href="/privacy"
                className="hover:text-[#ED6C00] transition-colors duration-200"
                aria-label="개인정보처리방침"
              >
                개인정보처리방침
              </Link>
              <Link
                href="/terms"
                className="hover:text-[#ED6C00] transition-colors duration-200"
                aria-label="이용약관"
              >
                이용약관
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
