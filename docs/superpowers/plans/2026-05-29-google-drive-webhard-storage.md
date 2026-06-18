# Google Drive Webhard Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current R2-backed webhard storage path with Google Shared Drive for every new `WebhardFile` while preserving the current YJ Laser webhard UI, authorization, folder rules, contact, worker, delivery, external sync, badge, search, and dashboard behavior.

**Implementation status (2026-05-29):** First implementation pass completed on `codex/google-drive-webhard-implementation`. Covered Prisma schema/migration, Google Drive storage provider, company provisioning/retry, webhard upload/confirm/batch-confirm, file/folder mutation paths, ZIP/download/share/trash/backup provider branching, selected contact/drawing/delivery webhard producers, Next.js upload/download proxy changes, and development reset script. Remaining before deploy: run against a real Shared Drive service account, execute migration/reset in the target dev DB, and add focused integration/E2E coverage with Google credentials.

**Architecture:** Keep PostgreSQL as the source of truth for files, folders, access, listing, search, badges, storage usage, and activity. Google Drive is a server-side storage provider behind a NestJS storage boundary; application services never import the raw Drive client. A development reset removes existing webhard/contact/work/drawing/delivery-proof data while preserving company records and accounts.

**Tech Stack:** Next.js 15 App Router, NestJS 10, Prisma 6, PostgreSQL, Google Drive API v3, Google Shared Drive, service account auth, Jest, Playwright.

---

## Current Decisions

- Use Google Shared Drive.
- Use a service account added as a Shared Drive member.
- Store credentials in `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Store Shared Drive id in `GOOGLE_DRIVE_SHARED_DRIVE_ID`.
- Company users do not receive Google Drive permissions.
- Company users do not receive durable Google Drive file or folder links.
- Browser upload sessions may briefly receive a Google resumable upload URL, but it is a bearer-capability URL, not a user-facing file/folder link. Never persist it, never log it, and treat it as valid for up to one week per Google Drive API behavior.
- New `WebhardFile` rows use Google Drive.
- New `WebhardFile` and `WebhardFolder` defaults are `GOOGLE_DRIVE` after the development reset. R2 remains only as a legacy compatibility provider.
- Preserve existing folder template, `folderKind`, company root, inquiry folder, completed folder, alias, and external sync rules.
- Do not migrate old R2 files.
- Development reset is allowed before implementation because the project is not operating in production.
- Company records, company accounts, admin accounts, and worker accounts are preserved.
- Drive and PostgreSQL cannot be updated atomically. Every Drive-first mutation must either use a deterministic/pre-generated Drive id or record a first-class storage repair event before reporting success.

## Required API Documentation

Keep these official docs open during implementation:

- `https://developers.google.com/workspace/guides/create-credentials`
- `https://developers.google.com/workspace/drive/api/guides/about-shareddrives`
- `https://developers.google.com/workspace/drive/api/guides/enable-shareddrives`
- `https://developers.google.com/workspace/drive/api/guides/folder`
- `https://developers.google.com/workspace/drive/api/guides/manage-uploads`
- `https://developers.google.com/workspace/drive/api/guides/manage-downloads`
- `https://developers.google.com/workspace/drive/api/guides/limits`
- `https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest/google-auth-library/oauth2client#getRequestHeaders`

## File Map

### Backend data model

- Modify: `webhard-api/package.json`
- Modify: `webhard-api/prisma/schema.prisma`
- Create: `webhard-api/prisma/migrations/20260529000000_add_google_drive_storage/migration.sql`

### Backend storage boundary

- Create: `webhard-api/src/storage/storage-provider.interface.ts`
- Create: `webhard-api/src/storage/storage-reference.util.ts`
- Create: `webhard-api/src/storage/r2-storage.provider.ts`
- Create: `webhard-api/src/storage/google-drive-storage.provider.ts`
- Create: `webhard-api/src/storage/storage-repair.service.ts`
- Modify: `webhard-api/src/storage/storage.controller.ts`
- Modify: `webhard-api/src/storage/storage.service.ts`
- Modify: `webhard-api/src/storage/storage.module.ts`
- Modify: `webhard-api/src/storage/__tests__/storage.service.spec.ts`
- Create: `webhard-api/src/storage/__tests__/google-drive-storage.provider.spec.ts`
- Create: `webhard-api/src/storage/__tests__/storage-repair.service.spec.ts`
- Create: `webhard-api/src/storage/__tests__/storage-reference.util.spec.ts`

### Backend folder provisioning

- Create: `webhard-api/src/folders/folder-template.service.ts`
- Create: `webhard-api/src/folders/drive-provisioning.service.ts`
- Create: `webhard-api/src/folders/dto/drive-provisioning.dto.ts`
- Modify: `webhard-api/src/folders/folders.service.ts`
- Modify: `webhard-api/src/folders/folders.module.ts`
- Modify: `webhard-api/src/folders/folders.service.spec.ts`
- Create: `webhard-api/src/folders/drive-provisioning.service.spec.ts`

### Backend companies and admin retry

- Modify: `webhard-api/src/companies/companies.service.ts`
- Modify: `webhard-api/src/companies/companies.controller.ts`
- Modify: `webhard-api/src/companies/dto/company.dto.ts`
- Modify: `webhard-api/src/companies/companies.module.ts`
- Modify: `webhard-api/src/companies/companies.service.spec.ts`

### Backend file/folder operations and cross-system producers

- Modify: `webhard-api/src/files/dto/file.dto.ts`
- Modify: `webhard-api/src/files/files.service.ts`
- Modify: `webhard-api/src/files/zip.service.ts`
- Modify: `webhard-api/src/files/__tests__/files.service.spec.ts`
- Modify: `webhard-api/src/files/files.worker-access.spec.ts`
- Modify: `webhard-api/src/trash/trash.service.ts`
- Modify: `webhard-api/src/contacts/contacts.service.ts`
- Modify: `webhard-api/src/contacts/contacts.controller.ts`
- Modify: `webhard-api/src/contacts/drawing-revision.service.ts`
- Modify: `webhard-api/src/contacts/contact-folder-sync.service.ts`
- Modify: `webhard-api/src/contacts/contacts.service.spec.ts`
- Modify: `webhard-api/src/contacts/drawing-revision.service.spec.ts`
- Modify: `webhard-api/src/integration/orders/auto-contact.service.ts`
- Modify: `webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts`
- Modify: `webhard-api/src/integration/delivery/delivery.service.ts`
- Modify: `webhard-api/src/backup/backup.service.ts`
- Modify: `webhard-api/src/share-links/share-links.service.ts`

### Frontend and Next.js proxies

- Modify: `src/lib/utils/uploadQueue.ts`
- Modify: `src/app/webhard/hooks/useFileUpload.ts`
- Modify: `src/app/actions/webhard-folder-upload.ts`
- Modify: `src/app/api/webhard/upload/batch/route.ts`
- Modify: `src/app/api/webhard/upload/batch-complete/route.ts`
- Modify: `src/app/api/webhard/files/presigned-url/route.ts`
- Modify: `src/app/api/webhard/files/batch/upload/route.ts`
- Modify: `src/app/api/webhard/files/confirm/route.ts`
- Modify: `src/app/api/webhard/files/batch/download-zip/route.ts`
- Modify: `src/app/api/webhard/share/[token]/route.ts`
- Modify: `src/app/actions/contacts.ts`
- Modify: `src/app/actions/companies.ts`
- Modify: `src/app/actions/register.ts`
- Modify: `src/app/api/company/profile/route.ts`
- Modify: `src/lib/api/nestjs/companies.client.ts`
- Modify: `src/lib/api/nestjs/operations.client.ts`
- Modify: `src/app/(admin)/admin/companies/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/companies/[id]/approve-button.tsx`
- Create: `src/app/(admin)/admin/companies/[id]/drive-provisioning-actions.tsx`

### Reset, docs, verification

- Create: `webhard-api/scripts/reset-webhard-for-google-drive.ts`
- Modify: `docs/features-list.md`
- Modify: `docs/progress.txt`
- Modify: `docs/changelog/CHANGELOG.md`
- Modify: `docs/specs/features/webhard-system.md`
- Modify: `docs/specs/api/nestjs-endpoints.md`
- Modify: `docs/superpowers/specs/2026-05-29-google-drive-webhard-storage-design.md`
- Modify: `docs/superpowers/specs/2026-05-29-google-drive-webhard-storage-design.ko.md`

---

## Phase 1 - Dependencies And Database Contract

### Task 1.1: Add Google API dependencies

**Files:**

- Modify: `webhard-api/package.json`
- Modify: `webhard-api/pnpm-lock.yaml`

- [ ] **Step 1: Install dependencies**

Run:

```bash
cd webhard-api
pnpm add googleapis google-auth-library
```

Expected:

```text
dependencies:
+ googleapis
+ google-auth-library
```

- [ ] **Step 2: Commit dependency change**

Run:

```bash
git add webhard-api/package.json webhard-api/pnpm-lock.yaml
git commit -m "feat: Google Drive API 의존성 추가"
```

### Task 1.2: Add storage and provisioning schema

**Files:**

- Modify: `webhard-api/prisma/schema.prisma`
- Create: `webhard-api/prisma/migrations/20260529000000_add_google_drive_storage/migration.sql`

- [ ] **Step 1: Update Prisma schema**

Add these enums near the existing generator/datasource block:

```prisma
enum StorageProvider {
  R2           @map("r2")
  GOOGLE_DRIVE @map("google_drive")
}

enum DriveProvisioningStatus {
  PENDING @map("pending")
  READY   @map("ready")
  FAILED  @map("failed")
}
```

Add these fields to `model Company` after `approvedBy`:

```prisma
  driveRootFolderId               String?                  @map("drive_root_folder_id")
  driveProvisioningStatus         DriveProvisioningStatus   @default(PENDING) @map("drive_provisioning_status")
  driveProvisioningError          String?                  @map("drive_provisioning_error")
  driveProvisioningLastAttemptAt  DateTime?                @map("drive_provisioning_last_attempt_at")
  driveProvisionedAt              DateTime?                @map("drive_provisioned_at")
```

Add these fields to `model WebhardFile` after `path`:

```prisma
  storageProvider StorageProvider @default(GOOGLE_DRIVE) @map("storage_provider")
  driveFileId     String?         @map("drive_file_id")
  driveMimeType   String?         @map("drive_mime_type")
```

Add these fields to `model WebhardFolder` after `path`:

```prisma
  storageProvider StorageProvider @default(GOOGLE_DRIVE) @map("storage_provider")
  driveFolderId   String?         @map("drive_folder_id")
```

Add indexes:

```prisma
  @@index([storageProvider])
  @@index([driveFileId])
```

inside `WebhardFile`, and:

```prisma
  @@index([storageProvider])
  @@index([driveFolderId])
```

inside `WebhardFolder`.

- [ ] **Step 2: Create SQL migration**

Create `webhard-api/prisma/migrations/20260529000000_add_google_drive_storage/migration.sql`:

```sql
CREATE TYPE "StorageProvider" AS ENUM ('r2', 'google_drive');
CREATE TYPE "DriveProvisioningStatus" AS ENUM ('pending', 'ready', 'failed');

ALTER TABLE "companies"
  ADD COLUMN "drive_root_folder_id" TEXT,
  ADD COLUMN "drive_provisioning_status" "DriveProvisioningStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "drive_provisioning_error" TEXT,
  ADD COLUMN "drive_provisioning_last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "drive_provisioned_at" TIMESTAMP(3);

ALTER TABLE "webhard_files"
  ADD COLUMN "storage_provider" "StorageProvider" NOT NULL DEFAULT 'google_drive',
  ADD COLUMN "drive_file_id" TEXT,
  ADD COLUMN "drive_mime_type" TEXT;

ALTER TABLE "webhard_folders"
  ADD COLUMN "storage_provider" "StorageProvider" NOT NULL DEFAULT 'google_drive',
  ADD COLUMN "drive_folder_id" TEXT;

CREATE INDEX "companies_drive_provisioning_status_idx"
  ON "companies"("drive_provisioning_status");
CREATE INDEX "webhard_files_storage_provider_idx"
  ON "webhard_files"("storage_provider");
CREATE INDEX "webhard_files_drive_file_id_idx"
  ON "webhard_files"("drive_file_id");
CREATE UNIQUE INDEX "webhard_files_drive_file_id_unique"
  ON "webhard_files"("drive_file_id")
  WHERE "drive_file_id" IS NOT NULL;
CREATE INDEX "webhard_folders_storage_provider_idx"
  ON "webhard_folders"("storage_provider");
CREATE INDEX "webhard_folders_drive_folder_id_idx"
  ON "webhard_folders"("drive_folder_id");
CREATE UNIQUE INDEX "webhard_folders_drive_folder_id_unique"
  ON "webhard_folders"("drive_folder_id")
  WHERE "drive_folder_id" IS NOT NULL;
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
cd webhard-api
npx prisma generate
```

Expected:

```text
Generated Prisma Client
```

- [ ] **Step 4: Verify backend type baseline**

Run:

```bash
cd webhard-api
npx tsc --noEmit
```

Expected: `0` TypeScript errors.

- [ ] **Step 5: Commit schema**

Run:

```bash
git add webhard-api/prisma/schema.prisma webhard-api/prisma/migrations/20260529000000_add_google_drive_storage/migration.sql
git commit -m "feat: 구글드라이브 저장소 스키마 추가"
```

---

## Phase 2 - Storage Provider Boundary

### Task 2.1: Define provider-neutral storage contracts

**Files:**

- Create: `webhard-api/src/storage/storage-provider.interface.ts`
- Create: `webhard-api/src/storage/storage-reference.util.ts`
- Test: `webhard-api/src/storage/__tests__/storage-reference.util.spec.ts`

