# Phase 4: split-path

## 사전 준비

아래 문서·코드를 반드시 읽어라:

- `tasks/20-webhard-folder-policy-unify/phase0.md`, `phase1.md` — phase 1 이후 `ensureInquiryFolder` 는 중간 `문의/` 폴더 하위에 생성.
- `tasks/20-webhard-folder-policy-unify/docs-diff.md`
- `docs/specs/features/drawing-workflow.md` §W.1 — 경로별 폴더 동작 표의 "경로 5. 문의 분할" 줄 (자식별 `문의-{O}-{i}`, 독립 동급).
- `webhard-api/src/contacts/contacts.service.ts` — `splitContact` 메서드 (약 line 1761). 현재 자식 Contact 생성만 하고 폴더 처리 없음.
- `webhard-api/src/common/inquiry-filename.util.ts` — `buildInquiryFolderName`. 이미 분할 suffix 지원: `inquiryNumber='{O}-1'` → `문의-{O}-1`. (`inquiry-filename.util.spec.ts:155, 159` 검증됨. 이번 phase 에서 util 수정 불필요.)

이유: 분할 자식 Contact 가 생성될 때 폴더도 함께 만들어야 W.1 스펙과 일치. 자식 폴더는 중간 `문의/` 폴더 하위에 독립 동급으로 배치 (부모 `문의-{O}/` 하위 **nested 아님**).

## 작업 내용

### 1. `contacts.service.ts` — `splitContact` 자식별 `ensureInquiryFolder` 호출 추가

현재 구조 (개략):

```ts
async splitContact(parentId: string, parts: SplitPart[]) {
  return this.prisma.$transaction(async (tx) => {
    const children = [];
    for (let i = 0; i < parts.length; i++) {
      const child = await tx.contact.create({
        data: {
          inquiryNumber: `${parentInquiryNumber}-${i + 1}`,
          // ... 부모에서 복사된 필드
        },
      });
      children.push(child);
    }
    return children;
  });
}
```

변경 후:

```ts
async splitContact(parentId: string, parts: SplitPart[]) {
  return this.prisma.$transaction(async (tx) => {
    const children = [];
    for (let i = 0; i < parts.length; i++) {
      const child = await tx.contact.create({ ... });

      if (child.inquiryType) {
        // [NEW] 자식별 폴더 생성 — 중간 `문의/` 폴더 하위에 `문의-{부모O}-{i+1}` 배치
        await this.foldersService.ensureInquiryFolder(child.id, tx);
      }

      children.push(child);
    }
    return children;
  });
}
```

핵심 규칙:

- 자식의 `inquiryNumber` 는 `{부모O}-1`, `{부모O}-2` 형태 → `buildInquiryFolderName` 이 `문의-{부모O}-1`, `문의-{부모O}-2` 반환 (util 이미 검증됨).
- 자식 폴더의 parent 는 **중간 `문의/` 폴더** (부모 `문의-{부모O}/` 폴더 **하위 아님**) — phase 1 의 `ensureInquiryRootFolder` + `ensureInquiryFolder` parent 변경 덕분에 자동 보장.
- `relocateContactFiles` 는 호출하지 **않음** — 자식 Contact 에 아직 WebhardFile 없음 (splitContact 는 부모에서 필드만 복사하고 파일을 옮기지 않음).
- 부모 폴더는 그대로 남김 (아카이브 안 함). 부모 Contact 의 soft delete 여부는 splitContact 기존 동작 유지.
- 미분류 자식 (`inquiryType=null`) 은 폴더 생성 안 함. 현재 splitContact 로직상 부모에서 복사되므로 부모가 분류됐으면 자식도 분류된 상태가 일반적이나, 안전장치로 `if` 체크.

### 2. `inquiry-filename.util.ts` 확인 (수정 없음)

`buildInquiryFolderName({ inquiryNumber: '260422-O-001-1' })` 이 `'문의-260422-O-001-1'` 을 반환함을 재확인. `inquiry-filename.util.spec.ts:155` 에 이미 검증 테스트 존재. **util 수정 금지** — 코드·테스트 모두 그대로.

### 3. 테스트 추가 — `contacts.service.spec.ts` split 블록

**신규 P4-1**: `splitContact` 2 분할 —

- 자식 2 개 각각 `문의-{부모O}-1`, `문의-{부모O}-2` 폴더 생성 확인.
- 각 폴더의 `parentId` 가 **중간 "문의" 폴더 id** 여야 함 (부모 Contact 의 `문의-{부모O}` 폴더 id **아님**).
- `ensureInquiryFolder` mock 2 회 호출 (자식 2 명 분).

**신규 P4-2**: `splitContact` 3 분할 — 자식 3 개 모두 폴더 생성. `ensureInquiryFolder` mock 3 회 호출.

**신규 P4-3**: `splitContact` 후 부모 폴더 DB 에 그대로 남음 — 자식 폴더 생성 과정에서 부모 폴더 삭제·이동·rename 없음 (`prisma.webhardFolder.delete`, `update({ parentId })`, `update({ name })` mock 미호출 검증).

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

기존 split 테스트 회귀 없고 P4-1~P4-3 통과.

## AC 검증 방법

위 커맨드 통과 시 `tasks/20-webhard-folder-policy-unify/index.json` 의 phase 4 status 를 `"completed"` 로 변경. 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- 자식 폴더를 부모 폴더 **하위** (nested) 에 만들지 말 것 — 독립 동급 (중간 "문의" 폴더 하위).
- `relocateContactFiles` 호출 **금지** — 자식에 아직 파일 없음.
- 부모 Contact·부모 폴더 **건드리지 않음** — 분할 후에도 유지 (archive 정책은 task 21 이후).
- `buildInquiryFolderName` util 수정 **금지** — 이미 동작 확인됨.
- 자식 `inquiryNumber` 형식 (`{부모O}-{i}`) 은 **기존 splitContact 로직 그대로** 사용 — 이 phase 에서 번호 발급 규칙 변경 금지.
- Phase 5 (docs-sync) 는 이 phase 에서 건드리지 **않는다**.
- 자식 Contact 에 `inquiryType` 이 없는 엣지 케이스 (부모 미분류 상태에서 분할) 는 현재 splitContact 가 허용하는지 기존 spec 확인 후 처리. 허용된다면 `if (child.inquiryType)` 가드로 폴더 생성 skip.
