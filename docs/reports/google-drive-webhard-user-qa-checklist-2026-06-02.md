# Google Drive 웹하드 사용자 QA 체크리스트

작성일: 2026-06-02

## 목적

Google Drive 전환 후 사용자가 브라우저에서 직접 확인할 수 있는 수동 QA 목록이다.

## 체크 표기 기준

- `[x]`: Codex가 자동 테스트, DB constraint 검증, cleanup dry-run으로 통과시킨 항목
- `[ ]`: 사용자가 브라우저 또는 실제 Google Drive 화면에서 나중에 직접 확인해야 하는 항목

## Codex 자동 검증 완료 요약

- [x] 2026-06-04 Chromium E2E 통과: `e2e/google-drive-webhard-user-qa.spec.ts`
- [x] E2E에서 신규 업체 2개 생성/승인, Drive provisioning `ready`, 업체 루트/기본 템플릿 폴더 생성 확인
- [x] E2E에서 업체 A/B 화면 격리, API 목록 격리, 타 업체 파일 다운로드 차단 확인
- [x] E2E에서 관리자 폴더 생성/이름변경/이동 후 정합성 진단 count `0` 확인
- [x] E2E에서 Google Drive 프록시 업로드, 관리자/업체 다운로드, 파일 이름변경/이동 확인
- [x] E2E에서 검색, 새 파일 배지 확인/확인처리, 공유 링크 생성/다운로드/권한 차단 확인
- [x] E2E에서 API key-only 직접 파일 다운로드와 raw share-links 목록/생성 접근이 차단되는지 확인
- [x] E2E에서 업체 사용자의 `company_id` 조작 공유 생성이 다른 업체로 저장되지 않는지 확인
- [x] E2E에서 업체 세션으로 Nest share-links에 타 업체 `webhardFileId`를 직접 넣어도 공유 토큰이 생성되지 않는지 확인
- [x] 공유 링크 `maxDownloads`가 조건부 atomic increment로 제한 초과를 막는지 확인 (Codex: service 테스트)
- [x] E2E에서 ZIP 다운로드 `application/zip`, ZIP 내부 파일명 포함 확인
- [x] E2E에서 파일 삭제→휴지통→복구, 업체 루트 삭제 차단 payload, 업체 삭제→웹하드 접근 차단→30일 내 복구 확인
- [x] E2E 최종 단계에서 Drive API 404 포함 storage consistency 진단 count `0` 확인
- [x] Google Drive ID 없는 Google Drive 폴더/파일 count가 `0`인지 cleanup dry-run으로 확인
- [x] 업체별 active root 중복 count가 `0`인지 cleanup dry-run으로 확인
- [x] `GOOGLE_DRIVE + null driveFolderId` DB insert 차단 확인
- [x] `GOOGLE_DRIVE + null driveFileId` DB insert 차단 확인
- [x] `R2 + null drive id` legacy row 허용 확인
- [x] Google Drive 폴더 생성 실패 시 DB 폴더 row 미생성 테스트 통과
- [x] upload confirm에서 `driveFileId` 없으면 실패하는 테스트 통과
- [x] 웹하드 목록/트리/검색 API가 invalid Google Drive row를 제외하는 서비스 테스트 통과
- [x] 업체 매칭 루트 폴더 삭제 차단 모달 테스트 통과
- [x] 업체 삭제/복구와 매칭 웹하드 폴더 휴지통 이동/복구 서비스 테스트 통과
- [x] 문의/도면 revision/납품 증빙 웹하드 연동 서비스 테스트 통과
- [x] 관리자 storage consistency 진단 API 단위 테스트 통과

## QA 전 준비

- [ ] 관리자 계정으로 로그인할 수 있다.
- [ ] 업체 계정으로 로그인할 수 있다.
- [x] Google Drive 서비스 계정과 Shared Drive 설정이 연결되어 있다. (Codex: 실제 Drive provisioning/upload E2E 통과)
- [x] 테스트용 업체 2개를 준비한다. (Codex: E2E에서 업체 A/B 자동 생성)
  - 예: `QA거래처A`, `QA거래처B`
