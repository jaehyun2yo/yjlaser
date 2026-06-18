'use client';

import { useEffect, useState, useCallback } from 'react';
import { FaBell } from 'react-icons/fa';
import { logger } from '@/lib/utils/logger';
import type { AdminBadgeResponse } from '@/app/api/admin/badge/route';
import { BG_COLOR } from '@/lib/styles';

const badgeLogger = logger.createLogger('AdminNotificationBadge');

interface AdminNotificationBadgeProps {
  userType?: 'admin' | 'company' | null;
}

export function AdminNotificationBadge({ userType }: AdminNotificationBadgeProps) {
  const [newContactCount, setNewContactCount] = useState<number>(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState<number>(0);
  const [showTooltip, setShowTooltip] = useState(false);

  // API Route를 통해 뱃지 카운트 가져오기
  const fetchBadgeCounts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/badge?type=both');
      if (!response.ok) {
        badgeLogger.error('Failed to fetch badge counts', { status: response.status });
        return;
      }
      const data: AdminBadgeResponse = await response.json();
      setNewContactCount(data.newContactCount);
      setPendingFeedbackCount(data.pendingFeedbackCount);
    } catch (error) {
      badgeLogger.error('Error fetching badge counts', error);
    }
  }, []);

  useEffect(() => {
    // 관리자가 아닌 경우 뱃지 표시 안 함
    if (userType !== 'admin') {
      return;
    }

    // 초기 개수 가져오기
    fetchBadgeCounts();

    // 주기적으로 개수 갱신
    const interval = setInterval(() => {
      fetchBadgeCounts();
    }, 10000); // 10초마다 갱신

    return () => {
      clearInterval(interval);
    };
  }, [userType, fetchBadgeCounts]);

  const totalCount = newContactCount + pendingFeedbackCount;

  // 관리자가 아니거나 알림이 없으면 뱃지 표시 안 함
  if (userType !== 'admin' || totalCount === 0) {
    return null;
  }

  return (
    <span
      className="absolute -top-1 -right-1 z-10"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="flex items-center justify-center min-w-[14px] h-[14px] px-1 bg-red-500 text-white text-[8px] font-bold rounded-full leading-none">
        <FaBell className="text-[8px]" />
      </span>

      {/* 툴팁 */}
      {showTooltip && (
        <div
          className={`absolute top-full right-0 mt-2 w-48 ${BG_COLOR.tooltip} text-white text-xs rounded-lg shadow-lg p-3 z-50 whitespace-nowrap`}
        >
          <div className="space-y-1.5">
            {newContactCount > 0 && (
              <div className="flex items-center justify-between">
                <span>문의하기</span>
                <span className="font-semibold ml-2">{newContactCount}건</span>
              </div>
            )}
            {pendingFeedbackCount > 0 && (
              <div className="flex items-center justify-between">
                <span>불편사항 접수</span>
                <span className="font-semibold ml-2">{pendingFeedbackCount}건</span>
              </div>
            )}
          </div>
          {/* 툴팁 화살표 */}
          <div
            className={`absolute -top-1 right-4 w-2 h-2 ${BG_COLOR.tooltip} transform rotate-45`}
          ></div>
        </div>
      )}
    </span>
  );
}
