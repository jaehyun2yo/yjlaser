'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { deletePost } from './_actions';

interface DeleteButtonProps {
  postId: string;
}

export function DeleteButton({ postId }: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    const confirmed = window.confirm('정말 삭제하시겠습니까?');
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deletePost(postId);

      if (result.error) {
        toast.error('게시물 삭제 실패', {
          description: result.error,
        });
      } else {
        toast.success('게시물이 삭제되었습니다');
      }
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-red-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? '삭제 중...' : '삭제'}
    </button>
  );
}
