import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  operationName?: string;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'operationName'>> = {
  maxRetries: 3,
  initialDelayMs: 1000, // 재시도 전 대기 시간 증가 (pgbouncer 안정화)
  maxDelayMs: 10000, // 최대 대기 시간 증가
};

// 헬스체크 간격 (5분)
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // 재연결 가능한 에러 코드 목록
  private readonly RETRYABLE_ERROR_CODES = [
    '08P01', // protocol_violation - insufficient data left in message
    '08006', // connection_failure
    '08003', // connection_does_not_exist
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    'XX000', // internal_error
    'XX001', // data_corrupted
  ];

  // 동시 재연결 방지 플래그
  private isReconnecting = false;
  private reconnectPromise: Promise<void> | null = null;

  // 헬스체크 타이머
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheckTime = Date.now();
  private consecutiveFailures = 0;

  constructor() {
    const dbUrl = process.env.DATABASE_URL || '';
    const hasPoolConfig = dbUrl.includes('connection_limit');

    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      // DATABASE_URL에 connection_limit이 없으면 프로그래밍적으로 설정
      ...(!hasPoolConfig && dbUrl
        ? {
            datasourceUrl: `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}connection_limit=10&pool_timeout=10`,
          }
        : {}),
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');

      // 주기적 헬스체크 시작
      this.startHealthCheck();
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    // 헬스체크 중단
    this.stopHealthCheck();
    await this.$disconnect();
  }

  /**
   * 주기적 헬스체크 시작
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);
    this.logger.log(`Health check started (interval: ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`);
  }

  /**
   * 헬스체크 중단
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 헬스체크 수행 - 간단한 쿼리로 연결 상태 확인
   */
  private async performHealthCheck(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.lastHealthCheckTime = Date.now();
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      this.logger.warn(`Health check failed (attempt ${this.consecutiveFailures})`, error);

      // 연속 실패 시 연결 리셋
      if (this.consecutiveFailures >= 2) {
        this.logger.warn('Multiple health check failures, resetting connection...');
        await this.resetConnection();
      }
    }
  }

  /**
   * 연결 상태 확인 (외부에서 호출 가능)
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 에러가 재시도 가능한지 확인
   */
  isRetryableError(error: unknown): boolean {
    const code = this.getErrorCode(error);
    if (!code) return false;
    return this.RETRYABLE_ERROR_CODES.includes(code);
  }

  /**
   * 에러에서 PostgreSQL 에러 코드 추출
   */
  private getErrorCode(error: unknown): string | null {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Prisma 에러에서 코드 추출
      const meta = error.meta as { code?: string } | undefined;
      return meta?.code ?? error.code ?? null;
    }

    if (error instanceof Error) {
      // 에러 메시지에서 코드 추출 시도
      const match = error.message.match(/error code:?\s*(\w+)/i);
      if (match) return match[1];

      // 특정 에러 패턴 감지
      if (error.message.includes('insufficient data left in message')) {
        return '08P01';
      }
      if (error.message.includes('connection') && error.message.includes('closed')) {
        return '08003';
      }
    }

    return null;
  }

  /**
   * 연결 재설정 (08P01 오류 발생 시 호출)
   * 동시 재연결 방지 로직 포함
   */
  async resetConnection(): Promise<void> {
    // 이미 재연결 진행 중이면 해당 Promise 반환
    if (this.isReconnecting && this.reconnectPromise) {
      return this.reconnectPromise;
    }

    this.isReconnecting = true;
    this.reconnectPromise = this.doResetConnection();

    try {
      await this.reconnectPromise;
    } finally {
      this.isReconnecting = false;
      this.reconnectPromise = null;
    }
  }

  private async doResetConnection(): Promise<void> {
    this.logger.warn('Resetting database connection...');

    // 1. 기존 연결 완전히 끊기
    try {
      await this.$disconnect();
    } catch {
      // 이미 끊어진 연결은 무시
    }

    // 2. pgbouncer 연결 풀 안정화를 위해 충분히 대기 (1초)
    await this.sleep(1000);

    // 3. 재연결 시도 (최대 3회)
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();

        // 4. 재연결 검증 - 간단한 쿼리로 확인
        await this.$queryRaw`SELECT 1`;

        // 5. 추가 안정화 대기
        await this.sleep(500);

        this.logger.log(`Database reconnected successfully (attempt ${attempt})`);
        this.consecutiveFailures = 0;
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Reconnection attempt ${attempt}/3 failed`);

        // 다음 시도 전 대기
        if (attempt < 3) {
          await this.sleep(1000 * attempt);
        }
      }
    }

    this.logger.error('Failed to reconnect to database after 3 attempts', lastError);
    throw lastError;
  }

  /**
   * Retry 헬퍼 메서드
   * 모든 서비스에서 사용할 수 있는 통합 retry 로직
   */
  async executeWithRetry<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T> {
    const {
      maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
      initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
      maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
      operationName = 'unknown',
    } = options ?? {};

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // 마지막 시도이거나 재시도 불가능한 에러면 throw
        if (attempt > maxRetries || !this.isRetryableError(error)) {
          throw error;
        }

        const errorCode = this.getErrorCode(error);
        this.logger.warn(
          `[${operationName}] Attempt ${attempt}/${maxRetries + 1} failed with error ${errorCode}. Retrying...`
        );

        // 연결 리셋
        await this.resetConnection();

        // 지수 백오프로 대기
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        await this.sleep(delay);
      }
    }

    // 여기까지 도달하면 모든 재시도 실패
    throw lastError;
  }

  /**
   * Sleep 헬퍼
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
