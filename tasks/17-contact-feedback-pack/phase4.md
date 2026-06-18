# Phase 4: latest-drawing-download + worker-session-for-download

## 사전 준비

- `webhard-api/src/contacts/drawing-revision.service.ts` (line 148-187 `getRevisionDownloadUrl`, line 341-381 `getLatestForCurrentStage`) — 신규 API 의 내부 로직 재사용.
- `webhard-api/src/contacts/contacts.controller.ts` — 신규 `GET /contacts/:id/latest-drawing-url` 엔드포인트 추가 위치.
- `webhard-api/src/contacts/contacts.module.ts` — `DrawingRevisionService` 주입 이미 되어 있는지 확인.
- `src/app/api/drawing-revisions/[revisionId]/download/route.ts` (line 18-21) — worker session 허용 추가.
- `src/lib/auth/erp-session.ts` — `getErpWorkerSession()` 사용법.
- `src/lib/api/nestjs-server-client.ts` (line 2235-2248 `serverGetDrawingRevisionDownloadUrl`) — 신규 `serverGetContactLatestDrawingUrl` 헬퍼 추가 위치.
- `src/app/worker/_lib/downloadFiles.ts` — 신규 `downloadLatestDrawing` 유틸 추가.
- `src/app/worker/_components/OfficeContactCard.tsx` (line 163-175), `StaffContactCard.tsx` (line 159-171) — `handleDownloadFiles` 교체.
- `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx` (line 86-125 `FileItem`, line 505-512) — 도면 FileItem 의 apiUrl 분기 추가.

## 작업 내용

### 1. NestJS 엔드포인트 신설

**파일**: `webhard-api/src/contacts/contacts.controller.ts`

```ts
@Get(':id/latest-drawing-url')
@UseGuards(ApiKeyGuard)
async getLatestDrawingUrl(
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ url: string; fileName: string }> {
  const revision = await this.drawingRevisionService.getLatestForCurrentStage(id);
  if (revision) {
    return this.drawingRevisionService.getRevisionDownloadUrl(revision.id, 0);
  }
  // Fallback: contact.drawingFileUrl
  const contact = await this.prisma.contact.findUnique({
    where: { id },
    select: { drawingFileUrl: true, drawingFileName: true },
  });
  if (!contact?.drawingFileUrl) {
    throw new NotFoundException('도면이 없습니다.');
  }
  let key = contact.drawingFileUrl;
  if (key.startsWith('http://') || key.startsWith('https://')) {
    try {
      const u = new URL(key);
      key = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    } catch { /* keep original */ }
  }
  const result = await this.storageService.getDownloadPresignedUrl(
    key, undefined, contact.drawingFileName ?? 'drawing',
  );
  return { url: result.url, fileName: result.fileName };
}
```

의존성 주입: `DrawingRevisionService`, `PrismaService`, `StorageService` — controller 생성자에 이미 포함되어 있는지 확인 후 없으면 추가. import 도 추가 (`ApiKeyGuard`, `ParseUUIDPipe`, `NotFoundException`, `Get`, `UseGuards`).

### 2. Next.js 신규 라우트

**신규 파일**: `src/app/api/contacts/[id]/latest-drawing/download/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { serverGetContactLatestDrawingUrl } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';

const log = logger.createLogger('LATEST_DRAWING_DOWNLOAD_API');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const isSession = await verifySession();
    const workerSession = isSession ? null : await getErpWorkerSession();
    if (!isSession && !workerSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await serverGetContactLatestDrawingUrl(id);
    if (!result) {
      return NextResponse.json({ error: '도면이 없습니다.' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    log.error('Exception in GET latest-drawing/download', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
```

### 3. NestJS 클라이언트 헬퍼 추가

**파일**: `src/lib/api/nestjs-server-client.ts`

`serverGetDrawingRevisionDownloadUrl` 함수 바로 위 또는 아래에 추가:

```ts
export async function serverGetContactLatestDrawingUrl(
  contactId: string
): Promise<{ url: string; fileName: string } | null> {
  const response = await nestjsFetch<{ url: string; fileName: string }>(
    `/contacts/${contactId}/latest-drawing-url`,
    { useApiKey: true }
  );
  if (!response.ok) return null;
  return response.data;
}
```

### 4. 기존 drawing-revisions download 라우트 worker session 허용

