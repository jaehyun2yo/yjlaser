'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('TestNewContactButton');

export function TestNewContactButton() {
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const router = useRouter();

  const isDisabled = isCreating || isDeleting || isDeletingAll;

  const handleCreateTestContacts = async () => {
    if (!confirm('신규 문의 50개를 생성하시겠습니까?')) {
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/admin/test-contacts', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message || '50개의 테스트 문의사항이 생성되었습니다.');
        router.refresh();
      } else {
        alert('테스트 문의사항 생성에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (error) {
      log.error('Error creating test contacts:', error);
      alert('테스트 문의사항 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAllTestContacts = async () => {
    if (
      !confirm(
        '"신규 문의 50개 생성"으로 만든 모든 테스트 문의를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.'
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/admin/test-contacts/delete-all', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message || `${result.deletedCount}개의 테스트 문의가 삭제되었습니다.`);
        router.refresh();
      } else {
        alert('테스트 문의 삭제에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (error) {
      log.error('Error deleting test contacts:', error);
      alert('테스트 문의 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllContacts = async () => {
    if (!confirm('정말로 모든 문의를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    const confirmText = prompt('확인을 위해 "모든문의삭제"를 입력해주세요:');
    if (confirmText !== '모든문의삭제') {
      alert('입력이 일치하지 않습니다. 삭제가 취소되었습니다.');
      return;
    }

    setIsDeletingAll(true);
    try {
      const response = await fetch('/api/admin/contacts/delete-all', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message || `${result.deletedCount}개의 모든 문의가 삭제되었습니다.`);
        router.refresh();
      } else {
        alert('모든 문의 삭제에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
      }
    } catch (error) {
      log.error('Error deleting all contacts:', error);
      alert('모든 문의 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
      <button
        onClick={handleCreateTestContacts}
        disabled={isDisabled}
        className="px-4 py-2 bg-[#ED6C00] hover:bg-[#d15f00] text-white rounded-lg shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
      >
        {isCreating ? '생성 중...' : '🧪 신규 문의 50개 생성'}
      </button>
      <button
        onClick={handleDeleteAllTestContacts}
        disabled={isDisabled}
        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
      >
        {isDeleting ? '삭제 중...' : '🗑️ 테스트 문의 전부 삭제'}
      </button>
      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={handleDeleteAllContacts}
          disabled={isDisabled}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium border-2 border-red-400"
        >
          {isDeletingAll ? '삭제 중...' : '⚠️ 모든 문의 삭제'}
        </button>
      )}
    </div>
  );
}
