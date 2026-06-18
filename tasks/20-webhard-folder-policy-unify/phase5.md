# Phase 5: docs-sync-changelog

## 사전 준비

아래 문서·산출물을 반드시 읽어라:

- `tasks/20-webhard-folder-policy-unify/` 하위 전체 — phase 0~4 의 `phase{N}.md`, `phase{N}-output.json`, `docs-diff.md`.
- phase 1~4 에서 실제로 수정된 코드 파일 (git diff 로 확인):
  - `webhard-api/src/folders/folders.service.ts`
  - `webhard-api/src/folders/folders.service.spec.ts`
  - `webhard-api/src/contacts/contacts.service.ts`
  - `webhard-api/src/contacts/contacts.service.spec.ts`
  - `webhard-api/src/contacts/drawing-revision.service.ts` (주석만)
  - `webhard-api/src/integration/orders/auto-contact.service.ts`
  - `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts`
- `docs/specs/features/drawing-workflow.md` §W.1 (phase 0 에서 업데이트된 새 규칙) — 실제 구현이 이와 일치하는지 최종 확인.
- `docs/changelog/CHANGELOG.md` — phase 0 에서 추가된 skeleton 본문 채우기.
- `docs/features-list.md` — 상태 갱신.
- `docs/followups/19-webhard-folder-policy-status.md` — §3.3 해결 표기 강화 + 남은 후보 정리.

이유: phase 1~4 의 실제 코드 변경이 phase 0 docs 와 미묘하게 다를 수 있다 (함수명·시그니처·추가된 가드·예외 처리 세부). 최종 spec-code sync + CHANGELOG 본문 작성 + followups 갱신이 이번 phase 의 역할.

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` §W.1 최종 확인·보정

phase 1~4 구현 코드와 §W.1 기술의 괴리를 찾아 수정 (docs 를 코드에 맞춘다 — 반대 금지):

- `ensureInquiryRootFolder` 시그니처·동작이 §W.1 기술과 일치하는지.
- `DEFAULT_FOLDER_TEMPLATE` 에 `문의` 추가된 점이 명시되어 있는지.
- 경로 1 (웹폼) 이 `registerFilesToWebhard` 없이 `ensureInquiryFolder + relocateContactFiles` 로 통합됨이 표에 반영되어 있는지.
- 경로 2·3 (auto-contact) 분류 확정 시 이동 + 미분류 원위치 유지 규칙 명시.
- 경로 5 (split) 자식별 `ensureInquiryFolder` 호출 + 폴더명 `문의-{O}-{i}` 명시.
- 경로별 정책이 strict / best-effort 차이 (웹폼 strict, auto-contact best-effort) 명시.

### 2. `docs/specs/api/nestjs-endpoints.md` (필요 시)

`POST /api/v1/contacts` 응답 구조 변경 없음 (create 는 이전과 동일하게 Contact 반환). 폴더 생성은 내부 부작용이므로 API 스펙 변경 불필요. 엔드포인트 "Side Effects" 섹션이 있으면 `ensureInquiryFolder` 호출 + `relocateContactFiles` 호출 언급. 없으면 Skip.

### 3. `docs/specs/db/prisma-tables.md` (필요 시)

`WebhardFolder` 스키마 변경 없음 — 수정 불필요. 단, `folderKind='template'` 의 의미에 "문의" 중간 폴더가 포함됨을 기존 설명에 한 줄 추가.

### 4. `docs/changelog/CHANGELOG.md` 본문 기입

`[Unreleased]` 의 task 20 skeleton (phase 0 에서 추가) 에 아래 본문을 채운다:

```markdown
### 2026-04-22 — webhard-folder-policy-unify (task 20)

**Scope**: Contact 생성 5 경로 (웹폼·웹하드 단건 감지·웹하드 배치 감지·split, 공통 `createNewContact`) 의 웹하드 폴더 생성 룰 통합. DXF 경로 (4) 는 task 21 으로 분리.

**Changes**:

- 폴더 구조: 업체 루트 하위에 중간 `문의/` 폴더 삽입. 모든 `문의-{O}` 폴더가 이 아래 배치.
- `ensureInquiryRootFolder(companyId, tx?)` 헬퍼 신규 — 중간 `문의` 폴더 lazy 보장.
- `DEFAULT_FOLDER_TEMPLATE` 에 `문의` 추가 — 신규 업체 eager 생성.
- `ContactsService.create` 트랜잭션 내부에 `ensureInquiryFolder + relocateContactFiles` 통합 (fire-and-forget 제거, strict 롤백).
- `ContactsService.registerFilesToWebhard` **완전 삭제** — W.3 레거시 제거.
- `AutoContactService.createNewContact` 끝단에 분류 확정 시 폴더·파일 정착 훅 추가 (미분류 원위치 유지, best-effort).
- `ContactsService.splitContact` 자식별 `ensureInquiryFolder` 호출 (독립 동급 `문의-{O}-{i}`).

