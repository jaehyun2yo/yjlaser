# Phase 2: 백엔드 — AutoContactService 필터링 + 테스트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/auto-contact-exclude.md` (이번 기능 스펙)
- `/tasks/4-contact-exclude/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `webhard-api/src/folders/webhard-config.service.ts` (Phase 1에서 추가된 메서드들)
- `webhard-api/src/integration/orders/auto-contact.service.ts` (수정 대상)
- `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` (기존 테스트 패턴)
- `webhard-api/src/folders/__tests__/webhard-config.service.spec.ts` (기존 테스트 패턴)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. `webhard-api/src/integration/orders/auto-contact.service.ts` 수정

`detectAndCreate()` 메서드의 **try 블록 최상단**에 제외 폴더 체크를 추가:

```typescript
async detectAndCreate(dto: AutoContactFromFileDto): Promise<AutoContactResult | null> {
    try {
      // 문의 자동생성 제외 폴더 체크
      const isExcluded = await this.webhardConfigService.isAutoContactExcluded(dto.folderPath);
      if (isExcluded) {
        this.logger.log(
          `Auto contact skipped (excluded folder): company=${dto.companyName}, path=${dto.folderPath}`
        );
        return null;
      }

      // ... 기존 로직 그대로 유지 ...
```

**핵심 규칙:**

- `webhardConfigService`는 이미 생성자에서 주입되어 있으므로 추가 주입 불필요
- 기존 코드는 한 줄도 수정하지 마라. 오직 try 블록 최상단에 if 블록만 추가
- `return null`을 사용하라 (callers가 반환값을 사용하지 않으므로, 에러 케이스와 동일하게 null 반환이 적절)

### 2. `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` 수정

**2-1. 기존 `makeWebhardConfigService()` mock에 새 메서드 추가:**

```typescript
function makeWebhardConfigService() {
  return {
    classifyByFolderPath: jest.fn(async (path: string) => {
      // ... 기존 그대로 ...
    }),
    getStatusForInquiryType: jest.fn(async (type: string | null) => {
      // ... 기존 그대로 ...
    }),
    getFolderStatusMapping: jest.fn(),
    getExcludedFolders: jest.fn(),
    // 새로 추가: 기본적으로 제외하지 않음 (기존 테스트 호환)
    isAutoContactExcluded: jest.fn().mockResolvedValue(false),
  };
}
```

기존 mock 함수들은 절대 수정하지 마라. `isAutoContactExcluded` 한 줄만 추가.

**2-2. 새 테스트 케이스 2개 추가 (파일 맨 아래):**

```typescript
// ──────────────────────────────────────────────
// 15. detectAndCreate — 문의 자동생성 제외 폴더 (skip)
// ──────────────────────────────────────────────
describe('AutoContactService.detectAndCreate — 자동생성 제외 폴더', () => {
  let service: AutoContactService;
  let prisma: ReturnType<typeof makePrisma>;
  let webhardConfig: ReturnType<typeof makeWebhardConfigService>;

  beforeEach(() => {
    prisma = makePrisma();
    webhardConfig = makeWebhardConfigService();
    service = new AutoContactService(
      prisma as never,
      webhardConfig as never,
      makeNumberService() as never,
      { recordChange: jest.fn() } as never
    );
  });

  it('제외 폴더 경로 → null 반환, DB 접근 없음', async () => {
    webhardConfig.isAutoContactExcluded.mockResolvedValueOnce(true);

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/업체A/ㄱ 내리기전용/하위폴더',
    });

    expect(result).toBeNull();
    // DB 접근이 전혀 없어야 함
    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('비제외 폴더 경로 → 정상 생성 (제외 체크 통과)', async () => {
    webhardConfig.isAutoContactExcluded.mockResolvedValueOnce(false);
    prisma.contact.findFirst.mockResolvedValueOnce(null);
    prisma.contact.create.mockResolvedValueOnce({ id: 'uuid-normal' });

    const result = await service.detectAndCreate({
      ...baseDto,
      folderPath: '/업체A/칼선의뢰',
    });

    expect(result).not.toBeNull();
    expect(result?.action).toBe('created');
    expect(webhardConfig.isAutoContactExcluded).toHaveBeenCalledWith('/업체A/칼선의뢰');
  });
});
```

### 3. `webhard-api/src/folders/__tests__/webhard-config.service.spec.ts` 수정

기존 테스트 파일을 읽고, 기존 패턴을 따라 아래 테스트를 추가하라.
`isAutoContactExcluded` 메서드는 내부에서 `getAutoContactExcludedFolders()`를 호출하므로, SystemSetting DB mock이 필요하다.
기존 테스트의 Prisma mock 구조를 참고하여 작성하라.

추가할 테스트:

```typescript
describe('WebhardConfigService.isAutoContactExcluded', () => {
  // 각 테스트에서 systemSetting.findUnique mock을 설정하여
  // AUTO_CONTACT_EXCLUDED_KEY에 대한 값을 반환하도록 구성

  it('경로 세그먼트에 제외 폴더명이 정확 일치하면 true', async () => {
    // mock: ["ㄱ 내리기전용"] 반환
    // input: '/업체A/ㄱ 내리기전용/하위폴더'
    // expected: true
  });

  it('부분 문자열 매칭은 false (정확 일치만)', async () => {
    // mock: ["ㄱ 내리기전용"] 반환
    // input: '/업체A/ㄱ 내리기전용2/파일'
    // expected: false (ㄱ 내리기전용2 ≠ ㄱ 내리기전용)
  });

  it('제외 목록에 없는 경로는 false', async () => {
    // mock: ["ㄱ 내리기전용"] 반환
    // input: '/업체A/칼선의뢰'
    // expected: false
  });

  it('DB 미설정 시 기본값 ["ㄱ 내리기전용"] 사용', async () => {
    // mock: systemSetting.findUnique → null (DB에 값 없음)
    // input: '/업체A/ㄱ 내리기전용'
    // expected: true (기본값이 적용됨)
    // 추가 검증: systemSetting.create가 호출됨 (시딩)
  });
});
```

테스트 구현체는 기존 테스트 파일의 mock 패턴을 정확히 따르라. 시그니처만 제시하고 내부 구현은 에이전트 재량이지만, 각 테스트의 input/expected는 반드시 위에 명시된 대로 지켜라.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/4-contact-exclude/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `auto-contact.service.ts`에서 기존 코드를 수정하지 마라. try 블록 최상단에 if 블록만 추가.
- `auto-contact.service.spec.ts`에서 기존 테스트를 수정하지 마라. `makeWebhardConfigService()`에 `isAutoContactExcluded` mock 추가 + 새 describe 블록 2개만 추가.
- 기존 14개 테스트가 모두 통과해야 한다. `isAutoContactExcluded` mock의 기본 반환값이 `false`여야 기존 테스트가 영향받지 않는다.
- `webhard-config.service.spec.ts` 테스트 추가 시, 기존 테스트의 mock 구조(PrismaService, systemSetting.findUnique 등)를 정확히 따르라.
