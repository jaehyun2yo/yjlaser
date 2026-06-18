/**
 * Sentry 유틸리티 함수
 * 애플리케이션 전체에서 사용할 수 있는 헬퍼 함수
 */

import * as Sentry from '@sentry/nextjs';

export interface SentryUser {
  id: string;
  type: 'admin' | 'company';
  username?: string;
  companyName?: string;
}

/**
 * Sentry 사용자 컨텍스트 설정
 * 에러 리포트에 사용자 정보가 포함됨
 */
export function setSentryUser(user: SentryUser | null): void {
  if (user) {
    Sentry.setUser({
      id: user.id,
      username: user.username,
    });

    Sentry.setTag('user.type', user.type);
    if (user.companyName) {
      Sentry.setTag('company.name', user.companyName);
    }
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Sentry 사용자 컨텍스트 초기화
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * 브레드크럼 추가
 * 에러 발생 전 사용자 행동을 추적
 */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = 'info'
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level,
    timestamp: Date.now() / 1000,
  });
}

/**
 * 에러 캡처 with 추가 컨텍스트
 * @returns Sentry 이벤트 ID
 */
export function captureException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
  }
): string {
  return Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level,
  });
}

/**
 * 메시지 캡처 (에러가 아닌 이벤트)
 * @returns Sentry 이벤트 ID
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  extra?: Record<string, unknown>
): string {
  return Sentry.captureMessage(message, {
    level,
    extra,
  });
}

/**
 * 커스텀 태그 설정
 */
export function setSentryTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * 커스텀 컨텍스트 설정
 */
export function setSentryContext(name: string, context: Record<string, unknown> | null): void {
  Sentry.setContext(name, context);
}

/**
 * 트랜잭션 스코프에서 작업 실행 (성능 모니터링)
 */
export async function withSentrySpan<T>(
  name: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan({ name, op }, async () => {
    return fn();
  });
}

/**
 * 피드백 다이얼로그 표시
 * 에러 발생 시 사용자가 피드백을 남길 수 있음
 */
export function showSentryFeedbackDialog(eventId: string): void {
  if (typeof window !== 'undefined') {
    Sentry.showReportDialog({ eventId });
  }
}
