/**
 * Next.js Instrumentation 파일
 * Sentry 서버/Edge 초기화 (프로덕션 전용)
 */

export async function register() {
  // dev에서는 Sentry SDK 로드 자체를 건너뛰기 (OpenTelemetry 모듈 체인 방지)
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  const Sentry = await import('@sentry/nextjs');
  const { redactSentryEventUrl } = await import('@/lib/monitoring/sentry/redaction');

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      enableLogs: true,
      sendDefaultPii: true,
      beforeSend: (event) => redactSentryEventUrl(event),
      beforeSendTransaction: (event) => redactSentryEventUrl(event),
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      enableLogs: true,
      sendDefaultPii: true,
      beforeSend: (event) => redactSentryEventUrl(event),
      beforeSendTransaction: (event) => redactSentryEventUrl(event),
    });
  }
}

export const onRequestError =
  process.env.NODE_ENV === 'development'
    ? undefined
    : (...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) =>
        import('@sentry/nextjs').then((Sentry) => Sentry.captureRequestError(...args));
