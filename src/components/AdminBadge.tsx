'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from './Badge';
import { logger } from '@/lib/utils/logger';
import type { AdminBadgeResponse } from '@/app/api/admin/badge/route';

const badgeLogger = logger.createLogger('AdminBadge');

interface AdminBadgeProps {
  userType?: 'admin' | 'company' | null;
  type?: 'contacts' | 'feedback' | 'both'; // 뱃지 타입: 문의사항, 불편사항, 둘 다
  inline?: boolean; // true면 인라인 스타일 (모바일 메뉴용)
}

export function AdminBadge({ userType, type = 'contacts', inline = false }: AdminBadgeProps) {
  const [newContactCount, setNewContactCount] = useState<number>(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState<number>(0);

  // API Route를 통해 뱃지 카운트 가져오기
  const fetchBadgeCounts = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/badge?type=${type}`);
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
  }, [type]);

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
  }, [userType, type, fetchBadgeCounts]);

  // 표시할 개수 계산
  let displayCount = 0;
  if (type === 'contacts') {
    displayCount = newContactCount;
  } else if (type === 'feedback') {
    displayCount = pendingFeedbackCount;
  } else if (type === 'both') {
    displayCount = newContactCount + pendingFeedbackCount;
  }

  // 관리자가 아니면 뱃지 표시 안 함
  if (userType !== 'admin') {
    return null;
  }

  if (inline) {
    return <Badge count={displayCount} variant="inline" size="lg" />;
  }

  return <Badge count={displayCount} variant="default" size="sm" />;
}