**Breaking**: 기존 업체 루트 직하 `문의-{O}` 폴더 (task 19 이후 생성) 와 새 `문의/문의-{O}` 구조가 혼재 가능 — task 21 마이그레이션 스크립트에서 정리 예정.

**Tests**: `folders.service.spec.ts` P1-1~P1-5, `contacts.service.spec.ts` P2-1~P2-6 + split P4-1~P4-3, `auto-contact.service.spec.ts` P3-1~P3-5 신규 추가.

**Follow-ups (task 21 이후 후보)**: §3.1 기존 파일 정리 마이그레이션 / §3.2 dxf방·외부 폴더 정책 / §3.4 F 번호 rename 시 파일명 prefix 재계산 / §3.5 완료 폴더 운영 (월별·복귀·권한) / §3.6 webhardWarning 복구 UI / §3.7 기존 루트 파일 v1 링크 Admin UI / 경로 4 (관리프로그램 DXF) 폴더 연결.
```

### 5. `docs/features-list.md` 상태 갱신

"웹하드 폴더 자동 생성" 또는 "Contact 생성 경로 통합" 관련 항목이 있으면 `in_progress` → `shipped (task 20)` 로 변경. 없으면 새 항목 추가:

```markdown
| webhard-folder-policy-unify | Contact 생성 5 경로의 폴더 생성 룰 통합 + 중간 `문의` 폴더 구조 | shipped (task 20) |
```

### 6. `docs/followups/19-webhard-folder-policy-status.md` 갱신

phase 0 에서 추가된 "§3.3 해결 예정" 표기를 "**✅ 해결됨 (task 20, 2026-04-22)**" 으로 확정. 남은 후보 섹션을 아래 형태로 정리:

```markdown
## 3. 디테일 작업 후보 (남은 항목)

### ✅ 해결됨 (task 20, 2026-04-22)

- §3.3 — template 폴더 누적 파일 자동 분류 검증 → Phase 3 auto-contact-path 에서 해결.

### 후속 task 후보 (task 21 이후)

- §3.1 — 기존 파일 정리 마이그레이션 스크립트 (업체 루트 직하 `문의-{O}` → `문의/문의-{O}` 이동 포함)
- §3.2 — dxf방 / 외부 폴더 정책
- §3.4 — F 번호 rename 시 파일명 prefix 재계산
- §3.5 — 완료 폴더 운영 (월별 하위, 취소 복귀, 권한)
- §3.6 — webhardWarning 복구 플로우 / Admin 재시도 UI
- §3.7 — 기존 루트 파일 "원본 도면 v1" 링크 Admin UI
- 경로 4 (관리프로그램 DXF) 폴더 연결
```

### 7. 최종 통합 검증

모든 phase 완료 후 전체 빌드 + 테스트 통과 확인.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

전부 통과해야 함. 실패 시 docs 추가 수정 또는 phase 1~4 회귀를 파악. **절대 코드 로직을 docs 에 맞추기 위해 되돌리지 않는다** — docs 를 코드에 맞춘다.

## AC 검증 방법

위 커맨드 통과 시 `tasks/20-webhard-folder-policy-unify/index.json` 의 phase 5 status 를 `"completed"` 로 변경. 전체 task 도 완료로 마킹 (`/tasks/index.json` 의 task 20 status 를 `"completed"` 로 업데이트 — scripts/run-phases.py 가 자동 처리). 3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- 코드 변경 **금지** — docs only.
- 실제 구현 (phase 1~4) 과 docs 의 불일치가 있으면 **docs 를 구현에 맞게** 수정 (반대 금지 — 이미 구현된 코드를 docs 기준으로 되돌리지 말 것).
- `docs/followups/19-webhard-folder-policy-status.md` 의 §1, §2, §5 (이전 task 19 기록) 는 건드리지 말 것.
- CHANGELOG `[Unreleased]` 의 다른 task 엔트리 건드리지 말 것.
- prisma migration 생성 **금지**.
- `docs/specs/features/drawing-workflow.md` 의 §W.2, §W.3, §W.4 (아카이브) 는 phase 0 이후 추가 수정 불필요 — 이 phase 에서도 건드리지 말 것.
