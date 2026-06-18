# Google Drive Webhard Storage Design

## Status

Draft approved through brainstorming and engineering review on 2026-05-29.

First implementation pass completed on 2026-05-29 in `codex/google-drive-webhard-implementation`: schema/migration, Drive storage provider, company provisioning/retry, upload/download/ZIP/share/trash/backup branching, key contact/drawing/delivery webhard producers, Next.js proxies, and development reset script are implemented. Before deploy, run migration/reset/provisioning/upload/download E2E against a real Shared Drive service account.

## Goal

Replace the current self-hosted webhard storage backend with Google Drive for all new webhard files while preserving the YJ Laser webhard product behavior.

This is not a Google Drive sharing feature. Companies continue to use the YJ webhard UI. The YJ application remains the access-control boundary through `companyId`, worker access checks, and admin guards. Google Drive is the server-side storage provider.

## Decisions

- Use Google Shared Drive as the storage location.
- Use a service account added as a Shared Drive member for server API access.
- Store the service account JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Store the Shared Drive id in `GOOGLE_DRIVE_SHARED_DRIVE_ID`.
- Do not grant company users direct Google Drive permissions.
- Do not expose Google Drive links to company users.
- Store all new webhard files in Google Drive.
- Preserve current folder structure rules, folder kinds, company roots, inquiry folders, completion folders, and alias rules.
- Development reset is allowed because the project is not yet operating in production.
- Existing R2 files are not migrated to Drive.
- Existing development webhard files, folders, contact/work/drawing/delivery proof data are reset.
- Company accounts and company records are preserved.
- Implementation uses a storage adapter architecture.
- Internal names should become Drive-oriented where Drive is now the concrete default. Existing R2/presigned/key terms may remain only in temporary compatibility layers and must be removed in the final cleanup phase.

## Not In Scope

- Migrating existing R2 files to Google Drive.
- Giving companies direct access to Google Drive folders.
- Supporting company uploads directly through the Google Drive UI.
- Treating Google Drive as the product UI.
- Detecting arbitrary external Drive UI edits in phase 1.
- Exposing Drive share links to customers.
- Running destructive reset scripts in production.
- Preserving old development inquiry/work/drawing/delivery proof test data.

## Existing System Responsibilities

The current webhard is more than object storage:

- Company-scoped file and folder access through `companyId`.
- Admin all-company access.
- Worker-scoped file access through contact visibility.
- Folder tree, breadcrumbs, folder kind, and materialized path.
- Company root and default template folder creation.
- Inquiry folder creation and file relocation.
- Completion folder movement under `{company}/문의/완료/`.
- Upload confirmation and `WebhardFile` metadata creation.
- Download authorization and downloaded-state tracking.
- Undownloaded badges and propagated folder counts.
- Storage usage display.
- File/folder rename, move, soft delete, restore, permanent delete.
- Search.
- Activity logs.
- Share links.
- Preview routes.
- AutoContact.
- External webhard sync routing and company alias mapping.
- Public contact form attachment registration.
- DrawingRevision `webhardFileIds`.
- Worker drawing upload/download.
- Delivery proof file registration.
- Dashboard "웹하드" links and `/webhard?folderId=&fileId=` highlighting.

All of these behaviors must continue to work after the storage provider changes.

## Architecture

Browser requests continue to flow through Next.js and NestJS.

```text
Browser
  -> Next.js /api/webhard/*
  -> NestJS /api/v1/files | folders | storage | contacts
  -> Storage provider boundary
     -> GoogleDriveStorageProvider
     -> R2StorageProvider only for temporary compatibility if needed
  -> Google Shared Drive
```

Only storage-provider implementations may import the Google Drive API client. Application services such as `FilesService`, `FoldersService`, `ContactsService`, Worker services, and Delivery services must depend on storage interfaces or orchestration services, not on raw Drive clients.

## Data Model

Keep `webhard_files` and `webhard_folders` as the application source of truth. Add Drive identifiers instead of overloading `path`.

### `webhard_files`

Add:

- `storageProvider`: `google_drive` | `r2`
- `driveFileId`: nullable string
- `driveMimeType`: nullable string

Keep:

- `id`
- `name`
- `originalName`
- `size`
- `mimeType`
- `folderId`
- `companyId`
- `uploadedBy`
- `inquiryNumber`
- `isDownloaded`
- `deletedAt`

`path` must not become a Drive id. It may remain only as a logical/display path or compatibility field. Storage operations must use `storageProvider + driveFileId` for Drive-backed files.

### `webhard_folders`

Add:

- `storageProvider`: `google_drive` | `r2`
- `driveFolderId`: nullable string

