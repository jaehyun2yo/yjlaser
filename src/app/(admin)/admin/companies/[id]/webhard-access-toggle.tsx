'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleWebhardAccess } from '@/app/actions/companies';
import { FaLock, FaUnlock } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('WebhardAccessToggle');

interface WebhardAccessToggleProps {
  companyId: number;
  currentAccess: boolean;
}

export function WebhardAccessToggle({ companyId, currentAccess }: WebhardAccessToggleProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async () => {
    if (isUpdating) return;

    const action = currentAccess ? '차단' : '허용';
    if (!confirm(`이 업체의 웹하드 접근을 ${action}하시겠습니까?`)) return;

    setIsUpdating(true);
    try {
      const result = await toggleWebhardAccess(companyId, !currentAccess);
      if (result.success) {
        router.refresh();
      } else {
        alert(`웹하드 접근 권한 변경에 실패했습니다: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      log.error('Error toggling webhard access:', error);
      alert('웹하드 접근 권한 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      onClick={handleToggle}
      disabled={isUpdating}
      variant={currentAccess ? 'danger' : 'primary'}
      className="!py-2 !px-4 flex items-center gap-2"
    >
      {currentAccess ? <FaLock /> : <FaUnlock />}
      {isUpdating ? '처리중...' : currentAccess ? '웹하드 차단' : '웹하드 허용'}
    </Button>
  );
}
