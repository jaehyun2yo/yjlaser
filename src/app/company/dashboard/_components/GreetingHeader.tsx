'use client';

import { useState, useEffect } from 'react';
import { FaChartLine } from 'react-icons/fa';
import Link from 'next/link';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface GreetingHeaderProps {
  companyName: string;
  isRefreshing?: boolean;
}

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후에요';
  return '좋은 저녁이에요';
}

function formatDate(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  };
  return now.toLocaleDateString('ko-KR', options);
}

export function GreetingHeader({ companyName, isRefreshing }: GreetingHeaderProps) {
  const [greeting, setGreeting] = useState('안녕하세요');
  const [dateString, setDateString] = useState('');

  useEffect(() => {
    setGreeting(getTimeBasedGreeting());
    setDateString(formatDate());
  }, []);

  return (
    <div
      className={`animate-fadeInUp ${BG_COLOR.gradientCard} rounded-2xl sm:rounded-3xl overflow-hidden border ${BORDER_COLOR.default}/50 shadow-2xl p-4 sm:p-6 relative`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#ED6C00] rounded-lg flex items-center justify-center">
            <FaChartLine className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <p className={`${TEXT_COLOR.primary} font-semibold text-sm sm:text-base`}>대시보드</p>
            <p className="text-gray-500 text-[10px] sm:text-xs">실시간 현황</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse" />
          <span className={`${TEXT_COLOR.success} text-[10px] sm:text-xs`}>
            {isRefreshing ? '업데이트 중...' : 'Live'}
          </span>
        </div>
      </div>

      {/* 인사말 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className={`text-xl sm:text-2xl lg:text-3xl font-extrabold ${TEXT_COLOR.strong}`}>
            {greeting}, <span className="text-[#ED6C00]">{companyName}</span>님
          </h1>
          <Link
            href="/contact"
            className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#ED6C00] hover:bg-[#ED6C00] hover:text-white px-3 py-1 rounded-lg transition-all duration-200"
          >
            새로운문의하기
          </Link>
        </div>
        <p className={`${TEXT_COLOR.secondary} text-sm sm:text-base`}>
          문의 및 주문 진행상황을 확인하실 수 있습니다.
        </p>
        <p className="text-gray-500 text-xs sm:text-sm">{dateString}</p>
      </div>

      {/* 스캔라인 효과 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl sm:rounded-3xl">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent animate-scan" />
      </div>
    </div>
  );
}