- [x] 각 업체에 서로 다른 파일을 업로드할 준비가 되어 있다. (Codex: E2E에서 업체 A 대상 실제 Drive 파일 업로드)
- [ ] QA 중 발견한 실패는 화면, 업체명, 폴더명, 파일명, 발생 시간을 기록한다.

## 1. 관리자 진단

- [x] 관리자 화면에 접속한다. (Codex: `/webhard` Chromium E2E 통과)
- [x] 웹하드 관련 진단 또는 API 확인을 통해 다음 값이 모두 `0`인지 확인한다. (Codex: cleanup dry-run 통과)
  - Drive ID 없는 Google Drive 폴더
  - Drive ID 없는 Google Drive 파일
  - 업체별 active root 중복
- [x] Drive API 404 샘플 검사를 실행했을 때 누락 항목이 없음을 확인한다. (Codex: E2E 진단 `verifyDriveApi=true` 통과)
- [x] 실패 항목이 있으면 해당 항목이 정상 웹하드 목록에 보이지 않는지 확인한다. (Codex: invalid row 필터 서비스 테스트 통과)

성공 기준:

- [x] 진단 count가 모두 `0`이다.
- [x] invalid Google Drive row가 사용자 화면에 정상 폴더/파일처럼 표시되지 않는다. (Codex: 목록/트리/검색 API 필터 테스트 통과)

## 2. 업체 등록 및 업체 폴더 생성

- [x] 관리자에서 신규 업체를 등록한다. (Codex: Nest API 기반 E2E 업체 생성)
- [x] 업체를 승인 또는 활성화한다. (Codex: E2E 승인 + Drive provisioning `ready`)
- [x] 웹하드에서 해당 업체 루트 폴더가 생성되었는지 확인한다. (Codex: 관리자 `/webhard` E2E 확인)
- [x] Google Drive에서도 동일한 업체 루트 폴더가 생성되었는지 확인한다. (Codex: Drive API 진단 및 provisioning id 확인)
- [x] 업체 기본 하위 폴더 규칙이 기존 자체웹하드 구조와 일치하는지 확인한다. (Codex: `목형의뢰`, `칼선의뢰`, `문의` E2E 확인)
- [x] 업체 폴더 생성 실패 시 DB-only 업체 폴더가 생성되지 않는지 확인한다. (Codex: 서비스 테스트 통과)

성공 기준:

- DB 화면과 Google Drive 실체가 일치한다.
- [x] 업체 폴더가 화면에 있는데 Google Drive에는 없는 상태가 발생하지 않도록 DB/service 경계에서 차단된다.

## 3. 업체별 접근 격리

- [x] `QA거래처A` 업체 계정으로 로그인한다. (Codex: company-session Chromium E2E)
- [x] 웹하드에서 `QA거래처A` 폴더와 파일만 보이는지 확인한다. (Codex: E2E)
- [x] `QA거래처B` 업체 폴더 또는 파일이 보이지 않는지 확인한다. (Codex: A/B 양방향 화면 격리 E2E)
- [x] `QA거래처A` 계정으로 `QA거래처B` 파일 다운로드 URL 접근을 시도한다. (Codex: 타 업체 다운로드 차단 E2E)
- [x] 권한 없음 또는 접근 차단 응답이 나오는지 확인한다. (Codex: 403/404 E2E)
- [x] `QA거래처B` 계정으로도 같은 절차를 반대로 확인한다. (Codex: B 화면/API 격리 E2E)

성공 기준:

- [x] 업체 사용자는 다른 업체의 폴더, 파일, 다운로드에 접근할 수 없다.

## 4. 폴더 기능