Keep:

- `id`
- `name`
- `parentId`
- `companyId`
- `path`
- `folderKind`
- `contactId`
- `deletedAt`

`path` remains the YJ logical materialized path for breadcrumbs, search, and display. Drive folder operations use `driveFolderId`.

### Company Drive Provisioning

Add either fields on `companies` or a separate `company_drive_folders` table:

- `companyId`
- `driveRootFolderId`
- `driveProvisioningStatus`: `pending` | `ready` | `failed`
- `driveProvisioningError`
- `driveProvisioningLastAttemptAt`
- `driveProvisionedAt`

Companies can be approved independently of Drive provisioning. Webhard access is fail-closed until provisioning is `ready`.

## Google Drive API Requirements

- Enable Google Drive API in the Google Cloud project.
- Create a service account.
- Add the service account as a member of the target Shared Drive.
- Server auth reads `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Shared Drive calls include `supportsAllDrives=true`.
- Drive-scoped list/search calls use `driveId` and `corpora=drive` where applicable.
- Folder creation uses MIME type `application/vnd.google-apps.folder`.
- Files and folders are placed with `parents: [driveFolderId]`.
- Uploads use Drive resumable upload sessions.
- Blob downloads use Drive file download through the server.
- 403/429 responses use exponential backoff.

Reference docs:

- https://developers.google.com/workspace/guides/create-credentials
- https://developers.google.com/workspace/drive/api/guides/about-shareddrives
- https://developers.google.com/workspace/drive/api/guides/enable-shareddrives
- https://developers.google.com/workspace/drive/api/guides/folder
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/guides/manage-sharing
- https://developers.google.com/workspace/drive/api/guides/limits

## Storage Interfaces

Define storage-neutral contracts before changing feature services.

Core operations:

- `createFolder`
- `renameFolder`
- `moveFolder`
- `deleteFolder`
- `createUploadSession`
- `confirmUploadedFile`
- `downloadFile`
- `getFileMetadata`
- `renameFile`
- `moveFile`
- `trashFile`
- `restoreFile`
- `deleteFile`

Google Drive is the default implementation for new files and folders.

R2-specific concepts such as `presignedUrl`, `objectKey`, `multipart`, and `path-as-key` must not leak into new Drive code except through temporary compatibility adapters during migration.

## Provisioning Flow

Provisioning runs when an admin approves a company.

```text
Admin approves company
  -> update company approval state
  -> DriveProvisioningService.ensureCompanyDriveRoot(companyId)
  -> create or reuse company root folder in Shared Drive
  -> create default template folders
  -> create matching webhard_folders rows
  -> set driveProvisioningStatus=ready
```

Default folders follow the existing webhard template and folder rules:

```text
{company}/
  문의/
    완료/
  칼선의뢰/
  목형의뢰/
  ...
```

Provisioning is idempotent:

- Reuse existing `driveRootFolderId` when present.
- Reuse existing `webhard_folders` rows for the same logical path.
- Reuse existing `driveFolderId` rows instead of searching Drive by name on every call.
- Record sanitized failure details.

Failure behavior:

- Company approval remains valid.
- `driveProvisioningStatus=failed`.
- `driveProvisioningError` stores a safe summary.
- Admin UI shows the failure reason and a retry action.
- Company webhard access remains fail-closed until `ready`.
- Secrets, service account JSON, tokens, and upload session URLs must never appear in logs or UI.

## Upload Flow

All new files that are registered as `WebhardFile` use Google Drive.

```text
POST /files/upload-session or updated existing upload route
  -> validate actor and target folder access
  -> resolve webhard_folder.driveFolderId
  -> create Drive resumable upload session
  -> browser uploads file to session URL
  -> POST confirm endpoint
  -> verify Drive file metadata
  -> create drive-backed WebhardFile row
  -> run existing side effects
```

Side effects that must remain:

- AutoContact trigger.
- Realtime `file:created` events.
- Badge invalidation.
- Storage usage invalidation.
- Folder updated timestamp propagation.
- Upload notifications.
- Activity log entries.

Batch upload follows the same rules with bounded concurrency.

## Download And Preview Flow

Downloads remain authorized by YJ application checks.

```text
GET /files/:id/download
  -> load WebhardFile
  -> verify admin/company/worker access
  -> stream or proxy Drive file from driveFileId
  -> client downloads with existing display filename rules