- [ ] **Step 1: Add storage provider interface**

Create `webhard-api/src/storage/storage-provider.interface.ts`:

```ts
import { Readable } from 'stream';
import { StorageProvider } from '@prisma/client';

export interface CreateFolderInput {
  name: string;
  parentStorageFolderId: string | null;
  storageFolderId?: string;
}

export interface RenameFolderInput {
  storageFolderId: string;
  name: string;
}

export interface MoveFolderInput {
  storageFolderId: string;
  parentStorageFolderId: string;
}

export interface DeleteFolderInput {
  storageFolderId: string;
}

export interface CreateUploadSessionInput {
  fileName: string;
  mimeType: string;
  size: number;
  parentStorageFolderId: string;
  storageFileId?: string;
}

export interface UploadSessionResult {
  provider: StorageProvider;
  storageFileId: string;
  uploadUrl: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface ConfirmUploadedFileInput {
  storageFileId: string;
  expectedParentStorageFolderId: string;
}

export interface StorageFileMetadata {
  provider: StorageProvider;
  storageFileId: string;
  name: string;
  mimeType: string;
  size: number;
  parentStorageFolderIds: string[];
}

export interface DownloadFileInput {
  storageFileId: string;
}

export interface DownloadFileResult {
  stream: Readable;
  mimeType: string;
  size: number | null;
}

export interface RenameFileInput {
  storageFileId: string;
  name: string;
}

export interface MoveFileInput {
  storageFileId: string;
  fromParentStorageFolderId: string | null;
  toParentStorageFolderId: string;
}

export interface TrashFileInput {
  storageFileId: string;
}

export interface RestoreFileInput {
  storageFileId: string;
}

export interface DeleteFileInput {
  storageFileId: string;
}

export interface UploadBufferInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentStorageFolderId: string;
}

export interface UploadBufferResult extends StorageFileMetadata {}

export interface StorageProviderClient {
  readonly provider: StorageProvider;
  generateIds(count: number): Promise<string[]>;
  createFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }>;
  renameFolder(input: RenameFolderInput): Promise<void>;
  moveFolder(input: MoveFolderInput): Promise<void>;
  deleteFolder(input: DeleteFolderInput): Promise<void>;
  createUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult>;
  confirmUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata>;
  uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult>;
  downloadFile(input: DownloadFileInput): Promise<DownloadFileResult>;
  renameFile(input: RenameFileInput): Promise<void>;
  moveFile(input: MoveFileInput): Promise<void>;
  trashFile(input: TrashFileInput): Promise<void>;
  restoreFile(input: RestoreFileInput): Promise<void>;
  deleteFile(input: DeleteFileInput): Promise<void>;
}
```

- [ ] **Step 2: Add storage reference parser**

Create `webhard-api/src/storage/storage-reference.util.ts`:

```ts
import { StorageProvider } from '@prisma/client';

const DRIVE_PREFIX = 'storage://google_drive/';
const R2_PREFIX = 'storage://r2/';

export interface ParsedStorageReference {
  provider: StorageProvider;
  idOrKey: string;
}

export function toDriveReference(driveFileId: string): string {
  return `${DRIVE_PREFIX}${encodeURIComponent(driveFileId)}`;
}

export function toR2Reference(key: string): string {
  return `${R2_PREFIX}${encodeURIComponent(key)}`;
}

export function parseStorageReference(value: string): ParsedStorageReference {
  if (value.startsWith(DRIVE_PREFIX)) {
    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      idOrKey: decodeURIComponent(value.slice(DRIVE_PREFIX.length)),
    };
  }
  if (value.startsWith(R2_PREFIX)) {
    return {
      provider: StorageProvider.R2,
      idOrKey: decodeURIComponent(value.slice(R2_PREFIX.length)),
    };
  }
  return { provider: StorageProvider.R2, idOrKey: value };
}
```

- [ ] **Step 3: Test storage reference parser**

Create `webhard-api/src/storage/__tests__/storage-reference.util.spec.ts`:

```ts
import { StorageProvider } from '@prisma/client';
import { parseStorageReference, toDriveReference, toR2Reference } from '../storage-reference.util';

describe('storage-reference.util', () => {
  it('round-trips Drive ids', () => {
    const value = toDriveReference('drive-file-123');
    expect(parseStorageReference(value)).toEqual({
      provider: StorageProvider.GOOGLE_DRIVE,
      idOrKey: 'drive-file-123',
    });
  });

  it('round-trips R2 keys', () => {
    const value = toR2Reference('webhard/company-1/file.dxf');
    expect(parseStorageReference(value)).toEqual({
      provider: StorageProvider.R2,
      idOrKey: 'webhard/company-1/file.dxf',
    });
  });

  it('treats legacy values as R2 keys', () => {
    expect(parseStorageReference('webhard/company-1/legacy.dxf')).toEqual({
      provider: StorageProvider.R2,
      idOrKey: 'webhard/company-1/legacy.dxf',
    });
  });
});
```

- [ ] **Step 4: Run parser test**

Run:

```bash
cd webhard-api
pnpm test -- storage-reference.util.spec.ts --runInBand
```

Expected: `3 passed`.

### Task 2.2: Implement Google Drive provider

**Files:**

- Create: `webhard-api/src/storage/google-drive-storage.provider.ts`
- Test: `webhard-api/src/storage/__tests__/google-drive-storage.provider.spec.ts`

- [ ] **Step 1: Add provider test**

Create `webhard-api/src/storage/__tests__/google-drive-storage.provider.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from '@prisma/client';
import { GoogleDriveStorageProvider } from '../google-drive-storage.provider';

const driveFiles = {
  generateIds: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({
          getRequestHeaders: jest
            .fn()
            .mockResolvedValue(new Headers({ Authorization: 'Bearer token' })),
        }),
      })),
    },
    drive: jest.fn(() => ({ files: driveFiles })),
  },
}));

describe('GoogleDriveStorageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'location' ? 'https://upload.example/session' : null,
      },
      text: jest.fn().mockResolvedValue(''),
    }) as never;
  });

  function makeProvider() {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_SERVICE_ACCOUNT_JSON')
          return JSON.stringify({ client_email: 'svc@example.com', private_key: 'key' });
        if (key === 'GOOGLE_DRIVE_SHARED_DRIVE_ID') return 'shared-drive-root';
        return undefined;
      }),
    } as unknown as ConfigService;
    return new GoogleDriveStorageProvider(config);
  }

  it('creates folders inside the provided Drive parent', async () => {
    driveFiles.generateIds.mockResolvedValue({ data: { ids: ['folder-1'] } });
    driveFiles.create.mockResolvedValue({ data: { id: 'folder-1' } });
    const provider = makeProvider();

    await expect(
      provider.createFolder({ name: '문의', parentStorageFolderId: 'parent-1' })
    ).resolves.toEqual({
      storageFolderId: 'folder-1',
    });

    expect(driveFiles.create).toHaveBeenCalledWith({
      requestBody: {
        id: 'folder-1',
        name: '문의',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent-1'],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
  });

  it('creates resumable upload sessions without returning secrets in logs', async () => {
    driveFiles.generateIds.mockResolvedValue({ data: { ids: ['drive-file-1'] } });
    const provider = makeProvider();

    await expect(
      provider.createUploadSession({
        fileName: 'sample.dxf',
        mimeType: 'application/dxf',
        size: 123,
        parentStorageFolderId: 'folder-1',
      })
    ).resolves.toMatchObject({
      provider: StorageProvider.GOOGLE_DRIVE,
      storageFileId: 'drive-file-1',
      uploadUrl: 'https://upload.example/session',
      headers: { 'Content-Type': 'application/dxf' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('uploadType=resumable'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer token',
          'X-Upload-Content-Type': 'application/dxf',
        }),
        body: JSON.stringify({
          id: 'drive-file-1',
          name: 'sample.dxf',
          mimeType: 'application/dxf',
          parents: ['folder-1'],
        }),
      })
    );
  });

  it('uses provided pre-generated ids for idempotent folder creation', async () => {
    driveFiles.create.mockResolvedValue({ data: { id: 'folder-reserved' } });
    const provider = makeProvider();

    await provider.createFolder({
      name: '문의',
      parentStorageFolderId: 'parent-1',
      storageFolderId: 'folder-reserved',
    });

    expect(driveFiles.generateIds).not.toHaveBeenCalled();
    expect(driveFiles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ id: 'folder-reserved' }),
      })
    );
  });

  it('treats duplicate create for a pre-generated id as success when Drive metadata exists', async () => {
    driveFiles.create.mockRejectedValue({ code: 409 });
    driveFiles.get.mockResolvedValue({
      data: {
        id: 'folder-reserved',
        name: '문의',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent-1'],
      },
    });
    const provider = makeProvider();

    await expect(
      provider.createFolder({
        name: '문의',
        parentStorageFolderId: 'parent-1',
        storageFolderId: 'folder-reserved',
      })
    ).resolves.toEqual({ storageFolderId: 'folder-reserved' });
  });
});
```

- [ ] **Step 2: Add provider implementation**

Create `webhard-api/src/storage/google-drive-storage.provider.ts`:

```ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from '@prisma/client';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import {
  ConfirmUploadedFileInput,
  CreateFolderInput,
  CreateUploadSessionInput,
  DeleteFileInput,
  DeleteFolderInput,
  DownloadFileInput,
  DownloadFileResult,
  MoveFileInput,
  MoveFolderInput,
  RenameFileInput,
  RenameFolderInput,
  RestoreFileInput,
  StorageFileMetadata,
  StorageProviderClient,
  TrashFileInput,
  UploadBufferInput,
  UploadBufferResult,
  UploadSessionResult,
} from './storage-provider.interface';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

@Injectable()
export class GoogleDriveStorageProvider implements StorageProviderClient {
  readonly provider = StorageProvider.GOOGLE_DRIVE;
  private readonly logger = new Logger(GoogleDriveStorageProvider.name);
  private readonly drive: drive_v3.Drive;
  private readonly auth: InstanceType<typeof google.auth.GoogleAuth>;
  private readonly sharedDriveId: string;

  constructor(private readonly configService: ConfigService) {
    const rawCredentials = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON');
    const sharedDriveId = this.configService.get<string>('GOOGLE_DRIVE_SHARED_DRIVE_ID');

    if (!rawCredentials || !sharedDriveId) {
      throw new Error('Google Drive configuration is incomplete');
    }

    this.sharedDriveId = sharedDriveId;
    this.auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(rawCredentials) as Record<string, unknown>,
      scopes: [DRIVE_SCOPE],
    });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  async generateIds(count: number): Promise<string[]> {
    const result = await this.withRetry(() =>
      this.drive.files.generateIds({
        count,
        space: 'drive',
      })
    );
    const ids = result.data.ids ?? [];
    if (ids.length !== count) throw new InternalServerErrorException('Drive id generation failed');
    return ids;
  }

  async createFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }> {
    const storageFolderId = input.storageFolderId ?? (await this.generateIds(1))[0];
    const result = await this.withRetry(
      () =>
        this.drive.files.create({
          requestBody: {
            id: storageFolderId,
            name: input.name,
            mimeType: DRIVE_FOLDER_MIME,
            parents: [input.parentStorageFolderId ?? this.sharedDriveId],
          },
          fields: 'id',
          supportsAllDrives: true,
        }),
      { idempotentFileId: storageFolderId }
    );

    const id = result.data.id;
    if (!id) throw new InternalServerErrorException('Drive folder create returned no id');
    return { storageFolderId: id };
  }

  async renameFolder(input: RenameFolderInput): Promise<void> {
    await this.withRetry(() =>
      this.drive.files.update({
        fileId: input.storageFolderId,
        requestBody: { name: input.name },
        fields: 'id',
        supportsAllDrives: true,
      })
    );
  }

  async moveFolder(input: MoveFolderInput): Promise<void> {
    await this.moveDriveItem(input.storageFolderId, input.parentStorageFolderId);
  }

  async deleteFolder(input: DeleteFolderInput): Promise<void> {
    await this.withRetry(() =>
      this.drive.files.update({
        fileId: input.storageFolderId,
        requestBody: { trashed: true },
        fields: 'id,trashed',
        supportsAllDrives: true,
      })
    );
  }

  async createUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult> {
    const storageFileId = input.storageFileId ?? (await this.generateIds(1))[0];
    const client = await this.auth.getClient();
    const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
    url.searchParams.set('uploadType', 'resumable');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('fields', 'id,name,mimeType,size,parents');
    const authHeaders = await client.getRequestHeaders(url.toString());

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        ...this.toPlainHeaders(authHeaders),
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': input.mimeType,
        'X-Upload-Content-Length': String(input.size),
      },
      body: JSON.stringify({
        id: storageFileId,
        name: input.fileName,
        mimeType: input.mimeType,
        parents: [input.parentStorageFolderId],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn(
        `Drive upload session failed: status=${response.status} body=${body.slice(0, 300)}`
      );
      throw new InternalServerErrorException('Failed to create Drive upload session');
    }

    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) {
      throw new InternalServerErrorException('Drive upload session returned no location');
    }

    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      storageFileId,
      uploadUrl,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      headers: { 'Content-Type': input.mimeType },
    };
  }

  async confirmUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata> {
    const metadata = await this.getFileMetadataById(input.storageFileId);
    if (!metadata.parentStorageFolderIds.includes(input.expectedParentStorageFolderId)) {
      throw new InternalServerErrorException('Drive file parent mismatch');
    }
    return metadata;
  }

  async uploadBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
    const result = await this.withRetry(() =>
      this.drive.files.create({
        requestBody: {
          name: input.fileName,
          mimeType: input.mimeType,
          parents: [input.parentStorageFolderId],
        },
        media: {
          mimeType: input.mimeType,
          body: Readable.from(input.buffer),
        },
        fields: 'id,name,mimeType,size,parents',
        supportsAllDrives: true,
      })
    );

    return this.toMetadata(result.data);
  }

  async downloadFile(input: DownloadFileInput): Promise<DownloadFileResult> {
    const metadata = await this.getFileMetadataById(input.storageFileId);
    const result = await this.withRetry(() =>
      this.drive.files.get(
        { fileId: input.storageFileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      )
    );
    return {
      stream: result.data as unknown as Readable,
      mimeType: metadata.mimeType,
      size: metadata.size,
    };
  }

  async renameFile(input: RenameFileInput): Promise<void> {
    await this.withRetry(() =>
      this.drive.files.update({
        fileId: input.storageFileId,
        requestBody: { name: input.name },
        fields: 'id',
        supportsAllDrives: true,
      })
    );
  }

  async moveFile(input: MoveFileInput): Promise<void> {
    await this.moveDriveItem(
      input.storageFileId,
      input.toParentStorageFolderId,
      input.fromParentStorageFolderId
    );
  }

  async trashFile(input: TrashFileInput): Promise<void> {
    await this.withRetry(() =>
      this.drive.files.update({
        fileId: input.storageFileId,
        requestBody: { trashed: true },
        fields: 'id,trashed',
        supportsAllDrives: true,
      })
    );
  }

  async restoreFile(input: RestoreFileInput): Promise<void> {
    await this.withRetry(() =>
      this.drive.files.update({
        fileId: input.storageFileId,
        requestBody: { trashed: false },
        fields: 'id,trashed',
        supportsAllDrives: true,
      })
    );
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    await this.withRetry(() =>
      this.drive.files.delete({
        fileId: input.storageFileId,
        supportsAllDrives: true,
      })
    );
  }

  private async moveDriveItem(
    fileId: string,
    newParentId: string,
    oldParentId?: string | null
  ): Promise<void> {
    const currentParent =
      oldParentId ?? (await this.getFileMetadataById(fileId)).parentStorageFolderIds[0];
    await this.withRetry(() =>
      this.drive.files.update({
        fileId,
        addParents: newParentId,
        removeParents: currentParent,
        fields: 'id,parents',
        supportsAllDrives: true,
      })
    );
  }

  private async getFileMetadataById(fileId: string): Promise<StorageFileMetadata> {
    const result = await this.withRetry(() =>
      this.drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,parents',
        supportsAllDrives: true,
      })
    );
    return this.toMetadata(result.data);
  }

  private toMetadata(file: drive_v3.Schema$File): StorageFileMetadata {
    if (!file.id || !file.name || !file.mimeType) {
      throw new InternalServerErrorException('Drive metadata is incomplete');
    }
    return {
      provider: StorageProvider.GOOGLE_DRIVE,
      storageFileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: Number(file.size ?? 0),
      parentStorageFolderIds: file.parents ?? [],
    };
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    options: { idempotentFileId?: string } = {},
    attempt = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      const status = this.getStatus(error);
      if (status === 409 && options.idempotentFileId) {
        await this.getFileMetadataById(options.idempotentFileId);
        return { data: { id: options.idempotentFileId } } as T;
      }
      if ((status === 403 || status === 429) && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
        return this.withRetry(operation, options, attempt + 1);
      }
      throw error;
    }
  }

  private getStatus(error: unknown): number | null {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = Number((error as { code?: unknown }).code);
      return Number.isFinite(code) ? code : null;
    }
    return null;
  }

  private toPlainHeaders(
    headers:
      | Headers
      | Record<string, unknown>
      | { forEach: (callback: (value: string, key: string) => void) => void }
  ): Record<string, string> {
    if ('forEach' in headers && typeof headers.forEach === 'function') {
      const plain: Record<string, string> = {};
      headers.forEach((value, key) => {
        plain[key] = value;
      });
      return plain;
    }
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
  }
}
```

