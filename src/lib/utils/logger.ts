/**
 * 로깅 유틸리티
 * 프로덕션 환경에서는 로그 레벨에 따라 필터링
 * 민감 정보 자동 필터링 적용
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 민감 정보 필터링 키워드 목록
 * 이 키워드가 포함된 필드는 마스킹됨
 */
const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'passwordHash',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'sessionSecret',
  'session_secret',
  'privateKey',
  'private_key',
  'creditCard',
  'credit_card',
  'ssn',
  'social_security',
  'authorization',
] as const;

/**
 * 민감 정보를 마스킹합니다
 * @param data - 마스킹할 데이터
 * @returns 마스킹된 데이터
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // 문자열인 경우 그대로 반환 (키-값 쌍이 아니므로)
  if (typeof data === 'string') {
    return data;
  }

  // 숫자, 불리언 등 원시 타입은 그대로 반환
  if (typeof data !== 'object') {
    return data;
  }

  // 배열인 경우 각 요소를 재귀적으로 처리
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  // 객체인 경우 각 키-값 쌍을 처리
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // 민감 정보 키인지 확인
    const isSensitive = SENSITIVE_KEYS.some(
      (sensitiveKey) =>
        lowerKey.includes(sensitiveKey.toLowerCase()) || lowerKey === sensitiveKey.toLowerCase()
    );

    if (isSensitive) {
      // 민감 정보는 마스킹
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // 중첩 객체는 재귀적으로 처리
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * 로그 인자를 안전하게 변환합니다
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => sanitizeData(arg));
}

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (isDevelopment) return true;

    // 프로덕션에서는 error와 warn만 로깅
    return level === 'error' || level === 'warn';
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      // 민감 정보 필터링 적용
      console.debug(`[DEBUG] ${message}`, ...sanitizeArgs(args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      // 민감 정보 필터링 적용
      console.log(`[INFO] ${message}`, ...sanitizeArgs(args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      // 민감 정보 필터링 적용
      console.warn(`[WARN] ${message}`, ...sanitizeArgs(args));
    }
  }

  error(message: string, error?: unknown, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      // 민감 정보 필터링 적용
      const sanitizedError = sanitizeData(error);
      const sanitizedArgsList = sanitizeArgs(args);

      if (sanitizedError !== undefined) {
        if (sanitizedArgsList.length > 0) {
          console.error(`[ERROR] ${message}`, sanitizedError, ...sanitizedArgsList);
        } else {
          console.error(`[ERROR] ${message}`, sanitizedError);
        }
      } else {
        if (sanitizedArgsList.length > 0) {
          console.error(`[ERROR] ${message}`, ...sanitizedArgsList);
        } else {
          console.error(`[ERROR] ${message}`);
        }
      }
    }
  }

  /**
   * 특정 모듈/컨텍스트별 로거 생성
   */
  createLogger(context: string) {
    return {
      debug: (message: string, ...args: unknown[]) =>
        this.debug(`[${context}] ${message}`, ...args),
      info: (message: string, ...args: unknown[]) => this.info(`[${context}] ${message}`, ...args),
      warn: (message: string, ...args: unknown[]) => this.warn(`[${context}] ${message}`, ...args),
      error: (message: string, error?: unknown, ...args: unknown[]) =>
        this.error(`[${context}] ${message}`, error, ...args),
    };
  }
}

export const logger = new Logger();