```

Company users must not receive durable Drive share links. Preview routes read Drive files server-side and return the preview response through YJ routes.

Downloaded state remains DB-owned through `isDownloaded` and `markDownloaded`.

## File And Folder Operations

### File Operations

- Rename: Drive file rename plus DB name update.
- Move: Drive parent change plus DB `folderId/companyId` update.
- Batch move: bounded Drive operations plus DB update and realtime events for source and target folders.
- Soft delete: DB `deletedAt` remains primary. Drive trash can be used if it does not break restore.
- Restore: restore DB row and validate Drive file location.
- Permanent delete: delete Drive file and hard delete DB row.

### Folder Operations

- Create: Drive folder create plus `webhard_folders` row.
- Rename: Drive folder rename plus DB materialized path update.
- Move: Drive parent change plus DB materialized path update.
- Delete: existing recursive soft delete semantics retained, with Drive trash/delete policy applied consistently.

Folder rename and move must preserve the existing slash-boundary descendant path update rule.

## Cross-System Requirements

Every `WebhardFile` or `WebhardFolder` producer must become Drive-backed:

- `/webhard` upload.
- Folder upload.
- Public contact form attachments.
- Contact creation.
- Inquiry type classification and file relocation.
- DrawingRevision upload.
- Worker drawing upload.
- Worker file download.
- Delivery proof upload.
- Company dashboard webhard button.
- Admin and Worker "웹하드에서 열기".
- AutoContact.
- External webhard sync routing.
- Folder alias mapping.
- Search.
- Undownloaded badges.
- Storage usage.
- Activity logs.
- Preview.
- Share links.
- Backup policy.

URL behavior remains:

```text
/webhard?folderId={webhardFolderId}&fileId={webhardFileId}
```

The IDs in this URL remain YJ database IDs, not Google Drive IDs.

## External Webhard Sync

The external sync program must route uploads to Drive-backed target folders.

Requirements:

- Presign/upload-session routes return Drive upload session data and target `folderId`.
- Confirm routes independently verify and apply the same routing result.
- Company alias matching remains DB-owned through `CompanyFolderAlias`.
- Existing external husk cleanup rules are reviewed. Drive-backed implementation may not need the same husk behavior, but the visibility and routing guarantees must be preserved.
- AutoContact receives routed folder metadata after Drive-backed batch confirm.

## Development Reset

Because the project is not in production, development data may be reset.

Reset keeps:

- Company accounts.
- Company records.
- Admin/worker accounts unless explicitly scoped otherwise.

Reset removes:

- Existing `webhard_files`.
- Existing `webhard_folders`.
- Existing inquiry/work/drawing/delivery proof development data that depends on old webhard files and folders.
- Related test-only webhard logs/sync state when needed.

Reset does not migrate R2 files to Google Drive.

Safety requirements:

- Code-level production execution block.
- Dry-run mode by default.
- Explicit `--apply` for destructive execution.
- Print deletion counts before apply.
- Never print secrets.
- Optionally clean existing YJ test folders in the target Shared Drive only after explicit confirmation.

## Consistency And Repair

Drive API calls and DB transactions are not atomic together. The plan must include repairable consistency handling.

Add a storage repair/outbox mechanism, either as a new `storage_sync_jobs` table or through existing `sync_logs` if it can represent the required states clearly.

Record at least:

- Operation type.
- Entity type.
- Webhard file/folder id when available.
- Drive file/folder id when available.
- Target folder id.
- Status.
- Retry count.
- Sanitized error.
- Next retry time.

Use this for:

- Drive file created but DB insert failed.
- DB row created but Drive metadata verification failed.
- Drive move/delete/rename failed after DB intent.
- Provisioning partial failure.

## Error Handling

- Google 403/429: exponential backoff and retry.
- Google auth failure: fail closed and surface sanitized admin error.
- Missing `driveFolderId`: treat as provisioning/config error, not empty folder fallback.
- Missing `driveFileId`: fail closed for Drive-backed file.
- Upload confirm without Drive metadata: fail and log repair job.
- Download failure: return controlled API error, do not expose Drive internals.
- Worker/company auth failure: preserve current 401/403 behavior.

## Security

- Never log `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Never log access tokens.
- Never log Drive upload session URLs.
- Never return Drive permanent links to company users.
- Keep company access scoped by YJ `companyId`.
- Keep admin/company/worker/API-key auth paths separate.
- Keep API-key integration endpoints explicit, not generic list access.
- Keep reset script production-blocked.
- Sanitize all admin-facing provisioning errors.

## Testing Plan

### Backend Unit And Contract Tests

Drive provider:

- service account JSON parsing.
- Shared Drive id usage.
- `supportsAllDrives=true` usage.
- folder create/reuse.
- upload session creation.
- metadata fetch after upload.
- download stream.
- rename/move/delete.
- 403/429 retry/backoff.

Files/Folders services:

