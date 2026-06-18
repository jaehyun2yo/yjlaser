'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BG_COLOR, TEXT_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('MarkAsReadButton');

interface MarkAsReadButtonProps {
  contactId: string;
}

export function MarkAsReadButton({ contactId }: MarkAsReadButtonProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleMarkAsRead = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/contacts/${contactId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'drawing' }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        alert('상태 변경에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error updating status:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <button
      onClick={handleMarkAsRead}
      disabled={isUpdating}
      className={`px-3 py-1 text-xs ${BG_COLOR.warning} ${TEXT_COLOR.warning} rounded ${BG_COLOR.hoverWarningDark} ${TRANSITION_STYLES.colors} disabled:opacity-50`}
    >
      {isUpdating ? '처리중...' : '읽음'}
    </button>
  );
}
