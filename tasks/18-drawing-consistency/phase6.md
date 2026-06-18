# Phase 6: r2-key-robustness

## 사전 준비

- `webhard-api/src/storage/storage.service.ts:124~137` — `getDownloadPresignedUrl` 의 Content-Disposition 헤더 세팅. `encodeURIComponent` 이중 인코딩 가능성.
- `webhard-api/src/contacts/drawing-revision.service.ts:170~182` — key 추출 로직 `url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname`. **`decodeURIComponent` 없음** — 한글 파일명이 percent-escape 된 경우 실제 R2 key 와 불일치해 NoSuchKey 발생.
- `webhard-api/src/contacts/contacts.service.ts:1566` — 참고: 여기는 이미 `decodeURIComponent` 적용되어 있음. 패턴 차용.
- `webhard-api/src/contacts/contacts.service.ts:2680~2684` — `registerFilesToWebhard` 의 company 매칭 실패 시 조용히 `return`. 이 phase 에서 Notification + Sentry 승격.
- `webhard-api/src/integration/orders/auto-contact.service.ts` — `resolveCompanyFolder` 실패 경로, `classifyByFolderPath` 가 null 반환(미분류)하는 경로.
- `webhard-api/src/folders/webhard-config.service.ts:285~297` — `classifyByFolderPath`.
- `webhard-api/src/notifications/` 또는 해당 모듈 — 기존 Notification 생성 패턴. `type` 문자열 상수 관리.
- `webhard-api/src/sentry/` 또는 main.ts Sentry 초기화 — `Sentry.captureMessage(level: 'info'|'warning')` 사용 패턴.

이유: 다운로드 실패의 주 원인 3가지 중 (A) 한글 key 디코딩 + (C) company 미스매치 조용한 스킵을 이 phase 에서 해결. (B) 웹하드 이중 등록은 별도 RFC.

## 작업 내용

### 1. key 추출 유틸 신설

`webhard-api/src/common/r2-key.util.ts`:

```ts
/**
 * R2 URL 또는 key 문자열에서 실제 object key 를 추출한다.
 * 절대 URL 이면 pathname 을 decode 해서 반환. 이미 key 문자열이면 그대로.
 */
export function extractR2Key(urlOrKey: string): string {
  if (!urlOrKey) return '';
  if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
    const url = new URL(urlOrKey);
    const raw = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw; // 이미 디코드되어 있거나 잘못된 percent-encoding
    }
  }
  return urlOrKey;
}
```

### 2. 기존 호출처 일괄 교체

다음 파일의 inline `url.pathname.slice(1)` 패턴을 모두 `extractR2Key(...)` 로 교체:

- `webhard-api/src/contacts/drawing-revision.service.ts:170~182` (getRevisionDownloadUrl)
- 기타 `Grep -n 'url.pathname' webhard-api/src --include=*.ts` 로 찾아 통일
- `contacts.service.ts:1566` 같이 이미 decode 처리된 곳도 유틸 사용으로 일관화

### 3. `registerFilesToWebhard` 미스매치 경고

`contacts.service.ts:2680~2684` 의 `if (!company) return;` 조용한 스킵을 다음으로 교체:

```ts
if (!company) {
  await this.notificationsService.createAdminNotification({
    type: 'webhard_company_mismatch',
    title: '웹하드 업체 폴더 매칭 실패',
    body: `Contact ${contact.id} 의 companyName '${contact.companyName}' 에 매칭되는 Company 레코드가 없음.`,
    metadata: { contactId: contact.id, companyName: contact.companyName },
  });
  Sentry?.captureMessage(`webhard_company_mismatch: ${contact.companyName}`, 'warning');
  return;
}
```

`NotificationsService.createAdminNotification` 이 없으면 기존 Notification 모델에 맞춰 create (admin 룰: `SystemSetting.admin_notification_targets` 또는 모든 admin 계정).

