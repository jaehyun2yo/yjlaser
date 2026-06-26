# Google Drive 삭제 정책 보강 기록

- 작성일: 2026-06-26
- 범위: 회사사이트 `webhard-api` Google Drive storage provider

## 배경

운영 전 canary에서 Google Drive 서비스 계정은 canary 파일/폴더를 휴지통으로 이동할 수
있지만 영구삭제 권한은 없는 상태로 확인됐다.

- 확인된 권한: `canTrash=true`
- 부족한 권한: `canDelete=false`
- 영향: `files.delete` 기반 영구삭제는 `403/404` 계열 실패가 발생할 수 있다.

## 보강 정책

`GoogleDriveStorageProvider.deleteFile()`은 영구삭제가 권한 부족으로 실패하면 동일
Drive item을 휴지통으로 이동한다. 이 fallback은 active Drive 목록에서 파일을 제거해
사용자 업무 흐름을 막지 않기 위한 방어다.

로그는 다음 값만 남긴다.

- fallback 여부
- Drive API status
- errorType

파일명, 고객 경로, token, credential, raw customer data는 남기지 않는다.

## 운영 기준

- 휴지통 이동만으로 충분한 운영 정책이면 현재 서비스 계정 권한으로 사용 가능하다.
- 실제 영구삭제가 필요하면 Shared Drive에서 서비스 계정 권한을 삭제 가능 수준으로
  승격한 뒤 canary로 `files.delete` 성공을 재검증한다.
- 권한 승격 전까지 Drive 휴지통에는 canary 또는 삭제된 item이 남을 수 있다.

## 검증

```powershell
cd yjlaser_website/webhard-api
npm test -- src/storage/__tests__/google-drive-storage.provider.spec.ts --runInBand
```

결과:

- `GoogleDriveStorageProvider.deleteFile()` 권한 부족 시 trash fallback PASS
- provider identity, batch operation, auth boundary failure 회귀 PASS
