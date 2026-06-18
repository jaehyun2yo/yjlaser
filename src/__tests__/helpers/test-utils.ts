/**
 * 테스트 유틸리티 함수들
 * 공통적으로 사용되는 테스트 헬퍼 함수들을 제공합니다.
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * 테스트용 QueryClient 생성
 * React Query 테스트에서 사용할 격리된 QueryClient를 생성합니다.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * 비동기 작업이 완료될 때까지 대기
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timeout: condition not met within ${timeout}ms`);
}

/**
 * 지정된 시간만큼 대기
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock 함수의 호출을 특정 횟수만큼 대기
 */
export async function waitForMockCalls(
  mockFn: jest.Mock,
  expectedCalls: number,
  timeout = 5000
): Promise<void> {
  await waitFor(() => mockFn.mock.calls.length >= expectedCalls, timeout);
}

/**
 * 에러가 발생하는지 테스트하는 헬퍼
 */
export async function expectToThrow(
  fn: () => Promise<unknown>,
  errorMessage?: string | RegExp
): Promise<void> {
  let thrown = false;
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    thrown = true;
    error = e as Error;
  }

  expect(thrown).toBe(true);

  if (errorMessage && error) {
    if (typeof errorMessage === 'string') {
      expect(error.message).toContain(errorMessage);
    } else {
      expect(error.message).toMatch(errorMessage);
    }
  }
}

/**
 * 날짜를 ISO 문자열로 변환 (테스트용)
 */
export function toISOString(date: Date | string): string {
  if (typeof date === 'string') {
    return new Date(date).toISOString();
  }
  return date.toISOString();
}

/**
 * UUID 생성 (테스트용)
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 객체에서 undefined 값을 제거
 */
export function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * 깊은 복사 (테스트용)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