- Drive-backed `WebhardFile` creation.
- Drive-backed `WebhardFolder` creation.
- upload confirm side effects.
- batch upload/confirm.
- download by `driveFileId`.
- rename/move/delete updates Drive and DB.
- company user cannot access another company file.
- folder path updates preserve slash-boundary rules.
- badge and storage usage behavior remains DB-owned.

Provisioning/reset:

- company approval starts provisioning.
- provisioning failure records status/error.
- retry transitions failed to ready.
- company webhard access is fail-closed until ready.
- reset blocks production.
- reset dry-run reports counts.
- reset apply preserves companies and removes scoped development data.

Cross-system regressions:

- public contact form attachment creates Drive-backed `WebhardFile`.
- Contact creation creates inquiry folder.
- inquiry classification relocates files.
- DrawingRevision saves `webhardFileIds`.
- Worker upload/download respects worker access.
- Delivery proof creates a Drive-backed file in inquiry folder.
- AutoContact still fires after confirm.
- external sync routing uses Drive target folders.

### Frontend And E2E

- Admin approval leads to Drive provisioning ready.
- Company login shows only its folder tree.
- Company cannot see another company files/folders.
- Upload/download/rename/move/delete still works.
- Folder upload works.
- Undownloaded badge appears and clears after download.
- Search finds Drive-backed DB files.
- `/webhard?folderId=&fileId=` highlights the target file.
- Public contact form submission links files to webhard.
- Worker additional drawing appears in timeline and webhard.
- Delivery proof appears in dashboards and webhard.
- Admin sees provisioning failure reason and retry action.

## Performance And Operations

- Do not use Drive list/search as the live webhard listing source.
- Use the YJ DB for lists, search, badge counts, storage usage, and folder trees.
- Limit provisioning and batch Drive operations with bounded concurrency.
- Reuse stored `driveFolderId`; avoid repeated Drive name lookups.
- Use backoff for Drive quota errors.
- Stream downloads where possible.
- Watch server bandwidth if Drive downloads are proxied.
- Defer full Drive external-change ingestion to a later phase unless operational needs change.

## Implementation Phases

### Phase 0: Google And Environment Setup

- Create/verify Google Cloud project.
- Enable Google Drive API.
- Create service account.
- Add service account to Shared Drive.
- Add `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Add `GOOGLE_DRIVE_SHARED_DRIVE_ID`.
- Add local env validation with secret-safe errors.

### Phase 1: Schema And Interfaces

- Add Drive fields to `webhard_files`, `webhard_folders`, and company provisioning state.
- Define storage provider interfaces.
- Add Google Drive provider.
- Add tests for provider behavior with mocks.

### Phase 2: Development Reset And Provisioning

- Add reset script with production block and dry-run.
- Reset development webhard/contact/work/drawing/delivery proof data.
- Add Drive provisioning service.
- Create company root and template folders.
- Add admin retry/status surfaces.

### Phase 3: Files/Folders Core

- Convert upload session, confirm, download, rename, move, delete, restore.
- Convert folder create, rename, move, delete.
- Preserve query, search, badge, storage usage behavior through DB.
- Add repair/outbox logging.

### Phase 4: Cross-System Integration

- Public contact form.
- Contact folder sync.
- Drawing revisions.
- Worker upload/download.
- Delivery proof.
- Company dashboard links.
- Admin/Worker open-in-webhard.
- AutoContact.
- External sync routing and alias flows.

### Phase 5: UI And E2E Hardening

- Update `/webhard` upload/download UX for Drive sessions.
- Update admin provisioning status and retry UI.
- Run targeted unit tests, backend typecheck, frontend typecheck.
- Run E2E smoke for webhard, contact form, worker, delivery proof.
- Remove temporary R2 naming compatibility where no longer needed.

## Open Risks

- Drive upload sessions differ from R2 presigned PUT behavior and may require frontend upload helper changes.
- Drive API quota can slow bulk provisioning and batch upload.
- Server-proxied downloads can increase backend bandwidth.
- Reset scope touches many tables and must be reviewed before apply.
- Existing code may use `path` as R2 key in hidden places; these must be found and converted.

## Review Findings Applied

- Use provider-aware storage references instead of overloading `path`.
- Add repair/outbox logging for Drive/DB split-brain cases.
- Keep reset execution possible for development, but code-block production execution.
- Separate company approval from Drive provisioning; show sanitized failure reason and retry to admins.
- Keep Drive API calls isolated in provider/provisioning services.
- Use Drive-oriented internal naming, with temporary compatibility only where necessary.
- Define storage interfaces before modifying feature services.
- Include full regression test coverage across webhard, contacts, worker, delivery, external sync, and reset.
