// src/app/(admin)/admin/posts/_actions/index.ts

'use server'; // 이 파일의 모든 함수는 서버에서만 실행됩니다!

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const postsLogger = logger.createLogger('POSTS_ACTIONS');

// 게시물을 삭제하는 서버 액션
export async function deletePost(postId: string) {
  const response = await nestjsFetch(`/public-data/posts/${postId}`, {
    method: 'DELETE',
    useApiKey: true,
  });

  if (!response.ok) {
    postsLogger.error('Error deleting post', { postId, status: response.status });
    return { error: 'Failed to delete post' };
  }

  // 데이터가 변경되었으니, 목록 페이지의 캐시를 갱신합니다.
  revalidatePath('/admin/posts');

  return { success: true };
}

// 새 게시물을 생성하는 서버 액션
export async function createPost(title: string, contentJson: string) {
  // 클라이언트에서 받은 JSON 문자열을 실제 JSON 객체로 변환합니다.
  const content = JSON.parse(contentJson);

  const response = await nestjsFetch('/public-data/posts', {
    method: 'POST',
    body: { title, content },
    useApiKey: true,
  });

  if (!response.ok) {
    postsLogger.error('Error creating post', { status: response.status });
    return { success: false, error: response.data };
  }

  // 데이터가 변경되었으니, 목록 페이지의 캐시를 갱신합니다.
  revalidatePath('/admin/posts');
  // 성공적으로 글을 만들었으면, 목록 페이지로 이동시킵니다.
  redirect('/admin/posts');
}
