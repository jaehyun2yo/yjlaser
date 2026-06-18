import {
  AppError,
  ValidationError,
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  handleError,
  isNextRedirectError,
  toApiErrorResponse,
} from '@/lib/utils/errors';

describe('Error Utilities', () => {
  describe('AppError', () => {
    it('should create an AppError with default status code', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should create an AppError with custom status code', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 404);
      expect(error.statusCode).toBe(404);
    });
  });

  describe('ValidationError', () => {
    it('should create a ValidationError with 400 status', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('DatabaseError', () => {
    it('should create a DatabaseError with 500 status', () => {
      const error = new DatabaseError('Database connection failed');
      expect(error.message).toBe('Database connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('AuthenticationError', () => {
    it('should create an AuthenticationError with 401 status', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('인증이 필요합니다.');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('AuthorizationError', () => {
    it('should create an AuthorizationError with 403 status', () => {
      const error = new AuthorizationError();
      expect(error.message).toBe('권한이 없습니다.');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('handleError', () => {
    it('should handle AppError correctly', () => {
      const error = new ValidationError('Invalid input');
      const result = handleError(error);
      expect(result.message).toBe('Invalid input');
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.statusCode).toBe(400);
    });

    it('should handle generic Error', () => {
      const error = new Error('Generic error');
      const result = handleError(error);
      expect(result.message).toBe('알 수 없는 오류가 발생했습니다.');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should handle unknown error type', () => {
      const result = handleError('string error');
      expect(result.message).toBe('알 수 없는 오류가 발생했습니다.');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });
  });

  describe('isNextRedirectError', () => {
    it('should detect NEXT_REDIRECT error', () => {
      const error = new Error('NEXT_REDIRECT');
      expect(isNextRedirectError(error)).toBe(true);
    });

    it('should detect NEXT_REDIRECT error with digest', () => {
      // Error 인스턴스여야 함
      const error = new Error('Some error');
      (error as { digest?: string }).digest = 'NEXT_REDIRECT;/some/path';
      expect(isNextRedirectError(error)).toBe(true);
    });

    it('should return false for non-redirect errors', () => {
      const error = new Error('Regular error');
      expect(isNextRedirectError(error)).toBe(false);
    });
  });

  describe('toApiErrorResponse', () => {
    it('should convert AppError to API response', () => {
      const error = new ValidationError('Invalid input');
      const response = toApiErrorResponse(error);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should include details for non-500 errors', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      const response = toApiErrorResponse(error);
      expect(response.body.details).toEqual({ field: 'email' });
    });
  });
});