- [ ] **Step 3: Run provider test**

Run:

```bash
cd webhard-api
pnpm test -- google-drive-storage.provider.spec.ts --runInBand
```

Expected: `4 passed`.

### Task 2.3: Split R2 code behind the provider interface

**Files:**

- Create: `webhard-api/src/storage/r2-storage.provider.ts`
- Modify: `webhard-api/src/storage/storage.service.ts`
- Modify: `webhard-api/src/storage/storage.module.ts`

- [ ] **Step 1: Move current S3/R2 methods into `R2StorageProvider`**

Create `webhard-api/src/storage/r2-storage.provider.ts` by moving the current S3 client setup and these methods from `StorageService`:

```ts
getUploadPresignedUrl;
getDownloadPresignedUrl;
getPublicUrl;
fileExists;
deleteFile;
deleteFiles;
generateStoragePath;
initiateMultipartUpload;
getMultipartPresignedUrl;
completeMultipartUpload;
abortMultipartUpload;
getFileBuffer;
```

Expose compatibility names unchanged so existing tests can be moved one file at a time:

```ts
@Injectable()
export class R2StorageProvider {
  // existing S3Client constructor and existing R2 methods live here

  async generateIds(_count: number): Promise<string[]> {
    throw new Error('R2 does not support provider-generated ids');
  }
}
```

- [ ] **Step 2: Convert `StorageService` into the orchestrator**

Keep DB/cache methods in `webhard-api/src/storage/storage.service.ts`, inject both providers, and add these methods:

```ts
private getDriveBackedFileInput(file: {
  storageProvider: StorageProvider;
  driveFileId: string | null;
  path: string;
}) {
  if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
    if (!file.driveFileId) throw new InternalServerErrorException('Drive file id is missing');
    return { provider: StorageProvider.GOOGLE_DRIVE, storageFileId: file.driveFileId };
  }
  return { provider: StorageProvider.R2, key: extractR2Key(file.path) };
}

async createDriveUploadSession(input: CreateUploadSessionInput): Promise<UploadSessionResult> {
  return this.googleDriveStorageProvider.createUploadSession(input);
}

async generateDriveIds(count: number): Promise<string[]> {
  return this.googleDriveStorageProvider.generateIds(count);
}

async confirmDriveUploadedFile(input: ConfirmUploadedFileInput): Promise<StorageFileMetadata> {
  return this.googleDriveStorageProvider.confirmUploadedFile(input);
}

async uploadDriveBuffer(input: UploadBufferInput): Promise<UploadBufferResult> {
  return this.googleDriveStorageProvider.uploadBuffer(input);
}

async createDriveFolder(input: CreateFolderInput): Promise<{ storageFolderId: string }> {
  return this.googleDriveStorageProvider.createFolder(input);
}

async renameDriveFolder(input: RenameFolderInput): Promise<void> {
  return this.googleDriveStorageProvider.renameFolder(input);
}

async moveDriveFolder(input: MoveFolderInput): Promise<void> {
  return this.googleDriveStorageProvider.moveFolder(input);
}

async trashDriveFolder(input: DeleteFolderInput): Promise<void> {
  return this.googleDriveStorageProvider.deleteFolder(input);
}

async renameDriveFile(input: RenameFileInput): Promise<void> {
  return this.googleDriveStorageProvider.renameFile(input);
}

async moveDriveFile(input: MoveFileInput): Promise<void> {
  return this.googleDriveStorageProvider.moveFile(input);
}

async trashDriveFile(input: TrashFileInput): Promise<void> {
  return this.googleDriveStorageProvider.trashFile(input);
}

async restoreDriveFile(input: RestoreFileInput): Promise<void> {
  return this.googleDriveStorageProvider.restoreFile(input);
}

async deleteDriveFile(input: DeleteFileInput): Promise<void> {
  return this.googleDriveStorageProvider.deleteFile(input);
}

async downloadWebhardFile(file: {
  storageProvider: StorageProvider;
  driveFileId: string | null;
  path: string;
}): Promise<DownloadFileResult | { url: string; key: string; expiresAt: Date }> {
  if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
    if (!file.driveFileId) throw new InternalServerErrorException('Drive file id is missing');
    return this.googleDriveStorageProvider.downloadFile({ storageFileId: file.driveFileId });
  }
  const key = extractR2Key(file.path);
  return this.r2StorageProvider.getDownloadPresignedUrl(key);
}
```

Keep old method names temporarily by delegating to `R2StorageProvider`:

```ts
getUploadPresignedUrl(key: string, contentType: string, expiresIn?: number) {
  return this.r2StorageProvider.getUploadPresignedUrl(key, contentType, expiresIn);
}
```

- [ ] **Step 3: Update module providers**

Modify `webhard-api/src/storage/storage.module.ts` and import `SyncLogModule`:

```ts
imports: [ConfigModule, SyncLogModule],
providers: [StorageService, R2StorageProvider, GoogleDriveStorageProvider, StorageRepairService],
exports: [StorageService, R2StorageProvider, GoogleDriveStorageProvider, StorageRepairService],
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
cd webhard-api
pnpm test -- storage.service.spec.ts google-drive-storage.provider.spec.ts storage-reference.util.spec.ts --runInBand
```

Expected: all selected tests pass.

### Task 2.4: Add storage repair event boundary

**Files:**

- Create: `webhard-api/src/storage/storage-repair.service.ts`
- Test: `webhard-api/src/storage/__tests__/storage-repair.service.spec.ts`
- Modify: `webhard-api/src/integration/sync-log/sync-log.service.ts`
- Test: `webhard-api/src/integration/sync-log/sync-log.service.spec.ts`

- [ ] **Step 1: Add repair event API**

Add `createStorageRepairEvent` to `SyncLogService`. It must write `sync_logs.metadata.auditKind='storage_repair'` and sanitize context exactly like pipeline events. Required metadata:

```ts
{
  auditKind: 'storage_repair',
  operation: 'folder_provision' | 'file_create' | 'file_move' | 'folder_move' | 'file_rename' | 'folder_rename' | 'trash' | 'restore' | 'delete',
  storageProvider: 'google_drive',
  driveFileId?: string,
  driveFolderId?: string,
  webhardFileId?: string,
  webhardFolderId?: string,
  expectedDbState: Record<string, unknown>,
  actualDriveState: Record<string, unknown>,
}
```

- [ ] **Step 2: Add `StorageRepairService`**

Create `webhard-api/src/storage/storage-repair.service.ts`:

```ts
export interface RecordDriveDbMismatchInput {
  operation:
    | 'folder_provision'
    | 'file_create'
    | 'file_move'
    | 'folder_move'
    | 'file_rename'
    | 'folder_rename'
    | 'trash'
    | 'restore'
    | 'delete';
  storageProvider: 'google_drive';
  driveFileId?: string;
  driveFolderId?: string;
  webhardFileId?: string;
  webhardFolderId?: string;
  expectedDbState: Record<string, unknown>;
  actualDriveState: Record<string, unknown>;
}

@Injectable()
export class StorageRepairService {
  constructor(private readonly syncLogService: SyncLogService) {}

  async recordDriveDbMismatch(input: RecordDriveDbMismatchInput): Promise<void> {
    await this.syncLogService.createStorageRepairEvent(input);
  }
}
```

Every Drive mutation that can succeed before the matching DB write must call this service in the DB-write failure path before returning or rethrowing.

- [ ] **Step 3: Tests**

Add tests that prove:

- repair events use `auditKind='storage_repair'`
- `uploadUrl`, bearer tokens, service account JSON, and presigned/session URLs are never stored
- uploaded Drive file with failed DB insert records `operation='file_create'`
- file/folder move failure records enough ids to repair manually
- provisioning duplicate/orphan failures record the pre-generated Drive id

- [ ] **Step 4: Commit storage boundary**

Run:

```bash
git add webhard-api/src/storage webhard-api/package.json webhard-api/pnpm-lock.yaml
git commit -m "feat: 저장소 provider 경계 추가"
```

---

## Phase 3 - Folder Template And Drive Provisioning

### Task 3.1: Extract folder template service

**Files:**

- Create: `webhard-api/src/folders/folder-template.service.ts`
- Modify: `webhard-api/src/folders/folders.service.ts`
- Modify: `webhard-api/src/folders/folders.module.ts`
- Test: `webhard-api/src/folders/folders.service.spec.ts`

- [ ] **Step 1: Create `FolderTemplateService`**

Create `webhard-api/src/folders/folder-template.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FolderTemplateNode } from './dto/folder.dto';

@Injectable()
export class FolderTemplateService {
  private static readonly DEFAULT_FOLDER_TEMPLATE: FolderTemplateNode[] = [
    { name: '목형의뢰', children: [{ name: '완료' }] },
    { name: '칼선의뢰', children: [{ name: '완료' }] },
    { name: '문의' },
  ];

  private static readonly FOLDER_TEMPLATE_KEY = 'default_folder_template';

  constructor(private readonly prisma: PrismaService) {}

  async getFolderTemplate(): Promise<FolderTemplateNode[]> {
    const setting = await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.findUnique({
          where: { key: FolderTemplateService.FOLDER_TEMPLATE_KEY },
        }),
      { operationName: 'folderTemplate.getFolderTemplate' }
    );
    return setting
      ? (setting.value as unknown as FolderTemplateNode[])
      : FolderTemplateService.DEFAULT_FOLDER_TEMPLATE;
  }

  async updateFolderTemplate(template: FolderTemplateNode[]): Promise<{ success: boolean }> {
    const jsonValue = JSON.parse(JSON.stringify(template));
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.upsert({
          where: { key: FolderTemplateService.FOLDER_TEMPLATE_KEY },
          update: { value: jsonValue },
          create: { key: FolderTemplateService.FOLDER_TEMPLATE_KEY, value: jsonValue },
        }),
      { operationName: 'folderTemplate.updateFolderTemplate' }
    );
    return { success: true };
  }
}
```