**파일**: `src/app/api/drawing-revisions/[revisionId]/download/route.ts`

- import 추가: `import { getErpWorkerSession } from '@/lib/auth/erp-session';`
- line 18-21 교체:
  - 변경 전:
    ```ts
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    ```
  - 변경 후:
    ```ts
    const isAuthenticated = await verifySession();
    const workerSession = isAuthenticated ? null : await getErpWorkerSession();
    if (!isAuthenticated && !workerSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    ```

### 5. Worker 다운로드 유틸 신설

**파일**: `src/app/worker/_lib/downloadFiles.ts`

기존 `downloadContactFile` 아래에 신규 유틸 추가 (기존 함수는 **변경 없이 유지**):

```ts
export async function downloadLatestDrawing(
  contactId: string,
  options?: DownloadOptions
): Promise<void> {
  const res = await fetch(`/api/contacts/${contactId}/latest-drawing/download`);
  if (!res.ok) {
    downloadLogger.warn('Latest drawing fetch failed', { contactId, status: res.status });
    return;
  }
  const data = (await res.json()) as { url: string; fileName: string };
  const downloadName = options ? prefixFilename(data.fileName, options) : data.fileName;

  try {
    const fileRes = await fetch(data.url);
    if (!fileRes.ok) return;
    const blob = await fileRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    downloadLogger.warn('Blob download failed, fallback to direct link', err);
    const link = document.createElement('a');
    link.href = data.url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
```

### 6. Worker 카드에서 새 유틸 사용

**파일**: `src/app/worker/_components/OfficeContactCard.tsx`

- import 에 `downloadLatestDrawing` 추가 (기존 `downloadContactFile` 는 유지).
- line 163-175 `handleDownloadFiles` 교체:

```ts
const handleDownloadFiles = async () => {
  if (downloading) return;
  setDownloading(true);
  try {
    await downloadLatestDrawing(contact.id, {
      inquiryNumber: contact.inquiry_number,
      workNumber: contact.work_number,
      processStage: contact.process_stage,
    });
  } finally {
    setDownloading(false);
  }
};
```

버튼 표시 조건 `hasWebhardFolder` (line 260) 은 **유지** (기존 UX).

**파일**: `src/app/worker/_components/StaffContactCard.tsx` — 동일 패턴.

### 7. Admin `ContactDetailView > 첨부파일 > 도면` FileItem 도 신규 API 로 전환

**파일**: `src/app/(admin)/admin/contacts/_components/ContactDetailView.tsx`

`FileItem` 내부 (line 105-108) 의 apiUrl 계산을 `fileType === 'drawing'` 분기 추가로 덮어쓰기:

```tsx
const apiUrl = usePresigned
  ? fileType === 'drawing'
    ? `/api/contacts/${contactId}/latest-drawing/download`
    : `/api/contacts/${contactId}/file-download?type=${fileType}${index !== undefined ? `&index=${index}` : ''}`
  : undefined;
```

나머지 fileType (`attachment`, `reference_photo`, `revision_request`) 은 기존 엔드포인트 그대로.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && cd webhard-api && pnpm build
```

NestJS 빌드 필수 (신규 컨트롤러 메서드). 통과 시 phase 4 status `"completed"`. 3회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- NestJS 신규 엔드포인트에 **`@UseGuards(ApiKeyGuard)` 필수** — 외부 직접 접근 차단.
- `getLatestForCurrentStage` null 반환 시 **`contact.drawingFileUrl` fallback 필수**. 도면 없는 신규 문의도 있음.
- `serverGetContactLatestDrawingUrl` 는 `useApiKey: true` 필수.
- Worker 카드 `hasWebhardFolder` 조건 유지 — 웹하드 폴더 없는 문의는 버튼 자체 미노출.
- 기존 `/api/contacts/:id/file-download?type=drawing` 라우트는 **건드리지 말 것** — attachment / reference_photo / revision_request 에서 계속 사용.
- `downloadContactFile` 함수 자체는 건드리지 말고 `downloadLatestDrawing` 신규 추가. 다른 사용처 없음을 확인하면 추후 제거 고려 가능하지만 이번 phase 범위 외.
- Admin 상세뷰의 FileItem 변경은 `fileType==='drawing'` 한 분기만. 다른 fileType 영향 없음.
