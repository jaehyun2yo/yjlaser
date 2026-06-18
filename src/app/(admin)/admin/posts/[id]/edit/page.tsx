// src/app/(admin)/admin/posts/[id]/edit/page.tsx (최종)

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const editPostLogger = logger.createLogger('EDIT_POST');

type EditPostPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditPostPage({ params }: EditPostPageProps) {
  const { id } = await params;

  const response = await nestjsFetch<{
    id: number;
    title: string;
    content: string;
    created_at: string;
    updated_at: string;
  }>(`/public-data/posts/${id}`, { useApiKey: true });

  const post = response.ok ? response.data : null;

  if (!post) {
    notFound();
  }

  // 1. 수정 작업을 처리할 서버 액션입니다.
  async function updatePostAction(formData: FormData) {
    'use server';

    const title = formData.get('title') as string;
    const content = formData.get('content') as string;

    const { nestjsFetch: fetchNestJS } = await import('@/lib/api/nestjs-server-client');

    // 2. NestJS API를 통해 게시물 업데이트
    const updateResponse = await fetchNestJS(`/public-data/posts/${id}`, {
      method: 'PATCH',
      body: { title, content },
      useApiKey: true,
    });

    if (!updateResponse.ok) {
      editPostLogger.error('Error updating post', { id, status: updateResponse.status });
      return;
    }

    // 3. 목록 페이지와 수정 페이지의 캐시를 모두 갱신합니다.
    revalidatePath('/admin/posts');
    revalidatePath(`/admin/posts/${id}/edit`);

    // 4. 작업 완료 후, 게시물 목록 페이지로 돌아갑니다.
    redirect('/admin/posts');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold mb-2 ${TEXT_COLOR.primary}`}>게시물 수정</h1>
        <p className={TEXT_COLOR.secondary}>게시물 정보를 수정할 수 있습니다</p>
      </div>

      {/* 5. form의 action에 우리가 만든 서버 액션을 연결합니다. */}
      <form
        action={updatePostAction}
        className={`${BG_COLOR.card} p-8 rounded-xl shadow-md border-2 ${BORDER_COLOR.default} space-y-6`}
      >
        <div>
          <label
            htmlFor="title"
            className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
          >
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="title"
            id="title"
            required
            defaultValue={post.title}
            className={`mt-1 block w-full px-4 py-3 border-2 ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary} placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300`}
            placeholder="게시물 제목을 입력하세요"
          />
        </div>

        <div>
          <label
            htmlFor="content"
            className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
          >
            내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            name="content"
            id="content"
            rows={12}
            required
            defaultValue={post.content || ''}
            className={`mt-1 block w-full px-4 py-3 border-2 ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.card} ${TEXT_COLOR.primary} placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300 resize-y`}
            placeholder="게시물 내용을 입력하세요"
          ></textarea>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-2 px-6 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
          >
            수정하기
          </button>
          <Link
            href="/admin/posts"
            className={`${BG_COLOR.medium} ${TEXT_COLOR.secondary} py-2 px-6 rounded-lg ${BG_COLOR.hoverStronger} transition-all duration-300 font-medium inline-block text-center`}
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