- [ ] **Step 2: Delegate existing methods**

Modify `FoldersService` constructor to inject `FolderTemplateService` and replace existing template methods:

```ts
async getFolderTemplate(): Promise<FolderTemplateNode[]> {
  return this.folderTemplateService.getFolderTemplate();
}

async updateFolderTemplate(template: FolderTemplateNode[]): Promise<{ success: boolean }> {
  return this.folderTemplateService.updateFolderTemplate(template);
}
```

Remove `DEFAULT_FOLDER_TEMPLATE` and `FOLDER_TEMPLATE_KEY` from `FoldersService`.

- [ ] **Step 3: Export the service**

Modify `webhard-api/src/folders/folders.module.ts`:

```ts
providers: [FoldersService, FolderPathService, WebhardConfigService, FolderTemplateService],
exports: [FoldersService, FolderPathService, WebhardConfigService, FolderTemplateService],
```

- [ ] **Step 4: Run folder tests**

Run:

```bash
cd webhard-api
pnpm test -- folders.service.spec.ts --runInBand
```

Expected: existing folder tests pass.

### Task 3.2: Add idempotent Drive provisioning

**Files:**

- Create: `webhard-api/src/folders/drive-provisioning.service.ts`
- Create: `webhard-api/src/folders/dto/drive-provisioning.dto.ts`
- Create: `webhard-api/src/folders/drive-provisioning.service.spec.ts`
- Modify: `webhard-api/src/folders/folders.module.ts`
- Modify: `webhard-api/src/companies/companies.module.ts`

- [ ] **Step 1: Add DTO**

Create `webhard-api/src/folders/dto/drive-provisioning.dto.ts`:

```ts
export interface DriveProvisioningResultDto {
  company_id: number;
  status: 'pending' | 'ready' | 'failed';
  drive_root_folder_id: string | null;
  error: string | null;
}
```

- [ ] **Step 2: Add provisioning service**

Create `webhard-api/src/folders/drive-provisioning.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { DriveProvisioningStatus, Prisma, StorageProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageRepairService } from '../storage/storage-repair.service';
import { StorageService } from '../storage/storage.service';
import { FolderTemplateService } from './folder-template.service';
import { FolderTemplateNode } from './dto/folder.dto';
import { DriveProvisioningResultDto } from './dto/drive-provisioning.dto';

@Injectable()
export class DriveProvisioningService {
  private readonly logger = new Logger(DriveProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly storageRepairService: StorageRepairService,
    private readonly folderTemplateService: FolderTemplateService
  ) {}

  async ensureCompanyDriveRoot(companyId: number): Promise<DriveProvisioningResultDto> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return {
        company_id: companyId,
        status: 'failed',
        drive_root_folder_id: null,
        error: 'Company not found',
      };
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        driveProvisioningStatus: DriveProvisioningStatus.PENDING,
        driveProvisioningError: null,
        driveProvisioningLastAttemptAt: new Date(),
      },
    });

    try {
      const rootFolder = await this.ensureFolderRow({
        companyId,
        name: company.companyName,
        parentId: null,
        parentDriveFolderId: null,
        folderKind: 'generic',
      });
      const template = await this.folderTemplateService.getFolderTemplate();
      await this.ensureTemplateFolders(
        companyId,
        rootFolder.id,
        rootFolder.driveFolderId,
        template
      );

      const updated = await this.prisma.company.update({
        where: { id: companyId },
        data: {
          driveRootFolderId: rootFolder.driveFolderId,
          driveProvisioningStatus: DriveProvisioningStatus.READY,
          driveProvisioningError: null,
          driveProvisionedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        company_id: updated.id,
        status: 'ready',
        drive_root_folder_id: updated.driveRootFolderId,
        error: null,
      };
    } catch (error) {
      const safeMessage = this.sanitizeProvisioningError(error);
      this.logger.warn(`Drive provisioning failed: companyId=${companyId} error=${safeMessage}`);
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          driveProvisioningStatus: DriveProvisioningStatus.FAILED,
          driveProvisioningError: safeMessage,
          updatedAt: new Date(),
        },
      });
      return {
        company_id: companyId,
        status: 'failed',
        drive_root_folder_id: null,
        error: safeMessage,
      };
    }
  }

  private async ensureTemplateFolders(
    companyId: number,
    parentId: string,
    parentDriveFolderId: string,
    nodes: FolderTemplateNode[]
  ): Promise<void> {
    for (const node of nodes) {
      const folder = await this.ensureFolderRow({
        companyId,
        name: node.name,
        parentId,
        parentDriveFolderId,
        folderKind: 'template',
      });
      if (node.children?.length) {
        await this.ensureTemplateFolders(companyId, folder.id, folder.driveFolderId, node.children);
      }
    }
  }

  private async ensureFolderRow(input: {
    companyId: number;
    name: string;
    parentId: string | null;
    parentDriveFolderId: string | null;
    folderKind: string;
  }): Promise<{ id: string; driveFolderId: string }> {
    const existing = await this.prisma.webhardFolder.findFirst({
      where: {
        name: input.name,
        parentId: input.parentId,
        companyId: input.companyId,
        deletedAt: null,
      },
      select: { id: true, driveFolderId: true },
    });

    if (existing?.driveFolderId) {
      await this.storageService.createDriveFolder({
        name: input.name,
        parentStorageFolderId: input.parentDriveFolderId,
        storageFolderId: existing.driveFolderId,
      });
      return { id: existing.id, driveFolderId: existing.driveFolderId };
    }

    const [reservedDriveFolderId] = await this.storageService.generateDriveIds(1);

    if (existing) {
      const updated = await this.prisma.webhardFolder.update({
        where: { id: existing.id },
        data: {
          storageProvider: StorageProvider.GOOGLE_DRIVE,
          driveFolderId: reservedDriveFolderId,
          folderKind: input.folderKind,
        },
        select: { id: true, driveFolderId: true },
      });
      await this.ensureDriveFolderCreated({
        folderId: updated.id,
        name: input.name,
        parentDriveFolderId: input.parentDriveFolderId,
        driveFolderId: reservedDriveFolderId,
      });
      return { id: updated.id, driveFolderId: updated.driveFolderId as string };
    }

    const path = await this.computePath(input.parentId, input.name);
    const created = await this.prisma.webhardFolder.create({
      data: {
        name: input.name,
        parentId: input.parentId,
        companyId: input.companyId,
        path,
        folderKind: input.folderKind,
        storageProvider: StorageProvider.GOOGLE_DRIVE,
        driveFolderId: reservedDriveFolderId,
      },
      select: { id: true, driveFolderId: true },
    });
    await this.ensureDriveFolderCreated({
      folderId: created.id,
      name: input.name,
      parentDriveFolderId: input.parentDriveFolderId,
      driveFolderId: reservedDriveFolderId,
    });
    return { id: created.id, driveFolderId: created.driveFolderId as string };
  }

  private async ensureDriveFolderCreated(input: {
    folderId: string;
    name: string;
    parentDriveFolderId: string | null;
    driveFolderId: string;
  }): Promise<void> {
    try {
      await this.storageService.createDriveFolder({
        name: input.name,
        parentStorageFolderId: input.parentDriveFolderId,
        storageFolderId: input.driveFolderId,
      });
    } catch (error) {
      await this.storageRepairService.recordDriveDbMismatch({
        operation: 'folder_provision',
        storageProvider: 'google_drive',
        driveFolderId: input.driveFolderId,
        webhardFolderId: input.folderId,
        expectedDbState: { driveFolderId: input.driveFolderId },
        actualDriveState: { createFailed: true },
      });
      throw error;
    }
  }

  private async computePath(parentId: string | null, name: string): Promise<string> {
    if (!parentId) return `/${name}`;
    const parent = await this.prisma.webhardFolder.findUnique({
      where: { id: parentId },
      select: { path: true, name: true },
    });
    return parent?.path ? `${parent.path}/${name}` : `/${parent?.name ?? ''}/${name}`;
  }

  private sanitizeProvisioningError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
      .replace(/"private_key"\s*:\s*"[^"]+"/g, '"private_key":"[redacted]"')
      .slice(0, 500);
  }
}
```

- [ ] **Step 3: Add unit tests for idempotency and failure**

Create `webhard-api/src/folders/drive-provisioning.service.spec.ts` with these cases:

```ts
describe('DriveProvisioningService', () => {
  const company = { id: 4, companyName: 'ACME Box' };
  const template = [
    { name: '목형의뢰', children: [{ name: '완료' }] },
    { name: '칼선의뢰', children: [{ name: '완료' }] },
    { name: '문의' },
  ];

  it('creates company root and template folders with Drive ids', async () => {
    const driveIds = [
      'drive-root',
      'drive-mold',
      'drive-mold-done',
      'drive-cutting',
      'drive-cutting-done',
      'drive-inquiry',
    ];
    prisma.company.findUnique.mockResolvedValue(company);
    prisma.company.update.mockImplementation(async ({ data }) => ({ ...company, ...data }));
    prisma.webhardFolder.findFirst.mockResolvedValue(null);
    prisma.webhardFolder.create.mockImplementation(async ({ data }) => ({
      id: `${data.name}-${data.parentId ?? 'root'}`,
      driveFolderId: data.driveFolderId,
    }));
    storageService.generateDriveIds.mockImplementation(async () => [driveIds.shift() as string]);
    storageService.createDriveFolder.mockImplementation(async ({ storageFolderId }) => ({
      storageFolderId,
    }));
    folderTemplateService.getFolderTemplate.mockResolvedValue(template);

    const result = await service.ensureCompanyDriveRoot(4);

    expect(result).toMatchObject({
      company_id: 4,
      status: 'ready',
      drive_root_folder_id: 'drive-root',
    });
    expect(storageService.createDriveFolder).toHaveBeenCalledTimes(6);
    expect(prisma.company.update).toHaveBeenLastCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({
        driveRootFolderId: 'drive-root',
        driveProvisioningStatus: DriveProvisioningStatus.READY,
        driveProvisioningError: null,
      }),
    });
  });

  it('reuses existing DB rows that already have driveFolderId', async () => {
    prisma.company.findUnique.mockResolvedValue(company);
    prisma.company.update.mockImplementation(async ({ data }) => ({ ...company, ...data }));
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({
      id: 'root-folder',
      driveFolderId: 'drive-root',
    });
    prisma.webhardFolder.findFirst.mockResolvedValue(null);
    prisma.webhardFolder.create.mockResolvedValue({
      id: 'child-folder',
      driveFolderId: 'drive-child',
    });
    storageService.createDriveFolder.mockResolvedValue({ storageFolderId: 'drive-child' });
    storageService.generateDriveIds.mockResolvedValue(['drive-child']);
    folderTemplateService.getFolderTemplate.mockResolvedValue([{ name: '문의' }]);

    await service.ensureCompanyDriveRoot(4);

    expect(storageService.createDriveFolder).toHaveBeenCalledTimes(2);
    expect(storageService.createDriveFolder).toHaveBeenCalledWith({
      name: '문의',
      parentStorageFolderId: 'drive-root',
      storageFolderId: 'drive-child',
    });
  });

  it('stores sanitized failure reason and keeps company approved state untouched', async () => {
    prisma.company.findUnique.mockResolvedValue(company);
    prisma.company.update.mockImplementation(async ({ data }) => ({ ...company, ...data }));
    prisma.webhardFolder.findFirst.mockResolvedValue(null);
    storageService.generateDriveIds.mockResolvedValue(['drive-root']);
    storageService.createDriveFolder.mockRejectedValue(
      new Error('Bearer secret-token "private_key":"raw-private-key" failed')
    );

    const result = await service.ensureCompanyDriveRoot(4);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Bearer [redacted]');
    expect(result.error).toContain('"private_key":"[redacted]"');
    expect(prisma.company.update).toHaveBeenLastCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({
        driveProvisioningStatus: DriveProvisioningStatus.FAILED,
        driveProvisioningError: expect.stringContaining('[redacted]'),
      }),
    });
    expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'folder_provision',
        driveFolderId: 'drive-root',
      })
    );
  });
});
```

Create explicit Jest mocks for `prisma.company.findUnique`, `prisma.company.update`, `prisma.webhardFolder.findFirst`, `prisma.webhardFolder.create`, `prisma.webhardFolder.update`, `storageService.generateDriveIds`, `storageService.createDriveFolder`, and `storageRepairService.recordDriveDbMismatch` in the `beforeEach` block.

- [ ] **Step 4: Register modules**

Modify `webhard-api/src/folders/folders.module.ts`:

```ts
imports: [AuthModule, ApiKeyModule, StorageModule, forwardRef(() => ContactsModule)],
providers: [
  FoldersService,
  FolderPathService,
  WebhardConfigService,
  FolderTemplateService,
  DriveProvisioningService,
],
exports: [
  FoldersService,
  FolderPathService,
  WebhardConfigService,
  FolderTemplateService,
  DriveProvisioningService,
],
```

Modify `webhard-api/src/companies/companies.module.ts`:

```ts
imports: [PrismaModule, ApiKeyModule, ContactsModule, FoldersModule],
```

- [ ] **Step 5: Run provisioning tests**

Run:

```bash
cd webhard-api
pnpm test -- drive-provisioning.service.spec.ts folders.service.spec.ts --runInBand
```

Expected: all selected tests pass.

---

## Phase 4 - Company Approval And Admin Retry

### Task 4.1: Provision Drive folders on company approval

