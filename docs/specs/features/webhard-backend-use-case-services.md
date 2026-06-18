# Webhard Backend Use-Case Services

Status: implemented (2026-05-10)

## Scope

This document covers AUDIT-16 backend service split boundaries for the webhard module.

## Service Boundaries

- `FoldersService` remains the controller-facing folder orchestration service.
- `FolderPathService` owns folder materialized path computation and descendant path prefix replacement.
- `FilesService` remains the controller-facing file orchestration service.
- `BadgeCountsService` owns undownloaded total count, folder direct count grouping, parent propagation, and effective company scope filtering.

## Contracts

- Existing public methods stay available:
  - `FoldersService.computeFolderPath`
  - `FoldersService.updateDescendantPaths`
  - `FilesService.getBadgeCounts`
- Folder descendant path updates must use slash-boundary prefix replacement so sibling branches with a shared string prefix are not changed.
- Badge folder propagation must use the same effective `companyId` as file counting. Company users cannot widen this scope through query parameters.
- Controller/API response shapes do not change in this split.

## Verification

- `webhard-api/src/folders/folder-path.service.spec.ts`
- `webhard-api/src/files/badge-counts.service.spec.ts`
- `webhard-api/src/folders/folders.service.spec.ts`
- `webhard-api/src/files/files.service.spec.ts`
- `cd webhard-api && npx tsc --noEmit`