- [x] 관리자에서 업체 루트 아래 새 폴더를 생성한다. (Codex: E2E)
- [x] 생성한 폴더가 웹하드 화면에 표시되는지 확인한다. (Codex: API 목록 E2E)
- [x] Google Drive에도 동일 폴더가 생성되었는지 확인한다. (Codex: Drive API 정합성 진단 E2E)
- [x] 폴더명을 변경한다. (Codex: E2E)
- [x] 웹하드 화면과 Google Drive 폴더명이 함께 변경되는지 확인한다. (Codex: API 목록 + Drive 진단 E2E)
- [x] 폴더를 다른 허용 위치로 이동한다. (Codex: E2E)
- [x] 웹하드 화면과 Google Drive 위치가 함께 변경되는지 확인한다. (Codex: 하위 목록 + Drive 진단 E2E)
- [x] 업체 사용자는 폴더 생성, 삭제, 이동 버튼 또는 메뉴가 보이지 않는지 확인한다. (Codex: 폴더 업로드 버튼 비노출 + 생성 API 403 E2E)

성공 기준:

- [x] 새 Google Drive 폴더는 항상 Drive ID를 가진 상태로만 웹하드에 표시된다. (Codex: DB constraint 및 folder service 테스트 통과)
- [x] 업체 사용자는 관리자 전용 폴더 조작을 수행할 수 없다.

## 5. 파일 업로드

- [x] 관리자에서 업체 폴더에 파일 1개를 업로드한다. (Codex: Google Drive 프록시 업로드 E2E)
- [x] 업로드 완료 후 파일이 웹하드 목록에 표시되는지 확인한다. (Codex: E2E)
- [x] Google Drive에 동일 파일이 생성되었는지 확인한다. (Codex: Drive file id + Drive API 진단 E2E)
- [x] 파일명, 확장자, 용량이 일치하는지 확인한다. (Codex: upload confirm metadata E2E)
- [x] 업체 계정으로 같은 파일이 보이고 다운로드 가능한지 확인한다. (Codex: E2E)
- [x] 업로드 중 실패 또는 `driveFileId` 누락 시 DB-only Google Drive 파일이 남지 않는지 확인한다. (Codex: confirm 실패 테스트 통과)

성공 기준:

- [x] 업로드 성공 파일은 Google Drive 파일 ID를 가진다.
- [x] 업로드 실패 파일은 정상 파일처럼 남지 않는다.

## 6. 파일 다운로드, 이름 변경, 이동

- [x] 관리자에서 업로드한 파일을 다운로드한다. (Codex: E2E)
- [x] 업체 계정에서도 같은 파일을 다운로드한다. (Codex: E2E)
- [x] 파일명을 변경한다. (Codex: 업체 계정 E2E)
- [x] 웹하드 화면과 Google Drive 파일명이 함께 변경되는지 확인한다. (Codex: 목록 + Drive 진단 E2E)
- [x] 파일을 같은 업체 내 다른 폴더로 이동한다. (Codex: 업체 계정 E2E)
- [x] 웹하드 화면과 Google Drive 위치가 함께 변경되는지 확인한다. (Codex: 대상 폴더 목록 + Drive 진단 E2E)
- [x] 업체 사용자가 허용된 파일 이동 또는 이름 변경만 수행할 수 있는지 확인한다. (Codex: E2E)

성공 기준:

- [x] 다운로드는 권한 범위 안에서만 동작한다.
- [x] 파일명과 위치가 DB 화면과 Google Drive에서 일치한다.

## 7. 삭제, 휴지통, 복구

- [x] 일반 파일을 삭제한다. (Codex: E2E)
- [x] 파일이 웹하드 목록에서 사라지고 휴지통에 표시되는지 확인한다. (Codex: E2E)
- [x] 휴지통에서 복구한다. (Codex: E2E)
- [x] 파일이 원래 위치로 돌아오는지 확인한다. (Codex: E2E)
- [ ] 일반 폴더를 삭제하고 복구한다.
- [ ] 하위 파일과 폴더가 함께 휴지통/복구되는지 확인한다.

성공 기준:

- [x] 파일 삭제는 즉시 영구 삭제가 아니라 휴지통 이동으로 동작한다.
- [x] 파일 복구 후 위치와 권한이 유지된다.

## 8. 업체 매칭 루트 폴더 삭제 차단