### 4. `AutoContactService` 미분류 / resolve 실패 경고

`auto-contact.service.ts` 의 `classifyByFolderPath` 결과 null 처리 경로에 Notification 추가:

```ts
if (inquiryType === null) {
  await this.notificationsService.createAdminNotification({
    type: 'webhard_classify_failed',
    title: '웹하드 파일 미분류',
    body: `폴더 경로 '${folderPath}' 에서 칼선의뢰/목형의뢰 세그먼트를 찾지 못해 inquiryType 미설정.`,
    metadata: { folderPath, fileName, contactId: contact?.id ?? null },
  });
  Sentry?.captureMessage(`webhard_classify_failed: ${folderPath}`, 'info');
  // 기존 로직 계속: Contact 는 받되 inquiryType=null 로 생성
}
```

`resolveCompanyFolder` 실패 시에도 동일 패턴의 Notification(`webhard_company_mismatch`).

### 5. 테스트

`webhard-api/src/common/r2-key.util.spec.ts`:

- 일반 URL: `https://bucket.r2/abc/파일.dxf` → `abc/파일.dxf` (디코드)
- percent-encoded URL: `https://bucket.r2/abc/%ED%8C%8C%EC%9D%BC.dxf` → `abc/파일.dxf`
- 이미 key 문자열 그대로: `abc/파일.dxf` → `abc/파일.dxf`
- 빈 문자열 → `''`
- 잘못된 percent: `%ZZ` 이어도 throw 없이 원본 경로 반환

`webhard-api/src/contacts/drawing-revision.service.spec.ts`:

- `getRevisionDownloadUrl` 이 percent-encoded URL 을 받아도 정상 presigned 발급 (storage mock 으로 전달된 key 확인)

`webhard-api/src/integration/orders/auto-contact.service.spec.ts`:

- `classifyByFolderPath` null 반환 시 Notification 생성 확인 (NotificationsService mock)
- `resolveCompanyFolder` 실패 시 Notification 생성 확인

`webhard-api/src/contacts/contacts.service.spec.ts`:

- `registerFilesToWebhard` 에서 company 없을 때 Notification 생성 + 조용한 return 제거됐는지

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test -- --testPathPattern="r2-key|drawing-revision|auto-contact|contacts"
```

## AC 검증 방법

통과 시 phase 6 status `"completed"`. 3회 실패 시 `"error"`.

## 주의사항

- `decodeURIComponent` 는 `try/catch` 로 감싸라. 잘못된 percent-encoding 이면 원본 그대로 반환해서 경로 유효성은 R2 에서 판정.
- Notification 생성이 실패해도 원본 로직(Contact 생성, WebhardFile 등록 fallback) 은 계속 진행되어야 함. Notification 호출은 `try/catch` 로 감싸 fire-and-forget 가 아닌 **await + 에러 무시**.
- Sentry 초기화 여부 확인 (prod only). dev 환경에서 `Sentry` 가 undefined 일 수 있으므로 optional chaining (`Sentry?.captureMessage`).
- `webhard_classify_failed` Notification 은 **너무 자주** 생성될 수 있음 (거래처가 루트에 올린 파일마다 1개). 개선안: 같은 folderPath 에 대해 1시간 내 중복 발행 방지 (dedupe). 하지만 이 phase 범위 아님 — **향후 개선** 주석만.
- 기존 `url.pathname.slice(1)` 패턴을 놓치지 마라. Grep 로 전체 검색해서 모두 교체 (누락 시 다운로드 실패 재발 가능).
- Content-Disposition 의 이중 인코딩(storage.service.ts:133 `encodeURIComponent`) 은 그대로 둔다. 파일명은 ASCII/UTF-8 둘 다 전달되는 정상 형태.
- `NotificationsService` 의 실제 메서드명이 다르면(예: `sendAdminAlert`, `notifyAdmins`) 코드베이스 패턴에 맞춰 호출.
