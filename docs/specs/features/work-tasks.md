# Feature: Work Tasks (작업 탭 재설계)

**Status:** DONE
**Priority:** 1
**Related PRD:** ADM-005

## Goal

Redesign the admin "작업" tab (`/admin/work-management/board`) from a kanban board view to a **task list view** with two work category sub-tabs: Office Work (사무실 작업) and Field Work (현장 작업).

## Work Category Definitions

### Office Work (사무실 작업)

Contacts in early-stage processing that office workers handle:

- `process_stage = null` — 공정 시작 전 (inquiry received, not yet started)
- `process_stage = 'drawing'` — 도면작업
- `process_stage = 'sample'` — 샘플제작 및 확인

### Field Work (현장 작업)

Contacts in later-stage processing that field workers handle:

- `process_stage = 'drawing_confirmed'` — 도면 확정 및 목형의뢰
- `process_stage = 'laser'` — 레이저 가공
- `process_stage = 'cutting'` — 칼 / 오시 작업
- `process_stage = 'inspection'` — 검수
- `process_stage = 'delivery'` — 납품

## UI Design

### Navigation Structure

```
작업관리
  ├── 문의 (existing ContactsList)
  └── 작업 (NEW: task list view)
        ├── [사무실 작업] sub-tab (default)
        └── [현장 작업] sub-tab
```

### Task List Features

- Sub-tabs for office/field with count badges
- Status filter pills within each category (only relevant stages)
- Search (company name, inquiry number, inquiry title)
- Date filter (all, today, this week, this month)
- Card-based list (reuse existing ContactCard pattern)
- Real-time updates via Socket.IO

## Future Plans (NOT implemented now, design for)

1. **Office Worker Page** — `/worker/office` page where office workers receive status update requests
2. **Field Worker Page** — `/worker/tasks` already exists; extend for field work status updates
3. **Auto Contact Pipeline** — External webhard file detection → auto-create contacts
   - Office: files in 올리기전용 → create contact with drawing status
   - Field: files in specific folder → create contact with drawing_confirmed status

## API Endpoints (for external program integration)

### GET /api/admin/contacts (existing, add workCategory param)

- `workCategory=office` → filter by process_stage in [null, drawing, sample]
- `workCategory=field` → filter by process_stage in [drawing_confirmed, laser, cutting, inspection, delivery]

### PATCH /api/contacts/[id]/process-stage (existing via server action, expose as API)

- Body: `{ process_stage: ProcessStage }`
- Used by worker pages and external programs

## Completion Criteria

- [ ] "작업" tab shows task list (not kanban) with office/field sub-tabs
- [ ] Each sub-tab filters contacts by correct process_stage groups
- [ ] Count badges show number of contacts in each category
- [ ] Search, date filter, status filter work within each category
- [ ] Real-time updates work
- [ ] API spec document updated for external program integration
