/**
 * 프로덕션 로깅 시스템
 * 구조화된 로깅 및 에러 추적을 위한 유틸리티
 */

import { logger } from '@/lib/utils/logger';

export interface LogContext {
  userId?: string | number;
  userType?: 'admin' | 'company';
  requestId?: string;
  [key: string]: unknown;
}

export interface ErrorContext extends LogContext {
  errorCode?: string;
  stack?: string;
  componentStack?: string;
}

/**
 * 구조화된 로깅 유틸리티
 */
export class StructuredLogger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * 컨텍스트를 추가하여 새로운 로거 인스턴스 생성
   */
  withContext(additionalContext: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.context, ...additionalContext });
  }

  /**
   * 정보 로그
   */
  info(message: string, data?: Record<string, unknown>): void {
    const logData = {
      ...this.context,
      ...data,
      timestamp: new Date().toISOString(),
      level: 'info',
    };
    logger.info(message, logData);
  }

  /**
   * 경고 로그
   */
  warn(message: string, data?: Record<string, unknown>): void {
    const logData = {
      ...this.context,
      ...data,
      timestamp: new Date().toISOString(),
      level: 'warn',
    };
    logger.warn(message, logData);
  }

  /**
   * 에러 로그
   */
  error(message: string, error: unknown, context?: ErrorContext): void {
    const errorData: Record<string, unknown> = {
      ...this.context,
      ...context,
      timestamp: new Date().toISOString(),
      level: 'error',
    };

    if (error instanceof Error) {
      errorData.errorMessage = error.message;
      errorData.errorName = error.name;
      errorData.stack = error.stack;
    } else {
      errorData.error = error;
    }

    logger.error(message, error, errorData);

    // 프로덕션 환경에서는 외부 에러 추적 서비스로 전송
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      // Sentry 통합은 선택사항
      // this.sendToSentry(error, errorData);
    }
  }

  /**
   * 디버그 로그
   */
  debug(message: string, data?: Record<string, unknown>): void {
    const logData = {
      ...this.context,
      ...data,
      timestamp: new Date().toISOString(),
      level: 'debug',
    };
    logger.debug(message, logData);
  }

  /**
   * 성능 메트릭 로깅
   */
  performance(operation: string, duration: number, metadata?: Record<string, unknown>): void {
    const logData = {
      ...this.context,
      ...metadata,
      operation,
      duration,
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'performance',
    };
    logger.info(`Performance: ${operation} took ${duration}ms`, logData);
  }
}

/**
 * 전역 로거 인스턴스
 */
export const monitoringLogger = new StructuredLogger();

/**
 * 요청별 로거 생성
 */
export function createRequestLogger(requestId: string, context?: LogContext): StructuredLogger {
  return new StructuredLogger({ ...context, requestId });
}

/**
 * 사용자별 로거 생성
 */
export function createUserLogger(
  userId: string | number,
  userType: 'admin' | 'company',
  context?: LogContext
): StructuredLogger {
  return new StructuredLogger({ ...context, userId, userType });
}