**Files:**

- Modify: `webhard-api/src/companies/companies.service.ts`
- Modify: `webhard-api/src/companies/companies.controller.ts`
- Modify: `webhard-api/src/companies/dto/company.dto.ts`
- Test: `webhard-api/src/companies/companies.service.spec.ts`

- [ ] **Step 1: Extend company DTO output**

In `webhard-api/src/companies/dto/company.dto.ts`, add response fields:

```ts
drive_root_folder_id?: string | null;
drive_provisioning_status?: 'pending' | 'ready' | 'failed';
drive_provisioning_error?: string | null;
drive_provisioning_last_attempt_at?: string | null;
drive_provisioned_at?: string | null;
```

Update `CompaniesService.toSnakeCase` to map:

```ts
drive_root_folder_id: company.driveRootFolderId,
drive_provisioning_status: company.driveProvisioningStatus?.toLowerCase?.() ?? company.driveProvisioningStatus,
drive_provisioning_error: company.driveProvisioningError,
drive_provisioning_last_attempt_at: company.driveProvisioningLastAttemptAt?.toISOString() ?? null,
drive_provisioned_at: company.driveProvisionedAt?.toISOString() ?? null,
```

- [ ] **Step 2: Inject provisioning service**

Modify `CompaniesService` constructor:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly driveProvisioningService: DriveProvisioningService
) {}
```

- [ ] **Step 3: Run provisioning after approval**

In `approve(id, approvedBy)`, after the company update and notification, call:

```ts
const provisioning = await this.driveProvisioningService.ensureCompanyDriveRoot(updated.id);

return {
  company: this.toSnakeCase(
    await this.prisma.company.findUniqueOrThrow({ where: { id: updated.id } })
  ),
  previousStatus: company.status,
  alreadyApproved: false,
  driveProvisioning: provisioning,
};
```

In `updateStatus(id, status, approvedBy?)`, when `status === 'active'`, call the same provisioning method after updating the company.

- [ ] **Step 4: Add retry endpoint**

Modify `webhard-api/src/companies/companies.controller.ts`:

```ts
@Post(':id/drive-provisioning/retry')
@UseGuards(AdminGuard)
async retryDriveProvisioning(@Param('id', ParseIntPipe) id: number) {
  return this.companiesService.retryDriveProvisioning(id);
}
```

Add service method:

```ts
async retryDriveProvisioning(id: number) {
  const company = await this.prisma.company.findUnique({ where: { id } });
  if (!company) throw new NotFoundException(`Company ${id} not found`);
  return this.driveProvisioningService.ensureCompanyDriveRoot(id);
}
```

- [ ] **Step 5: Test approval behavior**

Add tests in `webhard-api/src/companies/companies.service.spec.ts`:

```ts
it('approves company and starts Drive provisioning', async () => {
  prisma.company.findUnique.mockResolvedValue({
    id: 4,
    status: 'pending',
    isApproved: false,
    companyName: 'ACME Box',
  });
  prisma.company.update.mockResolvedValue({
    id: 4,
    status: 'active',
    isApproved: true,
    companyName: 'ACME Box',
  });
  driveProvisioningService.ensureCompanyDriveRoot.mockResolvedValue({
    company_id: 4,
    status: 'ready',
    drive_root_folder_id: 'drive-root',
    error: null,
  });

  const result = await service.approve(4, 'admin-1');

  expect(prisma.company.update).toHaveBeenCalledWith({
    where: { id: 4 },
    data: expect.objectContaining({ isApproved: true, status: 'active', approvedBy: 'admin-1' }),
  });
  expect(driveProvisioningService.ensureCompanyDriveRoot).toHaveBeenCalledWith(4);
  expect(result.driveProvisioning).toMatchObject({ status: 'ready' });
});

it('returns sanitized Drive provisioning failure without rolling back approval', async () => {
  prisma.company.findUnique.mockResolvedValue({
    id: 4,
    status: 'pending',
    isApproved: false,
    companyName: 'ACME Box',
  });
  prisma.company.update.mockResolvedValue({
    id: 4,
    status: 'active',
    isApproved: true,
    companyName: 'ACME Box',
  });
  driveProvisioningService.ensureCompanyDriveRoot.mockResolvedValue({
    company_id: 4,
    status: 'failed',
    drive_root_folder_id: null,
    error: 'Shared Drive permission missing',
  });

  const result = await service.approve(4, 'admin-1');

  expect(result.company.status).toBe('active');
  expect(result.company.is_approved).toBe(true);
  expect(result.driveProvisioning).toMatchObject({
    status: 'failed',
    error: 'Shared Drive permission missing',
  });
});

it('retries Drive provisioning for an existing company', async () => {
  prisma.company.findUnique.mockResolvedValue({ id: 4, companyName: 'ACME Box' });
  driveProvisioningService.ensureCompanyDriveRoot.mockResolvedValue({
    company_id: 4,
    status: 'ready',
    drive_root_folder_id: 'drive-root',
    error: null,
  });

  await expect(service.retryDriveProvisioning(4)).resolves.toMatchObject({ status: 'ready' });
  expect(driveProvisioningService.ensureCompanyDriveRoot).toHaveBeenCalledWith(4);
});
```

- [ ] **Step 6: Run company tests**

Run:

```bash
cd webhard-api
pnpm test -- companies.service.spec.ts --runInBand
```

Expected: selected tests pass.

---

## Phase 5 - Drive-Backed Files And Folders

### Task 5.1: Replace upload-session and confirm semantics in DTOs

**Files:**

- Modify: `webhard-api/src/files/dto/file.dto.ts`
- Modify: `src/lib/utils/uploadQueue.ts`

- [ ] **Step 1: Add Drive-friendly response fields**

In `PresignedUrlResponseDto`, keep legacy fields and add:

```ts
provider?: 'google_drive' | 'r2';
uploadUrl?: string;
uploadHeaders?: Record<string, string>;
driveFileId?: string;
driveFileIdRequired?: boolean;
```

In `ConfirmUploadDto`, add:

```ts
@IsOptional()
@IsString()
driveFileId?: string;

