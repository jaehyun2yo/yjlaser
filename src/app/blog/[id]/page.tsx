// src/app/blog/[id]/page.tsx

import Link from 'next/link';
import type { Metadata } from 'next';
import { TEXT_COLOR, LINK_STYLES } from '@/lib/styles';
import { BlogPostingJsonLd } from '@/components/JsonLd';

export const revalidate = 3600; // 1 hour ISR

interface Post {
  id: number;
  title: string;
  body: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

// 특정 ID의 게시물 하나만 가져오는 함수
async function getPost(id: string): Promise<Post> {
  const res = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`, {
    next: { revalidate: 3600 }, // 1시간 캐시
  });
  if (!res.ok) {
    throw new Error('Failed to fetch post');
  }
  return res.json();
}

type BlogPostPageProps = {
  params: Promise<{
    id: string;
  }>;
};

// 동적 메타데이터 생성
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  const url = `${BASE_URL}/blog/${id}`;

  return {
    title: `${post.title} | 유진레이저목형 블로그`,
    description: post.body.substring(0, 160),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.title,
      description: post.body.substring(0, 160),
      url,
      siteName: '유진레이저목형',
      type: 'article',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.body.substring(0, 160),
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { id } = await params;
  const post: Post = await getPost(id);
  const url = `${BASE_URL}/blog/${id}`;

  return (
    <>
      <BlogPostingJsonLd
        headline={post.title}
        description={post.body.substring(0, 160)}
        datePublished={new Date().toISOString()}
        url={url}
      />
      <div className="max-w-3xl mx-auto p-6">
        <h1 className={`text-4xl font-extrabold mb-4 ${TEXT_COLOR.primary}`}>{post.title}</h1>
        <p className={`${TEXT_COLOR.tertiary} text-lg leading-relaxed mt-6`}>{post.body}</p>
        <Link href="/blog" className={`${LINK_STYLES.primary} mt-12 inline-block`}>
          &larr; 블로그 목록으로 돌아가기
        </Link>
      </div>
    </>
  );
}
