'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCompanyStatus } from '@/app/actions/companies';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ApproveButton');

interface ApproveButtonProps {
  companyId: number;
  currentStatus: string;
}

export function ApproveButton({ companyId, currentStatus }: ApproveButtonProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleApprove = async () => {
    if (isUpdating) return;
    if (!confirm('이 업체를 승인하시겠습니까?')) return;

    setIsUpdating(true);
    try {
      const result = await updateCompanyStatus(companyId, 'active');
      if (result.success) {
        router.refresh();
      } else {
        alert('업체 승인에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (error) {
      log.error('Error approving company:', error);
      alert('업체 승인 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = async () => {
    if (isUpdating) return;
    if (!confirm('이 업체를 거부하시겠습니까? (비활성화됩니다)')) return;

    setIsUpdating(true);
    try {
      const result = await updateCompanyStatus(companyId, 'inactive');
      if (result.success) {
        router.refresh();
      } else {
        alert('업체 거부에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (error) {
      log.error('Error rejecting company:', error);
      alert('업체 거부 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (currentStatus === 'active') {
    return (
      <Button
        onClick={handleReject}
        disabled={isUpdating}
        variant="secondary"
        className="!py-2 !px-4 flex items-center gap-2"
      >
        <FaTimesCircle />
        {isUpdating ? '처리중...' : '비활성화'}
      </Button>
    );
  }

  if (currentStatus === 'inactive') {
    return (
      <Button
        onClick={handleApprove}
        disabled={isUpdating}
        className="!py-2 !px-4 flex items-center gap-2"
      >
        <FaCheckCircle />
        {isUpdating ? '처리중...' : '승인하기'}
      </Button>
    );
  }

  // pending 상태
  return (
    <div className="flex gap-3">
      <Button
        onClick={handleApprove}
        disabled={isUpdating}
        className="!py-2 !px-4 flex items-center gap-2"
      >
        <FaCheckCircle />
        {isUpdating ? '처리중...' : '승인하기'}
      </Button>
      <Button
        onClick={handleReject}
        disabled={isUpdating}
        variant="secondary"
        className="!py-2 !px-4 flex items-center gap-2"
      >
        <FaTimesCircle />
        {isUpdating ? '처리중...' : '거부하기'}
      </Button>
    </div>
  );
}