@IsOptional()
@IsString()
storageProvider?: 'google_drive' | 'r2';
```

- [ ] **Step 2: Update frontend upload result shape**

In `src/lib/utils/uploadQueue.ts`, replace the `allFileResults` item type with:

```ts
const allFileResults: Array<{
  fileName: string;
  uploadUrl?: string;
  presignedUrl?: string;
  objectKey?: string;
  publicUrl?: string;
  provider?: 'google_drive' | 'r2';
  uploadHeaders?: Record<string, string>;
  driveFileId?: string;
  folderId: string;
  skipped: boolean;
  error?: string;
}> = [];
```

Add a helper:

```ts
async function uploadToStorageSession(
  file: File,
  item: {
    uploadUrl?: string;
    presignedUrl?: string;
    objectKey?: string;
    provider?: 'google_drive' | 'r2';
    uploadHeaders?: Record<string, string>;
    driveFileId?: string;
  },
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<{ driveFileId?: string }> {
  if (item.provider === 'google_drive') {
    if (!item.uploadUrl) throw new Error('Drive upload URL missing');
    const responseText = await uploadToDriveResumableSession(
      file,
      item.uploadUrl,
      item.uploadHeaders ?? {},
      onProgress,
      signal
    );
    const parsed = JSON.parse(responseText) as { id?: string };
    if (!parsed.id) throw new Error('Drive upload response missing file id');
    if (item.driveFileId && parsed.id !== item.driveFileId) {
      throw new Error('Drive upload response id mismatch');
    }
    return { driveFileId: parsed.id };
  }
  if (!item.presignedUrl || !item.objectKey) throw new Error('R2 upload information missing');
  await uploadToR2Smart(file, item.presignedUrl, item.objectKey, onProgress, signal);
  return {};
}
```

Add `uploadToDriveResumableSession` with chunked resumable semantics:

```ts
const DRIVE_CHUNK_SIZE = 8 * 1024 * 1024; // Multiple of 256 KiB.

async function uploadToDriveResumableSession(
  file: File,
  uploadUrl: string,
  uploadHeaders: Record<string, string>,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (file.size <= DRIVE_CHUNK_SIZE) {
    const response = await putDriveChunk(
      file,
      uploadUrl,
      uploadHeaders,
      0,
      file.size - 1,
      file.size,
      onProgress,
      signal
    );
    return response.body;
  }

  let offset = 0;
  let finalResponse = '';
  while (offset < file.size) {
    const end = Math.min(offset + DRIVE_CHUNK_SIZE, file.size) - 1;
    const response = await putDriveChunk(
      file.slice(offset, end + 1),
      uploadUrl,
      uploadHeaders,
      offset,
      end,
      file.size,
      onProgress,
      signal
    );
    if (response.status === 308) {
      offset = parseNextDriveOffset(response.rangeHeader, end);
      continue;
    }
    finalResponse = response.body;
    break;
  }
  return finalResponse;
}
```

Implementation rules:

- `PUT` each chunk to the Drive session URL.
- In browser `XMLHttpRequest`, do not manually set forbidden headers such as `Content-Length`; the browser supplies it from the request body. Server-side HTTP clients must set it explicitly if this helper is ever moved server-side.
- Set `Content-Range: bytes {start}-{end}/{file.size}`.
- Treat `308 Resume Incomplete` as success for an intermediate chunk and resume from the response `Range` header.
- Treat final `200` or `201` as success and parse the response JSON id.
- On network interruption or `5xx`, query session status with empty `PUT` and `Content-Range: bytes */{file.size}` before retrying.
- Preserve abort handling and progress updates.
- Tests must assert `Content-Range`, progress, `308` resume, final `200/201`, abort, and id mismatch behavior. Do not assert manual `Content-Length` in browser tests.
- Never log or persist the resumable session URL.

### Task 5.2: Generate Drive upload sessions in `FilesService`

**Files:**

- Modify: `webhard-api/src/files/files.service.ts`
- Test: `webhard-api/src/files/__tests__/files.service.spec.ts`

- [ ] **Step 1: Require ready provisioning before upload**

Add helper in `FilesService`:

```ts
private async assertFolderDriveReady(folderId: string | null): Promise<{
  folderId: string | null;
  companyId: number | null;
  driveFolderId: string;
}> {
  if (!folderId) throw new BadRequestException('업로드할 폴더를 선택해주세요.');
  const folder = await this.prisma.webhardFolder.findUnique({
    where: { id: folderId },
    select: { id: true, companyId: true, driveFolderId: true, storageProvider: true },
  });
  if (!folder || !folder.driveFolderId || folder.storageProvider !== StorageProvider.GOOGLE_DRIVE) {
    throw new BadRequestException('Google Drive 폴더 준비가 완료되지 않았습니다.');
  }
  if (folder.companyId) {
    const company = await this.prisma.company.findUnique({
      where: { id: folder.companyId },
      select: { driveProvisioningStatus: true },
    });
    if (company?.driveProvisioningStatus !== DriveProvisioningStatus.READY) {
      throw new BadRequestException('업체 Google Drive 폴더 준비가 완료되지 않았습니다.');
    }
  }
  return { folderId: folder.id, companyId: folder.companyId, driveFolderId: folder.driveFolderId };
}
```

- [ ] **Step 2: Replace upload session creation**

In `getUploadPresignedUrl`, keep routing logic and replace `generateStoragePath + getUploadPresignedUrl` with:

```ts
const driveTarget = await this.assertFolderDriveReady(effectiveFolderId);
const session = await this.storageService.createDriveUploadSession({
  fileName: dto.filename,
  mimeType: dto.contentType,
  size: dto.size ?? 0,
  parentStorageFolderId: driveTarget.driveFolderId,
});

return {
  url: session.uploadUrl,
  key: session.storageFileId,
  expiresAt: session.expiresAt.toISOString(),
  folderId: effectiveFolderId,
  redirected,
  provider: 'google_drive',
  uploadUrl: session.uploadUrl,
  uploadHeaders: session.headers,
  driveFileId: session.storageFileId,
  driveFileIdRequired: true,
};
```

- [ ] **Step 3: Confirm Drive uploaded file**

In `confirmUpload`, before creating `webhardFile`, require `dto.storageProvider === 'google_drive'` and `dto.driveFileId`.

Use:

```ts
const targetFolder = await this.assertFolderDriveReady(effectiveFolderId);
const driveMetadata = await this.storageService.confirmDriveUploadedFile({
  storageFileId: dto.driveFileId,
  expectedParentStorageFolderId: targetFolder.driveFolderId,
});
```

Create the row with:

```ts
storageProvider: StorageProvider.GOOGLE_DRIVE,
driveFileId: driveMetadata.storageFileId,
driveMimeType: driveMetadata.mimeType,
path: `${targetFolder.folderId}/${dto.name}`,
```

Preserve existing fields, notifications, `invalidateStorageCache`, realtime, `propagateUpdatedAt`, and AutoContact side effects.

If Drive confirmation succeeds but `webhardFile.create` fails, call `storageRepairService.recordDriveDbMismatch(...)` with `operation: 'file_create'`, the reserved/uploaded `driveFileId`, target folder/company ids, and the intended DB row fields before rethrowing.

- [ ] **Step 4: Batch confirm Drive files**

In `batchConfirmUpload`, require each valid file to carry `driveFileId`, verify each Drive file with bounded concurrency `5`, and include:

```ts
storageProvider: StorageProvider.GOOGLE_DRIVE,
driveFileId: f.driveFileId,
driveMimeType: f.mimeType,
path: `${resolveEffectiveFolderId(f)}/${f.name}`,
```

in `createMany` data.

If any Drive file was confirmed but the batch DB insert fails, record one repair event per confirmed Drive file with `operation: 'file_create'`.

- [ ] **Step 5: Add tests**

Add cases:

```ts
it('creates Drive upload session for routed folder and returns provider google_drive', async () => {
  prisma.webhardFolder.findUnique.mockResolvedValue({
    id: 'folder-1',
    companyId: 4,
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-folder-1',
  });
  prisma.company.findUnique.mockResolvedValue({
    driveProvisioningStatus: DriveProvisioningStatus.READY,
  });
  storageService.createDriveUploadSession.mockResolvedValue({
    provider: StorageProvider.GOOGLE_DRIVE,
    storageFileId: 'drive-file-1',
    uploadUrl: 'https://upload.example/session',
    expiresAt: new Date('2026-05-29T00:10:00.000Z'),
    headers: { 'Content-Type': 'application/dxf' },
  });

  const result = await service.getUploadPresignedUrl(
    { filename: 'sample.dxf', contentType: 'application/dxf', size: 100, folderId: 'folder-1' },
    adminUser
  );

  expect(result.provider).toBe('google_drive');
  expect(result.uploadUrl).toBe('https://upload.example/session');
  expect(result.driveFileId).toBe('drive-file-1');
  expect(storageService.createDriveUploadSession).toHaveBeenCalledWith({
    fileName: 'sample.dxf',
    mimeType: 'application/dxf',
    size: 100,
    parentStorageFolderId: 'drive-folder-1',
  });
});

it('confirmUpload stores driveFileId and never stores upload session URL', async () => {
  prisma.webhardFolder.findUnique.mockResolvedValue({
    id: 'folder-1',
    companyId: 4,
    path: '/ACME Box/문의',
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-folder-1',
  });
  prisma.company.findUnique.mockResolvedValue({
    driveProvisioningStatus: DriveProvisioningStatus.READY,
  });
  storageService.confirmDriveUploadedFile.mockResolvedValue({
    provider: StorageProvider.GOOGLE_DRIVE,
    storageFileId: 'drive-file-1',
    name: 'sample.dxf',
    mimeType: 'application/dxf',
    size: 100,
    parentStorageFolderIds: ['drive-folder-1'],
  });
  prisma.webhardFile.create.mockResolvedValue(
    makeFile({ id: 'file-1', driveFileId: 'drive-file-1' })
  );

  await service.confirmUpload(
    {
      key: '',
      storageProvider: 'google_drive',
      driveFileId: 'drive-file-1',
      name: 'sample.dxf',
      originalName: 'sample.dxf',
      size: 100,
      mimeType: 'application/dxf',
      folderId: 'folder-1',
    },
    adminUser
  );

  const createData = prisma.webhardFile.create.mock.calls[0][0].data;
  expect(createData.driveFileId).toBe('drive-file-1');
  expect(createData.path).not.toContain('https://');
});

it('rejects upload when company provisioning is not READY', async () => {
  prisma.webhardFolder.findUnique.mockResolvedValue({
    id: 'folder-1',
    companyId: 4,
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-folder-1',
  });
  prisma.company.findUnique.mockResolvedValue({
    driveProvisioningStatus: DriveProvisioningStatus.FAILED,
  });

  await expect(
    service.getUploadPresignedUrl(
      { filename: 'sample.dxf', contentType: 'application/dxf', size: 100, folderId: 'folder-1' },
      adminUser
    )
  ).rejects.toThrow('업체 Google Drive 폴더 준비가 완료되지 않았습니다.');
  expect(storageService.createDriveUploadSession).not.toHaveBeenCalled();
});

it('records a repair event when Drive upload is confirmed but DB create fails', async () => {
  prisma.webhardFolder.findUnique.mockResolvedValue({
    id: 'folder-1',
    companyId: 4,
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-folder-1',
  });
  prisma.company.findUnique.mockResolvedValue({
    driveProvisioningStatus: DriveProvisioningStatus.READY,
  });
  storageService.confirmDriveUploadedFile.mockResolvedValue({
    provider: StorageProvider.GOOGLE_DRIVE,
    storageFileId: 'drive-file-1',
    name: 'sample.dxf',
    mimeType: 'application/dxf',
    size: 100,
    parentStorageFolderIds: ['drive-folder-1'],
  });
  prisma.webhardFile.create.mockRejectedValue(new Error('database unavailable'));

  await expect(
    service.confirmUpload(
      {
        key: '',
        storageProvider: 'google_drive',
        driveFileId: 'drive-file-1',
        name: 'sample.dxf',
        originalName: 'sample.dxf',
        size: 100,
        mimeType: 'application/dxf',
        folderId: 'folder-1',
      },
      adminUser
    )
  ).rejects.toThrow('database unavailable');

  expect(storageRepairService.recordDriveDbMismatch).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'file_create',
      driveFileId: 'drive-file-1',
      webhardFolderId: 'folder-1',
    })
  );
});
```

- [ ] **Step 6: Run file service tests**

Run:

```bash
cd webhard-api
pnpm test -- files.service.spec.ts --runInBand
```

Expected: selected tests pass.

### Task 5.3: Drive-backed download, rename, move, delete, zip, trash

**Files:**

- Modify: `webhard-api/src/files/files.service.ts`
- Modify: `webhard-api/src/files/zip.service.ts`
- Modify: `webhard-api/src/trash/trash.service.ts`
- Test: `webhard-api/src/files/files.worker-access.spec.ts`
- Test: `webhard-api/src/trash/__tests__/trash.service.spec.ts`

- [ ] **Step 1: Download without exposing Drive share links**

Modify `FilesService.getDownloadUrl`:

```ts
if (file.storageProvider === StorageProvider.GOOGLE_DRIVE) {
  return {
    url: `/api/v1/files/${file.id}/download/stream`,
    key: file.driveFileId ?? '',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    fileName: file.name,
  };
}
```

Add controller route `GET /files/:id/download/stream` that verifies the same access as `getDownloadUrl`, calls `storageService.downloadWebhardFile(file)`, and pipes the stream with `Content-Disposition` filename.

- [ ] **Step 2: Rename and move Drive files**

In `renameFile`, after duplicate check and before DB update:

```ts
if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
  await this.storageService.renameDriveFile({
    storageFileId: file.driveFileId,
    name: sanitizedName,
  });
}
```

In `moveFile`, load the target folder `driveFolderId` and source folder `driveFolderId`, then call:

```ts
await this.storageService.moveDriveFile({
  storageFileId: file.driveFileId,
  fromParentStorageFolderId: sourceFolder?.driveFolderId ?? null,
  toParentStorageFolderId: targetFolder.driveFolderId,
});
```

Before the DB update. If Drive succeeds and DB fails, call `storageRepairService.recordDriveDbMismatch(...)` before rethrowing. The event must include `operation`, `driveFileId`, `webhardFileId`, source/target folder ids, expected DB state, and actual Drive parent state.

- [ ] **Step 3: Delete and restore**

Keep DB soft delete primary. Add Drive trash call:

```ts
if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
  await this.storageService.trashDriveFile({ storageFileId: file.driveFileId });
}
```

In trash restore:

```ts
if (file.storageProvider === StorageProvider.GOOGLE_DRIVE && file.driveFileId) {
  await this.storageService.restoreDriveFile({ storageFileId: file.driveFileId });
}
```

Permanent delete uses `deleteDriveFile`.

- [ ] **Step 4: ZIP uses storage stream**

Change `ZipService.createZipStream` input to include provider fields:

```ts
files: Array<{
  path: string;
  originalName: string;
  storageProvider: StorageProvider;
  driveFileId: string | null;
}>;
```

Append Drive stream directly:

```ts
const download = await this.storageService.downloadWebhardFile(file);
if ('stream' in download) {
  archive.append(download.stream, { name: file.originalName });
} else {
  const response = await fetch(download.url);
  if (response.ok && response.body)
    archive.append(Readable.fromWeb(response.body as never), { name: file.originalName });
}
```

- [ ] **Step 5: Run operation tests**

Run:

```bash
cd webhard-api
pnpm test -- files.service.spec.ts files.worker-access.spec.ts trash.service.spec.ts --runInBand
```

Expected: selected tests pass.

---

## Phase 6 - Drive-Backed Folders

### Task 6.1: Create, rename, move, delete Drive folders with DB path rules preserved

**Files:**

- Modify: `webhard-api/src/folders/folders.service.ts`
- Test: `webhard-api/src/folders/folders.service.spec.ts`

- [ ] **Step 1: Initialize company folders through Drive provisioning**

In `FoldersService.initializeCompanyFolders`, replace internal `findOrCreate` Drive-blind creation with:

```ts
const result = await this.driveProvisioningService.ensureCompanyDriveRoot(companyId);
if (result.status !== 'ready') {
  return { success: false, error: result.error ?? 'Google Drive provisioning failed' };
}
await this.invalidateFolderCache();
return { success: true };
```

- [ ] **Step 2: Create child folders in Drive**

In `createFolder`, after resolving parent and company id, require the parent `driveFolderId` unless creating a root. Reserve the Drive id before DB create:

```ts
const [driveFolderId] = await this.storageService.generateDriveIds(1);
```

Create DB row with:

```ts
storageProvider: StorageProvider.GOOGLE_DRIVE,
driveFolderId,
```

Then create the Drive folder with the reserved id:

```ts
try {
  await this.storageService.createDriveFolder({
    name: sanitizedName,
    parentStorageFolderId: parentFolder?.driveFolderId ?? null,
    storageFolderId: driveFolderId,
  });
} catch (error) {
  await this.storageRepairService.recordDriveDbMismatch({
    operation: 'folder_provision',
    storageProvider: 'google_drive',
    driveFolderId,
    webhardFolderId: created.id,
    expectedDbState: { parentId: created.parentId, driveFolderId },
    actualDriveState: { createFailed: true },
  });
  throw error;
}
```

- [ ] **Step 3: Rename Drive folder and DB path transaction**

Before the DB path update:

```ts
if (folder.storageProvider === StorageProvider.GOOGLE_DRIVE && folder.driveFolderId) {
  await this.storageService.renameDriveFolder({
    storageFolderId: folder.driveFolderId,
    name: sanitizedName,
  });
}
```

Then keep existing materialized path update and slash-boundary descendant update. If Drive rename succeeds and DB path update fails, record a storage repair event with `operation: 'folder_rename'`.

- [ ] **Step 4: Move Drive folder and DB path transaction**

Load target parent `driveFolderId`, call `moveDriveFolder`, then keep existing DB `parentId` and descendant path update. If Drive move succeeds and DB update fails, record a storage repair event with `operation: 'folder_move'`.

- [ ] **Step 5: Delete Drive folders**

Keep current recursive soft delete semantics and call Drive trash for each folder with a `driveFolderId`, bounded concurrency `3`.

- [ ] **Step 6: Tests**

Add cases:

```ts
it('createFolder creates Drive folder under parent driveFolderId', async () => {
  prisma.webhardFolder.findUnique.mockResolvedValue({
    id: 'parent-folder',
    companyId: 4,
    path: '/ACME Box',
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-parent',
    deletedAt: null,
  });
  storageService.generateDriveIds.mockResolvedValue(['drive-child']);
  storageService.createDriveFolder.mockResolvedValue({ storageFolderId: 'drive-child' });
  prisma.webhardFolder.create.mockResolvedValue({
    id: 'child-folder',
    name: '새폴더',
    parentId: 'parent-folder',
    companyId: 4,
    path: '/ACME Box/새폴더',
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-child',
  });

  const result = await service.createFolder(
    { name: '새폴더', parentId: 'parent-folder' },
    adminUser
  );

  expect(storageService.createDriveFolder).toHaveBeenCalledWith({
    name: '새폴더',
    parentStorageFolderId: 'drive-parent',
    storageFolderId: 'drive-child',
  });
  expect(result.id).toBe('child-folder');
});

it('renameFolder updates Drive name and slash-boundary descendant paths', async () => {
  prisma.webhardFolder.findUnique.mockResolvedValue({
    id: 'folder-1',
    name: 'old',
    parentId: 'root',
    path: '/ACME Box/old',
    storageProvider: StorageProvider.GOOGLE_DRIVE,
    driveFolderId: 'drive-folder-1',
    deletedAt: null,
  });

  await service.renameFolder('folder-1', { name: 'new' }, adminUser);

  expect(storageService.renameDriveFolder).toHaveBeenCalledWith({
    storageFolderId: 'drive-folder-1',
    name: 'new',
  });
  expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('regexp_replace'),
    expect.anything(),
    expect.anything()
  );
});

it('moveFolder updates Drive parent and emits existing realtime/cache behavior', async () => {
  prisma.webhardFolder.findUnique
    .mockResolvedValueOnce({
      id: 'folder-1',
      parentId: 'old-parent',
      path: '/ACME Box/old-parent/folder',
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFolderId: 'drive-folder-1',
      deletedAt: null,
    })
    .mockResolvedValueOnce({
      id: 'new-parent',
      path: '/ACME Box/new-parent',
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFolderId: 'drive-new-parent',
      deletedAt: null,
    });

  await service.moveFolder('folder-1', { parentId: 'new-parent' }, adminUser);

  expect(storageService.moveDriveFolder).toHaveBeenCalledWith({
    storageFolderId: 'drive-folder-1',
    parentStorageFolderId: 'drive-new-parent',
  });
  expect(prisma.webhardFolder.update).toHaveBeenCalledWith({
    where: { id: 'folder-1' },
    data: expect.objectContaining({ parentId: 'new-parent' }),
  });
});

