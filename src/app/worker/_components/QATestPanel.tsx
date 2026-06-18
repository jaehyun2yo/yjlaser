'use client';

import { useState } from 'react';
import { createQATestContacts, deleteQATestContacts } from '@/app/actions/qa-test';
import { useQueryClient } from '@tanstack/react-query';
import { BUTTON_STYLES, BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { cn } from '@/lib/utils';

interface CreatedContact {
  contactId: string;
  workNumber: string;
  companyName: string;
  processStage: string;
}

export default function QATestPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<CreatedContact[]>([]);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await createQATestContacts();
      if (result.success) {
        setContacts(result.contacts);
        setMessage(`${result.contacts.length}건 생성 완료`);
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      } else {
        setMessage(`생성 실패: ${result.error}`);
      }
    } catch (err) {
      setMessage(`에러: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setMessage('');
    try {
      const ids = contacts.length > 0 ? contacts.map((c) => c.contactId) : undefined;
      const result = await deleteQATestContacts(ids);
      if (result.success) {
        setMessage(`${result.deleted}건 삭제 완료`);
        setContacts([]);
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      } else {
        setMessage(`삭제 실패: ${result.error}`);
      }
    } catch (err) {
      setMessage(`에러: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-50 rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-white opacity-50 hover:opacity-100"
      >
        QA
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 z-50 w-80 rounded-xl border p-4 shadow-2xl',
        BORDER_COLOR.default,
        BG_COLOR.card
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className={cn('text-sm font-bold', TEXT_COLOR.primary)}>네스팅 QA 테스트</h3>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={loading || contacts.length > 0}
          className={cn(
            BUTTON_STYLES.primary,
            'flex-1 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40'
          )}
        >
          {loading ? '처리 중...' : '테스트 문의 생성 (5건)'}
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className={cn(
            BUTTON_STYLES.danger,
            'flex-1 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40'
          )}
        >
          삭제
        </button>
      </div>

      {message && (
        <p
          className={cn(
            'mb-2 text-xs',
            message.includes('실패') || message.includes('에러') ? 'text-red-500' : 'text-green-600'
          )}
        >
          {message}
        </p>
      )}

      {contacts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">생성된 테스트 문의:</p>
          {contacts.map((c) => (
            <div key={c.contactId} className={cn('rounded-lg p-2 text-xs', BG_COLOR.grayLighter)}>
              <div className="flex justify-between">
                <span className={cn('font-medium', TEXT_COLOR.primary)}>{c.companyName}</span>
                <span className="font-mono text-orange-600">{c.workNumber}</span>
              </div>
              <div className="mt-0.5 text-gray-500">공정: {c.processStage}</div>
            </div>
          ))}
        </div>
      )}

      <div className={cn('mt-3 border-t pt-2', BORDER_COLOR.lightMedium)}>
        <p className="text-[10px] text-gray-400">
          테스트 파일: 260410-F-00x 형식의 DXF 파일로 네스팅 후 공정 단계 전환 확인
        </p>
      </div>
    </div>
  );
}
