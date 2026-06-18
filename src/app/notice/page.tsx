import type { Metadata } from 'next';
import Link from 'next/link';
import { logger } from '@/lib/utils/logger';
import { CollectionPageJsonLd } from '@/components/JsonLd';
import { serverGetPosts } from '@/lib/api/nestjs-server-client';
import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';

// Build-time SSG 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음)
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yjlaser.net';

export const metadata: Metadata = {
  title: '공지사항 | 유진레이저목형',
  description: '유진레이저목형의 새로운 소식과 중요한 안내사항을 확인하세요.',
  keywords: ['유진레이저목형 공지', '레이저목형 소식'],
  alternates: {
    canonical: `${BASE_URL}/notice`,
  },
  openGraph: {
    title: '공지사항 | 유진레이저목형',
    description: '유진레이저목형의 새로운 소식과 중요한 안내사항을 확인하세요.',
    url: `${BASE_URL}/notice`,
    siteName: '유진레이저목형',
    type: 'website',
    locale: 'ko_KR',
  },
};

// ISR: revalidate every 1 hour
export const revalidate = 3600;

interface NoticePost {
  id: number;
  title: string;
  created_at: string;
  view_count: number | null;
}

async function getNoticePosts(): Promise<NoticePost[]> {
  const noticeLogger = logger.createLogger('NOTICE');
  try {
    const data = await serverGetPosts();
    return (data || []) as unknown as NoticePost[];
  } catch (error) {
    noticeLogger.error('Notice page select exception', error);
    return [];
  }
}

export default async function NoticeListPage() {
  const postList = await getNoticePosts();

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
      <CollectionPageJsonLd
        name="공지사항"
        description="유진레이저목형의 새로운 소식과 중요한 안내사항"
        url={`${BASE_URL}/notice`}
        itemCount={postList.length}
      />
      <div
        className={`min-h-screen ${BG_COLOR.darker} transition-colors duration-200`}
        data-header-theme="light"
      >
        {/* 히어로 섹션 */}
        <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden">
          {/* 배경 그라데이션 */}
          <div className="absolute inset-0 bg-gradient-to-b from-muted via-background to-background" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand/5 via-transparent to-transparent" />

          <div className="relative max-w-5xl mx-auto px-4 md:px-8 text-center">
            <p className="text-brand text-sm md:text-base font-medium tracking-widest uppercase mb-4">
              Notice
            </p>
            <h1
              className={`text-4xl md:text-5xl lg:text-6xl font-bold ${TEXT_COLOR.strong} mb-6 leading-tight`}
            >
              공지사항
            </h1>
            <p
              className={`${TEXT_COLOR.subtle} text-lg md:text-xl max-w-2xl mx-auto leading-relaxed`}
            >
              유진레이저목형의 새로운 소식과 중요한 안내사항을
              <br className="hidden md:block" />
              확인하세요
            </p>
          </div>
        </section>

        {/* 메인 컨텐츠 */}
        <div className={`relative ${BG_COLOR.darker}`}>
          <div className="w-full max-w-5xl mx-auto px-4 md:px-8 pb-20">
            {postList.length === 0 ? (
              <div className="mx-auto max-w-2xl text-center py-16 md:py-20">
                <div
                  className={`w-20 h-20 mx-auto mb-6 rounded-full ${BG_COLOR.lightDark} flex items-center justify-center`}
                >
                  <svg
                    className={`w-10 h-10 ${TEXT_COLOR.dim}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h2 className={`text-2xl font-bold ${TEXT_COLOR.strong}`}>
                  현재 등록된 공지사항이 없습니다
                </h2>
                <p className={`${TEXT_COLOR.subtle} mt-3 text-base leading-relaxed`}>
                  제작 상담과 견적 문의는 정상 운영 중입니다. 공지로 안내할 내용이 생기면 이
                  페이지에 업데이트하겠습니다.
                </p>
                <div
                  className={`mt-6 rounded-2xl border ${BORDER_COLOR.light} ${BG_COLOR.card} p-5`}
                >
                  <p className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>문의 안내</p>
                  <p className={`${TEXT_COLOR.subtle} mt-2 text-sm leading-relaxed`}>
                    평일 9:00 ~ 19:00 상담 가능하며, 도면이나 샘플이 있으면 문의하기에서 함께
                    전달해주세요.
                  </p>
                </div>
                <Link
                  href="/contact"
                  className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  제작 문의하기
                </Link>
              </div>
            ) : (
              <div className={`border ${BORDER_COLOR.default} rounded-2xl overflow-hidden`}>
                {/* 테이블 헤더 */}
                <div
                  className={`hidden md:grid grid-cols-12 ${BG_COLOR.grayDark} border-b ${BORDER_COLOR.default} px-6 py-4 text-sm font-medium ${TEXT_COLOR.subtle}`}
                >
                  <div className="col-span-1 text-center">번호</div>
                  <div className="col-span-8">제목</div>
                  <div className="col-span-2 text-center">작성일</div>
                  <div className="col-span-1 text-center">조회</div>
                </div>

                {/* 테이블 바디 */}
                <div className={`divide-y ${DIVIDE_COLOR.lighter}`}>
                  {postList.map((post: NoticePost, index: number) => (
                    <Link
                      key={post.id}
                      href={`/notice/${post.id}`}
                      className={`group grid grid-cols-1 md:grid-cols-12 items-center px-4 md:px-6 py-4 md:py-5 ${BG_COLOR.hoverGrayDark} transition-colors duration-200`}
                    >
                      {/* 번호 - 데스크톱 */}
                      <div
                        className={`hidden md:block col-span-1 text-center text-sm ${TEXT_COLOR.dim}`}
                      >
                        {postList.length - index}
                      </div>

                      {/* 제목 */}
                      <div className="col-span-1 md:col-span-8">
                        <h2
                          className={`text-base md:text-lg font-medium ${TEXT_COLOR.softMuted} group-hover:text-brand transition-colors duration-200 truncate`}
                        >
                          {post.title}
                        </h2>
                        {/* 모바일에서만 날짜/조회수 표시 */}
                        <div
                          className={`flex items-center gap-3 mt-1 md:hidden text-xs ${TEXT_COLOR.dim}`}
                        >
                          <span>{formatDate(post.created_at)}</span>
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            {post.view_count ?? 0}
                          </span>
                        </div>
                      </div>

                      {/* 작성일 - 데스크톱 */}
                      <div
                        className={`hidden md:block col-span-2 text-center text-sm ${TEXT_COLOR.dim}`}
                      >
                        {formatDate(post.created_at)}
                      </div>

                      {/* 조회수 - 데스크톱 */}
                      <div
                        className={`hidden md:block col-span-1 text-center text-sm ${TEXT_COLOR.dim}`}
                      >
                        {post.view_count ?? 0}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