it('initializeCompanyFolders delegates to DriveProvisioningService', async () => {
  driveProvisioningService.ensureCompanyDriveRoot.mockResolvedValue({
    company_id: 4,
    status: 'ready',
    drive_root_folder_id: 'drive-root',
    error: null,
  });

  await expect(service.initializeCompanyFolders(4, 'ACME Box')).resolves.toEqual({ success: true });
  expect(driveProvisioningService.ensureCompanyDriveRoot).toHaveBeenCalledWith(4);
});
```

- [ ] **Step 7: Run folders tests**

Run:

```bash
cd webhard-api
pnpm test -- folders.service.spec.ts folder-path.service.spec.ts --runInBand
```

Expected: selected tests pass.

---

## Phase 7 - Cross-System Producers

### Task 7.1: Contact form and public upload storage references

**Files:**

- Modify: `src/app/actions/contacts.ts`
- Modify: `webhard-api/src/storage/storage.controller.ts`
- Modify: `webhard-api/src/contacts/contacts.service.ts`
- Modify: `webhard-api/src/contacts/contacts.controller.ts`
- Test: `webhard-api/src/storage/__tests__/storage.controller.spec.ts`
- Test: `webhard-api/src/contacts/contacts.service.spec.ts`

- [ ] **Step 1: Replace R2 upload helper for contact files**

In `src/app/actions/contacts.ts`, replace `uploadFileToR2(file, folder)` calls with a server-to-NestJS upload action:

```ts
async function uploadContactFileToStorage(
  file: File,
  purpose: 'attachments' | 'drawings' | 'reference-photos' | 'delivery-proofs'
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', purpose);
  const response = await fetch(`${process.env.NESTJS_API_URL}/api/v1/storage/contact-upload`, {
    method: 'POST',
    headers: { 'X-API-Key': process.env.NESTJS_API_KEY ?? '' },
    body: formData,
  });
  if (!response.ok) throw new Error(`contact file upload failed: ${response.status}`);
  return (await response.json()) as {
    provider: 'google_drive';
    driveFileId: string;
    fileName: string;
    mimeType: string;
    size: number;
    storageReference: string;
  };
}
```

Store `storageReference` in existing contact URL fields.

- [ ] **Step 2: Add NestJS upload endpoint**

Add `POST /storage/contact-upload` in `webhard-api/src/storage/storage.controller.ts`. Because `StorageController` is guarded by company access in the existing project, the method must explicitly allow integration principal access:

```ts
@Post('contact-upload')
@AllowIntegrationPrincipal()
@UseInterceptors(FileInterceptor('file'))
async uploadContactFile(
  @UploadedFile() file: Express.Multer.File,
  @Body('purpose') purpose: ContactUploadPurpose
) {
  // validate purpose, extension, MIME, size, and filename before upload
}
```

Keep API-key authentication, upload into a Drive staging folder from `GOOGLE_DRIVE_INTAKE_FOLDER_ID`, and return `toDriveReference(uploaded.storageFileId)`. If the project chooses a separate public upload controller instead, do not put it behind `CompanyAccessGuard`.

- [ ] **Step 3: Register contact files as Drive-backed WebhardFile rows**

In `ContactsService.ensureWebsiteContactWebhardFile`, parse `file.url`:

```ts
const reference = parseStorageReference(params.file.url);
if (reference.provider === StorageProvider.GOOGLE_DRIVE) {
  const metadata = await this.storageService.confirmDriveUploadedFile({
    storageFileId: reference.idOrKey,
    expectedParentStorageFolderId: intakeDriveFolderId,
  });
  await this.storageService.moveDriveFile({
    storageFileId: metadata.storageFileId,
    fromParentStorageFolderId: intakeDriveFolderId,
    toParentStorageFolderId: params.inquiryFolder.driveFolderId as string,
  });
  return this.prisma.webhardFile.create({
    data: {
      name: params.file.name,
      originalName: params.file.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
      path: `${params.inquiryFolder.path}/${params.file.name}`,
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFileId: metadata.storageFileId,
      driveMimeType: metadata.mimeType,
      folderId: params.inquiryFolder.id,
      companyId: params.inquiryFolder.companyId,
      uploadedBy: 'website',
      inquiryNumber: params.contact.inquiryNumber ?? params.contact.workNumber ?? null,
    },
  });
}
```

Keep legacy R2 parsing only for reset-before-implementation compatibility.

If the Drive move into the inquiry folder succeeds but `webhardFile.create` fails, record `operation: 'file_create'` through `StorageRepairService` with contact id, inquiry folder id, company id, and `driveFileId`.

- [ ] **Step 4: Tests**

Add:

```ts
it('registers website contact upload as Drive-backed WebhardFile', async () => {
  storageService.confirmDriveUploadedFile.mockResolvedValue({
    provider: StorageProvider.GOOGLE_DRIVE,
    storageFileId: 'drive-file-1',
    name: 'drawing.dxf',
    mimeType: 'application/dxf',
    size: 100,
    parentStorageFolderIds: ['drive-intake'],
  });
  storageService.moveDriveFile.mockResolvedValue(undefined);
  prisma.webhardFile.create.mockResolvedValue({ id: 'file-1', driveFileId: 'drive-file-1' });

  const result = await service.ensureWebsiteContactWebhardFile({
    contact: { id: CONTACT_ID, inquiryNumber: 'O-001', workNumber: null },
    file: { url: 'storage://google_drive/drive-file-1', name: 'drawing.dxf' },
    inquiryFolder: {
      id: 'folder-1',
      path: '/ACME Box/문의/O-001',
      companyId: 4,
      driveFolderId: 'drive-inquiry',
    },
  });

  expect(result).toBe('file-1');
  expect(prisma.webhardFile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFileId: 'drive-file-1',
      folderId: 'folder-1',
      companyId: 4,
    }),
  });
});

it('moves staged Drive upload into the inquiry folder', async () => {
  await service.ensureWebsiteContactWebhardFile(makeDriveWebsiteUploadInput());

  expect(storageService.moveDriveFile).toHaveBeenCalledWith({
    storageFileId: 'drive-file-1',
    fromParentStorageFolderId: 'drive-intake',
    toParentStorageFolderId: 'drive-inquiry',
  });
});

it('does not expose Drive upload session URLs in contact fields', async () => {
  const input = makeDriveWebsiteUploadInput();
  input.file.url = 'storage://google_drive/drive-file-1';

  await service.ensureWebsiteContactWebhardFile(input);

  const createData = prisma.webhardFile.create.mock.calls[0][0].data;
  expect(createData.path).not.toContain('https://');
  expect(input.file.url).toBe('storage://google_drive/drive-file-1');
});

it('allows API-key contact upload without company user context', async () => {
  await request(app.getHttpServer())
    .post('/storage/contact-upload')
    .set('X-API-Key', TEST_API_KEY)
    .field('purpose', 'drawings')
    .attach('file', Buffer.from('dxf'), 'drawing.dxf')
    .expect(201);

  expect(storageService.uploadDriveBuffer).toHaveBeenCalledWith(
    expect.objectContaining({
      parentStorageFolderId: 'drive-intake',
      fileName: 'drawing.dxf',
    })
  );
});
```

### Task 7.2: DrawingRevision, worker upload, delivery proof, external sync

**Files:**

- Modify: `webhard-api/src/contacts/drawing-revision.service.ts`
- Modify: `webhard-api/src/integration/drawing-revisions/drawing-revisions.controller.ts`
- Modify: `webhard-api/src/integration/delivery/delivery.service.ts`
- Modify: `webhard-api/src/integration/orders/auto-contact.service.ts`
- Test: `webhard-api/src/contacts/drawing-revision.service.spec.ts`
- Test: `webhard-api/src/integration/orders/auto-contact.service.spec.ts`

- [ ] **Step 1: DrawingRevision creates Drive-backed WebhardFile rows**

In `DrawingRevisionService.registerFilesToWebhard`, replace `extractR2Key(url)` with `parseStorageReference(url)`. For Drive references, set `storageProvider`, `driveFileId`, `driveMimeType`, and logical `path`.

- [ ] **Step 2: Worker upload uses same Drive upload-session route**

Keep existing worker proxy paths:

```text
src/app/api/worker/drawing-revisions/upload-urls/route.ts
src/app/api/worker/drawing-revisions/route.ts
```

Forward to NestJS Drive-backed upload session and confirm routes. Preserve worker session forwarding and CSRF rules from `docs/specs/features/webhard-system.md`.

- [ ] **Step 3: Delivery proof upload creates Drive-backed file**

In delivery completion flow, store `deliveryProofImage` as `toDriveReference(driveFileId)` and create `WebhardFile` with:

```ts
name: `납품완료_${timestamp}.${extension}`,
storageProvider: StorageProvider.GOOGLE_DRIVE,
driveFileId,
driveMimeType: mimeType,
folderId: inquiryFolder.id,
companyId: inquiryFolder.companyId,
uploadedBy: 'worker',
```

- [ ] **Step 4: AutoContact keeps DB-owned routing**

In `AutoContactService`, keep folder/company matching unchanged. Only replace R2 URL/key handling with storage references for `drawingFileUrl` and `WebhardFile.path`.

- [ ] **Step 5: Tests**

Add:

```ts
it('worker revision upload stores driveFileId in DrawingRevision.webhardFileIds linked WebhardFile', async () => {
  storageService.confirmDriveUploadedFile.mockResolvedValue({
    provider: StorageProvider.GOOGLE_DRIVE,
    storageFileId: 'drive-worker-file',
    name: 'revision.dxf',
    mimeType: 'application/dxf',
    size: 100,
    parentStorageFolderIds: ['drive-inquiry'],
  });
  prisma.webhardFile.create.mockResolvedValue({
    id: 'webhard-file-1',
    driveFileId: 'drive-worker-file',
  });

  const result = await service.createRevision(CONTACT_ID, {
    files: [{ url: 'storage://google_drive/drive-worker-file', name: 'revision.dxf' }],
    actorType: 'worker',
    reason: 'worker_upload',
  });

  expect(result.revision.webhardFileIds).toEqual(['webhard-file-1']);
  expect(prisma.webhardFile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFileId: 'drive-worker-file',
    }),
  });
});

it('delivery proof creates Drive-backed WebhardFile and emits file:created', async () => {
  await deliveryService.completeDelivery({
    contactId: CONTACT_ID,
    deliveryProofImage: 'storage://google_drive/drive-proof',
    deliveryProofFile: { name: 'proof.jpg', type: 'image/jpeg', size: 100 },
  });

  expect(prisma.webhardFile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      name: expect.stringMatching(/^납품완료_/),
      storageProvider: StorageProvider.GOOGLE_DRIVE,
      driveFileId: 'drive-proof',
    }),
  });
  expect(eventsGateway.emitToFolder).toHaveBeenCalledWith(
    'folder-1',
    expect.objectContaining({ type: 'file:created' })
  );
});

