'use client';

import { useState } from 'react';
import type { FC } from 'react';
import { X, AlertTriangle, MessageSquare, Trash2 } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import { ConfirmModal } from './ConfirmModal';
import type { WorkerNote } from '@/lib/types/contact';

const memoLogger = logger.createLogger('WorkerMemo');

interface WorkerMemoModalProps {
  contactId: string;
  companyName: string;
  existingNotes: WorkerNote[];
  onClose: () => void;
  onAdd: (data: { type: string; content: string }) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
}

export const WorkerMemoModal: FC<WorkerMemoModalProps> = ({
  contactId: _contactId,
  companyName,
  existingNotes,
  onClose,
  onAdd,
  onDelete,
}) => {
  const [content, setContent] = useState('');
  const [type, setType] = useState<'memo' | 'issue'>('memo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const canAddMore = existingNotes.length < 3;

  const handleSubmit = async () => {
    if (!content.trim() || !canAddMore) return;

    setIsSubmitting(true);
    try {
      await onAdd({ type, content: content.trim() });
      setContent('');
    } catch (err) {
      memoLogger.error('노트 추가 실패', err);
      setErrorModal('노트 추가에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    setDeletingId(noteId);
    try {
      await onDelete(noteId);
    } catch (err) {
      memoLogger.error('노트 삭제 실패', err);
      setErrorModal('노트 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">메모 / 이슈 보고</h3>
            <p className="text-xs text-gray-500">{companyName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 기존 노트 목록 */}
          {existingNotes.length > 0 && (
            <div className="px-4 pt-3 space-y-2">
              <p className="text-xs font-medium text-gray-500">
                등록된 노트 ({existingNotes.length}/3)
              </p>
              {existingNotes.map((note) => (
                <div
                  key={note.id}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                    note.type === 'issue'
                      ? 'bg-red-50 border border-red-100'
                      : 'bg-yellow-50 border border-yellow-100'
                  }`}
                >
                  {note.type === 'issue' ? (
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${note.type === 'issue' ? 'text-red-700' : 'text-yellow-800'}`}
                    >
                      {note.content}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {note.created_by} &middot;{' '}
                      {new Date(note.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    disabled={deletingId === note.id}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition shrink-0"
                    title="삭제"
                  >
                    {deletingId === note.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 새 노트 추가 폼 */}
          <div className="p-4 space-y-3">
            {canAddMore ? (
              <>
                <p className="text-xs font-medium text-gray-500">새 노트 추가</p>
                {/* 유형 선택 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('memo')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                      type === 'memo'
                        ? 'bg-blue-50 text-blue-700 border-2 border-blue-500'
                        : 'bg-gray-50 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    메모
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('issue')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                      type === 'issue'
                        ? 'bg-red-50 text-red-700 border-2 border-red-500'
                        : 'bg-gray-50 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    이슈 보고
                  </button>
                </div>

                {/* 내용 입력 */}
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    type === 'issue' ? '이슈 내용을 입력해주세요...' : '메모를 입력해주세요...'
                  }
                  rows={3}
                  autoFocus
                  maxLength={500}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ED6C00] focus:border-transparent resize-none"
                />

                {/* 저장 버튼 */}
                <button
                  onClick={handleSubmit}
                  disabled={!content.trim() || isSubmitting}
                  className="w-full py-3 bg-[#ED6C00] hover:bg-[#d15f00] disabled:bg-gray-300 text-white text-sm font-bold rounded-lg transition-colors"
                >
                  {isSubmitting ? '저장 중...' : '추가'}
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">최대 3개까지 작성 가능합니다.</p>
                <p className="text-xs text-gray-400 mt-1">
                  기존 노트를 삭제하면 새로 추가할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!errorModal}
        title="오류"
        message={errorModal || ''}
        type="error"
        confirmText="확인"
        onConfirm={() => setErrorModal(null)}
        onCancel={() => setErrorModal(null)}
      />
    </div>
  );
};
