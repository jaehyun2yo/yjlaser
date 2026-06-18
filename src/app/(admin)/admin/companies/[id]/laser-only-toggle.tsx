'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleLaserOnly } from '@/app/actions/companies';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('LaserOnlyToggle');

interface LaserOnlyToggleProps {
  companyId: number;
  currentLaserOnly: boolean;
}

export function LaserOnlyToggle({ companyId, currentLaserOnly }: LaserOnlyToggleProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async () => {
    if (isUpdating) return;

    const action = currentLaserOnly ? '해제' : '설정';
    if (!confirm(`이 업체를 레이저가공 전용으로 ${action}하시겠습니까?`)) return;

    setIsUpdating(true);
    try {
      const result = await toggleLaserOnly(companyId, !currentLaserOnly);
      if (result.success) {
        router.refresh();
      } else {
        alert(`레이저 전용 설정 변경에 실패했습니다: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      log.error('Error toggling laser only:', error);
      alert('레이저 전용 설정 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      onClick={handleToggle}
      disabled={isUpdating}
      variant={currentLaserOnly ? 'ghost' : 'primary'}
      className="!py-2 !px-4 flex items-center gap-2"
    >
      {isUpdating ? '처리중...' : currentLaserOnly ? '레이저 전용 해제' : '레이저 전용 설정'}
    </Button>
  );
}