it('external sync confirm routes to company Drive folder and triggers AutoContact', async () => {
  await filesService.batchConfirmUpload(
    {
      files: [
        {
          key: '',
          storageProvider: 'google_drive',
          driveFileId: 'drive-sync-file',
          name: 'sync.dxf',
          originalName: 'sync.dxf',
          size: 100,
          mimeType: 'application/dxf',
          folderId: 'external-folder',
        },
      ],
    },
    integrationUser
  );

  expect(prisma.webhardFile.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ driveFileId: 'drive-sync-file', folderId: 'company-folder' })],
  });
  expect(autoContactService.detectAndCreate).toHaveBeenCalled();
});
```

- [ ] **Step 6: Run cross-system tests**

Run:

```bash
cd webhard-api
pnpm test -- drawing-revision.service.spec.ts contacts.service.spec.ts auto-contact.service.spec.ts --runInBand
```

Expected: selected tests pass.

---

## Phase 8 - Frontend Upload, Admin UI, Share Links

### Task 8.1: Update browser upload queue for Drive sessions

**Files:**

- Modify: `src/lib/utils/uploadQueue.ts`
- Modify: `src/app/webhard/hooks/useFileUpload.ts`
- Modify: `src/app/api/webhard/upload/batch/route.ts`
- Modify: `src/app/api/webhard/upload/batch-complete/route.ts`
- Test: `src/app/webhard/__tests__/audit14-webhard-main-contracts.test.ts`

- [ ] **Step 1: Return Drive upload session from batch route**

Modify `src/app/api/webhard/upload/batch/route.ts` to return:

```ts
{
  fileName,
  provider: 'google_drive',
  uploadUrl: urlData.uploadUrl ?? urlData.url,
  uploadHeaders: urlData.uploadHeaders ?? {},
  driveFileId: urlData.driveFileId,
  folderId: urlData.folderId ?? folderId,
  skipped: false
}
```

Remove `R2_PUBLIC_BASE_URL` usage from this route.

- [ ] **Step 2: Confirm with Drive file id**

When `uploadToStorageSession` returns `{ driveFileId }`, send batch-complete item:

```ts
{
  key: item.objectKey ?? '',
  driveFileId,
  storageProvider: item.provider,
  name: file.name,
  originalName: file.name,
  size: file.size,
  mimeType: file.type || 'application/octet-stream',
  folderId: item.folderId,
}
```

If `item.driveFileId` exists, require the uploaded Drive response id to equal it before calling batch-complete. A mismatch means the browser uploaded into a different Drive file than the DB session reserved and must fail before confirmation.

- [ ] **Step 3: Keep UX unchanged**

Do not change visible upload copy except error text for Drive provisioning not ready:

```text
업체 Google Drive 폴더 준비가 완료되지 않았습니다. 관리자에게 문의해주세요.
```

- [ ] **Step 4: Run frontend upload tests**

Run:

```bash
pnpm test -- --runTestsByPath src/app/webhard/__tests__/audit14-webhard-main-contracts.test.ts --runInBand
```

Expected: selected tests pass.

### Task 8.2: Show Drive provisioning state in admin company detail

**Files:**

- Modify: `src/lib/api/nestjs/companies.client.ts`
- Modify: `src/app/(admin)/admin/companies/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/companies/[id]/approve-button.tsx`
- Create: `src/app/(admin)/admin/companies/[id]/drive-provisioning-actions.tsx`

- [ ] **Step 1: Extend frontend company type**

Add to `CompanyData` and local `Company` interface:

```ts
drive_root_folder_id: string | null;
drive_provisioning_status: 'pending' | 'ready' | 'failed';
drive_provisioning_error: string | null;
drive_provisioning_last_attempt_at: string | null;
drive_provisioned_at: string | null;
```

Add `serverRetryDriveProvisioning(id: number)`:

```ts
export async function serverRetryDriveProvisioning(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch(`/companies/${id}/drive-provisioning/retry`, {
    method: 'POST',
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}
```

- [ ] **Step 2: Add server action wrapper**

In `src/app/actions/companies.ts`, add:

```ts
import { serverRetryDriveProvisioning } from '@/lib/api/nestjs-server-client';

export async function retryCompanyDriveProvisioning(companyId: number): Promise<VoidActionResult> {
  try {
    const isAuthenticated = await verifySession();
    const user = await getSessionUser();

    if (!isAuthenticated || user?.userType !== 'admin') {
      companiesLogger.warn('Unauthorized attempt to retry Drive provisioning', { companyId });
      return { success: false, error: '관리자 권한이 필요합니다.' };
    }

    const result = await serverRetryDriveProvisioning(companyId);
    if (!result.success) {
      return { success: false, error: result.error ?? 'Google Drive 폴더 재시도에 실패했습니다.' };
    }

    revalidatePath('/admin/companies');
    revalidatePath(`/admin/companies/${companyId}`);
    return { success: true };
  } catch (error) {
    companiesLogger.error('Retry Drive provisioning error:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
```

- [ ] **Step 3: Add retry action component**

Create `src/app/(admin)/admin/companies/[id]/drive-provisioning-actions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { retryCompanyDriveProvisioning } from '@/app/actions/companies';
import { Button } from '@/components/ui/button';

export function DriveProvisioningRetryButton({ companyId }: { companyId: number }) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);

  async function retry() {
    setIsRetrying(true);
    try {
      const result = await retryCompanyDriveProvisioning(companyId);
      if (!result.success) alert(result.error ?? 'Google Drive 폴더 재생성에 실패했습니다.');
      router.refresh();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <Button type="button" size="sm" onClick={retry} disabled={isRetrying}>
      {isRetrying ? '재시도 중...' : 'Google Drive 재시도'}
    </Button>
  );
}
```

- [ ] **Step 4: Render status**

In company detail page, render:

```tsx
{
  company.drive_provisioning_status === 'ready' && (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.login}`}
    >
      Google Drive 준비 완료
    </span>
  );
}
{
  company.drive_provisioning_status === 'failed' && (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${ACTIVITY_LOG_BADGE.delete}`}
      >
        Google Drive 실패
      </span>
      <span className="text-sm text-red-600">
        {company.drive_provisioning_error ?? '원인을 확인할 수 없습니다.'}
      </span>
      <DriveProvisioningRetryButton companyId={company.id} />
    </div>
  );
}
```

- [ ] **Step 5: Verify type check**

Run:

```bash
npx tsc --noEmit
```

Expected: `0` TypeScript errors.

### Task 8.3: Share links download through YJ route

**Files:**

- Modify: `webhard-api/prisma/schema.prisma`
- Modify: `webhard-api/src/share-links/dto/create-share-link.dto.ts`
- Modify: `webhard-api/src/share-links/share-links.service.ts`
- Test: `webhard-api/src/share-links/__tests__/share-links.service.spec.ts`
- Modify: `src/app/api/webhard/share/route.ts`
- Modify: `src/app/api/webhard/share/[token]/route.ts`
- Modify: `src/lib/api/nestjs/operations.client.ts`

- [ ] **Step 1: Add `webhardFileId` to share links**

Add to `model ShareLink`:

```prisma
  webhardFileId String? @map("webhard_file_id")
```

Add migration SQL:

```sql
ALTER TABLE "share_links" ADD COLUMN "webhard_file_id" TEXT;
CREATE INDEX "share_links_webhard_file_id_idx" ON "share_links"("webhard_file_id");
```

- [ ] **Step 2: Store file id when creating share link**

Update `CreateShareLinkDto`, `ShareLinksService.create`, and creation call sites to pass `webhardFileId`. Keep `filePath` for legacy rows.

In `src/app/api/webhard/share/route.ts`, resolve the selected file from the existing search/access check and pass its DB id:

```ts
const matchedFile = searchResponse.ok
  ? searchResponse.data.files?.find((file) => file.path === file_path)
  : null;

if (!matchedFile?.id) {
  return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
}

const response = await nestjsFetch<ShareLinkDTO>('/share-links', {
  method: 'POST',
  body: {
    filePath: file_path,
    fileName: file_name,
    webhardFileId: matchedFile.id,
    companyId: company_id,
    expiresInHours: expires_in_hours,
    maxDownloads: max_downloads,
  },
});
```

`ShareLinksService.validateAndIncrement` must return both fields:

```ts
return {
  is_valid: true,
  file_path: link.filePath,
  webhard_file_id: link.webhardFileId,
  file_name: link.fileName,
  error_message: null,
};
```

Update `src/lib/api/nestjs/operations.client.ts` so `serverValidateShareLink` includes `webhard_file_id?: string`.

- [ ] **Step 3: Download via NestJS stream route**

In `src/app/api/webhard/share/[token]/route.ts`, remove `getR2SignedUrl`. If `result.webhard_file_id` exists, redirect to:

```ts
return NextResponse.redirect(
  new URL(`/api/webhard/files/${result.webhard_file_id}/download`, request.url)
);
```

Legacy `file_path` can still use `getR2SignedUrl` until reset removes old rows, but new rows after reset must have `webhard_file_id`.

---

## Phase 9 - Development Reset

### Task 9.1: Add dry-run reset script with production block

**Files:**

- Create: `webhard-api/scripts/reset-webhard-for-google-drive.ts`
- Modify: `webhard-api/package.json`

- [ ] **Step 1: Create reset script**

Create `webhard-api/scripts/reset-webhard-for-google-drive.ts`:

```ts
import { DriveProvisioningStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const dryRun = !apply;

async function countRows() {
  const [
    webhardFiles,
    webhardFolders,
    contacts,
    drawingRevisions,
    contactStatusHistories,
    workerNotes,
    tasks,
    orders,
    orderEvents,
    deliveries,
    visitBookings,
    nestingTasks,
    shareLinks,
    webhardLogs,
    backupLogs,
  ] = await Promise.all([
    prisma.webhardFile.count(),
    prisma.webhardFolder.count(),
    prisma.contact.count(),
    prisma.drawingRevision.count(),
    prisma.contactStatusHistory.count(),
    prisma.workerNote.count(),
    prisma.task.count(),
    prisma.order.count(),
    prisma.orderEvent.count(),
    prisma.delivery.count(),
    prisma.visitBooking.count(),
    prisma.nestingTask.count(),
    prisma.shareLink.count(),
    prisma.webhardLog.count(),
    prisma.backupLog.count(),
  ]);
  return {
    webhardFiles,
    webhardFolders,
    contacts,
    drawingRevisions,
    contactStatusHistories,
    workerNotes,
    tasks,
    orders,
    orderEvents,
    deliveries,
    visitBookings,
    nestingTasks,
    shareLinks,
    webhardLogs,
    backupLogs,
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset webhard data in production');
  }

  const before = await countRows();
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', before }, null, 2));

  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    await tx.backupLog.deleteMany({});
    await tx.shareLink.deleteMany({});
    await tx.webhardLog.deleteMany({});
    await tx.drawingRevision.deleteMany({});
    await tx.workerNote.deleteMany({});
    await tx.contactStatusHistory.deleteMany({});
    await tx.task.deleteMany({});
    await tx.nestingTask.deleteMany({});
    await tx.visitBooking.deleteMany({});
    await tx.delivery.deleteMany({});
    await tx.orderEvent.deleteMany({});
    await tx.order.deleteMany({});
    await tx.contact.deleteMany({});
    await tx.webhardFile.deleteMany({});
    await tx.webhardFolder.deleteMany({});
    await tx.companyStorage.deleteMany({});
    await tx.company.updateMany({
      data: {
        driveRootFolderId: null,
        driveProvisioningStatus: DriveProvisioningStatus.PENDING,
        driveProvisioningError: null,
        driveProvisioningLastAttemptAt: null,
        driveProvisionedAt: null,
      },
    });
  });

  const after = await countRows();
  console.log(JSON.stringify({ mode: 'apply', after }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Add package script**

In `webhard-api/package.json`:

```json
"reset:webhard:drive": "npx tsx scripts/reset-webhard-for-google-drive.ts"
```

- [ ] **Step 3: Dry run**

Run:

```bash
cd webhard-api
pnpm reset:webhard:drive
```

Expected: JSON output with `"mode": "dry-run"` and row counts.

- [ ] **Step 4: Apply reset after code is committed and pushed**

Run only after the user confirms the reset:

```bash
cd webhard-api
pnpm reset:webhard:drive -- --apply
```

Expected: JSON output with `"mode": "apply"` and reset-owned counters equal to `0`.

---

## Phase 10 - Verification Matrix

### Task 10.1: Backend verification

Run:

```bash
cd webhard-api
pnpm test -- storage-reference.util.spec.ts google-drive-storage.provider.spec.ts storage.service.spec.ts storage-repair.service.spec.ts sync-log.service.spec.ts --runInBand
pnpm test -- drive-provisioning.service.spec.ts folders.service.spec.ts --runInBand
pnpm test -- files.service.spec.ts files.worker-access.spec.ts trash.service.spec.ts --runInBand
pnpm test -- storage.controller.spec.ts contacts.service.spec.ts drawing-revision.service.spec.ts auto-contact.service.spec.ts --runInBand
pnpm test -- share-links.service.spec.ts --runInBand
npx tsc --noEmit
```

Expected:

```text
all selected Jest tests pass
0 TypeScript errors
```

### Task 10.2: Frontend verification

Run:

```bash
pnpm test -- --runTestsByPath src/app/webhard/__tests__/audit14-webhard-main-contracts.test.ts --runInBand
pnpm test -- --runTestsByPath src/__tests__/lib/api/nestjs-domain-clients.test.ts --runInBand
pnpm test -- --runTestsByPath src/__tests__/lib/api/nestjs-operations-client.test.ts --runInBand
npx tsc --noEmit
```

Expected:

```text
all selected Jest tests pass
0 TypeScript errors
```

### Task 10.3: Browser and E2E verification

Run a local frontend and backend, then verify:

```bash
pnpm exec playwright test e2e/webhard.spec.ts --project=chromium --reporter=line
pnpm exec playwright test e2e/worker.spec.ts --project=chromium --reporter=line
pnpm exec playwright test e2e/contact.spec.ts --project=chromium --reporter=line
```

Required manual checks:

- Admin approves a pending company.
- Admin sees Google Drive status `ready`.
- Company webhard opens only after `driveProvisioningStatus=ready`.
- Company cannot see another company folder.
- Company cannot delete folders.
- Admin uploads a file to a company folder.
- Company downloads the file through YJ route, not Drive share link.
- Worker downloads a visible drawing.
- Worker uploads an additional drawing revision.
- Delivery proof creates a `납품완료_YYYYMMDD_HHmmss.ext` file in the inquiry folder.
- External sync upload routes to the matched company folder and triggers AutoContact.
- `/webhard?folderId={webhardFolderId}&fileId={webhardFileId}` highlights the DB file id.

### Task 10.4: Documentation update

Update:

```text
docs/features-list.md
docs/progress.txt
docs/changelog/CHANGELOG.md
docs/specs/features/webhard-system.md
docs/specs/api/nestjs-endpoints.md
docs/superpowers/specs/2026-05-29-google-drive-webhard-storage-design.md
docs/superpowers/specs/2026-05-29-google-drive-webhard-storage-design.ko.md
```

Required documentation points:

- Google Drive is server-side storage only.
- Company users receive no Drive permissions.
- Webhard access remains `companyId` and worker ACL based.
- `driveProvisioningStatus=ready` is required before company webhard access.
- Reset script is development-only and dry-run by default.
- R2 migration is excluded.

### Task 10.5: Final commit sequence

After all verification passes:

```bash
git add webhard-api src docs
git commit -m "feat: 웹하드 저장소를 구글드라이브로 전환"
git push origin codex/google-drive-webhard-spec
```

---

## Review Checklist

- `webhard_files.path` is not used as a Drive id.
- All Drive storage operations use `storageProvider + driveFileId` or `driveFolderId`.
- Google Drive API imports exist only in `webhard-api/src/storage/google-drive-storage.provider.ts`.
- Upload session URLs are not logged, stored, or shown in admin UI.
- Drive upload-confirm DB failures create `storage_repair` events before rethrowing.
- Company users never receive Drive share links.
- `companyId` access checks remain in Files, Folders, Contacts, Worker, and Next proxies.
- Worker routes continue to forward verified worker session cookies, not generic API key access.
- Public contact uploads become Drive-backed before `WebhardFile` registration.
- Delivery proof and DrawingRevision files create Drive-backed `WebhardFile` rows.
- Share links redirect through YJ routes.
- Development reset is dry-run by default and blocked in production.
- Backend and frontend type checks pass.
- Browser validation confirms upload, download, worker, delivery proof, and external sync flows.
