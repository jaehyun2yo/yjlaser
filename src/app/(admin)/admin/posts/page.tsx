// src/app/(admin)/admin/posts/page.tsx (수정 후)

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import Link from 'next/link';
import { Post } from '@/types/database.types';
import { DeleteButton } from './delete-button';
import { serverGetPosts } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

// Build-time SSG 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음)
export const dynamic = 'force-dynamic';

const postsPageLogger = logger.createLogger('ADMIN_POSTS_PAGE');

export default async function AdminPostsPage() {
  let postList: Post[] = [];

  try {
    const posts = await serverGetPosts();
    postList = (posts || []) as unknown as Post[];
  } catch (error) {
    postsPageLogger.error('Error fetching posts', error);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>게시물 관리</h1>
        <Link
          href="/admin/posts/new"
          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-2 px-4 rounded-md hover:from-orange-600 hover:to-orange-700 transition-all duration-300 shadow-md hover:shadow-lg"
        >
          새 게시물 작성
        </Link>
      </div>

      <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border-2 ${BORDER_COLOR.default}`}>
        {postList.length === 0 ? (
          <p className={TEXT_COLOR.secondary}>등록된 게시물이 없습니다.</p>
        ) : (
          <ul className="space-y-4">
            {postList.map((post: Post) => (
              <li
                key={post.id}
                className={`flex justify-between items-center border-b-2 ${BORDER_COLOR.default} pb-4 last:border-b-0`}
              >
                <span className={`text-lg ${TEXT_COLOR.primary} font-medium`}>{post.title}</span>
                <div className="flex items-center space-x-3">
                  <Link
                    href={`/admin/posts/${post.id}/edit`}
                    className={`${TEXT_COLOR.orange} ${TEXT_COLOR.hoverOrangeLight} transition-colors duration-300 font-medium`}
                  >
                    수정
                  </Link>
                  <DeleteButton postId={post.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
