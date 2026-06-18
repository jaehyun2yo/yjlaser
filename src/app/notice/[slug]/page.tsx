import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogPostingJsonLd } from '@/components/JsonLd';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

// Note: revalidate is set but view count POST calls will still execute on each request
export const revalidate = 3600; // 1 hour ISR

type PostDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: PostDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const postId = parseInt(slug, 10);

    const response = await nestjsFetch<{
      title: string;
      content: string;
      created_at: string;
    }>(`/public-data/posts/${postId}`, { useApiKey: true });
    const post = response.ok ? response.data : null;

    if (!post) {
      return {
        title: '공지사항 | 유진레이저목형',
      };
    }

    const description =
      (typeof post.content === 'string' ? post.content.slice(0, 150) + '...' : '') || '';

    return {
      title: `${post.title} | 공지사항`,
      description,
      openGraph: {
        title: `${post.title} | 공지사항`,
        description,
        type: 'article' as const,
        url: `${BASE_URL}/notice/${slug}`,
        publishedTime: post.created_at,
      },
      alternates: {
        canonical: `${BASE_URL}/notice/${slug}`,
      },
    };
  } catch {
    return {
      title: '공지사항 | 유진레이저목형',
    };
  }
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { slug } = await params;

  const postId = parseInt(slug, 10);

  const response = await nestjsFetch<{
    id: number;
    title: string;
    content: string;
    view_count: number | null;
    created_at: string;
    updated_at: string;
  }>(`/public-data/posts/${postId}`, { useApiKey: true });

  if (!response.ok || !response.data) {
    notFound();
  }

  const post = response.data;

  // 조회수 증가 (NestJS API)
  await nestjsFetch(`/public-data/posts/${postId}/view`, {
    method: 'POST',
    useApiKey: true,
  });

  // 날짜 포맷 함수
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <>
      <BlogPostingJsonLd
        headline={post.title}
        description={post.content?.slice(0, 150) || ''}
        datePublished={post.created_at}
        url={`${BASE_URL}/notice/${slug}`}
      />
      <div
        className={`min-h-screen ${BG_COLOR.darker} transition-colors duration-200`}
        data-header-theme="light"
      >
        {/* 히어로 섹션 */}
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden">
          {/* 배경 그라데이션 */}
          <div className="absolute inset-0 bg-gradient-to-b from-muted via-background to-background" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#ED6C00]/5 via-transparent to-transparent" />

          <div className="relative max-w-5xl mx-auto px-4 md:px-8">
            {/* 뒤로가기 링크 */}
            <Link
              href="/notice"
              className={`inline-flex items-center gap-2 text-sm ${TEXT_COLOR.subtle} hover:text-[#ED6C00] transition-colors duration-300 mb-8`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              공지사항 목록
            </Link>

            {/* 제목 영역 */}
            <div className="text-center">
              <p className="text-[#ED6C00] text-sm md:text-base font-medium tracking-widest uppercase mb-4">
                Notice
              </p>
              <h1
                className={`text-3xl md:text-4xl lg:text-5xl font-bold ${TEXT_COLOR.strong} mb-6 leading-tight`}
              >
                {post.title}
              </h1>
              <div className={`flex items-center justify-center gap-4 text-sm ${TEXT_COLOR.dim}`}>
                <span>{formatDate(post.created_at)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 메인 컨텐츠 */}
        <div className={`relative ${BG_COLOR.darker}`}>
          <div className="w-full max-w-3xl mx-auto px-4 md:px-8 pb-20">
            {/* 구분선 */}
            <div className="w-16 h-1 bg-[#ED6C00] mx-auto mb-12" />

            {/* 본문 */}
            <article className="prose prose-lg max-w-none">
              <div
                className={`text-base md:text-lg ${TEXT_COLOR.softMuted} leading-relaxed whitespace-pre-wrap`}
              >
                {post.content}
              </div>
            </article>

            {/* 하단 구분선 */}
            <div className={`mt-16 pt-8 border-t ${BORDER_COLOR.default}`}>
              <Link
                href="/notice"
                className={`inline-flex items-center gap-3 px-6 py-3 ${BG_COLOR.grayDark} border ${BORDER_COLOR.default} rounded-xl ${TEXT_COLOR.softMuted} hover:text-[#ED6C00] hover:border-[#ED6C00]/30 ${BG_COLOR.hoverWhite} transition-all duration-300`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                목록으로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
