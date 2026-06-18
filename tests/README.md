# 테스트 문서

## 디렉토리 구조

```
tests/
├── app/
│   └── actions/
│       └── webhard.test.ts (SKIP - Next.js Server Action + Supabase 필요)
├── lib/
│   ├── auth/
│   │   └── session.test.ts (SKIP - Next.js Request Context 필요)
│   ├── r2/
│   │   └── upload.test.ts ✅
│   └── react-query/
│       └── queryKeys.test.ts ✅
└── README.md
```

## 테스트 실행

```bash
# 모든 테스트 실행
pnpm test

# 특정 테스트 파일만 실행
pnpm test -- tests/lib/react-query/queryKeys.test.ts
pnpm test -- tests/lib/r2/upload.test.ts

# watch 모드로 실행
pnpm test:watch

# 커버리지 포함 실행
pnpm test:coverage
```

## 작성된 테스트

### ✅ React Query 키 팩토리 테스트 (queryKeys.test.ts)

**파일**: `tests/lib/react-query/queryKeys.test.ts`
**대상**: `src/lib/react-query/queryKeys.ts`
**테스트 수**: 50개
**상태**: ✅ 통과

#### 테스트 항목:

1. **contacts 키**: all, lists, list, detail, status 키 검증
2. **companies 키**: all, list, detail, profile 키 검증
3. **portfolio 키**: all, list, detail 키 검증
4. **webhard 키**:
   - folders: all, list, children, ancestors, undownloadedCount, batchUndownloadedCount
   - files: all, list, detail
   - search: modal, dropdown
   - totalUndownloadedCount, badgeCounts, storage
5. **erp 키**: tasks, machines, workers 키 검증
6. **processBoard 키**: board 키 검증
7. **sync 키**: status, events 키 검증
8. **키 일관성 검증**: 동일 파라미터 → 동일 키, 다른 파라미터 → 다른 키
9. **키 계층 구조 검증**: detail 키는 all 키 포함, list 키는 lists() 키 포함
10. **특수 케이스**: 빈 문자열, 숫자 0, undefined 처리
11. **필터 객체 변경 감지**: 객체 내용 비교

---

### ✅ R2 업로드 유틸리티 테스트 (upload.test.ts)

**파일**: `tests/lib/r2/upload.test.ts`
**대상**: `src/lib/r2/upload.ts`
**테스트 수**: 18개
**상태**: ✅ 통과

#### 테스트 항목:

1. **calculatePresignedUrlExpiry**:
   - 작은 파일 (< 100MB): 기본 1시간 만료
   - 중간 파일 (100MB): 기본 1시간 만료
   - 큰 파일 (500MB, 1GB): 최대 1시간 제한
   - 0 바이트, 1KB: 기본 1시간 만료

2. **buildVariantKeys**:
   - 이미지 파일명 → thumb, medium, original 키 생성
   - PNG 확장자 유지
   - 확장자 없는 파일 처리
   - 여러 점(.)이 있는 파일명 처리
   - 고유 ID 포함 확인
   - 중복 호출 시 다른 키 생성

3. **환경 변수 검증**:
   - 필수 R2 환경 변수 설정 확인
   - R2_PUBLIC_BASE_URL 유효성 검증

4. **상수 검증**:
   - 스트림 업로드 임계값: 10MB
   - Presigned URL 최소/최대 만료 시간: 1시간
   - 크기 계산 인자: 100MB당 1시간

---

### ⏸️ 웹하드 서버 액션 테스트 (webhard.test.ts)

**파일**: `tests/app/actions/webhard.test.ts`
**대상**: `src/app/actions/webhard.ts`
**상태**: ⏸️ SKIP (Next.js Server Action + Supabase 필요)

#### SKIP 사유:

Next.js Server Actions는 Request context와 Supabase 서버 클라이언트를 사용하므로, 일반 유닛 테스트로 작성할 수 없습니다.

#### 대안:

1. **Playwright E2E 테스트**: 실제 브라우저 환경에서 폴더 생성 테스트
2. **Supabase Local 환경 통합 테스트**: 로컬 DB를 사용한 통합 테스트
3. **MSW(Mock Service Worker) 통합 테스트**: API 모킹

#### 향후 작업:

```bash
# E2E 테스트 예시
e2e/
└── webhard/
    └── folder-initialization.spec.ts

# 통합 테스트 예시
tests/integration/
└── webhard/
    └── folder-initialization.test.ts
```

---

### ⏸️ 세션 관리 유틸리티 테스트 (session.test.ts)

**파일**: `tests/lib/auth/session.test.ts`
**대상**: `src/lib/auth/session.ts`
**상태**: ⏸️ SKIP (Next.js Request Context 필요)

#### SKIP 사유:

Next.js의 `cookies()` API는 Request context 내에서만 동작하므로, 일반 유닛 테스트로 작성할 수 없습니다.

#### 대안:

1. **Playwright E2E 테스트**: 실제 브라우저 환경에서 세션 생성/검증 테스트
2. **Next.js App Router 테스트 유틸리티**: 향후 Next.js에서 공식 지원 시 사용
3. **MSW(Mock Service Worker) 통합 테스트**: Request/Response 모킹

#### 향후 작업:

```bash
# Playwright E2E 테스트 예시
e2e/
└── auth/
    └── session.spec.ts
```

---

## 테스트 커버리지

현재 테스트 커버리지 목표:

- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 50%
- **Statements**: 50%

```bash
# 커버리지 확인
pnpm test:coverage
```

---

## 테스트 작성 가이드

### 1. 파일 위치

```
tests/
└── lib/
    └── [기능]/
        └── [파일명].test.ts
```

### 2. 테스트 파일 구조

```typescript
/**
 * [기능] 테스트
 * src/lib/[기능]/[파일명].ts
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 테스트대상함수 } from '@/lib/[기능]/[파일명]';

describe('[기능명]', () => {
  beforeEach(() => {
    // 테스트 전 초기화
  });

  describe('[함수명]', () => {
    it('[테스트 케이스 설명]', () => {
      // Arrange
      const input = '테스트 입력';

      // Act
      const result = 테스트대상함수(input);

      // Assert
      expect(result).toBe('예상 결과');
    });
  });
});
```

### 3. 모킹 패턴

```typescript
// 외부 의존성 모킹
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));
```

### 4. 환경 변수 설정

```typescript
// 테스트 환경 변수 설정 (jest.setup.js 또는 테스트 파일 상단)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NODE_ENV = 'test';
```

---

## 주의사항

1. **Next.js 특수 API**: `cookies()`, `headers()` 등은 Request context 내에서만 동작
2. **모킹 순서**: 의존성 모킹 → import 순서 중요
3. **환경 변수**: 테스트용 환경 변수는 `jest.setup.js`에서 설정
4. **경로 별칭**: `@/` 경로 별칭은 `jest.config.js`의 `moduleNameMapper`에서 설정

---

## 참고 자료

- [Jest 공식 문서](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Next.js 테스팅 가이드](https://nextjs.org/docs/testing)
- [Playwright E2E 테스팅](https://playwright.dev/)