- [x] 관리자 웹하드에서 업체와 매칭된 루트 폴더 삭제 시도가 차단되는지 확인한다. (Codex: E2E + service/component 테스트 통과)
- [x] 공통 모달이 표시되는지 확인한다. (Codex: component 테스트 통과)
- [x] 모달에 매칭된 업체명과 폴더명이 표시되는지 확인한다. (Codex: component 테스트 통과)
- [x] 업체 삭제 페이지로 이동하는 동작이 제공되는지 확인한다. (Codex: E2E payload `redirectTo=/admin/companies/:id` 확인)
- [ ] 여러 항목 선택 삭제에서 업체 매칭 폴더와 일반 파일을 함께 선택한다. (브라우저 수동 QA 필요)
- [x] `제외하고 삭제`로 일반 파일만 삭제되고 업체 매칭 폴더는 남는지 확인한다. (Codex: component 테스트 통과)

성공 기준:

- [x] 업체 매칭 루트 폴더는 웹하드에서 직접 삭제되지 않는다.
- [x] 삭제 이유와 올바른 처리 경로가 관리자에게 표시된다.

## 9. 업체 삭제 및 30일 복구

- [x] 관리자 업체 관리에서 테스트 업체 삭제를 실행한다. (Codex: admin session API E2E)
- [x] 업체 상태가 삭제 대기 상태로 바뀌는지 확인한다. (Codex: E2E + service 테스트 통과)
- [x] 해당 업체 웹하드 루트 폴더와 하위 항목이 휴지통으로 이동하는지 확인한다. (Codex: E2E + service 테스트 통과)
- [x] 업체 계정 로그인이 차단되거나 웹하드 접근이 차단되는지 확인한다. (Codex: 삭제 후 회사 웹하드 접근 차단 화면 E2E)
- [x] 30일 이내 복구 버튼으로 업체를 복구한다. (Codex: admin session API E2E)
- [x] 업체 상태, 웹하드 접근 권한, 업체 루트 폴더와 하위 항목이 복구되는지 확인한다. (Codex: E2E + service 테스트 통과)

성공 기준:

- [x] 업체 삭제가 매칭 웹하드 폴더 삭제의 유일한 정상 경로다.
- [x] 업체 복구 시 업체 삭제로 휴지통에 들어간 항목만 복구된다.

## 10. 문의, 도면, 납품 연동

- [x] 공개 문의 또는 관리자 문의 생성으로 도면 파일을 등록한다. (Codex: contacts service 테스트 통과)
- [x] 해당 업체의 문의 폴더가 생성되는지 확인한다. (Codex: contacts/drawing service 테스트 통과)
- [x] 등록 도면 파일이 문의 폴더에 표시되는지 확인한다. (Codex: contacts/drawing service 테스트 통과)
- [ ] Google Drive에도 같은 문의 폴더와 파일이 존재하는지 확인한다.
- [x] 도면 revision 업로드를 수행한다. (Codex: drawing revision service 테스트 통과)
- [x] 최신 도면 파일이 웹하드 문의 폴더에 표시되는지 확인한다. (Codex: drawing revision service 테스트 통과)
- [x] 납품 완료 증빙 사진을 업로드한다. (Codex: contacts service 테스트 통과)
- [x] `납품완료_YYYYMMDD_HHmmss.ext` 형식의 파일이 문의 폴더에 생성되는지 확인한다. (Codex: contacts service 테스트 통과)

성공 기준:

- [x] 문의, 도면 revision, 납품 증빙 연동은 DB-only Google Drive 파일을 만들지 않는다.
- [x] Drive 복사 실패 시 정상 파일처럼 표시되지 않는다.

## 11. 검색, 정렬, 배지

- [x] 업체 폴더에서 파일명 검색을 수행한다. (Codex: E2E)
- [x] 검색 결과가 해당 업체 범위 안에서만 표시되는지 확인한다. (Codex: A 포함/B 제외 E2E)
- [ ] 파일명, 업로드일, 업로더 정렬을 확인한다.
- [x] 새 파일 또는 미다운로드 배지가 표시되는지 확인한다. (Codex: `/files/new` E2E)
- [x] 파일 다운로드 후 배지가 갱신되는지 확인한다. (Codex: `mark-downloaded` 후 `/files/new` 제외 E2E)

성공 기준:

- [x] 검색/배지는 업체 권한과 실제 파일 상태를 기준으로 동작한다.
- [ ] 정렬은 파일명, 업로드일, 업로더 UI에서 별도 수동 확인한다.

## 12. 공유 링크, ZIP, 외부 다운로드

- [x] 관리자 또는 허용된 업체 사용자가 파일 공유 링크를 생성한다. (Codex: E2E)
- [x] 공유 링크로 다운로드가 되는지 확인한다. (Codex: Drive 파일 공유 다운로드 E2E)
- [x] 권한 없는 파일은 공유 링크 생성이 차단되는지 확인한다. (Codex: 타 업체 공유 생성 403/404 E2E)
- [x] API key-only로 직접 파일 다운로드 endpoint를 호출해도 차단되는지 확인한다. (Codex: `/api/v1/files/:id/download*` 403 E2E)
- [x] API key-only로 raw share-links 목록/생성을 호출해도 차단되는지 확인한다. (Codex: `GET/POST /api/v1/share-links` 403 E2E)
- [x] 업체 사용자가 body `company_id`를 다른 업체로 조작해 공유 링크를 생성해도 세션 업체로만 저장되는지 확인한다. (Codex: A 생성/B 목록 제외 E2E)
- [x] 업체 사용자가 Nest share-links API에 타 업체 `webhardFileId`를 직접 넣어도 공유 링크 생성이 차단되는지 확인한다. (Codex: company B 세션으로 company A 파일 id 직접 생성 403 E2E)
- [x] 단일 Google Drive 파일 ZIP 다운로드를 실행한다. (Codex: E2E)
- [x] ZIP 안의 파일명이 웹하드 목록과 일치하는지 확인한다. (Codex: ZIP signature + 내부 파일명 E2E)
- [ ] 폴더 또는 여러 파일 ZIP 다운로드를 실행한다.
- [ ] ZIP 안의 파일 개수가 웹하드 목록과 일치하는지 확인한다.
- [ ] 작업자 다운로드 경로가 기존처럼 동작하는지 확인한다.

성공 기준:

- [x] Google Drive 파일도 기존 다운로드/공유/ZIP 흐름에서 동일하게 동작한다.
- [x] 권한 없는 파일은 공유 링크 생성/직접 다운로드로 우회 접근할 수 없다.
- [ ] 권한 없는 파일이 ZIP으로 우회 접근되지 않는지 별도 확인한다.

## 13. 신뢰성 회귀 확인

- [x] 웹하드 화면에 표시되는 모든 Google Drive 폴더가 실제 Google Drive에 존재하는지 샘플 확인한다. (Codex: E2E 생성 항목 Drive API 404 진단 통과)
- [x] 웹하드 화면에 표시되는 모든 Google Drive 파일이 실제 Google Drive에 존재하는지 샘플 확인한다. (Codex: E2E 업로드 파일 Drive API 404 진단 통과)
- [ ] Google Drive에서 파일을 임의로 삭제한 뒤 관리자 진단에서 404 항목으로 감지되는지 확인한다.
- [x] 404 항목이 일반 사용자에게 정상 파일처럼 성공 처리되지 않는지 확인한다. (Codex: repair/diagnostic service 테스트 통과)
- [x] storage repair 로그 또는 관리자 사유가 남는지 확인한다. (Codex: repair service 테스트 통과)

성공 기준:

- [x] 웹하드 화면은 DB metadata를 사용하더라도 Google Drive 실체와 어긋난 항목을 정상 성공으로 취급하지 않는다.

## QA 완료 기준

- [ ] 위 체크리스트의 모든 성공 기준을 만족한다. (남은 수동 항목: 로그인 폼, 일반 폴더 복구, 정렬 UI, 작업자 다운로드, 의도적 Drive 404 주입)
- [ ] 실패 항목은 재현 절차와 화면 캡처를 남겼다.
- [ ] 실패 항목이 있으면 업체명, 폴더명, 파일명, 발생 시간, 로그인 역할을 기록했다.
- [x] 관리자 진단 count가 최종적으로 모두 `0`이다. (Codex: cleanup dry-run + E2E final diagnostics 통과)
