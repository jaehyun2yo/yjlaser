'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FaTrash, FaUndo } from 'react-icons/fa';
import { deleteCompany, restoreCompany } from '@/app/actions/companies';
import { Button } from '@/components/ui/button';

interface CompanyDeleteActionsProps {
  companyId: number;
  companyName: string;
  status: 'active' | 'inactive' | 'pending' | 'deleted';
  deletedAt?: string | null;
  restoreDeadlineAt?: string | null;
}

export function CompanyDeleteActions({
  companyId,
  companyName,
  status,
  deletedAt,
  restoreDeadlineAt,
}: CompanyDeleteActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const restoreDeadlineLabel = useMemo(() => {
    if (!restoreDeadlineAt) return null;
    return new Date(restoreDeadlineAt).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [restoreDeadlineAt]);

  const handleDelete = () => {
    const confirmed = window.confirm(
      `${companyName} 업체를 삭제 대기 상태로 변경할까요?\n\n매칭된 웹하드 업체 폴더와 하위 파일/폴더는 휴지통으로 이동합니다.\n30일 이내 업체 상세 페이지에서 복구할 수 있습니다.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteCompany(companyId);
      if (!result.success) {
        window.alert(result.error || '업체 삭제 처리에 실패했습니다.');
        return;
      }
      window.alert('업체가 삭제 대기 상태로 변경되었습니다.');
      router.refresh();
    });
  };

  const handleRestore = () => {
    const deletedLabel = deletedAt
      ? new Date(deletedAt).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '삭제일 미상';
    const confirmed = window.confirm(
      `${companyName} 업체를 복구할까요?\n\n삭제일: ${deletedLabel}${
        restoreDeadlineLabel ? `\n복구 가능 기한: ${restoreDeadlineLabel}` : ''
      }`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await restoreCompany(companyId);
      if (!result.success) {
        window.alert(result.error || '업체 복구에 실패했습니다.');
        return;
      }
      window.alert('업체가 복구되었습니다.');
      router.refresh();
    });
  };

  if (status === 'deleted') {
    return (
      <Button
        variant="outline"
        size="sm"
        className="!py-2 !px-4"
        disabled={isPending}
        onClick={handleRestore}
      >
        <FaUndo />
        업체 복구
      </Button>
    );
  }

  return (
    <Button
      variant="danger"
      size="sm"
      className="!py-2 !px-4"
      disabled={isPending}
      onClick={handleDelete}
    >
      <FaTrash />
      업체 삭제
    </Button>
  );
}
