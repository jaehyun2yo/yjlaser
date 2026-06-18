/**
 * 에러 처리 유틸리티
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = '인증이 필요합니다.') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = '권한이 없습니다.') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * 에러를 안전하게 처리하고 사용자 친화적인 메시지 반환
 */
export function handleError(error: unknown): {
  message: string;
  code: string;
  statusCode: number;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      message: '알 수 없는 오류가 발생했습니다.',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    };
  }

  return {
    message: '알 수 없는 오류가 발생했습니다.',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  };
}

/**
 * Next.js redirect 에러인지 확인
 */
export function isNextRedirectError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message === 'NEXT_REDIRECT' ||
      (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT') === true
    );
  }
  return false;
}

/**
 * API 라우트에서 에러를 NextResponse로 변환
 */
export function toApiErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code?: string; details?: unknown };
} {
  const handled = handleError(error);
  return {
    status: handled.statusCode,
    body: {
      error: handled.message,
      code: handled.code,
      ...(handled.statusCode >= 500
        ? {}
        : { details: error instanceof AppError ? error.details : undefined }),
    },
  };
}
