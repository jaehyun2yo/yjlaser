'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCompanyStatus } from '@/app/actions/companies';
import { FaCheckCircle } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('QuickApproveButton');

interface QuickApproveButtonProps {
  companyId: number;
  currentStatus: string;
}

export function QuickApproveButton({ companyId, currentStatus }: QuickApproveButtonProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  if (currentStatus === 'active') {
    return null; // 이미 승인된 경우 버튼 숨김
  }

  const handleApprove = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      const result = await updateCompanyStatus(companyId, 'active');
      if (result.success) {
        router.refresh();
      } else {
        alert('업체 승인에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error approving company:', error);
      alert('업체 승인 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <button
      onClick={handleApprove}
      disabled={isUpdating}
      className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium ${TEXT_COLOR.brand} ${TEXT_COLOR.brandHover} ${BG_COLOR.hoverBrand} rounded ${TRANSITION_STYLES.colors} disabled:opacity-50 disabled:cursor-not-allowed`}
      title="빠른 승인"
    >
      <FaCheckCircle className="text-xs" />
      {isUpdating ? '처리중...' : '승인'}
    </button>
  );
}
