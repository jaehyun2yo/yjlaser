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

```json
{ "folders": ["ㄱ 내리기전용", "테스트폴더"] }
```

Response:

```json
{ "success": true }
```

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
