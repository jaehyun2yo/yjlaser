/**
 * 클라이언트 사이드 Sentry 초기화
 * Next.js 15+에서 자동으로 로드됨 (프로덕션 전용)
 */

if (process.env.NODE_ENV !== 'development') {
  import('@sentry/nextjs').then(async (Sentry) => {
    const { SENTRY_CONFIG, SENTRY_TAGS } = await import('@/lib/monitoring/sentry/config');
    const { redactSentryEventUrl } = await import('@/lib/monitoring/sentry/redaction');

    Sentry.init({
      dsn: SENTRY_CONFIG.dsn,
      tracesSampleRate: SENTRY_CONFIG.tracesSampleRate,
      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      replaysSessionSampleRate: SENTRY_CONFIG.replaysSessionSampleRate,
      replaysOnErrorSampleRate: SENTRY_CONFIG.replaysOnErrorSampleRate,
      environment: SENTRY_CONFIG.environment,
      release: SENTRY_CONFIG.release,
      ignoreErrors: SENTRY_CONFIG.ignoreErrors,
      enabled: SENTRY_CONFIG.enabled,
      beforeSend: (event) => redactSentryEventUrl(event),
      beforeSendTransaction: (event) => redactSentryEventUrl(event),
      initialScope: {
        tags: {
          ...SENTRY_TAGS,
          runtime: 'browser',
        },
      },
      debug: false,
    });
  });
}

/**
 * 라우터 전환 추적 (프로덕션 전용)
 */
export const onRouterTransitionStart =
  process.env.NODE_ENV === 'development'
    ? undefined
    : (...args: unknown[]) =>
        import('@sentry/nextjs').then((Sentry) =>
          (Sentry.captureRouterTransitionStart as (...a: unknown[]) => void)(...args)
        );
