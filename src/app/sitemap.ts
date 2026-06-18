import { MetadataRoute } from 'next';
import { serverGetPortfolios, serverGetPosts } from '@/lib/api/nestjs-server-client';

// Build-time SSG 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음)
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/portfolio`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/notice`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  ];

  // NestJS API 경유로 포트폴리오 / 게시글 조회
  const [portfolioItems, noticePosts] = await Promise.all([
    serverGetPortfolios(),
    serverGetPosts(),
  ]);

  const portfolioPages: MetadataRoute.Sitemap = (portfolioItems || []).map((item) => ({
    url: `${baseUrl}/portfolio/${item.id}`,
    lastModified: new Date(item.created_at as string),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const noticePages: MetadataRoute.Sitemap = (noticePosts || []).map((post) => ({
    url: `${baseUrl}/notice/${post.id}`,
    lastModified: new Date(post.created_at as string),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  // 블로그 페이지 (JSONPlaceholder API 사용 - 1~100번 포스트)
  const blogPages: MetadataRoute.Sitemap = Array.from({ length: 100 }, (_, i) => ({
    url: `${baseUrl}/blog/${i + 1}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...staticPages, ...portfolioPages, ...noticePages, ...blogPages];
}
