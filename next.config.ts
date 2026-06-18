import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

function getR2Host() {
  try {
    const url = process.env.R2_PUBLIC_BASE_URL;
    if (!url) return undefined;
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

const r2Host = getR2Host();
const nestjsUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || '';
const staticRemotePatterns: Array<{ protocol: 'https' | 'http'; hostname: string }> = [
  { protocol: 'https', hostname: 'yjlaser.net' },
  { protocol: 'http', hostname: 'yjlaser.net' },
  { protocol: 'https', hostname: 'images.unsplash.com' },
];

const nextConfig: NextConfig = {
  // gzip 압축 활성화 (기본값: true)
  compress: true,
  devIndicators: false,
  // 성능 모니터링은 instrumentation.ts 파일로 자동 활성화됨 (Next.js 15+)
  eslint: {
    // 빌드 시 ESLint 경고 무시 (프로덕션 배포 허용)
    ignoreDuringBuilds: true,
  },
  // Vercel 배포 성능 최적화
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // 서버 액션 body size 제한 (단일 파일 업로드 기준 - 폴더 업로드는 개별 파일 단위)
    serverActions: {
      bodySizeLimit: '500mb',
    },
    // 최신 번들 분석 활성화
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-tooltip',
      'react-icons/fa',
      'framer-motion',
      'lucide-react',
      'date-fns',
      'recharts',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [64, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7일
    // 번들 크기 최적화
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      ...(r2Host
        ? [
            { protocol: 'https' as const, hostname: r2Host },
            { protocol: 'http' as const, hostname: r2Host },
          ]
        : []),
      ...staticRemotePatterns,
    ],
  },
  // 캐싱 전략 개선
  onDemandEntries: {
    maxInactiveAge: 5 * 60 * 1000, // 5분
    pagesBufferLength: 10, // 10페이지
  },
  async headers() {
    return [
      // ISR 페이지들은 Next.js가 자동으로 Cache-Control을 설정함
      // s-maxage는 CDN/프록시 캐시, stale-while-revalidate는 백그라운드 갱신 허용
      {
        // Next.js 빌드 파일 (해시 포함) - 장기 캐시 OK
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 정적 자산 캐싱 (1년)
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 이미지 캐싱 (1년)
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 폰트 캐싱 (1년)
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 모든 경로에 보안 헤더 적용
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(self)',
          },
          // Content Security Policy - XSS 및 데이터 주입 공격 방지
          {
            key: 'Content-Security-Policy',
            value: [
              // 기본 정책: 동일 출처만 허용
              "default-src 'self'",
              // 스크립트: 동일 출처 + 인라인 (Next.js 필요) + unsafe-eval (개발 모드) + unpkg (react-grab) + 카카오맵 SDK + daumcdn 서브스크립트
              `script-src 'self' 'unsafe-inline' https://dapi.kakao.com https://*.daumcdn.net ${process.env.NODE_ENV === 'development' ? "'unsafe-eval' http://*.daumcdn.net https://unpkg.com" : ''}`,
              // 스타일: 동일 출처 + 인라인 (Tailwind 필요) + Google Fonts
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // 이미지: 동일 출처 + R2 스토리지 (Signed URL 포함) + data URL (base64) + 카카오맵 타일
              `img-src 'self' data: blob: ${r2Host ? `https://${r2Host}` : ''} https://*.r2.cloudflarestorage.com https://images.unsplash.com https://yjlaser.net https://*.daumcdn.net https://*.kakao.com ${process.env.NODE_ENV === 'development' ? 'http://*.daumcdn.net http://*.kakao.com' : ''}`,
              // 폰트: 동일 출처 + Google Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // 연결: 동일 출처 + R2/Google Drive 업로드 + NestJS API + Sentry + react-grab (개발) + 카카오맵 API
              `connect-src 'self' https://dapi.kakao.com https://www.googleapis.com ${r2Host ? `https://${r2Host}` : ''} https://*.r2.cloudflarestorage.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io ${nestjsUrl ? `${nestjsUrl} ${nestjsUrl.replace('http', 'ws')}` : ''} ${process.env.NODE_ENV === 'development' ? 'ws://localhost:4567 http://localhost:4567 http://localhost:4000 ws://localhost:4000 ws://localhost:4722 https://www.react-grab.com' : ''}`,
              // 객체/플러그인: 없음
              "object-src 'none'",
              // base-uri: 동일 출처만
              "base-uri 'self'",
              // form-action: 동일 출처만
              "form-action 'self'",
              // frame-ancestors: 동일 출처만 (X-Frame-Options와 유사)
              "frame-ancestors 'self'",
              // 업그레이드: HTTP → HTTPS 자동 업그레이드 (프로덕션)
              ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
            ]
              .filter(Boolean)
              .join('; '),
          },
          // 압축 최적화
          {
            key: 'Accept-Encoding',
            value: 'gzip, deflate, br',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/admin/contacts', destination: '/admin/work-management', permanent: true },
      {
        source: '/admin/contacts/:path*',
        destination: '/admin/work-management/:path*',
        permanent: true,
      },
      {
        source: '/admin/process-board',
        destination: '/admin/work-management/board',
        permanent: true,
      },
      { source: '/admin/erp', destination: '/admin', permanent: true },
      { source: '/admin/erp/:path*', destination: '/admin', permanent: true },
      { source: '/admin/companies', destination: '/admin/integration/companies', permanent: true },
      { source: '/admin/bookings', destination: '/admin/integration/bookings', permanent: true },
      { source: '/admin/system', destination: '/admin/integration/system', permanent: true },
      { source: '/admin/integration/orders', destination: '/admin/integration', permanent: true },
      {
        source: '/admin/integration/orders/:path*',
        destination: '/admin/integration',
        permanent: true,
      },
      {
        source: '/admin/webhard/logs',
        destination: '/admin/webhard/activity',
        permanent: true,
      },
      // /erp → /worker 리다이렉트
      { source: '/erp', destination: '/worker/login', permanent: true },
      { source: '/erp/login', destination: '/worker/login', permanent: true },
      { source: '/erp/:path*', destination: '/worker/:path*', permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // worker.yjlaser.net 서브도메인 → /worker/* 경로로 rewrite
        {
          source: '/',
          has: [{ type: 'host', value: 'worker.yjlaser.net' }],
          destination: '/worker',
        },
        {
          source:
            '/:path((?!worker|_next|api|nestapi|favicon|monitoring|fonts|images|static|erp-).*)',
          has: [{ type: 'host', value: 'worker.yjlaser.net' }],
          destination: '/worker/:path',
        },
      ],
      afterFiles: [
        {
          source: '/nestapi/:path*',
          destination: `${process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000'}/api/v1/:path*`,
        },
        {
          source: '/api/webhard/logs',
          destination: '/api/webhard/activity',
        },
      ],
      fallback: [],
    };
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // 개발 모드에서 임시 파일 감시 제외
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/tmpclaude-*', '**/.next/**'],
      };
    }
    return config;
  },
};

// dev에서는 Sentry 래핑 건너뛰기 (모듈 분석/변환 비용 제거)
const finalConfig =
  process.env.NODE_ENV === 'development'
    ? nextConfig
    : withSentryConfig(nextConfig, {
        org: 'yjlaser',
        project: 'yjlaser',

        // CI 환경에서만 로그 출력
        silent: !process.env.CI,

        // 소스맵 설정
        widenClientFileUpload: true,

        // Ad-blocker 우회를 위한 터널 라우트
        tunnelRoute: '/monitoring',

        // 소스맵 설정
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },

        // Webpack 설정
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
          excludeReplayIframe: true,
          excludeReplayShadowDom: true,
        },
      });

export default finalConfig;
