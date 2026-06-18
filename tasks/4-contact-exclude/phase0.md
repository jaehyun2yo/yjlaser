# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/laser-only-company-inquiry.md` (유사 기능 스펙 참고)
- `docs/specs/api/endpoints/integration.md` (기존 API 엔드포인트 목록)
- `docs/changelog/CHANGELOG.md` (변경 이력)

## 작업 내용

### 1. `docs/specs/features/auto-contact-exclude.md` 신규 생성

아래 구조로 기능 스펙 문서를 작성하라:

```markdown
# auto-contact-exclude (문의 자동생성 제외 폴더 설정)

## 개요

- 목적: 웹하드에서 파일 업로드 시 자동 문의 생성을 특정 폴더에 대해 비활성화할 수 있는 관리자 설정
- 도메인: 웹하드 관리 > 문의 자동생성 설정
- 배경: "ㄱ 내리기전용" 등 문의 생성이 불필요한 폴더에 파일이 올라갈 때 불필요한 문의가 생성되는 문제

## 요구사항

### 기능 요구사항

1. 관리자가 "문의 자동생성 제외 폴더" 목록을 설정할 수 있다
2. 파일 업로드 시 해당 파일의 폴더 경로 세그먼트 중 제외 목록과 정확히 일치하는 폴더명이 있으면 문의를 생성하지 않는다
3. 기본값: ["ㄱ 내리기전용"]
4. 전체 경로 세그먼트 검사 (예: /업체A/ㄱ 내리기전용/하위폴더 → "ㄱ 내리기전용" 매칭)

### 매칭 규칙

- 정확 일치: 폴더명이 정확히 일치할 때만 제외 (부분 문자열 매칭 아님)
- 전체 경로 검사: 경로의 모든 세그먼트를 순회하여 하나라도 매칭되면 제외

### 기존 "제외폴더"와의 차이

|           | 기존 제외폴더                       | 문의 자동생성 제외                    |
| --------- | ----------------------------------- | ------------------------------------- |
| 목적      | 업체명 추출 시 구조적 폴더 건너뛰기 | 문의 자동 생성 자체를 차단            |
| DB 키     | webhard_excluded_folders            | webhard_auto_contact_excluded_folders |
| 적용 위치 | resolveCompanyFolder()              | detectAndCreate() 진입부              |

## 데이터 모델

DB 스키마 변경 없음. SystemSetting 테이블의 JSON 값으로 저장:

- key: `webhard_auto_contact_excluded_folders`
- value: `["ㄱ 내리기전용"]` (string[] JSON)

## API 설계

| Method | Path                                         | Auth       | Description         |
| ------ | -------------------------------------------- | ---------- | ------------------- |
| GET    | /api/v1/folders/config/auto-contact-excluded | AdminGuard | 제외 폴더 목록 조회 |
| PUT    | /api/v1/folders/config/auto-contact-excluded | AdminGuard | 제외 폴더 목록 수정 |

### PUT /api/v1/folders/config/auto-contact-excluded

Request:
{ "folders": ["ㄱ 내리기전용", "테스트폴더"] }

Response:
{ "success": true }

## 변경 대상 파일 요약

### 백엔드 (NestJS)

| 파일                                                       | 변경 내용                                       |
| ---------------------------------------------------------- | ----------------------------------------------- |
| webhard-api/src/folders/webhard-config.service.ts          | 새 설정 키 + get/update/isExcluded 메서드       |
| webhard-api/src/folders/dto/webhard-config.dto.ts          | UpdateAutoContactExcludedFoldersDto             |
| webhard-api/src/folders/folders.controller.ts              | GET/PUT config/auto-contact-excluded 엔드포인트 |
| webhard-api/src/integration/orders/auto-contact.service.ts | detectAndCreate() 진입부 제외 체크              |

### 프론트엔드 (Next.js)

| 파일                                                                                          | 변경 내용              |
| --------------------------------------------------------------------------------------------- | ---------------------- |
| src/lib/api/nestjs-server-client.ts                                                           | API 함수 2개 추가      |
| src/app/actions/webhard.ts                                                                    | Server Action 2개 추가 |
| src/app/(admin)/admin/integration/webhard/\_components/AutoContactExcludedFoldersSettings.tsx | 신규 UI 컴포넌트       |
| src/app/(admin)/admin/integration/webhard/\_components/index.ts                               | export 추가            |
| src/app/(admin)/admin/integration/webhard/page.tsx                                            | 컴포넌트 배치          |

## 완료 기준

1. [ ] 관리자가 제외 폴더 목록을 추가/삭제할 수 있다
2. [ ] 제외 폴더 경로의 파일은 문의가 자동 생성되지 않는다
3. [ ] 기본값 "ㄱ 내리기전용"이 초기 설정으로 적용된다
4. [ ] 기존 문의 자동생성 흐름에 영향 없음 (회귀 테스트 통과)
```

### 2. `docs/specs/api/endpoints/integration.md` 업데이트

기존 웹하드 config 엔드포인트 섹션에 아래 2개 엔드포인트를 추가:

- `GET /api/v1/folders/config/auto-contact-excluded`
- `PUT /api/v1/folders/config/auto-contact-excluded`

기존 `excluded-folders`, `status-mapping` 엔드포인트와 동일한 형식으로 문서화하라.

### 3. `docs/changelog/CHANGELOG.md` 업데이트

최상단에 엔트리 추가:

```
## 2026-04-14
- feat: 웹하드 관리 > 문의 자동생성 제외 폴더 설정 기능 추가
```

## Acceptance Criteria

```bash
npx tsc --noEmit
```

문서만 수정하므로 tsc만 통과하면 된다. 코드 변경은 없다.

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/4-contact-exclude/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드를 수정하지 마라. 이 phase는 문서만 다룬다.
- 기존 문서의 형식과 어조를 유지하라.
- 스펙 문서의 내용이 이후 phase의 구현 지침이 되므로, 위에 명시된 설계 결정(정확 일치, 전체 경로 세그먼트, SystemSetting 저장)을 정확히 반영하라.
