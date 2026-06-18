# Webhard Pipeline Observability

Status: implemented (AUDIT-20, 2026-05-10)

## 목적

웹하드 업로드 이후 라우팅과 자동문의 생성 과정에서 실패 또는 skip이 발생해도 운영자가 최근 backlog를 조회할 수 있어야 한다. 기존에는 서버 로그 문자열에만 분산되어 파일 단위 원인 추적이 어려웠다.

## 범위

- `getUploadPresignedUrl`, `confirmUpload`, `batchConfirmUpload` 라우팅 예외
- `AutoContactService.detectAndCreate` 자동문의 제외 폴더 skip
- 상위 업체 폴더를 찾지 못해 AutoContact가 생략되는 `company_folder_unresolved`
- 관리자 통합 대시보드의 최근 pipeline backlog 조회

## 저장 계약

별도 DB migration 없이 기존 `sync_logs.metadata`를 사용한다.

```json
{
  "auditKind": "webhard_pipeline",
  "stage": "routing",
  "pipelineStatus": "failed",
  "reasonCode": "routing_failed",
  "fileId": "file-uuid",
  "folderId": "folder-uuid",
  "context": {
    "requestedFolderId": "folder-uuid",
    "source": "getUploadPresignedUrl"
  }
}
```

`status` 컬럼은 pipeline status에 따라 다음 값으로 매핑한다.

| pipelineStatus | SyncLog.status |
| -------------- | -------------- |
| `failed`       | `api_error`    |
| `skipped`      | `skipped`      |

## 민감정보 정책

trace/backlog에는 R2 presigned URL, raw API key, token, secret, password, authorization, cookie를 저장하거나 반환하지 않는다. `context`는 구조화 원인 분석에 필요한 폴더/소스/인덱스 수준의 값만 포함한다.

## 운영 알림 dedupe

AutoContact가 미분류 문의를 생성할 때 발행하는 admin `webhard_classify_failed` notification은 같은 `metadata.folderPath` 기준 최근 1시간 중복을 막는다. 이 정책은 운영자가 같은 외부 폴더의 반복 미분류 업로드로 알림 폭주를 받지 않게 하기 위한 것이며, `new_contact` notification과 `sync_logs.metadata.auditKind='webhard_pipeline'` 이벤트는 숨기지 않는다.

## 조회 계약

관리자 대시보드는 `GET /api/v1/integration/sync-logs/pipeline-backlog?limit=8`을 사용해 최근 실패/skip 목록을 표시한다.

응답 필드:

- `id`
- `filename`
- `companyName`
- `stage`
- `status`
- `reasonCode`
- `fileId`
- `folderId`
- `context`
- `createdAt`

상세 API 계약은 `docs/specs/api/endpoints/integration.md`의 `GET /api/v1/integration/sync-logs/pipeline-backlog`를 따른다.

## reasonCode

| reasonCode                     | stage          | status    | 의미                                     |
| ------------------------------ | -------------- | --------- | ---------------------------------------- |
| `routing_failed`               | `routing`      | `failed`  | 외부웹하드 folder routing 중 예외 발생   |
| `auto_contact_excluded_folder` | `auto_contact` | `skipped` | 자동문의 제외 폴더 정책으로 생성 생략    |
| `company_folder_unresolved`    | `auto_contact` | `skipped` | 상위 업체 폴더 해석 실패로 자동문의 생략 |

## 검증

- `webhard-api`: `pnpm test -- sync-log --runInBand`
- `webhard-api`: `pnpm test -- files.service.spec.ts --runInBand`
- `webhard-api`: `pnpm test -- auto-contact.service.spec.ts --runInBand`
- `frontend`: `pnpm test -- --testPathPatterns="src/__tests__/api/integration-pipeline-backlog-api.test.ts" --runInBand`
- backend/frontend `npx tsc --noEmit`
