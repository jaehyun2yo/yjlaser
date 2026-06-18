'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('ConfirmButton');

interface ConfirmButtonProps {
  contactId: string;
  currentStatus: string;
}

export function ConfirmButton({ contactId, currentStatus }: ConfirmButtonProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleConfirm = async () => {
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

  const isAlreadyConfirmed =
    currentStatus === 'drawing' ||
    currentStatus === 'confirmed' ||
    currentStatus === 'production' ||
    currentStatus === 'cutting' ||
    currentStatus === 'finishing' ||
    currentStatus === 'delivered';

  return (
    <div className="space-y-2">
      {isAlreadyConfirmed ? (
        <div className={`p-4 ${BG_COLOR.successMedium} border ${BORDER_COLOR.success} rounded-lg`}>
          <p className={`text-sm ${TEXT_COLOR.successDeep} font-medium`}>
            ✓ {currentStatus === 'delivered' ? '납품완료' : '확인완료됨'}
          </p>
          <p className={`text-xs ${TEXT_COLOR.successStrong} mt-1`}>
            {currentStatus === 'delivered'
              ? '이 문의는 납품 완료 처리되었습니다.'
              : '이 문의는 확인 완료되었습니다. 공정 단계를 관리할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <button
          onClick={handleConfirm}
          disabled={isUpdating}
          className="w-full px-4 py-3 bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? '처리중...' : '확인완료'}
        </button>
      )}
    </div>
  );
}
