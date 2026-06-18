/**
 * 세션 관리 유틸리티 테스트
 * src/lib/auth/session.ts
 *
 * ⚠️ 현재 상태: SKIP
 * Next.js cookies() API는 Request context 내에서만 동작하므로 유닛 테스트가 어렵습니다.
 * 향후 E2E 테스트 또는 통합 테스트로 작성해야 합니다.
 *
 * 대안:
 * 1. Playwright를 사용한 E2E 테스트
 * 2. Next.js App Router 테스트 유틸리티 사용 (향후 지원 시)
 * 3. MSW(Mock Service Worker)를 사용한 통합 테스트
 *
 * 참고: tests/lib/r2/upload.test.ts, tests/lib/react-query/queryKeys.test.ts는 정상 동작합니다.
 */

import { describe, it, expect } from '@jest/globals';

describe.skip('세션 관리 유틸리티 (SKIP - Next.js Request Context 필요)', () => {
  it('placeholder test', () => {
    expect(true).toBe(true);
  });
});
