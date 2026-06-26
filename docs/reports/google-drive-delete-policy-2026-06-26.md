# Google Drive 삭제 정책 보강 기록

- 작성일: 2026-06-26
- 범위: 회사사이트 `webhard-api` Google Drive storage provider

## 배경

운영 전 canary에서 Google Drive 서비스 계정은 canary 파일/폴더를 휴지통으로 이동할 수
있지만 영구삭제 권한은 없는 상태로 확인됐다. 이후 영구삭제 권한 승격은 실수 피해
범위가 크다고 판단해, 앱 정책은 권한 여부와 별개로 명시 승인 기반으로 제한한다.

- 확인된 권한: `canTrash=true`
- 부족한 권한: `canDelete=false`
- 영향: `files.delete` 기반 영구삭제는 `403/404` 계열 실패가 발생할 수 있다.

## 보강 정책

- 일반 파일/폴더 삭제는 항상 휴지통 이동으로 처리한다.
- `DELETE /trash/:id`, `DELETE /trash` 영구삭제 API는 승인 body가 없으면 400으로 차단한다.
- Google Drive 영구삭제는 승인된 요청이면서 Drive item이 이미 `trashed=true`일 때만
  `files.delete`를 호출한다.
- 권한 부족 시 휴지통 fallback은 제거한다. 영구삭제 실패를 휴지통 이동으로 바꾸면
  운영자가 실제 삭제 여부를 오판할 수 있기 때문이다.
- 보관 기간 만료 자동 영구삭제는 비활성화한다. 오래된 휴지통 항목도 목록에 남기고
  사용자 승인 후에만 삭제한다.

로그는 다음 값만 남긴다.

- 승인 차단 여부
- Drive item의 휴지통 상태 차단 여부
- Drive API status
- errorType
- storageFileId hash

파일명, 고객 경로, token, credential, raw customer data는 남기지 않는다.

## 운영 기준

- 휴지통 이동은 기본 삭제 정책이며 운영자가 별도 승인하지 않아도 실행 가능하다.
- 실제 영구삭제가 필요하면 UI 확인 이후 승인 body가 포함된 휴지통 API만 사용한다.
- Shared Drive 권한이 삭제 가능 수준으로 승격되어도 앱은 active item을 직접
  영구삭제하지 않는다.
- Drive 휴지통에는 운영자가 영구삭제 승인하기 전까지 삭제된 item이 남을 수 있다.

## 검증

```powershell
cd yjlaser_website/webhard-api
npm test -- src/storage/__tests__/google-drive-storage.provider.spec.ts --runInBand
```

기대 결과:

- 승인 없는 `GoogleDriveStorageProvider.deleteFile()` 차단 PASS
- Drive item이 `trashed=false`이면 영구삭제 차단 PASS
- 승인된 `trashed=true` item만 `files.delete` 호출 PASS
- provider identity, batch operation, auth boundary failure 회귀 PASS
