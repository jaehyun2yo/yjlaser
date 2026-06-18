// src/app/blog/page.tsx

import type { Metadata } from 'next';
import Link from 'next/link';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { CollectionPageJsonLd } from '@/components/JsonLd';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

export const revalidate = 3600; // 1 hour ISR

export const metadata: Metadata = {
  title: '블로그 | 유진레이저목형',
  description:
    '패키징 산업 트렌드, 레이저 목형 기술 정보, 박스 디자인 팁 등 유용한 정보를 공유합니다.',
  keywords: ['패키징 블로그', '레이저목형 정보', '박스 디자인'],
  alternates: {
    canonical: `${BASE_URL}/blog`,
  },
  openGraph: {
    title: '블로그 | 유진레이저목형',
    description:
      '패키징 산업 트렌드, 레이저 목형 기술 정보, 박스 디자인 팁 등 유용한 정보를 공유합니다.',
    url: `${BASE_URL}/blog`,
    siteName: '유진레이저목형',
    type: 'website',
    locale: 'ko_KR',
  },
};

// 게시물 데이터의 타입을 정의합니다.
interface Post {
  id: number;
  title: string;
  body: string;
}

// 1. 페이지 컴포넌트를 async 함수로 만듭니다.
async function getPosts() {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts');

  // 에러 처리 (실제 프로젝트에서는 중요!)
  if (!res.ok) {
    throw new Error('Failed to fetch posts');
  }

  return res.json();
}

export default async function BlogPage() {
  // 2. 서버에서 직접 데이터를 가져옵니다.
  const posts: Post[] = await getPosts();

  return (
    <>
      <CollectionPageJsonLd
        name="블로그"
        description="패키징 산업 트렌드, 레이저 목형 기술 정보, 박스 디자인 팁 등 유용한 정보를 공유합니다."
        url={`${BASE_URL}/blog`}
        itemCount={posts.length}
      />
      <div className="w-full py-8 px-4 md:px-8 max-w-6xl mx-auto">
        <h1 className={`text-2xl font-bold mb-8 ${TEXT_COLOR.primary}`}>블로그</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <div
              key={post.id}
              className={`${BG_COLOR.white} border-2 ${BORDER_COLOR.default} p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 hover:border-orange-500`}
            >
              <h2 className={`text-sm font-semibold mb-3 line-clamp-2 h-14 ${TEXT_COLOR.primary}`}>
                {post.title}
              </h2>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-4 line-clamp-3 h-20`}>
                {post.body}
              </p>
              <Link
                href={`/blog/${post.id}`}
                className={`text-sm ${TEXT_COLOR.accent} font-semibold ${TEXT_COLOR.accentHover} transition-colors duration-300 inline-flex items-center gap-2`}
              >
                더 읽기 &rarr;
              </Link>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
