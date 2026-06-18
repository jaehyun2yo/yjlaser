# Phase 0: 문서 업데이트 (docs-update)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `yjlaser_website/CLAUDE.md` — 프로젝트 전반 규칙 (한글 응답, 디자인 시스템 토큰, 스펙 동기화)
- `yjlaser_website/.claude/rules/spec-code-sync.md` — 코드/스펙 동기화 규칙
- `docs/specs/features/drawing-workflow.md` — 현재 도면 워크플로우 스펙 (A~H 섹션)
- `docs/specs/features/drawing-revision-history.md` — 도면 수정 히스토리 스펙
- `docs/specs/features/contact-split.md` — 문의 분할/타임라인 관련
- `docs/specs/features/design-system.md` — 디자인 시스템 토큰 규칙
- `docs/specs/api/endpoints/webhard.md`
- `docs/specs/api/endpoints/integration.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/거래처-웹하드-폴더-안내.md` — 거래처별 웹하드 루트 구조

## 작업 내용

코드 변경 전에, 이번 task에서 구현할 방향대로 스펙 문서들을 먼저 갱신하라. 다음 6가지 핵심 결정 사항을 문서에 반영한다:

### 결정 요약

1. **통합 타임라인**: 공정/유형 변경 이벤트 + DrawingRevision을 시간순 단일 리스트로 렌더. `ContactStatusHistory`와 `DrawingRevision`을 서버에서 인터리브.
2. **전 업로드 경로에서 WebhardFile 자동 생성**: DrawingRevision 생성 시 웹하드에도 함께 레코드 생성. 경로 A(관리자) / B(거래처 포탈) / D(Worker) / E(Integration DXF) / F(stage_change) 모두 공통. 경로 C(이미 있는 WebhardFile 연결)는 예외.
3. **폴더 정책**: `{거래처루트}/문의-{workNumber 또는 inquiryNumber}/` 하위에 저장. 파일명 프리픽스는 `{workNumber} {originalName}` 유지. `originalName` 필드는 원본 그대로.
4. **DrawingRevision↔WebhardFile 링크**: `DrawingRevision.webhardFileIds String[]` 추가 (Prisma 필드).
5. **거래처 노출 보안**: 거래처도 통합 타임라인 조회 가능. 단 서버에서 `isPublic=true` drawing_revision만 포함, `actorName`/`actorType` 관리자 마스킹("YJLaser"), `note` 제거 or 마스킹. 클라이언트 필터 금지 — 서버에서 필터된 응답만 내려간다.
6. **투명 CSS 원인**: `src/app/globals.css`의 `@theme` + `@theme inline` 충돌로 Tailwind v4에서 `bg-card`/`bg-muted`/`bg-background` 유틸이 생성되지 않아 transparent로 렌더됨. `@theme` 블록에 shadcn 변수 매핑 직접 포함 + `@theme inline` 중복 제거로 수정.

### 구체적 문서 변경

#### 1. `docs/specs/features/drawing-workflow.md`

- **섹션 B "도면 타임라인 (상세보기)"** 전면 개편:
  - 제목을 "통합 타임라인"으로 변경
  - 내용: "공정 단계 변경, 유형 변경, 업체 변경 같은 Contact 이벤트와 DrawingRevision을 하나의 시간순 리스트로 표시한다. 각 항목은 `kind: 'status_change' | 'drawing_revision'`으로 구분되며, drawing_revision 항목은 버전 뱃지·reason 라벨·파일 목록·다운로드 버튼·공개/비공개 뱃지를 인라인 렌더."
  - 관리자/거래처 공통 컴포넌트, 거래처는 서버에서 필터된 응답만 수신
  - 기존 "processStage별 그룹핑" 설명은 제거

- **섹션 D (거래처 업로드)**, **E (Worker 업로드)**, **F (DXF 자동 매칭)**:
  - 각 섹션 끝에 `"업로드 성공 시 WebhardFile 레코드도 자동 생성된다. 저장 위치는 섹션 W 참고."` 추가

- **섹션 W "웹하드 자동 저장" 신설** (C 섹션 뒤에 삽입):
  - 정책: `{거래처루트(company.name 기반)}/문의-{workNumber 또는 inquiryNumber}/{workNumber} {originalName}`
  - 거래처 루트 없으면 `foldersService.initializeCompanyFolders` 호출로 자동 생성
  - 문의별 서브폴더 없으면 자동 생성 (존재 시 재사용)
  - `WebhardFile.inquiryNumber` 필드 자동 채움
  - `WebhardFile.companyId` 서버 세션/Contact에서 파생 (클라이언트 값 신뢰 금지)
  - 예외: 경로 C (POST `/contacts/:id/link-webhard-file`)는 기존 WebhardFile 재사용이므로 신규 생성하지 않음
  - 중복 생성 방지: `createInitialRevision` 경로는 `registerFilesToWebhard`가 이미 등록하므로 DrawingRevision.createRevision 에서는 추가 호출 금지 (source === 'auto_initial'이면 skip)

- **섹션 "데이터 모델 변경"**:
  - `DrawingRevision.webhardFileIds String[]` 필드 추가 명시 (Prisma 마이그레이션: `drawing_revisions_webhard_link`)

- **섹션 "접근 권한"** 갱신:
  - 거래처 통합 타임라인 조회 가능. 단 서버 필터로 `isPublic=true` drawing_revision만, admin 메타 마스킹.

#### 2. `docs/specs/features/drawing-revision-history.md`

