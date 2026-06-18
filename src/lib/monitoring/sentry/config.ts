/**
 * Sentry 공유 설정
 * 클라이언트, 서버, Edge 런타임에서 공통으로 사용
 */

export const SENTRY_CONFIG = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 성능 모니터링 샘플링 레이트
  // 프로덕션: 10%, 개발: 100%
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay 설정
  // 일반 세션: 10% 샘플링, 에러 발생 시: 100% 녹화
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // 환경 설정
  environment: process.env.NODE_ENV,

  // 릴리즈 트래킹
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'development',

  // 무시할 에러 패턴
  ignoreErrors: [
    // Next.js 리다이렉트 (실제 에러 아님)
    'NEXT_REDIRECT',
    'NEXT_NOT_FOUND',
    // 브라우저 확장 프로그램
    /^chrome-extension:/,
    /^moz-extension:/,
    // 네트워크 에러 (대부분 클라이언트 문제)
    'Network request failed',
    'Failed to fetch',
    'Load failed',
    'NetworkError',
    // 사용자 중단
    'AbortError',
    'The operation was aborted',
    // 리사이즈 옵저버 에러 (무해함)
    'ResizeObserver loop',
  ] as (string | RegExp)[],

  // Sentry 활성화 조건
  // 프로덕션 또는 SENTRY_DEBUG=true인 경우에만 활성화
  enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',
} as const;

export const SENTRY_TAGS = {
  runtime: 'nextjs',
  appName: 'nextjs-prec-1',
} as const;

export type SentryConfig = typeof SENTRY_CONFIG;
export type SentryTags = typeof SENTRY_TAGS;