- **"UI 구성" 섹션** 전면 교체:
  - "관리자: 문의 상세 > 통합 타임라인" 단일 섹션
  - "거래처 포털: 문의 상세 > 통합 타임라인 (공개 항목만, 관리자 메타 마스킹)" 단일 섹션
  - 기존 "도면 수정 타임라인"과 "도면 이력" 두 섹션 분리 서술 제거

- **"데이터 모델 > DrawingRevision" 테이블**에 `webhard_file_ids` 컬럼(JSONB or String[]) 추가 기술.

- **"트리거 방식" 섹션**에 WebhardFile 자동 생성 규칙 추가:
  - "도면 수정 등록 시 WebhardFile 레코드도 자동 생성된다. 단 `source === 'auto_initial'`는 기존 `registerFilesToWebhard` 로직이 별도 처리하므로 중복 생성을 방지한다."

- **"접근 권한"** 표에 `company` 행의 "조회" 컬럼을 "통합 타임라인 (서버에서 isPublic=true 필터 + admin 메타 마스킹)"으로 변경.

#### 3. `docs/specs/api/endpoints/webhard.md` / `docs/specs/api/endpoints/integration.md`

- 해당 엔드포인트들의 설명에 한 줄 추가:
  - `POST /api/v1/contacts/:id/drawing-revisions`: "성공 시 files 각 요소당 WebhardFile 레코드도 생성된다."
  - `POST /api/v1/contacts/:id/company-drawing`: 동일
  - `POST /api/v1/integration/dxf-match/upload`: 동일
  - `POST /api/v1/integration/drawing-revisions`: 동일
  - 경로 C `POST /api/v1/contacts/:id/link-webhard-file`: "기존 WebhardFile을 재사용하므로 신규 생성하지 않음" 명시

#### 4. `docs/specs/api/nestjs-endpoints.md`

- `GET /api/v1/contacts/:id/timeline` 응답 shape 업데이트:
  ```
  {
    timeline: Array<{
      id: string,
      kind: 'status_change' | 'drawing_revision',
      createdAt: string,  // ISO 8601 — camelCase
      actorType: 'admin' | 'worker' | 'system' | 'external' | 'company',
      actorName: string | null,
      color?: string,
      payload: {
        // kind='status_change':
        changeType: string,
        fromValue?: string,
        toValue?: string,
        metadata?: Record<string, unknown>,
        // kind='drawing_revision':
        version?: number,
        processStage?: string,
        reason?: string,
        reasonDetail?: string | null,
        files?: Array<{ url, name, size, mimeType }>,
        isPublic?: boolean,
        note?: string | null
      }
    }>
  }
  ```
- 기존 snake_case 배열 반환(만약 문서에 있다면) 설명 제거.

#### 5. `docs/specs/features/design-system.md`

- 새 섹션 "Tailwind v4 `@theme` 토큰 관리":
  - `@theme { }` 블록에 shadcn 변수(`--color-card`, `--color-background`, `--color-muted`, `--color-border`, `--color-popover`, `--color-foreground`, `--color-accent`, `--color-primary`, `--color-secondary`, `--color-destructive` 등) 매핑 직접 포함
  - `@theme inline { }` 블록 사용 금지 (같은 파일 내 충돌 시 유틸 생성 실패 회귀 이슈)
  - 회귀 지점: `5a324f9 phase 2 color-redesign` — `BG_COLOR.card`를 `bg-white dark:bg-gray-800` → `bg-card` 전환 시점부터 투명 발생
  - 변경 시 육안 검증 체크리스트: 사이드바/검색 드롭다운/검색 모달/Card/Badge 컴포넌트 light/dark 모두

## Acceptance Criteria

이 phase는 문서만 변경하므로 빌드/테스트 없음. 대신 다음 grep 검증 모두 통과해야 한다:

```bash
grep -c "통합 타임라인" docs/specs/features/drawing-workflow.md
grep -c "webhard_file_ids\|webhardFileIds" docs/specs/features/drawing-revision-history.md
grep -c "WebhardFile" docs/specs/api/endpoints/webhard.md
grep -c "kind.*status_change.*drawing_revision\|kind: 'status_change'" docs/specs/api/nestjs-endpoints.md
grep -c "@theme" docs/specs/features/design-system.md
```

각 커맨드 결과가 1 이상이면 통과.

## AC 검증 방법

위 grep 커맨드를 모두 실행하라. 하나라도 0이면 해당 문서를 보완한 뒤 재검증하라.
모두 통과하면 `/tasks/13-drawing-timeline-unify/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 통과 못하면 status를 `"error"`로 변경하고 `error_message` 필드에 누락된 grep 커맨드를 기록하라.

## 주의사항

- **코드는 건드리지 마라.** 이 phase는 문서 전용이다. Prisma schema도, 서비스 코드도, 프론트엔드도 수정하지 않는다.
- 기존 문서의 formatting(Markdown 표, 헤더 레벨, 코드블록)을 유지하라. 스타일 통일성을 깨지 마라.
- 각 spec 문서는 상호 참조된다. 한 문서에서 바뀐 용어(예: "통합 타임라인")는 다른 문서에서도 동일하게 써라.
- "CHANGELOG.md 업데이트는 Phase 5에서 한다." — 이번 phase에서는 changelog 건드리지 말 것.
- 문서가 존재하지 않으면 신규 생성하지 말고, `spec-code-sync.md` Rule 1에 따라 먼저 해당 문서의 존재 여부 확인 후 없으면 report. 기본적으로 위 6개 문서는 이미 존재한다.
- Phase 0 완료 후 `scripts/run-phases.py`가 `scripts/gen-docs-diff.py`를 호출하여 `docs-diff.md`를 자동 생성한다. **에이전트가 직접 docs-diff.md를 만들지 말 것.**
